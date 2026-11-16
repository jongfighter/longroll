(() => {
  'use strict';

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 8;
  const WHEEL_SENSITIVITY = 0.0015;
  const KEY_ZOOM_STEP = 1.25;
  const LINE_STEP = 80;
  const PAGE_RATIO = 0.9;
  const SIDE_NAV_DEBOUNCE_MS = 120;
  const SMOOTH_OMEGA = 25;
  const SMOOTH_SETTLE_PX = 0.5;
  const SMOOTH_SETTLE_SPEED = 20;
  const SMOOTH_EXTERNAL_PX = 1;
  const TOAST_MS = 2200;
  const TOP_EPSILON = 2;
  const DEFAULT_LETTERBOX = 1.1;
  const BAR_PAD = 2;
  const MIN_THUMB = 40;
  const BAR_ACTIVE_MS = 700;
  const OVERFLOW_EPSILON = 1;

  const api = window.longroll;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const scroller = $('scroller');
  const strip = $('strip');
  const comicEl = $('comic');
  const nameEl = $('name');
  const indexEl = $('index');
  const pageEl = $('page');
  const dimsEl = $('dims');
  const zoomEl = $('zoom');
  const messageEl = $('message');
  const toastEl = $('toast');
  const dropMask = $('dropmask');

  let comic = null;
  let episodes = [];
  let episode = -1;
  let epPending = 0;
  let epToken = 0;
  let files = [];
  let pages = [];
  let index = -1;
  let pinned = null;
  let loaded = false;
  let scale = 1;
  let fitMode = true;
  let refWidth = 0;
  let letterbox = DEFAULT_LETTERBOX;
  let buildToken = 0;
  let tops = [];
  let topsDirty = true;
  let toastTimer = null;
  let lastSideNav = 0;
  let pan = null;
  let dragDepth = 0;
  let prevStripW = 0;
  let smooth = null;
  let dialogBusy = false;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function setBodyState(state) {
    document.body.dataset.state = state;
  }

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.hidden = false;
  }

  function hideMessage() {
    messageEl.hidden = true;
  }

  function flash(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, TOAST_MS);
  }

  function updateMeta() {
    const file = files[index];
    const page = pages[index];
    const ep = episodes[episode];
    comicEl.textContent = ep && comic ? comic.name : '';
    comicEl.title = ep && comic ? comic.dir : '';
    nameEl.textContent = ep ? ep.name : '';
    nameEl.title = ep ? ep.path : '';
    indexEl.textContent = ep ? `(${episode + 1}/${episodes.length})` : '';
    pageEl.textContent = file ? `${index + 1}/${files.length}장` : '';
    dimsEl.textContent = page && page.w > 0 ? `${page.w}×${page.h}` : '';
    const zoomShown = loaded && refWidth > 0;
    zoomEl.textContent = zoomShown ? `${Math.round(scale * 100)}%${fitMode ? ' 맞춤' : ''}` : '';
    document.title = ep
      ? `${ep.name} (${episode + 1}/${episodes.length}) - ${comic ? comic.name : ''} - Longroll`
      : 'Longroll';

    const d = document.body.dataset;
    d.episode = String(episode);
    d.episodes = String(episodes.length);
    d.index = String(index);
    d.count = String(files.length);
    d.scale = zoomShown ? scale.toFixed(4) : '';
    d.fit = zoomShown ? String(fitMode) : '';
  }

  const maxScrollTop = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);

  function cancelSmooth() {
    if (!smooth) return;
    cancelAnimationFrame(smooth.raf);
    smooth = null;
  }

  function finishSmooth() {
    if (!smooth) return;
    const target = smooth.target;
    cancelSmooth();
    scroller.scrollTop = target;
  }

  function shiftSmooth(d, oldBottom) {
    if (!smooth) return;
    smooth.x += d;
    if (smooth.target >= oldBottom) smooth.target += d;
    smooth.last = scroller.scrollTop;
  }

  function stepSmooth(ts) {
    const a = smooth;
    if (!a) return;
    if (Math.abs(scroller.scrollTop - a.last) > SMOOTH_EXTERNAL_PX) {
      smooth = null;
      return;
    }
    const max = maxScrollTop();
    a.target = clamp(a.target, 0, max);
    const dt = Math.max(0, ts - a.t) / 1000;
    a.t = Math.max(a.t, ts);
    const e0 = a.x - a.target;
    const c = a.v + SMOOTH_OMEGA * e0;
    const k = Math.exp(-SMOOTH_OMEGA * dt);
    const e = (e0 + c * dt) * k;
    a.v = (a.v - SMOOTH_OMEGA * c * dt) * k;
    a.x = a.target + e;
    if (Math.abs(e) < SMOOTH_SETTLE_PX && Math.abs(a.v) < SMOOTH_SETTLE_SPEED) {
      smooth = null;
      scroller.scrollTop = a.target;
      return;
    }
    if (a.x < 0 || a.x > max) {
      a.x = clamp(a.x, 0, max);
      a.v = 0;
    }
    scroller.scrollTop = a.x;
    a.last = scroller.scrollTop;
    a.raf = requestAnimationFrame(stepSmooth);
  }

  function setStripWidth(fit, px) {
    strip.style.width = fit ? `calc(100% / ${letterbox})` : `${px}px`;
    topsDirty = true;
  }

  function syncFit() {
    const w = strip.getBoundingClientRect().width;
    prevStripW = w;
    scale = refWidth > 0 ? w / refWidth : 1;
  }

  function pageTops() {
    if (topsDirty) {
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
      tops = pages.map((p) => p.el.getBoundingClientRect().top - base);
      topsDirty = false;
    }
    return tops;
  }

  function indexAtTop() {
    const t = pageTops();
    if (t.length === 0) return -1;
    const y = scroller.scrollTop + TOP_EPSILON;
    let lo = 0;
    let hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function prefetchAround(i) {
    for (let k = i - 1; k <= i + 2; k++) {
      const p = pages[k];
      if (p && p.img.loading !== 'eager') p.img.loading = 'eager';
    }
  }

  function syncIndex() {
    if (!loaded) return;
    let i;
    if (pinned && Math.abs(scroller.scrollTop - pinned.top) < 1) i = pinned.i;
    else {
      pinned = null;
      i = indexAtTop();
    }
    if (i === index || i < 0) return;
    index = i;
    prefetchAround(i);
    updateMeta();
  }

  function jumpTo(i) {
    cancelSmooth();
    scroller.scrollTop = pageTops()[i];
    pinned = { i, top: scroller.scrollTop };
    index = i;
    prefetchAround(i);
    updateMeta();
  }

  function setScale(next, clientX, clientY, fit = false) {
    if (!loaded || !(refWidth > 0)) return;
    cancelSmooth();
    if (!fit) next = clamp(next, Math.min(MIN_SCALE, scale), Math.max(MAX_SCALE, scale));

    const sr = scroller.getBoundingClientRect();
    const ax = clientX ?? sr.left + scroller.clientWidth / 2;
    const ay = clientY ?? sr.top + scroller.clientHeight / 2;
    const r = strip.getBoundingClientRect();
    const px = r.width > 0 ? clamp((ax - r.left) / r.width, 0, 1) : 0;
    const py = r.height > 0 ? clamp((ay - r.top) / r.height, 0, 1) : 0;

    fitMode = fit;
    setStripWidth(fit, refWidth * next);

    const nr = strip.getBoundingClientRect();
    scale = fit ? nr.width / refWidth : next;
    prevStripW = nr.width;
    scroller.scrollLeft += nr.left + px * nr.width - ax;
    scroller.scrollTop += nr.top + py * nr.height - ay;
    layoutBars();
    syncIndex();
    updateMeta();
  }

  function applyFit(clientX, clientY) {
    setScale(0, clientX, clientY, true);
  }

  function applyPageSize(page, nw, nh) {
    const sr = scroller.getBoundingClientRect();
    const r = page.el.getBoundingClientRect();
    const before =
      page.w > 0 ? (r.width * page.h) / page.w : parseFloat(getComputedStyle(page.el).minHeight) || 0;
    const above = r.top + before <= sr.top + TOP_EPSILON;
    const oldBottom = r.top - sr.top + scroller.scrollTop + before;
    page.w = nw;
    page.h = nh;
    page.img.setAttribute('width', String(nw));
    page.img.setAttribute('height', String(nh));
    page.el.classList.remove('unsized');
    topsDirty = true;
    if (above) {
      const d = page.el.getBoundingClientRect().height - before;
      scroller.scrollTop += d;
      shiftSmooth(d, oldBottom);
    }
    layoutBars();
  }

  function onPageLoad(page) {
    if (pages[page.i] !== page) return;
    const nw = page.img.naturalWidth;
    const nh = page.img.naturalHeight;
    if (nw > 0 && nh > 0 && (nw !== page.w || nh !== page.h)) applyPageSize(page, nw, nh);
    if (!(refWidth > 0) && nw > 0) {
      refWidth = nw;
      if (fitMode) syncFit();
    }
    if (page.i === index) updateMeta();
  }

  function onPageError(page) {
    if (pages[page.i] !== page) return;
    page.el.classList.add('broken');
    page.el.dataset.label = `이미지를 불러올 수 없습니다\n${files[page.i].name}`;
    topsDirty = true;
    layoutBars();
  }

  function createPage(file, i) {
    const el = document.createElement('div');
    el.className = 'page';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.loading = 'lazy';
    const page = { i, el, img, w: file.w > 0 ? file.w : 0, h: file.h > 0 ? file.h : 0 };
    if (page.w > 0 && page.h > 0) {
      img.setAttribute('width', String(page.w));
      img.setAttribute('height', String(page.h));
    } else {
      el.classList.add('unsized');
    }
    img.addEventListener('load', () => onPageLoad(page));
    img.addEventListener('error', () => onPageError(page));
    img.src = file.url;
    el.append(img);
    return page;
  }

  async function buildStrip(state, keepZoom = false) {
    const token = ++buildToken;
    epToken++;
    epPending = 0;
    const keptScale = scale;
    const keptLeft = scroller.scrollLeft;
    const wasManual = keepZoom && loaded && !fitMode;
    comic = state.comic || null;
    episodes = state.episodes || [];
    episode = clamp(state.episode ?? 0, 0, Math.max(0, episodes.length - 1));
    files = state.files;
    refWidth = state.refWidth > 0 ? state.refWidth : 0;
    letterbox = state.letterbox > 0 ? state.letterbox : DEFAULT_LETTERBOX;
    index = clamp(state.index, 0, files.length - 1);
    pinned = null;
    const keepManual = wasManual && refWidth > 0;
    fitMode = !keepManual;
    cancelSmooth();
    hideMessage();
    setBodyState('loading');

    pages = files.map(createPage);
    const frag = document.createDocumentFragment();
    for (const p of pages) frag.append(p.el);
    strip.textContent = '';
    strip.append(frag);
    if (keepManual) {
      setStripWidth(false, refWidth * keptScale);
      scale = keptScale;
      prevStripW = refWidth * keptScale;
      scroller.scrollLeft = keptLeft;
    } else {
      setStripWidth(true);
      scroller.scrollLeft = 0;
      syncFit();
    }
    loaded = true;
    jumpTo(index);
    layoutBars();
    updateMeta();

    const target = pages[index];
    try {
      await target.img.decode();
    } catch {
      /* 오류는 error 이벤트가 자리표시자로 표시한다 */
    }
    if (token !== buildToken) return;
    setBodyState('ready');
    updateMeta();
  }

  function errorText(state) {
    switch (state.error) {
      case 'empty':
        return `이 폴더에 이미지가 없습니다\n${state.path}`;
      case 'unsupported':
        return `지원하지 않는 형식입니다 (jpg, png, webp, gif, bmp, avif)\n${state.path}`;
      case 'unreadable':
        return `폴더를 읽을 수 없습니다\n${state.path}`;
      default:
        return `파일을 찾을 수 없습니다\n${state.path}`;
    }
  }

  function applyState(state) {
    if (!state) return;
    if (state.error) {
      if (files.length > 0) {
        flash(errorText(state).split('\n')[0]);
        return;
      }
      buildToken++;
      loaded = false;
      setBodyState('empty');
      updateMeta();
      showMessage(errorText(state));
      return;
    }
    buildStrip(state);
  }

  function showEmpty() {
    setBodyState('empty');
    showMessage('만화 폴더(또는 이미지)를 이 창에 드래그하거나\nCtrl+O(파일) / Ctrl+Shift+O(폴더)로 여세요');
  }

  async function openPath(target) {
    applyState(await api.openPath(target));
  }

  async function openDialog(directory) {
    if (dialogBusy) return;
    dialogBusy = true;
    try {
      applyState(await api.openDialog({ directory }));
    } finally {
      dialogBusy = false;
    }
  }

  function applyEpisodeResult(res) {
    if (!res) return;
    if (res.edge) {
      comic = res.comic || comic;
      episodes = res.episodes || episodes;
      episode = clamp(res.episode ?? episode, 0, Math.max(0, episodes.length - 1));
      updateMeta();
      flash(res.edge === 'first' ? '첫 번째 회차입니다' : '마지막 회차입니다');
      return;
    }
    if (res.error) {
      flash(res.error === 'empty' ? '이 회차에 이미지가 없습니다' : '회차를 불러올 수 없습니다');
      return;
    }
    buildStrip(res, true);
  }

  function navigate(delta) {
    if (!loaded || episodes.length === 0) return;
    const token = ++epToken;
    const build = buildToken;
    epPending += delta;
    if (epPending === 0) return;
    api.goEpisode(episodes[episode].path, epPending).then(
      (res) => {
        if (token !== epToken || build !== buildToken) return;
        epPending = 0;
        applyEpisodeResult(res);
      },
      () => {
        if (token !== epToken || build !== buildToken) return;
        epPending = 0;
        flash('회차를 불러올 수 없습니다');
      },
    );
  }

  function sideNav(delta) {
    const now = performance.now();
    if (now - lastSideNav < SIDE_NAV_DEBOUNCE_MS) return;
    lastSideNav = now;
    navigate(delta);
  }

  function scrollByY(dy, animate) {
    if (smooth) {
      smooth.target = clamp(smooth.target + dy, 0, maxScrollTop());
      return;
    }
    if (!animate) {
      scroller.scrollBy({ top: dy, behavior: 'auto' });
      return;
    }
    const x = scroller.scrollTop;
    const target = clamp(x + dy, 0, maxScrollTop());
    if (Math.abs(target - x) < SMOOTH_SETTLE_PX) return;
    smooth = { x, v: 0, target, t: performance.now(), last: x, raf: 0 };
    smooth.raf = requestAnimationFrame(stepSmooth);
  }

  function onKeyDown(e) {
    if (e.altKey) return;

    if (e.ctrlKey || e.metaKey) {
      switch (e.code) {
        case 'Digit0':
        case 'Numpad0':
          e.preventDefault();
          applyFit();
          break;
        case 'Digit1':
        case 'Numpad1':
          e.preventDefault();
          setScale(1);
          break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          setScale(scale * KEY_ZOOM_STEP);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          setScale(scale / KEY_ZOOM_STEP);
          break;
        case 'KeyO':
          e.preventDefault();
          if (!e.repeat) openDialog(e.shiftKey);
          break;
        default:
          break;
      }
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      scrollByY((e.shiftKey ? -1 : 1) * scroller.clientHeight * PAGE_RATIO, true);
      return;
    }
    if (e.shiftKey) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (!e.repeat) navigate(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (!e.repeat) navigate(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        scrollByY(-LINE_STEP, false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        scrollByY(LINE_STEP, false);
        break;
      case 'PageUp':
        e.preventDefault();
        scrollByY(-scroller.clientHeight * PAGE_RATIO, true);
        break;
      case 'PageDown':
        e.preventDefault();
        scrollByY(scroller.clientHeight * PAGE_RATIO, true);
        break;
      case 'Home':
        e.preventDefault();
        cancelSmooth();
        scroller.scrollTo({ top: 0, behavior: 'auto' });
        break;
      case 'End':
        e.preventDefault();
        cancelSmooth();
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
        break;
      case 'F11':
        e.preventDefault();
        api.toggleFullscreen();
        break;
      case 'Escape':
        api.exitFullscreen();
        break;
      default:
        break;
    }
  }

  function onWheel(e) {
    if (!e.ctrlKey) {
      cancelSmooth();
      return;
    }
    e.preventDefault();
    if (!loaded) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= 400;
    setScale(scale * Math.exp(-dy * WHEEL_SENSITIVITY), e.clientX, e.clientY);
  }

  function endPan() {
    if (!pan) return;
    pan = null;
    scroller.classList.remove('panning');
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    cancelSmooth();
    pan = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    scroller.classList.add('panning');
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!pan) return;
    if (!(e.buttons & 1)) {
      endPan();
      return;
    }
    scroller.scrollLeft = pan.left - (e.clientX - pan.x);
    scroller.scrollTop = pan.top - (e.clientY - pan.y);
  }

  function onMouseUp(e) {
    if (e.button === 0) endPan();
    else if (e.button === 3) {
      e.preventDefault();
      sideNav(-1);
    } else if (e.button === 4) {
      e.preventDefault();
      sideNav(1);
    }
  }

  function onDoubleClick(e) {
    if (!loaded) return;
    if (fitMode) setScale(1, e.clientX, e.clientY);
    else applyFit(e.clientX, e.clientY);
  }

  function hasFiles(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }

  function onDragEnter(e) {
    e.preventDefault();
    if (!hasFiles(e)) return;
    dragDepth++;
    dropMask.hidden = false;
  }

  function onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'none';
  }

  function onDragLeave(e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropMask.hidden = true;
  }

  function onDrop(e) {
    e.preventDefault();
    dragDepth = 0;
    dropMask.hidden = true;
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (!file) return;
    openPath(api.pathForFile(file));
  }

  function onResize() {
    layoutBars();
    if (!loaded || !fitMode) return;
    const w = strip.getBoundingClientRect().width;
    if (!(w > 0)) return;
    if (prevStripW > 0 && w !== prevStripW) scroller.scrollTop *= w / prevStripW;
    scroller.scrollLeft = 0;
    scale = refWidth > 0 ? w / refWidth : 1;
    prevStripW = w;
    topsDirty = true;
    cancelSmooth();
    syncIndex();
    updateMeta();
  }

  function createBar(el, vertical) {
    const thumb = el.firstElementChild;
    const bar = { el, thumb, vertical, len: 0, travel: 0, drag: null };
    const client = () => (vertical ? scroller.clientHeight : scroller.clientWidth);
    const total = () => (vertical ? scroller.scrollHeight : scroller.scrollWidth);
    const offset = () => (vertical ? scroller.scrollTop : scroller.scrollLeft);
    const coord = (e) => (vertical ? e.clientY : e.clientX);
    const setOffset = (v) => {
      if (vertical) scroller.scrollTop = v;
      else scroller.scrollLeft = v;
    };

    bar.overflow = () => total() - client();

    bar.measure = () => {
      const track = Math.max(0, (vertical ? el.clientHeight : el.clientWidth) - BAR_PAD * 2);
      const len = clamp(Math.round((track * client()) / total()), Math.min(MIN_THUMB, track), track);
      const travel = track - len;
      if (len !== bar.len) {
        bar.len = len;
        el.style.setProperty('--len', `${len}px`);
      }
      if (travel !== bar.travel) {
        bar.travel = travel;
        el.style.setProperty('--travel', `${travel}px`);
      }
      if (!scrollTimelineOk) bar.sync();
    };

    bar.sync = () => {
      const max = bar.overflow();
      const p = max > 0 ? clamp(offset() / max, 0, 1) * bar.travel : 0;
      thumb.style.transform = vertical ? `translate3d(0, ${p}px, 0)` : `translate3d(${p}px, 0, 0)`;
    };

    bar.end = (e) => {
      if (!bar.drag || (e && e.pointerId !== bar.drag.id)) return;
      bar.drag = null;
      el.classList.remove('dragging');
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !(bar.travel > 0)) return;
      e.preventDefault();
      cancelSmooth();
      const max = bar.overflow();
      let thumbPos = max > 0 ? clamp(offset() / max, 0, 1) * bar.travel : 0;
      if (e.target !== thumb) {
        const r = el.getBoundingClientRect();
        thumbPos = clamp(coord(e) - (vertical ? r.top : r.left) - BAR_PAD - bar.len / 2, 0, bar.travel);
        setOffset((thumbPos / bar.travel) * max);
      }
      bar.drag = { id: e.pointerId, from: coord(e), thumbPos };
      el.classList.add('dragging');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 합성 이벤트 등 포인터 ID가 없으면 캡처 없이 진행 */
      }
    });

    el.addEventListener('pointermove', (e) => {
      const d = bar.drag;
      if (!d || e.pointerId !== d.id || !(bar.travel > 0)) return;
      const ratio = clamp((d.thumbPos + coord(e) - d.from) / bar.travel, 0, 1);
      setOffset(ratio * bar.overflow());
    });

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, bar.end);

    el.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) return;
        const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        scroller.scrollBy({ left: e.deltaX * k, top: e.deltaY * k, behavior: 'auto' });
      },
      { passive: true },
    );

    return bar;
  }

  const scrollTimelineOk = typeof CSS !== 'undefined' && CSS.supports('animation-timeline', '--x');
  if (!scrollTimelineOk) view.classList.add('js-sync');
  const vbar = createBar($('vbar'), true);
  const hbar = createBar($('hbar'), false);
  let barActiveTimer = null;

  function layoutBars() {
    const showY = vbar.overflow() > OVERFLOW_EPSILON;
    const showX = hbar.overflow() > OVERFLOW_EPSILON;
    vbar.el.hidden = !showY;
    hbar.el.hidden = !showX;
    vbar.el.classList.toggle('corner', showX);
    hbar.el.classList.toggle('corner', showY);
    if (showY) vbar.measure();
    else vbar.end();
    if (showX) hbar.measure();
    else hbar.end();
  }

  function markBarsActive() {
    vbar.el.classList.add('active');
    hbar.el.classList.add('active');
    clearTimeout(barActiveTimer);
    barActiveTimer = setTimeout(() => {
      vbar.el.classList.remove('active');
      hbar.el.classList.remove('active');
    }, BAR_ACTIVE_MS);
  }

  function onScrollBars() {
    if (!scrollTimelineOk) {
      vbar.sync();
      hbar.sync();
    }
    markBarsActive();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('wheel', onWheel, { passive: false });
  scroller.addEventListener('mousedown', onMouseDown);
  scroller.addEventListener('scroll', syncIndex, { passive: true });
  scroller.addEventListener('scroll', onScrollBars, { passive: true });
  // rAF 로 매 프레임 scrollTop 을 쓰므로 scrollend 가 매 프레임 발생한다. scrollend 에 로직을 두지 말 것.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishSmooth();
  });
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', endPan);
  window.addEventListener('blur', () => {
    vbar.end();
    hbar.end();
  });
  window.addEventListener('auxclick', (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  });
  scroller.addEventListener('dblclick', onDoubleClick);
  strip.addEventListener('dragstart', (e) => e.preventDefault());
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);

  new ResizeObserver(onResize).observe(scroller);
  new ResizeObserver(() => {
    topsDirty = true;
    layoutBars();
  }).observe(strip);

  api.onOpen(applyState);
  api.onNav(sideNav);
  api.getInitial().then((state) => {
    if (state) applyState(state);
    else showEmpty();
  });
})();
