const fs = require('fs');

const MAX_META_BYTES = 1 << 20;
const MAX_SIDE = 100000;

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, buf, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return got === len ? buf : buf.subarray(0, got);
}

function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function gifSize(b) {
  if (b.length < 10 || b.toString('latin1', 0, 4) !== 'GIF8') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

function bmpSize(b) {
  if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
  if (b.readUInt32LE(14) === 12) return { w: b.readUInt16LE(18), h: b.readUInt16LE(20) };
  return { w: Math.abs(b.readInt32LE(18)), h: Math.abs(b.readInt32LE(22)) };
}

function webpSize(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  switch (b.toString('latin1', 12, 16)) {
    case 'VP8 ':
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    case 'VP8L': {
      if (b[20] !== 0x2f) return null;
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X':
      return {
        w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      };
    default:
      return null;
  }
}

function jpegSize(fd, head) {
  if (head.length < 2 || head[0] !== 0xff || head[1] !== 0xd8) return null;
  let pos = 2;
  for (let n = 0; n < 1024; n++) {
    const seg = readAt(fd, pos, 9);
    if (seg.length < 4 || seg[0] !== 0xff) return null;
    const marker = seg[1];
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      pos += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = seg.readUInt16BE(2);
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (seg.length < 9) return null;
      return { w: seg.readUInt16BE(7), h: seg.readUInt16BE(5) };
    }
    pos += 2 + len;
  }
  return null;
}

function childBoxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    let headLen = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = Number(buf.readBigUInt64BE(p + 8));
      headLen = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < headLen) break;
    out.push({ type: buf.toString('latin1', p + 4, p + 8), s: p + headLen, e: Math.min(p + size, end) });
    p += size;
  }
  return out;
}

function avifSize(fd, head) {
  if (head.length < 12 || head.toString('latin1', 4, 8) !== 'ftyp') return null;
  const total = fs.fstatSync(fd).size;
  let pos = 0;
  for (let n = 0; n < 64 && pos + 8 <= total; n++) {
    const hdr = readAt(fd, pos, 16);
    if (hdr.length < 8) return null;
    let size = hdr.readUInt32BE(0);
    let headLen = 8;
    if (size === 1) {
      if (hdr.length < 16) return null;
      size = Number(hdr.readBigUInt64BE(8));
      headLen = 16;
    } else if (size === 0) {
      size = total - pos;
    }
    if (size < headLen) return null;
    if (hdr.toString('latin1', 4, 8) === 'meta') {
      const body = readAt(fd, pos + headLen, Math.min(size, MAX_META_BYTES) - headLen);
      const find = (box, type) => childBoxes(body, box.s, box.e).find((c) => c.type === type);
      const iprp = find({ s: 4, e: body.length }, 'iprp');
      const ipco = iprp && find(iprp, 'ipco');
      const ispe = ipco && find(ipco, 'ispe');
      if (!ispe || ispe.e - ispe.s < 12) return null;
      return { w: body.readUInt32BE(ispe.s + 4), h: body.readUInt32BE(ispe.s + 8) };
    }
    pos += size;
  }
  return null;
}

function readImageSize(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const head = readAt(fd, 0, 32);
    const size =
      pngSize(head) || gifSize(head) || bmpSize(head) || webpSize(head) || jpegSize(fd, head) || avifSize(fd, head);
    return size && size.w > 0 && size.h > 0 && size.w <= MAX_SIDE && size.h <= MAX_SIDE ? size : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { readImageSize };
