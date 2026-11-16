'use strict';
/*
 * Longroll Playwright-Electron e2e — plan.md §8-3 "수정 라운드 3"(회차 폴더 구조 + 회차 단위 ←/→ + 직접 구현 스크롤바) 계약 기준.
 * TC ID 의 정본은 plan.md 검증 표(§6, §8-3)와 이 파일의 step 제목이다(과거 문서 tc.md 는 저장소에 없다).
 *   npm test                    -> 전체 실행
 *   node test/run-e2e.js EP-0   -> TC id 가 정규식 /EP-0/i 에 맞는 step 이 속한 suite 만 실행
 *
 * - 픽스처는 os.tmpdir() 아래 임시 폴더에 Python(Pillow)으로 생성하고 종료 시 삭제한다.
 * - 스크린샷 산출물(DSP-05 수동 확인용)은 os.tmpdir()/longroll-e2e-artifacts 에 남긴다.
 * - 앱 코드는 수정하지 않는다.
 * - plan.md 는 비공개 설계 메모(저장소에 포함되지 않음)다. 이 파일 주석의 "plan.md §…" 는 그 메모의 절 번호이며 이 저장소에서는 참조할 수 없다.
 * - FAIL 이 하나라도 있거나 자동 TC 가 누락되면 종료 코드 1.
 * - 모든 테스트 창은 보조 모니터(DIP x<0)에서만 띄운다: 실행 전 모니터 프로브, 앱 환경변수 LONGROLL_WINDOW_POS,
 *   창이 뜬 직후/리사이즈마다 위치 단언(보조 모니터가 아니면 즉시 종료·실행 중단, 종료 코드 3).
 *   LONGROLL_WINDOW_POS 를 지원하지 않는 앱 복사본은 launch 직후 setPosition 폴백(그 앱으로 spawn 기반 OPN-07a 는 실행 거부).
 * - LONGROLL_E2E_DPRS=1.25,1.75 처럼 ZM-16 의 DPR 일부만 실행할 수 있다.
 *
 * - 창을 띄우지 않는 suite(IMG-*: src/imagesize.js 단위 검증)만 선택하면 모니터 사전 점검을 생략한다. 창을 띄우는 suite 가 하나라도 있으면 점검은 그대로다.
 *   (픽스처 구조만 확인하려면 `LONGROLL_E2E_DUMP_FIXTURES=^lib node test/run-e2e.js IMG-04` — 생성된 트리에서 정규식에 맞는 경로를 출력하고 창은 띄우지 않는다.)
 * - 개발용 LONGROLL_E2E_OSR=1(+ LONGROLL_E2E_APP_DIR=offscreen·창 미표시로 패치한 복사본): 보조 모니터가 없을 때 테스트 로직만 디버깅한다.
 *   창이 화면에 표시되면(isVisible) 즉시 중단한다. F11/최대화(WIN-01~03, ZM-15)·DPR 강제(ZM-16, STR-12)는 이 모드에서 돌리지 않는다. 최종 검증 근거가 아니다.
 *
 * 수정 라운드 3 기준 (이전 라운드: 2 = 폴더의 모든 이미지가 #strip 으로 이어짐 + 초기 창 폭·레터박스):
 *  - 폴더 구조: 만화 폴더 > 회차 폴더 > 이미지. 열린 대상이 폴더 D 이고 D 의 하위 폴더 중 이미지가 직접 든 폴더가 1개 이상이면 D 는 만화 폴더(그 하위 폴더들이 회차),
 *    아니고 D 에 이미지가 직접 있으면 D 가 회차 하나(만화 폴더 = 부모), 둘 다 아니면 empty. 이미지 파일을 열면 그 폴더가 회차(만화 폴더 = 부모).
 *    그래서 단일 회차를 기대하는 TC 의 픽스처는 모두 "형제 이미지 폴더가 없는" 전용 부모 아래(fx/sx/<이름>/ep)에 둔다 → #comic = <이름>, #name = ep.
 *    (legacy 키 basic/·str/·many/ ... 는 fixtureEntries 끝에서 sx/<이름>/ep/ 로 옮기고, 매니페스트 M['basic/1.png'] 별칭을 유지한다.)
 *    다회차 픽스처는 fx/lib/<만화>/<회차>/ (comic, varied, mixlen, brokencomic, special, nested, multi).
 *  - ←/→(사이드 버튼·app-command 포함) = 이전/다음 "회차". 한 회차의 모든 장이 #strip 으로 이어진다. 장 단위 이동은 없다(스크롤·Home/End·PageUp/Down).
 *    상단 바: #comic(만화명) #name(회차명) #index((n/N) = 회차 번호/수) #page(현재장/전체장 + '장') #dims #zoom, 창 제목 `회차명 (n/N) - 만화명 - Longroll`.
 *    body.dataset: state, episode(0부터), episodes, index/count(현재 회차 안의 장, 스크롤로 갱신), scale, fit.
 *  - 새 DOM: #view > (#scroller > #strip > .page > img) + #vbar/#hbar (각각 .sthumb). 네이티브 스크롤바·거터 없음(SB = 0),
 *    초기 창 내부 폭 = round(기준 폭 × 1.1) (clientWidth == innerWidth). 바는 오버레이(두께 16, 트랙 양끝 여백 2, 썸 두께 6→호버·드래그 10, 최소 길이 40).
 *  - 새 TC: EP-01~15, SBR-01~10. 기존 NAV-01·02·04~09 는 EP-02/03/09/12/13 으로 흡수(ID 폐지). ERR-04, DSP-04(추가) 신설.
 *
 * - plan.md §8-4(스무스 스크롤 홀드 개선): SCR-08(a)~(p) = Space/Shift+Space/PageUp/PageDown 을 누르고 있을 때(키 자동반복) rAF 프레임마다 #scroller.scrollTop 을 기록해
 *   정지 프레임 비율·역방향·최대/최저 속도 비·키를 뗀 뒤 몰아치기·남은 거리·정착 시간·지연을 판정한다(블랙박스: 키 입력과 DOM 만 사용, 앱 클로저 변수 접근 없음).
 *   suite: smooth(huge) · smooth-multi(many) · smooth-size/smooth-size-up/smooth-size-up2(basic) · smooth-comic(lib/comic) · smooth-win(huge, 창 리사이즈). 창이 가려져 rAF 가 멈추면 '환경: rAF 미동작' 으로 실패한다.
 *
 * 자동화할 수 없는 항목(수동 확인, MANUAL_TCS 참조): 네이티브 파일/폴더 선택 대화상자 실물(Ctrl+O / Ctrl+Shift+O 의 OS UI, 자동 TC 는 dialog.showOpenDialog 를 목으로 대체),
 *  사이드 버튼 하드웨어, 탐색기에서의 실제 드래그&드롭·연결 프로그램으로 열기·설치, 썸을 잡고 끌 때의 체감(거칠기·잡기 쉬움)·컴포지터 스레드 동기(프레임 단위 육안),
 *  호버 두께 변화 육안, 150% 배율 모니터 실물, SCR-09(주 모니터 144Hz·150% 에서 실제 키보드 홀드 스크롤 체감·단발 곡선 체감·장 경계 디코드 공백 육안·실제 웹툰 폴더).
 */
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { spawn, spawnSync } = require('node:child_process');

// 기본은 이 저장소. LONGROLL_E2E_APP_DIR 로 다른 앱 복사본(예: 결함 주입 복사본)을 대상으로 테스트의 검출력을 점검할 수 있다.
const ROOT = process.env.LONGROLL_E2E_APP_DIR ? path.resolve(process.env.LONGROLL_E2E_APP_DIR) : path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const NAMES_DIR_NAME = "특수 폴더 #1 %41 & (x) 'q' [z]";
const SYM_FILE_NAME = "sym [1] +;,=@!$^~ &(2) 'x'.png";
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const EMPTY_PROMPT = '만화 폴더(또는 이미지)를 이 창에 드래그하거나\nCtrl+O(파일) / Ctrl+Shift+O(폴더)로 여세요';

// 허용 오차 (보고서에도 그대로 인용)
const ANCHOR_TOL = 2; // 커서 고정점: 줌 전후 커서 아래 이미지 지점의 화면상 어긋남(CSS px)
const SCROLL_TOL = 1.5; // 스크롤 위치 비교(DPR 1.5 에서 스크롤 오프셋은 1/1.5px 단위로 스냅)
const TOP_Y_TOL = 2; // 뷰포트 상단 기준 위치 유지: scrollTop/scale(원본 이미지 y) 오차(원본 px)
const SMOOTH_TOL = 3; // 스무스 스크롤 정착 후 위치 비교(CSS px)
// SCR-08(plan.md §8-4): 키 홀드 중 rAF 프레임 지표 임계. 정의는 smoothMetrics 주석 참조(속도 = 프레임당 이동/프레임 간격, 홀드 구간 중앙값 기준).
const SMOOTH_HOLD = {
  warmupMs: 150, // 홀드 구간 시작 = 첫 반복(repeat) keydown(없으면 첫 keydown) + 150ms
  stall: 0.05, // 홀드 구간에서 |이동|<0.5px 인 프레임 비율 상한
  maxMed: 1.5, // 홀드 구간 최대 속도 / 중앙 속도 상한
  minMed: 0.5, // 홀드 구간 최저 속도 / 중앙 속도 하한(속도 리셋·재시작 결함 검출)
  burst: 1.5, // 키를 뗀 뒤 최대 속도 / 홀드 중앙 속도 상한(몰아치기)
  remainVh: 4, // 키를 뗀 직후 남은 거리 상한(클라이언트 높이 배수)
  settleMs: 600, // 키를 뗀 뒤 정착까지 상한
  latencyMs: 50, // 첫 keydown → 첫 이동 프레임 상한
  hitch: 2.5, // 홀드 중 dt > 2.5×중앙값 프레임을 히치로 센다(관찰값)
};
const SMOOTH_SINGLE = { spanMin: 150, spanMax: 600, moveFramesMin: 8, stepFrac: 0.25 }; // SCR-08(d) 단발 PageDown 곡선
const CANCEL_KEYS = 10; // SCR-08(f)(g)(n)(o): 애니메이션을 진행 중으로 만들기 위한 PageDown 홀드 횟수(목표 = 10×90%)
const SCALE_REL = 2e-3; // 배율 상대 오차(data-scale 은 toFixed(4))
const PIXEL_TOL = 20; // 스크린샷 픽셀 채널 오차
const LB = 1.1; // 폭 맞춤 레터박스 비율(#strip 폭 = scroller.clientWidth / 1.1)
const SB = 0; // 라운드 3: 네이티브 스크롤바 거터 제거(오버레이 바) → 초기 창 내부 폭 = round(기준폭 × 1.1) + 0
const REF = 800; // 대부분의 픽스처 폭(기준 폭)
const TOPBAR_H = 34; // 상단 바 높이 → #scroller 높이 = 창 내부 높이 - 34
const STRIPE = 30; // STR 픽스처의 위/아래 표식 띠 높이(원본 px)
const STRIPE_TOP = [255, 255, 255]; // 장의 맨 위 STRIPE 행 색
const STRIPE_BOT = [255, 255, 0]; // 장의 맨 아래 STRIPE 행 색
// 라운드 3 스크롤바 계약(plan.md §8-3)
const BAR_W = 16; // #vbar/#hbar 두께(잡을 수 있는 영역)
const TRACK_PAD = 2; // 트랙 양끝 여백
const THUMB_MIN = 40; // 썸 최소 길이
const THUMB_THIN = 6; // 썸 보이는 두께
const THUMB_WIDE = 10; // 호버·드래그 시 두께
const THUMB_TOL = 1; // 썸 길이·위치 허용 오차(CSS px): 길이/이동 거리가 반올림되는 1회분
const SAMPLE_TOL = 1.5; // 프레임 표본(rAF) 비교 허용 오차: THUMB_TOL + 스크롤 오프셋 스냅 0.5
const THICK_TOL = 0.75; // 썸 두께 허용 오차(전환 정착 후)
const SNAP_TOL = 0.5; // 사각형·스크롤 오프셋 비교: 장치 px 스냅(DPR 1 에서 0.5px 이내). "튀지 않음/불변" 단언에도 쓴다
const DRAG_TOL = 1.5; // 썸·스크롤 이동량 비교: 포인터 정수 좌표 + 썸 위치 반올림 1회 + 스냅 0.5

let TMP = null;
let FX = null;
let M = {};
const F = {};
const ARTIFACT_DIR = path.join(os.tmpdir(), 'longroll-e2e-artifacts');
const artifacts = [];
let launchSeq = 0;
const trackedPids = new Set();
const liveApps = new Set();
let WHEEL_METHOD = 'playwright';
let WHEEL_INFO = null;
const notes = [];
const stats = { anchorMax: 0, anchorChecked: 0, anchorSkipped: 0 };
let rendererErrorTotal = 0;
const note = (m) => notes.push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 픽스처 (FX-*: 라운드 3 구조 — sx/<이름>/ep 단독 회차, lib/<만화>/<회차>)
const PY_SOURCE = String.raw`
import json, os, sys, colorsys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1], encoding='utf-8'))
root = spec['root']
manifest = {}
font = ImageFont.load_default(size=22)

def band_colors(n, hue0):
    out = []
    for k in range(n):
        r, g, b = colorsys.hsv_to_rgb((hue0 + k * 0.0837) % 1.0, 0.85, 0.9)
        out.append([int(round(r * 255)), int(round(g * 255)), int(round(b * 255))])
    return out

for e in spec['entries']:
    p = os.path.join(root, *e['rel'].split('/'))
    kind = e['kind']
    if kind == 'dir':
        os.makedirs(p, exist_ok=True)
        continue
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if kind == 'text':
        with open(p, 'w', encoding='utf-8') as f:
            f.write(e.get('text', 'text'))
    elif kind == 'garbage':
        with open(p, 'wb') as f:
            f.write(b'this is definitely not an image file \x00\x01\x02' * 40)
    elif kind == 'zero':
        open(p, 'wb').close()
    elif kind == 'image':
        w, h, band = e['w'], e['h'], e['band']
        n = (h + band - 1) // band
        cols = band_colors(n, e.get('hue', 0.0))
        im = Image.new('RGB', (w, h))
        d = ImageDraw.Draw(im)
        for k, c in enumerate(cols):
            d.rectangle([0, k * band, w - 1, min(h, (k + 1) * band) - 1], fill=tuple(c))
            if w >= 200 and band >= 60:
                d.text((8, k * band + 4), str(k), fill=(255, 255, 255), font=font)
        stripe = e.get('stripe', 0)
        if stripe:
            d.rectangle([0, 0, w - 1, stripe - 1], fill=(255, 255, 255))
            d.rectangle([0, h - stripe, w - 1, h - 1], fill=(255, 255, 0))
        fmt = e['fmt']
        kw = {}
        if fmt == 'PNG':
            kw = {'compress_level': 1}
        elif fmt == 'JPEG':
            kw = {'quality': 92}
        elif fmt == 'WEBP':
            kw = {'quality': 90}
        elif fmt == 'AVIF':
            kw = {'quality': 80}
        if e.get('orient'):
            ex = Image.Exif()
            ex[0x0112] = e['orient']
            kw['exif'] = ex
        im.save(p, format=fmt, **kw)
        manifest[e['rel']] = {'w': w, 'h': h, 'band': band, 'fmt': fmt, 'colors': cols, 'stripe': stripe}
    elif kind == 'solid':
        # IMG-* 헤더 파서 검증용: 형식·모드·저장 옵션을 바꿔가며 만든다. 정답 크기는 요청값이 아니라 Pillow 가 다시 열어 읽은 값.
        w, h, mode = e['w'], e['h'], e.get('mode', 'RGB')
        if mode == 'P':
            im = Image.new('RGB', (w, h), (10, 120, 200)).quantize(16)
        elif mode == 'L':
            im = Image.new('L', (w, h), 90)
        elif mode == 'RGBA':
            im = Image.new('RGBA', (w, h), (10, 120, 200, 128))
        else:
            im = Image.new('RGB', (w, h), (10, 120, 200))
        kw = dict(e.get('kw', {}))
        if e.get('icc'):
            kw['icc_profile'] = bytes(e['icc'])
        if e.get('exifOrient'):
            ex = Image.Exif()
            ex[0x0112] = e['exifOrient']
            kw['exif'] = ex
        im.save(p, format=e['fmt'], **kw)
        with Image.open(p) as chk:
            manifest[e['rel']] = {'w': chk.size[0], 'h': chk.size[1], 'fmt': e['fmt'], 'pil': list(chk.size)}
    elif kind == 'trunc':
        src = os.path.join(root, *e['src'].split('/'))
        data = open(src, 'rb').read()
        keep = e['keep'] if e['keep'] >= 1 else int(len(data) * e['keep'])
        with open(p, 'wb') as f:
            f.write(data[:keep])
    elif kind == 'hex':
        with open(p, 'wb') as f:
            f.write(bytes.fromhex(e['hex']))
    else:
        raise SystemExit('unknown kind ' + kind)

with open(spec['manifest'], 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False)
print('fixtures ok', len(spec['entries']))
`;

// IMG-04: 이미지 한 변 상한(MAX_SIDE = 100000) 경계. 손으로 만든 최소 헤더(Pillow 로는 만들 수 없는 크기)를 쓴다.
const hxn = (n, bytes) => BigInt.asUintN(bytes * 8, BigInt(n)).toString(16).padStart(bytes * 2, '0');
const lex = (n, bytes) => hxn(n, bytes).match(/../g).reverse().join('');
const FTYP_AVIF_HEX = '00000014' + '66747970' + '61766966' + '00000000' + '6d696631'; // ftyp(avif, mif1) 20바이트
const limHdr = {
  png: (w, h) => `89504e470d0a1a0a0000000d49484452${hxn(w, 4)}${hxn(h, 4)}0802000000`,
  bmp: (w, h) => `424d${'00'.repeat(8)}36000000` + `28000000${lex(w, 4)}${lex(h, 4)}`,
  gif: (w, h) => `474946383961${lex(w, 2)}${lex(h, 2)}`,
  webp: (w, h) => `52494646` + `1a000000` + `57454250` + `56503858` + `0a000000` + `00000000` + lex(w - 1, 3) + lex(h - 1, 3),
  jpg: (w, h) => `ffd8ffc00011` + `08` + hxn(h, 2) + hxn(w, 2),
  avif: (w, h) => `${FTYP_AVIF_HEX}00000030` + '6d657461' + '00000000' + '00000024' + '69707270' + '0000001c' + '6970636f' + '00000014' + '69737065' + '00000000' + hxn(w, 4) + hxn(h, 4),
};
const LIMIT_CASES = [
  // 양성 대조군: 손으로 만든 헤더가 올바르게 파싱되는지(제작 방법 검증)
  ['png', 10, 20, [10, 20]], ['bmp', 10, 20, [10, 20]], ['bmp', 10, -20, [10, 20]], ['gif', 10, 20, [10, 20]],
  ['webp', 10, 20, [10, 20]], ['jpg', 10, 20, [10, 20]], ['avif', 10, 20, [10, 20]],
  // 경계 100000 이하는 정상
  ['png', 100000, 1, [100000, 1]], ['png', 1, 100000, [1, 100000]], ['bmp', 100000, 1, [100000, 1]], ['bmp', 1, -100000, [1, 100000]],
  ['webp', 100000, 1, [100000, 1]], ['webp', 1, 100000, [1, 100000]], ['avif', 100000, 1, [100000, 1]], ['avif', 1, 100000, [1, 100000]],
  ['gif', 65535, 65535, [65535, 65535]], ['jpg', 65535, 65535, [65535, 65535]],
  // 100001 이상은 null
  ['png', 100001, 1, null], ['png', 1, 100001, null], ['bmp', 100001, 1, null], ['bmp', 1, 100001, null], ['bmp', 1, -100001, null],
  ['webp', 100001, 1, null], ['webp', 1, 100001, null], ['avif', 100001, 1, null], ['avif', 1, 100001, null],
  // 극단값
  ['png', 1, 2147483647, null], ['png', 4294967295, 4294967295, null], ['bmp', 2147483647, 1, null], ['bmp', -2147483648, 1, null],
  ['webp', 16777216, 16777216, null], ['avif', 4294967295, 4294967295, null],
].map(([fmt, w, h, expect]) => ({ fmt, w, h, expect, name: `lim_${fmt}_${w}x${h}.${fmt === 'jpg' ? 'jpg' : fmt}`.replace('x-', 'xm'), hex: limHdr[fmt](w, h) }));

// ---- 라운드 3 픽스처 구조
// 단일 회차를 기대하는 legacy 픽스처(basic, str, many ...)는 "형제 이미지 폴더가 없는" 전용 부모 아래로 옮긴다: sx/<이름>/ep/...
// (픽스처 루트 fx 에서 sx/basic/ep 를 열면 만화 폴더 = sx/basic, 회차 = ep 한 개. fx/basic 을 그대로 두면 fx 아래 이미지가 든 모든 폴더가 형제 회차가 된다.)
// names/<특수 폴더>(만화 names 의 회차 1개), empty(txt 만), imgsize(헤더 파서 단위 검증, 앱으로 열지 않음)는 그대로 둔다.
const SOLO_FIXTURES = new Set(['basic', 'broken', 'broken-extra', 'huge', 'narrow', 'tall', 'short', 'wide', 'thin', 'str', 'mix', 'tie', 'tie2', 'big', 'many', 'exif', 'broken-trunc', 'short1', 'shortn', 'sort2', 'exts', 'lazy']);
const soloRel = (rel) => {
  const i = rel.indexOf('/');
  const head = i < 0 ? rel : rel.slice(0, i);
  return SOLO_FIXTURES.has(head) ? `sx/${head}/ep/${rel.slice(i + 1)}` : rel;
};
const soloize = (e) => ({ ...e, rel: soloRel(e.rel), ...(e.src ? { src: soloRel(e.src) } : {}) });

// lib/comic: 만화 폴더. 직속 표지 cover.png(무시됨) + 1화(3장)·2화(2장)·10화(5장; 자연 정렬에서 2화 뒤) + 이미지 없는 하위 폴더(자료: txt 만, 빈폴더).
// 장마다 hue 가 달라 식별 가능하고(매니페스트 colors), 맨 위/아래 STRIPE 행 표식이 있다. 모든 회차 폭 800(= 기준 폭, 창 내부 폭 880 에서 배율 1.0).
const COMIC_EPS = [
  { name: '1화', files: ['01.png', '02.png', '03.png'], h: [2400, 1800, 1200] },
  { name: '2화', files: ['01.png', '02.png'], h: [3000, 2000] },
  { name: '10화', files: ['01.png', '02.png', '03.png', '04.png', '05.png'], h: [1000, 900, 800, 700, 600] },
];
const VARIED_EPS = [{ name: '1화', w: 800, h: [1500, 1500] }, { name: '2화', w: 720, h: [1800, 1800] }, { name: '3화', w: 1000, h: [1200, 1200] }];
// lib/mixlen: 뷰포트(786)보다 짧은 회차와 긴 회차가 섞임 → 회차 이동 시 스크롤바 표시/길이가 바뀐다.
const MIXLEN_EPS = [{ name: '1화', h: [300] }, { name: '2화', h: [3000, 3000] }, { name: '3화', h: [400, 300] }, { name: '4화', h: [2000, 2000, 2000, 2000, 2000, 2000] }];
const SPECIAL_EPS = [
  { name: '제1화 - 시작 #1', h: [1200, 1200], hue: 0.15 },
  { name: "제2화 (특별) & 'q' %41", h: [1000], hue: 0.45 },
  { name: '제10화 [z] 한글', h: [900, 900], hue: 0.75 },
];

function libEntries(img) {
  const eps = (base, name, w, heights, hue0, extra = {}) =>
    heights.map((h, k) => img(`${base}/${name}/${String(k + 1).padStart(2, '0')}.png`, w, h, 100, 'PNG', (hue0 + k * 0.06) % 1, { stripe: STRIPE, ...extra }));
  return [
    // 스크롤바 로드 중 안정성(SBR-09): 800×1200 10장(합 12000 → 썸 길이 ≈ 51 > 최소 40). 현재 장 -1~+2 만 eager 라서 나머지는 스크롤하며 lazy 로드된다.
    ...Array.from({ length: 10 }, (_, i) => img(`lazy/p${String(i + 1).padStart(2, '0')}.png`, 800, 1200, 100, 'PNG', i / 10, { stripe: STRIPE })),
    img('lib/comic/cover.png', 800, 600, 100, 'PNG', 0.95),
    ...eps('lib/comic', '1화', 800, COMIC_EPS[0].h, 0.0),
    ...eps('lib/comic', '2화', 800, COMIC_EPS[1].h, 0.3),
    ...eps('lib/comic', '10화', 800, COMIC_EPS[2].h, 0.55),
    { rel: 'lib/comic/1화/info.txt', kind: 'text' },
    { rel: 'lib/comic/자료/memo.txt', kind: 'text' },
    { rel: 'lib/comic/빈폴더', kind: 'dir' },
    ...VARIED_EPS.flatMap((e, k) => eps('lib/varied', e.name, e.w, e.h, 0.05 + k * 0.3)),
    ...MIXLEN_EPS.flatMap((e, k) => eps('lib/mixlen', e.name, 800, e.h, 0.1 + k * 0.2)),
    // 손상 이미지가 든 회차: 2화 = 정상·garbage·정상, 3화 = 정상 + 0바이트
    ...eps('lib/brokencomic', '1화', 800, [800, 800], 0.1),
    img('lib/brokencomic/2화/a.png', 800, 600, 100, 'PNG', 0.1),
    { rel: 'lib/brokencomic/2화/broken.png', kind: 'garbage' },
    img('lib/brokencomic/2화/c.png', 800, 1200, 100, 'PNG', 0.7),
    img('lib/brokencomic/3화/a.png', 800, 1000, 100, 'PNG', 0.4),
    { rel: 'lib/brokencomic/3화/z-zero.png', kind: 'zero' },
    // 한글·특수문자 회차명
    ...SPECIAL_EPS.flatMap((e) => eps('lib/special', e.name, 800, e.h, e.hue)),
    // 하위의 하위 폴더는 탐색하지 않는다: 1화/덤/bonus.png
    img('lib/nested/1화/01.png', 800, 1000, 100, 'PNG', 0.2),
    img('lib/nested/1화/덤/bonus.png', 800, 500, 100, 'PNG', 0.6),
    img('lib/nested/2화/01.png', 800, 1000, 100, 'PNG', 0.4),
    // 여러 만화가 든 상위 폴더(한 단계만 인식하므로 empty)
    img('lib/multi/A/1화/a.png', 800, 600, 100, 'PNG', 0.2),
    img('lib/multi/B/1화/a.png', 800, 600, 100, 'PNG', 0.4),
  ];
}

function fixtureEntries() {
  const img = (rel, w, h, band, fmt, hue = 0, extra = {}) => ({ rel, kind: 'image', w, h, band, fmt, hue, ...extra });
  const nm = (n) => `names/${NAMES_DIR_NAME}/${n}`;
  const solid = (rel, w, h, fmt, extra = {}) => ({ rel: `imgsize/${rel}`, kind: 'solid', w, h, fmt, ...extra });
  const hex = (rel, h) => ({ rel: `imgsize/${rel}`, kind: 'hex', hex: h });
  const trunc = (rel, src, keep) => ({ rel: `imgsize/${rel}`, kind: 'trunc', src: `imgsize/${src}`, keep });
  const be32 = (n) => n.toString(16).padStart(8, '0');
  const FTYP_AVIF = '00000014' + '66747970' + '61766966' + '00000000' + '6d696631'; // ftyp(avif, mif1) 20바이트
  const entries = [
    // FX-BASIC
    img('basic/1.png', 800, 3000, 100, 'PNG', 0),
    img('basic/2.png', 800, 3000, 100, 'PNG', 0.33),
    img('basic/10.png', 800, 3000, 100, 'PNG', 0.66),
    img('basic/UP.PNG', 800, 3000, 100, 'PNG', 0.85),
    { rel: 'basic/note.txt', kind: 'text', text: 'not an image' },
    // FX-NAMES (+ 추가 기호 파일)
    img(nm('a b #1 %20.jpg'), 800, 2000, 100, 'JPEG', 0.1),
    img(nm('가나다.webp'), 800, 2000, 100, 'WEBP', 0.2),
    img(nm(SYM_FILE_NAME), 600, 900, 100, 'PNG', 0.5),
    // FX-BROKEN: 정상 이미지 사이의 broken.png
    img('broken/a.png', 800, 600, 100, 'PNG', 0.1),
    { rel: 'broken/broken.png', kind: 'garbage' },
    img('broken/c.png', 800, 1200, 100, 'PNG', 0.7),
    // 추가: 0바이트 손상
    img('broken-extra/a.png', 800, 600, 100, 'PNG', 0.1),
    { rel: 'broken-extra/c-zero.png', kind: 'zero' },
    img('broken-extra/d.png', 800, 1200, 100, 'PNG', 0.7),
    // FX-HUGE / FX-NARROW / FX-EMPTY
    img('huge/huge.png', 800, 80000, 2000, 'PNG', 0.05),
    img('narrow/narrow.png', 400, 1200, 100, 'PNG', 0.4),
    // FX-TALL / FX-SHORT / FX-WIDE / FX-THIN
    img('tall/tall.png', 800, 60000, 2000, 'PNG', 0.3),
    img('short/short.png', 800, 600, 100, 'PNG', 0.55),
    img('wide/wide.png', 20000, 300, 300, 'PNG', 0.15),
    img('thin/thin.png', 50, 1500, 100, 'PNG', 0.9),
    { rel: 'empty/note.txt', kind: 'text' },
    // FX-STR: 폭 800, 높이가 서로 다르고 마지막이 짧은 4장. 장마다 맨 위 STRIPE 행은 흰색, 맨 아래 STRIPE 행은 노란색(경계 픽셀 검증용)
    img('str/01.png', 800, 3000, 100, 'PNG', 0.0, { stripe: STRIPE }),
    img('str/02.png', 800, 3400, 100, 'PNG', 0.25, { stripe: STRIPE }),
    img('str/03.png', 800, 2600, 100, 'PNG', 0.5, { stripe: STRIPE }),
    img('str/04.png', 800, 600, 100, 'PNG', 0.75, { stripe: STRIPE }),
    // FX-MIX: 폭이 섞인 폴더(720 이 3장 = 최빈값, 첫 장은 800)
    img('mix/m1.png', 800, 1500, 100, 'PNG', 0.0, { stripe: STRIPE }),
    img('mix/m2.png', 720, 1800, 100, 'PNG', 0.2, { stripe: STRIPE }),
    img('mix/m3.png', 720, 1200, 100, 'PNG', 0.4, { stripe: STRIPE }),
    img('mix/m4.png', 1000, 1000, 100, 'PNG', 0.6, { stripe: STRIPE }),
    img('mix/m5.png', 720, 900, 100, 'PNG', 0.8, { stripe: STRIPE }),
    // FX-TIE: 동률(720 한 장, 800 한 장) → 먼저 나온 폭(720)이 기준
    img('tie/a.png', 720, 600, 100, 'PNG', 0.1),
    img('tie/b.png', 800, 600, 100, 'PNG', 0.6),
    img('tie2/a.png', 800, 600, 100, 'PNG', 0.1),
    img('tie2/b.png', 720, 600, 100, 'PNG', 0.6),
    // FX-BIG: 작업 영역을 넘는 폭(WIN-08, DSF 2 에서 사용)
    img('big/big.png', 2400, 1200, 100, 'PNG', 0.35),
    // FX-MANY: 720×2000 24장 (lazy/eager, 순회, Home/End)
    ...Array.from({ length: 24 }, (_, i) => img(`many/m${String(i + 1).padStart(2, '0')}.png`, 720, 2000, 100, 'PNG', (i % 12) / 12)),
    // FX-EXIF: b.jpg 는 저장된 크기 600×800 + EXIF 회전(6) → 표시 크기 800×600 (헤더 크기와 실제 크기가 다름)
    img('exif/a.jpg', 800, 1000, 100, 'JPEG', 0.1),
    img('exif/b.jpg', 600, 800, 100, 'JPEG', 0.5, { orient: 6 }),
    img('exif/c.jpg', 800, 1000, 100, 'JPEG', 0.8),
    img('exif/d.jpg', 800, 3000, 100, 'JPEG', 0.3),
    // FX-BROKEN-TRUNC: 헤더는 정상이고 본문이 잘린 PNG(크기는 읽히므로 종횡비 칸이 먼저 잡힘)
    { rel: 'broken-trunc/a.png', kind: 'trunc', src: 'broken/a.png', keep: 1e9 },
    { rel: 'broken-trunc/b-trunc.png', kind: 'trunc', src: 'broken/c.png', keep: 0.4 },
    { rel: 'broken-trunc/c.png', kind: 'trunc', src: 'broken/c.png', keep: 1e9 },
    // FX-IMGSIZE: 헤더 파서(src/imagesize.js) 검증 — Pillow 로 만든 형식별 파일 + 손상/경계 입력
    solid('png_rgb.png', 317, 1203, 'PNG'),
    solid('png_rgba.png', 255, 129, 'PNG', { mode: 'RGBA' }),
    solid('png_pal.png', 64, 4001, 'PNG', { mode: 'P' }),
    solid('png_gray.png', 33, 777, 'PNG', { mode: 'L' }),
    solid('png_tiny.png', 1, 1, 'PNG'),
    solid('png_wide.png', 20000, 300, 'PNG'),
    solid('gif.gif', 123, 456, 'GIF', { mode: 'P' }),
    solid('bmp.bmp', 201, 99, 'BMP'),
    solid('jpg_base.jpg', 640, 480, 'JPEG', { kw: { quality: 90 } }),
    solid('jpg_prog.jpg', 641, 481, 'JPEG', { kw: { progressive: true } }),
    solid('jpg_icc.jpg', 300, 200, 'JPEG', { icc: 70000 }),
    solid('jpg_exif.jpg', 600, 800, 'JPEG', { exifOrient: 6 }),
    solid('jpg_gray.jpg', 97, 211, 'JPEG', { mode: 'L' }),
    solid('webp_lossy.webp', 720, 16383, 'WEBP', { kw: { quality: 80 } }),
    solid('webp_lossless.webp', 321, 123, 'WEBP', { kw: { lossless: true } }),
    solid('webp_alpha.webp', 257, 131, 'WEBP', { mode: 'RGBA', kw: { quality: 80 } }),
    solid('webp_alpha_lossless.webp', 258, 132, 'WEBP', { mode: 'RGBA', kw: { lossless: true } }),
    solid('avif.avif', 302, 207, 'AVIF', { kw: { quality: 80 } }),
    solid('avif_tall.avif', 400, 3001, 'AVIF', { kw: { quality: 60 } }),
    trunc('png_as.jpg', 'png_rgb.png', 1e9),
    trunc('jpg_as.png', 'jpg_base.jpg', 1e9),
    trunc('png_trunc_body.png', 'png_rgb.png', 0.5),
    trunc('png_trunc_20.png', 'png_rgb.png', 20),
    trunc('jpg_trunc_100.jpg', 'jpg_base.jpg', 100),
    trunc('webp_trunc_20.webp', 'webp_lossy.webp', 20),
    trunc('webp_trunc_28.webp', 'webp_alpha.webp', 28),
    trunc('avif_trunc_40.avif', 'avif.avif', 40),
    trunc('bmp_trunc_20.bmp', 'bmp.bmp', 20),
    { rel: 'imgsize/garbage.png', kind: 'garbage' },
    { rel: 'imgsize/zero.png', kind: 'zero' },
    hex('gif_6bytes.gif', '474946383961'),
    hex('jpg_ff_storm.jpg', `ffd8${'ff'.repeat(5000)}`),
    hex('jpg_sos_first.jpg', 'ffd8ffda0008000000000000'),
    hex('jpg_len0.jpg', 'ffd8ffe100000000'),
    hex('bmp_zero_dim.bmp', `424d${'00'.repeat(24)}`),
    hex('png_zero_width.png', `89504e470d0a1a0a0000000d49484452${be32(0)}${be32(5)}0802000000`),
    hex('avif_meta_huge.avif', `${FTYP_AVIF}ffffffff6d657461${'00'.repeat(40)}`),
    hex('avif_meta_size0.avif', `${FTYP_AVIF}000000006d657461${'00'.repeat(40)}`),
    hex('avif_no_meta.avif', `${FTYP_AVIF}${'00'.repeat(64)}`),
    ...LIMIT_CASES.map((k) => ({ rel: `imgsize/${k.name}`, kind: 'hex', hex: k.hex })),
    // FX-SHORT-LAYOUT: 뷰포트보다 짧은 이미지(LBX-04)
    img('short1/s.png', 800, 300, 100, 'PNG', 0.2),
    img('shortn/a.png', 800, 300, 100, 'PNG', 0.3),
    img('shortn/b.png', 800, 300, 100, 'PNG', 0.7),
    // 추가: 정렬 혼합/하위 디렉터리, 확장자 필터
    ...['img10', 'img2', 'img1', 'Img3', 'IMG11', 'Zed', 'alpha'].map((n) => img(`sort2/${n}.png`, 100, 300, 50, 'PNG', 0.5)),
    { rel: 'sort2/trap.png', kind: 'dir' },
    img('exts/e1.jpg', 200, 600, 50, 'JPEG'),
    img('exts/e2.jpeg', 200, 600, 50, 'JPEG'),
    img('exts/e3.png', 200, 600, 50, 'PNG'),
    img('exts/e4.webp', 200, 600, 50, 'WEBP'),
    img('exts/e5.gif', 200, 600, 50, 'GIF'),
    img('exts/e6.bmp', 200, 600, 50, 'BMP'),
    img('exts/e7.avif', 200, 600, 50, 'AVIF'),
    img('exts/e8.JPG', 200, 600, 50, 'JPEG'),
    img('exts/e9.tif', 200, 600, 50, 'TIFF'),
    { rel: 'exts/e10.svg', kind: 'text', text: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' },
    { rel: 'exts/e11.txt', kind: 'text' },
    img('exts/e12.png.bak', 200, 600, 50, 'PNG'),
    img('exts/e13', 200, 600, 50, 'PNG'),
    // 라운드 3: 만화 폴더(lib/*)와 스크롤바 로드 시험용 lazy
    ...libEntries(img),
  ];
  return entries.map(soloize);
}

function findPython() {
  for (const cmd of [['python'], ['py', '-3']]) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), '--version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  throw new Error('python 을 찾을 수 없습니다 (Pillow 필요)');
}

function genFixtures() {
  FX = path.join(TMP, 'fx');
  fs.mkdirSync(FX, { recursive: true });
  const manifestPath = path.join(TMP, 'manifest.json');
  const specPath = path.join(TMP, 'spec.json');
  const pyPath = path.join(TMP, 'gen.py');
  fs.writeFileSync(specPath, JSON.stringify({ root: FX, manifest: manifestPath, entries: fixtureEntries() }), 'utf8');
  fs.writeFileSync(pyPath, PY_SOURCE, 'utf8');
  const py = findPython();
  const r = spawnSync(py[0], [...py.slice(1), pyPath, specPath], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 1 << 24,
  });
  if (r.status !== 0) throw new Error(`픽스처 생성 실패 (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
  M = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // legacy 매니페스트 키 별칭: sx/<이름>/ep/<rest> -> <이름>/<rest> (기존 M['basic/1.png'] 참조 유지)
  for (const k of Object.keys(M)) {
    const m = /^sx\/([^/]+)\/ep\/(.+)$/.exec(k);
    if (m) M[`${m[1]}/${m[2]}`] = M[k];
  }
  const nd = path.join(FX, 'names', NAMES_DIR_NAME);
  const sd = (name) => path.join(FX, 'sx', name, 'ep');
  const lib = path.join(FX, 'lib');
  Object.assign(F, {
    basicDir: sd('basic'),
    b1: path.join(sd('basic'), '1.png'),
    b2: path.join(sd('basic'), '2.png'),
    b10: path.join(sd('basic'), '10.png'),
    bUP: path.join(sd('basic'), 'UP.PNG'),
    bTxt: path.join(sd('basic'), 'note.txt'),
    namesDir: nd,
    brokenDir: sd('broken'),
    brokenFile: path.join(sd('broken'), 'broken.png'),
    brokenExtraDir: sd('broken-extra'),
    hugeFile: path.join(sd('huge'), 'huge.png'),
    narrow: path.join(sd('narrow'), 'narrow.png'),
    tallFile: path.join(sd('tall'), 'tall.png'),
    shortFile: path.join(sd('short'), 'short.png'),
    wideFile: path.join(sd('wide'), 'wide.png'),
    thinFile: path.join(sd('thin'), 'thin.png'),
    emptyDir: path.join(FX, 'empty'),
    emptyTxt: path.join(FX, 'empty', 'note.txt'),
    sort2Dir: sd('sort2'),
    extsDir: sd('exts'),
    strDir: sd('str'),
    mixDir: sd('mix'),
    tieDir: sd('tie'),
    tie2Dir: sd('tie2'),
    bigFile: path.join(sd('big'), 'big.png'),
    manyDir: sd('many'),
    exifDir: sd('exif'),
    exifC: path.join(sd('exif'), 'c.jpg'),
    brokenTruncDir: sd('broken-trunc'),
    imgsizeDir: path.join(FX, 'imgsize'),
    short1Dir: sd('short1'),
    shortnDir: sd('shortn'),
    lazyDir: sd('lazy'),
    missing: path.join(FX, 'no-such-file.png'),
    // 라운드 3: 만화 폴더
    libDir: lib,
    comicDir: path.join(lib, 'comic'),
    comicCover: path.join(lib, 'comic', 'cover.png'),
    ep1Dir: path.join(lib, 'comic', '1화'),
    ep2Dir: path.join(lib, 'comic', '2화'),
    ep10Dir: path.join(lib, 'comic', '10화'),
    ep10File3: path.join(lib, 'comic', '10화', '03.png'),
    ep2File1: path.join(lib, 'comic', '2화', '01.png'),
    memoDir: path.join(lib, 'comic', '자료'),
    memoTxt: path.join(lib, 'comic', '자료', 'memo.txt'),
    emptyEpDir: path.join(lib, 'comic', '빈폴더'),
    variedDir: path.join(lib, 'varied'),
    mixlenDir: path.join(lib, 'mixlen'),
    brokenComicDir: path.join(lib, 'brokencomic'),
    specialDir: path.join(lib, 'special'),
    nestedDir: path.join(lib, 'nested'),
    multiDir: path.join(lib, 'multi'),
  });
}

// 개발용: LONGROLL_E2E_DUMP_FIXTURES=<정규식> 이면 생성된 픽스처 트리 중 상대 경로가 정규식에 맞는 항목을 출력한다(창은 띄우지 않음).
function dumpFixtures(filterSrc) {
  const re = new RegExp(filterSrc === '1' ? '.' : filterSrc);
  const walk = (dir, rel) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      const full = path.join(dir, d.name);
      if (re.test(r)) console.log(`  ${d.isDirectory() ? 'D' : 'F'} ${r}${d.isFile() ? ` (${fs.statSync(full).size}B${M[r] ? ` ${M[r].w}x${M[r].h}` : ''})` : ''}`);
      if (d.isDirectory()) walk(full, r);
    }
  };
  console.log('[fixtures:dump]');
  walk(FX, '');
}

// ---------------------------------------------------------------- 하니스
// 모든 테스트 창은 보조 모니터(DIP bounds (-2560,0) 2560x1440, scale 1.0) 에서만 띄운다. 주 모니터는 사용자가 쓰는 중이다.
const WINDOW_POS = '-2460,100';
const WINDOW_POS_XY = WINDOW_POS.split(',').map(Number);
const safety = { checks: 0, moved: 0, rows: [], probes: [] };
// 개발용 OSR 모드(LONGROLL_E2E_OSR=1): 보조 모니터가 없을 때 테스트 로직만 디버깅하기 위한 것. 앱 복사본(LONGROLL_E2E_APP_DIR)의 main.js 를
// offscreen 렌더링·창 미표시로 패치해 두고 돌리며, 창이 한 번이라도 화면에 보이면(isVisible) 즉시 중단한다. 최종 검증 근거로 쓰지 않는다(디스플레이 배율·창 표시 관련 TC 는 의미 없음).
const OSR = process.env.LONGROLL_E2E_OSR === '1';
// OSR 모드에서는 숨김 창이 표시될 위험(F11/최대화)이 있거나 DSF 강제가 안 먹는 suite 를 자동으로 건너뛴다(실패로 세지 않고 '실제 창 미검증'으로 표기).
const OSR_SKIP_SUITES = new Set(['fullscreen', 'pos-keep', 'dpr-fit', 'str-dpr']);
if (OSR && !process.env.LONGROLL_E2E_APP_DIR) { console.error('LONGROLL_E2E_OSR=1 은 LONGROLL_E2E_APP_DIR(OSR 패치된 복사본)과 함께만 사용'); process.exit(3); }

function baseEnv(userData, pos = WINDOW_POS) {
  const env = { ...process.env, LONGROLL_USER_DATA: userData, LONGROLL_WINDOW_POS: pos };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function abortRun(msg) {
  console.error(`\n!! 보조 모니터 안전장치 작동 — 실행 중단: ${msg}`);
  for (const pid of trackedPids) {
    try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  try { if (TMP) fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* ignore */ }
  process.exit(3);
}

// 창이 보조 모니터(주 모니터가 아니고 DIP x<0)에 있는지 main 에서 직접 읽어 단언. 일반 상태에서는 창 오른쪽 끝이 x=0(주 모니터 시작) 이하여야 함.
// fallback 이 주어지면(앱이 LONGROLL_WINDOW_POS 를 지원하지 않는 기준선) 벗어났을 때 한 번 이동시킨 뒤 다시 확인한다.
async function assertOnSecondary(app, label, fallback = null) {
  if (OSR) {
    const vis = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
    safety.checks++;
    safety.rows.push(`${label}: [OSR 개발 모드] 창 표시 여부=${vis}`);
    if (vis) abortRun(`${label}: OSR 개발 모드인데 창이 화면에 표시됨(isVisible=true)`);
    return { onSecondary: true, osr: true, b: { x: 0, y: 0, width: 0, height: 0 }, displayX: 0, special: false };
  }
  const r = await app.evaluate(({ BrowserWindow, screen }, fb) => {
    const w = BrowserWindow.getAllWindows()[0];
    const primaryId = screen.getPrimaryDisplay().id;
    const read = () => {
      const b = w.getBounds();
      const d = screen.getDisplayMatching(b);
      const special = w.isFullScreen() || w.isMaximized();
      return { b, displayId: d.id, displayX: d.bounds.x, special, onSecondary: d.id !== primaryId && d.bounds.x < 0 && (special || b.x + b.width <= 0) };
    };
    let s = read();
    let moved = false;
    if (!s.onSecondary && fb) { w.setPosition(fb[0], fb[1]); moved = true; s = read(); }
    return { ...s, moved, primaryId };
  }, fallback);
  safety.checks++;
  if (r.moved) safety.moved++;
  safety.rows.push(`${label}: displayX=${r.displayX} bounds=(${r.b.x},${r.b.y},${r.b.width}x${r.b.height})${r.special ? ' [전체화면/최대화]' : ''}${r.moved ? ' [폴백 setPosition 사용]' : ''}`);
  if (!r.onSecondary) {
    abortRun(`${label}: 창이 보조 모니터에 있지 않음 displayId=${r.displayId} displayX=${r.displayX} primaryId=${r.primaryId} bounds=${JSON.stringify(r.b)}`);
  }
  return r;
}

// 창 없이 모니터 배치만 읽는 Electron 프로브(show 할 창이 없으므로 화면에 아무것도 뜨지 않음)
const PROBE_SRC = `
const { app, screen } = require('electron');
app.whenReady().then(() => {
  const out = { primary: screen.getPrimaryDisplay().id, displays: screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor })) };
  process.stdout.write('PROBE ' + JSON.stringify(out) + '\\n');
  app.exit(0);
});
`;

function probeDisplays(forcedDsf) {
  const script = path.join(TMP, 'probe-displays.js');
  if (!fs.existsSync(script)) fs.writeFileSync(script, PROBE_SRC, 'utf8');
  const args = [script, `--user-data-dir=${path.join(TMP, `probe-ud-${forcedDsf || 'default'}`)}`];
  if (forcedDsf) args.push(`--force-device-scale-factor=${forcedDsf}`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(ELECTRON_EXE, args, { encoding: 'utf8', env, timeout: 40000, windowsHide: true });
  const line = String(r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('PROBE '));
  if (!line) abortRun(`모니터 프로브 실패(DSF ${forcedDsf || '기본'}): exit=${r.status} ${String(r.stderr || '').slice(0, 200)}`);
  return JSON.parse(line.slice(6));
}

// 실행 전 점검: 보조 모니터가 기대한 위치에 없으면 창을 하나도 띄우지 않고 중단
function preflightMonitors() {
  if (OSR) { console.log('[safety] OSR 개발 모드: 창을 화면에 표시하지 않음(표시되면 즉시 중단). 모니터 점검 생략'); return null; }
  const p = probeDisplays(null);
  const sec = p.displays.find((d) => d.id !== p.primary && d.bounds.x + d.bounds.width <= 0);
  if (!sec) abortRun(`보조 모니터(DIP x<0)를 찾지 못함: ${JSON.stringify(p.displays.map((d) => d.bounds))}`);
  const [x, y] = WINDOW_POS_XY;
  const inside = x >= sec.bounds.x && y >= sec.bounds.y && x + 1500 <= sec.bounds.x + sec.bounds.width && y + 900 <= sec.bounds.y + sec.bounds.height;
  if (!inside) abortRun(`시작 위치 ${WINDOW_POS} 가 보조 모니터 bounds ${JSON.stringify(sec.bounds)} 안에 들어가지 않음`);
  safety.probes.push(`기본: 보조 id=${sec.id} bounds=(${sec.bounds.x},${sec.bounds.y},${sec.bounds.width}x${sec.bounds.height}) scale=${sec.scaleFactor}, 주 id=${p.primary}; 시작 위치 ${WINDOW_POS}`);
  console.log(`[safety] ${safety.probes[safety.probes.length - 1]}`);
  return sec;
}

// --force-device-scale-factor 에서는 DIP 좌표계가 달라지므로(보조 모니터 작업 영역 폭 = 2560/배율) 작업 영역을 프로브해 시작 위치를 구한다.
// 창이 최대 maxOuter 폭까지 커져도 오른쪽 끝이 x=0(주 모니터 시작)을 넘지 않도록 오른쪽 끝 기준으로 놓는다(왼쪽이 데스크톱 밖으로 조금 나가는 것은 허용).
function dsfWindowPos(dsf, maxOuter = 1541) {
  if (OSR) return WINDOW_POS;
  const p = probeDisplays(dsf);
  const sec = p.displays.find((d) => d.id !== p.primary && d.workArea.x + d.workArea.width <= 1);
  if (!sec) abortRun(`DSF ${dsf}: 보조 모니터를 찾지 못함 ${JSON.stringify(p.displays.map((d) => d.workArea))}`);
  const x = Math.round(sec.workArea.x + sec.workArea.width - maxOuter);
  const y = sec.workArea.y;
  safety.probes.push(`DSF ${dsf}: 보조 작업영역=(${sec.workArea.x},${sec.workArea.y},${sec.workArea.width}x${sec.workArea.height}), 시작 위치 ${x},${y}`);
  console.log(`[safety] ${safety.probes[safety.probes.length - 1]}`);
  return `${x},${y}`;
}

// WIN-08(작업 영역 초과): 창이 작업 영역 폭까지 커져도 오른쪽 끝이 x=0 을 넘지 않도록, 시작 x 를 (작업 영역 오른쪽 끝 - 작업 영역 폭 - 여유)로 둔다.
// 최대 창 바깥 폭 = 작업 영역 폭(내부 폭 = 작업 영역 폭 - 16 + 프레임 16) 이므로 오른쪽 끝 = x + 작업 영역 폭 <= -여유 < 0.
function dsfClampPos(dsf, margin = 24) {
  const p = probeDisplays(dsf);
  const sec = OSR ? p.displays[0] : p.displays.find((d) => d.id !== p.primary && d.workArea.x + d.workArea.width <= 1);
  if (!sec) abortRun(`DSF ${dsf}: 보조 모니터를 찾지 못함 ${JSON.stringify(p.displays.map((d) => d.workArea))}`);
  const x = Math.round(sec.workArea.x + sec.workArea.width - sec.workArea.width - margin);
  const y = sec.workArea.y;
  safety.probes.push(`DSF ${dsf}(작업 영역 클램프 시험): 보조 작업영역=(${sec.workArea.x},${sec.workArea.y},${sec.workArea.width}x${sec.workArea.height}), 시작 위치 ${x},${y}(최대 창 폭이어도 오른쪽 끝 ${x + sec.workArea.width} <= 0)`);
  console.log(`[safety] ${safety.probes[safety.probes.length - 1]}`);
  return { pos: `${x},${y}`, workArea: sec.workArea };
}

async function closeApp(app) {
  const proc = app.process();
  try {
    await Promise.race([app.close(), sleep(15000).then(() => { throw new Error('app.close timeout'); })]);
  } catch {
    try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ }
  }
}

// page.evaluate 로 직렬화되므로 외부 변수를 참조하지 않는다. 요소가 아직 없어도(구현 중) 예외 없이 null 로 채운다.
function snapFn() {
  const byId = (id) => document.getElementById(id);
  const s = byId('scroller');
  const stripEl = byId('strip');
  const msg = byId('message');
  const toast = byId('toast');
  const view = byId('view');
  const d = document.body.dataset;
  const sr = s.getBoundingClientRect();
  const st = stripEl.getBoundingClientRect();
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const text = (id) => {
    const e = byId(id);
    return e ? e.textContent : null;
  };
  const box = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
  const pages = Array.from(stripEl.children).map((el, i) => {
    const r = el.getBoundingClientRect();
    const im = el.querySelector('img');
    return {
      i,
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      y: r.top - sr.top + s.scrollTop,
      natW: im ? im.naturalWidth : 0,
      natH: im ? im.naturalHeight : 0,
      attrW: im ? im.getAttribute('width') : null,
      attrH: im ? im.getAttribute('height') : null,
      loading: im ? im.loading : null,
      complete: im ? im.complete : false,
      src: im ? im.src : '',
      broken: el.classList.contains('broken'),
      unsized: el.classList.contains('unsized'),
      label: el.dataset.label ?? null,
    };
  });
  const bar = (id) => {
    const el = byId(id);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const th = el.querySelector('.sthumb');
    const tcs = th ? getComputedStyle(th) : null;
    const anims =
      th && typeof th.getAnimations === 'function'
        ? th.getAnimations().map((a) => {
            const tl = a.timeline;
            return {
              type: tl ? tl.constructor.name : null,
              scroll: typeof ScrollTimeline !== 'undefined' && tl instanceof ScrollTimeline,
              source: tl && tl.source ? tl.source.id || tl.source.tagName : null,
              axis: tl && 'axis' in tl ? tl.axis : null,
              state: a.playState,
              name: a.animationName || null,
            };
          })
        : null;
    return {
      hidden: el.hidden || cs.display === 'none' || cs.visibility === 'hidden',
      hiddenAttr: el.hidden,
      display: cs.display,
      visibility: cs.visibility,
      rect: box(el.getBoundingClientRect()),
      cls: el.className,
      dragging: el.classList.contains('dragging') || (!!th && th.classList.contains('dragging')),
      thumb: th ? box(th.getBoundingClientRect()) : null,
      thumbCls: th ? th.className : null,
      thumbCss: tcs
        ? { width: tcs.width, height: tcs.height, len: tcs.getPropertyValue('--len').trim(), travel: tcs.getPropertyValue('--travel').trim(), timeline: tcs.animationTimeline, transform: tcs.transform }
        : null,
      anims,
    };
  };
  const cur = pages[Number(d.index)] || null;
  const scs = getComputedStyle(s);
  const ae = document.activeElement;
  return {
    pages,
    cur,
    strip: { left: st.left, top: st.top, width: st.width, height: st.height },
    state: d.state ?? null,
    index: num(d.index),
    count: num(d.count),
    episode: num(d.episode),
    episodes: num(d.episodes),
    scale: num(d.scale),
    scaleStr: d.scale ?? null,
    fit: d.fit === 'true' ? true : d.fit === 'false' ? false : null,
    comic: text('comic'),
    name: text('name'),
    indexText: text('index'),
    pageText: text('page'),
    dims: text('dims'),
    zoomText: text('zoom'),
    title: document.title,
    scrollTop: s.scrollTop,
    scrollLeft: s.scrollLeft,
    scrollHeight: s.scrollHeight,
    scrollWidth: s.scrollWidth,
    clientWidth: s.clientWidth,
    clientHeight: s.clientHeight,
    offsetWidth: s.offsetWidth,
    offsetHeight: s.offsetHeight,
    sr: { left: sr.left, top: sr.top },
    view: view ? box(view.getBoundingClientRect()) : null,
    vbar: bar('vbar'),
    hbar: bar('hbar'),
    scrollerCss: {
      scrollbarWidth: scs.scrollbarWidth,
      overflowX: scs.overflowX,
      overflowY: scs.overflowY,
      webkitScrollbarDisplay: getComputedStyle(s, '::-webkit-scrollbar').display,
    },
    active: ae ? ae.id || ae.tagName : null,
    msgHidden: msg.hidden,
    msgText: msg.textContent,
    toastHidden: toast.hidden,
    toastText: toast.textContent,
    panning: s.classList.contains('panning'),
    anyDragging: !!document.querySelector('.dragging'),
    dropmaskHidden: byId('dropmask').hidden,
    dpr: window.devicePixelRatio,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
  };
}
const snap = (page) => page.evaluate(snapFn);

function brief(s) {
  if (!s) return 'null';
  const { state, comic, name, episode, index, count, scaleStr, fit, scrollTop, scrollLeft, clientWidth, clientHeight, msgText, toastText } = s;
  return JSON.stringify({ state, comic, episode: name, ep: episode, index, count, scale: scaleStr, fit, scrollTop, scrollLeft, clientWidth, clientHeight, msg: msgText, toast: toastText });
}

async function poll(fn, { timeout = 10000, interval = 40, desc = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout(${timeout}ms): ${desc}`);
    await sleep(interval);
  }
}

async function waitSnap(page, pred, desc, timeout = 10000) {
  let last = null;
  try {
    return await poll(async () => {
      last = await snap(page);
      return pred(last) ? last : null;
    }, { timeout, desc });
  } catch (e) {
    throw new Error(`${e.message}\n  last snapshot: ${brief(last)}`);
  }
}

async function launchApp(arg, { wait = true, pre = [], pos = WINDOW_POS } = {}) {
  const userData = path.join(TMP, `ud-${++launchSeq}`);
  const args = [...pre, '.'];
  if (arg) args.push(arg);
  const app = await electron.launch({ args, cwd: ROOT, env: baseEnv(userData, pos), timeout: 60000 });
  liveApps.add(app);
  trackedPids.add(app.process().pid);
  const errors = [];
  try {
    const page = await app.firstWindow();
    await assertOnSecondary(app, `launch#${launchSeq}`, pos === WINDOW_POS ? WINDOW_POS_XY : null);
    if (OSR) {
      await app.evaluate(({ BrowserWindow }) => { for (const m of ['show', 'showInactive', 'focus', 'setFullScreen', 'maximize', 'restore']) BrowserWindow.prototype[m] = function noop() {}; });
      safety.osrGuards = (safety.osrGuards || 0) + 1;
    }
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('crash', () => errors.push('renderer crashed'));
    if (wait) await waitSnap(page, (s) => s.state === 'ready' || s.state === 'empty', '초기 로드', 60000);
    try { initSizes.set(app, (await winInfo(app)).size); } catch { /* ignore */ }
    return { app, page, userData, errors };
  } catch (e) {
    await closeApp(app);
    liveApps.delete(app);
    throw e;
  }
}

async function shutdown(h) {
  await closeApp(h.app);
  liveApps.delete(h.app);
}

async function withApp(arg, fn, opts) {
  const h = await launchApp(arg, opts);
  try {
    const r = await fn(h);
    assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
    return r;
  } finally {
    rendererErrorTotal += h.errors.length;
    await shutdown(h);
  }
}

// want: undefined = ready 만 / 객체 = 스냅샷 필드 일치({comic, name, episode, index ...}) /
//       확장자가 있는 문자열('1.png' 등 legacy 호출) = 현재 장(cur)의 파일명 일치 / 그 외 문자열 = 회차명(#name) 일치
const IMG_NAME_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
function wantMatch(s, want) {
  if (want === undefined || want === null) return true;
  if (typeof want === 'string') {
    if (IMG_NAME_RE.test(want)) return !!s.cur && baseName(s.cur.src) === want;
    return s.name === want;
  }
  return Object.entries(want).every(([k, v]) => s[k] === v);
}
const wantLabel = (want) => (want === undefined ? '' : typeof want === 'string' ? ` (${want})` : ` ${JSON.stringify(want)}`);
const waitReady = (page, want, timeout = 15000) => waitSnap(page, (s) => s.state === 'ready' && wantMatch(s, want), `ready${wantLabel(want)}`, timeout);
const waitToastHidden = (page) => waitSnap(page, (s) => s.toastHidden, '토스트 숨김 대기', 6000);

async function settleScroll(page, quiet = 300, timeout = 6000) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const v = await page.evaluate(() => {
      const s = document.getElementById('scroller');
      return [s.scrollTop, s.scrollLeft];
    });
    const key = v.join(',');
    if (key !== last) { last = key; since = Date.now(); }
    if (Date.now() - since >= quiet) return { top: v[0], left: v[1] };
    if (Date.now() - t0 > timeout) throw new Error('scroll did not settle');
    await sleep(50);
  }
}

const setScroll = (page, top, left) =>
  page.evaluate(([t, l]) => {
    const s = document.getElementById('scroller');
    if (t != null) s.scrollTop = t;
    if (l != null) s.scrollLeft = l;
  }, [top ?? null, left ?? null]);

const center = (s) => ({ x: s.sr.left + s.clientWidth / 2, y: s.sr.top + s.clientHeight / 2 });
const at = (s, fx, fy) => ({ x: s.sr.left + s.clientWidth * fx, y: s.sr.top + s.clientHeight * fy });
const press = (page, key) => page.keyboard.press(key);

function approx(actual, expected, tol, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol, `${label}: actual=${actual} expected=${expected} (허용 ±${tol})`);
}
const relApprox = (actual, expected, rel, label) => approx(actual, expected, Math.abs(expected) * rel, label);
// 폭 맞춤 배율 = (clientWidth / 1.1) / 기준 폭. 기준 폭(최빈 폭)은 DOM 에서 읽을 수 없으므로 픽스처 폭을 넘긴다(기본 800).
const fitOf = (s, ref = REF) => s.clientWidth / LB / ref;
const stripScale = (s, ref = REF) => s.strip.width / ref;
// 뷰포트 맨 위에 걸친 장(앱 규칙: 장의 top <= scrollTop + 2 중 마지막). ←/→ 직후의 고정(pin)은 반영하지 않는다.
function expectedIndex(s) {
  let idx = 0;
  for (const p of s.pages) if (p.y <= s.scrollTop + 2) idx = p.i;
  return idx;
}
const baseName = (src) => decodeURIComponent(String(src).split('/').pop());
const fileNameOf = (p) => path.basename(p);
// 장 i 의 맨 위로 scrollTop 을 맞출 수 있는 최대 스크롤 한계
const maxTopOf = (s) => s.scrollHeight - s.clientHeight;

// ---- 라운드 3 헬퍼: 장(스크롤 기반) / 회차(←/→) / 스크롤바
const EDGE_FIRST = '첫 번째 회차입니다';
const EDGE_LAST = '마지막 회차입니다';
const srcPath = (src) => decodeURIComponent(String(src).replace(/^file:\/\/\/?/, ''));
const srcDirName = (src) => path.basename(path.dirname(srcPath(src)));
const pageNames = (s) => s.pages.map((p) => baseName(p.src));
const pageDirs = (s) => [...new Set(s.pages.map((p) => srcDirName(p.src)))];
const epDirOf = (s) => path.normalize(path.dirname(srcPath(s.pages[0].src)));
const frames = (page, n = 2) =>
  page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const f = () => (++i >= k ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n
  );
// 스크롤바 썸은 컴포지터 애니메이션이라 마지막 스크롤 변경 뒤 프레임 2개를 기다린 다음 읽는다. 호버 두께 전환 등이 끝나 썸 사각형이 두 번 연속 같을 때까지(최대 12회) 기다린다.
// (같은 프레임 일치는 SBR-03 이 rAF 로 따로 단언한다.)
const barSnap = async (page) => {
  const key = (s) => JSON.stringify([s.vbar && s.vbar.thumb, s.hbar && s.hbar.thumb, s.scrollTop, s.scrollLeft], (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
  let prev = null;
  let s = null;
  for (let i = 0; i < 12; i++) {
    await frames(page, 2);
    s = await snap(page);
    const k = key(s);
    if (k === prev) return s;
    prev = k;
  }
  return s;
};

// 장 i 의 맨 위로 스크롤(맨 위에 닿을 수 있는 장만. 짧은 마지막 장은 최대 스크롤에 걸려 index 가 이전 장이 되므로 쓰지 않는다)
async function gotoPage(page, i) {
  for (let n = 0; n < 20; n++) {
    const s = await snap(page);
    if (!s.pages[i]) throw new Error(`장 ${i} 가 없음 (장 ${s.pages.length}개)`);
    const target = Math.max(0, Math.min(s.pages[i].y, maxTopOf(s)));
    if (Math.abs(s.scrollTop - target) > 1.5) await setScroll(page, target, null);
    await sleep(60);
    const t = await snap(page);
    if (t.index === i && t.state !== 'loading' && Math.abs(t.scrollTop - Math.max(0, Math.min(t.pages[i].y, maxTopOf(t)))) <= 1.5) return t;
  }
  throw new Error(`장 ${i} 로 이동하지 못함`);
}

// 현재 회차의 모든 장을 위에서부터 한 장씩 맨 위로 스크롤하며(lazy 로드 유도) 각 장의 로드·표시를 기록한다. (구 traverse 의 스크롤 기반 대체)
async function scanPages(page) {
  const out = [];
  const n = (await snap(page)).pages.length;
  for (let i = 0; i < n; i++) {
    let s = await snap(page);
    await setScroll(page, Math.max(0, Math.min(s.pages[i].y, maxTopOf(s))), null);
    s = await waitSnap(
      page,
      (v) => v.pages[i] && (v.pages[i].broken || (v.pages[i].complete && v.pages[i].natW > 0)) && Math.abs(v.scrollTop - Math.max(0, Math.min(v.pages[i].y, maxTopOf(v)))) <= 1.5,
      `장 ${i} 로드·스크롤`,
      20000
    );
    await sleep(80);
    s = await snap(page);
    out.push({ i, name: baseName(s.pages[i].src), natW: s.pages[i].natW, natH: s.pages[i].natH, broken: s.pages[i].broken, state: s.state, dims: s.dims, index: s.index, pageText: s.pageText });
  }
  return out;
}

// ←/→ 로 회차 i 까지 이동(이동 응답이 올 때까지 기다린 뒤 다음 키)
async function gotoEpisode(page, i) {
  for (let n = 0; n < 40; n++) {
    const s = await snap(page);
    if (s.episode === i && s.state === 'ready') return s;
    if (s.state === 'loading' || s.episode === i) {
      await sleep(60);
      continue;
    }
    const from = s.episode;
    await press(page, from < i ? 'ArrowRight' : 'ArrowLeft');
    await poll(async () => (await snap(page)).episode !== from, { timeout: 8000, desc: `회차 ${from} → ${i} 방향 이동 응답` });
  }
  throw new Error(`회차 ${i} 로 이동하지 못함`);
}

// 회차 표시줄 단언: #comic / #name / #index (n/N) / body.dataset.episode·episodes / document.title
function assertEpisodeBar(s, { comic, name, n, N, pages }, label) {
  assert.equal(s.state, 'ready', `${label}: state`);
  assert.equal(s.comic, comic, `${label}: #comic`);
  assert.equal(s.name, name, `${label}: #name`);
  assert.equal(s.indexText, `(${n}/${N})`, `${label}: #index`);
  assert.equal(s.episode, n - 1, `${label}: body.dataset.episode`);
  assert.equal(s.episodes, N, `${label}: body.dataset.episodes`);
  assert.equal(s.title, `${name} (${n}/${N}) - ${comic} - Longroll`, `${label}: document.title`);
  if (pages !== undefined) {
    assert.equal(s.pages.length, pages, `${label}: .page 수`);
    assert.equal(s.count, pages, `${label}: body.dataset.count`);
  }
}

const installKeyLog = (page) =>
  page.evaluate(() => {
    if (window.__keys) {
      window.__keys.length = 0;
      return;
    }
    window.__keys = [];
    window.addEventListener('keydown', (e) => window.__keys.push({ key: e.key, repeat: e.repeat, ctrl: e.ctrlKey, shift: e.shiftKey, trusted: e.isTrusted }), true);
  });

// ---- main 쪽 시험 이음새(앱 코드는 수정하지 않는다): IPC 핸들러 호출/지연 주입, 대화상자 목
// viewer:* IPC 핸들러를 렌더러 없이 직접 호출한다(UI 에는 반영되지 않는 순수 상태 계산). args 는 그대로 전달한다.
const callIpc = (app, channel, ...args) =>
  app.evaluate(
    async ({ ipcMain, BrowserWindow }, [ch, a]) => {
      const summarize = (r) =>
        r == null
          ? r
          : {
              keys: Object.keys(r), edge: r.edge, error: r.error, episode: r.episode,
              comic: r.comic && typeof r.comic === 'object' ? r.comic.name : r.comic,
              episodes: Array.isArray(r.episodes) ? r.episodes.map((x) => (x && x.name) || x) : r.episodes,
              dir: r.dir, files: Array.isArray(r.files) ? r.files.map((f) => f.name) : undefined, index: r.index, refWidth: r.refWidth, letterbox: r.letterbox,
            };
      const map = ipcMain._invokeHandlers;
      const h = map && map.get(ch);
      if (!h) return { missing: true };
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      try {
        return { ok: true, r: summarize(await h({ sender: wc }, ...a)) };
      } catch (e) {
        return { threw: String((e && e.message) || e) };
      }
    },
    [channel, args]
  );// go-episode 응답 지연: delays[k] ms 만큼 k 번째 호출의 응답을 늦춘다. 호출 로그는 globalThis.__goLog.
const hookGoEpisode = (app, delays) =>
  app.evaluate(({ ipcMain }, cfg) => {
    const ch = 'viewer:go-episode';
    const map = ipcMain._invokeHandlers;
    if (!map || !map.has(ch)) throw new Error('ipcMain._invokeHandlers 에서 viewer:go-episode 를 찾지 못함(시험 이음새 사용 불가)');
    globalThis.__origGo = globalThis.__origGo || map.get(ch);
    const orig = globalThis.__origGo;
    globalThis.__goLog = [];
    let n = 0;
    map.set(ch, async (e, ...args) => {
      const k = n++;
      globalThis.__goLog.push({ k, args, t: Date.now() });
      const d = cfg.delays[k] || 0;
      if (d) await new Promise((r) => setTimeout(r, d));
      return orig(e, ...args);
    });
  }, { delays });
const unhookGoEpisode = (app) =>
  app.evaluate(({ ipcMain }) => {
    if (globalThis.__origGo) ipcMain._invokeHandlers.set('viewer:go-episode', globalThis.__origGo);
  });
const goLog = (app) => app.evaluate(() => globalThis.__goLog || []);

// dialog.showOpenDialog 목: 호출 옵션(properties 등)을 기록하고 globalThis.__dlgNext 를 돌려준다(기본 취소).
const stubDialog = (app) =>
  app.evaluate(({ dialog }) => {
    globalThis.__dlgCalls = [];
    globalThis.__dlgNext = { canceled: true, filePaths: [] };
    dialog.showOpenDialog = (...a) => {
      const opts = a.find((x) => x && typeof x === 'object' && Array.isArray(x.properties)) || null;
      globalThis.__dlgCalls.push({ properties: opts ? [...opts.properties] : null, title: opts && opts.title ? opts.title : null });
      const r = globalThis.__dlgNext;
      return Promise.resolve({ canceled: !!r.canceled, filePaths: [...(r.filePaths || [])] });
    };
  });
const dlgNext = (app, result) => app.evaluate((_x, r) => { globalThis.__dlgNext = r; }, result);
const dlgCalls = (app) => app.evaluate(() => globalThis.__dlgCalls || []);

// ---- 스크롤바(#vbar/#hbar) 수식 헬퍼 (plan.md §8-3 계약)
const barVisible = (b) => !!b && !b.hidden && b.rect.width > 0 && b.rect.height > 0;
function trackOf(bar, axis) {
  const len = axis === 'y' ? bar.rect.height : bar.rect.width;
  return { start: (axis === 'y' ? bar.rect.top : bar.rect.left) + TRACK_PAD, len: len - 2 * TRACK_PAD };
}
// 썸 길이 = max(40, 트랙 × 보이는 크기 / 전체 크기), 위치 = 스크롤 / (전체 − 보이는 크기) × (트랙 − 썸 길이)
function expectedThumb(s, axis) {
  const bar = axis === 'y' ? s.vbar : s.hbar;
  const tr = trackOf(bar, axis);
  const visible = axis === 'y' ? s.clientHeight : s.clientWidth;
  const total = axis === 'y' ? s.scrollHeight : s.scrollWidth;
  const pos = axis === 'y' ? s.scrollTop : s.scrollLeft;
  const len = Math.max(THUMB_MIN, (tr.len * visible) / total);
  const max = total - visible;
  const travel = tr.len - len;
  return { trackStart: tr.start, trackLen: tr.len, len, travel, max, pos, off: max > 0 ? (pos / max) * travel : 0, visible, total };
}
const thumbLen = (bar, axis) => (axis === 'y' ? bar.thumb.height : bar.thumb.width);
const thumbStart = (bar, axis) => (axis === 'y' ? bar.thumb.top : bar.thumb.left);
function assertThumb(s, axis, label, tol = THUMB_TOL) {
  const bar = axis === 'y' ? s.vbar : s.hbar;
  assert.ok(barVisible(bar), `${label}: #${axis === 'y' ? 'vbar' : 'hbar'} 가 보이지 않음 (${bar ? JSON.stringify({ hidden: bar.hidden, rect: bar.rect }) : '요소 없음'})`);
  assert.ok(bar.thumb && thumbLen(bar, axis) > 0, `${label}: .sthumb 가 없음`);
  const e = expectedThumb(s, axis);
  approx(thumbLen(bar, axis), e.len, tol, `${label}: 썸 길이 (트랙 ${e.trackLen.toFixed(1)} × 보이는 ${e.visible} / 전체 ${e.total}, 최소 ${THUMB_MIN})`);
  approx(thumbStart(bar, axis) - e.trackStart, e.off, tol, `${label}: 썸 위치 (스크롤 ${e.pos.toFixed(1)} / 최대 ${e.max.toFixed(1)}, 이동 거리 ${e.travel.toFixed(1)})`);
  return e;
}
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// 임의 스크롤 위치 목록(양끝 포함, 고정 시드)
const scrollPositions = (max, n = 10, seed = 20261107) => {
  const rnd = mulberry32(seed);
  return [0, 1, Math.round(max / 2), max - 1, max, ...Array.from({ length: n }, () => Math.round(rnd() * max))];
};

// 줌/스크롤을 폭 맞춤·맨 위 상태로 되돌린다 (같은 앱 세션 안에서 step 간 독립성 확보)
async function resetView(page) {
  try { await page.mouse.up(); } catch { /* ignore */ }
  await press(page, 'Control+0');
  await setScroll(page, 0, 0);
  await sleep(120);
  await settleScroll(page, 200);
}

// ---- 입력 헬퍼
const cdpCache = new WeakMap();
async function cdpOf(page) {
  if (!cdpCache.has(page)) cdpCache.set(page, await page.context().newCDPSession(page));
  return cdpCache.get(page);
}

async function ctrlWheel(page, x, y, dy) {
  if (WHEEL_METHOD === 'playwright') {
    await page.mouse.move(x, y);
    await page.keyboard.down('Control');
    try { await page.mouse.wheel(0, dy); } finally { await page.keyboard.up('Control'); }
  } else if (WHEEL_METHOD === 'cdp') {
    const cdp = await cdpOf(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, modifiers: 2 });
  } else {
    await page.evaluate(([cx, cy, d]) => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: d, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    }, [x, y, dy]);
  }
  await sleep(40);
}

const installLog = (page) =>
  page.evaluate(() => {
    if (window.__ev) { window.__ev.length = 0; return; }
    window.__ev = [];
    for (const t of ['wheel', 'mousedown', 'mouseup']) {
      window.addEventListener(t, (e) => window.__ev.push({ t, b: e.button, ctrl: e.ctrlKey, dy: e.deltaY, mode: e.deltaMode, trusted: e.isTrusted }), true);
    }
  });

async function cdpSide(page, which, x, y) {
  const cdp = await cdpOf(page);
  const button = which === 'back' ? 'back' : 'forward';
  const bit = which === 'back' ? 8 : 16;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: bit, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
}

const appCommand = (app, cmd) =>
  app.evaluate(({ BrowserWindow }, c) => {
    BrowserWindow.getAllWindows()[0].emit('app-command', {}, c);
  }, cmd);

const isFullScreen = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
const setFullScreen = (app, v) => app.evaluate(({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0].setFullScreen(f), v);
const winTitle = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());

// 창이 처음 뜬 바깥 크기(launchApp 이 기록). 새 step 들이 창 크기를 바꾼 뒤 되돌릴 때 쓴다.
const initSizes = new WeakMap();
async function restoreSize(app, page) {
  const sz = initSizes.get(app);
  if (sz) return resizeTo(app, page, sz[0], sz[1]);
  return snap(page);
}

async function resizeTo(app, page, w, h) {
  await app.evaluate(({ BrowserWindow }, [a, b]) => BrowserWindow.getAllWindows()[0].setSize(a, b), [w, h]);
  await assertOnSecondary(app, `resizeTo ${w}x${h}`);
  await poll(async () => {
    const [cw, ch] = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
    return Math.abs(cw - w) <= 2 && Math.abs(ch - h) <= 2;
  }, { timeout: 6000, desc: `창 크기 ${w}x${h} 적용` });
  await sleep(350);
  return snap(page);
}

// 뷰포트 맨 위에 보이는 원본 이미지 y (표시 너비/원본 너비로 배율을 구해 data-scale 의 toFixed(4) 반올림 오차를 피함)
const topY = (s, ref = REF) => s.scrollTop / (s.strip.width / ref);

// page.evaluate 로 직렬화되므로 외부 변수를 참조하지 않는다. ms>0 이면 그만큼 기다린 뒤 읽는다.
function layoutKeyFn(ms) {
  const compute = () => {
    const s = document.getElementById('scroller');
    const i = document.getElementById('strip');
    return [innerWidth, innerHeight, s.clientWidth, s.clientHeight, s.scrollWidth, s.scrollHeight, s.scrollTop, s.scrollLeft, i.getBoundingClientRect().width].join(',');
  };
  return ms ? new Promise((r) => setTimeout(() => r(compute()), ms)) : compute();
}

// 레이아웃(창·스크롤러·이미지 크기와 스크롤 위치)이 quiet ms 동안 변하지 않을 때까지 대기
async function settleLayout(page, quiet = 400, timeout = 10000) {
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const key = await page.evaluate(layoutKeyFn, 0);
    if (key !== last) { last = key; since = Date.now(); }
    if (Date.now() - since >= quiet) return last;
    if (Date.now() - t0 > timeout) throw new Error(`layout did not settle (${last})`);
    await sleep(40);
  }
}

const winState = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { fs: w.isFullScreen(), max: w.isMaximized(), size: w.getSize(), content: w.getContentSize() };
  });
const setMaximized = (app, v) =>
  app.evaluate(({ BrowserWindow }, m) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (m) w.maximize(); else w.unmaximize();
  }, v);
const setSizeNow = (app, w, h) => app.evaluate(({ BrowserWindow }, [a, b]) => BrowserWindow.getAllWindows()[0].setSize(a, b), [w, h]);

// resizeTo 보다 빠른 리사이즈: 창 크기가 렌더러 innerWidth/Height 에 반영되고 레이아웃이 2회 연속 같을 때까지 폴링
async function resizeSync(app, page, w, h, timeout = 2500) {
  await setSizeNow(app, w, h);
  await assertOnSecondary(app, `resize ${w}x${h}`);
  const t0 = Date.now();
  let prev = null;
  let s = null;
  for (;;) {
    const cs = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
    const key = await page.evaluate(layoutKeyFn, 50);
    const [iw, ih] = key.split(',').map(Number);
    const matched = Math.abs(iw - cs[0]) <= 1 && Math.abs(ih - cs[1]) <= 1;
    if (matched && key === prev) {
      s = await snap(page);
      return { snap: s, unstable: false };
    }
    prev = key;
    if (Date.now() - t0 > timeout) {
      s = await snap(page);
      return { snap: s, unstable: true, matched };
    }
  }
}

async function shot(page, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const p = path.join(ARTIFACT_DIR, name);
  await page.screenshot({ path: p });
  artifacts.push(p);
  return p;
}

// ---- 줌 고정점
// 이어보기에서는 #strip 전체가 하나의 "이미지"처럼 확대·축소된다(모든 장이 같은 표시 폭). 픽스처는 장 폭이 모두 REF 라서 strip 좌표 = 원본 좌표.
function anchorAt(s, cx, cy) {
  const sc = s.strip.width / REF;
  return {
    u: (cx - s.strip.left) / sc,
    v: (cy - s.strip.top) / sc,
  };
}

// 이상적인 고정 시 스크롤 위치가 [1, max-1] 안에 들어오는 축만 검사 (스크롤 한계에 막히는 축은 물리적으로 고정 불가)
function feasibleAxes(prev, cur, cx, cy) {
  const ax = cx - cur.sr.left;
  const ay = cy - cur.sr.top;
  const idealLeft = (ax + prev.scrollLeft) * (cur.strip.width / prev.strip.width) - ax;
  const idealTop = (ay + prev.scrollTop) * (cur.strip.height / prev.strip.height) - ay;
  return {
    x: prev.strip.width >= prev.clientWidth - 0.5 && cur.strip.width > cur.clientWidth + 0.5 && idealLeft >= 1 && idealLeft <= cur.scrollWidth - cur.clientWidth - 1,
    y: idealTop >= 1 && idealTop <= cur.scrollHeight - cur.clientHeight - 1,
  };
}

function checkAnchor(prev, cur, cx, cy, label, { allowX = true } = {}) {
  const a = anchorAt(prev, cx, cy);
  const b = anchorAt(cur, cx, cy);
  const scale = cur.strip.width / REF;
  const ex = Math.abs(b.u - a.u) * scale;
  const ey = Math.abs(b.v - a.v) * scale;
  const f = feasibleAxes(prev, cur, cx, cy);
  const checked = [];
  if (allowX && f.x) { checked.push('x'); stats.anchorMax = Math.max(stats.anchorMax, ex); assert.ok(ex <= ANCHOR_TOL, `${label}: X 고정점 오차 ${ex.toFixed(2)}px > ${ANCHOR_TOL}px`); }
  if (f.y) { checked.push('y'); stats.anchorMax = Math.max(stats.anchorMax, ey); assert.ok(ey <= ANCHOR_TOL, `${label}: Y 고정점 오차 ${ey.toFixed(2)}px > ${ANCHOR_TOL}px`); }
  stats.anchorChecked += checked.length;
  stats.anchorSkipped += (allowX ? 2 : 1) - checked.length;
  return { ex, ey, checked };
}

// ---- 스크린샷 픽셀 검증
function decodePng(buf) {
  let pos = 8;
  let w; let h; let depth; let ct; let interlace;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (ct !== 2 && ct !== 6) || interlace) throw new Error(`지원하지 않는 스크린샷 PNG 형식 depth=${depth} ct=${ct} interlace=${interlace}`);
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const ro = y * (stride + 1) + 1;
    const oo = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[oo + x - bpp] : 0;
      const b = y > 0 ? out[oo - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[oo - stride + x - bpp] : 0;
      const cur = raw[ro + x];
      let v;
      switch (ft) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        default: {
          const p = a + b - c;
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      }
      out[oo + x] = v & 255;
    }
  }
  return { w, h, get: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2]]; } };
}

// 화면의 현재 위치에서 색 띠(band)를 골라 스크린샷 픽셀과 매니페스트 색을 비교. 선택된 띠 번호 반환.
// entries: 장 인덱스 → 매니페스트 항목 배열(또는 단일 항목 = 0번 장). 뷰포트의 샘플 위치가 걸친 장을 찾아 그 장의 띠 색과 비교한다.
// 반환: 선택된 띠 번호 k (장 번호는 checkBand.lastPage 에도 기록)
async function checkBand(page, entries, label, fracs = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
  const list = Array.isArray(entries) ? entries : [entries];
  const s = await snap(page);
  const lo = Math.max(s.strip.left, s.sr.left);
  const hi = Math.min(s.strip.left + s.strip.width, s.sr.left + s.clientWidth);
  const sx = lo + (hi - lo) * 0.75;
  let chosen = null;
  for (const f of fracs) {
    const sy = s.sr.top + s.clientHeight * f;
    const pg = s.pages.find((p) => sy >= p.top && sy < p.top + p.height);
    const entry = pg && list[pg.i];
    if (!entry) continue;
    const scaleX = s.strip.width / entry.w;
    const scaleY = pg.height / entry.h;
    const u = (sx - s.strip.left) / scaleX;
    const v = (sy - pg.top) / scaleY;
    const k = Math.floor(v / entry.band);
    if (k < 0 || k >= entry.colors.length) continue;
    const off = v - k * entry.band;
    const len = Math.min(entry.band, entry.h - k * entry.band);
    const stripe = entry.stripe || 0;
    if (stripe && (v < stripe + 2 || v > entry.h - stripe - 2)) continue;
    if ((u >= 60 || off >= 40) && off * scaleY >= 3 && (len - off) * scaleY >= 3) { chosen = { sy, k, pg, entry }; break; }
  }
  if (!chosen) throw new Error(`${label}: 픽셀 샘플 위치를 찾지 못함 ${brief(s)}`);
  const shotPng = decodePng(await page.screenshot());
  const f = shotPng.w / s.innerW;
  const px = shotPng.get(Math.round(sx * f), Math.round(chosen.sy * f));
  const exp = chosen.entry.colors[chosen.k];
  const diff = Math.max(...px.map((c, i) => Math.abs(c - exp[i])));
  assert.ok(diff <= PIXEL_TOL, `${label}: 장 ${chosen.pg.i} 띠 ${chosen.k} 픽셀 불일치 actual=${px} expected=${exp} (허용 ±${PIXEL_TOL})`);
  checkBand.lastPage = chosen.pg.i;
  return chosen.k;
}
checkBand.lastPage = -1;

// ---- 프로세스 확인
function psLines(script) {
  const init = "$u=[System.Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=$u;$OutputEncoding=$u;";
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', init + script], { encoding: 'utf8' });
  return (r.stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function leftoverElectron() {
  const base = path.basename(TMP);
  const ids = [...trackedPids].join(',');
  return psLines(
    `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*${base}*' -or @(${ids}) -contains $_.ProcessId } | ForEach-Object { [string]$_.ProcessId }`
  );
}

function spawnSecond(arg, userData) {
  return new Promise((resolve) => {
    const child = spawn(ELECTRON_EXE, ['.', arg], { cwd: ROOT, env: baseEnv(userData), stdio: 'ignore', windowsHide: true });
    trackedPids.add(child.pid);
    let timedOut = false;
    const t0 = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    }, 20000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, ms: Date.now() - t0 });
    });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, error: String(e), timedOut }); });
  });
}

// ---- 창 정보(main) / 다른 파일 열기
const winInfo = (app) =>
  app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const b = w.getBounds();
    const d = screen.getDisplayMatching(b);
    return {
      content: w.getContentSize(), size: w.getSize(), bounds: b, visible: w.isVisible(),
      workArea: d.workArea, displayScale: d.scaleFactor, onPrimary: d.id === screen.getPrimaryDisplay().id,
      fs: w.isFullScreen(), max: w.isMaximized(),
    };
  });

// main 이 두 번째 인스턴스/Ctrl+O 결과를 렌더러에 보내는 것과 같은 경로('viewer:open')로 다른 파일/폴더를 연다.
async function openViaMain(app, page, target) {
  const st = await page.evaluate((p) => window.longroll.openPath(p), target);
  assert.ok(st && !st.error, `openPath 오류: ${JSON.stringify(st && { error: st.error, path: st.path })}`);
  await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('viewer:open', state), st);
  return st;
}

// ---- 장 경계 픽셀 검사 (STR-02)
// 경계(장 k 와 k+1 사이) 근처의 세로 한 줄을 스크린샷으로 읽는다. 장 k 의 맨 아래 STRIPE 행(노랑)과 장 k+1 의 맨 위 STRIPE 행(흰색)이
// 틈(배경색 행)·겹침 없이 맞닿는지, 경계 위치가 DOM 과 일치하는지 검사한다. exact=true 면 배율 1.0·DPR 1 에서 행 단위로 정확히 비교한다.
const nearColor = (px, c, tol = PIXEL_TOL) => Math.max(...px.map((v, i) => Math.abs(v - c[i]))) <= tol;
async function scanBoundary(page, k, { exact = false, center = true } = {}) {
  let s = await snap(page);
  if (center) {
    const target = Math.round(s.pages[k + 1].y - s.clientHeight / 2);
    await setScroll(page, Math.max(0, Math.min(target, maxTopOf(s))), null);
    await sleep(120);
    await settleLayout(page, 250);
    s = await snap(page);
  }
  const pg = s.pages[k + 1];
  const Y = pg.top;
  const sc = stripScale(s);
  const lo = Math.max(s.strip.left, s.sr.left);
  const hi = Math.min(s.strip.left + s.strip.width, s.sr.left + s.clientWidth);
  const sx = lo + (hi - lo) * 0.75;
  const win = Math.ceil(2 * STRIPE * sc) + 2;
  const y0 = Math.max(Math.ceil(s.sr.top), Math.floor(Y - win));
  const y1 = Math.min(Math.floor(s.sr.top + s.clientHeight), Math.ceil(Y + win));
  assert.ok(y1 - y0 >= 4 && Y > y0 && Y < y1, `경계 y=${Y.toFixed(1)} 가 화면 밖 (clip ${y0}..${y1})`);
  const png = decodePng(await page.screenshot({ clip: { x: Math.floor(sx), y: y0, width: 4, height: y1 - y0 } }));
  const f = png.w / 4;
  const cls = [];
  for (let r = 0; r < png.h; r++) {
    const px = png.get(1, r);
    cls.push(nearColor(px, STRIPE_TOP) ? 'W' : nearColor(px, STRIPE_BOT) ? 'Y' : 'o');
  }
  const t = cls.indexOf('W');
  assert.ok(t > 0, `경계 ${k}→${k + 1}: 흰 띠(장 ${k + 1} 맨 위)를 찾지 못함 [${cls.join('')}]`);
  let nY = 0;
  while (t - 1 - nY >= 0 && cls[t - 1 - nY] === 'Y') nY++;
  let nW = 0;
  while (t + nW < cls.length && cls[t + nW] === 'W') nW++;
  const lastY = cls.lastIndexOf('Y', t - 1);
  const gapRows = lastY >= 0 ? t - 1 - lastY : t;
  const B = (Y - y0) * f;
  const want = STRIPE * sc * f;
  const info = `경계 ${k}→${k + 1}: 흰 띠 시작 행 ${t}, DOM 경계 행 ${B.toFixed(2)}, 노랑 ${nY}행/흰 ${nW}행(기대 ${want.toFixed(1)}), 사이 틈 ${gapRows}행, 배율 ${sc.toFixed(4)}×DPR ${f}`;
  assert.equal(gapRows, 0, `${info} — 장 사이에 틈(배경색 행)이 있음 [${cls.join('')}]`);
  assert.ok(nY >= 1, `${info} — 노랑 띠가 없음`);
  const tolRows = exact ? 0 : 2.5;
  const avail = (y1 - y0) * f;
  const wantY = Math.min(want, B);
  const wantW = Math.min(want, avail - B);
  assert.ok(Math.abs(nY - wantY) <= Math.max(tolRows, 0.5) + (exact ? 0 : 0), `${info} — 장 ${k} 아래 띠 높이 불일치(겹침/잘림 의심)`);
  assert.ok(Math.abs(nW - wantW) <= Math.max(tolRows, 0.5), `${info} — 장 ${k + 1} 위 띠 높이 불일치(겹침/잘림 의심)`);
  assert.ok(Math.abs(t - B) <= (exact ? 0.01 : 1.5), `${info} — 경계 위치가 DOM 과 다름`);
  return { t, B, nY, nW, f, sc, gapRows, info };
}

// 장 사이에 틈·겹침이 없다: 첫 장 y=0, 각 장의 bottom = 다음 장의 top, 마지막 장 bottom = #strip 높이, 모든 장 폭 = #strip 폭
function assertContiguous(s, label, tol = 0.6) {
  assert.ok(s.pages.length > 0, `${label}: 장이 없음`);
  approx(s.pages[0].y, 0, tol, `${label}: 첫 장 top`);
  for (let i = 0; i + 1 < s.pages.length; i++) {
    approx(s.pages[i + 1].y, s.pages[i].y + s.pages[i].height, tol, `${label}: 장 ${i} bottom = 장 ${i + 1} top (틈/겹침)`);
  }
  const last = s.pages[s.pages.length - 1];
  approx(s.strip.height, last.y + last.height, tol * 2, `${label}: #strip 높이 = 마지막 장 bottom`);
  for (const p of s.pages) approx(p.width, s.strip.width, 0.5, `${label}: 장 ${p.i} 폭 = #strip 폭`);
}

// 폭 맞춤(레터박스) 레이아웃: #strip 폭 = clientWidth/1.1, 가운데 정렬(좌우 여백 같음), scale = strip 폭/기준 폭, 가로 스크롤 없음
function assertFitLayout(s, label, ref = REF) {
  assert.equal(s.fit, true, `${label}: fit`);
  approx(s.strip.width, s.clientWidth / LB, 1, `${label}: #strip 폭 = clientWidth/${LB}`);
  approx(s.scale, s.strip.width / ref, 1e-4 + 0.02 / ref, `${label}: scale = #strip 폭/기준 폭(${ref})`);
  const l = s.strip.left - s.sr.left;
  const r = s.sr.left + s.clientWidth - (s.strip.left + s.strip.width);
  approx(l, r, 1, `${label}: 좌우 레터박스 여백 차`);
  approx(l, (s.clientWidth - s.strip.width) / 2, 1, `${label}: 좌 여백 = (clientWidth-strip)/2`);
  assert.ok(s.scrollWidth <= s.clientWidth, `${label}: 가로 스크롤 발생 scrollWidth=${s.scrollWidth} clientWidth=${s.clientWidth}`);
  assert.equal(s.offsetHeight - s.clientHeight, 0, `${label}: 가로 스크롤바 두께=${s.offsetHeight - s.clientHeight}`);
  assert.equal(s.offsetWidth - s.clientWidth, 0, `${label}: 세로 스크롤바 거터=${s.offsetWidth - s.clientWidth}`);
  if (s.hbar) assert.ok(!barVisible(s.hbar), `${label}: 폭 맞춤인데 #hbar 가 보임`);
  assert.match(s.zoomText, /맞춤$/, `${label}: 라벨`);
}

// ---------------------------------------------------------------- suite/step 정의
const SUITES = [];
function suite(name, arg, steps, opts = {}) {
  SUITES.push({ name, arg, steps, noApp: !!opts.noApp, windowless: !!opts.windowless });
}
const step = (ids, title, tol, fn, timeout = 60000) => ({ ids: [].concat(ids), title, tol, fn, timeout });
const baseId = (id) => id.replace(/\(.*$/, '');

// =============================================================== SUITE: 단독 폴더 인자 (OPN-02, NAV-03) — sx/basic/ep: 형제 이미지 폴더가 없는 폴더 = 회차 1개
suite('basic-folder', () => F.basicDir, [
  step('OPN-02', '단독 폴더(형제 이미지 폴더 없음)를 인자로 열면 그 폴더가 회차 1개: #comic = 부모 폴더명, #name = 폴더명, (1/1), 첫 장이 맨 위, 폴더의 모든 이미지가 띠로 구성', '정확 일치', async (c) => {
    const s = await snap(c.page);
    assertEpisodeBar(s, { comic: 'basic', name: 'ep', n: 1, N: 1, pages: 4 }, '단독 폴더');
    assert.equal(s.index, 0);
    assert.equal(s.pageText, '1/4장');
    assert.equal(s.scrollTop, 0);
    c.obs(`state=${s.state}, #comic=${s.comic}, #name=${s.name}, #index=${s.indexText}, #page=${s.pageText}, index=${s.index}, count=${s.count}, .page 수=${s.pages.length}, scrollTop=${s.scrollTop}, title="${s.title}"`);
  }),
  step('NAV-03', '장 자연 정렬(1→2→10→UP.PNG, note.txt 제외): .page DOM 순서 = 정렬 순서 = 디스크 이미지 수, 장마다 맨 위로 스크롤하면 모두 로드되고 #page 가 i/4장', '정확 일치', async (c) => {
    const expectCount = fs.readdirSync(F.basicDir, { withFileTypes: true }).filter((d) => d.isFile() && IMAGE_EXTS.has(path.extname(d.name).toLowerCase())).length;
    const seen = await scanPages(c.page);
    const s = await snap(c.page);
    assert.deepEqual(seen.map((x) => x.name), ['1.png', '2.png', '10.png', 'UP.PNG']);
    assert.ok(!seen.some((x) => x.name === 'note.txt'));
    assert.equal(s.count, expectCount, `count=${s.count} 이미지 수=${expectCount}`);
    assert.equal(s.pages.length, expectCount, '.page 수');
    assert.deepEqual(pageNames(s), ['1.png', '2.png', '10.png', 'UP.PNG'], '#strip 의 DOM 순서가 자연 정렬 순서');
    for (const x of seen) {
      assert.ok(x.natW === 800 && !x.broken, `${x.name} 로드 ${x.natW}`);
      assert.equal(x.pageText, `${x.i + 1}/4장`, `${x.name} 맨 위에서 #page`);
    }
    c.obs(`장 순서=${seen.map((x) => x.name).join(' → ')}, count=${s.count} (디스크 이미지 수 ${expectCount}), .page 수=${s.pages.length}(DOM 순서 동일), note.txt 제외, 장 맨 위 #page=${seen.map((x) => x.pageText).join('/')}`);
  }),
]);

// =============================================================== SUITE: 회차 이동 (EP-*, DSP-01~03) — lib/comic: 1화(3장)·2화(2장)·10화(5장), 표지·자료·빈폴더는 회차가 아님
function ensureNoToast(page) { return waitToastHidden(page); }
const homeEpisode = async (page, i = 0) => {
  const s = await gotoEpisode(page, i);
  await resetView(page);
  return s;
};
const EP_COUNT = COMIC_EPS.length;

suite('episodes', () => F.comicDir, [
  step('EP-01', '만화 폴더를 열면 첫 회차(1화)가 열리고 상단 바에 만화명·회차명·(1/3), .page 수 = 1화의 이미지 수(자료·빈폴더·cover.png·txt 제외), 창 제목·창 내부 폭 round(800×1.1)=880', '정확 일치', async (c) => {
    const { page, app } = c;
    const s = await waitReady(page, '1화');
    assertEpisodeBar(s, { comic: 'comic', name: '1화', n: 1, N: EP_COUNT, pages: 3 }, '만화 폴더 열기');
    assert.deepEqual(pageNames(s), COMIC_EPS[0].files);
    assert.deepEqual(pageDirs(s), ['1화']);
    assert.equal(s.index, 0);
    assert.equal(s.pageText, '1/3장');
    assert.equal(s.scrollTop, 0);
    assertContiguous(s, '1화');
    assert.equal(await winTitle(app), '1화 (1/3) - comic - Longroll');
    const w = await winInfo(app);
    assert.deepEqual(w.content, [Math.round(800 * LB), 820], '창 내부 크기 = round(기준 폭 × 1.1) × 820');
    c.obs(`#comic=${s.comic}, #name=${s.name}, #index=${s.indexText}, #page=${s.pageText}, .page ${s.pages.length}개(${pageNames(s).join(',')}), title="${s.title}", 창 내부 ${w.content.join('×')}`);
  }),
  step('DSP-01', '상단 바: #comic·#name(회차명)·#index (n/N)=회차 번호·#page 현재장/전체장·#dims·#zoom(NN% 맞춤), 스크롤하면 #page·#dims 가 현재 장으로 갱신', '정확 일치', async (c) => {
    const { page } = c;
    await homeEpisode(page, 0);
    let s = await snap(page);
    assert.equal(s.comic, 'comic');
    assert.equal(s.name, '1화');
    assert.equal(s.indexText, '(1/3)');
    assert.equal(s.pageText, '1/3장');
    assert.equal(s.dims, '800×2400');
    assert.equal(s.zoomText, `${Math.round(s.scale * 100)}% 맞춤`);
    assert.equal(s.zoomText, '100% 맞춤', '880 폭 창 + 800 폭 이미지 → 배율 1.0');
    const first = `#comic="${s.comic}" #name="${s.name}" #index="${s.indexText}" #page="${s.pageText}" #dims="${s.dims}" #zoom="${s.zoomText}"`;
    await press(page, 'Control+1');
    s = await snap(page);
    assert.equal(s.zoomText, '100%');
    await press(page, 'Control+0');
    s = await snap(page);
    assert.match(s.zoomText, /^\d+% 맞춤$/);
    await setScroll(page, s.pages[1].y + 10, 0);
    s = await waitSnap(page, (v) => v.pageText === '2/3장', '스크롤로 2번째 장');
    assert.equal(s.dims, '800×1800');
    assert.equal(s.index, 1);
    assert.equal(s.indexText, '(1/3)', '장을 스크롤해도 #index(회차 번호)는 그대로');
    assert.equal(s.name, '1화');
    await setScroll(page, s.pages[2].y + 10, 0);
    s = await waitSnap(page, (v) => v.pageText === '3/3장', '스크롤로 3번째 장');
    assert.equal(s.dims, '800×1200');
    assert.equal(s.index, 2);
    c.obs(`${first}; Ctrl+1 후 zoom="100%"; 스크롤로 2번째 장 → #page=2/3장 #dims=800×1800, 3번째 → 3/3장 #dims=800×1200 (#index 는 (1/3) 유지)`);
  }),
  step('DSP-02', 'document.title·BrowserWindow 제목 = "회차명 (n/N) - 만화명 - Longroll", 회차 이동 시 갱신(장 스크롤로는 안 바뀜)', '정확 일치', async (c) => {
    const { page, app } = c;
    await homeEpisode(page, 0);
    let s = await snap(page);
    assert.equal(s.title, '1화 (1/3) - comic - Longroll');
    assert.equal(await winTitle(app), '1화 (1/3) - comic - Longroll');
    await setScroll(page, s.pages[2].y + 5, 0);
    await sleep(200);
    assert.equal((await snap(page)).title, '1화 (1/3) - comic - Longroll', '장 스크롤로 제목이 바뀜');
    await press(page, 'ArrowRight');
    s = await waitReady(page, '2화');
    assert.equal(s.title, '2화 (2/3) - comic - Longroll');
    await poll(async () => (await winTitle(app)) === '2화 (2/3) - comic - Longroll', { timeout: 4000, desc: 'BrowserWindow 제목 갱신' });
    await press(page, 'ArrowRight');
    s = await waitReady(page, '10화');
    assert.equal(s.title, '10화 (3/3) - comic - Longroll');
    await poll(async () => (await winTitle(app)) === '10화 (3/3) - comic - Longroll', { timeout: 4000, desc: 'BrowserWindow 제목 갱신(10화)' });
    c.obs(`document.title="${s.title}", BrowserWindow.getTitle()="${await winTitle(app)}" (1화 → 2화 → 10화 순으로 갱신 확인)`);
  }),
  step('DSP-03', '다크 배경 body=#121212', 'rgb 정확 일치 + 스크린샷 픽셀 휘도<60', async (c) => {
    const { page } = c;
    await homeEpisode(page, 0);
    const bg = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      html: getComputedStyle(document.documentElement).backgroundColor,
      top: getComputedStyle(document.getElementById('topbar')).backgroundColor,
    }));
    assert.equal(bg.body, 'rgb(18, 18, 18)');
    assert.equal(bg.html, 'rgb(18, 18, 18)');
    const s = await snap(page);
    const shotPng = decodePng(await page.screenshot());
    const f = shotPng.w / s.innerW;
    const topPx = shotPng.get(Math.round((s.innerW - 200) * f), Math.round(10 * f));
    // 폭 맞춤 왼쪽 레터박스(거터가 없으므로 창 왼쪽 가장자리 + 5px, 상단 바 아래 200px)
    const lbPx = shotPng.get(Math.round((s.sr.left + 5) * f), Math.round((s.sr.top + 200) * f));
    const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    assert.ok(lum(topPx) < 60, `상단 바 픽셀 ${topPx}`);
    assert.ok(lum(lbPx) < 60, `레터박스 픽셀 ${lbPx}`);
    c.obs(`body=${bg.body}, html=${bg.html}, #topbar=${bg.top}, 스크린샷 픽셀(상단 바)=${topPx}, (왼쪽 레터박스)=${lbPx}`);
  }),
  step('EP-04', '회차 자연 정렬: 1화 → 2화 → 10화(자료·빈폴더·cover.png 제외), 각 단계 #index (n/3)·body.dataset.episode/episodes', '정확 일치', async (c) => {
    const { page } = c;
    await homeEpisode(page, 0);
    const names = [];
    let s = await snap(page);
    names.push(`${s.name}${s.indexText}`);
    for (let i = 1; i < EP_COUNT; i++) {
      const from = s.episode;
      await press(page, 'ArrowRight');
      s = await waitSnap(page, (v) => v.state === 'ready' && v.episode === from + 1, `→ 로 회차 ${i}`);
      assert.equal(s.indexText, `(${i + 1}/${EP_COUNT})`);
      assert.equal(s.episodes, EP_COUNT);
      names.push(`${s.name}${s.indexText}`);
    }
    assert.deepEqual(names, ['1화(1/3)', '2화(2/3)', '10화(3/3)'], '자연 정렬 순서(10화 가 2화 뒤)');
    c.obs(`→ 순회: ${names.join(' → ')} (회차 ${EP_COUNT}개, 자료/빈폴더/cover.png 는 회차가 아님)`);
  }),
  step('EP-02', '→/← 로 회차 이동: #name·(n/N)·#page 갱신, .page 가 그 회차의 이미지로 교체(이전 회차 이미지는 사라짐), 장 중간에서 눌러도 scrollTop 0, 창 크기 불변', '정확 일치, scrollTop ±1.5', async (c) => {
    const { page, app } = c;
    await homeEpisode(page, 0);
    const w0 = (await winInfo(app)).content;
    let s = await snap(page);
    await setScroll(page, s.pages[1].y + 500, 0);
    await sleep(150);
    assert.ok((await snap(page)).scrollTop > 1000, '사전조건: 1화 장 중간으로 스크롤');
    await press(page, 'ArrowRight');
    s = await waitReady(page, '2화');
    assertEpisodeBar(s, { comic: 'comic', name: '2화', n: 2, N: EP_COUNT, pages: 2 }, '→ 1회');
    assert.deepEqual(pageNames(s), COMIC_EPS[1].files);
    assert.deepEqual(pageDirs(s), ['2화'], '이전 회차(1화) 이미지가 남아 있음');
    assert.equal(s.index, 0);
    assert.equal(s.pageText, '1/2장');
    approx(s.scrollTop, 0, SCROLL_TOL, '→ 후 맨 위');
    assert.deepEqual((await winInfo(app)).content, w0, '회차 이동은 창 크기를 바꾸지 않음');
    assertContiguous(s, '2화');
    await setScroll(page, 2500, 0);
    await sleep(150);
    await press(page, 'ArrowRight');
    s = await waitReady(page, '10화');
    assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: EP_COUNT, pages: 5 }, '→ 2회');
    assert.deepEqual(pageNames(s), COMIC_EPS[2].files);
    assert.deepEqual(pageDirs(s), ['10화']);
    approx(s.scrollTop, 0, SCROLL_TOL, '→ 2회 후 맨 위(2화 중간에서 이동)');
    await setScroll(page, 1500, 0);
    await sleep(150);
    await press(page, 'ArrowLeft');
    s = await waitReady(page, '2화');
    assertEpisodeBar(s, { comic: 'comic', name: '2화', n: 2, N: EP_COUNT, pages: 2 }, '← 1회');
    assert.deepEqual(pageDirs(s), ['2화']);
    approx(s.scrollTop, 0, SCROLL_TOL, '← 후 맨 위(10화 중간에서 이동)');
    await press(page, 'ArrowLeft');
    s = await waitReady(page, '1화');
    assertEpisodeBar(s, { comic: 'comic', name: '1화', n: 1, N: EP_COUNT, pages: 3 }, '← 2회');
    assert.deepEqual(pageNames(s), COMIC_EPS[0].files);
    approx(s.scrollTop, 0, SCROLL_TOL);
    assert.deepEqual((await winInfo(app)).content, w0, '창 크기 불변(왕복 후)');
    c.obs(`1화(장 중간) → 2화(.page 2, src 폴더 ${pageDirs(s).join(',')}) scrollTop 0 → 10화(.page 5) scrollTop 0 → ← 2화 → ← 1화(.page 3); 창 내부 ${w0.join('×')} 불변`);
  }),
  step('EP-14', '←/→ 는 더 이상 장 단위가 아님(장 중간에서 →=다음 회차, 첫 회차 ← 는 토스트만이고 이전 "장"으로 안 감), 한 회차의 모든 장이 틈 없이 이어 보임(모든 회차)', '정확 일치, 연속성 ±0.6px, 높이 ±1.5px', async (c) => {
    const { page } = c;
    await homeEpisode(page, 0);
    let s = await snap(page);
    await setScroll(page, s.pages[1].y + 100, 0);
    s = await waitSnap(page, (v) => v.index === 1, '1화 2번째 장으로 스크롤');
    await ensureNoToast(page);
    const before = s;
    await press(page, 'ArrowLeft');
    s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_FIRST, '첫 회차에서 ← 토스트');
    assert.equal(s.index, 1, '← 가 이전 장으로 이동함');
    assert.equal(s.pageText, '2/3장');
    approx(s.scrollTop, before.scrollTop, 1, '← 로 스크롤이 움직임(장 이동)');
    const leftTop = s.scrollTop;
    await press(page, 'ArrowRight');
    s = await waitReady(page, '2화');
    assert.equal(s.episode, 1, '1화 2번째 장에서 → 는 다음 회차(2화)');
    assert.equal(s.index, 0);
    approx(s.scrollTop, 0, SCROLL_TOL);
    assert.deepEqual(pageDirs(s), ['2화']);
    const rows = [];
    for (let e = 0; e < EP_COUNT; e++) {
      s = await homeEpisode(page, e);
      s = await snap(page);
      const sc = stripScale(s);
      assert.deepEqual(pageNames(s), COMIC_EPS[e].files, `${COMIC_EPS[e].name}: 모든 장이 이어 보임`);
      assertContiguous(s, `${COMIC_EPS[e].name}`);
      COMIC_EPS[e].h.forEach((h, i) => approx(s.pages[i].height, h * sc, 1.5, `${COMIC_EPS[e].name} 장 ${i} 높이`));
      approx(s.scrollHeight, COMIC_EPS[e].h.reduce((a, b) => a + b, 0) * sc, 1.5, `${COMIC_EPS[e].name}: scrollHeight = 장 높이 합`);
      rows.push(`${COMIC_EPS[e].name}: ${s.pages.length}장 scrollHeight=${s.scrollHeight}`);
    }
    c.obs(`1화 2번째 장에서 ← → 토스트·scrollTop ${before.scrollTop}→${leftTop}(불변), → 는 2화 맨 위; 모든 회차 연속 레이아웃: ${rows.join(' / ')}`);
  }),
  step('EP-03', '첫 회차에서 ← / 마지막 회차에서 → : 토스트 "첫 번째 회차입니다"/"마지막 회차입니다", 상태(#name·scrollTop·장)는 그대로', '정확 일치, scrollTop ±1', async (c) => {
    const { page } = c;
    await homeEpisode(page, 0);
    await setScroll(page, 300, 0);
    await sleep(150);
    let before = await snap(page);
    await ensureNoToast(page);
    await press(page, 'ArrowLeft');
    let s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_FIRST, '첫 회차 토스트');
    assert.equal(s.name, '1화');
    assert.equal(s.episode, 0);
    assert.equal(s.state, 'ready');
    assert.equal(s.pages.length, 3);
    approx(s.scrollTop, before.scrollTop, 1, '처음에서 ← 로 스크롤이 움직이면 안 됨');
    const t1 = `첫: toast="${s.toastText}", #name=${s.name} 불변, scrollTop ${before.scrollTop}→${s.scrollTop}`;
    await waitSnap(page, (v) => v.toastHidden, '토스트 자동 숨김(첫)', 5000);
    await homeEpisode(page, EP_COUNT - 1);
    await setScroll(page, 500, 0);
    await sleep(150);
    before = await snap(page);
    await ensureNoToast(page);
    await press(page, 'ArrowRight');
    s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '마지막 회차 토스트');
    assert.equal(s.name, '10화');
    assert.equal(s.episode, EP_COUNT - 1);
    assert.equal(s.state, 'ready');
    assert.equal(s.pages.length, 5);
    approx(s.scrollTop, before.scrollTop, 1, '끝에서 → 로 스크롤이 움직이면 안 됨');
    await waitSnap(page, (v) => v.toastHidden, '토스트 자동 숨김(끝)', 5000);
    c.obs(`${t1}; 마지막: toast="${s.toastText}", #name=${s.name} 불변, scrollTop ${before.scrollTop}→${s.scrollTop}; 각 약 2.2s 후 자동 숨김`);
  }),
  step('EP-12', '회차 이동 후 줌 유지(data-scale·fit=false·#zoom 라벨 동일), 폭 맞춤이면 맞춤 유지, 이동 시 scrollTop 0', 'scale 문자열 정확 일치, scrollTop ±1.5, 폭 맞춤 허용 오차(assertFitLayout)', async (c) => {
    const { page } = c;
    const obs = [];
    await homeEpisode(page, 0);
    for (let i = 0; i < 3; i++) await press(page, 'Control+Equal');
    await setScroll(page, 700, 200);
    await sleep(150);
    const before = await snap(page);
    assert.equal(before.fit, false);
    assert.ok(before.scrollLeft > 50, `사전 가로 스크롤 실패 left=${before.scrollLeft}`);
    for (const [key, name, idx] of [['ArrowRight', '2화', 1], ['ArrowRight', '10화', 2], ['ArrowLeft', '2화', 1]]) {
      await press(page, key);
      const s = await waitReady(page, name);
      assert.equal(s.episode, idx);
      assert.equal(s.fit, false, `${key}→${name}: 줌이 유지되어야 함(맞춤으로 리셋 금지)`);
      assert.equal(s.scaleStr, before.scaleStr, `${key}→${name}: data-scale 유지`);
      assert.equal(s.zoomText, before.zoomText, `${key}→${name}: #zoom 라벨 유지`);
      approx(s.strip.width, REF * s.scale, 1.5, `${key}→${name}: #strip 폭 = 기준 폭 × scale`);
      approx(s.scrollTop, 0, SCROLL_TOL, `${key}→${name}: 맨 위에서 시작`);
      obs.push(`${key}→${name}: scale=${s.scaleStr} fit=${s.fit} scrollTop=${s.scrollTop} scrollLeft=${s.scrollLeft}(참고)`);
    }
    await press(page, 'Control+0');
    assertFitLayout(await snap(page), '2화 Ctrl+0');
    for (const [key, name] of [['ArrowLeft', '1화'], ['ArrowRight', '2화']]) {
      await press(page, key);
      const s = await waitReady(page, name);
      assert.equal(s.fit, true, `${key}→${name}: 폭 맞춤이면 맞춤 유지`);
      assertFitLayout(s, `${key}→${name} 폭 맞춤 유지`);
      obs.push(`맞춤 상태 ${key}→${name}: fit=true scale=${s.scaleStr}`);
    }
    c.obs(`줌 상태(scale ${before.scaleStr}, "${before.zoomText}") 회차 3회 이동 모두 유지 / ${obs.join(' / ')}`);
  }),
  step('EP-13', '사이드 버튼(mouseup button 3=이전/4=다음 — 합성 + CDP 실제 입력)·main app-command 가 회차를 옮김, 120ms 중복 방지(합성 동일 틱·CDP 연속·mouseup+app-command 동시)', '정확 일치. CDP/동시 발생은 간격<90ms 일 때만 유효(최대 3~4회 재시도). app-command 는 BrowserWindow.emit 모사(실제 WM_APPCOMMAND 아님)', async (c) => {
    const { page, app } = c;
    const fire = (b) => page.evaluate((btn) => window.dispatchEvent(new MouseEvent('mouseup', { button: btn, bubbles: true, cancelable: true })), b);
    const fire2 = (b) => page.evaluate((btn) => {
      const mk = () => new MouseEvent('mouseup', { button: btn, bubbles: true, cancelable: true });
      window.dispatchEvent(mk());
      window.dispatchEvent(mk());
    }, b);
    await homeEpisode(page, 1);
    await sleep(300);
    await fire(4);
    let s = await waitReady(page, '10화');
    assert.equal(s.episode, 2, '합성 mouseup(4) → 다음 회차');
    await sleep(250);
    await fire(3);
    s = await waitReady(page, '2화');
    assert.equal(s.episode, 1, '합성 mouseup(3) → 이전 회차');
    await installLog(page);
    const { x, y } = center(s);
    await sleep(200);
    await cdpSide(page, 'forward', x, y);
    s = await waitReady(page, '10화');
    const ev = await page.evaluate(() => window.__ev.filter((e) => e.t === 'mouseup'));
    assert.deepEqual(ev.map((e) => [e.b, e.trusted]), [[4, true]], `CDP mouseup 이벤트 ${JSON.stringify(ev)}`);
    await sleep(250);
    await cdpSide(page, 'back', x, y);
    s = await waitReady(page, '2화');
    assert.equal(s.episode, 1);

    // 120ms 중복 방지: 합성 동일 틱 2회 → 1회차만
    await homeEpisode(page, 0);
    await sleep(300);
    await fire2(4);
    await sleep(500);
    assert.equal((await snap(page)).episode, 1, '합성 mouseup(4) 2회 → 1회차만 이동(episode 1)');
    await homeEpisode(page, 2);
    await sleep(300);
    await fire2(3);
    await sleep(500);
    assert.equal((await snap(page)).episode, 1, '합성 mouseup(3) 2회 → 1회차만 뒤로(episode 1)');
    await sleep(200);
    await fire(3);
    await waitReady(page, '1화');
    assert.equal((await snap(page)).episode, 0, '120ms 지난 뒤 재입력은 이동');

    let valid = false;
    let dtUsed = null;
    for (let attempt = 0; attempt < 4 && !valid; attempt++) {
      await homeEpisode(page, 0);
      await sleep(350);
      const t0 = Date.now();
      await Promise.all([cdpSide(page, 'forward', x, y), cdpSide(page, 'forward', x, y)]);
      const dt = Date.now() - t0;
      await sleep(500);
      s = await snap(page);
      if (dt < 90) {
        valid = true;
        dtUsed = dt;
        assert.equal(s.episode, 1, `CDP 연속 2회(${dt}ms) → 1회차만 이동, 실제 episode=${s.episode}`);
      }
    }
    assert.ok(valid, 'CDP 2회 입력이 90ms 안에 들어오지 못해 검증 불가');

    // app-command 단독 + mouseup 과 동시
    await homeEpisode(page, 1);
    await sleep(300);
    await appCommand(app, 'browser-forward');
    s = await waitReady(page, '10화');
    assert.equal(s.episode, 2, 'app-command browser-forward → 다음 회차');
    await sleep(250);
    await appCommand(app, 'browser-backward');
    s = await waitReady(page, '2화');
    assert.equal(s.episode, 1, 'app-command browser-backward → 이전 회차');
    let done = null;
    for (let attempt = 0; attempt < 3 && done === null; attempt++) {
      await homeEpisode(page, 0);
      await sleep(350);
      const t0 = Date.now();
      await Promise.all([fire(4), appCommand(app, 'browser-forward')]);
      const dt = Date.now() - t0;
      await sleep(500);
      s = await snap(page);
      if (dt < 90) {
        assert.equal(s.episode, 1, `mouseup+app-command(${dt}ms) → 1회차만 이동, 실제 episode=${s.episode}`);
        done = dt;
      }
    }
    assert.ok(done !== null, '동시 발생 타이밍(<90ms)을 맞추지 못해 검증 불가');
    c.obs(`합성 mouseup 4→다음·3→이전, CDP 실제(isTrusted) 4/3 OK; 합성 동일 틱 2회·CDP 연속 2회(${dtUsed}ms)·mouseup+app-command 동시(${done}ms) 모두 1회차만 이동; app-command 단독 forward/backward OK`);
  }),
  step('EP-09', '키 반복(e.repeat) 무시, 빠른 연속 입력 누적(짧은 간격 두 번 = +2)·양 끝 클램프·누적 0 은 요청 없음, 오래된 응답 폐기, go-episode IPC 클램프/edge/정수 delta', '정확 일치. 반복=Playwright keyboard.down 반복(auto-repeat 모사, e.repeat 로그로 확인), 지연 주입=ipcMain._invokeHandlers 래핑. 하위 단언(a~d)은 하나가 실패해도 나머지를 계속 실행해 모두 보고', async (c) => {
    const { page, app } = c;
    const obs = [];
    const fails = [];
    // 하위 단언 하나가 실패해도 나머지를 실행한다(변이가 의도한 하위 단언에서 잡히는지 구분하기 위함)
    const sub = async (label, fn) => {
      try {
        await fn();
      } catch (e) {
        fails.push(`${label}: ${String(e.message).split('\n')[0].slice(0, 220)}`);
        try { await page.mouse.up(); } catch { /* ignore */ }
      }
    };
    // (a) 키 반복: 첫 keydown 만 이동
    await sub('(a) 키 반복 무시', async () => {
      for (const [key, startEp, wantEp] of [['ArrowRight', 0, 1], ['ArrowLeft', 2, 1]]) {
        await homeEpisode(page, startEp);
        await sleep(300);
        await installKeyLog(page);
        await page.keyboard.down(key);
        for (let i = 0; i < 5; i++) {
          await sleep(30);
          await page.keyboard.down(key);
        }
        await page.keyboard.up(key);
        const keys = await page.evaluate((k) => window.__keys.filter((e) => e.key === k), key);
        assert.deepEqual(keys.map((k) => k.repeat), [false, true, true, true, true, true], `키 반복 모사가 repeat 플래그를 만들지 못함: ${JSON.stringify(keys)}`);
        await sleep(800);
        const s = await snap(page);
        assert.equal(s.episode, wantEp, `${key} 반복 6회(첫 입력 1 + repeat 5) → 정확히 1회차만 이동, 실제 episode=${s.episode}`);
        assert.equal(s.state, 'ready');
        obs.push(`(a) ${key} 6회(repeat 플래그 ${keys.map((k) => (k.repeat ? 'R' : 'n')).join('')}) → 회차 ${startEp}→${s.episode}`);
      }
    });
    // (b1) 빠른 연속 입력: 누적
    await sub('(b1) 20ms 간격 두 번 입력 누적', async () => {
      await homeEpisode(page, 0);
      await sleep(300);
      await press(page, 'ArrowRight');
      await sleep(20);
      await press(page, 'ArrowRight');
      await waitSnap(page, (v) => v.state === 'ready' && v.episode === 2, '짧은 간격 두 번 입력 → +2', 10000);
      await sleep(700);
      const s = await snap(page);
      assert.equal(s.episode, 2, '누적 이동 후 흔들림');
      assert.deepEqual(pageDirs(s), ['10화']);
      obs.push('(b1) → → (20ms 간격) → 회차 0→2');
    });
    await sub('(b2) 양 끝 클램프', async () => {
      await homeEpisode(page, 0);
      await sleep(300);
      for (let i = 0; i < 5; i++) await press(page, 'ArrowRight');
      await waitSnap(page, (v) => v.state === 'ready' && v.episode === 2, '→ 5회 클램프', 10000);
      await sleep(700);
      let s = await snap(page);
      assert.equal(s.episode, 2, '→ 5회는 마지막 회차에서 클램프');
      assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: EP_COUNT, pages: 5 }, '→ 5회 클램프');
      for (let i = 0; i < 5; i++) await press(page, 'ArrowLeft');
      await waitSnap(page, (v) => v.state === 'ready' && v.episode === 0, '← 5회 클램프', 10000);
      await sleep(700);
      s = await snap(page);
      assertEpisodeBar(s, { comic: 'comic', name: '1화', n: 1, N: EP_COUNT, pages: 3 }, '← 5회 클램프');
      obs.push('(b2) → 5회 → 마지막(10화), ← 5회 → 처음(1화)');
    });
    await sub('(b3) 동일 틱 → → ←', async () => {
      await homeEpisode(page, 0);
      await sleep(300);
      await page.evaluate(() => {
        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
      await waitSnap(page, (v) => v.state === 'ready' && v.episode === 1, '동일 틱 →→← → 순 이동 +1', 10000);
      await sleep(700);
      assert.equal((await snap(page)).episode, 1);
      obs.push('(b3) 동일 틱 → → ← → 회차 0→1');
    });
    // 누적 delta 가 0 이 되는 입력(+1 −1)은 요청 없이 현재 회차 유지(오류 토스트도 없음)
    await sub('(b4) 누적 0 입력', async () => {
      await homeEpisode(page, 1);
      await sleep(300);
      await ensureNoToast(page);
      await page.evaluate(() => {
        for (const key of ['ArrowRight', 'ArrowLeft']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
      await sleep(900);
      const s = await snap(page);
      assert.equal(s.episode, 1, '+1 −1 입력 후 회차가 바뀜');
      assert.equal(s.state, 'ready');
      assert.ok(s.toastHidden || !s.toastText.includes('불러올 수 없'), `+1 −1 입력이 오류 토스트를 띄움: ${s.toastText}`);
      obs.push('(b4) 동일 틱 → ← (누적 0) → 현재 회차 유지, 오류 토스트 없음');
    });
    // (c) 오래된 응답 폐기: 첫 go-episode 응답을 700ms 지연
    await sub('(c) 오래된 응답 폐기', async () => {
      await homeEpisode(page, 0);
      await sleep(300);
      await hookGoEpisode(app, [700]);
      try {
        await press(page, 'ArrowRight');
        await sleep(80);
        await press(page, 'ArrowRight');
        await waitSnap(page, (v) => v.state === 'ready' && v.episode === 2, '지연 응답에도 최종 회차 2', 10000);
        await sleep(1500);
        const s = await snap(page);
        assert.equal(s.episode, 2, '늦게 도착한 오래된 응답이 최종 상태를 덮어씀');
        assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: EP_COUNT, pages: 5 }, '오래된 응답 폐기');
        assert.deepEqual(pageDirs(s), ['10화']);
        const log = await goLog(app);
        assert.ok(log.length >= 1, 'go-episode IPC 호출이 기록되지 않음(시험 이음새 미작동)');
        for (const l of log) {
          assert.equal(typeof l.args[0], 'string', `fromPath 는 문자열: ${JSON.stringify(l.args)}`);
          assert.ok(Number.isInteger(l.args[1]), `delta 는 정수: ${JSON.stringify(l.args)}`);
        }
        obs.push(`(c) 첫 응답 700ms 지연, → → 입력: go-episode 호출 ${log.length}회(delta ${log.map((l) => l.args[1]).join(',')}) 후 최종 회차 2 유지`);
      } finally {
        await unhookGoEpisode(app);
      }
    });
    // (d) IPC 계약: 클램프 / edge / 정수 delta (렌더러·UI 와 무관한 순수 계산)
    await sub('(d) go-episode IPC 계약', async () => {
      const d0 = F.ep1Dir;
      const lastDir = F.ep10Dir;
      const mid = await callIpc(app, 'viewer:go-episode', d0, 1);
      assert.ok(mid.ok, `go-episode 호출 실패: ${JSON.stringify(mid)}`);
      assert.equal(mid.r.error, undefined, `go-episode(+1) 오류 ${JSON.stringify(mid.r)}`);
      assert.equal(mid.r.episode, 1);
      assert.deepEqual(mid.r.files, COMIC_EPS[1].files);
      assert.equal(mid.r.comic, 'comic');
      assert.deepEqual(mid.r.episodes, COMIC_EPS.map((e) => e.name));
      assert.equal(path.basename(mid.r.dir), '2화');
      for (const k of ['comic', 'episodes', 'episode', 'dir', 'files', 'index', 'refWidth', 'letterbox']) assert.ok(mid.r.keys.includes(k), `상태 객체에 ${k} 가 없음: ${mid.r.keys}`);
      assert.equal(mid.r.refWidth, 800);
      const first = await callIpc(app, 'viewer:go-episode', d0, -1);
      assert.equal(first.r && first.r.edge, 'first', `첫 회차에서 -1 → edge:first, 실제 ${JSON.stringify(first)}`);
      const last = await callIpc(app, 'viewer:go-episode', lastDir, 1);
      assert.equal(last.r && last.r.edge, 'last', `마지막 회차에서 +1 → edge:last, 실제 ${JSON.stringify(last)}`);
      const big = await callIpc(app, 'viewer:go-episode', d0, 99);
      assert.equal(big.r && big.r.episode, 2, `+99 → 마지막 회차로 클램프, 실제 ${JSON.stringify(big)}`);
      assert.equal(big.r.edge, undefined);
      const bigBack = await callIpc(app, 'viewer:go-episode', lastDir, -99);
      assert.equal(bigBack.r && bigBack.r.episode, 0, `-99 → 첫 회차로 클램프, 실제 ${JSON.stringify(bigBack)}`);
      const badRows = [];
      for (const bad of [1.5, NaN, Infinity, 0, '1', null, undefined, 1000001]) {
        const r = await callIpc(app, 'viewer:go-episode', d0, bad);
        const rejected = r.threw !== undefined || (r.ok && r.r && r.r.error !== undefined && r.r.files === undefined);
        badRows.push(`${String(bad)}→${r.threw ? '예외' : JSON.stringify(r.r && { error: r.r.error, edge: r.r.edge, episode: r.r.episode })}`);
        assert.ok(rejected, `정수가 아니거나 허용 범위 밖인 delta(${String(bad)})가 거부되지 않음: ${JSON.stringify(r)}`);
      }
      obs.push(`(d) IPC: +1→episode ${mid.r.episode}(${mid.r.files.length}장), 첫 -1→edge:${first.r.edge}, 끝 +1→edge:${last.r.edge}, +99→${big.r.episode}, -99→${bigBack.r.episode}; 거부 [${badRows.join(' | ')}]`);
    });
    for (const o of obs) c.obs(o);
    assert.equal(fails.length, 0, `EP-09 하위 단언 실패 ${fails.length}건 — ${fails.join(' || ')}`);
  }, 120000),
]);

// =============================================================== SUITE: 스크롤·줌·패닝 (basic/1.png)
const V = { fit0: null };
const BASIC_ENTRIES = () => ['1.png', '2.png', '10.png', 'UP.PNG'].map((n) => M[`basic/${n}`]);

suite('view', () => F.b1, [
  step('ZM-01', '폭 맞춤(레터박스)으로 시작: fit=true, #strip 폭 == clientWidth/1.1, scale = strip 폭/기준 폭', '너비 ±1px, scale ±1e-4, 좌우 여백 차 ±1px', async (c) => {
    const s = await snap(c.page);
    V.fit0 = fitOf(s);
    assertFitLayout(s, '초기');
    assert.equal(s.scaleStr, '1.0000', '880 폭 창 + 800 폭 기준 → 배율 1.0');
    c.obs(`fit=${s.fit}, #strip 폭=${s.strip.width.toFixed(2)} (clientWidth ${s.clientWidth}/1.1=${(s.clientWidth / LB).toFixed(2)}), scale=${s.scaleStr}, zoom="${s.zoomText}", 좌 여백=${(s.strip.left - s.sr.left).toFixed(1)}, DPR=${s.dpr}, innerSize=${s.innerW}x${s.innerH}`);
  }),
  step('ZM-10', '폭 맞춤에서 가로 스크롤 없음: scrollWidth ≤ clientWidth', '정확(부등식). 가로 스크롤바 두께(offsetHeight-clientHeight)=0 도 확인', async (c) => {
    await resetView(c.page);
    const s = await snap(c.page);
    assert.ok(s.scrollWidth <= s.clientWidth, `scrollWidth=${s.scrollWidth} clientWidth=${s.clientWidth}`);
    assert.equal(s.offsetHeight - s.clientHeight, 0);
    if (s.hbar) assert.ok(!barVisible(s.hbar), '#hbar 가 보임');
    c.obs(`scrollWidth=${s.scrollWidth}, clientWidth=${s.clientWidth}, 가로 스크롤바 두께=${s.offsetHeight - s.clientHeight}, #hbar ${s.hbar ? (barVisible(s.hbar) ? '표시' : '숨김') : '(요소 없음)'}`);
  }),
  step('SCR-01', '휠 아래로: scrollTop 증가, scale 불변', 'scale 문자열 정확 일치, 왕복 후 scrollTop ±1.5', async (c) => {
    const { page } = c;
    await resetView(page);
    const s0 = await snap(page);
    const { x, y } = center(s0);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 300);
    let r = await settleScroll(page);
    const s1 = await snap(page);
    assert.ok(r.top > 0, `scrollTop=${r.top}`);
    assert.equal(s1.scaleStr, s0.scaleStr, 'scale 불변');
    assert.equal(s1.fit, true);
    const down = r.top;
    await page.mouse.wheel(0, -300);
    r = await settleScroll(page);
    approx(r.top, 0, SCROLL_TOL, '휠 ±300 왕복 후 scrollTop');
    c.obs(`deltaY=+300 → scrollTop=${down}, scale ${s0.scaleStr}→${s1.scaleStr}(불변), 휠 -300 후 scrollTop=${r.top}`);
  }),
  step('ZM-09', 'Ctrl 없는 휠은 줌하지 않음', 'scale 문자열 정확 일치 (±120/±600/±1500, 가로 휠 포함)', async (c) => {
    const { page } = c;
    await resetView(page);
    const s0 = await snap(page);
    const { x, y } = center(s0);
    await page.mouse.move(x, y);
    for (const dy of [120, -120, 600, -600, 1500, -1500]) {
      await page.mouse.wheel(0, dy);
      await settleScroll(page, 200);
      const s = await snap(page);
      assert.equal(s.scaleStr, s0.scaleStr, `wheel dy=${dy} 후 scale 변화`);
      assert.equal(s.fit, true, `wheel dy=${dy} 후 fit 변화`);
    }
    await page.mouse.wheel(300, 0);
    await sleep(200);
    const s = await snap(page);
    assert.equal(s.scaleStr, s0.scaleStr);
    c.obs(`일반 휠 6회+가로 휠 후 scale=${s.scaleStr}(시작 ${s0.scaleStr}), fit=${s.fit}`);
  }),
  step('SCR-02', '↓/↑ 80px 스크롤', '±1.5px', async (c) => {
    const { page } = c;
    await resetView(page);
    await press(page, 'ArrowDown');
    const a = (await settleScroll(page)).top;
    approx(a, 80, SCROLL_TOL, 'ArrowDown 1회');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    const b = (await settleScroll(page)).top;
    approx(b, 240, SCROLL_TOL, 'ArrowDown 3회');
    await press(page, 'ArrowUp');
    const d = (await settleScroll(page)).top;
    approx(d, 160, SCROLL_TOL, 'ArrowUp 1회');
    await press(page, 'Home');
    await settleScroll(page);
    await press(page, 'ArrowUp');
    const e = (await settleScroll(page)).top;
    approx(e, 0, SCROLL_TOL, '맨 위 ArrowUp');
    c.obs(`↓1회=${a}, ↓3회=${b}, ↑1회(160 기대)=${d}, 맨 위에서 ↑=${e}`);
  }),
  step('SCR-03', 'PageDown/PageUp/Space/Shift+Space = 클라이언트 높이의 90%', '±2.5~3.5px (스무스 스크롤 폴링 대기)', async (c) => {
    const { page } = c;
    await resetView(page);
    const s = await snap(page);
    const p90 = s.clientHeight * 0.9;
    await press(page, 'PageDown');
    const a = (await settleScroll(page)).top;
    approx(a, p90, SCROLL_TOL + 1, 'PageDown 1회');
    await press(page, 'PageDown');
    const b = (await settleScroll(page)).top;
    approx(b, p90 * 2, SCROLL_TOL + 2, 'PageDown 2회');
    await press(page, 'PageUp');
    approx((await settleScroll(page)).top, p90, SCROLL_TOL + 2, 'PageUp 1회');
    await press(page, 'PageUp');
    approx((await settleScroll(page)).top, 0, SCROLL_TOL + 2, 'PageUp 2회');
    await press(page, 'Space');
    const sp = (await settleScroll(page)).top;
    approx(sp, p90, SCROLL_TOL + 1, 'Space');
    await press(page, 'Shift+Space');
    const ssp = (await settleScroll(page)).top;
    approx(ssp, 0, SCROLL_TOL + 1, 'Shift+Space');
    await press(page, 'End');
    await settleScroll(page);
    const maxTop = (await snap(page)).scrollTop;
    await press(page, 'PageDown');
    approx((await settleScroll(page)).top, maxTop, SCROLL_TOL, '맨 아래에서 PageDown');
    await resetView(page);
    for (let i = 0; i < 3; i++) await press(page, 'PageDown');
    const rapid = (await settleScroll(page, 400, 8000)).top;
    await resetView(page);
    for (let i = 0; i < 3; i++) { await press(page, 'PageDown'); await sleep(100); }
    const spaced = (await settleScroll(page, 400, 8000)).top;
    await resetView(page);
    for (let i = 0; i < 3; i++) { await press(page, 'PageDown'); await sleep(250); }
    const spaced250 = (await settleScroll(page, 400, 8000)).top;
    note(`SCR-03 관찰: PageDown 3회 입력 시 누적 scrollTop — 간격 0ms=${rapid.toFixed(1)}, 100ms=${spaced.toFixed(1)}, 250ms=${spaced250.toFixed(1)} (이상적 3페이지=${(p90 * 3).toFixed(1)}, 1페이지=${p90.toFixed(1)}). 스무스 스크롤 진행 중 입력이 누적되지 않으면 키 반복 시 이동량이 줄어듦`);
    assert.ok(rapid >= p90 - SCROLL_TOL - 1, 'PageDown 연타가 한 페이지도 못 감');
    c.obs(`clientHeight=${s.clientHeight} → 90%=${p90.toFixed(1)}; PageDown1=${a.toFixed(1)}, PageDown2=${b.toFixed(1)}, Space=${sp.toFixed(1)}, Shift+Space=${ssp.toFixed(1)}; (관찰) 3회 입력 누적: 0ms 간격=${rapid.toFixed(1)}, 100ms 간격=${spaced.toFixed(1)}, 250ms 간격=${spaced250.toFixed(1)}`);
  }),
  step('SCR-04', 'End=맨 아래, Home=scrollTop 0 (+스크린샷 픽셀로 맨 위/맨 아래 띠 확인)', 'scrollTop+clientHeight vs scrollHeight ±1.5, 픽셀 ±20', async (c) => {
    const { page } = c;
    await resetView(page);
    await setScroll(page, 1500, 0);
    await sleep(100);
    await press(page, 'End');
    const r = await settleScroll(page);
    const s = await snap(page);
    approx(r.top + s.clientHeight, s.scrollHeight, SCROLL_TOL, 'End');
    const entries = BASIC_ENTRIES();
    const kEnd = await checkBand(page, entries, 'End 하단', [0.98, 0.95, 0.9]);
    const pEnd = checkBand.lastPage;
    assert.equal(pEnd, entries.length - 1, 'End 하단은 마지막 장');
    assert.equal(kEnd, entries[pEnd].colors.length - 1, 'End 하단은 마지막 장의 마지막 띠');
    await press(page, 'Home');
    const h = await settleScroll(page);
    assert.equal(h.top, 0, 'Home');
    const kHome = await checkBand(page, entries, 'Home 상단', [0.12, 0.2, 0.3]);
    assert.equal(checkBand.lastPage, 0, 'Home 상단은 첫 장');
    assert.equal(kHome, 0, 'Home 상단은 첫 띠');
    c.obs(`End(전체 띠의 맨 아래): scrollTop=${r.top}+clientHeight=${s.clientHeight} vs scrollHeight=${s.scrollHeight}, 화면 하단 = 장 ${pEnd} 띠 ${kEnd}(마지막 장의 마지막 띠); Home(전체 띠의 맨 위): scrollTop=${h.top}, 화면 상단 = 장 0 띠 ${kHome}`);
  }),
  step('ZM-02(준비)', 'Ctrl+휠 입력 방식 확인 (수정자 전달 여부)', 'Playwright keyboard.down(Control)+mouse.wheel → 안 되면 CDP modifiers → 합성 WheelEvent 순서로 시도', async (c) => {
    const { page } = c;
    await resetView(page);
    await installLog(page);
    const s0 = await snap(page);
    const { x, y } = center(s0);
    const tried = [];
    let ok = false;
    for (const m of ['playwright', 'cdp', 'synthetic']) {
      WHEEL_METHOD = m;
      await page.evaluate(() => { window.__ev.length = 0; });
      const before = await snap(page);
      await ctrlWheel(page, x, y, -100);
      const ev = await page.evaluate(() => window.__ev.filter((e) => e.t === 'wheel'));
      const after = await snap(page);
      tried.push(`${m}: events=${JSON.stringify(ev)} scale ${before.scaleStr}→${after.scaleStr}`);
      if (ev.length === 1 && ev[0].ctrl === true && ev[0].dy === -100 && after.scale > before.scale) {
        ok = true;
        WHEEL_INFO = { method: m, trusted: ev[0].trusted };
        break;
      }
      await press(page, 'Control+0');
    }
    await press(page, 'Control+0');
    assert.ok(ok, `Ctrl+휠 입력 방식을 찾지 못함: ${tried.join(' | ')}`);
    note(`Ctrl+휠 입력 방식: ${WHEEL_INFO.method} (isTrusted=${WHEEL_INFO.trusted}). playwright = keyboard.down('Control') 상태에서 mouse.wheel (수정자가 ctrlKey=true, deltaY 그대로 전달됨을 이벤트 로그로 확인)`);
    c.obs(`사용 방식=${WHEEL_INFO.method}, wheel 이벤트 ctrlKey=true, deltaY=-100, isTrusted=${WHEEL_INFO.trusted}`);
  }),
  step('ZM-02', 'Ctrl+휠 줌 in/out: 위로=증가, 아래로=감소, fit=false, #zoom 라벨 갱신', 'scale = ×exp(-deltaY×0.0015), 상대오차 2e-3', async (c) => {
    const { page } = c;
    await resetView(page);
    const s0 = await snap(page);
    const f0 = fitOf(s0);
    const { x, y } = at(s0, 0.3, 0.4);
    await ctrlWheel(page, x, y, -300);
    const s1 = await snap(page);
    relApprox(s1.scale, f0 * Math.exp(0.45), SCALE_REL, '줌 인 배율');
    assert.equal(s1.fit, false);
    assert.equal(s1.zoomText, `${Math.round(s1.scale * 100)}%`);
    approx(s1.strip.width, REF * s1.scale, 1.5, '#strip 표시 폭 = 기준 폭 × scale');
    assert.ok(s1.scale > s0.scale);
    await ctrlWheel(page, x, y, 300);
    const s2 = await snap(page);
    relApprox(s2.scale, f0, SCALE_REL, '왕복 배율');
    assert.equal(s2.fit, false);
    await ctrlWheel(page, x, y, 600);
    const s3 = await snap(page);
    relApprox(s3.scale, f0 * Math.exp(-0.9), SCALE_REL, '줌 아웃 배율');
    assert.ok(s3.scale < s2.scale);
    assert.equal(s3.zoomText, `${Math.round(s3.scale * 100)}%`);
    c.obs(`fit ${s0.scaleStr} → (dy=-300) ${s1.scaleStr} "${s1.zoomText}" fit=${s1.fit} → (dy=+300) ${s2.scaleStr} → (dy=+600) ${s3.scaleStr} "${s3.zoomText}"`);
  }),
  step('ZM-03', '커서 기준 줌: 줌 전후 커서 아래 이미지 지점 고정 (3개 커서 위치 × in/out/below-fit)', `오차 ≤ ${ANCHOR_TOL} CSS px. 스크롤 한계로 이상적 고정이 불가능한 축은 제외하고 제외 개수 보고`, async (c) => {
    const { page } = c;
    stats.anchorMax = 0; stats.anchorChecked = 0; stats.anchorSkipped = 0;
    let checkedY = 0;
    for (const [fx, fy] of [[0.25, 0.3], [0.5, 0.5], [0.8, 0.75]]) {
      await resetView(page);
      await setScroll(page, 1200, 0);
      await sleep(80);
      let prev = await snap(page);
      const { x, y } = at(prev, fx, fy);
      // 폭 맞춤(레터박스)에서는 #strip 이 clientWidth 보다 좁아 가로 고정은 확대로 넘치기 시작한 뒤부터 의미가 있다 → 확대 3단계·축소 3단계 + 맞춤 아래로
      for (const [dy, label] of [[-250, 'in1'], [-250, 'in2'], [-250, 'in3'], [250, 'out1'], [250, 'out2'], [250, 'out3'], [500, 'out-below-fit']]) {
        await ctrlWheel(page, x, y, dy);
        const cur = await snap(page);
        const r = checkAnchor(prev, cur, x, y, `(${fx},${fy}) ${label}`);
        if (r.checked.includes('y')) checkedY++;
        prev = cur;
      }
    }
    assert.ok(checkedY >= 14, `Y 고정점 검사가 너무 적음: ${checkedY}/21`);
    assert.ok(stats.anchorChecked >= 20, `고정점 검사 횟수 부족: ${stats.anchorChecked}`);
    c.obs(`검사한 축 ${stats.anchorChecked}개(Y ${checkedY}/21), 스크롤 한계로 제외 ${stats.anchorSkipped}개, 최대 관측 오차 ${stats.anchorMax.toFixed(3)}px (허용 ${ANCHOR_TOL}px)`);
  }),
  step('ZM-03(추가)', 'Ctrl+= / Ctrl+- 는 뷰포트 중앙 기준 고정', `오차 ≤ ${ANCHOR_TOL} CSS px`, async (c) => {
    const { page } = c;
    await resetView(page);
    await setScroll(page, 1200, 0);
    await sleep(80);
    let prev = await snap(page);
    const detail = [];
    for (const key of ['Control+Equal', 'Control+Equal', 'Control+Minus']) {
      // 매 단계 직전 스냅샷의 뷰포트 중앙을 기준으로 판정(바는 오버레이라 clientHeight 는 변하지 않는다)
      const { x, y } = center(prev);
      await press(page, key);
      const cur = await snap(page);
      const r = checkAnchor(prev, cur, x, y, `중앙 ${key}`);
      detail.push(`${key}: x ${r.checked.includes('x') ? r.ex.toFixed(3) : `(제외 ${r.ex.toFixed(2)})`}, y ${r.checked.includes('y') ? r.ey.toFixed(3) : `(제외 ${r.ey.toFixed(2)})`}`);
      prev = cur;
    }
    c.obs(`뷰포트 중앙 고정 오차(px, 검사한 축만; 괄호는 스크롤 한계로 제외된 축의 참고값): ${detail.join(' | ')}`);
  }),
  step('ZM-04', '줌 범위 clamp: 연속 확대 → 8.0000(800%), 연속 축소 → 0.1000(10%)에서 멈춤', '문자열 정확 일치(data-scale)', async (c) => {
    const { page } = c;
    await resetView(page);
    const s0 = await snap(page);
    const { x, y } = center(s0);
    let nIn = 0;
    for (; nIn < 30; nIn++) {
      if ((await snap(page)).scaleStr === '8.0000') break;
      await ctrlWheel(page, x, y, -600);
    }
    let s = await snap(page);
    assert.equal(s.scaleStr, '8.0000', `최대 배율 미도달 (${nIn}회)`);
    assert.equal(s.zoomText, '800%');
    approx(s.strip.width, 6400, 1.5, '800% 너비');
    await ctrlWheel(page, x, y, -600);
    await ctrlWheel(page, x, y, -2000);
    assert.equal((await snap(page)).scaleStr, '8.0000', '최대 이후 추가 확대 시 변화 없어야 함');
    let nOut = 0;
    for (; nOut < 40; nOut++) {
      if ((await snap(page)).scaleStr === '0.1000') break;
      await ctrlWheel(page, x, y, 600);
    }
    s = await snap(page);
    assert.equal(s.scaleStr, '0.1000', `최소 배율 미도달 (${nOut}회)`);
    assert.equal(s.zoomText, '10%');
    approx(s.strip.width, 80, 1.5, '10% 너비');
    await ctrlWheel(page, x, y, 600);
    await ctrlWheel(page, x, y, 3000);
    s = await snap(page);
    assert.equal(s.scaleStr, '0.1000', '최소 이후 추가 축소 시 변화 없어야 함');
    c.obs(`확대 ${nIn}회(dy=-600) → 8.0000/800%(너비 6400), 추가 확대 무변화; 축소 ${nOut}회(dy=+600) → 0.1000/10%(너비 80), 추가 축소 무변화`);
  }),
  step('ZM-05', 'Ctrl+0 → fit=true, 폭 맞춤 값 (임의 배율 4종에서)', 'scale ±1e-4, 너비 ±1', async (c) => {
    const { page } = c;
    const obs = [];
    const setups = {
      '100%': async () => press(page, 'Control+1'),
      '×1.25^6': async () => { for (let i = 0; i < 6; i++) await press(page, 'Control+Equal'); },
      '최소(10%)': async () => { for (let i = 0; i < 40; i++) await press(page, 'Control+Minus'); },
      'Ctrl+휠 임의': async () => { const s = await snap(page); const p = center(s); await ctrlWheel(page, p.x, p.y, -777); },
    };
    for (const [label, fn] of Object.entries(setups)) {
      await resetView(page);
      await fn();
      const before = await snap(page);
      assert.equal(before.fit, false, `${label}: 사전 fit=false`);
      await press(page, 'Control+0');
      const s = await snap(page);
      assertFitLayout(s, `${label} → Ctrl+0`);
      obs.push(`${label}(scale ${before.scaleStr}) → fit=${s.fit}, scale=${s.scaleStr}`);
    }
    c.obs(obs.join(' / '));
  }),
  step('ZM-06', 'Ctrl+1 → scale == 1 (임의 배율 3종에서)', '문자열 정확 "1.0000", 너비 ±1.5', async (c) => {
    const { page } = c;
    const obs = [];
    for (const [label, fn] of Object.entries({
      fit: async () => {},
      '×1.25^6': async () => { for (let i = 0; i < 6; i++) await press(page, 'Control+Equal'); },
      최소: async () => { for (let i = 0; i < 40; i++) await press(page, 'Control+Minus'); },
    })) {
      await resetView(page);
      await fn();
      const before = await snap(page);
      await press(page, 'Control+1');
      const s = await snap(page);
      assert.equal(s.scaleStr, '1.0000', `${label}`);
      assert.equal(s.fit, false);
      assert.equal(s.zoomText, '100%');
      approx(s.strip.width, REF, 1.5, `${label} 100% 너비(= 기준 폭)`);
      obs.push(`${label}(${before.scaleStr}) → ${s.scaleStr}`);
    }
    c.obs(obs.join(' / '));
  }),
  step('ZM-07', 'Ctrl+= ×1.25 / Ctrl+- ÷1.25 (임의 배율, clamp 적용)', 'scale 상대오차 2e-3, clamp 문자열 정확', async (c) => {
    const { page } = c;
    const obs = [];
    await resetView(page);
    const f0 = fitOf(await snap(page));
    for (const key of ['Control+Equal', 'Control+Equal', 'Control+Minus', 'Control+Minus']) {
      const before = (await snap(page)).scale;
      await press(page, key);
      const after = await snap(page);
      relApprox(after.scale, key.endsWith('Equal') ? before * 1.25 : before / 1.25, SCALE_REL, key);
      assert.equal(after.fit, false);
    }
    relApprox((await snap(page)).scale, f0, SCALE_REL, '왕복 후 원복');
    await press(page, 'Control+1');
    for (let i = 0; i < 9; i++) await press(page, 'Control+Equal');
    const near = await snap(page);
    relApprox(near.scale, 1.25 ** 9, SCALE_REL, 'Ctrl+1 후 Ctrl+= 9회 = 1.25^9 (아직 clamp 전)');
    await press(page, 'Control+Equal');
    const clamped = await snap(page);
    assert.equal(clamped.scaleStr, '8.0000', `10회째: 7.45×1.25=9.31 → clamp 8, 실제 ${clamped.scaleStr}`);
    await press(page, 'Control+Equal');
    assert.equal((await snap(page)).scaleStr, '8.0000', '추가 Ctrl+= 무변화');
    for (let i = 0; i < 40; i++) await press(page, 'Control+Minus');
    const mn = await snap(page);
    assert.equal(mn.scaleStr, '0.1000');
    assert.equal(mn.zoomText, '10%');
    obs.push(`fit(${f0.toFixed(4)})에서 =,=,-,- 각 ×1.25/÷1.25 OK 원복; Ctrl+1 후 = 9회 → ${near.scaleStr}(1.25^9), 10회 → ${clamped.scaleStr}(clamp 8), 추가 = 무변화; - 연타 → ${mn.scaleStr}`);
    c.obs(obs.join(' / '));
  }),
  step('ZM-07(추가)', 'Ctrl+Shift+= (Ctrl++), 숫자패드 +/- 도 동일 동작', 'scale 상대오차 2e-3', async (c) => {
    const { page } = c;
    await resetView(page);
    const f0 = fitOf(await snap(page));
    await press(page, 'Control+Shift+Equal');
    relApprox((await snap(page)).scale, f0 * 1.25, SCALE_REL, 'Ctrl+Shift+=');
    await press(page, 'Control+NumpadSubtract');
    relApprox((await snap(page)).scale, f0, SCALE_REL, 'Ctrl+NumpadSubtract');
    await press(page, 'Control+NumpadAdd');
    relApprox((await snap(page)).scale, f0 * 1.25, SCALE_REL, 'Ctrl+NumpadAdd');
    c.obs('Ctrl+Shift+= ×1.25, Ctrl+NumpadSubtract ÷1.25, Ctrl+NumpadAdd ×1.25 OK');
  }),
  step('ZM-08', '더블클릭 토글: fit→100%(scale==1)→fit (+확대 상태에서도 fit 복귀, 스크롤바 더블클릭 무시)', 'scale 정확, y 고정점 ≤ 2px', async (c) => {
    const { page } = c;
    await resetView(page);
    let s = await snap(page);
    const f0 = fitOf(s);
    await setScroll(page, 1200, 0);
    await sleep(80);
    const prev = await snap(page);
    const { x, y } = at(prev, 0.4, 0.6);
    await page.mouse.dblclick(x, y);
    s = await snap(page);
    assert.equal(s.scaleStr, '1.0000');
    assert.equal(s.fit, false);
    checkAnchor(prev, s, x, y, 'dblclick fit→100%', { allowX: false });
    await page.mouse.dblclick(x, y);
    s = await snap(page);
    assert.equal(s.fit, true);
    approx(s.scale, f0, 1e-4, 'dblclick 100%→fit scale');
    assert.match(s.zoomText, /맞춤$/);
    for (let i = 0; i < 3; i++) await press(page, 'Control+Equal');
    assert.equal((await snap(page)).fit, false);
    await page.mouse.dblclick(x, y);
    assert.equal((await snap(page)).fit, true, '확대(비-fit) 상태 더블클릭 → fit');
    s = await barSnap(page);
    assert.ok(barVisible(s.vbar), '사전조건: #vbar 표시');
    const tr8 = trackOf(s.vbar, 'y');
    await page.mouse.dblclick(s.vbar.rect.left + s.vbar.rect.width / 2, tr8.start + tr8.len * 0.85);
    assert.equal((await snap(page)).fit, true, '바(#vbar 트랙) 더블클릭이 줌을 바꿈');
    c.obs(`fit(${f0.toFixed(4)}) → 더블클릭 → scale=1.0000(fit=false) → 더블클릭 → fit=true; Ctrl+= ×3 후 더블클릭 → fit=true; 바(#vbar 트랙) 더블클릭 무시`);
  }),
  step('ZM-13', '축소 시 가운데 정렬(좌우 여백 동일), 확대 시 scrollLeft 로 좌우 끝까지 도달', '여백 차 ±1px, 끝 도달 ±1.5px', async (c) => {
    const { page } = c;
    const obs = [];
    await resetView(page);
    for (let i = 0; i < 5; i++) await press(page, 'Control+Minus');
    let s = await snap(page);
    assert.ok(s.strip.width < s.clientWidth - 100, `창보다 좁게 축소되지 않음 ${s.strip.width}`);
    const margins = (v) => [v.strip.left - v.sr.left, v.sr.left + v.clientWidth - (v.strip.left + v.strip.width)];
    let [l, r] = margins(s);
    approx(l, r, 1, '축소 좌우 여백');
    assert.ok(l > 50, `여백이 생기지 않음 ${l}`);
    obs.push(`축소(너비 ${s.strip.width.toFixed(0)}/${s.clientWidth}): 좌 ${l.toFixed(1)} / 우 ${r.toFixed(1)}`);
    await press(page, 'Control+1');
    s = await snap(page);
    [l, r] = margins(s);
    approx(l, r, 1, '100% 좌우 여백');
    obs.push(`100%(너비 ${s.strip.width.toFixed(0)}): 좌 ${l.toFixed(1)} / 우 ${r.toFixed(1)}`);
    for (let i = 0; i < 4; i++) await press(page, 'Control+Equal');
    s = await snap(page);
    assert.ok(s.strip.width > s.clientWidth * 1.5, `확대 안 됨 ${s.strip.width}`);
    approx(s.scrollWidth, s.strip.width, 1.5, '확대 scrollWidth ≈ #strip 폭');
    await setScroll(page, null, 0);
    await sleep(80);
    s = await snap(page);
    approx(s.strip.left, s.sr.left, 1.5, 'scrollLeft=0 에서 #strip 왼쪽 끝이 뷰포트 왼쪽과 일치(왼쪽 잘림 없음)');
    await setScroll(page, null, 100000);
    await sleep(80);
    const e = await snap(page);
    approx(e.scrollLeft, e.scrollWidth - e.clientWidth, 1.5, '최대 scrollLeft');
    approx(e.strip.left + e.strip.width, e.sr.left + e.clientWidth, 1.5, '#strip 오른쪽 끝이 뷰포트 오른쪽과 일치');
    obs.push(`확대(너비 ${e.strip.width.toFixed(0)}, scrollWidth ${e.scrollWidth}): scrollLeft 0 → #strip 왼쪽 ${s.strip.left.toFixed(1)}(뷰포트 ${s.sr.left}), 최대 scrollLeft ${e.scrollLeft} → #strip 오른쪽 ${(e.strip.left + e.strip.width).toFixed(1)}(뷰포트 ${e.sr.left + e.clientWidth})`);
    c.obs(obs.join(' / '));
  }),
  step('ZM-14', '페이지 줌 차단: Ctrl+휠/Ctrl+=/Ctrl+- 후 visualViewport.scale==1, 레이아웃 유지', 'visualViewport.scale/zoomFactor 정확, innerWidth·DPR·상단 바 높이 불변', async (c) => {
    const { page, app } = c;
    await resetView(page);
    const read = () => page.evaluate(() => ({
      vv: window.visualViewport.scale, vvW: window.visualViewport.width, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      top: document.getElementById('topbar').getBoundingClientRect().height, cw: document.getElementById('scroller').clientWidth,
      fs: getComputedStyle(document.body).fontSize,
    }));
    const zoomInfo = () => app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      return { factor: wc.getZoomFactor(), level: wc.getZoomLevel() };
    });
    const before = await read();
    const s0 = await snap(page);
    const { x, y } = at(s0, 0.4, 0.4);
    for (let i = 0; i < 4; i++) await ctrlWheel(page, x, y, -500);
    for (let i = 0; i < 4; i++) await ctrlWheel(page, x, y, 500);
    for (const k of ['Control+Equal', 'Control+Equal', 'Control+Shift+Equal', 'Control+Minus', 'Control+Minus', 'Control+Minus', 'Control+Digit0']) await press(page, k);
    await press(page, 'Control+1');
    const mid = await read();
    const z = await zoomInfo();
    assert.equal(mid.vv, 1, `visualViewport.scale=${mid.vv}`);
    assert.equal(z.factor, 1, `webContents zoomFactor=${z.factor}`);
    assert.equal(z.level, 0);
    for (const k of ['iw', 'ih', 'dpr', 'top', 'cw', 'vvW']) assert.equal(mid[k], before[k], `${k} 변화 ${before[k]} → ${mid[k]}`);
    assert.equal(mid.fs, before.fs);
    c.obs(`visualViewport.scale=${mid.vv}, webContents.getZoomFactor()=${z.factor}, zoomLevel=${z.level}, innerWidth ${before.iw}→${mid.iw}, DPR ${before.dpr}→${mid.dpr}, 상단 바 높이 ${before.top}→${mid.top}, clientWidth ${before.cw}→${mid.cw}`);
  }),
  step('SCR-05', '드래그 패닝: 이동량만큼 scrollLeft/Top 변화, 버튼을 놓으면 종료', `±${SCROLL_TOL}px`, async (c) => {
    const { page } = c;
    await resetView(page);
    for (let i = 0; i < 4; i++) await press(page, 'Control+Equal'); // 폭 맞춤 창(880)에서 충분한 가로 스크롤 여유(≈1950px 폭)
    let s = await snap(page);
    assert.ok(s.strip.width > s.clientWidth + 300, '가로 오버플로 없음');
    await setScroll(page, 1000, 300);
    await sleep(80);
    s = await snap(page);
    const { x, y } = center(s);
    const l0 = s.scrollLeft; const t0 = s.scrollTop;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 100, y - 100, { steps: 8 });
    assert.equal((await snap(page)).panning, true, '드래그 중 .panning');
    await page.mouse.up();
    s = await snap(page);
    assert.equal(s.panning, false, 'mouseup 후 .panning 해제');
    approx(s.scrollLeft, l0 + 100, SCROLL_TOL, '왼쪽 100 드래그');
    approx(s.scrollTop, t0 + 100, SCROLL_TOL, '위로 100 드래그');
    const l1 = s.scrollLeft; const t1 = s.scrollTop;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 250, y + 300, { steps: 10 });
    await page.mouse.up();
    s = await snap(page);
    approx(s.scrollLeft, l1 - 250, SCROLL_TOL, '오른쪽 250 드래그');
    approx(s.scrollTop, t1 - 300, SCROLL_TOL, '아래 300 드래그');
    // 버튼을 놓은 뒤 이동은 패닝하지 않음
    const after = await snap(page);
    await page.mouse.move(x - 120, y - 120, { steps: 5 });
    const post = await snap(page);
    assert.equal(post.scrollLeft, after.scrollLeft, 'mouseup 후 mousemove 가 패닝함');
    assert.equal(post.scrollTop, after.scrollTop);
    c.obs(`(300,1000)에서 (-100,-100) 드래그 → (${l0 + 100},${t0 + 100}) 기대 / 실제 (${l1},${t1}); (+250,+300) 드래그 → (${(l1 - 250).toFixed(0)},${(t1 - 300).toFixed(0)}) 기대 / 실제 (${after.scrollLeft},${after.scrollTop}); mouseup 후 이동은 패닝 안 함`);
  }),
  step('SCR-05(추가)', '패닝 경계 clamp, buttons=0 mousemove(합성)에서 패닝 종료', '정확 0 / panning 클래스', async (c) => {
    const { page } = c;
    await resetView(page);
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await setScroll(page, 0, 0);
    await sleep(60);
    let s = await snap(page);
    const { x, y } = center(s);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 200, y + 200, { steps: 6 });
    await page.mouse.up();
    s = await snap(page);
    assert.equal(s.scrollLeft, 0);
    assert.equal(s.scrollTop, 0);
    await setScroll(page, 500, 100);
    await sleep(60);
    const before = await snap(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.evaluate(([cx, cy]) => {
      window.dispatchEvent(new MouseEvent('mousemove', { buttons: 0, clientX: cx - 80, clientY: cy - 80, bubbles: true }));
    }, [x, y]);
    s = await snap(page);
    assert.equal(s.panning, false);
    assert.equal(s.scrollLeft, before.scrollLeft);
    await page.mouse.up();
    c.obs('상단/좌측 경계에서 아래-오른쪽 드래그 → (0,0) 유지; buttons=0 합성 mousemove → panning 클래스 해제·스크롤 불변');
  }),
  step('SCR-06', '바(#vbar/#hbar) 위 mousedown 은 패닝 제외: .panning 클래스 유무 + 바 드래그 중 교차 축(scrollLeft/Top) 불변. 대조군: 이미지 위 mousedown 은 panning', '.panning 클래스 유무 + 썸 드래그 중 교차 축 이동 0', async (c) => {
    const { page } = c;
    await resetView(page);
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await setScroll(page, 0, 0);
    let s = await barSnap(page);
    assert.ok(barVisible(s.vbar) && barVisible(s.hbar), `사전조건: 두 바가 보여야 함 v=${barVisible(s.vbar)} h=${barVisible(s.hbar)}`);
    const mid = center(s);
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    assert.equal((await snap(page)).panning, true, '대조군: 이미지 위 mousedown → panning');
    await page.mouse.up();
    const vt = s.vbar.thumb;
    const vx = vt.left + vt.width / 2;
    const vy = vt.top + Math.min(vt.height / 2, 20);
    await page.mouse.move(vx, vy);
    await page.mouse.down();
    assert.equal((await snap(page)).panning, false, '세로 바 mousedown 에서 panning 시작');
    await page.mouse.move(vx - 40, vy, { steps: 4 });
    s = await snap(page);
    assert.equal(s.panning, false);
    assert.equal(s.scrollLeft, 0, '세로 바 드래그 중 가로 패닝');
    await page.mouse.up();
    await setScroll(page, 0, 0);
    s = await barSnap(page);
    const ht = s.hbar.thumb;
    const hx = ht.left + Math.min(ht.width / 2, 20);
    const hy = ht.top + ht.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    assert.equal((await snap(page)).panning, false, '가로 바 mousedown 에서 panning 시작');
    await page.mouse.move(hx, hy - 40, { steps: 4 });
    s = await snap(page);
    assert.equal(s.panning, false);
    assert.equal(s.scrollTop, 0, '가로 바 드래그 중 세로 패닝');
    await page.mouse.up();
    c.obs(`바 두께 v=${s.vbar.rect.width}px h=${s.hbar.rect.height}px. 이미지 위 mousedown→panning=true(대조), 세로/가로 바 썸 mousedown→panning=false, 바 위에서 교차 축 이동(40px) 시 scrollLeft/Top 변화 0`);
  }),
  step('DSP-05', '시각 확인용 스크린샷 저장 (육안 확인은 수동)', '자동 판정 없음 — 스크린샷만 저장', async (c) => {
    const { page } = c;
    await resetView(page);
    const p1 = await shot(page, 'dsp05-1-fit-top.png');
    await setScroll(page, 1500, 0);
    await sleep(150);
    const p2 = await shot(page, 'dsp05-2-fit-mid-scrolled.png');
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await sleep(150);
    const p3 = await shot(page, 'dsp05-3-zoomed-both-scrollbars.png');
    await resetView(page);
    await press(page, 'End');
    await settleScroll(page);
    const p4 = await shot(page, 'dsp05-4-end-last-page.png');
    await press(page, 'ArrowRight');
    await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '마지막 회차 토스트');
    const p5 = await shot(page, 'dsp05-5-toast-last.png');
    await press(page, 'Home');
    await settleScroll(page);
    await ensureNoToast(page);
    await press(page, 'ArrowLeft');
    await waitSnap(page, (v) => !v.toastHidden, '토스트');
    const p6 = await shot(page, 'dsp05-6-toast-first.png');
    await resetView(page);
    const sb = await barSnap(page);
    if (barVisible(sb.vbar)) {
      const T = sb.vbar.thumb;
      await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2);
      await sleep(500);
    }
    const p7 = await shot(page, 'dsp05-7-vbar-hover.png');
    c.obs(`스크린샷 저장: ${[p1, p2, p3, p4, p5, p6, p7].join(' ; ')}`);
    return { manual: true };
  }),
]);

// =============================================================== SUITE: narrow (ZM-12)
suite('narrow', () => F.narrow, [
  step('ZM-12', '좁은 이미지(400×1200)도 창 폭에 맞춰 확대(최소 창 폭 480 이어서 배율 약 1.059), Ctrl+1 로 100% 전환 가능', 'scale ±1e-4', async (c) => {
    const { page } = c;
    let s = await snap(page);
    assertFitLayout(s, 'narrow 초기', 400);
    assert.ok(s.scale > 1, `확대되지 않음 scale=${s.scale}`);
    assert.equal(s.dims, '400×1200');
    const fitScale = s.scaleStr;
    await press(page, 'Control+1');
    s = await snap(page);
    assert.equal(s.scaleStr, '1.0000');
    assert.equal(s.fit, false);
    approx(s.strip.width, 400, 1, '100% 너비');
    await press(page, 'Control+0');
    assertFitLayout(await snap(page), 'Ctrl+0 복귀', 400);
    c.obs(`fit scale=${fitScale} (clientWidth ${s.clientWidth}/1.1/400), Ctrl+1 → 1.0000(너비 400) → Ctrl+0 → fit 복귀`);
  }),
  step('ZM-13(추가)', 'narrow 100% 에서 가운데 정렬', '여백 차 ±1px', async (c) => {
    const { page } = c;
    await press(page, 'Control+1');
    const s = await snap(page);
    const l = s.strip.left - s.sr.left;
    const r = s.sr.left + s.clientWidth - (s.strip.left + s.strip.width);
    approx(l, r, 1, '좌우 여백');
    c.obs(`100% 너비 ${s.strip.width}: 좌 ${l.toFixed(1)} / 우 ${r.toFixed(1)}`);
  }),
  step('ZM-11(추가)', 'narrow 리사이즈 시 fit 재계산·가로 스크롤 없음', 'scale ±1e-4, 너비 ±1', async (c) => {
    const { page, app } = c;
    await press(page, 'Control+0');
    const obs = [];
    for (const [w, h] of [[700, 600], [1400, 800], [1100, 850]]) {
      const s = await resizeTo(app, page, w, h);
      assertFitLayout(s, `narrow ${w}x${h}`, 400);
      obs.push(`${w}x${h}: clientWidth=${s.clientWidth}, scale=${s.scaleStr}`);
    }
    c.obs(obs.join(' / '));
  }),
]);

// =============================================================== SUITE: 창 리사이즈 (ZM-11)
suite('resize', () => F.b1, [
  step('ZM-11', '리사이즈 시 fit 유지, #strip 폭 == 새 clientWidth/1.1, 가로 스크롤 없음', 'scale ±1e-4, 너비 ±1, 창 크기 5종(바깥 크기)', async (c) => {
    const { page, app } = c;
    assertFitLayout(await snap(page), '초기(880x820 내부)');
    const obs = [];
    for (const [w, h] of [[900, 850], [640, 600], [1300, 850], [500, 420], [1000, 700]]) {
      const s = await resizeTo(app, page, w, h);
      assertFitLayout(s, `리사이즈 ${w}x${h} (clientWidth=${s.clientWidth})`);
      obs.push(`${w}x${h}→clientWidth=${s.clientWidth}, strip=${s.strip.width.toFixed(1)}, scale=${s.scaleStr}`);
    }
    c.obs(obs.join(' / '));
  }),
  step('ZM-11(추가)', '폭 변경 시 뷰포트 상단 기준 위치(scrollTop/scale = 맨 위 원본 y) 유지', `원본 이미지 y 오차 ≤ ${TOP_Y_TOL}px(시작값 기준)`, async (c) => {
    const { page, app } = c;
    await resizeTo(app, page, 1100, 850);
    await press(page, 'Control+0');
    await setScroll(page, 1500, null);
    await sleep(100);
    let s = await snap(page);
    const y0 = topY(s);
    const obs = [`기준 상단 y=${y0.toFixed(1)}(scrollTop 1500)`];
    for (const w of [800, 1300, 640, 1100]) {
      s = await resizeTo(app, page, w, 850);
      assertFitLayout(s, `상단 기준 위치 ${w}x850`);
      approx(topY(s), y0, TOP_Y_TOL, `폭 ${w} 리사이즈 후 뷰포트 상단 원본 y (scrollTop=${s.scrollTop}, scale=${s.scaleStr})`);
      obs.push(`${w}→${topY(s).toFixed(1)}`);
    }
    c.obs(obs.join(', '));
  }),
  step('ZM-11(추가)', '높이만 변경 시 scrollTop 불변', 'scrollTop ±1px', async (c) => {
    const { page, app } = c;
    await resizeTo(app, page, 1100, 850);
    await setScroll(page, 1500, null);
    await sleep(100);
    const before = await snap(page);
    const obs = [`기준 scrollTop=${before.scrollTop}, clientWidth=${before.clientWidth}`];
    for (const h of [700, 560, 850]) {
      const s = await resizeTo(app, page, 1100, h);
      assert.equal(s.clientWidth, before.clientWidth, `높이 ${h}: clientWidth 가 바뀌어 높이만 변경한 상황이 아님`);
      approx(s.scrollTop, before.scrollTop, 1, `높이만 ${h} 로 변경 후 scrollTop`);
      obs.push(`높이 ${h}→scrollTop ${s.scrollTop}`);
    }
    c.obs(obs.join(', '));
  }),
  step('ZM-11(추가)', '비-fit(Ctrl+1) 상태에서는 리사이즈해도 배율 유지', 'scale 문자열 정확', async (c) => {
    const { page, app } = c;
    await resizeTo(app, page, 1100, 850);
    await press(page, 'Control+1');
    const s = await resizeTo(app, page, 900, 700);
    assert.equal(s.scaleStr, '1.0000');
    assert.equal(s.fit, false);
    await press(page, 'Control+0');
    assertFitLayout(await snap(page), 'Ctrl+0 후');
    c.obs(`Ctrl+1 후 900x700 리사이즈 → scale=${s.scaleStr}, fit=${s.fit}`);
  }),
]);

// =============================================================== SUITE: 전체화면 (WIN)
suite('fullscreen', () => F.b1, [
  step('WIN-01', 'F11 전체화면 진입/해제 (main isFullScreen 확인)', '폴링 최대 8s', async (c) => {
    const { page, app } = c;
    try {
      assert.equal(await isFullScreen(app), false);
      await press(page, 'F11');
      await poll(async () => (await isFullScreen(app)) === true, { timeout: 8000, desc: 'F11 → 전체화면' });
      await press(page, 'F11');
      await poll(async () => (await isFullScreen(app)) === false, { timeout: 8000, desc: 'F11 → 해제' });
      c.obs('F11 → isFullScreen()=true, 다시 F11 → false');
    } finally {
      if (await isFullScreen(app)) await setFullScreen(app, false);
    }
  }),
  step('WIN-02', 'Escape 로 전체화면 해제 (창 모드 Escape 는 무해)', '폴링 최대 8s', async (c) => {
    const { page, app } = c;
    try {
      await press(page, 'F11');
      await poll(async () => (await isFullScreen(app)) === true, { timeout: 8000, desc: 'F11 → 전체화면' });
      await press(page, 'Escape');
      await poll(async () => (await isFullScreen(app)) === false, { timeout: 8000, desc: 'Escape → 해제' });
      await sleep(400);
      await press(page, 'Escape');
      await sleep(300);
      assert.equal(await isFullScreen(app), false);
      assert.equal((await snap(page)).state, 'ready');
      c.obs('전체화면에서 Escape → isFullScreen()=false; 창 모드 Escape → false 유지, state=ready');
    } finally {
      if (await isFullScreen(app)) await setFullScreen(app, false);
    }
  }),
  step('WIN-03', '전체화면에서도 상단 바(파일명 등) 표시, fit 재계산', '상단 바 가시성(rect/display/visibility/elementFromPoint), scale ±1e-4', async (c) => {
    const { page, app } = c;
    try {
      const w0 = (await snap(page)).clientWidth;
      await press(page, 'F11');
      await poll(async () => (await isFullScreen(app)) === true, { timeout: 8000, desc: 'F11 → 전체화면' });
      const s = await waitSnap(page, (v) => v.clientWidth !== w0, '전체화면 리사이즈 반영', 8000);
      await sleep(300);
      const info = await page.evaluate(() => {
        const t = document.getElementById('topbar');
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const n = document.getElementById('name');
        const nr = n.getBoundingClientRect();
        const hit = document.elementFromPoint(nr.left + 4, nr.top + nr.height / 2);
        return {
          top: r.top, height: r.height, width: r.width, iw: innerWidth, display: cs.display, visibility: cs.visibility,
          name: n.textContent, index: document.getElementById('index').textContent,
          zoom: document.getElementById('zoom').textContent, dims: document.getElementById('dims').textContent,
          covered: !t.contains(hit), nameVisibleW: nr.width,
        };
      });
      assert.ok(info.top >= 0 && info.height >= 30, `상단 바 rect top=${info.top} h=${info.height}`);
      assert.notEqual(info.display, 'none');
      assert.equal(info.visibility, 'visible');
      assert.equal(info.name, 'ep');
      assert.equal(info.index, '(1/1)');
      assert.equal(info.dims, '800×3000');
      assert.equal(info.covered, false, '상단 바가 다른 요소에 가려짐');
      assert.ok(info.nameVisibleW > 20);
      assertFitLayout(await snap(page), '전체화면');
      c.obs(`전체화면 clientWidth ${w0}→${s.clientWidth}; 상단 바 top=${info.top}, h=${info.height}, w=${info.width}, name="${info.name}", index="${info.index}", dims="${info.dims}", zoom="${info.zoom}"; fit 재계산 OK`);
    } finally {
      if (await isFullScreen(app)) await setFullScreen(app, false);
    }
  }),
]);

// =============================================================== SUITE: 초대형 (BIG)
const HUGE = { entry: null };
suite('huge', () => F.hugeFile, [
  step('BIG-01', '800×80000 로드: state=ready, #dims=800×80000, 폭 맞춤 (+ 스크린샷 픽셀)', 'scale ±1e-4, 높이 ±3px, 픽셀 ±20', async (c) => {
    const { page } = c;
    HUGE.entry = M['huge/huge.png'];
    const s = await waitReady(page, 'huge.png', 90000);
    assert.equal(s.dims, '800×80000');
    assert.equal(s.count, 1);
    assert.equal(s.pages.length, 1);
    assertFitLayout(s, 'huge fit');
    approx(s.pages[0].height, 80000 * s.scale, 3, 'fit 높이');
    approx(s.strip.height, s.pages[0].height, 1, '#strip 높이 = 장 높이');
    assert.ok(s.scrollHeight >= s.strip.height - 2);
    const k = await checkBand(page, HUGE.entry, 'fit 상단');
    c.obs(`state=${s.state}, dims="${s.dims}", fit=${s.fit}, scale=${s.scaleStr}, 표시 높이=${s.pages[0].height.toFixed(0)}, scrollHeight=${s.scrollHeight}, 화면 띠 ${k} 색 일치(렌더링 확인)`);
  }, 120000),
  step('BIG-02', 'End 로 맨 아래 도달 (+ 마지막 띠 픽셀 확인), Home 복귀', 'scrollTop+clientHeight vs scrollHeight ±2', async (c) => {
    const { page } = c;
    const entry = HUGE.entry;
    await press(page, 'End');
    const r = await settleScroll(page);
    const s = await snap(page);
    approx(r.top + s.clientHeight, s.scrollHeight, 2, 'End');
    const kEnd = await checkBand(page, entry, 'fit End 하단', [0.98, 0.95, 0.9]);
    assert.equal(kEnd, entry.colors.length - 1);
    await setScroll(page, Math.floor((s.scrollHeight - s.clientHeight) / 2), null);
    await sleep(200);
    const kMid = await checkBand(page, entry, 'fit 중간');
    await press(page, 'Home');
    await settleScroll(page);
    const kTop = await checkBand(page, entry, 'fit Home 상단', [0.12, 0.2, 0.3]);
    assert.equal(kTop, 0);
    c.obs(`End: scrollTop=${r.top}+clientHeight=${s.clientHeight} vs scrollHeight=${s.scrollHeight}; 하단 띠=${kEnd}/${entry.colors.length - 1}, 중간 띠=${kMid}, Home 후 상단 띠=${kTop}`);
  }, 120000),
  step('BIG-03', '800% 최대 줌 안정성: scale=8, End/Home/중간 스크롤, 앱 응답 + 픽셀 확인', '너비 ±2, 높이 ±4, scrollTop+clientHeight ±2, 픽셀 ±20', async (c) => {
    const { page, app } = c;
    const entry = HUGE.entry;
    await press(page, 'Control+0');
    for (let i = 0; i < 25; i++) await press(page, 'Control+Equal');
    let s = await snap(page);
    assert.equal(s.scaleStr, '8.0000');
    assert.equal(s.zoomText, '800%');
    approx(s.strip.width, 6400, 2, '800% 너비');
    approx(s.strip.height, 640000, 4, '800% 높이');
    assert.ok(s.scrollHeight >= 639000);
    await sleep(300);
    await checkBand(page, entry, '800% 현재 위치');
    await press(page, 'End');
    const r = await settleScroll(page);
    s = await snap(page);
    approx(r.top + s.clientHeight, s.scrollHeight, 2, '800% End');
    const kEnd = await checkBand(page, entry, '800% End 하단', [0.95, 0.9, 0.8]);
    assert.equal(kEnd, entry.colors.length - 1);
    await press(page, 'Home');
    await settleScroll(page);
    const kTop = await checkBand(page, entry, '800% Home', [0.5, 0.6, 0.4]);
    assert.equal(kTop, 0);
    await setScroll(page, 320000, null);
    await sleep(250);
    const kMid = await checkBand(page, entry, '800% 중간');
    const cc = center(s);
    for (let i = 0; i < 6; i++) await ctrlWheel(page, cc.x, cc.y, 600);
    assert.equal(await page.evaluate(() => 1 + 1), 2, '렌더러 응답 없음');
    assert.equal(app.process().exitCode, null, '앱 프로세스 종료됨');
    s = await snap(page);
    assert.equal(s.state, 'ready');
    c.obs(`scale=8.0000(800%), 너비=6400, 높이=640000, scrollHeight=${r.top + s.clientHeight > 0 ? '≈640000' : ''}; End 하단 띠=${kEnd}(마지막), Home 상단 띠=${kTop}, 중간 띠=${kMid}; 이후 Ctrl+휠 축소 6회 후에도 렌더러 응답, 프로세스 생존, state=${s.state}`);
  }, 150000),
  step('ZM-11(추가)', '초대형 fit 에서 리사이즈 시 fit 재계산·가로 스크롤 없음', 'scale ±1e-4', async (c) => {
    const { page, app } = c;
    await press(page, 'Control+0');
    await sleep(300);
    const s = await resizeTo(app, page, 800, 700);
    assertFitLayout(s, 'huge 800x700');
    c.obs(`800x700 → clientWidth=${s.clientWidth}, scale=${s.scaleStr}`);
  }, 90000),
]);

// =============================================================== SUITE: 손상 이미지 (ERR)
// 손상 장은 그 자리에 .page.broken 자리표시자(data-label = "이미지를 불러올 수 없습니다\n파일명")가 생기고 나머지 장은 계속 보인다. body.dataset.state 에 error 는 없다.
const BROKEN_LABEL = (name) => `이미지를 불러올 수 없습니다\n${name}`;
function assertPlaceholder(s, i, name, label) {
  const p = s.pages[i];
  assert.ok(p, `${label}: 장 ${i} 없음`);
  assert.equal(p.broken, true, `${label}: .page.broken 이 아님`);
  assert.equal(p.label, BROKEN_LABEL(name), `${label}: data-label`);
  assert.ok(p.height >= 60, `${label}: 자리표시자 높이 ${p.height}`);
  approx(p.width, s.strip.width, 0.5, `${label}: 자리표시자 폭 = #strip 폭`);
}
const BROKEN_ENTRIES = () => [M['broken/a.png'], null, M['broken/c.png']];

suite('broken', () => F.brokenDir, [
  step('ERR-01', '손상 이미지: state 는 ready 유지(error 없음), 그 장 자리에 .page.broken + 라벨 자리표시자, 이웃 장은 정상 로드', '정확 일치', async (c) => {
    const { page } = c;
    let s = await waitReady(page, 'a.png');
    assert.equal(s.count, 3);
    assert.equal(s.pages.length, 3);
    s = await waitSnap(page, (v) => v.pages[1] && v.pages[1].broken && v.pages[0].complete && v.pages[2].complete, '손상 장 자리표시자 + 이웃 장 로드', 20000);
    assert.equal(s.state, 'ready');
    assertPlaceholder(s, 1, 'broken.png', '손상 장');
    assert.equal(s.pages[1].unsized, true, '헤더를 못 읽은 장은 unsized');
    assert.ok(!s.pages[0].broken && !s.pages[2].broken, '이웃 장이 손상 처리됨');
    assert.deepEqual([s.pages[0].natW, s.pages[0].natH], [800, 600], 'a.png 정상 로드');
    assert.deepEqual([s.pages[2].natW, s.pages[2].natH], [800, 1200], 'c.png 정상 로드');
    assert.equal(s.msgHidden, true, '오류 메시지 영역(#message)을 쓰지 않음');
    assertContiguous(s, '손상 장 포함');
    const sc = stripScale(s);
    approx(s.pages[0].height, 600 * sc, 1, 'a.png 높이');
    approx(s.pages[2].height, 1200 * sc, 1, 'c.png 높이');
    s = await gotoPage(page, 1);
    assert.equal(s.state, 'ready');
    assert.equal(s.index, 1);
    assert.equal(s.pageText, '2/3장');
    assert.equal(s.dims, '', '크기를 모르는 손상 장은 #dims 가 빈 문자열');
    assert.notEqual(s.scaleStr, '', '배율 데이터는 유효해야 함(상태가 error 로 빠지지 않음)');
    assert.equal(s.fit, true);
    approx(s.scrollTop, s.pages[1].y, 1.5, '손상 장 맨 위로 스크롤');
    await shot(page, 'err-01-broken-placeholder.png');
    c.obs(`state=${s.state}, 손상 장 높이=${s.pages[1].height.toFixed(1)}px(unsized=${s.pages[1].unsized}), label="${s.pages[1].label.replace(/\n/g, ' / ')}", a.png/c.png natural ${s.pages[0].natW}×${s.pages[0].natH}/${s.pages[2].natW}×${s.pages[2].natH}, #page=${s.pageText} dims="${s.dims}" data-scale=${s.scaleStr}, #message hidden=${s.msgHidden}`);
  }),
  step('ERR-01(추가)', '손상 장이 있는 상태에서 스크롤/줌/더블클릭/휠 입력이 예외 없이 무해, 자리표시자 유지', 'state=ready 유지 + pageerror 없음', async (c) => {
    const { page } = c;
    await gotoPage(page, 1);
    for (const k of ['ArrowDown', 'ArrowUp', 'PageDown', 'End', 'Home', 'Space', 'Control+Equal', 'Control+Minus', 'Control+0', 'Control+1', 'Control+0']) await press(page, k);
    await page.mouse.dblclick(300, 300);
    await page.mouse.dblclick(300, 300);
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 200);
    await ctrlWheel(page, 300, 300, -200);
    await press(page, 'Control+0');
    const s = await snap(page);
    assert.equal(s.state, 'ready');
    assert.equal(s.pages[1].broken, true, '자리표시자가 사라짐');
    c.obs('11종 키 + 더블클릭 + 휠 + Ctrl+휠 입력 후에도 state=ready 유지, 손상 장 자리표시자 유지, 렌더러 예외 없음');
  }),
  step('ERR-02', '손상 장을 지나도 휠 스크롤·PageDown 이 이어지고 뒤쪽 장도 정상 표시(맨 아래 픽셀 일치). ←/→ 는 회차 이동이라 단독 폴더에서는 장 이동 없이 토스트뿐', '정확 일치, 픽셀 ±20', async (c) => {
    const { page } = c;
    await resetView(page);
    await gotoPage(page, 0);
    let s = await gotoPage(page, 2);
    assert.equal(s.index, 2);
    assert.equal(s.pageText, '3/3장');
    assert.equal(s.dims, '800×1200');
    assert.equal(s.fit, true);
    assert.equal(s.msgHidden, true);
    approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5, 'c.png 맨 위로 스크롤');
    const a = `스크롤로 c.png: state=${s.state} index=${s.index} scrollTop=${s.scrollTop}`;
    await ensureNoToast(page);
    await press(page, 'ArrowRight');
    s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '→ = 회차 이동(단독 폴더 마지막 토스트)');
    assert.equal(s.index, 2, '→ 가 장을 옮김');
    await waitToastHidden(page);
    await press(page, 'ArrowLeft');
    s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_FIRST, '← = 회차 이동(첫 회차 토스트)');
    assert.equal(s.index, 2, '← 가 장을 옮김');
    await resetView(page);
    const p0 = await snap(page);
    const { x, y } = center(p0);
    await page.mouse.move(x, y);
    const idxSeen = [];
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 500);
      await settleScroll(page, 200);
      s = await snap(page);
      assert.equal(s.index, expectedIndex(s), `휠 ${i + 1}회: index 규칙`);
      idxSeen.push(`${s.scrollTop.toFixed(0)}→${s.index}`);
    }
    assert.equal(s.index, 2, '휠로 손상 장을 지나 c.png 까지 이어짐');
    assert.equal(s.pageText, '3/3장');
    await press(page, 'End');
    await settleScroll(page);
    const kEnd = await checkBand(page, BROKEN_ENTRIES(), 'End 하단(손상 장 뒤의 c.png)', [0.95, 0.9, 0.85]);
    assert.equal(checkBand.lastPage, 2);
    assert.equal(kEnd, M['broken/c.png'].colors.length - 1, 'End 하단은 c.png 마지막 띠');
    await press(page, 'Home');
    await settleScroll(page);
    const kTop = await checkBand(page, BROKEN_ENTRIES(), 'Home 상단(a.png)', [0.12, 0.2, 0.3]);
    assert.equal(checkBand.lastPage, 0);
    assert.equal(kTop, 0);
    c.obs(`${a}; →/← 는 토스트만(장 이동 없음); 휠 500px×6 (scrollTop→index): ${idxSeen.join(', ')}; End 하단 = c.png 띠 ${kEnd}(마지막), Home 상단 = a.png 띠 ${kTop}`);
  }),
]);

suite('err-extra', null, [
  step('ERR-01(추가)', '0바이트 PNG 도 자리표시자 + 이웃 장 정상 + 스크롤 계속 (broken-extra: a, c-zero, d)', '정확 일치', async (c) => {
    await withApp(F.brokenExtraDir, async ({ page }) => {
      let s = await waitReady(page, 'a.png');
      s = await waitSnap(page, (v) => v.pages[1] && v.pages[1].broken && v.pages[2].complete, '0바이트 장 자리표시자', 20000);
      assertPlaceholder(s, 1, 'c-zero.png', '0바이트 장');
      assert.equal(s.state, 'ready');
      assert.equal(s.pages[2].natW, 800, 'd.png 정상');
      s = await gotoPage(page, 1);
      assert.equal(s.state, 'ready');
      assert.equal(s.pageText, '2/3장');
      s = await gotoPage(page, 2);
      assert.equal(s.msgHidden, true);
      approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5);
      c.obs('c-zero.png(0바이트) → .page.broken 자리표시자 + state=ready, 이웃 d.png 정상, 스크롤로 d.png 도달');
    });
  }),
  step('ERR-02(추가)', '손상 파일을 처음 인자로 열기: state=ready(index 1, 그 자리에 자리표시자 맨 위), ←/→ 는 토스트(단독 폴더), 스크롤로 뒤쪽 장 정상', '정확 일치', async (c) => {
    await withApp(F.brokenFile, async ({ page }) => {
      let s = await waitReady(page, 'broken.png');
      assert.equal(s.index, 1);
      assert.equal(s.pageText, '2/3장');
      approx(s.scrollTop, s.pages[1].y, 1.5, '손상 파일이 맨 위에 위치');
      s = await waitSnap(page, (v) => v.pages[1].broken, '자리표시자', 15000);
      assertPlaceholder(s, 1, 'broken.png', '인자로 연 손상 파일');
      await ensureNoToast(page);
      await press(page, 'ArrowRight');
      s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '→ 토스트');
      assert.equal(s.index, 1);
      s = await gotoPage(page, 2);
      assert.equal(s.msgHidden, true);
      assert.equal(s.state, 'ready');
      c.obs('broken.png 를 인자로 열면 state=ready(index 1, 자리표시자) 시작, → 토스트(장 이동 없음), 스크롤로 c.png 도달');
    });
  }),
  step('ERR-03', '헤더는 정상이고 본문이 잘린 PNG: 종횡비 칸이 유지되어 레이아웃이 무너지지 않고 이웃 장 정상', '높이 ±1.5, 이웃 장 natural 정확 일치', async (c) => {
    await withApp(F.brokenTruncDir, async ({ page }) => {
      await waitReady(page, 'a.png');
      const s = await waitSnap(page, (v) => v.pages.length === 3 && v.pages.every((p) => p.complete), '모든 장 로드/실패 확정', 20000);
      const b = s.pages[1];
      assert.equal(s.state, 'ready');
      assert.equal(b.attrW, '800', '헤더에서 읽은 폭이 <img width> 로 지정됨');
      assert.equal(b.attrH, '1200', '헤더에서 읽은 높이가 <img height> 로 지정됨');
      assertContiguous(s, '잘린 PNG 포함');
      approx(b.height, 1200 * stripScale(s), 1.5, '본문이 잘려도 헤더 크기대로 칸 유지');
      assert.deepEqual([s.pages[0].natW, s.pages[2].natW], [800, 800], '이웃 장 정상');
      if (b.broken) assert.equal(b.label, BROKEN_LABEL('b-trunc.png'));
      note(`ERR-03 관찰: 본문이 40%만 남은 PNG 는 ${b.broken ? '.page.broken 자리표시자로 처리됨(error 이벤트)' : `부분 디코드로 load 처리됨(natural ${b.natW}×${b.natH}, broken 아님)`}`);
      c.obs(`b-trunc.png: attr ${b.attrW}×${b.attrH}, natural ${b.natW}×${b.natH}, broken=${b.broken}, 칸 높이=${b.height.toFixed(1)} (기대 ${(1200 * stripScale(s)).toFixed(1)}), 이웃 natural ${s.pages[0].natW}/${s.pages[2].natW}`);
    });
  }),
], { noApp: true });

// =============================================================== SUITE: 정렬/확장자 추가 케이스
suite('sort2', () => F.sort2Dir, [
  step('NAV-03(추가)', '장 자연 정렬 대소문자 혼합 + 하위 디렉터리(trap.png) 제외', '정확 일치', async (c) => {
    const seen = await scanPages(c.page);
    assert.deepEqual(seen.map((x) => x.name), ['alpha.png', 'img1.png', 'img2.png', 'Img3.png', 'img10.png', 'IMG11.png', 'Zed.png']);
    for (const x of seen) assert.ok(x.natW === 100 && !x.broken, `${x.name} 로드 ${x.natW}`);
    c.obs(`장 순서=${seen.map((x) => x.name).join(' → ')} (trap.png 디렉터리 제외)`);
  }),
]);

suite('exts', () => F.extsDir, [
  step('NAV-03(추가)', '확장자 필터: jpg/jpeg/png/webp/gif/bmp/avif(+대문자) 포함·디코딩, tif/svg/txt/.bak/무확장자 제외', '정확 일치', async (c) => {
    const seen = await scanPages(c.page);
    assert.deepEqual(seen.map((x) => x.name), ['e1.jpg', 'e2.jpeg', 'e3.png', 'e4.webp', 'e5.gif', 'e6.bmp', 'e7.avif', 'e8.JPG']);
    for (const x of seen) {
      assert.equal(x.state, 'ready', `${x.name} state=${x.state}`);
      assert.ok(!x.broken && x.natW === 200 && x.natH === 600, `${x.name} natural=${x.natW}×${x.natH} broken=${x.broken}`);
    }
    c.obs(`포함 ${seen.length}개 모두 디코딩(200×600): ${seen.map((x) => x.name).join(', ')}`);
  }),
]);

// =============================================================== SUITE: 파일 열기 (OPN, DSP-04)
suite('open', null, [
  step('OPN-01', '이미지 파일 인자로 열기(단독 폴더): 해당 파일의 장이 뷰포트 맨 위 (2.png, UP.PNG, 대소문자 다른 2.PNG), 회차는 그 폴더 1개', '정확 일치, scrollTop ±1.5', async (c) => {
    const cases = [[F.b2, '2.png', 1], [F.bUP, 'UP.PNG', 3], [path.join(F.basicDir, '2.PNG'), '2.png', 1]];
    const obs = [];
    for (const [arg, name, idx] of cases) {
      await withApp(arg, async ({ page }) => {
        const s = await waitReady(page, name);
        assertEpisodeBar(s, { comic: 'basic', name: 'ep', n: 1, N: 1, pages: 4 }, `${name} 인자`);
        assert.equal(s.index, idx);
        assert.equal(s.pageText, `${idx + 1}/4장`);
        approx(s.scrollTop, Math.min(s.pages[idx].y, maxTopOf(s)), 1.5, `${name}: 인자로 연 파일이 맨 위`);
        obs.push(`${path.basename(arg)} → 장 ${s.index + 1}/${s.count}(${baseName(s.cur.src)}), scrollTop ${s.scrollTop} = 장 top ${s.pages[idx].y}`);
      });
    }
    c.obs(obs.join(', '));
  }),
  step('OPN-03', '이미지 없는 폴더(note.txt 만): state=empty, 안내 메시지, 앱 생존', '정확 일치', async (c) => {
    await withApp(F.emptyDir, async ({ page, app }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      assert.equal(s.msgHidden, false);
      assert.ok(s.msgText.includes('이 폴더에 이미지가 없습니다'), `메시지 ${s.msgText}`);
      assert.equal(s.count, 0);
      assert.equal(s.pages.length, 0, '#strip 에 장이 없어야 함');
      for (const k of ['ArrowRight', 'ArrowLeft', 'Control+Equal', 'Control+0', 'PageDown', 'End']) await press(page, k);
      await page.mouse.dblclick(300, 300);
      assert.equal((await snap(page)).state, 'empty');
      assert.equal(app.process().exitCode, null);
      assert.equal(await page.evaluate(() => 1 + 1), 2);
      const api = await page.evaluate(([a, b, d, e]) => Promise.all([a, b, d, e].map((p) => window.longroll.openPath(p))), [F.emptyDir, F.missing, F.bTxt, F.basicDir]);
      assert.equal(api[0].error, 'empty');
      assert.equal(api[1].error, 'not-found');
      assert.equal(api[2].error, 'unsupported');
      assert.equal(api[3].error, undefined);
      assert.equal(api[3].files.length, 4);
      assert.equal(api[3].comic.name, 'basic', 'openPath 상태: comic.name');
      assert.equal(api[3].episodes.length, 1, '단독 폴더 = 회차 1개');
      assert.equal(api[3].episode, 0);
      c.obs(`state=${s.state}, msg="${s.msgText.replace(/\n/g, ' / ')}", count=${s.count}, 입력 후 생존; IPC openPath 오류코드 empty/not-found/unsupported/정상(4개) 확인`);
    });
  }),
  step('OPN-04', '존재하지 않는 경로 인자: 인자 무시 → 빈 상태 안내, 앱 생존', '정확 일치', async (c) => {
    await withApp(F.missing, async ({ page, app }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      assert.equal(s.msgHidden, false);
      assert.ok(s.msgText.includes(EMPTY_PROMPT), `메시지 ${s.msgText}`);
      assert.equal(app.process().exitCode, null);
      assert.equal(await page.evaluate(() => 1 + 1), 2, '렌더러 응답 없음');
      note(`OPN-04/06 관찰: 시작 시 빈 상태에서는 data-count/data-index 속성이 설정되지 않음(count=${s.count}, index=${s.index}). 오류 빈 상태(OPN-03/05)에서는 count=0, index=-1 로 설정됨`);
      c.obs(`state=${s.state}, msg="${s.msgText}" (인자 무시됨), 프로세스 생존·렌더러 응답, data-count=${s.count === null ? '(미설정)' : s.count}`);
    });
  }),
  step('OPN-05', '지원하지 않는 파일(basic/note.txt): state=empty, "지원하지 않는 형식입니다"', '정확 일치', async (c) => {
    await withApp(F.bTxt, async ({ page }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      assert.equal(s.msgHidden, false);
      assert.ok(s.msgText.includes('지원하지 않는 형식입니다'), `메시지 ${s.msgText}`);
      c.obs(`state=${s.state}, msg="${s.msgText.replace(/\n/g, ' / ')}"`);
    });
    await withApp(F.emptyTxt, async ({ page }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      note(`OPN-05 변형: 이미지가 하나도 없는 폴더의 note.txt 를 인자로 열면 메시지="${s.msgText.split('\n')[0]}" (계약: 비이미지 확장자는 unsupported 이지만 이미지 없는 폴더는 empty 가 우선일 수 있음 — state 는 둘 다 empty)`);
    });
  }),
  step('OPN-06', '인자 없이 실행: state=empty, 열기 안내 문구', '정확 일치', async (c) => {
    await withApp(null, async ({ page }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      assert.equal(s.msgHidden, false);
      assert.ok(s.msgText.includes(EMPTY_PROMPT), `메시지 ${s.msgText}`);
      assert.ok(s.msgText.includes('Ctrl+O'));
      assert.equal(s.title, 'Longroll');
      await shot(page, 'opn-06-no-args-empty.png');
      c.obs(`state=${s.state}, msg="${s.msgText}", title="${s.title}", data-count=${s.count === null ? '(미설정)' : s.count}`);
    });
  }),
  step('DSP-04', '한글·특수문자 파일명(FX-NAMES: 특수문자 회차 폴더) 인자로 열기: state=ready, #name=회차 폴더명, #comic=names, 이미지 로드, 그 장이 맨 위', '정확 일치', async (c) => {
    const cases = [['a b #1 %20.jpg', '800×2000'], ['가나다.webp', '800×2000'], [SYM_FILE_NAME, '600×900']];
    const obs = [];
    for (const [name, dims] of cases) {
      await withApp(path.join(F.namesDir, name), async ({ page }) => {
        const s = await waitReady(page, name);
        assert.equal(s.name, NAMES_DIR_NAME, '#name 은 회차 폴더명(특수문자 폴더)');
        assert.equal(s.comic, 'names');
        assert.equal(s.indexText, '(1/1)');
        assert.equal(s.dims, dims);
        assert.equal(s.count, 3);
        const at = s.pages.findIndex((p) => baseName(p.src) === name);
        assert.ok(at >= 0, `장 목록에 ${name} 없음`);
        assert.equal(s.index, at, '연 파일의 장이 현재 장');
        const loaded = await waitSnap(page, (v) => v.cur && v.cur.complete && v.cur.natW > 0, '현재 장 이미지 로드', 15000);
        assert.ok(loaded.cur.natW > 0 && !loaded.cur.broken, '이미지 로드됨');
        assert.ok(decodeURIComponent(loaded.cur.src).endsWith(`/${name}`), `img.src ${loaded.cur.src}`);
        assert.equal(s.title, `${NAMES_DIR_NAME} (1/1) - names - Longroll`);
        obs.push(`"${name}" → ready, #name="${s.name}", #page=${s.pageText}, dims ${s.dims}`);
      });
    }
    c.obs(obs.join(' / '));
  }),
  step('DSP-04(추가)', '특수문자 폴더(경로에도 공백/#/%/&/한글/괄호/작은따옴표) 전체 장 로드', '정확 일치', async (c) => {
    await withApp(F.namesDir, async ({ page }) => {
      const s0 = await waitReady(page, { comic: 'names' });
      assert.equal(s0.name, NAMES_DIR_NAME);
      const seen = await scanPages(page);
      assert.deepEqual(seen.map((x) => x.name).sort(), ['a b #1 %20.jpg', SYM_FILE_NAME, '가나다.webp'].sort());
      for (const x of seen) assert.ok(!x.broken && x.natW > 0, `${x.name} state=${x.state} natW=${x.natW} broken=${x.broken}`);
      c.obs(`폴더 "${NAMES_DIR_NAME}" 장 ${seen.length}개 모두 로드(경로 인코딩 정상)`);
    });
  }),
], { noApp: true });

suite('single-instance', () => F.b1, [
  step('OPN-07', '단일 인스턴스: 새 프로세스는 종료, 기존 창이 새 파일/폴더(만화 폴더·회차 폴더·이미지 파일)를 새 상태 객체로 열고 창은 1개 유지', '새 프로세스 20s 내 종료·종료 코드 0, 정확 일치', async (c) => {
    const { page, app, userData } = c;
    await waitReady(page, { comic: 'basic' });
    const obs = [];
    const r1 = await spawnSecond(F.narrow, userData);
    assert.equal(r1.timedOut, false, '두 번째 프로세스가 종료되지 않음');
    assert.equal(r1.code, 0, `두 번째 프로세스 종료 코드 ${r1.code}`);
    let s = await waitReady(page, { comic: 'narrow' });
    assert.equal(s.dims, '400×1200');
    assertEpisodeBar(s, { comic: 'narrow', name: 'ep', n: 1, N: 1, pages: 1 }, '파일 인자(narrow.png)');
    assert.equal(app.windows().length, 1);
    obs.push(`파일 인자(narrow.png): 새 프로세스 ${r1.ms}ms 후 종료(code ${r1.code}) → 기존 창 #comic=${s.comic}`);
    const r2 = await spawnSecond(F.basicDir, userData);
    assert.equal(r2.timedOut, false);
    s = await waitReady(page, { comic: 'basic' });
    assert.equal(s.count, 4);
    assertEpisodeBar(s, { comic: 'basic', name: 'ep', n: 1, N: 1, pages: 4 }, '폴더 인자(basic)');
    obs.push('폴더 인자(basic) → 4장');
    const r3 = await spawnSecond(F.b10, userData);
    assert.equal(r3.timedOut, false);
    s = await waitReady(page, { comic: 'basic', index: 2 });
    obs.push('파일 인자(10.png) → index 2');
    const r6 = await spawnSecond(F.comicDir, userData);
    assert.equal(r6.timedOut, false);
    s = await waitReady(page, { comic: 'comic', name: '1화' });
    assertEpisodeBar(s, { comic: 'comic', name: '1화', n: 1, N: EP_COUNT, pages: 3 }, '만화 폴더 인자');
    obs.push('만화 폴더 인자(comic) → 1화 (1/3)');
    const r7 = await spawnSecond(F.ep10File3, userData);
    assert.equal(r7.timedOut, false);
    s = await waitReady(page, { comic: 'comic', name: '10화' });
    assert.equal(s.index, 2);
    assert.equal(s.indexText, '(3/3)');
    approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5);
    obs.push('이미지 파일 인자(10화/03.png) → 10화 (3/3) 3번째 장');
    const r8 = await spawnSecond(F.ep2Dir, userData);
    assert.equal(r8.timedOut, false);
    s = await waitReady(page, { comic: 'comic', name: '2화' });
    assert.equal(s.indexText, '(2/3)');
    obs.push('회차 폴더 인자(2화) → (2/3)');
    const r4 = await spawnSecond(F.bTxt, userData);
    assert.equal(r4.timedOut, false);
    s = await waitSnap(page, (v) => !v.toastHidden, '지원하지 않는 형식 토스트', 8000);
    assert.ok(s.toastText.includes('지원하지 않는 형식'), `토스트 ${s.toastText}`);
    assert.equal(s.name, '2화');
    obs.push(`지원 안 하는 파일 → 현재 보기 유지 + 토스트 "${s.toastText}"`);
    await waitSnap(page, (v) => v.toastHidden, '토스트 소멸', 5000);
    const r5 = await spawnSecond(F.missing, userData);
    assert.equal(r5.timedOut, false);
    await sleep(500);
    s = await snap(page);
    assert.equal(s.name, '2화');
    assert.equal(s.state, 'ready');
    assert.equal(app.windows().length, 1);
    obs.push('존재하지 않는 경로 → 변화 없음, 창 1개 유지');
    c.obs(obs.join(' / '));
  }, 180000),
]);

// =============================================================== SUITE: 보안 (SEC)
suite('security', () => F.b1, [
  step('SEC-01', '렌더러 격리: contextIsolation=true, nodeIntegration=false, sandbox=true', '정확 일치 (webContents.getLastWebPreferences)', async (c) => {
    const p = await c.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { contextIsolation: w.contextIsolation, nodeIntegration: w.nodeIntegration, sandbox: w.sandbox, webSecurity: w.webSecurity, nodeIntegrationInWorker: w.nodeIntegrationInWorker };
    });
    assert.equal(p.contextIsolation, true);
    assert.equal(p.nodeIntegration, false);
    assert.equal(p.sandbox, true);
    c.obs(JSON.stringify(p));
  }),
  step('SEC-02', '렌더러에 Node API 없음: typeof require/process === "undefined"', '정확 일치 (main world 에서 평가)', async (c) => {
    const t = await c.page.evaluate(() => ({ require: typeof require, process: typeof process, module: typeof module, Buffer: typeof Buffer, global: typeof global }));
    assert.equal(t.require, 'undefined');
    assert.equal(t.process, 'undefined');
    assert.equal(t.module, 'undefined');
    c.obs(JSON.stringify(t));
  }),
  step('SEC-03', '노출 API 범위: window.longroll 키가 기존 8개 + 회차 이동 함수 1개(이름에 episode 포함, 라운드 3 viewer:go-episode)로 한정, 전부 function', '기존 8개 포함, 추가 키는 1~2개이고 /episode/i 에 맞는 function 뿐', async (c) => {
    const BASE = ['exitFullscreen', 'getInitial', 'onNav', 'onOpen', 'openDialog', 'openPath', 'pathForFile', 'toggleFullscreen'];
    const info = await c.page.evaluate(() => ({ keys: Object.keys(window.longroll), types: Object.fromEntries(Object.entries(window.longroll).map(([k, v]) => [k, typeof v])) }));
    for (const k of BASE) assert.ok(info.keys.includes(k), `기존 API ${k} 가 사라짐: ${info.keys}`);
    const extra = info.keys.filter((k) => !BASE.includes(k));
    assert.ok(extra.length >= 1 && extra.length <= 2, `추가 API 는 회차 이동용 1~2개여야 함: ${extra}`);
    for (const k of extra) assert.match(k, /episode/i, `의도하지 않은 추가 API ${k}`);
    assert.ok(Object.values(info.types).every((t) => t === 'function'));
    c.obs(`keys=[${info.keys.join(', ')}] (추가: ${extra.join(', ')}), 모두 function`);
  }),
  step('SEC-04', '외부 이동 차단: location 변경/링크 클릭/window.open 후 페이지 불변', '마커·URL·state·창 수 불변. 대상 URL 은 127.0.0.1:9(실제 외부 접속 없음)', async (c) => {
    const { page, app } = c;
    const url0 = page.url();
    await page.evaluate(() => { window.__marker = 'alive'; });
    const attempts = [
      () => page.evaluate(() => { location.href = 'http://127.0.0.1:9/blocked'; }),
      () => page.evaluate(() => { location.assign('file:///C:/Windows/win.ini'); }),
      () => page.evaluate(() => { const a = document.createElement('a'); a.href = 'http://127.0.0.1:9/link'; document.body.appendChild(a); a.click(); a.remove(); }),
      () => page.evaluate(() => { window.open('http://127.0.0.1:9/popup'); }),
    ];
    for (const a of attempts) {
      await a();
      await sleep(500);
    }
    const after = await page.evaluate(() => ({ href: location.href, marker: window.__marker, state: document.body.dataset.state, name: document.getElementById('name').textContent }));
    assert.equal(after.href, url0, `URL 변경됨 ${after.href}`);
    assert.equal(after.marker, 'alive', '페이지가 새로 로드됨(마커 소실)');
    assert.equal(after.state, 'ready');
    assert.equal(after.name, 'ep');
    assert.equal(app.windows().length, 1, '새 창이 열림');
    c.obs(`시도 4종(location.href, location.assign(file://), <a> 클릭, window.open) 후 URL 불변("${after.href.slice(-24)}"), 마커 유지, state=${after.state}, 창 ${app.windows().length}개`);
  }),
]);

// =============================================================== SUITE: F11/최대화/대각선 리사이즈 위치 유지 (ZM-15)
const waitWin = (app, pred, desc) => poll(async () => pred(await winState(app)), { timeout: 8000, interval: 60, desc });

suite('pos-keep', () => F.tallFile, [
  step('ZM-15', 'F11 진입/해제·최대화/해제·대각선 setSize 후 뷰포트 상단 기준 위치 유지 (시작 scrollTop 0/3000/30000)', `scrollTop/scale(원본 y) 오차 ≤ ${TOP_Y_TOL} 원본 px(시작값 기준), 시작 0 이면 scrollTop 정확 0`, async (c) => {
    const { page, app } = c;
    const problems = [];
    const obs = [];
    const normalize = async (startTop) => {
      const st = await winState(app);
      if (st.fs) { await setFullScreen(app, false); await waitWin(app, (v) => !v.fs, '전체화면 해제'); }
      if (st.max) { await setMaximized(app, false); await waitWin(app, (v) => !v.max, '최대화 해제'); }
      await resizeTo(app, page, 1100, 850);
      await press(page, 'Control+0');
      await setScroll(page, startTop, 0);
      await sleep(200);
      await settleLayout(page, 400);
      return snap(page);
    };
    const sizeOp = (w, h) => async () => {
      await setSizeNow(app, w, h);
      await waitWin(app, (v) => Math.abs(v.size[0] - w) <= 2 && Math.abs(v.size[1] - h) <= 2, `setSize ${w}x${h}`);
    };
    const ops = [
      ['F11 진입', async () => { await press(page, 'F11'); await waitWin(app, (v) => v.fs, 'F11 → 전체화면'); }],
      ['F11 해제', async () => { await press(page, 'F11'); await waitWin(app, (v) => !v.fs, 'F11 → 해제'); }],
      ['최대화', async () => { await setMaximized(app, true); await waitWin(app, (v) => v.max, '최대화'); }],
      ['최대화 해제', async () => { await setMaximized(app, false); await waitWin(app, (v) => !v.max, '최대화 해제'); }],
      ['대각선 축소 760x620', sizeOp(760, 620)],
      ['대각선 확대 1300x900', sizeOp(1300, 900)],
    ];
    for (const startTop of [0, 3000, 30000]) {
      let s = await normalize(startTop);
      const y0 = topY(s);
      approx(s.scrollTop, startTop, 1, '시작 scrollTop 설정');
      let prevView = `${s.clientWidth}x${s.clientHeight}`;
      const line = [`시작 ${startTop}(원본 y ${y0.toFixed(1)}, ${prevView})`];
      for (const [label, op] of ops) {
        const tag = `시작 ${startTop} · ${label}`;
        try {
          await op();
          await sleep(300);
          await settleLayout(page, 500, 12000);
          await assertOnSecondary(app, `ZM-15 ${tag}`);
          s = await snap(page);
        } catch (e) {
          problems.push(`${tag}: 동작/정착 실패 — ${String(e.message).split('\n')[0]}`);
          continue;
        }
        const view = `${s.clientWidth}x${s.clientHeight}`;
        const y = topY(s);
        const why = [];
        if (view === prevView) why.push(`뷰포트가 바뀌지 않음(${view})`);
        if (s.fit !== true) why.push(`fit=${s.fit}`);
        if (Math.abs(y - y0) > TOP_Y_TOL) why.push(`상단 원본 y ${y.toFixed(1)} (시작 ${y0.toFixed(1)}, Δ${(y - y0).toFixed(1)} > ±${TOP_Y_TOL})`);
        if (startTop === 0 && s.scrollTop !== 0) why.push(`scrollTop=${s.scrollTop} (0 이어야 함)`);
        if (why.length) problems.push(`${tag}: scrollTop=${s.scrollTop}, ${view}, ${why.join('; ')}`);
        line.push(`${label}→scrollTop ${s.scrollTop}(Δy ${(y - y0).toFixed(1)}, ${view})`);
        prevView = view;
      }
      obs.push(line.join(' / '));
    }
    for (const o of obs) c.obs(o);
    if (problems.length) {
      console.log(`      [ZM-15] 위반 ${problems.length}건:\n${problems.map((p) => `        - ${p}`).join('\n')}`);
      c.obs(`위반 ${problems.length}건 (첫 3건: ${problems.slice(0, 3).join(' || ')})`);
    }
    assert.equal(problems.length, 0, `ZM-15 위치 유지 위반 ${problems.length}건 — ${problems.slice(0, 3).join(' || ')}`);
  }, 300000),
  step('ZM-15(추가)', 'F11 진입/해제 5회 반복 후 누적 이동(drift) 없음 (시작 scrollTop 30000, 0)', `매 진입/해제 후 원본 y 오차 ≤ ${TOP_Y_TOL} 원본 px(시작값 기준), 시작 0 이면 scrollTop 정확 0`, async (c) => {
    const { page, app } = c;
    const problems = [];
    for (const startTop of [30000, 0]) {
      const st = await winState(app);
      if (st.fs) { await setFullScreen(app, false); await waitWin(app, (v) => !v.fs, '전체화면 해제'); }
      await resizeTo(app, page, 1100, 850);
      await press(page, 'Control+0');
      await setScroll(page, startTop, 0);
      await sleep(200);
      await settleLayout(page, 400);
      let s = await snap(page);
      const y0 = topY(s);
      const seq = [];
      let maxDrift = 0;
      for (let i = 1; i <= 5; i++) {
        for (const [label, want] of [['진입', true], ['해제', false]]) {
          await press(page, 'F11');
          await waitWin(app, (v) => v.fs === want, `F11 ${label}`);
          await sleep(300);
          await settleLayout(page, 500, 12000);
          await assertOnSecondary(app, `ZM-15(추가) 시작 ${startTop} #${i} ${label}`);
          s = await snap(page);
          const d = topY(s) - y0;
          maxDrift = Math.max(maxDrift, Math.abs(d));
          seq.push(`${i}${label === '진입' ? '▲' : '▼'}${d.toFixed(1)}`);
          if (Math.abs(d) > TOP_Y_TOL) problems.push(`시작 ${startTop} #${i} ${label}: 원본 y Δ${d.toFixed(1)} (scrollTop=${s.scrollTop})`);
          if (startTop === 0 && s.scrollTop !== 0) problems.push(`시작 0 #${i} ${label}: scrollTop=${s.scrollTop}`);
        }
      }
      c.obs(`시작 ${startTop}: F11 5회 반복 최대 |drift|=${maxDrift.toFixed(2)} 원본 px [${seq.join(' ')}]`);
    }
    if (problems.length) console.log(`      [ZM-15(추가)] 위반 ${problems.length}건 (첫 4건): ${problems.slice(0, 4).join(' || ')}`);
    assert.equal(problems.length, 0, `F11 반복 drift 위반 ${problems.length}건 — ${problems.slice(0, 3).join(' || ')}`);
  }, 300000),
]);

// =============================================================== SUITE: 소수 배율(DPR) 폭 맞춤 가로 스크롤바 (ZM-16)
suite('dpr-fit', null, [
  step(['ZM-16', 'LBX-03'], 'DPR 1.25/1.75/1.1 에서 창 폭 600~1491(11px 간격 82개) 스윕: 폭 맞춤(레터박스) 시 가로 스크롤바 없음, #strip 폭 = clientWidth/1.1', '오차 없음: scrollWidth ≤ clientWidth, 가로 스크롤바 두께 0, scrollLeft 0, fit=true, 레이아웃 정착, #strip 폭 ±1px', async (c) => {
    // 디버깅용: LONGROLL_E2E_DPRS=1.25,1.75 처럼 DPR 일부만 실행할 수 있다(기본은 3종 전부)
    const DPRS = process.env.LONGROLL_E2E_DPRS ? process.env.LONGROLL_E2E_DPRS.split(',').map(Number) : [1.25, 1.75, 1.1];
    const widths = Array.from({ length: 82 }, (_, i) => 600 + 11 * i);
    const configs = [
      { label: '800×3000', file: F.b1, heights: [850] },
      { label: '800×600', file: F.shortFile, heights: [850, 700, 560] },
    ];
    let totalBad = 0;
    let totalCases = 0;
    const firstBad = [];
    for (const dpr of DPRS) {
      const pos = dsfWindowPos(dpr);
      for (const cfg of configs) {
        const h = await launchApp(cfg.file, { pre: [`--force-device-scale-factor=${dpr}`], pos });
        try {
          const s0 = await snap(h.page);
          assert.ok(Math.abs(s0.dpr - dpr) < 1e-3, `DPR 강제 실패: devicePixelRatio=${s0.dpr} (요청 ${dpr})`);
          for (const H of cfg.heights) {
            const bad = [];
            for (const w of widths) {
              const { snap: s, unstable } = await resizeSync(h.app, h.page, w, H);
              const why = [];
              if (unstable) why.push('레이아웃 불안정');
              if (!(s.scrollWidth <= s.clientWidth)) why.push(`scrollWidth ${s.scrollWidth} > clientWidth ${s.clientWidth}`);
              const hb = s.offsetHeight - s.clientHeight;
              if (hb !== 0) why.push(`가로 스크롤바 두께 ${hb}`);
              if (s.hbar && barVisible(s.hbar)) why.push('#hbar 표시됨');
              if (s.scrollLeft !== 0) why.push(`scrollLeft ${s.scrollLeft}`);
              if (s.fit !== true) why.push(`fit=${s.fit}`);
              if (Math.abs(s.strip.width - s.clientWidth / LB) > 1) why.push(`#strip 폭 ${s.strip.width.toFixed(2)} ≠ clientWidth/1.1 = ${(s.clientWidth / LB).toFixed(2)}`);
              if (why.length) bad.push({ w, why: why.join('; ') });
            }
            totalBad += bad.length;
            totalCases += widths.length;
            const msg = `DPR ${dpr} ${cfg.label} 창높이 ${H}: 위반 ${bad.length}/${widths.length} 폭${bad.length ? ` [${bad.slice(0, 6).map((b) => `${b.w}(${b.why})`).join(', ')}${bad.length > 6 ? ', …' : ''}]` : ''}`;
            console.log(`      [ZM-16] ${msg}`);
            c.obs(msg);
            if (bad.length && firstBad.length < 3) firstBad.push(msg);
          }
        } finally {
          rendererErrorTotal += h.errors.length;
          await shutdown(h);
        }
        assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
      }
    }
    assert.equal(totalBad, 0, `ZM-16 위반 ${totalBad}/${totalCases} (DPR×이미지×높이×폭 조합) — ${firstBad.join(' || ')}`);
  }, 1200000),
], { noApp: true });

// =============================================================== SUITE: 스무스 스크롤 연속 입력 누적 (SCR-07)
async function toTopSettled(page) {
  await settleScroll(page, 300, 8000);
  await setScroll(page, 0, null);
  await sleep(150);
  const r = await settleScroll(page, 250, 4000);
  assert.equal(r.top, 0, `맨 위 초기화 실패 scrollTop=${r.top}`);
}

async function settleOrNaN(page, quiet, timeout) {
  try { return (await settleScroll(page, quiet, timeout)).top; } catch { return NaN; }
}

// ---- SCR-08 헬퍼 (plan.md §8-4). 블랙박스: 키 입력 + #scroller.scrollTop + 캡처 단계 이벤트 기록만 쓴다.
const quantile = (a, p) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const fx = (v, d = 2) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : String(v));

// page.evaluate 로 직렬화되므로 외부 변수를 참조하지 않는다. 페이지당 한 번만 설치(멱등).
// 프레임 행 = [ts, now, scrollTop, data-index]: rAF 콜백에서는 ts 만 잡고, 같은 프레임 렌더링 이후 MessageChannel 메시지(다음 태스크)에서 scrollTop 을 읽는다
// → 앱의 rAF 가 그 프레임에 쓴 값이 그 프레임의 ts 와 짝지어진다(콜백 순서와 무관).
// 단 메시지 태스크가 다음 프레임의 rAF 단계 뒤로 밀리면(키 입력 처리 직후 등, 실측 약 3% 프레임) 그 프레임의 값을 읽을 수 없으므로(다음 프레임 값을 읽게 됨)
// seq 로 검출해 그 행을 버리고 late 로 센다(버린 뒤 이웃 행의 dy/dt 는 2프레임 구간으로 정확히 맞는다. 앱이 프레임을 건너뛴 경우는 메시지가 늦지 않으므로 그대로 정지 프레임으로 잡힌다).
function scrollRecorderFn() {
  if (window.__scr) return;
  const s = document.getElementById('scroller');
  const R = { on: false, gen: 0, seq: 0, late: 0, start: 0, frames: [], keys: [], keyups: [], marks: [], scrollends: 0, q: [] };
  const mc = new MessageChannel();
  mc.port1.onmessage = () => {
    const e = R.q.shift();
    if (e === undefined || !R.on) return;
    if (e[1] !== R.seq) { R.late++; return; }
    R.frames.push([e[0], performance.now(), s.scrollTop, Number(document.body.dataset.index)]);
  };
  const loopFor = (g) => {
    const loop = (ts) => {
      if (!R.on || g !== R.gen) return;
      R.seq++;
      R.q.push([ts, R.seq]);
      mc.port2.postMessage(0);
      requestAnimationFrame(loop);
    };
    return loop;
  };
  const mark = (k, e) => {
    const t = e && e.target;
    R.marks.push({ k, now: performance.now(), top: s.scrollTop, key: e && e.key !== undefined ? e.key : null, tgt: t ? String((t.className && t.className.baseVal) || t.className || t.id || t.nodeName || '') : null });
  };
  window.addEventListener('keydown', (e) => { if (R.on) R.keys.push([performance.now(), e.key, e.repeat]); mark('keydown', e); }, true);
  window.addEventListener('keyup', (e) => { if (R.on) R.keyups.push([performance.now(), e.key]); }, true);
  window.addEventListener('wheel', (e) => mark('wheel', e), { capture: true, passive: true });
  window.addEventListener('mousedown', (e) => mark('mousedown', e), true);
  window.addEventListener('pointerdown', (e) => mark('pointerdown', e), true);
  s.addEventListener('scrollend', () => { if (R.on) R.scrollends++; });
  window.__scr = {
    clearMarks: () => { R.marks.length = 0; },
    getMarks: () => R.marks.slice(),
    addMark: (k, top) => R.marks.push({ k, now: performance.now(), top, key: null, tgt: null }),
    start: () => {
      R.frames = []; R.keys = []; R.keyups = []; R.marks = []; R.scrollends = 0; R.q = []; R.late = 0;
      R.start = s.scrollTop;
      R.on = true;
      R.gen++;
      requestAnimationFrame(loopFor(R.gen));
    },
    stop: () => {
      R.on = false;
      R.q = [];
      return { frames: R.frames, keys: R.keys, keyups: R.keyups, scrollends: R.scrollends, late: R.late, start: R.start, ch: s.clientHeight, max: s.scrollHeight - s.clientHeight, vis: document.visibilityState, dpr: devicePixelRatio };
    },
  };
}
const installScrollRecorder = (page) => page.evaluate(scrollRecorderFn);

// rAF 가 실제로 돈다는 환경 가드(창이 가려지거나 최소화되면 rAF 가 멈춰 지표가 의미 없음)
async function assertRafAlive(page) {
  const r = await page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = performance.now();
        let n = 0;
        const f = () => {
          n++;
          if (performance.now() - t0 < 300) requestAnimationFrame(f);
          else res({ n, vis: document.visibilityState });
        };
        requestAnimationFrame(f);
        setTimeout(() => res({ n, vis: document.visibilityState, timeout: true }), 1500);
      })
  );
  if (r.vis !== 'visible' || r.n < 6) throw new Error(`환경: rAF 미동작 — visibilityState=${r.vis}, 300ms 동안 rAF ${r.n}회 (창이 가려졌거나 최소화·백그라운드 스로틀링이면 스크롤 애니메이션을 측정할 수 없음)`);
}

// 기록 시작 → 120ms → run() → 정착 대기(400ms 정지, 최대 8s) → 50ms → 기록 종료. 환경 가드(visible 아님/프레임<30/dt 중앙값>20ms)면 '환경: rAF 미동작' 으로 실패.
async function recordScroll(page, run) {
  await installScrollRecorder(page);
  await page.evaluate(() => window.__scr.start());
  let rec = null;
  let settled = NaN;
  let ret;
  try {
    await sleep(120);
    ret = await run();
    settled = await settleOrNaN(page, 400, 8000);
    await sleep(50);
  } finally {
    rec = await page.evaluate(() => window.__scr.stop());
  }
  const dts = [];
  for (let i = 1; i < rec.frames.length; i++) dts.push(rec.frames[i][0] - rec.frames[i - 1][0]);
  const dtMed = quantile(dts, 0.5);
  if (rec.vis !== 'visible' || rec.frames.length < 30 || !(dtMed <= 20)) {
    throw new Error(`환경: rAF 미동작 — visibilityState=${rec.vis}, 프레임 ${rec.frames.length}개, dt 중앙값 ${fx(dtMed, 1)}ms (창이 가려졌거나 최소화·백그라운드 스로틀링이면 측정할 수 없음)`);
  }
  rec.settled = settled;
  rec.ret = ret;
  return rec;
}

// 키 입력. mode: 'hold' = 같은 키의 keydown 을 gap(33ms)마다 n번(자동반복, 마지막에 keyup 1번) / 'press' = press(down+up) n번 /
// 'os' = 첫 keydown, 500ms 뒤 나머지 n-1번(Windows 키 반복 지연 흉내). 'Shift+Space' 는 Shift 를 누른 채 입력한다.
// hook: { at, fn } — at 번째(1부터) 키 입력 직후 fn 을 한 번 실행한다(예: 애니메이션 도중 이미지 교체).
async function holdKeys(page, key, n, mode = 'hold', gap = 33, hook = null) {
  const parts = key.split('+');
  const base = parts.pop();
  const mods = parts;
  let count = 0;
  const after = async () => {
    count++;
    if (hook && count === hook.at) await hook.fn();
  };
  const paced = async (cnt, fn) => {
    const t0 = Date.now();
    for (let i = 0; i < cnt; i++) {
      await fn(i);
      const w = t0 + (i + 1) * gap - Date.now();
      if (w > 0) await sleep(w);
    }
  };
  if (mode === 'press') {
    await paced(n, async () => {
      await page.keyboard.press(key);
      await after();
    });
    return;
  }
  for (const m of mods) await page.keyboard.down(m);
  try {
    let rest = n;
    if (mode === 'os') {
      await page.keyboard.down(base);
      await after();
      await sleep(500);
      rest = n - 1;
    }
    await paced(rest, async () => {
      await page.keyboard.down(base);
      await after();
    });
  } finally {
    await page.keyboard.up(base);
    for (const m of [...mods].reverse()) await page.keyboard.up(m);
  }
}

// plan.md §8-4(6) M6 정의 그대로. 기록 행 = [ts, now, top, idx], dir = sign(expectFinal − start)(0 이면 +1),
// tDown0 = 첫 keydown now, tHold0 = (첫 repeat keydown 이 있으면 그 now, 없으면 tDown0) + 150ms, tUp = max(마지막 keydown now, 마지막 keyup now)
// (Shift/Control/Alt/Meta 자체의 keydown/keyup 은 제외 — Shift+Space 에서 tDown0/tUp 이 수정자 키로 밀리지 않게).
// 프레임 i(≥1): dy = (top_i − top_{i−1})·dir, dt = ts_i − ts_{i−1}, v = dy/dt. H = now ∈ [tHold0, tUp] 인 프레임.
function smoothMetrics(rec, start, expectFinal, ch) {
  const isMod = (k) => k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta';
  const keys = rec.keys.filter((k) => !isMod(k[1]));
  const ups = rec.keyups.filter((k) => !isMod(k[1]));
  if (keys.length === 0) throw new Error('keydown 이 기록되지 않음(키 입력이 페이지에 도달하지 않음)');
  const fr = rec.frames;
  const dir = Math.sign(expectFinal - start) || 1;
  const tDown0 = keys[0][0];
  const rep = keys.find((k) => k[2]);
  const tHold0 = (rep ? rep[0] : tDown0) + SMOOTH_HOLD.warmupMs;
  const tUp = Math.max(keys[keys.length - 1][0], ups.length ? ups[ups.length - 1][0] : 0);
  const f = [];
  for (let i = 1; i < fr.length; i++) {
    const dt = fr[i][0] - fr[i - 1][0];
    const dy = (fr[i][2] - fr[i - 1][2]) * dir;
    f.push({ ts: fr[i][0], now: fr[i][1], dt, dy, v: dt > 0 ? dy / dt : 0, top: fr[i][2] });
  }
  const H = f.filter((x) => x.now >= tHold0 && x.now <= tUp);
  const A = f.filter((x) => x.now > tUp);
  const vH = H.map((x) => x.v);
  const vMed = quantile(vH, 0.5);
  const moving = f.filter((x) => Math.abs(x.dy) >= 0.5);
  const firstMove = moving[0];
  const lastMove = moving[moving.length - 1];
  const afterUp = f.find((x) => x.now > tUp) || f[f.length - 1];
  const dtMed = quantile(f.map((x) => x.dt), 0.5);
  const dtMedH = quantile(H.map((x) => x.dt), 0.5);
  const total = Math.abs(expectFinal - start);
  const tops = fr.map((r) => r[2]);
  return {
    dir, nH: H.length, tDown0, tHold0, tUp,
    stall: H.length ? H.filter((x) => Math.abs(x.dy) < 0.5).length / H.length : NaN,
    back: f.filter((x) => x.dy < -0.5).length,
    maxMed: vMed > 0 ? Math.max(...vH) / vMed : Infinity,
    minMed: vMed > 0 ? Math.min(...vH) / vMed : 0,
    burst: vMed > 0 ? Math.max(0, ...A.map((x) => x.v)) / vMed : Infinity,
    remainVh: afterUp ? Math.abs(expectFinal - afterUp.top) / ch : NaN,
    settleMs: lastMove ? lastMove.now - tUp : 0,
    latencyMs: firstMove ? firstMove.now - tDown0 : NaN,
    moveFrames: moving.length,
    moveSpanMs: moving.length ? lastMove.now - firstMove.now : 0,
    maxStepFrac: total > 0 ? Math.max(...f.map((x) => (x.dt > 0 ? x.dy * (dtMed / x.dt) : 0))) / total : NaN,
    hitch: H.filter((x) => x.dt > SMOOTH_HOLD.hitch * dtMedH).length,
    dtMed, vMed, late: rec.late,
    topMin: Math.min(...tops), topMax: Math.max(...tops), frames: fr.length,
    idxMonotone: fr.every((r, i) => i === 0 || r[3] >= fr[i - 1][3]),
  };
}
const fmtMetrics = (m) =>
  `stall=${fx(m.stall)} back=${m.back} maxMed=${fx(m.maxMed)} minMed=${fx(m.minMed)} burst=${fx(m.burst)} remain=${fx(m.remainVh)}vh settle=${fx(m.settleMs, 0)}ms latency=${fx(m.latencyMs, 0)}ms hitch=${m.hitch} late=${m.late} dtMed=${fx(m.dtMed, 1)}ms`;

// 홀드 합격 기준(①~⑧ + minMed). 위반 문자열 배열을 돌려준다(NaN 은 위반).
function holdViolations(m, rec, expect, label, tol = SMOOTH_TOL) {
  const T = SMOOTH_HOLD;
  const v = [];
  if (!(Math.abs(rec.settled - expect) <= tol)) v.push(`${label}: 최종 scrollTop=${rec.settled} (기대 ${expect.toFixed(1)} ±${tol})`);
  if (m.back !== 0) v.push(`${label}: 뒤로 가는 프레임 ${m.back}개 (기대 0)`);
  if (!(m.stall <= T.stall)) v.push(`${label}: 정지 프레임 비율 ${fx(m.stall)} > ${T.stall} (H 프레임 ${m.nH})`);
  if (!(m.maxMed <= T.maxMed)) v.push(`${label}: 최대/중앙 속도 ${fx(m.maxMed)} > ${T.maxMed}`);
  if (!(m.minMed >= T.minMed)) v.push(`${label}: 최저/중앙 속도 ${fx(m.minMed)} < ${T.minMed}`);
  if (!(m.burst <= T.burst)) v.push(`${label}: 뗀 뒤 몰아치기 ${fx(m.burst)} > ${T.burst}`);
  if (!(m.remainVh <= T.remainVh)) v.push(`${label}: 뗄 때 남은 거리 ${fx(m.remainVh)}화면 > ${T.remainVh}`);
  if (!(m.settleMs <= T.settleMs)) v.push(`${label}: 뗀 뒤 정착 ${fx(m.settleMs, 0)}ms > ${T.settleMs}`);
  if (!(m.latencyMs <= T.latencyMs)) v.push(`${label}: 첫 이동까지 ${fx(m.latencyMs, 0)}ms > ${T.latencyMs}`);
  return v;
}

const holdTarget = (start, sign, n, ch, max) => Math.min(max, Math.max(0, start + sign * n * 0.9 * ch));
const topNow = (page) => page.evaluate(() => document.getElementById('scroller').scrollTop);

// 지정 위치로 이동해 정지시킨다(진행 중인 애니메이션이 끝나길 기다린 뒤 외부 쓰기)
async function toPos(page, y) {
  await settleScroll(page, 300, 8000);
  await setScroll(page, y, null);
  await sleep(150);
  const r = await settleScroll(page, 250, 4000);
  assert.ok(Math.abs(r.top - y) <= 1, `시작 위치 설정 실패: scrollTop=${r.top} (기대 ${y})`);
  return r.top;
}

// 홀드 1회 실행 + 판정(SCR-08 a~c, i 공용). start 는 시작 scrollTop, sign 은 +1(아래)/-1(위).
async function holdCase(page, ctx, { key, sign, n = 30, mode = 'hold', start = 0, label }) {
  await toPos(page, start);
  const rec = await recordScroll(page, () => holdKeys(page, key, n, mode));
  const expect = holdTarget(rec.start, sign, n, ctx.ch, ctx.max);
  const m = smoothMetrics(rec, rec.start, expect, ctx.ch);
  const bad = holdViolations(m, rec, expect, label);
  return { rec, m, expect, bad, row: `${label}: ${fmtMetrics(m)} 최종=${rec.settled}${bad.length ? ` [원시 기록 ${dumpRec(label, rec, m)}]` : ''}` };
}
// 판정 실패 시 원시 프레임 기록을 산출물 폴더에 남긴다(원인 분석용). 경로를 돌려준다.
function dumpRec(label, rec, m) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const p = path.join(ARTIFACT_DIR, `scr08-${label.replace(/[^\w가-힣.-]+/g, '_')}.json`);
    fs.writeFileSync(p, JSON.stringify({ label, rec, metrics: m }), 'utf8');
    return p;
  } catch (e) {
    return `(저장 실패: ${e.message})`;
  }
}
async function holdCtx(page) {
  const s = await snap(page);
  return { s, ch: s.clientHeight, max: maxTopOf(s), p90: s.clientHeight * 0.9 };
}

// 취소 시나리오 러너(SCR-08 f, g, n, o): 맨 위에서 PageDown 을 CANCEL_KEYS 회 홀드한 뒤 wait ms 후 cs.act() 를 실행한다.
// 전제: act 시점(cs.at)의 위치가 목표−300 보다 위(애니메이션 진행 중). 아니면 wait 를 줄여 최대 4회 재시도, 끝내 안 되면 premise=false.
async function cancelScenario(page, ctx, cs) {
  const waits = [30, 15, 5, 0];
  let last = null;
  for (let attempt = 0; attempt < waits.length; attempt++) {
    await toPos(page, 0);
    await page.evaluate(() => window.__scr.clearMarks());
    if (cs.pre) await cs.pre();
    await holdKeys(page, 'PageDown', CANCEL_KEYS, 'hold');
    if (waits[attempt]) await sleep(waits[attempt]);
    const ret = await cs.act();
    const mk = await cs.at(ret);
    const fin = await settleOrNaN(page, 400, 8000);
    const at = mk ? mk.top : NaN;
    const target = Math.min(CANCEL_KEYS * ctx.p90, ctx.max);
    last = { fin, at, mk, target, ret, attempt: attempt + 1 };
    if (Number.isFinite(at) && at < target - 300) {
      last.premise = true;
      last.postBad = cs.post ? await cs.post(last) : [];
      return last;
    }
    if (cs.cleanup) await cs.cleanup();
  }
  last.premise = false;
  last.postBad = [];
  return last;
}
const lastMark = async (page, k, key = null) =>
  page.evaluate(([kk, kv]) => {
    const ms = window.__scr.getMarks().filter((m) => m.k === kk && (kv === null || m.key === kv));
    return ms.length ? ms[ms.length - 1] : null;
  }, [k, key]);

// 애니메이션 진행 중 문서를 '숨김' 으로 에뮬레이트하고 visibilitychange 를 보낸 뒤 원복한다(document.hidden·visibilityState 둘 다 덮어쓰고 delete 로 원복).
const hideDocument = (page) =>
  page.evaluate(() => {
    const s = document.getElementById('scroller');
    const before = s.scrollTop;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const after = s.scrollTop;
    const hiddenDuring = document.hidden;
    delete document.hidden;
    delete document.visibilityState;
    return { before, after, hiddenDuring, hiddenAfter: document.hidden, visAfter: document.visibilityState };
  });

// n번째 장의 img.src 를 교체하고 load 시점의 scrollTop 을 window.__swap 에 기록한다(앱 클로저의 pages 에는 접근 불가 → DOM 으로 교체).
function swapImageFn([i, url]) {
  const s = document.getElementById('scroller');
  const img = document.querySelectorAll('#strip .page img')[i];
  const w = (window.__swap = { loaded: false, before: s.scrollTop });
  img.addEventListener('load', () => { w.loaded = true; w.top = s.scrollTop; w.now = performance.now(); }, { once: true });
  img.src = url;
}

// 리사이즈 관찰: 창 크기 변경 후 첫 ResizeObserver 콜백 시점의 scrollTop 을 window.__rz 에 기록(앱의 옵저버가 먼저 만들어져 먼저 실행됨 → 취소 직후 위치)
function armResizeMarkFn() {
  const s = document.getElementById('scroller');
  window.__rz = null;
  if (window.__rzObs) window.__rzObs.disconnect();
  let first = true;
  window.__rzObs = new ResizeObserver(() => {
    if (first) { first = false; return; }
    if (!window.__rz) window.__rz = { top: s.scrollTop, now: performance.now(), ch: s.clientHeight };
  });
  window.__rzObs.observe(s);
}

suite('smooth', () => F.hugeFile, [
  step('SCR-07(a)', 'PageDown 3회 연속 입력(간격 0/100/250ms)이 누적되어 3×90% 이동', `정착 후 ±${SMOOTH_TOL}px (폴링 최대 5s)`, async (c) => {
    const { page } = c;
    const s0 = await snap(page);
    assert.equal(s0.fit, true);
    const p90 = s0.clientHeight * 0.9;
    const bad = [];
    const rows = [];
    for (const gap of [0, 100, 250]) {
      await toTopSettled(page);
      for (let i = 0; i < 3; i++) { await press(page, 'PageDown'); if (gap) await sleep(gap); }
      const top = await settleOrNaN(page, 400, 5000);
      rows.push(`간격 ${gap}ms: ${top}`);
      if (!(Math.abs(top - 3 * p90) <= SMOOTH_TOL)) bad.push(`간격 ${gap}ms: scrollTop=${top} (기대 ${(3 * p90).toFixed(1)} ±${SMOOTH_TOL})`);
    }
    c.obs(`clientHeight=${s0.clientHeight}, 3×90%=${(3 * p90).toFixed(1)}; ${rows.join(', ')}`);
    assert.equal(bad.length, 0, `PageDown 3회 누적 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-07(b)', 'PageDown 직후 60ms 내 ArrowDown: 최종 = 90% + 80', `정착 후 ±${SMOOTH_TOL}px`, async (c) => {
    const { page } = c;
    const s0 = await snap(page);
    const expect = s0.clientHeight * 0.9 + 80;
    const bad = [];
    const rows = [];
    for (const gap of [10, 45]) {
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        await toTopSettled(page);
        await press(page, 'PageDown');
        const t1 = Date.now();
        await sleep(gap);
        const t2 = Date.now();
        await press(page, 'ArrowDown');
        const dt = t2 - t1;
        const top = await settleOrNaN(page, 400, 5000);
        if (dt > 60) continue;
        done = true;
        rows.push(`${gap}ms 후(실측 ${dt}ms): ${top}`);
        if (!(Math.abs(top - expect) <= SMOOTH_TOL)) bad.push(`PageDown→${gap}ms→↓: scrollTop=${top} (기대 ${expect.toFixed(1)} ±${SMOOTH_TOL})`);
      }
      assert.ok(done, `PageDown→ArrowDown 간격이 60ms 이내로 들어오지 못함(gap ${gap})`);
    }
    c.obs(`clientHeight=${s0.clientHeight}, 기대 ${expect.toFixed(1)}; ${rows.join(', ')}`);
    assert.equal(bad.length, 0, `PageDown+ArrowDown 누적 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-07(c)', 'PageDown 33ms 간격 30회(연속 press / 키 누른 채 자동반복): 정착 후 min(30×90%, 최대 스크롤)', `정착 후 ±${SMOOTH_TOL}px (폴링 최대 8s)`, async (c) => {
    const { page } = c;
    const s0 = await snap(page);
    const maxTop = s0.scrollHeight - s0.clientHeight;
    const expect = Math.min(30 * 0.9 * s0.clientHeight, maxTop);
    const bad = [];
    const rows = [];
    for (const mode of ['press', 'hold']) {
      await toTopSettled(page);
      const t0 = Date.now();
      for (let i = 0; i < 30; i++) {
        if (mode === 'press') await press(page, 'PageDown');
        else await page.keyboard.down('PageDown');
        const wait = t0 + (i + 1) * 33 - Date.now();
        if (wait > 0) await sleep(wait);
      }
      if (mode === 'hold') await page.keyboard.up('PageDown');
      const input = Date.now() - t0;
      const top = await settleOrNaN(page, 400, 8000);
      rows.push(`${mode === 'press' ? '개별 press' : '키 누름 반복(repeat)'}(입력 ${input}ms): ${top}`);
      if (!(Math.abs(top - expect) <= SMOOTH_TOL)) bad.push(`${mode}: scrollTop=${top} (기대 ${expect.toFixed(1)} ±${SMOOTH_TOL})`);
    }
    c.obs(`clientHeight=${s0.clientHeight}, 기대 min(30×90%=${(30 * 0.9 * s0.clientHeight).toFixed(0)}, 최대 ${maxTop}) = ${expect.toFixed(1)}; ${rows.join(', ')}`);
    assert.equal(bad.length, 0, `PageDown 30회 연속 입력 누적 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-07(d)', '경계: 맨 위 PageUp/Shift+Space, 맨 아래 PageDown 은 경계에서 멈춤 (회귀 방지)', `맨 위 ±1px, 맨 아래 최대 스크롤 ±${SCROLL_TOL}px`, async (c) => {
    const { page } = c;
    const bad = [];
    await toTopSettled(page);
    await press(page, 'PageUp');
    await sleep(60);
    await press(page, 'PageUp');
    let top = await settleOrNaN(page, 400, 5000);
    if (!(Math.abs(top - 0) <= 1)) bad.push(`맨 위 PageUp 2회: scrollTop=${top}`);
    await press(page, 'Shift+Space');
    top = await settleOrNaN(page, 400, 5000);
    if (!(Math.abs(top - 0) <= 1)) bad.push(`맨 위 Shift+Space: scrollTop=${top}`);
    await press(page, 'End');
    await settleScroll(page, 300, 8000);
    const s = await snap(page);
    const maxTop = s.scrollTop;
    approx(maxTop + s.clientHeight, s.scrollHeight, SCROLL_TOL, 'End 로 맨 아래');
    await press(page, 'PageDown');
    await sleep(60);
    await press(page, 'PageDown');
    top = await settleOrNaN(page, 400, 5000);
    if (!(Math.abs(top - maxTop) <= SCROLL_TOL)) bad.push(`맨 아래 PageDown 2회: scrollTop=${top} (최대 ${maxTop})`);
    c.obs(`최대 스크롤=${maxTop}, 경계 검사 3종(맨 위 PageUp×2, 맨 위 Shift+Space, 맨 아래 PageDown×2) 위반 ${bad.length}건`);
    assert.equal(bad.length, 0, `경계 위반 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-07(e)', '경계 근처 연타: 맨 아래 근처 PageDown 8회 / 맨 위 근처 PageUp 8회(33ms 간격)는 경계에서 멈추고 넘치지 않음', `정착 후 맨 아래 최대 스크롤 ±${SCROLL_TOL}px, 맨 위 ±1px`, async (c) => {
    const { page } = c;
    const bad = [];
    await press(page, 'End');
    await settleScroll(page, 300, 8000);
    const s = await snap(page);
    const maxTop = s.scrollTop;
    await setScroll(page, maxTop - 2000, null);
    await sleep(150);
    await settleScroll(page, 250, 4000);
    for (let i = 0; i < 8; i++) { await press(page, 'PageDown'); await sleep(33); }
    let top = await settleOrNaN(page, 400, 8000);
    const down = top;
    if (!(Math.abs(top - maxTop) <= SCROLL_TOL)) bad.push(`맨 아래 근처(최대-2000) PageDown 8회 연타: scrollTop=${top} (최대 ${maxTop})`);
    await setScroll(page, 1500, null);
    await sleep(150);
    await settleScroll(page, 250, 4000);
    for (let i = 0; i < 8; i++) { await press(page, 'PageUp'); await sleep(33); }
    top = await settleOrNaN(page, 400, 8000);
    if (!(Math.abs(top - 0) <= 1)) bad.push(`맨 위 근처(1500) PageUp 8회 연타: scrollTop=${top} (기대 0)`);
    c.obs(`최대 스크롤=${maxTop}; 맨 아래 근처 PageDown×8 → ${down}; 맨 위 근처 PageUp×8 → ${top}`);
    assert.equal(bad.length, 0, `경계 근처 연타 위반 — ${bad.join(' | ')}`);
  }, 120000),
  // ---- SCR-08: 키 홀드 중 부드러움(plan.md §8-4). 앱 인스턴스는 SCR-07 과 공유하므로 매 시나리오 전에 위치를 직접 맞춘다.
  step('SCR-08(a)', 'PageDown 30회 홀드(자동반복 hold / 개별 press / OS형 첫 키 500ms 뒤 반복) × 2: 끊김·몰아치기 없이 흐름', `최종 ±${SMOOTH_TOL}px, back=0, stall≤${SMOOTH_HOLD.stall}, maxMed≤${SMOOTH_HOLD.maxMed}, minMed≥${SMOOTH_HOLD.minMed}, burst≤${SMOOTH_HOLD.burst}, remain≤${SMOOTH_HOLD.remainVh}화면, settle≤${SMOOTH_HOLD.settleMs}ms, latency≤${SMOOTH_HOLD.latencyMs}ms (rAF 프레임 기록)`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    assert.equal(ctx.s.fit, true);
    const bad = [];
    for (const mode of ['hold', 'press', 'os']) {
      for (let r = 1; r <= 2; r++) {
        const x = await holdCase(page, ctx, { key: 'PageDown', sign: 1, mode, label: `PageDown ${mode}#${r}` });
        bad.push(...x.bad);
        c.obs(x.row);
      }
    }
    c.obs(`clientHeight=${ctx.ch}, 기대 최종 min(30×90%=${(30 * ctx.p90).toFixed(1)}, 최대 ${ctx.max})`);
    assert.equal(bad.length, 0, `PageDown 30회 홀드 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(b)', 'Space 홀드 30(맨 위에서) ×2, Shift+Space 홀드 30(40000에서 위로) ×2: 끊김·몰아치기 없이 흐름', `SCR-08(a) 와 같은 기준 (최종 ±${SMOOTH_TOL}px)`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const x = await holdCase(page, ctx, { key: 'Space', sign: 1, start: 0, label: `Space hold#${r}` });
      bad.push(...x.bad);
      c.obs(x.row);
    }
    for (let r = 1; r <= 2; r++) {
      const x = await holdCase(page, ctx, { key: 'Shift+Space', sign: -1, start: 40000, label: `Shift+Space hold#${r}` });
      bad.push(...x.bad);
      c.obs(x.row);
    }
    c.obs(`clientHeight=${ctx.ch}, Space 기대 ${(30 * ctx.p90).toFixed(1)}, Shift+Space 기대 ${(40000 - 30 * ctx.p90).toFixed(1)}`);
    assert.equal(bad.length, 0, `Space/Shift+Space 홀드 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(c)', 'PageUp 홀드 30(40000에서 위로) × 2: 끊김·몰아치기 없이 흐름', `SCR-08(a) 와 같은 기준 (최종 ±${SMOOTH_TOL}px)`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const x = await holdCase(page, ctx, { key: 'PageUp', sign: -1, start: 40000, label: `PageUp hold#${r}` });
      bad.push(...x.bad);
      c.obs(x.row);
    }
    c.obs(`clientHeight=${ctx.ch}, 기대 최종 ${(40000 - 30 * ctx.p90).toFixed(1)}`);
    assert.equal(bad.length, 0, `PageUp 홀드 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(d)', '단발 PageDown 곡선(회귀 방지): 한 번의 입력이 정확히 90% 이동하고 부드러운 곡선으로 150~600ms 에 걸쳐 진행', `최종 ±${SCROLL_TOL}px, back=0, 이동 지속 ${SMOOTH_SINGLE.spanMin}~${SMOOTH_SINGLE.spanMax}ms, 이동 프레임 ≥${SMOOTH_SINGLE.moveFramesMin}, 한 프레임 최대 이동 ≤${SMOOTH_SINGLE.stepFrac * 100}%(dt 정규화), latency ≤${SMOOTH_HOLD.latencyMs}ms`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const label = `단발#${r}`;
      await toPos(page, 0);
      const rec = await recordScroll(page, () => press(page, 'PageDown'));
      const m = smoothMetrics(rec, rec.start, ctx.p90, ctx.ch);
      c.obs(`${label}: 최종=${rec.settled}(기대 ${ctx.p90.toFixed(1)}), 이동 프레임 ${m.moveFrames}, 이동 지속 ${fx(m.moveSpanMs, 0)}ms, 한 프레임 최대 이동 ${fx(m.maxStepFrac * 100, 1)}%, back=${m.back}, latency=${fx(m.latencyMs, 0)}ms, dtMed=${fx(m.dtMed, 1)}ms`);
      if (!(Math.abs(rec.settled - ctx.p90) <= SCROLL_TOL)) bad.push(`${label}: 최종 ${rec.settled} (기대 ${ctx.p90.toFixed(1)} ±${SCROLL_TOL})`);
      if (m.back !== 0) bad.push(`${label}: 뒤로 가는 프레임 ${m.back}개`);
      if (!(m.moveSpanMs >= SMOOTH_SINGLE.spanMin && m.moveSpanMs <= SMOOTH_SINGLE.spanMax)) bad.push(`${label}: 이동 지속 ${fx(m.moveSpanMs, 0)}ms (기대 ${SMOOTH_SINGLE.spanMin}~${SMOOTH_SINGLE.spanMax})`);
      if (!(m.moveFrames >= SMOOTH_SINGLE.moveFramesMin)) bad.push(`${label}: 이동 프레임 ${m.moveFrames} < ${SMOOTH_SINGLE.moveFramesMin}`);
      if (!(m.maxStepFrac <= SMOOTH_SINGLE.stepFrac)) bad.push(`${label}: 한 프레임 최대 이동 ${fx(m.maxStepFrac * 100, 1)}% > ${SMOOTH_SINGLE.stepFrac * 100}%`);
      if (!(m.latencyMs <= SMOOTH_HOLD.latencyMs)) bad.push(`${label}: 첫 이동까지 ${fx(m.latencyMs, 0)}ms > ${SMOOTH_HOLD.latencyMs}`);
    }
    assert.equal(bad.length, 0, `단발 PageDown 곡선 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(e)', '경계 홀드: 맨 아래 근처(max−5000) PageDown 홀드 30 → 최대 스크롤에서 멈춤, 맨 위 근처(5000) PageUp 홀드 30 → 0 에서 멈춤(넘치거나 되돌아가지 않음)', `최종 최대 스크롤 ±${SCROLL_TOL}px / 0 ±1px, back=0, scrollTop 은 항상 [0, 최대+0.5] (rAF 프레임 기록)`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    const cases = [
      { label: '맨 아래 근처 PageDown', key: 'PageDown', sign: 1, start: ctx.max - 5000, expect: ctx.max, tol: SCROLL_TOL },
      { label: '맨 위 근처 PageUp', key: 'PageUp', sign: -1, start: 5000, expect: 0, tol: 1 },
    ];
    for (const cs of cases) {
      for (let r = 1; r <= 2; r++) {
        const label = `${cs.label}#${r}`;
        await toPos(page, cs.start);
        const rec = await recordScroll(page, () => holdKeys(page, cs.key, 30, 'hold'));
        const m = smoothMetrics(rec, rec.start, cs.expect, ctx.ch);
        c.obs(`${label}: 시작 ${rec.start} → 최종 ${rec.settled}(기대 ${cs.expect}), back=${m.back}, scrollTop 범위 [${fx(m.topMin, 1)}, ${fx(m.topMax, 1)}] (최대 스크롤 ${ctx.max}), settle=${fx(m.settleMs, 0)}ms`);
        if (!(Math.abs(rec.settled - cs.expect) <= cs.tol)) bad.push(`${label}: 최종 ${rec.settled} (기대 ${cs.expect} ±${cs.tol})`);
        if (m.back !== 0) bad.push(`${label}: 뒤로 가는 프레임 ${m.back}개`);
        if (!(m.topMax <= ctx.max + 0.5)) bad.push(`${label}: scrollTop 이 최대 스크롤을 넘음 ${m.topMax}`);
        if (!(m.topMin >= -0.5)) bad.push(`${label}: scrollTop 이 음수 ${m.topMin}`);
      }
    }
    assert.equal(bad.length, 0, `경계 홀드 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(f)', `취소: PageDown 홀드 ${CANCEL_KEYS}회(애니메이션 진행 중) 직후 휠·마우스 누름·썸 누름·Home·End·Ctrl+0·외부 scrollTop 쓰기가 들어오면 그 자리에서 정지(목표로 점프하지 않음)`, '전제 at < 목표−300(진행 중). 휠: final−at ∈ [0,150] / 누름·썸 누름: ±1 / Home 0±1 / End 최대±1.5 / Ctrl+0 ±2 / 외부 쓰기 1000±1 후 PageDown = 1000+90% ±3', async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const ctx = await holdCtx(page);
    const ctr = center(ctx.s);
    const toCenter = () => page.mouse.move(ctr.x, ctr.y);
    const cases = [
      { name: '휠 +100', pre: toCenter, act: () => page.mouse.wheel(0, 100), at: () => lastMark(page, 'wheel'),
        judge: (r) => { const d = r.fin - r.at; return d >= 0 && d <= 150 ? null : `final−at=${d.toFixed(1)} (기대 0~150)`; } },
      { name: '마우스 누름', pre: toCenter, act: async () => { await page.mouse.down(); await sleep(50); await page.mouse.up(); }, at: () => lastMark(page, 'mousedown'),
        judge: (r) => (Math.abs(r.fin - r.at) <= 1 ? null : `final−at=${(r.fin - r.at).toFixed(1)} (기대 ±1)`) },
      { name: '썸 누름', pre: toCenter,
        act: async () => {
          const t = await page.evaluate(() => { const b = document.querySelector('#vbar .sthumb').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
          await page.mouse.move(t.x, t.y);
          await page.mouse.down();
          await sleep(50);
          await page.mouse.up();
        },
        at: () => lastMark(page, 'pointerdown'),
        judge: (r) => (!/sthumb/.test((r.mk && r.mk.tgt) || '') ? `썸을 누르지 못함(pointerdown 대상=${r.mk && r.mk.tgt})` : Math.abs(r.fin - r.at) <= 1 ? null : `final−at=${(r.fin - r.at).toFixed(1)} (기대 ±1)`) },
      { name: 'Home', act: () => press(page, 'Home'), at: () => lastMark(page, 'keydown', 'Home'), judge: (r) => (Math.abs(r.fin) <= 1 ? null : `final=${r.fin} (기대 0±1)`) },
      { name: 'End', act: () => press(page, 'End'), at: () => lastMark(page, 'keydown', 'End'), judge: (r) => (Math.abs(r.fin - ctx.max) <= SCROLL_TOL ? null : `final=${r.fin} (기대 ${ctx.max}±${SCROLL_TOL})`) },
      { name: 'Ctrl+0', act: () => press(page, 'Control+0'), at: () => lastMark(page, 'keydown', '0'), judge: (r) => (Math.abs(r.fin - r.at) <= 2 ? null : `final−at=${(r.fin - r.at).toFixed(1)} (기대 ±2)`) },
      { name: '외부 scrollTop=1000 + PageDown',
        act: () => page.evaluate(() => { const s = document.getElementById('scroller'); window.__scr.addMark('external', s.scrollTop); s.scrollTop = 1000; }),
        at: () => lastMark(page, 'external'),
        judge: (r) => (Math.abs(r.fin - 1000) <= 1 ? null : `final=${r.fin} (기대 1000±1: 외부에서 쓴 위치에서 멈춰야 함)`),
        post: async (r) => {
          await sleep(100);
          await press(page, 'PageDown');
          r.after = await settleOrNaN(page, 400, 5000);
          return Math.abs(r.after - (1000 + ctx.p90)) <= SMOOTH_TOL ? [] : [`이어서 PageDown: ${r.after} (기대 ${(1000 + ctx.p90).toFixed(1)} ±${SMOOTH_TOL})`];
        } },
    ];
    const bad = [];
    for (const cs of cases) {
      const r = await cancelScenario(page, ctx, cs);
      if (!r.premise) {
        bad.push(`${cs.name}: 전제 불충족 — 취소 시점 위치 ${fx(r.at, 0)} 가 목표 ${fx(r.target, 0)}−300 보다 위가 아님(4회 시도)`);
        c.obs(`${cs.name}: 전제 불충족 at=${fx(r.at, 1)} target=${fx(r.target, 1)}`);
        continue;
      }
      const j = cs.judge(r);
      if (j) bad.push(`${cs.name}: ${j}`);
      for (const p of r.postBad) bad.push(`${cs.name}: ${p}`);
      c.obs(`${cs.name}: 취소 시점 at=${fx(r.at, 1)}(목표 ${fx(r.target, 1)}) → final=${fx(r.fin, 1)} (final−at=${fx(r.fin - r.at, 1)}${r.after !== undefined ? `, 이어서 PageDown → ${fx(r.after, 1)}` : ''}, 시도 ${r.attempt}회)`);
    }
    await resetView(page);
    assert.equal(bad.length, 0, `취소 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(g)', `숨김: 애니메이션 진행 중 document.hidden/visibilityState 를 숨김으로 에뮬레이트하고 visibilitychange 를 보내면 목표 위치로 즉시 완료하고 멈춤(원복 포함)`, '전제 at < 목표−300. 같은 태스크 직후·600ms 뒤 목표 ±1, 원복 후 hidden=false·visible', async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const ctx = await holdCtx(page);
    const r = await cancelScenario(page, ctx, {
      act: async () => {
        const h = await hideDocument(page);
        await sleep(600);
        h.fin600 = await topNow(page);
        return h;
      },
      at: (ret) => ({ top: ret.before }),
    });
    const bad = [];
    if (!r.premise) bad.push(`전제 불충족 — 숨김 시점 위치 ${fx(r.at, 0)} 가 목표 ${fx(r.target, 0)}−300 보다 위가 아님(4회 시도)`);
    else {
      const h = r.ret;
      if (!(Math.abs(h.after - r.target) <= 1)) bad.push(`숨김 직후(같은 태스크) scrollTop=${h.after} (기대 ${r.target.toFixed(1)}±1)`);
      if (!(Math.abs(h.fin600 - r.target) <= 1)) bad.push(`600ms 뒤 scrollTop=${h.fin600} (기대 ${r.target.toFixed(1)}±1)`);
      if (!(Math.abs(r.fin - r.target) <= 1)) bad.push(`정착 후 scrollTop=${r.fin} (기대 ${r.target.toFixed(1)}±1)`);
      if (h.hiddenDuring !== true) bad.push(`에뮬레이션 실패: 이벤트 중 document.hidden=${h.hiddenDuring}`);
      if (h.hiddenAfter !== false || h.visAfter !== 'visible') bad.push(`원복 실패: document.hidden=${h.hiddenAfter}, visibilityState=${h.visAfter}`);
    }
    c.obs(`숨김 직전 ${fx(r.at, 1)}(목표 ${fx(r.target, 1)}) → 직후 ${r.ret ? fx(r.ret.after, 1) : '-'} → 600ms 뒤 ${r.ret ? fx(r.ret.fin600, 1) : '-'} → 정착 ${fx(r.fin, 1)}; 원복 hidden=${r.ret ? r.ret.hiddenAfter : '-'}, 시도 ${r.attempt}회`);
    assert.equal(bad.length, 0, `숨김 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(j)', '히치 내성: PageDown 홀드 30 중 400ms 시점에 메인 스레드를 60ms 막아도(프레임 1개 지연) 최종 위치가 정확하고 속도 지표가 튀지 않음(측정기 오판 없음)', `최종 ±${SMOOTH_TOL}px, SCR-08(a) 와 같은 지표 기준(maxMed≤${SMOOTH_HOLD.maxMed} 등), 히치 프레임(dt>${SMOOTH_HOLD.hitch}×중앙값) ≥1 관찰`, async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const label = `히치#${r}`;
      await toPos(page, 0);
      const rec = await recordScroll(page, async () => {
        const busy = sleep(400).then(() => page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 60); }));
        await holdKeys(page, 'PageDown', 30, 'hold');
        await busy;
      });
      const expect = holdTarget(rec.start, 1, 30, ctx.ch, ctx.max);
      const m = smoothMetrics(rec, rec.start, expect, ctx.ch);
      const vio = holdViolations(m, rec, expect, label);
      c.obs(`${label}: ${fmtMetrics(m)} 최종=${rec.settled}${vio.length ? ` [원시 기록 ${dumpRec(label, rec, m)}]` : ''}`);
      bad.push(...vio);
      if (!(m.hitch >= 1)) bad.push(`${label}: 히치 프레임이 관찰되지 않음(hitch=${m.hitch}) — 60ms 막기가 프레임에 반영되지 않아 시험 전제 불충족`);
    }
    assert.equal(bad.length, 0, `히치 내성 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(m)', '방향 반전: PageDown 홀드 10 직후 바로 PageUp 홀드 10 → 목표가 0 으로 되돌아가 0 에서 멈춤(범위 이탈·잔여 이동 없음)', '최종 0±1, scrollTop ∈ [0, 최대+0.5], 마지막 키 뒤 정착 ≤800ms, 반전 전 이동 >300px(전제). 역방향 프레임 수는 관찰값', async (c) => {
    const { page } = c;
    const ctx = await holdCtx(page);
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const label = `반전#${r}`;
      await toPos(page, 0);
      const rec = await recordScroll(page, async () => {
        await holdKeys(page, 'PageDown', 10, 'hold');
        await holdKeys(page, 'PageUp', 10, 'hold');
      });
      const m = smoothMetrics(rec, rec.start, 0, ctx.ch);
      c.obs(`${label}: 최종=${rec.settled}, 반전 전 최대 위치 ${fx(m.topMax, 1)}, scrollTop 범위 [${fx(m.topMin, 1)}, ${fx(m.topMax, 1)}], 마지막 키 뒤 정착 ${fx(m.settleMs, 0)}ms, 역방향(위로 이동) 프레임 ${m.back}개(관찰), dtMed=${fx(m.dtMed, 1)}ms`);
      if (!(Math.abs(rec.settled) <= 1)) bad.push(`${label}: 최종 ${rec.settled} (기대 0±1)`);
      if (!(m.topMin >= -0.5 && m.topMax <= ctx.max + 0.5)) bad.push(`${label}: scrollTop 범위 이탈 [${m.topMin}, ${m.topMax}] (최대 ${ctx.max})`);
      if (!(m.settleMs <= 800)) bad.push(`${label}: 정착 ${fx(m.settleMs, 0)}ms > 800`);
      if (!(m.topMax > 300)) bad.push(`${label}: 반전 전에 이동이 없음(최대 위치 ${fx(m.topMax, 1)}) — 시험 전제 불충족`);
    }
    assert.equal(bad.length, 0, `방향 반전 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(n)', `취소 확장: 애니메이션 진행 중 세로 바 위 휠 +100 → 그 자리에서 +100 만 이동, 트랙 클릭 → 클릭 위치로 이동하고 이전 애니메이션이 이어지지 않음`, '전제 at < 목표−300. 바 위 휠: final−at ∈ [90,110]. 트랙 클릭: 클릭 직후 scrollTop = 공식 ±(썸 1.5px 분), 이후 변화 ±1, 썸 중앙 = 클릭 y ±1.5', async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const ctx = await holdCtx(page);
    await toPos(page, 0);
    const sb = await barSnap(page);
    assert.ok(barVisible(sb.vbar), '사전조건: #vbar 표시');
    const tr = trackOf(sb.vbar, 'y');
    const bx = sb.vbar.rect.left + sb.vbar.rect.width / 2;
    const e0 = expectedThumb(sb, 'y');
    const bad = [];
    // 1) 바 위 휠
    const wy = tr.start + tr.len * 0.8;
    let r = await cancelScenario(page, ctx, { pre: () => page.mouse.move(bx, wy), act: () => page.mouse.wheel(0, 100), at: () => lastMark(page, 'wheel') });
    if (!r.premise) bad.push(`바 위 휠: 전제 불충족 at=${fx(r.at, 0)} 목표 ${fx(r.target, 0)}−300 (4회 시도)`);
    else {
      const d = r.fin - r.at;
      if (!(d >= 90 && d <= 110)) bad.push(`바 위 휠: final−at=${fx(d, 1)} (기대 90~110)`);
    }
    c.obs(`바 위 휠 +100: 취소 시점 at=${fx(r.at, 1)}(목표 ${fx(r.target, 1)}) → final=${fx(r.fin, 1)} (final−at=${fx(r.fin - r.at, 1)}, 시도 ${r.attempt}회)`);
    // 2) 트랙 클릭
    const cy = tr.start + tr.len * 0.5;
    const wantOff = Math.min(Math.max(cy - e0.len / 2 - e0.trackStart, 0), e0.travel);
    const wantScroll = (wantOff / e0.travel) * e0.max;
    const ratio = e0.max / e0.travel;
    const wantCenter = Math.min(Math.max(cy, tr.start + e0.len / 2), tr.start + tr.len - e0.len / 2);
    r = await cancelScenario(page, ctx, {
      pre: () => page.mouse.move(bx, cy),
      act: async () => {
        await page.mouse.down();
        return { imm: await snap(page) };
      },
      at: () => lastMark(page, 'pointerdown'),
      cleanup: () => page.mouse.up(),
      post: async (x) => {
        const out = [];
        const imm = x.ret.imm;
        const fr = await barSnap(page);
        await page.mouse.up();
        await sleep(80);
        if (/sthumb/.test((x.mk && x.mk.tgt) || '')) out.push('썸이 눌림(트랙 위치를 잘못 잡음)');
        if (!(Math.abs(imm.scrollTop - wantScroll) <= ratio * DRAG_TOL + 1)) out.push(`클릭 직후 scrollTop=${fx(imm.scrollTop, 1)} (기대 ${fx(wantScroll, 1)} ±${fx(ratio * DRAG_TOL + 1, 0)})`);
        if (!(Math.abs(x.fin - imm.scrollTop) <= 1)) out.push(`클릭 뒤 scrollTop 이 계속 변함 ${fx(imm.scrollTop, 1)} → ${fx(x.fin, 1)} (이전 애니메이션이 이어짐)`);
        const center = fr.vbar.thumb.top + fr.vbar.thumb.height / 2;
        if (!(Math.abs(center - wantCenter) <= DRAG_TOL)) out.push(`썸 중앙 ${fx(center, 1)} (기대 클릭 y ${fx(wantCenter, 1)} ±${DRAG_TOL})`);
        x.thumbCenter = center;
        return out;
      },
    });
    if (!r.premise) bad.push(`트랙 클릭: 전제 불충족 at=${fx(r.at, 0)} 목표 ${fx(r.target, 0)}−300 (4회 시도)`);
    else for (const p of r.postBad) bad.push(`트랙 클릭: ${p}`);
    c.obs(`트랙 50% 클릭(y=${fx(cy, 1)}): 취소 시점 at=${fx(r.at, 1)} → 클릭 직후 ${r.ret && r.ret.imm ? fx(r.ret.imm.scrollTop, 1) : '-'}(기대 ${fx(wantScroll, 1)}) → 정착 ${fx(r.fin, 1)}, 썸 중앙 ${fx(r.thumbCenter, 1)}(기대 ${fx(wantCenter, 1)}), 시도 ${r.attempt}회`);
    await resetView(page);
    assert.equal(bad.length, 0, `바 취소 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
  step('SCR-08(o)', '숨김 후 재개: (g) 처럼 숨김→원복한 뒤 PageDown 1회가 정확히 90% 이동(애니메이터 상태가 깨끗이 정리됨)', '정착 후 숨김 때 위치 + 90% ±3', async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const ctx = await holdCtx(page);
    const r = await cancelScenario(page, ctx, {
      act: async () => {
        const h = await hideDocument(page);
        await sleep(300);
        return h;
      },
      at: (ret) => ({ top: ret.before }),
      post: async (x) => {
        await sleep(100);
        await press(page, 'PageDown');
        x.after = await settleOrNaN(page, 400, 5000);
        const want = Math.min(x.fin + ctx.p90, ctx.max);
        return Math.abs(x.after - want) <= SMOOTH_TOL ? [] : [`원복 뒤 PageDown 1회: ${x.after} (기대 ${want.toFixed(1)} ±${SMOOTH_TOL})`];
      },
    });
    const bad = [];
    if (!r.premise) bad.push(`전제 불충족 — 숨김 시점 위치 ${fx(r.at, 0)} 가 목표 ${fx(r.target, 0)}−300 보다 위가 아님(4회 시도)`);
    else {
      if (!(Math.abs(r.fin - r.target) <= 1)) bad.push(`숨김 후 정착 위치 ${r.fin} (기대 ${r.target.toFixed(1)}±1)`);
      bad.push(...r.postBad);
    }
    c.obs(`숨김 직전 ${fx(r.at, 1)} → 정착 ${fx(r.fin, 1)}(목표 ${fx(r.target, 1)}) → 원복 후 PageDown 1회 → ${fx(r.after, 1)} (이동 ${fx(r.after - r.fin, 1)}, 기대 ${fx(ctx.p90, 1)}), 시도 ${r.attempt}회`);
    assert.equal(bad.length, 0, `숨김 후 재개 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
]);

// =============================================================== SUITE: SCR-08 다장 홀드 (many: 720×2000 24장) — 장 경계를 지나며 홀드
suite('smooth-multi', () => F.manyDir, [
  step('SCR-08(i)', '다장 홀드: 24장 회차에서 PageDown 홀드 30 → 장 경계를 지나도 끊김·몰아치기 없이 흐르고, data-index 가 단조 증가하며 최종 index 가 위치 규칙과 일치', `SCR-08(a) 와 같은 지표 기준(최종 ±${SMOOTH_TOL}px), data-index 비감소, 최종 index = 뷰포트 맨 위에 걸친 장, pageerror 0`, async (c) => {
    const { page } = c;
    await resetView(page);
    const ctx = await holdCtx(page);
    const errBefore = c.errors.length;
    const bad = [];
    for (let r = 1; r <= 2; r++) {
      const x = await holdCase(page, ctx, { key: 'PageDown', sign: 1, label: `다장 hold#${r}` });
      bad.push(...x.bad);
      const sEnd = await snap(page);
      const want = expectedIndex(sEnd);
      if (!x.m.idxMonotone) bad.push(`다장 hold#${r}: data-index 가 감소한 프레임이 있음`);
      if (sEnd.index !== want) bad.push(`다장 hold#${r}: 최종 data-index=${sEnd.index} (위치 규칙상 ${want})`);
      if (!(sEnd.index >= 5)) bad.push(`다장 hold#${r}: 최종 index=${sEnd.index} — 여러 장을 지나지 않음(시험 전제 불충족)`);
      c.obs(`${x.row} data-index 단조=${x.m.idxMonotone}, 최종 index=${sEnd.index}(규칙 ${want}), 장 ${sEnd.pages.length}개`);
    }
    if (c.errors.length !== errBefore) bad.push(`렌더러 오류 ${c.errors.slice(errBefore).join('; ')}`);
    assert.equal(bad.length, 0, `다장 홀드 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
]);

// =============================================================== SUITE: SCR-08 위쪽 장 크기 변경 중 홀드 (basic: 800×3000 4장). 각 step 이 이미지 크기를 바꾸므로 suite 를 따로 둔다.
suite('smooth-size', () => F.basicDir, [
  step('SCR-08(h)', '아래로 홀드 중 위쪽 장(0번)의 실제 크기가 3000→600 으로 확정(load)되면 위치와 목표가 함께 보정되어 최종 위치 = 원래 목표 − 줄어든 높이', `전제: load 뒤에도 ≥100px 이동. 최종 3500+4×90%−2400(×배율) ±${SMOOTH_TOL}px, 0번 장 높이 600(×배율) ±0.5`, async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const s0 = await snap(page);
    assert.equal(s0.pages.length, 4);
    const sc = s0.strip.width / REF;
    const p90 = s0.clientHeight * 0.9;
    approx(s0.pages[0].height, 3000 * sc, 1, '사전조건: 0번 장 높이');
    await toPos(page, 3500);
    const url = pathToFileURL(F.shortFile).href;
    await holdKeys(page, 'PageDown', 4, 'hold', 33, { at: 1, fn: () => page.evaluate(swapImageFn, [0, url]) });
    const fin = await settleOrNaN(page, 400, 8000);
    const sw = await page.evaluate(() => window.__swap);
    const sEnd = await snap(page);
    const expect = 3500 + 4 * p90 - 2400 * sc;
    const bad = [];
    if (!sw.loaded) bad.push('0번 장 이미지 load 가 일어나지 않음');
    else if (!(Math.abs(fin - sw.top) >= 100)) bad.push(`전제 불충족: load 시점 ${fx(sw.top, 1)} → 최종 ${fx(fin, 1)} (load 뒤 이동 <100px, 애니메이션이 이미 끝남)`);
    if (!(Math.abs(fin - expect) <= SMOOTH_TOL)) bad.push(`최종 scrollTop=${fin} (기대 ${expect.toFixed(1)} ±${SMOOTH_TOL})`);
    if (!(Math.abs(sEnd.pages[0].height - 600 * sc) <= 0.5)) bad.push(`0번 장 높이 ${sEnd.pages[0].height} (기대 ${600 * sc} ±0.5)`);
    c.obs(`시작 3500, 4×90%=${(4 * p90).toFixed(1)}; load 직후 scrollTop=${sw.loaded ? fx(sw.top, 1) : '-'} → 최종 ${fx(fin, 1)} (기대 ${expect.toFixed(1)}), 0번 장 높이 ${sEnd.pages[0].height}`);
    assert.equal(bad.length, 0, `위쪽 장 크기 보정 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
]);

// SCR-08(p)/(p2) 공용: 맨 아래 근처(최대 스크롤 − 2400, 장 크기 확정 뒤의 새 최대 스크롤 아래)에서 PageUp 홀드 중 1번 장([3000, 6000]×배율, 3000→600)의 크기가 확정(load)될 때 위치·목표 보정을 판정한다.
// 시작 위치를 새 최대 스크롤(= 전체 − 2400 − 클라이언트 높이) 이하로 잡는 이유: 맨 아래에서 시작하면 이미지 교체로 레이아웃이 줄어드는 순간 브라우저가 scrollTop 을 먼저 최대 스크롤로 clamp 해
// 앱이 load 때 장이 뷰포트 위쪽인지 판정하지 못한다(교체 시험의 인위성 — 헤더 크기와 실제 크기가 다른 이미지가 load 직전에 레이아웃을 바꾸는 경우).
// load 시점에 (1) 장이 뷰포트 위쪽(위치 ≥ 장 아래 끝)이어야 위치 보정(above)이 일어나고, (2) 목표(시작 − k×90%, k = load 전에 들어온 keydown 수)가
// 장의 원래 아래 끝보다 위/아래인지에 따라 목표 보정 여부가 갈린다(M5: 목표 ≥ 아래 끝일 때만 같이 이동).
async function upShiftCase(c, { swapAt, retain, n }) {
  const { page } = c;
  await assertRafAlive(page);
  await installScrollRecorder(page);
  const s0 = await snap(page);
  assert.equal(s0.pages.length, 4);
  const sc = s0.strip.width / REF;
  const p90 = s0.clientHeight * 0.9;
  const newMax = 9600 * sc - s0.clientHeight; // 1번 장이 600 으로 줄어든 뒤의 최대 스크롤
  const start = Math.floor(newMax - 100);
  const oldBottom = 6000 * sc;
  await toPos(page, start);
  const url = pathToFileURL(F.shortFile).href;
  const rec = await recordScroll(page, () => holdKeys(page, 'PageUp', n, 'hold', 33, { at: swapAt, fn: () => page.evaluate(swapImageFn, [1, url]) }));
  const fin = rec.settled;
  const sw = await page.evaluate(() => window.__swap);
  const sEnd = await snap(page);
  const bad = [];
  const expect = Math.max(0, start - n * p90 - (retain ? 0 : 2400 * sc));
  let kLoad = NaN;
  let topBefore = NaN;
  if (!sw.loaded) bad.push('1번 장 이미지 load 가 일어나지 않음');
  else {
    kLoad = rec.keys.filter((k) => k[1] === 'PageUp' && k[0] <= sw.now).length;
    for (const r of rec.frames) if (r[1] <= sw.now) topBefore = r[2];
    const tgtAtLoad = start - kLoad * p90;
    if (!(topBefore >= oldBottom + 120)) bad.push(`전제 불충족: load 직전 프레임 위치 ${fx(topBefore, 1)} 가 장의 아래 끝 ${oldBottom}+120 보다 위쪽이 아님(장이 뷰포트 위쪽이 아니라 위치 보정이 일어나지 않음)`);
    if (retain && !(tgtAtLoad < oldBottom - 50)) bad.push(`전제 불충족: load 시점 목표 ${fx(tgtAtLoad, 1)} (keydown ${kLoad}개)가 장의 아래 끝 ${oldBottom}−50 보다 위쪽이 아님`);
    if (!retain && !(tgtAtLoad >= oldBottom + 50)) bad.push(`전제 불충족: load 시점 목표 ${fx(tgtAtLoad, 1)} (keydown ${kLoad}개)가 장의 아래 끝 ${oldBottom}+50 보다 아래쪽이 아님`);
    if (!(Math.abs(fin - sw.top) >= 100)) bad.push(`전제 불충족: load 직후 ${fx(sw.top, 1)} → 최종 ${fx(fin, 1)} (load 뒤 이동 <100px)`);
  }
  if (!(Math.abs(fin - expect) <= SMOOTH_TOL)) bad.push(`최종 scrollTop=${fin} (기대 ${expect.toFixed(1)} ±${SMOOTH_TOL}: ${retain ? '목표 픽셀 유지' : '목표도 줄어든 만큼 이동'})`);
  if (!(Math.abs(sEnd.pages[1].height - 600 * sc) <= 0.5)) bad.push(`1번 장 높이 ${sEnd.pages[1].height} (기대 ${600 * sc} ±0.5)`);
  const dump = bad.length ? ` [원시 기록 ${dumpRec(`up-swap${swapAt}`, rec, { sw, kLoad, topBefore, expect, fin })}]` : '';
  c.obs(`시작 ${start}, PageUp 홀드 ${n}(목표 ${(start - n * p90).toFixed(1)}), keydown ${swapAt}번째 직후 교체: load 시점 keydown ${kLoad}개·직전 프레임 위치 ${fx(topBefore, 1)}(장 아래 끝 ${oldBottom}) → load 직후 ${sw.loaded ? fx(sw.top, 1) : '-'} → 최종 ${fx(fin, 1)} (기대 ${expect.toFixed(1)}), 1번 장 높이 ${sEnd.pages[1].height}${dump}`);
  assert.equal(bad.length, 0, `위로 스크롤 중 장 크기 보정 판정 실패 — ${bad.join(' | ')}`);
}

suite('smooth-size-up', () => F.basicDir, [
  step('SCR-08(p)', '위로 홀드 중 목표가 이미 장(1번) 아래 끝보다 위인데 그 장(현재 위치와 목표 사이, 뷰포트 위쪽)이 3000→600 으로 확정되면 위치만 보정되고 목표 픽셀은 유지', `전제: load 시점 위치 ≥ 장 아래 끝+120, 목표 < 장 아래 끝−50, load 뒤에도 ≥100px 이동. 최종 = 시작 − 10×90% ±${SMOOTH_TOL}px(원래 목표 픽셀), 1번 장 높이 600(×배율) ±0.5`, (c) => upShiftCase(c, { swapAt: 4, retain: true, n: 10 }), 120000),
]);

// 목표가 아직 장(1번)의 아래 끝보다 아래일 때(첫 keydown 직후) 장 크기가 확정되면 목표도 줄어든 만큼 함께 이동한다(M5 의 나머지 분기).
suite('smooth-size-up2', () => F.basicDir, [
  step('SCR-08(p2)', '위로 홀드 중 목표가 아직 장(1번) 아래 끝보다 아래일 때(첫 keydown 직후) 그 장이 3000→600 으로 확정되면 위치와 목표가 함께 보정(최종 = 원래 목표 − 줄어든 높이)', `전제: load 시점 위치 ≥ 장 아래 끝+120, 목표 ≥ 장 아래 끝+50, load 뒤에도 ≥100px 이동. 최종 = 시작 − 8×90% − 2400(×배율) ±${SMOOTH_TOL}px`, (c) => upShiftCase(c, { swapAt: 1, retain: false, n: 8 }), 120000),
]);

// =============================================================== SUITE: SCR-08 회차 전환 (lib/comic: 1화 3장·2화 2장·10화 5장)
suite('smooth-comic', () => F.comicDir, [
  step('SCR-08(k)', '회차 전환: PageDown 홀드 직후 →(다음 회차) → 새 회차는 맨 위에서 시작하고 이전 회차의 애니메이션이 남지 않으며, 이어서 PageDown 1회 = 90%', '전제 at < 목표−300. 새 회차 ready 직후·600ms 뒤 scrollTop ≤ 1, 이어서 PageDown = 90% ±3', async (c) => {
    const { page } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    await waitReady(page, '1화');
    const HOLD_N = 6; // 1화 = 5400px → 최대 스크롤 4614 < 10×90% 라서 최대 스크롤 안에 드는 6회(4244px)를 쓴다
    const bad = [];
    let done = false;
    let info = '';
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      await gotoEpisode(page, 0);
      await resetView(page);
      const s1 = await snap(page);
      const p90 = s1.clientHeight * 0.9;
      const target = Math.min(HOLD_N * p90, maxTopOf(s1));
      await page.evaluate(() => window.__scr.clearMarks());
      await holdKeys(page, 'PageDown', HOLD_N, 'hold');
      await press(page, 'ArrowRight');
      const mk = await lastMark(page, 'keydown', 'ArrowRight');
      const at = mk ? mk.top : NaN;
      const s2 = await waitSnap(page, (v) => v.episode === 1 && v.state === 'ready', '2화 ready', 15000);
      await sleep(600);
      const s3 = await snap(page);
      if (!(Number.isFinite(at) && at < target - 300)) {
        info = `시도 ${attempt}: → 입력 시점 at=${fx(at, 1)} 가 목표 ${fx(target, 1)}−300 보다 위가 아님`;
        continue;
      }
      done = true;
      await press(page, 'PageDown');
      const fin = await settleOrNaN(page, 400, 5000);
      if (!(s2.scrollTop <= 1)) bad.push(`새 회차 ready 직후 scrollTop=${s2.scrollTop} (기대 ≤1)`);
      if (!(s3.scrollTop <= 1)) bad.push(`새 회차 600ms 뒤 scrollTop=${s3.scrollTop} (기대 ≤1, 이전 애니메이션이 새 회차에 이어짐)`);
      if (s3.name !== '2화') bad.push(`#name=${s3.name} (기대 2화)`);
      if (!(Math.abs(fin - p90) <= SMOOTH_TOL)) bad.push(`이어서 PageDown: ${fin} (기대 ${p90.toFixed(1)} ±${SMOOTH_TOL})`);
      info = `시도 ${attempt}: PageDown 홀드 ${HOLD_N}(목표 ${target.toFixed(1)}) → → 입력 시점 at=${fx(at, 1)}; 2화 ready 직후 scrollTop=${s2.scrollTop}, 600ms 뒤 ${s3.scrollTop}; 이어서 PageDown → ${fx(fin, 1)}(기대 ${p90.toFixed(1)})`;
    }
    c.obs(info);
    if (!done) bad.push(`전제 불충족(3회 시도) — ${info}`);
    assert.equal(bad.length, 0, `회차 전환 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
]);

// =============================================================== SUITE: SCR-08 창 높이 변경 중 홀드 (huge). 창 크기를 바꾸므로 suite 를 따로 둔다. 리사이즈는 resizeTo(보조 모니터 단언 경로)만 쓴다.
suite('smooth-win', () => F.hugeFile, [
  step('SCR-08(l)', `리사이즈: PageDown 홀드 ${CANCEL_KEYS} 직후 창 높이 +100 → 폭 맞춤에서는 그 자리에서 정지(600ms 뒤 불변), 수동 줌(Ctrl+1)에서는 목표까지 계속 진행`, `전제 at(리사이즈 시점) < 목표−300. 폭 맞춤: 600ms 뒤 scrollTop − at ±1. 수동 줌: 최종 목표 ±${SMOOTH_TOL}px, pageerror 0`, async (c) => {
    const { page, app } = c;
    await assertRafAlive(page);
    await installScrollRecorder(page);
    const errBefore = c.errors.length;
    const bad = [];
    try {
      for (const manual of [false, true]) {
        const label = manual ? '수동 줌(Ctrl+1)' : '폭 맞춤';
        let done = false;
        let info = '';
        for (let attempt = 1; attempt <= 3 && !done; attempt++) {
          await restoreSize(app, page);
          await resetView(page);
          if (manual) {
            await press(page, 'Control+1');
            const sm = await snap(page);
            assert.equal(sm.fit, false, '사전조건: Ctrl+1 후 fit=false');
          }
          await toPos(page, 0);
          const s1 = await snap(page);
          const ch0 = s1.clientHeight;
          const target = Math.min(CANCEL_KEYS * ch0 * 0.9, maxTopOf(s1));
          const outer = (await winInfo(app)).size;
          await page.evaluate(armResizeMarkFn);
          await frames(page, 3);
          await holdKeys(page, 'PageDown', CANCEL_KEYS, 'hold');
          await resizeTo(app, page, outer[0], outer[1] + 100);
          const rz = await page.evaluate(() => window.__rz);
          let fin;
          if (manual) fin = await settleOrNaN(page, 400, 8000);
          else {
            await sleep(600);
            fin = await settleOrNaN(page, 400, 8000);
          }
          if (!rz || !(rz.top < target - 300)) {
            info = `${label} 시도 ${attempt}: 리사이즈 시점 at=${rz ? fx(rz.top, 1) : '관찰 못 함'} 가 목표 ${fx(target, 1)}−300 보다 위가 아님`;
            continue;
          }
          done = true;
          if (!(rz.ch === ch0 + 100)) bad.push(`${label}: 리사이즈가 적용되지 않음 clientHeight ${ch0} → ${rz.ch}`);
          if (manual) {
            if (!(Math.abs(fin - target) <= SMOOTH_TOL)) bad.push(`${label}: 최종 ${fin} (기대 목표 ${target.toFixed(1)} ±${SMOOTH_TOL}, 리사이즈 시점 ${fx(rz.top, 1)})`);
          } else if (!(Math.abs(fin - rz.top) <= 1)) bad.push(`${label}: 리사이즈 시점 ${fx(rz.top, 1)} → 600ms 뒤 ${fx(fin, 1)} (기대 불변 ±1)`);
          info = `${label} 시도 ${attempt}: 리사이즈 시점 at=${fx(rz.top, 1)}(목표 ${fx(target, 1)}) → 최종 ${fx(fin, 1)}, clientHeight ${ch0} → ${rz.ch}`;
        }
        c.obs(info);
        if (!done) bad.push(`${label}: 전제 불충족(3회 시도) — ${info}`);
      }
    } finally {
      await restoreSize(app, page);
      await resetView(page);
    }
    if (c.errors.length !== errBefore) bad.push(`렌더러 오류 ${c.errors.slice(errBefore).join('; ')}`);
    assert.equal(bad.length, 0, `리사이즈 판정 실패 — ${bad.join(' | ')}`);
  }, 120000),
]);

// =============================================================== SUITE: Ctrl+O 중복 호출 방지 (OPN-08a)
suite('dialog-dup', () => F.b1, [
  step('OPN-08a', 'Ctrl+O 중복 호출 방지: (a) 30ms 안 3회 (b) Ctrl 누른 채 O 자동반복 6회 → 호출 1회, (c) 응답 후 다시 열림', '스텁: dialog.showOpenDialog = 호출 수 집계 + 300ms 뒤 {canceled:true}. 호출 횟수 정확 일치', async (c) => {
    const { page, app } = c;
    await app.evaluate(({ dialog }) => {
      globalThis.__dlg = { calls: 0 };
      dialog.showOpenDialog = () => {
        globalThis.__dlg.calls++;
        return new Promise((r) => setTimeout(() => r({ canceled: true, filePaths: [] }), 300));
      };
    });
    assert.equal(await app.evaluate(({ dialog }) => dialog.showOpenDialog.toString().includes('__dlg')), true, 'dialog.showOpenDialog 스텁 교체 실패');
    const calls = () => app.evaluate(() => globalThis.__dlg.calls);
    const reset = async () => { await sleep(700); await app.evaluate(() => { globalThis.__dlg.calls = 0; }); };
    const bad = [];
    const obs = [];

    let a1 = null;
    for (let attempt = 0; attempt < 3 && a1 === null; attempt++) {
      await reset();
      const t0 = Date.now();
      for (let i = 0; i < 3; i++) await press(page, 'Control+KeyO');
      const el = Date.now() - t0;
      await sleep(250);
      const n = await calls();
      if (el < 200) a1 = { n, el };
    }
    assert.ok(a1, 'Ctrl+O 3회 입력이 200ms 안에 끝나지 못해 검증 불가');
    obs.push(`(a1) 실제 키 입력 3회(${a1.el}ms) → 호출 ${a1.n}회`);
    if (a1.n !== 1) bad.push(`(a1) 실제 Ctrl+O 3회 → 호출 ${a1.n}회 (기대 1)`);

    await reset();
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await sleep(250);
    const a2 = await calls();
    obs.push(`(a2) 같은 틱 합성 Ctrl+O 3회 → 호출 ${a2}회`);
    if (a2 !== 1) bad.push(`(a2) 동일 틱 합성 Ctrl+O 3회 → 호출 ${a2}회 (기대 1)`);

    await reset();
    const tb = Date.now();
    await page.keyboard.down('Control');
    for (let i = 0; i < 6; i++) { await page.keyboard.down('KeyO'); await sleep(20); }
    await page.keyboard.up('KeyO');
    await page.keyboard.up('Control');
    const elb = Date.now() - tb;
    await sleep(150);
    const b = await calls();
    obs.push(`(b) Ctrl 누른 채 O 자동반복(repeat) 6회(${elb}ms) → 호출 ${b}회`);
    if (elb >= 280) bad.push(`(b) 입력이 ${elb}ms 걸려 스텁 응답(300ms) 안에 끝나지 못함 — 검증 불가`);
    if (b !== 1) bad.push(`(b) Ctrl+O 키 반복 6회 → 호출 ${b}회 (기대 1)`);

    await reset();
    const c0 = await calls();
    await press(page, 'Control+KeyO');
    await sleep(100);
    const c1 = await calls();
    await sleep(700);
    await press(page, 'Control+KeyO');
    await sleep(100);
    const c2 = await calls();
    obs.push(`(c) 응답 후 재입력: 호출 ${c0}→${c1}(첫 입력)→${c2}(응답 뒤 재입력)`);
    if (c1 - c0 !== 1) bad.push(`(c) 첫 Ctrl+O → 호출 +${c1 - c0} (기대 +1)`);
    if (c2 - c1 !== 1) bad.push(`(c) 스텁 응답 뒤 Ctrl+O → 호출 +${c2 - c1} (기대 +1: 다시 열려야 함)`);
    const st = await snap(page);
    assert.equal(st.state, 'ready', '취소 응답 후 앱 상태가 ready 가 아님');
    for (const o of obs) c.obs(o);
    assert.equal(bad.length, 0, `Ctrl+O 중복 방지 위반 — ${bad.join(' | ')}`);
  }, 120000),
]);

// =============================================================== SUITE: 두 번째 인스턴스가 첫 실행 직후 도착 (OPN-07a)
suite('second-instance-race', null, [
  step('OPN-07a', '첫 실행 직후(Δ 0~300ms) 도착한 두 번째 인스턴스의 파일이 유실되지 않음 (Δ마다 3회)', 'Δ 8종(0,20,40,60,80,100,150,300) × 3회. 두 번째 프로세스 20s 내 종료, 최종 #comic=B 의 만화(narrow) & state=ready, 1.5s 유지. 한 회차라도 A 가 남으면 FAIL', async (c) => {
    const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
    if (!mainSrc.includes('LONGROLL_WINDOW_POS')) {
      throw new Error('이 앱 복사본은 LONGROLL_WINDOW_POS 를 지원하지 않아 spawn 기반 테스트를 실행할 수 없음(주 모니터 보호를 위해 실행 거부)');
    }
    const { chromium } = require('playwright');
    const DELTAS = [0, 20, 40, 60, 80, 100, 150, 300]; // 지정된 6종(0,20,60,100,150,300) + 유실 구간 경계 확인용 40, 80
    const TRIES = 3;
    const fileA = F.b1;
    const fileB = F.narrow;
    const nameA = 'basic'; // 만화(#comic) 이름으로 A/B 를 구분한다(회차 폴더명은 둘 다 ep)
    const nameB = 'narrow';
    const spawned = new Set();
    const killAll = () => {
      for (const pid of spawned) { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ } }
    };
    const spawnApp = (file, userData, port) => {
      const child = spawn(ELECTRON_EXE, ['.', file, `--remote-debugging-port=${port}`], { cwd: ROOT, env: baseEnv(userData), stdio: 'ignore' });
      trackedPids.add(child.pid);
      spawned.add(child.pid);
      const info = { pid: child.pid, exited: false, code: null, exitMs: null, t0: Date.now() };
      child.on('exit', (code) => { info.exited = true; info.code = code; info.exitMs = Date.now() - info.t0; });
      child.on('error', () => { info.exited = true; info.code = -1; });
      return info;
    };
    const httpOk = async (port) => {
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
    };
    const titleName = async (port) => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const p = list.find((x) => x.type === 'page' && /index\.html/.test(x.url));
        const m = p && /^.* \(\d+\/\d+\) - (.*) - Longroll$/.exec(p.title || '');
        return m ? m[1] : (p ? `(title:${p.title})` : null);
      } catch { return null; }
    };
    const rows = [];
    const fails = [];
    try {
      for (const delta of DELTAS) {
        for (let attempt = 1; attempt <= TRIES; attempt++) {
          const seq = ++launchSeq;
          const ud = path.join(TMP, `ud-${seq}`);
          const portA = 19600 + seq * 2;
          const portB = portA + 1;
          const row = { delta, attempt, order: '?', secondExitMs: null, secondCode: null, final: null, titleFinal: null, ok: false, note: '' };
          let browser = null;
          try {
            const A = spawnApp(fileA, ud, portA);
            if (delta) await sleep(delta);
            const B = spawnApp(fileB, ud, portB);
            try {
              await poll(async () => A.exited || B.exited, { timeout: 20000, interval: 25, desc: '두 프로세스 중 하나 종료 대기' });
            } catch {
              row.note = '20초 내 어느 쪽도 종료하지 않음(단일 인스턴스 실패)';
            }
            if (!row.note) {
              row.secondExitMs = B.exitMs;
              row.secondCode = B.code;
              row.order = B.exited ? 'A 선점(정상)' : 'B 선점(역전)';
              const port = B.exited ? portA : portB;
              const expected = nameB;
              if (!(await poll(() => httpOk(port), { timeout: 20000, interval: 100, desc: '디버깅 포트 대기' }).catch(() => false))) {
                row.note = '디버깅 포트에 연결하지 못함';
              } else {
                let page = null;
                try {
                  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 20000 });
                  page = await poll(() => browser.contexts().flatMap((x) => x.pages()).find((p) => /index\.html/.test(p.url())), { timeout: 15000, interval: 100, desc: '렌더러 페이지 대기' });
                } catch (e) {
                  row.note = `CDP 연결 실패(HTTP 제목으로 대체): ${String(e.message).split('\n')[0]}`;
                }
                const read = async () => {
                  if (page) {
                    try { return await page.evaluate(() => ({ state: document.body.dataset.state || '', name: document.getElementById('comic').textContent })); } catch { return null; }
                  }
                  const n = await titleName(port);
                  return n === null ? null : { state: 'ready', name: n };
                };
                if (page) {
                  const pos = await page.evaluate(() => [screenX, screenY, outerWidth]).catch(() => null);
                  if (pos) {
                    safety.checks++;
                    safety.rows.push(`OPN-07a Δ${delta}#${attempt}: screenX=${pos[0]} outerWidth=${pos[2]}`);
                    if (!OSR && !(pos[0] < 0 && pos[0] + pos[2] <= 0)) abortRun(`OPN-07a: 창이 보조 모니터에 있지 않음 screenX=${pos[0]} outerWidth=${pos[2]}`);
                  }
                }
                let last = null;
                const found = await poll(async () => {
                  last = await read();
                  return last && last.state === 'ready' && last.name === expected;
                }, { timeout: 15000, interval: 80, desc: `#name=${expected}` }).catch(() => false);
                if (found) {
                  await sleep(1500);
                  last = await read();
                  row.final = last ? last.name : null;
                  row.ok = !!(last && last.state === 'ready' && last.name === expected);
                  if (!row.ok) row.note = `${row.note} B 가 표시됐다가 되돌아감`.trim();
                } else {
                  row.final = last ? `${last.name}(${last.state})` : null;
                }
                row.titleFinal = await titleName(port);
              }
              if (row.secondCode !== null && B.exited && row.secondCode !== 0) row.note = `${row.note} 두 번째 프로세스 종료코드 ${row.secondCode}`.trim();
            }
          } finally {
            if (browser) await browser.close().catch(() => {});
            killAll();
            spawned.clear();
            await sleep(400);
            try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* ignore */ }
          }
          rows.push(row);
          const line = `Δ${delta}ms #${attempt}: ${row.ok ? 'OK ' : 'LOST'} ${row.order}, 두 번째 종료 ${row.secondExitMs ?? '-'}ms(code ${row.secondCode ?? '-'}), 최종 #name=${row.final} (HTTP 제목=${row.titleFinal})${row.note ? ` — ${row.note}` : ''}`;
          console.log(`      [OPN-07a] ${line}`);
          if (!row.ok) fails.push(line);
        }
      }
    } finally {
      killAll();
    }
    for (const delta of DELTAS) {
      const r = rows.filter((x) => x.delta === delta);
      c.obs(`Δ${delta}ms: ${r.map((x) => `${x.ok ? 'OK' : `LOST(${x.final})`}[${x.order}]`).join(' ')}`);
    }
    assert.equal(fails.length, 0, `OPN-07a 유실/실패 ${fails.length}/${rows.length}회차 — 첫 건: ${fails[0]}`);
  }, 900000),
], { noApp: true });

// =============================================================== SUITE: 폭 맞춤 배율이 허용 범위 밖일 때 줌 방향 (ZM-17)
function zoomDirectionCase(kind) {
  return async (c) => {
    const { page } = c;
    const wide = kind === 'wide';
    const bad = [];
    const rows = [];
    const EPS = 1e-9;
    // 기대 규칙: wide(맞춤<10%) → 확대는 증가, 축소는 증가 금지. thin(맞춤>800%) → 축소는 감소, 확대는 감소 금지
    const rule = (dir) => {
      if (wide) return dir > 0 ? { name: '증가', ok: (p, q) => q > p } : { name: '증가하지 않음', ok: (p, q) => q <= p + EPS };
      return dir < 0 ? { name: '감소', ok: (p, q) => q < p } : { name: '감소하지 않음', ok: (p, q) => q >= p - EPS };
    };
    const triggers = [
      ['Ctrl+=', () => press(page, 'Control+Equal'), +1],
      ['Ctrl+-', () => press(page, 'Control+Minus'), -1],
      ['Ctrl+휠 위(확대)', async () => { const p = center(await snap(page)); await ctrlWheel(page, p.x, p.y, -120); }, +1],
      ['Ctrl+휠 아래(축소)', async () => { const p = center(await snap(page)); await ctrlWheel(page, p.x, p.y, 120); }, -1],
    ];
    const toFit = async () => {
      await press(page, 'Control+0');
      const s = await snap(page);
      if (wide) assert.ok(s.scale < 0.1, `사전조건: 폭 맞춤 배율이 10% 미만이어야 함 (scale=${s.scaleStr})`);
      else assert.ok(s.scale > 8, `사전조건: 폭 맞춤 배율이 800% 초과여야 함 (scale=${s.scaleStr})`);
      return s;
    };
    for (const [label, act, dir] of triggers) {
      const r = rule(dir);
      const s0 = await toFit();
      await act();
      const s1 = await snap(page);
      rows.push(`${label}: ${s0.scaleStr}→${s1.scaleStr}(기대 ${r.name})`);
      if (!r.ok(s0.scale, s1.scale)) bad.push(`${label} 1회: ${s0.scaleStr}→${s1.scaleStr} (기대 ${r.name})`);
      await toFit();
      let prev = (await snap(page)).scale;
      const seq = [prev.toFixed(4)];
      let seqOk = true;
      for (let i = 0; i < 5; i++) {
        await act();
        const cur = (await snap(page)).scale;
        seq.push(cur.toFixed(4));
        if (!r.ok(prev, cur)) seqOk = false;
        prev = cur;
      }
      rows.push(`${label} 5회: ${seq.join('→')}`);
      if (!seqOk) bad.push(`${label} 연속 5회: ${seq.join('→')} (매 단계 기대 ${r.name})`);
    }
    // 범위 안에 들어온 뒤에는 ZM-04 의 clamp(0.1 / 8) 유지
    let s = await toFit();
    const enter = wide ? 'Control+Equal' : 'Control+Minus';
    let n = 0;
    while ((wide ? s.scale < 0.1 : s.scale > 8) && n < 25) { await press(page, enter); s = await snap(page); n++; }
    const inRange = s.scale >= 0.1 && s.scale <= 8;
    rows.push(`범위 진입: ${enter} ${n}회 → ${s.scaleStr}`);
    if (!inRange) bad.push(`${enter} ${n}회 후에도 범위(0.1~8) 밖: scale=${s.scaleStr}`);
    const untilStable = async (key, wheelDy) => {
      let cur = await snap(page);
      for (let i = 0; i < 90; i++) {
        if (wheelDy) { const p = center(cur); await ctrlWheel(page, p.x, p.y, wheelDy); } else await press(page, key);
        const nx = await snap(page);
        if (nx.scaleStr === cur.scaleStr) return nx;
        cur = nx;
      }
      return cur;
    };
    if (inRange) {
      s = await untilStable('Control+Minus');
      rows.push(`범위 안 Ctrl+- 연타 → ${s.scaleStr}`);
      if (s.scaleStr !== '0.1000') bad.push(`범위 안 Ctrl+- 연타 후 scale=${s.scaleStr} (기대 0.1000)`);
      s = await untilStable('Control+Equal');
      rows.push(`범위 안 Ctrl+= 연타 → ${s.scaleStr}`);
      if (s.scaleStr !== '8.0000') bad.push(`범위 안 Ctrl+= 연타 후 scale=${s.scaleStr} (기대 8.0000)`);
      s = await untilStable(null, 600);
      rows.push(`범위 안 Ctrl+휠 아래 연타 → ${s.scaleStr}`);
      if (s.scaleStr !== '0.1000') bad.push(`범위 안 Ctrl+휠 아래 연타 후 scale=${s.scaleStr} (기대 0.1000)`);
      s = await untilStable(null, -600);
      rows.push(`범위 안 Ctrl+휠 위 연타 → ${s.scaleStr}`);
      if (s.scaleStr !== '8.0000') bad.push(`범위 안 Ctrl+휠 위 연타 후 scale=${s.scaleStr} (기대 8.0000)`);
    }
    await press(page, 'Control+0');
    for (const r of rows) c.obs(r);
    if (bad.length) console.log(`      [ZM-17 ${kind}] 위반 ${bad.length}건:\n${bad.map((b) => `        - ${b}`).join('\n')}`);
    assert.equal(bad.length, 0, `ZM-17(${kind}) 줌 방향/범위 위반 ${bad.length}건 — ${bad.slice(0, 4).join(' | ')}`);
  };
}

// 20000×300 이미지를 처음부터 열면 초기 창 폭이 작업 영역 폭으로 클램프되어 보조 모니터 안전 규칙(창 오른쪽 끝 ≤ x=0)을 지키기 어렵다.
// 그래서 FX-BASIC(880 폭 창)으로 시작한 뒤 main 이 렌더러에 'viewer:open' 을 보내는 경로(두 번째 인스턴스/Ctrl+O 와 같은 경로)로 열고, 창 크기는 바뀌지 않는다.
const zoom17Via = (file, name, kind) => async (c) => {
  await openViaMain(c.app, c.page, file());
  await waitReady(c.page, name, 30000);
  return zoomDirectionCase(kind)(c);
};
suite('zoom17-wide', () => F.b1, [
  step('ZM-17(wide)', '20000×300(880 폭 창에서 맞춤 약 4%): 확대는 scale 증가, 축소는 증가하지 않음, 범위 안에서는 clamp 유지', `scale 비교(data-scale, toFixed(4)), 상대 단계 비교. 범위 clamp 는 문자열 정확 일치`, zoom17Via(() => F.wideFile, 'wide.png', 'wide'), 180000),
]);
suite('zoom17-thin', () => F.b1, [
  step('ZM-17(thin)', '50×1500(880 폭 창에서 맞춤 1600%): 축소는 scale 감소, 확대는 감소하지 않음, 범위 안에서는 clamp 유지', `scale 비교(data-scale, toFixed(4)), 상대 단계 비교. 범위 clamp 는 문자열 정확 일치`, zoom17Via(() => F.thinFile, 'thin.png', 'thin'), 180000),
]);

// =============================================================== SUITE: 이어보기 (STR) — FX-STR: 800 폭, 높이 3000/3400/2600/600
const STR_H = [3000, 3400, 2600, 600];
const STR_NAMES = ['01.png', '02.png', '03.png', '04.png'];
const STR_DIMS = STR_H.map((h) => `800×${h}`);
const STR_SUM = STR_H.reduce((a, b) => a + b, 0);

suite('str', () => F.strDir, [
  step('STR-01', '폴더의 모든 장이 한 띠로 이어짐: .page 4개, 장 사이 틈/겹침 없음, scrollHeight ≈ 장 높이 합 × 배율, 모든 장 폭 = #strip 폭 (창 폭을 바꿔도)', '장 높이 ±1px, 연속성 ±0.6px, scrollHeight ±1.5px', async (c) => {
    const { page, app } = c;
    let s = await waitReady(page, '01.png');
    assert.equal(s.count, 4);
    assert.equal(s.pages.length, 4);
    assert.deepEqual(s.pages.map((p) => baseName(p.src)), STR_NAMES);
    assert.equal(s.scaleStr, '1.0000');
    const check = (v, label) => {
      assertFitLayout(v, label);
      assertContiguous(v, label);
      const sc = stripScale(v);
      STR_H.forEach((h, i) => approx(v.pages[i].height, h * sc, 1, `${label}: 장 ${i} 높이`));
      approx(v.strip.height, STR_SUM * sc, 1.5, `${label}: #strip 높이 = 장 높이 합 × 배율`);
      approx(v.scrollHeight, STR_SUM * sc, 1.5, `${label}: scrollHeight`);
    };
    check(s, '초기');
    const rows = [`초기(scale ${s.scaleStr}): scrollHeight=${s.scrollHeight}, 장 y=${s.pages.map((p) => p.y.toFixed(1)).join('/')}`];
    for (const w of [700, 1100, 1500]) {
      const t = await resizeTo(app, page, w, 700);
      check(t, `창 폭 ${w}`);
      rows.push(`창 ${w}(scale ${t.scaleStr}): scrollHeight=${t.scrollHeight} (기대 ${(STR_SUM * stripScale(t)).toFixed(1)})`);
    }
    await restoreSize(app, page);
    c.obs(rows.join(' ; '));
  }),
  step('STR-02', '경계 픽셀 연속성(스크린샷): 장 k 맨 아래 노랑 띠와 장 k+1 맨 위 흰 띠가 틈·겹침 없이 맞닿음 — 배율 1.0 은 행 단위 정확, 비정수 배율·확대에서는 ±2.5행', '노랑/흰 띠 높이·경계 위치 DOM 과 일치, 사이 틈 0행', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const rows = [];
    for (const k of [0, 1, 2]) rows.push((await scanBoundary(page, k, { exact: true })).info);
    for (const w of [700, 1100, 1500]) {
      await resizeTo(app, page, w, 700);
      for (const k of [0, 1, 2]) rows.push((await scanBoundary(page, k)).info);
    }
    await restoreSize(app, page);
    await resetView(page);
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    for (const k of [0, 1, 2]) rows.push(`[확대 1.5625] ${(await scanBoundary(page, k)).info}`);
    await press(page, 'Control+0');
    c.obs(rows.slice(0, 3).join(' ; '));
    c.obs(`비정수 배율(창 폭 700/1100/1500) 9곳 + 확대 3곳 모두 통과. 예: ${rows[3]}`);
    await shot(page, 'str-02-boundary.png');
  }),
  step('STR-03', '경계 통과 시 index/#page/현재 장 파일/#dims 갱신(#index·title 은 회차 기준이라 불변): 경계 -3px 은 윗 장, -2px 부터 아랫 장(±2px 규칙), 위·아래 양방향', '정확 일치(경계 3곳 × 12지점)', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const sz = initSizes.get(app);
    await resizeTo(app, page, sz[0], 460); // 마지막 장 맨 위(y=9000)에도 도달할 수 있도록 뷰포트를 낮춘다(폭 불변 → 배율 1.0)
    const s0 = await snap(page);
    assert.equal(s0.scaleStr, '1.0000');
    assert.ok(maxTopOf(s0) >= s0.pages[3].y + 4, `마지막 장 top 에 도달 못함: maxTop=${maxTopOf(s0)} y3=${s0.pages[3].y}`);
    let checked = 0;
    for (const k of [1, 2, 3]) {
      const y = s0.pages[k].y;
      assert.equal(y, Math.round(y), '배율 1.0 에서 장 top 은 정수');
      const seq = [[-60, k - 1], [-3, k - 1], [-2, k], [-1, k], [0, k], [1, k], [30, k], [0, k], [-1, k], [-2, k], [-3, k - 1], [-60, k - 1]];
      for (const [d, exp] of seq) {
        await setScroll(page, y + d, 0);
        await sleep(60);
        const s = await waitSnap(page, (v) => v.index === exp && v.pageText === `${exp + 1}/4장`, `경계 ${k} 의 ${d >= 0 ? '+' : ''}${d}px → index ${exp}`, 3000);
        assert.equal(s.pageText, `${exp + 1}/4장`, `경계 ${k} ${d}px: #page`);
        assert.equal(baseName(s.cur.src), STR_NAMES[exp], `경계 ${k} ${d}px: 현재 장 파일`);
        assert.equal(s.indexText, '(1/1)', `경계 ${k} ${d}px: #index(회차 번호)는 장 스크롤과 무관`);
        assert.equal(s.title, 'ep (1/1) - str - Longroll', `경계 ${k} ${d}px: title(장 스크롤로는 안 바뀜)`);
        assert.equal(s.dims, STR_DIMS[exp], `경계 ${k} ${d}px: #dims`);
        assert.equal(s.index, expectedIndex(s), `경계 ${k} ${d}px: 규칙(top ≤ scrollTop+2 중 마지막)`);
        await sleep(100);
        assert.equal((await snap(page)).index, exp, `경계 ${k} ${d}px: 100ms 뒤 index 가 흔들림`);
        checked++;
      }
    }
    await restoreSize(app, page);
    c.obs(`경계 3곳(y=${s0.pages[1].y}/${s0.pages[2].y}/${s0.pages[3].y}) × 12지점(-60,-3,-2,-1,0,+1,+30 상승 후 0,-1,-2,-3,-60 하강) = ${checked}회, 뷰포트 높이 ${s0.clientHeight}`);
  }),
  step('STR-04', '휠·PageDown·드래그 패닝이 장 경계를 넘어 끊김 없이 이어짐: 이동량이 입력량과 같고 index 가 규칙대로 단조 변화', 'PageDown ±3.5px, 드래그 ±1.5px, index 규칙 정확', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const s0 = await snap(page);
    const { x, y } = center(s0);
    const tops = s0.pages.map((p) => p.y);
    const obs = [];
    // (a) 휠
    await page.mouse.move(x, y);
    let prev = 0;
    const seen = new Set([0]);
    const wheelRows = [];
    for (let i = 0; i < 40 && prev < 7000; i++) {
      await page.mouse.wheel(0, 1000);
      const r = await settleScroll(page, 250);
      const s = await snap(page);
      assert.ok(r.top > prev + 50, `휠 ${i + 1}회: scrollTop 이 늘지 않음 ${prev}→${r.top}`);
      assert.equal(s.index, expectedIndex(s), `휠 ${i + 1}회 index 규칙 (scrollTop ${r.top})`);
      assert.ok(s.index >= Math.max(...seen), `휠 ${i + 1}회: index 가 거꾸로 감`);
      seen.add(s.index);
      wheelRows.push(`${prev.toFixed(0)}→${r.top.toFixed(0)}(장 ${s.index})`);
      prev = r.top;
    }
    assert.ok(seen.has(0) && seen.has(1) && seen.has(2), `휠이 경계 2곳을 못 넘음: ${[...seen]}`);
    obs.push(`휠: ${wheelRows.join(' ')}`);
    // (b) PageDown 11회(각 90%): 경계 3000/6400 을 가로지르는 입력도 정확히 90% 이동
    await resetView(page);
    const p90 = s0.clientHeight * 0.9;
    prev = 0;
    const pdRows = [];
    for (let i = 0; i < 11; i++) {
      await press(page, 'PageDown');
      const r = await settleScroll(page, 300, 8000);
      const s = await snap(page);
      approx(r.top - prev, p90, SCROLL_TOL + 2, `PageDown ${i + 1}회 이동량 (${prev.toFixed(1)}→${r.top.toFixed(1)}, 경계 ${tops.filter((t) => t > prev && t <= r.top).join('/') || '없음'} 통과)`);
      assert.equal(s.index, expectedIndex(s), `PageDown ${i + 1}회 index 규칙`);
      pdRows.push(`${r.top.toFixed(0)}(장 ${s.index})`);
      prev = r.top;
    }
    obs.push(`PageDown×11: ${pdRows.join(' ')}`);
    // (c) 드래그 패닝: 위로 600px 씩 끌기(콘텐츠가 위로 = scrollTop 증가). 경계 3000/6400 통과 포함
    await resetView(page);
    const y1 = Math.round(s0.sr.top + s0.clientHeight * 0.9);
    const y2 = y1 - 600;
    prev = 0;
    const dragRows = [];
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(x, y1);
      await page.mouse.down();
      await page.mouse.move(x, y2, { steps: 6 });
      await page.mouse.up();
      const s = await snap(page);
      approx(s.scrollTop - prev, 600, SCROLL_TOL, `드래그 ${i + 1}회 이동량 (${prev}→${s.scrollTop})`);
      assert.equal(s.index, expectedIndex(s), `드래그 ${i + 1}회 index 규칙`);
      dragRows.push(`${s.scrollTop.toFixed(0)}(장 ${s.index})`);
      prev = s.scrollTop;
    }
    obs.push(`드래그↑×12: ${dragRows.join(' ')}`);
    // (d) 되돌림: 아래로 600px 씩 끌기(scrollTop 감소)로 경계를 반대 방향으로 통과
    const backRows = [];
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(x, y2);
      await page.mouse.down();
      await page.mouse.move(x, y1, { steps: 6 });
      await page.mouse.up();
      const s = await snap(page);
      approx(prev - s.scrollTop, 600, SCROLL_TOL, `되돌림 드래그 ${i + 1}회 이동량 (${prev}→${s.scrollTop})`);
      assert.equal(s.index, expectedIndex(s), `되돌림 ${i + 1}회 index 규칙`);
      backRows.push(`${s.scrollTop.toFixed(0)}(장 ${s.index})`);
      prev = s.scrollTop;
    }
    assert.equal(prev, 0);
    obs.push(`드래그↓×12: ${backRows.join(' ')}`);
    for (const o of obs) c.obs(o);
  }),
  step('STR-07', '짧은 마지막 장(600px < 뷰포트): End 와 이미지 파일 인자(04.png) 모두 scrollTop = 최대 스크롤(마지막 장 top 에는 못 감), End 의 index 는 규칙(뷰포트 맨 위 장), →/← 는 회차 이동이라 장 이동 없음(단독 폴더 토스트), 위로 스크롤하면 규칙 유지', '정확 일치, scrollTop ±1.5', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    let s = await snap(page);
    const maxTop = maxTopOf(s);
    assert.ok(maxTop < s.pages[3].y - 20, `사전조건: 마지막 장 top(${s.pages[3].y})이 최대 스크롤(${maxTop})보다 아래여야 함`);
    await press(page, 'End');
    await settleScroll(page);
    s = await snap(page);
    approx(s.scrollTop + s.clientHeight, s.scrollHeight, SCROLL_TOL, 'End');
    assert.equal(s.index, expectedIndex(s));
    assert.equal(s.index, 2, 'End 상태에서 뷰포트 맨 위가 03.png 에 걸림');
    const atEnd = s.scrollTop;
    await ensureNoToast(page);
    await press(page, 'ArrowRight');
    s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '→ = 회차 이동(마지막 토스트)');
    assert.equal(s.index, 2, '→ 가 장을 옮김');
    approx(s.scrollTop, atEnd, 1, '→ 로 스크롤이 움직임');
    await press(page, 'ArrowUp');
    s = await waitSnap(page, (v) => v.index === expectedIndex(v), '위로 스크롤한 뒤 규칙 적용');
    assert.equal(s.index, 2);
    note(`STR-07 관찰: 짧은 마지막 장(04.png)이 뷰포트 아래쪽에 통째로 보이는 End 상태에서 #page 는 ${s.pageText}(규칙상 뷰포트 맨 위에 걸친 장 = 03.png). ←/→ 는 회차 이동이라 장으로 고정(pin)되지 않음`);
    await withApp(path.join(F.strDir, '04.png'), async ({ page: p2 }) => {
      const t = await waitReady(p2, { comic: 'str' });
      approx(t.scrollTop, maxTopOf(t), 1.5, '짧은 마지막 장 인자: scrollTop = 최대 스크롤');
      note(`STR-07 관찰: 짧은 마지막 장(04.png)을 인자로 열면 scrollTop=${t.scrollTop}(최대 스크롤) #page=${t.pageText} index=${t.index} (규칙상 ${expectedIndex(t)}; 계약은 이 경우 index 를 정하지 않으므로 단언하지 않음)`);
    });
    c.obs(`최대 스크롤=${maxTop} < 마지막 장 top=${s.pages[3].y}: End → index 2(규칙), → 토스트로 scrollTop ${atEnd} 불변, ↑ 80px 후 index 2, 04.png 인자 → scrollTop 최대 스크롤`);
  }),
]);

// =============================================================== SUITE: 폭이 다른 장 (STR-05) — FX-MIX
suite('str-mix', () => F.mixDir, [
  step('STR-05', '서로 다른 폭의 장(800/720/720/1000/720)이 같은 표시 폭(= 기준 폭 720 의 폭 맞춤)으로 맞춰지고 높이는 종횡비대로, 장 사이 틈 없음, 장별 #dims 는 원본 크기', '폭 ±0.5px, 높이 ±1px, 정확 일치', async (c) => {
    const { page } = c;
    const dims = [[800, 1500], [720, 1800], [720, 1200], [1000, 1000], [720, 900]];
    let s = await waitReady(page, 'm1.png');
    assert.equal(s.count, 5);
    assert.equal(s.pages.length, 5);
    assertFitLayout(s, 'mix', 720);
    assert.equal(s.scaleStr, '1.0000', '기준 폭 720 · 창 792 → 배율 1.0');
    approx(s.strip.width, 720, 1, '표시 폭 = 기준 폭(720) × 1.0');
    assertContiguous(s, 'mix');
    let sum = 0;
    dims.forEach(([w, h], i) => {
      const eh = s.strip.width * h / w;
      approx(s.pages[i].height, eh, 1, `m${i + 1} 높이 = 표시 폭 × ${h}/${w}`);
      sum += eh;
    });
    approx(s.scrollHeight, sum, 1.5, 'scrollHeight = 높이 합');
    const names = [];
    for (let i = 0; i < 5; i++) {
      await setScroll(page, s.pages[i].y + 5, 0);
      const v = await waitSnap(page, (x) => x.index === i, `장 ${i} 로 스크롤`);
      assert.equal(baseName(v.cur.src), `m${i + 1}.png`);
      assert.equal(v.dims, `${dims[i][0]}×${dims[i][1]}`, `m${i + 1} #dims 는 원본 크기`);
      assert.equal(v.pageText, `${i + 1}/5장`);
      names.push(`${baseName(v.cur.src)} ${v.dims}`);
    }
    await resetView(page);
    // 폭이 섞인 장도 색 띠가 올바른 배율로 그려진다 (800/1000 폭 장은 축소, 720 폭 장은 1:1)
    const entries = [1, 2, 3, 4, 5].map((n) => M[`mix/m${n}.png`]);
    const picked = [];
    for (const i of [0, 3]) {
      await setScroll(page, s.pages[i].y + 150, 0);
      await sleep(150);
      await checkBand(page, entries, `m${i + 1} 픽셀`, [0.3, 0.4, 0.5]);
      picked.push(checkBand.lastPage);
    }
    c.obs(`표시 폭=${s.strip.width.toFixed(1)}(모든 장), 높이=${s.pages.map((p) => p.height.toFixed(1)).join('/')}, scrollHeight=${s.scrollHeight}; ${names.join(' | ')}; 픽셀 검사 장 ${picked.join(',')}`);
  }),
]);

// =============================================================== SUITE: 기준 폭 = 최빈값 (STR-06)
suite('str-ref', null, [
  step('STR-06', '기준 폭 = 헤더로 읽은 폭의 최빈값(동률이면 먼저 나온 값): scale = #strip 폭 / 기준 폭', '표시 폭 ±1px, scale 문자열 정확', async (c) => {
    const cases = [
      ['mix', F.mixDir, 'm1.png', 720, 'm1(800)이 첫 장이지만 720 이 3장 → 720'],
      ['tie', F.tieDir, 'a.png', 720, '720 1장·800 1장 동률, 720 이 먼저 → 720'],
      ['tie2', F.tie2Dir, 'a.png', 800, '800 1장·720 1장 동률, 800 이 먼저 → 800'],
    ];
    const obs = [];
    for (const [label, dir, first, ref, why] of cases) {
      await withApp(dir, async ({ page }) => {
        const s = await waitReady(page, first);
        assertFitLayout(s, label, ref);
        assert.equal(s.scaleStr, '1.0000', `${label}: 창을 기준 폭에 맞췄으므로 scale 은 정확히 1.0`);
        approx(s.strip.width, ref, 1, `${label}: 표시 폭 = 기준 폭`);
        assert.equal(s.zoomText, '100% 맞춤');
        obs.push(`${label}: ${why} → 표시 폭 ${s.strip.width.toFixed(1)}, scale ${s.scaleStr}`);
      });
    }
    c.obs(obs.join(' / '));
  }),
], { noApp: true });

// =============================================================== SUITE: 많은 장 (STR-08, STR-10) — FX-MANY: 720×2000 24장
suite('many', () => F.manyDir, [
  step('STR-08', 'lazy/eager 로딩과 높이 선확정: 모든 장 <img width height> 가 헤더 크기로 즉시 지정, #strip 높이 = 24×2000×배율, 현재 장 -1~+2 는 eager 이고 먼 장은 lazy·미로드, 이동하면 승격', '정확 일치, 높이 ±1.5px', async (c) => {
    const { page } = c;
    let s = await waitReady(page, 'm01.png');
    assert.equal(s.count, 24);
    assert.equal(s.pages.length, 24);
    const sc = stripScale(s, 720);
    assertFitLayout(s, 'many', 720);
    assert.equal(s.scaleStr, '1.0000');
    for (const p of s.pages) {
      assert.equal(p.attrW, '720', `장 ${p.i}: <img width> 는 헤더 폭`);
      assert.equal(p.attrH, '2000', `장 ${p.i}: <img height> 는 헤더 높이`);
    }
    assertContiguous(s, 'many');
    approx(s.strip.height, 24 * 2000 * sc, 2, '#strip 높이(이미지 로드 전에도 확정)');
    approx(s.scrollHeight, 24 * 2000 * sc, 2, 'scrollHeight');
    assert.deepEqual(s.pages.slice(0, 3).map((p) => p.loading), ['eager', 'eager', 'eager'], '현재 장(0) -1~+2 = 0..2 는 eager');
    assert.ok(s.pages.slice(3).every((p) => p.loading === 'lazy'), '현재 장 +2 보다 먼 장(3번 이후)은 lazy');
    const notLoaded = s.pages.filter((p) => !p.complete || p.natW === 0).length;
    assert.ok(s.pages.slice(12).every((p) => !(p.complete && p.natW > 0)), '먼 장(12번 이후)이 미리 디코드/로드됨 — lazy 가 동작하지 않음');
    const loadedFar = s.pages.slice(12).filter((p) => p.complete && p.natW > 0).length;
    // 이동 시 승격
    await setScroll(page, s.pages[15].y, 0);
    s = await waitSnap(page, (v) => v.index === 15 && [14, 15, 16, 17].every((i) => v.pages[i].loading === 'eager'), '15번 장 근처 eager 승격');
    assert.equal(s.pages[22].loading, 'lazy', '멀리 있는 22번 장은 여전히 lazy');
    await setScroll(page, 0, 0);
    s = await waitSnap(page, (v) => v.index === 0, '맨 위로');
    c.obs(`24장: 모든 <img width/height>=720/2000, #strip 높이=${s.strip.height.toFixed(1)}(기대 ${(24 * 2000 * sc).toFixed(1)}), 초기 eager 0..2, lazy 3..23, 로드 전 장 ${notLoaded}/24(12번 이후 로드된 장 ${loadedFar}), 15번 장으로 이동 시 14..17 eager 승격, 22번 lazy 유지`);
  }),
  step('STR-10', '24장 전체 띠: End/Home 은 전체 띠의 맨 아래/맨 위, 장마다 맨 위로 스크롤하면 모두 로드되고 #page 가 i/24장 순서, count=24', '정확 일치', async (c) => {
    const { page } = c;
    await resetView(page);
    await press(page, 'End');
    await settleScroll(page, 300, 8000);
    let s = await snap(page);
    approx(s.scrollTop + s.clientHeight, s.scrollHeight, SCROLL_TOL, 'End');
    assert.equal(s.index, expectedIndex(s));
    const endIdx = s.index;
    await press(page, 'Home');
    await settleScroll(page, 300, 8000);
    s = await snap(page);
    assert.equal(s.scrollTop, 0);
    assert.equal(s.index, 0);
    assert.equal(s.pageText, '1/24장');
    const seen = await scanPages(page);
    assert.equal(seen.length, 24);
    assert.deepEqual(seen.map((x) => x.name), Array.from({ length: 24 }, (_, i) => `m${String(i + 1).padStart(2, '0')}.png`));
    for (const x of seen) {
      assert.ok(x.natW === 720 && !x.broken, `${x.name} 로드 ${x.natW}`);
      assert.equal(x.pageText, `${x.i + 1}/24장`, `${x.name} 맨 위에서 #page`);
    }
    s = await snap(page);
    assert.equal(s.count, 24);
    c.obs(`End → 아래 끝(index ${endIdx}), Home → 0(index 0, 1/24장), 장마다 맨 위로 스크롤 ×24 → m01..m24 순서·로드, #page=1/24장..24/24장`);
  }, 120000),
]);

// =============================================================== SUITE: 열기 직후 위치 안정·EXIF (STR-09, STR-11)
suite('str-open', null, [
  step('STR-11', '이미지 로드 때 스크롤 위치가 튀지 않음: 중간 장(m12)을 인자로 열면 그 장이 맨 위에 놓이고 로드가 끝난 뒤에도 같은 위치', 'scrollTop ±1(1.5초간 100ms 간격 표본), 장 top 과 뷰포트 맨 위 차이 ±1.5px', async (c) => {
    await withApp(path.join(F.manyDir, 'm12.png'), async ({ page }) => {
      const s0 = await waitReady(page, 'm12.png');
      assert.equal(s0.index, 11);
      const first = s0.scrollTop;
      approx(first, s0.pages[11].y, 1.5, '열자마자 m12 가 맨 위');
      const samples = [first];
      for (let i = 0; i < 15; i++) {
        await sleep(100);
        const s = await snap(page);
        samples.push(s.scrollTop);
        approx(s.scrollTop, first, 1, `${(i + 1) * 100}ms 뒤 scrollTop 이 튐`);
        approx(s.pages[11].top, s.sr.top, 1.5, `${(i + 1) * 100}ms 뒤 m12 가 뷰포트 맨 위에서 밀림`);
        assert.equal(s.index, 11);
      }
      const fin = await waitSnap(page, (v) => v.pages[10].complete && v.pages[11].complete && v.pages[12].complete, '주변 장 로드 완료', 15000);
      assert.deepEqual([fin.pages[10].natW, fin.pages[11].natW, fin.pages[12].natW], [720, 720, 720]);
      approx(fin.scrollTop, first, 1, '로드 완료 후 scrollTop');
      c.obs(`m12 로드 전후 1.5초 동안 scrollTop ${Math.min(...samples)}~${Math.max(...samples)} (처음 ${first}), 주변 장(m11~m13) 로드 완료 후 ${fin.scrollTop}`);
    });
  }),
  step('STR-09', '헤더 크기와 실제 크기가 다른 장(EXIF 회전 JPEG)이 로드되면 그 장의 칸이 실제 크기로 보정되고 장 사이 틈/겹침이 없음(레이아웃 자가 복구)', '연속성 ±0.6px, 칸 높이 ±1.5px', async (c) => {
    await withApp(F.exifC, async ({ page }) => {
      const s0 = await waitReady(page, 'c.jpg');
      assert.equal(s0.index, 2);
      await waitSnap(page, (v) => v.pages[1].complete && v.pages[1].natW > 0 && v.pages[2].complete && v.pages[2].natW > 0, '위쪽 b.jpg 와 c.jpg 로드', 15000);
      await sleep(600);
      const s = await snap(page);
      const b = s.pages[1];
      assertContiguous(s, 'EXIF 보정 후');
      assertFitLayout(s, 'EXIF 보정 후');
      const sc = stripScale(s);
      const rotated = b.natW === 800 && b.natH === 600;
      if (rotated) {
        approx(b.height, 600 * sc, 1.5, '회전 반영된 실제 크기(800×600) 기준 높이로 보정');
        assert.equal(b.attrW, '800');
        assert.equal(b.attrH, '600');
      } else {
        approx(b.height, b.natH * sc * (800 / b.natW), 1.5, '실제 크기 기준 높이');
      }
      assert.equal(s.state, 'ready');
      note(`STR-09 관찰: EXIF 회전(orientation 6) JPEG 는 파일에 저장된 크기가 600×800(헤더 파서도 600×800), 로드 후 Chromium natural=${b.natW}×${b.natH} → ${rotated ? '회전이 반영되어(800×600) 칸 높이가 보정됨' : '회전 미반영'}`);
      c.obs(`열 때 b.jpg 칸 ${s0.pages[1].height.toFixed(1)}px(헤더 600×800) → 로드 후 ${b.height.toFixed(1)}px(natural ${b.natW}×${b.natH}), 장 y=${s.pages.map((p) => p.y.toFixed(1)).join('/')} 연속`);
    });
  }),
  step('STR-09(보상)', '위쪽 장의 높이가 로드 후 바뀌어도(EXIF 회전) 현재 장이 뷰포트 맨 위에 유지됨(plan.md 8-2: 위쪽 이미지의 높이 변화는 scrollTop 으로 보상) — 현재 장 아래가 충분히 길어 스크롤 한계에 안 걸리는 폴더(exif: a,b,c,d)', 'c.jpg top 과 뷰포트 맨 위 차 ±2px, scrollTop = c.jpg top ±2', async (c) => {
    await withApp(F.exifC, async ({ page }) => {
      const s0 = await waitReady(page, 'c.jpg');
      await waitSnap(page, (v) => v.pages[1].complete && v.pages[1].natW > 0 && v.pages[2].complete && v.pages[2].natW > 0, '위쪽 b.jpg 와 c.jpg 로드', 15000);
      await sleep(600);
      const s = await snap(page);
      const rotated = s.pages[1].natW === 800 && s.pages[1].natH === 600;
      assert.ok(rotated, 'Chromium 이 EXIF 회전을 반영하지 않아 헤더≠실제 크기 상황이 재현되지 않음');
      const off = s.pages[2].top - s.sr.top;
      assert.equal(s.index, 2);
      assert.ok(Math.abs(off) <= 2, `c.jpg 가 뷰포트 맨 위에서 ${off.toFixed(1)}px 밀림 (b.jpg 칸이 헤더 기준 ${(s.strip.width * 800 / 600).toFixed(1)}px → 실제 ${s.pages[1].height.toFixed(1)}px 로 보정된 변화가 scrollTop 으로 보상되지 않음: 열 때 scrollTop ${s0.scrollTop.toFixed(1)} → 지금 ${s.scrollTop.toFixed(1)}, c.jpg top = ${s.pages[2].y.toFixed(1)})`);
      approx(s.scrollTop, s.pages[2].y, 2, 'scrollTop = c.jpg top');
      c.obs(`c.jpg top 오차 ${off.toFixed(2)}px, scrollTop ${s0.scrollTop.toFixed(1)}→${s.scrollTop.toFixed(1)}`);
    });
  }),
], { noApp: true });

// =============================================================== SUITE: 소수 배율(DPR)에서 장 경계 틈 없음 (STR-12)
suite('str-dpr', null, [
  step('STR-12', 'DPR 1.25/1.5/1.75 에서 창 폭 4종 × 경계 3곳: 장 사이에 배경색 틈(1 장치 px 포함)이 없고 노랑·흰 띠 높이/위치가 DOM 과 일치', '사이 틈 0행, 띠 높이 ±2.5행, 경계 위치 ±1.5행', async (c) => {
    const DPRS = process.env.LONGROLL_E2E_DPRS ? process.env.LONGROLL_E2E_DPRS.split(',').map(Number) : [1.25, 1.5, 1.75];
    const rows = [];
    let n = 0;
    for (const dpr of DPRS) {
      const pos = dsfWindowPos(dpr);
      const h = await launchApp(F.strDir, { pre: [`--force-device-scale-factor=${dpr}`], pos });
      try {
        const s0 = await snap(h.page);
        assert.ok(Math.abs(s0.dpr - dpr) < 1e-3, `DPR 강제 실패: ${s0.dpr} (요청 ${dpr})`);
        const bad = [];
        for (const w of [700, 910, 1100, 1300]) {
          await resizeSync(h.app, h.page, w, 800);
          for (const k of [0, 1, 2]) {
            try {
              await scanBoundary(h.page, k);
              n++;
            } catch (e) {
              bad.push(`폭 ${w} 경계 ${k}: ${String(e.message).split('\n')[0]}`);
            }
          }
        }
        rows.push(`DPR ${dpr}: 12곳 중 위반 ${bad.length}${bad.length ? ` [${bad.slice(0, 3).join(' | ')}]` : ''}`);
        console.log(`      [STR-12] ${rows[rows.length - 1]}`);
        assert.equal(bad.length, 0, `DPR ${dpr} 경계 위반 ${bad.length}건 — ${bad.slice(0, 3).join(' | ')}`);
      } finally {
        rendererErrorTotal += h.errors.length;
        await shutdown(h);
      }
      assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
    }
    for (const r of rows) c.obs(r);
    c.obs(`총 ${n}곳 통과`);
  }, 600000),
], { noApp: true });

// ---- 첫 열기 창 크기 맞춤(sizeWindowForContent) 시험 도우미
const centerOfBounds = (b) => [b.x + b.width / 2, b.y + b.height / 2];
const insideArea = (b, a) => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1;
async function waitContent(app, expect, label, timeout = 4000) {
  let last = null;
  try {
    return await poll(async () => {
      last = await winInfo(app);
      return last.content[0] === expect[0] && last.content[1] === expect[1] ? last : null;
    }, { timeout, desc: `${label}: 내부 크기 ${expect.join('×')}` });
  } catch (e) {
    throw new Error(`${e.message} (실제 ${last ? last.content.join('×') : '?'})`);
  }
}
async function keepsContent(app, expect, label) {
  await sleep(500);
  const w = await winInfo(app);
  assert.deepEqual(w.content, expect, `${label}: 내부 크기가 바뀜 ${w.content} (기대 ${expect})`);
  return w;
}
// main 의 fitContentSize 와 같은 방식으로 내부 크기를 정확히 맞춘다(혼합 배율 모니터의 setContentSize 오차 보정)
async function setContentExact(app, w, h) {
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(cw, ch);
    const [rw, rh] = win.getContentSize();
    if (rw !== cw || rh !== ch) {
      const b = win.getBounds();
      win.setBounds({ x: b.x, y: b.y, width: b.width + (cw - rw), height: b.height + (ch - rh) });
    }
  }, [w, h]);
  await assertOnSecondary(app, `setContentExact ${w}x${h}`);
  return (await winInfo(app)).content;
}

// =============================================================== SUITE: 초기 창 크기 (WIN-04 ~ WIN-11)
// 초기 내부 크기 = 폭 round(기준 폭 × 1.1) (라운드 3: 스크롤바 14px 가산 없음), 높이 820. 작업 영역(폭-16, 높이-60) 초과 시 축소, 최소 480×360, 파일 없이 시작하면 1100×820.
// 창은 show:false 로 만들어 첫 페인트 뒤 ready-to-show 에서 show() 된다(안 오면 main 의 5초 폴백). 상태가 empty/ready 로 정해진 직후에는 아직 숨겨져 있을 수 있다
// (통제 실험: 빈 페이지 앱도 data-state 설정 뒤 약 100~130ms 에 표시됨). 그래서 폴링하되 최대 6s(= 폴백 5s + 여유 1s) 안에 한 번도 표시되지 않으면 FAIL 이다.
async function waitVisible(app, label) {
  let last = null;
  try {
    return await poll(async () => {
      last = await winInfo(app);
      return last.visible ? last : null;
    }, { timeout: 6000, interval: 20, desc: `${label}: 창 표시(ready-to-show)` });
  } catch (e) {
    throw new Error(`${label}: 6초 안에 창이 표시되지 않음(ready-to-show·5초 폴백 모두 실패) visible=${last && last.visible}`);
  }
}
async function assertInitialWindow(app, page, expectContent, ref, label) {
  const w = await winInfo(app);
  assert.deepEqual(w.content, expectContent, `${label}: 창 내부 크기(getContentSize)`);
  const s = await snap(page);
  assert.equal(s.innerW, expectContent[0], `${label}: window.innerWidth`);
  assert.equal(s.innerH, expectContent[1], `${label}: window.innerHeight`);
  assert.equal(s.clientWidth, expectContent[0] - SB, `${label}: scroller.clientWidth = 내부 폭 (거터 없음)`);
  assert.equal(s.clientHeight, expectContent[1] - TOPBAR_H, `${label}: scroller.clientHeight = 내부 높이 - 34`);
  assertFitLayout(s, label, ref);
  if (!OSR) w.visible = (await waitVisible(app, label)).visible;
  assert.equal(w.fs, false);
  return { w, s };
}

suite('win-size', null, [
  step('WIN-04', '800 폭 이미지 처음 열기: 창 내부 크기 정확히 880×820, 배율 1.0, 좌우 레터박스 각 40px, 가로 스크롤 없음, 창이 표시됨·보조 모니터·시작 위치 유지', '내부 크기 정확 일치, 레터박스 ±1px', async (c) => {
    await withApp(F.basicDir, async ({ page, app }) => {
      await waitReady(page, '1.png');
      const { w, s } = await assertInitialWindow(app, page, [880, 820], 800, 'basic');
      assert.equal(s.scaleStr, '1.0000');
      approx(s.strip.left - s.sr.left, 40, 1, '왼쪽 레터박스');
      approx(s.sr.left + s.clientWidth - (s.strip.left + s.strip.width), 40, 1, '오른쪽 레터박스');
      if (!OSR) assert.equal(w.onPrimary, false, '창이 주 모니터에 있음');
      assert.ok(w.bounds.x + w.bounds.width <= 0, `창 오른쪽 끝 ${w.bounds.x + w.bounds.width} > 0`);
      assert.deepEqual([w.bounds.x, w.bounds.y], WINDOW_POS_XY, 'LONGROLL_WINDOW_POS 시작 위치 유지');
      c.obs(`내부 ${w.content.join('×')}(innerWidth ${s.innerW}×${s.innerH}), clientWidth=${s.clientWidth}, scale=${s.scaleStr}, 좌 레터박스 ${(s.strip.left - s.sr.left).toFixed(1)}px, scrollWidth=${s.scrollWidth}, 바깥 ${w.size.join('×')}, bounds=(${w.bounds.x},${w.bounds.y}), visible=${w.visible}`);
    });
  }),
  step('WIN-05', '720 폭 이미지(FX-MANY) → 내부 폭 792, 높이 820, 배율 1.0, 레터박스 각 36px', '내부 크기 정확 일치', async (c) => {
    await withApp(F.manyDir, async ({ page, app }) => {
      await waitReady(page, 'm01.png');
      const { w, s } = await assertInitialWindow(app, page, [792, 820], 720, 'many(720)');
      assert.equal(s.scaleStr, '1.0000');
      approx(s.strip.left - s.sr.left, 36, 1, '왼쪽 레터박스');
      c.obs(`내부 ${w.content.join('×')}, scale=${s.scaleStr}, 좌 레터박스 ${(s.strip.left - s.sr.left).toFixed(1)}px (기대 36)`);
    });
  }),
  step('WIN-06', '폭 400 이미지 → 계산값 454 가 최소 폭 480 으로 올라감: 내부 480×820, 배율 약 1.059, 가로 스크롤 없음', '내부 크기 정확 일치, 배율 ±5e-4', async (c) => {
    const obs = [];
    for (const [file, name, ref] of [[F.narrow, 'narrow.png', 400], [F.thinFile, 'thin.png', 50]]) {
      await withApp(file, async ({ page, app }) => {
        await waitReady(page, name);
        const { w, s } = await assertInitialWindow(app, page, [480, 820], ref, name);
        approx(s.scale, (480 - SB) / LB / ref, 5e-4 + 0.02 / ref, `${name} 배율`);
        obs.push(`${name}(폭 ${ref}): 내부 ${w.content.join('×')}, scale=${s.scaleStr} (기대 ${((480 - SB) / LB / ref).toFixed(4)})`);
      });
    }
    c.obs(obs.join(' / '));
  }),
  step('WIN-07', '폭이 섞인 폴더는 최빈 폭 기준으로 창 크기 결정(첫 장 폭 아님), 동률이면 먼저 나온 폭', '내부 크기 정확 일치', async (c) => {
    const obs = [];
    for (const [dir, name, expectW, ref, why] of [
      [F.mixDir, 'm1.png', 792, 720, 'mix(800,720,720,1000,720) → 최빈 720'],
      [F.tieDir, 'a.png', 792, 720, 'tie(720,800) 동률 → 먼저 나온 720'],
      [F.tie2Dir, 'a.png', 880, 800, 'tie2(800,720) 동률 → 먼저 나온 800'],
    ]) {
      await withApp(dir, async ({ page, app }) => {
        await waitReady(page, name);
        const { w, s } = await assertInitialWindow(app, page, [expectW, 820], ref, why);
        obs.push(`${why}: 내부 ${w.content.join('×')}, scale=${s.scaleStr}`);
      });
    }
    c.obs(obs.join(' / '));
  }),
  step('WIN-08', '작업 영역보다 넓은 이미지: 내부 폭이 작업 영역 폭 -16 으로 클램프되고 높이도 min(820, 작업 영역 높이 -60), 배율 < 1 (안전: DSF 2 로 작업 영역을 줄여 창 오른쪽 끝 ≤ x=0)', '내부 크기 정확 일치, 배율 ±1e-3', async (c) => {
    const DSF = OSR ? null : 2; // OSR 개발 모드는 DSF 강제가 안 먹으므로 기본 배율(작업 영역 2560 폭)에서 같은 클램프를 시험(창은 표시되지 않음)
    const { pos, workArea } = dsfClampPos(DSF);
    const expW = workArea.width - 16;
    const expH = Math.min(820, workArea.height - 60);
    const obs = [];
    for (const cfg of [
      { file: F.bigFile, name: 'big.png', ref: 2400, clamp: true },
      { file: F.b1, name: '1.png', ref: 800, clamp: false },
    ]) {
      const h = await launchApp(cfg.file, { pre: DSF ? [`--force-device-scale-factor=${DSF}`] : [], pos });
      try {
        const s = await waitReady(h.page, cfg.name);
        const w = await winInfo(h.app);
        if (DSF) assert.equal(s.dpr, 2, 'DPR 강제 실패');
        const wantW = cfg.clamp ? expW : Math.min(Math.round(cfg.ref * LB) + SB, expW);
        assert.deepEqual(w.content, [wantW, expH], `${cfg.name}: 내부 크기(작업 영역 ${workArea.width}×${workArea.height})`);
        if (!OSR) assert.ok(w.bounds.x + w.bounds.width <= 0, `창 오른쪽 끝 ${w.bounds.x + w.bounds.width} > 0 (주 모니터 침범)`);
        assertFitLayout(s, cfg.name, cfg.ref);
        if (cfg.clamp) {
          assert.ok(s.scale < 1, `클램프되면 배율 < 1 (scale=${s.scaleStr})`);
          approx(s.scale, (wantW - SB) / LB / cfg.ref, 1e-3, `${cfg.name} 배율`);
        } else {
          assert.equal(s.scaleStr, '1.0000');
        }
        obs.push(`${cfg.name}(폭 ${cfg.ref}, DSF 2, 작업 영역 ${workArea.width}×${workArea.height}): 내부 ${w.content.join('×')}${cfg.clamp ? ` = (${workArea.width}-16)×min(820, ${workArea.height}-60)` : ''}, scale=${s.scaleStr}, 바깥 오른쪽 끝 x=${w.bounds.x + w.bounds.width}`);
      } finally {
        rendererErrorTotal += h.errors.length;
        await shutdown(h);
      }
      assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
    }
    c.obs(obs.join(' / '));
  }, 120000),
  step('WIN-09', '파일 없이 시작(인자 없음 / 없는 경로 / 이미지 없는 폴더 / 지원 안 하는 파일) → 내부 1100×820', '내부 크기 정확 일치', async (c) => {
    const obs = [];
    for (const [arg, label] of [[null, '인자 없음'], [F.missing, '없는 경로'], [F.emptyDir, '이미지 없는 폴더'], [F.bTxt, '지원 안 하는 파일(note.txt)']]) {
      await withApp(arg, async ({ page, app }) => {
        const s = await snap(page);
        assert.equal(s.state, 'empty', `${label}: state`);
        const w = await winInfo(app);
        assert.deepEqual(w.content, [1100, 820], `${label}: 내부 크기`);
        assert.equal(s.innerW, 1100);
        assert.equal(s.innerH, 820);
        if (!OSR) w.visible = (await waitVisible(app, label)).visible;
        obs.push(`${label} → 내부 ${w.content.join('×')}, 표시됨`);
      });
    }
    c.obs(obs.join(' / '));
  }),
  step('WIN-10', '창 크기가 맞춰진 뒤에는 다른 파일을 열어도 바뀌지 않음(인자로 시작한 창): 두 번째 인스턴스 / Ctrl+O 대화상자(스텁) / viewer:open IPC / 사용자가 크기를 바꾼 뒤. (RT2-01: 파일 없이 시작한 창은 첫 열기에서 맞춰지므로 WIN-13 으로 이동 — 기존 "1100×820 유지" 단언은 뒤집힘)', '내부 크기 정확 불변', async (c) => {
    const obs = [];
    await withApp(F.basicDir, async ({ page, app, userData }) => {
      await waitReady(page, '1.png');
      const c0 = (await winInfo(app)).content;
      assert.deepEqual(c0, [880, 820]);
      const sameSize = async (label) => {
        await sleep(400);
        const w = await winInfo(app);
        assert.deepEqual(w.content, c0, `${label}: 창 내부 크기가 바뀜 ${w.content} (처음 ${c0})`);
        return w;
      };
      const r = await spawnSecond(F.mixDir, userData);
      assert.equal(r.timedOut, false);
      let s = await waitReady(page, 'm1.png');
      await sameSize('두 번째 인스턴스(mix)');
      assert.equal(s.count, 5);
      approx(s.scale, s.strip.width / 720, 1e-4, 'scale = #strip 폭 / 기준 폭(720)');
      approx(s.strip.width, (c0[0] - SB) / LB, 1, '표시 폭은 기존 창 폭 기준 레터박스');
      assert.ok(s.scale > 1.05 && s.scale < 1.2, `mix 를 880 창에서 열면 배율 ≈ 1.11 (scale=${s.scaleStr})`);
      obs.push(`두 번째 인스턴스(mix 폴더, 기준 폭 720): 내부 ${c0.join('×')} 유지, scale=${s.scaleStr}`);

      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
      }, path.join(F.tieDir, 'b.png'));
      await press(page, 'Control+KeyO');
      s = await waitReady(page, { comic: 'tie' });
      await sameSize('Ctrl+O');
      obs.push('Ctrl+O(스텁, tie/b.png): 내부 크기 유지');

      await openViaMain(app, page, F.wideFile);
      s = await waitReady(page, 'wide.png', 30000);
      await sameSize('viewer:open(wide 20000px)');
      obs.push('viewer:open IPC(wide.png 20000px): 내부 크기 유지');

      const resized = await resizeTo(app, page, 1200, 700);
      const cu = (await winInfo(app)).content;
      await openViaMain(app, page, F.manyDir);
      s = await waitReady(page, 'm01.png');
      await sleep(400);
      assert.deepEqual((await winInfo(app)).content, cu, '사용자가 바꾼 크기가 파일을 열 때 덮어써짐');
      assertFitLayout(await snap(page), '사용자 크기 후 열기', 720);
      obs.push(`사용자 리사이즈(${cu.join('×')}) 후 열기: 크기 유지, resize 후 clientWidth=${resized.clientWidth}`);
    });
    c.obs(obs.join(' / '));
  }, 120000),
  step('WIN-11', '창이 처음부터 보조 모니터에 뜨고(보조 모니터 단언은 launch 직후·모든 리사이즈마다 수행), LONGROLL_WINDOW_POS 위치를 유지하며 ready-to-show 후 표시됨', 'bounds 정확 일치(x,y), 창 오른쪽 끝 ≤ 0, 보조 모니터 단언 횟수 증가 확인', async (c) => {
    const before = safety.checks;
    await withApp(F.basicDir, async ({ page, app }) => {
      await waitReady(page, '1.png');
      const w = OSR ? await winInfo(app) : await waitVisible(app, 'WIN-11');
      if (!OSR) {
        assert.equal(w.visible, true);
        assert.equal(w.onPrimary, false);
        assert.ok(w.bounds.x + w.bounds.width <= 0);
      }
      assert.deepEqual([w.bounds.x, w.bounds.y], WINDOW_POS_XY);
      assert.ok(safety.checks > before, 'launch 직후 보조 모니터 단언이 실행되지 않음');
      c.obs(`bounds=(${w.bounds.x},${w.bounds.y},${w.bounds.width}x${w.bounds.height}), 보조 모니터(주 모니터 아님), visible=${w.visible}, launch 직후 보조 모니터 단언 ${safety.checks - before}회`);
    });
  }),
  step('WIN-13', '인자 없이 시작한 창(1100×820)에 이미지를 처음 열면 그 순간 한 번 창 크기가 맞춰짐(드롭 경로 viewer:open-path / Ctrl+O 스텁 / 두 번째 인스턴스), 창 중심 유지·작업 영역 안, 이후 다른 폴더를 열어도 불변 (RT2-01)', '내부 크기 정확 일치, 창 중심 ±2px', async (c) => {
    const obs = [];
    const centerOk = (w0, w1, label) => {
      const [x0, y0] = centerOfBounds(w0.bounds);
      const [x1, y1] = centerOfBounds(w1.bounds);
      approx(x1, x0, 2, `${label}: 창 중심 x`);
      approx(y1, y0, 2, `${label}: 창 중심 y`);
    };
    // (a) 드롭 경로(viewer:open-path): 처음 열기에서 맞춤, 두 번째 열기에서 불변
    await withApp(null, async ({ page, app }) => {
      const w0 = await winInfo(app);
      assert.deepEqual(w0.content, [1100, 820]);
      assert.equal((await snap(page)).state, 'empty');
      await openViaMain(app, page, F.basicDir);
      await waitReady(page, '1.png');
      const w1 = await waitContent(app, [880, 820], '(a) IPC 첫 열기');
      const s = await snap(page);
      assertFitLayout(s, '(a) 첫 열기 후');
      assert.equal(s.scaleStr, '1.0000');
      approx(s.strip.left - s.sr.left, 40, 1, '(a) 좌 레터박스');
      centerOk(w0, w1, '(a)');
      assert.ok(insideArea(w1.bounds, w1.workArea), `(a) 창이 작업 영역 밖 ${JSON.stringify(w1.bounds)} / ${JSON.stringify(w1.workArea)}`);
      await openViaMain(app, page, F.mixDir);
      await waitReady(page, 'm1.png');
      const w2 = await keepsContent(app, [880, 820], '(a) 두 번째 열기(mix, 기준 폭 720)');
      assert.deepEqual(w2.bounds, w1.bounds, '(a) 두 번째 열기에서 창 위치/크기가 바뀜');
      obs.push(`(a) 드롭 경로: 1100×820 → 첫 열기(basic) 880×820, 중심 (${centerOfBounds(w0.bounds).join(',')})→(${centerOfBounds(w1.bounds).join(',')}), scale ${s.scaleStr}; 두 번째 열기(mix) 불변`);
    });
    // (b) Ctrl+O(dialog.showOpenDialog 스텁): 처음 열기에서 맞춤(720 폭 → 792), 두 번째 열기에서 불변
    await withApp(null, async ({ page, app }) => {
      const w0 = await winInfo(app);
      assert.deepEqual(w0.content, [1100, 820]);
      const pick = (f) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [p] }); }, f);
      await pick(path.join(F.manyDir, 'm01.png'));
      await press(page, 'Control+KeyO');
      await waitReady(page, 'm01.png');
      const w1 = await waitContent(app, [792, 820], '(b) Ctrl+O 첫 열기');
      centerOk(w0, w1, '(b)');
      assertFitLayout(await snap(page), '(b) 첫 열기 후', 720);
      await pick(F.b1);
      await press(page, 'Control+KeyO');
      await waitReady(page, '1.png');
      const w2 = await keepsContent(app, [792, 820], '(b) 두 번째 열기(basic 800 폭)');
      assert.deepEqual(w2.bounds, w1.bounds, '(b) 두 번째 열기에서 창 위치/크기가 바뀜');
      obs.push('(b) Ctrl+O 스텁: 첫 열기(m01, 720 폭) 792×820, 중심 유지; 두 번째 열기(basic) 불변');
    });
    // (c) 두 번째 인스턴스: 처음 열기에서 맞춤, 이후 불변
    await withApp(null, async ({ page, app, userData }) => {
      const w0 = await winInfo(app);
      assert.deepEqual(w0.content, [1100, 820]);
      const r1 = await spawnSecond(F.mixDir, userData);
      assert.equal(r1.timedOut, false);
      assert.equal(r1.code, 0);
      await waitReady(page, 'm1.png');
      const w1 = await waitContent(app, [792, 820], '(c) 두 번째 인스턴스 첫 열기');
      centerOk(w0, w1, '(c)');
      const r2 = await spawnSecond(F.b1, userData);
      assert.equal(r2.timedOut, false);
      await waitReady(page, '1.png');
      const w2 = await keepsContent(app, [792, 820], '(c) 두 번째 인스턴스 두 번째 열기');
      assert.deepEqual(w2.bounds, w1.bounds);
      obs.push('(c) 두 번째 인스턴스: 첫 열기(mix) 792×820, 중심 유지; 이어지는 열기(basic) 불변');
    });
    c.obs(obs.join(' / '));
  }, 120000),
  step('WIN-14', '인자 없이 시작한 창을 사용자가 먼저 크게/작게 바꿨으면(시작 크기와 ±2px 초과) 처음 열어도 그 크기 유지, ±2px 이내 차이는 안 바꾼 것으로 보고 맞춤 (RT2-01)', '내부 크기 정확 일치(경계: 높이 +2 는 맞춤, +3 은 유지, 폭 -3 은 유지)', async (c) => {
    const obs = [];
    const cases = [
      { label: '높이 +30', size: [1100, 850], keep: true },
      { label: '높이 +3 (경계 초과)', size: [1100, 823], keep: true },
      { label: '폭 -3 (경계 초과)', size: [1097, 820], keep: true },
      { label: '높이 +2 (경계 이내)', size: [1100, 822], keep: false },
      { label: '높이 +1', size: [1100, 821], keep: false },
    ];
    for (const cs of cases) {
      await withApp(null, async ({ page, app }) => {
        const cu = await setContentExact(app, cs.size[0], cs.size[1]);
        assert.deepEqual(cu, cs.size, `${cs.label}: 사전조건(내부 크기를 정확히 맞추지 못함)`);
        const w0 = await winInfo(app);
        await openViaMain(app, page, F.basicDir);
        await waitReady(page, '1.png');
        if (cs.keep) {
          const w1 = await keepsContent(app, cu, `${cs.label}: 사용자가 바꾼 크기`);
          assert.deepEqual(w1.bounds, w0.bounds, `${cs.label}: 창 위치/크기가 바뀜`);
          const s = await snap(page);
          assertFitLayout(s, `${cs.label}: 유지된 창에서 폭 맞춤`);
          obs.push(`${cs.label}(내부 ${cu.join('×')}): 유지, clientWidth=${s.clientWidth}, scale=${s.scaleStr}`);
        } else {
          const w1 = await waitContent(app, [880, 820], `${cs.label}: 맞춤`);
          obs.push(`${cs.label}(내부 ${cu.join('×')}): 880×820 으로 맞춤(시작 크기와 ${Math.abs(cu[0] - 1100)}/${Math.abs(cu[1] - 820)}px 차이는 허용 오차 이내)`);
          assert.ok(insideArea(w1.bounds, w1.workArea));
        }
      });
    }
    // 바깥 크기를 setSize 로 크게 바꾼 경우(사용자 드래그 리사이즈에 해당)
    await withApp(null, async ({ page, app }) => {
      await resizeTo(app, page, 1200, 700);
      const cu = (await winInfo(app)).content;
      await openViaMain(app, page, F.manyDir);
      await waitReady(page, 'm01.png');
      await keepsContent(app, cu, '바깥 1200×700 으로 바꾼 뒤');
      obs.push(`setSize 1200×700(내부 ${cu.join('×')}): 유지`);
    });
    c.obs(obs.join(' / '));
  }, 120000),
  step('WIN-15', '첫 열기에서 작업 영역보다 넓은 이미지: 내부 폭 = 작업 영역 폭 -16·높이 = min(820, 작업 영역 높이 -60), 창이 작업 영역 안에 들어옴(중심 이동 후 클램프), 클램프 안 되는 폭은 창 중심 유지 (RT2-01, 안전: DSF 2 로 작업 영역을 줄이고 시작 x 를 계산)', '내부 크기 정확, 작업 영역 안(±1px), 중심 ±2px', async (c) => {
    const DSF = OSR ? null : 2;
    const { pos, workArea } = dsfClampPos(DSF);
    const pre = DSF ? [`--force-device-scale-factor=${DSF}`] : [];
    const expW = workArea.width - 16;
    const expH = Math.min(820, workArea.height - 60);
    const startContent = [Math.min(1100, expW), expH];
    const obs = [];
    // (a) 클램프되는 큰 이미지
    let h = await launchApp(null, { pre, pos });
    try {
      const w0 = await winInfo(h.app);
      assert.deepEqual(w0.content, startContent, '(a) 시작 내부 크기');
      await openViaMain(h.app, h.page, F.bigFile);
      await waitReady(h.page, 'big.png', 30000);
      const w1 = await waitContent(h.app, [expW, expH], '(a) 첫 열기(big 2400 폭) 클램프');
      await assertOnSecondary(h.app, 'WIN-15 첫 열기 후(클램프)');
      assert.ok(insideArea(w1.bounds, w1.workArea), `(a) 창이 작업 영역 밖 ${JSON.stringify(w1.bounds)} / ${JSON.stringify(w1.workArea)}`);
      const s = await snap(h.page);
      assertFitLayout(s, '(a) 클램프 후', 2400);
      assert.ok(s.scale < 1, `(a) 클램프되면 배율 < 1 (scale=${s.scaleStr})`);
      obs.push(`(a) big(2400 폭): 내부 ${w0.content.join('×')} → ${w1.content.join('×')} = (${workArea.width}-16)×min(820, ${workArea.height}-60), bounds=(${w1.bounds.x},${w1.bounds.y},${w1.bounds.width}×${w1.bounds.height}) 작업 영역 (${workArea.x},${workArea.y},${workArea.width}×${workArea.height}) 안, scale ${s.scaleStr}`);
    } finally {
      rendererErrorTotal += h.errors.length;
      await shutdown(h);
    }
    assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
    // (b) 클램프 안 되는 800 폭: 중심 유지
    h = await launchApp(null, { pre, pos });
    try {
      const w0 = await winInfo(h.app);
      await openViaMain(h.app, h.page, F.b1);
      await waitReady(h.page, '1.png');
      const want = [Math.min(880, expW), expH];
      const w1 = await waitContent(h.app, want, '(b) 첫 열기(800 폭)');
      await assertOnSecondary(h.app, 'WIN-15 첫 열기 후(중심 유지)');
      const [x0, y0] = centerOfBounds(w0.bounds);
      const [x1, y1] = centerOfBounds(w1.bounds);
      approx(x1, x0, 2, '(b) 창 중심 x');
      approx(y1, y0, 2, '(b) 창 중심 y');
      assert.ok(insideArea(w1.bounds, w1.workArea));
      obs.push(`(b) basic(800 폭): 내부 ${w0.content.join('×')} → ${w1.content.join('×')}, 중심 (${x0},${y0}) → (${x1},${y1})`);
    } finally {
      rendererErrorTotal += h.errors.length;
      await shutdown(h);
    }
    assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
    c.obs(obs.join(' / '));
  }, 120000),
  step('WIN-16', '인자 없이 시작한 직후(렌더러 준비 전~후) 두 번째 인스턴스가 파일을 열어도 유실 없이 열리고 창 크기가 한 번 맞춰짐 (Δ 0/30/80/200/400ms × 2회, RT-05 경쟁 구간)', '내부 크기 정확 792×820, 최종 #comic=mix · 현재 장 m1.png', async (c) => {
    const rows = [];
    for (const delta of [0, 30, 80, 200, 400]) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const h = await launchApp(null, { wait: false });
        try {
          if (delta) await sleep(delta);
          const r = await spawnSecond(F.mixDir, h.userData);
          assert.equal(r.timedOut, false, `Δ${delta}#${attempt}: 두 번째 프로세스가 종료되지 않음`);
          assert.equal(r.code, 0);
          const s = await waitReady(h.page, 'm1.png', 20000);
          assert.equal(s.count, 5);
          const w = await waitContent(h.app, [792, 820], `Δ${delta}#${attempt}`, 5000);
          await sleep(500);
          assert.deepEqual((await winInfo(h.app)).content, [792, 820], `Δ${delta}#${attempt}: 이후 크기가 흔들림`);
          assertFitLayout(await snap(h.page), `Δ${delta}#${attempt}`, 720);
          assert.ok(insideArea(w.bounds, w.workArea));
          rows.push(`Δ${delta}#${attempt}: ${w.content.join('×')} (두 번째 종료 ${r.ms}ms)`);
        } finally {
          rendererErrorTotal += h.errors.length;
          await shutdown(h);
        }
        assert.deepEqual(h.errors, [], '렌더러 pageerror/crash 발생');
      }
    }
    c.obs(rows.join(' ; '));
  }, 300000),
], { noApp: true });

// =============================================================== SUITE: 레터박스 (LBX-01, LBX-02)
suite('lbx', () => F.b1, [
  step('LBX-01', '창을 넓히거나 좁혀도 폭 맞춤에서 #strip 폭 = clientWidth/1.1(±1px), 좌우 여백 같음, 가로 스크롤 없음, 비율 1.1', '폭 ±1px, 여백 차 ±1px, 비율 ±0.003', async (c) => {
    const { page, app } = c;
    const rows = [];
    for (const [w, h] of [[520, 700], [640, 700], [760, 600], [910, 856], [1100, 700], [1300, 420], [1600, 700]]) {
      const s = await resizeTo(app, page, w, h);
      assertFitLayout(s, `창 ${w}x${h}`);
      approx(s.clientWidth / s.strip.width, LB, 0.003, `창 ${w}: clientWidth/#strip 폭 비율`);
      const margin = s.strip.left - s.sr.left;
      approx(margin / s.clientWidth, (1 - 1 / LB) / 2, 0.003, `창 ${w}: 좌 여백 비율 ≈ 4.55%`);
      rows.push(`${w}→clientWidth ${s.clientWidth}, strip ${s.strip.width.toFixed(1)}, 여백 ${margin.toFixed(1)}/${(s.sr.left + s.clientWidth - s.strip.left - s.strip.width).toFixed(1)}, scale ${s.scaleStr}`);
    }
    await restoreSize(app, page);
    c.obs(rows.join(' ; '));
  }),
  step('LBX-02', '확대하면 레터박스가 풀림: #strip 이 clientWidth 보다 넓어지고 가로 스크롤로 양 끝에 닿음(Ctrl+=, Ctrl+휠, 좁은 창의 Ctrl+1), Ctrl+0 으로 레터박스 복귀', '폭 ±1.5px, scrollLeft 최대 ±1.5px', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const obs = [];
    const checkOverflow = async (label) => {
      let s = await snap(page);
      assert.equal(s.fit, false, `${label}: fit`);
      assert.ok(s.strip.width > s.clientWidth + 100, `${label}: #strip(${s.strip.width.toFixed(0)}) 이 clientWidth(${s.clientWidth}) 보다 넓지 않음`);
      assert.ok(s.scrollWidth >= s.clientWidth + 100, `${label}: 가로 스크롤이 생기지 않음`);
      approx(s.scrollWidth, s.strip.width, 1.5, `${label}: scrollWidth = #strip 폭`);
      await setScroll(page, null, 0);
      await sleep(80);
      s = await snap(page);
      approx(s.strip.left, s.sr.left, 1.5, `${label}: scrollLeft 0 에서 #strip 왼쪽 끝 = 뷰포트 왼쪽(레터박스 없음)`);
      await setScroll(page, null, 100000);
      await sleep(80);
      const e = await snap(page);
      approx(e.scrollLeft, e.scrollWidth - e.clientWidth, 1.5, `${label}: 최대 scrollLeft`);
      approx(e.strip.left + e.strip.width, e.sr.left + e.clientWidth, 1.5, `${label}: #strip 오른쪽 끝 = 뷰포트 오른쪽`);
      obs.push(`${label}: #strip ${e.strip.width.toFixed(0)}px > clientWidth ${e.clientWidth}, scrollLeft 0~${e.scrollLeft}`);
    };
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await checkOverflow('Ctrl+= ×2');
    await press(page, 'Control+0');
    assertFitLayout(await snap(page), 'Ctrl+0 복귀(1)');
    const s0 = await snap(page);
    const mid = at(s0, 0.5, 0.5);
    await ctrlWheel(page, mid.x, mid.y, -400);
    await checkOverflow('Ctrl+휠 위');
    await press(page, 'Control+0');
    const f1 = await snap(page);
    assertFitLayout(f1, 'Ctrl+0 복귀(2)');
    assert.equal(f1.scrollLeft, 0);
    // 100% 가 창보다 넓은 좁은 창에서의 Ctrl+1
    await resizeTo(app, page, 700, 700);
    await press(page, 'Control+1');
    await checkOverflow('좁은 창(700) Ctrl+1');
    await press(page, 'Control+0');
    assertFitLayout(await snap(page), 'Ctrl+0 복귀(3)');
    // 넓은 창에서 Ctrl+1 은 #strip(800) 이 clientWidth 보다 좁아 가운데 정렬
    await resizeTo(app, page, 1300, 700);
    await press(page, 'Control+1');
    const w1 = await snap(page);
    approx(w1.strip.width, 800, 1.5, '넓은 창 100%');
    approx(w1.strip.left - w1.sr.left, w1.sr.left + w1.clientWidth - (w1.strip.left + w1.strip.width), 1, '넓은 창 100% 가운데 정렬');
    assert.ok(w1.scrollWidth <= w1.clientWidth);
    await press(page, 'Control+0');
    const f2 = await snap(page);
    assertFitLayout(f2, 'Ctrl+0 복귀(4)');
    approx(f2.strip.width, f2.clientWidth / LB, 1);
    await restoreSize(app, page);
    for (const o of obs) c.obs(o);
    c.obs(`넓은 창(1300) 100%: #strip 800 < clientWidth ${w1.clientWidth} → 가운데 정렬, 가로 스크롤 없음; Ctrl+0 → 폭 맞춤(레터박스) 복귀`);
  }),
  step('ZM-18', '#scroller 폭이 0 이 되는 리사이즈(최소화 등)는 무시됨: 폭 0 인 동안 data-scale·fit·#zoom 이 그대로이고(0% 아님), 폭이 돌아오면 폭 맞춤 레이아웃으로 복구 (RT2-04. 최소화는 CSS 로 폭 0 을 모사)', 'scale 문자열 정확 일치, 복구 후 폭 맞춤 허용 오차(assertFitLayout)', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const s0 = await snap(page);
    assertFitLayout(s0, '시작');
    await setScroll(page, 1500, 0);
    await sleep(100);
    await page.evaluate(() => {
      const s = document.getElementById('scroller');
      s.style.flex = 'none';
      s.style.width = '0px';
    });
    await sleep(500);
    const z = await snap(page);
    assert.equal(z.clientWidth, 0, '사전조건: #scroller 폭이 0 이 되지 않음');
    assert.equal(z.scaleStr, s0.scaleStr, `폭 0 에서 data-scale 이 바뀜(${s0.scaleStr} → ${z.scaleStr}): 0 폭 리사이즈를 무시해야 함`);
    assert.equal(z.fit, true);
    assert.equal(z.zoomText, s0.zoomText, `폭 0 에서 #zoom 이 바뀜: ${z.zoomText}`);
    await page.evaluate(() => {
      const s = document.getElementById('scroller');
      s.style.flex = '';
      s.style.width = '';
    });
    await sleep(500);
    const r = await snap(page);
    assertFitLayout(r, '폭 복구 후');
    assert.equal(r.scaleStr, s0.scaleStr);
    c.obs(`폭 0 동안 scale ${z.scaleStr}·fit ${z.fit}·라벨 "${z.zoomText}" 유지(시작 ${s0.scaleStr}), 폭 복구 후 폭 맞춤 레이아웃·scale ${r.scaleStr}`);
  }),
]);

// =============================================================== SUITE: 짧은 이미지 레이아웃 (LBX-04, RT2-10)
suite('short-layout', null, [
  step('LBX-04', '뷰포트보다 짧은 이미지(800×300 한 장 / 800×300 두 장)도 초기 창 내부 폭 880 = clientWidth(거터 없음)·배율 1.0·레터박스 각 40px, 세로 오버플로 없음·바 숨김, 확대로 세로 스크롤이 생겨도 clientWidth 불변', 'clientWidth 정확, 여백 ±1px', async (c) => {
    const obs = [];
    for (const [dir, label, names, total] of [[F.short1Dir, '800×300 1장', ['s.png'], 300], [F.shortnDir, '800×300 2장', ['a.png', 'b.png'], 600]]) {
      await withApp(dir, async ({ page, app }) => {
        let s = await waitReady(page, names[0]);
        const w = await winInfo(app);
        assert.deepEqual(w.content, [880, 820], `${label}: 내부 크기`);
        assert.equal(s.clientWidth, 880, `${label}: 초기 clientWidth(거터 없음 → 내부 폭과 같음)`);
        assert.equal(s.clientHeight, 786);
        assert.equal(s.offsetWidth - s.clientWidth, SB, `${label}: 세로 스크롤바 거터 폭(없음)`);
        assert.equal(s.scaleStr, '1.0000');
        assertFitLayout(s, `${label} 초기`);
        approx(s.strip.left - s.sr.left, 40, 1, `${label}: 좌 레터박스`);
        approx(s.sr.left + s.clientWidth - (s.strip.left + s.strip.width), 40, 1, `${label}: 우 레터박스`);
        assert.equal(s.count, names.length);
        assertContiguous(s, `${label}`);
        approx(s.strip.height, total, 1, `${label}: #strip 높이`);
        assert.ok(s.scrollHeight <= s.clientHeight, `${label}: 세로 오버플로 발생 scrollHeight=${s.scrollHeight} clientHeight=${s.clientHeight}`);
        s = await barSnap(page);
        assert.equal(barVisible(s.vbar), false, `${label}: 짧은 콘텐츠인데 #vbar 가 보임`);
        for (const k of ['PageDown', 'End', 'Home', 'ArrowDown']) await press(page, k);
        await sleep(200);
        assert.equal((await snap(page)).scrollTop, 0, `${label}: 스크롤할 곳이 없는데 scrollTop 이 움직임`);
        if (names.length === 2) {
          assert.equal(s.pageText, '1/2장');
          assert.equal(s.indexText, '(1/1)');
        }
        // 확대하면 세로 스크롤이 생기지만 clientWidth 는 그대로(거터가 없고 바는 오버레이)
        let steps = 0;
        for (; steps < 8; steps++) {
          await press(page, 'Control+Equal');
          s = await snap(page);
          assert.equal(s.clientWidth, 880, `${label}: Ctrl+= ${steps + 1}회 후 clientWidth 가 바뀜(스크롤바 등장으로 레이아웃 흔들림)`);
          if (s.scrollHeight > s.clientHeight) break;
        }
        assert.ok(s.scrollHeight > s.clientHeight, `${label}: 확대해도 세로 스크롤이 생기지 않음`);
        s = await barSnap(page);
        assert.ok(barVisible(s.vbar), `${label}: 세로 오버플로가 생겼는데 #vbar 가 숨겨져 있음`);
        await press(page, 'Control+0');
        s = await snap(page);
        assertFitLayout(s, `${label} Ctrl+0 복귀`);
        assert.equal(s.clientWidth, 880);
        assert.ok(s.scrollHeight <= s.clientHeight);
        obs.push(`${label}: 내부 ${w.content.join('×')}, clientWidth ${s.clientWidth}, scale ${s.scaleStr}, 세로 오버플로 없음·#vbar 숨김(scrollHeight ${s.scrollHeight} ≤ ${s.clientHeight}), Ctrl+= ${steps + 1}회째 세로 스크롤 등장(#vbar 표시)해도 clientWidth 880 유지`);
      });
    }
    c.obs(obs.join(' / '));
  }),
], { noApp: true });

// =============================================================== SUITE: 헤더 크기 파서 (IMG-01 ~ IMG-03)
suite('imgsize', null, [
  step('IMG-01', 'src/imagesize.js readImageSize: Pillow 로 만든 PNG(RGB/RGBA/팔레트/그레이/1×1/20000폭)/GIF/BMP/JPEG(기본·progressive·70KB ICC·EXIF 회전·그레이)/WebP(lossy 720×16383·lossless·alpha)/AVIF 크기가 Pillow 값과 일치', '정확 일치 {w,h} (정답은 Pillow 가 다시 열어 읽은 크기)', async (c) => {
    const { readImageSize } = require(path.join(ROOT, 'src', 'imagesize.js'));
    const rel = (n) => `imgsize/${n}`;
    const originals = ['png_rgb.png', 'png_rgba.png', 'png_pal.png', 'png_gray.png', 'png_tiny.png', 'png_wide.png', 'gif.gif', 'bmp.bmp', 'jpg_base.jpg', 'jpg_prog.jpg', 'jpg_icc.jpg', 'jpg_exif.jpg', 'jpg_gray.jpg', 'webp_lossy.webp', 'webp_lossless.webp', 'webp_alpha.webp', 'webp_alpha_lossless.webp', 'avif.avif', 'avif_tall.avif'];
    const aliases = [['png_as.jpg', 'png_rgb.png'], ['jpg_as.png', 'jpg_base.jpg'], ['png_trunc_body.png', 'png_rgb.png']];
    const rows = [];
    const bad = [];
    for (const n of originals) {
      const exp = M[rel(n)].pil;
      const got = readImageSize(path.join(F.imgsizeDir, n));
      rows.push(`${n}=${got ? `${got.w}×${got.h}` : 'null'}`);
      if (!got || got.w !== exp[0] || got.h !== exp[1]) bad.push(`${n}: parser=${JSON.stringify(got)} pillow=${JSON.stringify(exp)}`);
    }
    for (const [n, src] of aliases) {
      const exp = M[rel(src)].pil;
      const got = readImageSize(path.join(F.imgsizeDir, n));
      rows.push(`${n}(내용=${src}, 확장자 불일치/본문 잘림)=${got ? `${got.w}×${got.h}` : 'null'}`);
      if (!got || got.w !== exp[0] || got.h !== exp[1]) bad.push(`${n}: parser=${JSON.stringify(got)} 기대=${JSON.stringify(exp)}`);
    }
    assert.equal(bad.length, 0, `헤더 파서 불일치 ${bad.length}건: ${bad.join(' | ')}`);
    assert.deepEqual(readImageSize(path.join(F.imgsizeDir, 'webp_lossy.webp')), { w: 720, h: 16383 }, '실제 분할 웹툰 형식(720×16383 WebP)');
    c.obs(`${originals.length + aliases.length}개 전부 Pillow 와 일치: ${rows.join(', ')}`);
  }),
  step('IMG-02', 'readImageSize 손상·경계 입력은 null: 쓰레기·0바이트·잘린 PNG/JPEG/WebP/AVIF/BMP/GIF·폭 0 PNG·0×0 BMP·SOS 먼저인 JPEG·길이 0 JPEG 세그먼트·meta 없는 AVIF·없는 파일·디렉터리·빈 경로', '정확히 null', async (c) => {
    const { readImageSize } = require(path.join(ROOT, 'src', 'imagesize.js'));
    const files = ['png_trunc_20.png', 'jpg_trunc_100.jpg', 'webp_trunc_20.webp', 'webp_trunc_28.webp', 'avif_trunc_40.avif', 'bmp_trunc_20.bmp', 'garbage.png', 'zero.png', 'gif_6bytes.gif', 'jpg_ff_storm.jpg', 'jpg_sos_first.jpg', 'jpg_len0.jpg', 'bmp_zero_dim.bmp', 'png_zero_width.png', 'avif_meta_huge.avif', 'avif_meta_size0.avif', 'avif_no_meta.avif'];
    const bad = [];
    for (const n of files) {
      let got;
      try { got = readImageSize(path.join(F.imgsizeDir, n)); } catch (e) { bad.push(`${n}: 예외 ${e.message}`); continue; }
      if (got !== null) bad.push(`${n}: ${JSON.stringify(got)} (null 이어야 함)`);
    }
    for (const [label, p] of [['없는 파일', path.join(F.imgsizeDir, 'no-such.png')], ['디렉터리', F.imgsizeDir], ['빈 문자열', ''], ['undefined', undefined]]) {
      let got;
      try { got = readImageSize(p); } catch (e) { bad.push(`${label}: 예외 ${e.message}`); continue; }
      if (got !== null) bad.push(`${label}: ${JSON.stringify(got)} (null 이어야 함)`);
    }
    assert.equal(bad.length, 0, `null 이어야 하는 입력 ${bad.length}건 실패: ${bad.join(' | ')}`);
    c.obs(`${files.length + 4}개 입력 모두 null (예외 없음)`);
  }),
  step('IMG-03', 'readImageSize 견고성: 악의적·반복 입력(0xFF 5000바이트 JPEG, meta 크기 0xFFFFFFFF AVIF)이 즉시 끝나고(각 <500ms) 헤더만 읽어 큰 파일(20000×300 PNG, 720×16383 WebP)도 즉시', '각 호출 < 500ms, 예외 없음', async (c) => {
    const { readImageSize } = require(path.join(ROOT, 'src', 'imagesize.js'));
    const rows = [];
    for (const n of ['jpg_ff_storm.jpg', 'avif_meta_huge.avif', 'avif_meta_size0.avif', 'png_wide.png', 'webp_lossy.webp', 'jpg_icc.jpg']) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 20; i++) readImageSize(path.join(F.imgsizeDir, n));
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
      rows.push(`${n} ${ms.toFixed(2)}ms`);
      assert.ok(ms < 500, `${n}: ${ms.toFixed(1)}ms`);
    }
    c.obs(`호출당 평균: ${rows.join(', ')}`);
  }),
  step('IMG-04', 'readImageSize 한 변 상한(100000, RT2-03): 100000 까지는 정상 반환, 100001 이상·극단값(1×2147483647 PNG, VP8X 16777216², AVIF 0xFFFFFFFF², BMP int32 최소/최대)은 null, 손으로 만든 최소 헤더(PNG/BMP/GIF/WebP VP8X/JPEG SOF/AVIF ispe) 양성 대조군 포함', '정확 일치({w,h} 또는 null)', async (c) => {
    const { readImageSize } = require(path.join(ROOT, 'src', 'imagesize.js'));
    const bad = [];
    const rows = [];
    for (const k of LIMIT_CASES) {
      let got;
      try { got = readImageSize(path.join(F.imgsizeDir, k.name)); } catch (e) { bad.push(`${k.name}: 예외 ${e.message}`); continue; }
      const ok = k.expect === null ? got === null : !!got && got.w === k.expect[0] && got.h === k.expect[1];
      if (!ok) bad.push(`${k.name}: parser=${JSON.stringify(got)} 기대=${JSON.stringify(k.expect === null ? null : { w: k.expect[0], h: k.expect[1] })}`);
      rows.push(`${k.fmt} ${k.w}×${k.h}→${got ? `${got.w}×${got.h}` : 'null'}`);
    }
    assert.equal(bad.length, 0, `상한 경계 불일치 ${bad.length}건: ${bad.slice(0, 6).join(' | ')}`);
    const okCount = LIMIT_CASES.filter((k) => k.expect).length;
    c.obs(`${LIMIT_CASES.length}개 입력: 정상 ${okCount}개(양성 대조군 7 + 경계 100000 이하 + GIF/JPEG 65535²), null ${LIMIT_CASES.length - okCount}개(100001 이상·극단값) 전부 기대와 일치. 예: ${rows.filter((r) => /100000|100001|2147483647|16777216|4294967295/.test(r)).slice(0, 8).join(', ')}`);
  }),
], { noApp: true, windowless: true });

// =============================================================== SUITE: 열려 있는 창에서 다른 파일 열기 (OPN-11)
suite('open-again', () => F.b1, [
  step('OPN-11', '이미 열린 창에서 다른 폴더/파일 열기(Ctrl+O 스텁 · viewer:open): 띠가 새 폴더로 교체되고 줌·스크롤은 폭 맞춤·그 장 top 으로 리셋, 이전 장은 사라지고 창 크기는 그대로', '정확 일치, scrollTop ±1.5, 창 크기 불변', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const w0 = (await winInfo(app)).content;
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    await setScroll(page, 2000, 300);
    await sleep(150);
    const before = await snap(page);
    assert.equal(before.fit, false);
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
    }, path.join(F.strDir, '03.png'));
    await press(page, 'Control+KeyO');
    let s = await waitReady(page, '03.png');
    assert.equal(s.count, 4);
    assert.equal(s.index, 2);
    assert.deepEqual(s.pages.map((p) => baseName(p.src)), STR_NAMES, '띠가 str 폴더로 교체됨');
    assert.equal(s.fit, true, '새로 열면 폭 맞춤으로 리셋');
    assertFitLayout(s, 'Ctrl+O 후');
    assert.equal(s.scrollLeft, 0);
    approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5, '03.png 맨 위');
    assert.deepEqual((await winInfo(app)).content, w0, '창 크기 불변');
    await openViaMain(app, page, F.mixDir);
    s = await waitReady(page, 'm1.png');
    assert.equal(s.count, 5);
    assert.equal(s.index, 0);
    assert.equal(s.pages.length, 5);
    assertFitLayout(s, 'viewer:open 후', 720);
    assert.equal(s.scrollTop, 0);
    assert.deepEqual((await winInfo(app)).content, w0);
    // 지원하지 않는 파일은 IPC 단계에서 unsupported 오류
    const st = await page.evaluate((p) => window.longroll.openPath(p), F.bTxt);
    assert.equal(st.error, 'unsupported');
    c.obs(`Ctrl+O(스텁, str/03.png): 4장 띠 교체, index 2, fit=true, scrollTop=${before.scrollTop}→03.png top; viewer:open(mix): 5장, index 0, scrollTop 0; 창 내부 ${w0.join('×')} 불변`);
  }),
]);

// =============================================================== SUITE: 열기 방식별 회차 판정 (EP-05 ~ EP-08)
// viewer:open-path 가 돌려주는 상태 객체를 UI 적용 없이 읽는다(드롭·Ctrl+O·두 번째 인스턴스가 모두 같은 buildState 를 거친다).
const openInfo = (page, target) =>
  page.evaluate(async (p) => {
    const st = await window.longroll.openPath(p);
    return {
      keys: Object.keys(st), error: st.error, path: st.path,
      comic: st.comic ? st.comic.name : undefined, comicDir: st.comic ? st.comic.dir : undefined,
      episodes: (st.episodes || []).map((e) => e.name), episodePaths: (st.episodes || []).map((e) => e.path),
      episode: st.episode, dir: st.dir, files: (st.files || []).map((f) => f.name), index: st.index, refWidth: st.refWidth, letterbox: st.letterbox,
    };
  }, target);
const samePath = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

suite('ep-open', null, [
  step('EP-05', '이미지 파일을 열면 그 회차가 열리고 그 장으로 스크롤되며 형제 회차로 이동한다 (경로 인자 · 대소문자 다른 경로 · viewer:open-path 상태 객체)', '정확 일치, scrollTop ±1.5', async (c) => {
    const obs = [];
    await withApp(F.ep10File3, async ({ page }) => {
      let s = await waitReady(page, '10화');
      assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: EP_COUNT, pages: 5 }, '이미지 파일 인자');
      assert.equal(s.index, 2);
      assert.equal(s.pageText, '3/5장');
      assert.equal(baseName(s.cur.src), '03.png');
      approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5, '03.png 가 맨 위');
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '2화');
      assert.equal(s.episode, 1, '형제 회차(2화)로 이동');
      approx(s.scrollTop, 0, SCROLL_TOL);
      await press(page, 'ArrowRight');
      s = await waitReady(page, '10화');
      approx(s.scrollTop, 0, SCROLL_TOL, '회차 이동은 맨 위에서 시작(열 때의 장 위치는 복원하지 않음)');
      obs.push(`인자 10화/03.png → (3/3) index ${2} scrollTop=그 장 top, ← 2화, → 10화 맨 위`);
    });
    await withApp(path.join(F.ep10Dir, '03.PNG'), async ({ page }) => {
      const s = await waitReady(page, '10화');
      assert.equal(s.index, 2, '대소문자 다른 경로(03.PNG)도 같은 장');
      approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5);
      obs.push('인자 10화/03.PNG(대소문자 다름) → index 2');
    });
    await withApp(F.comicDir, async ({ page }) => {
      const i = await openInfo(page, F.ep10File3);
      assert.equal(i.error, undefined, `openPath(이미지 파일) 오류 ${JSON.stringify(i)}`);
      assert.equal(i.comic, 'comic');
      assert.ok(samePath(i.comicDir, F.comicDir), `comic.dir=${i.comicDir}`);
      assert.deepEqual(i.episodes, COMIC_EPS.map((e) => e.name));
      assert.equal(i.episode, 2);
      assert.equal(path.basename(i.dir), '10화');
      assert.equal(i.index, 2);
      assert.deepEqual(i.files, COMIC_EPS[2].files);
      assert.equal(i.refWidth, 800);
      assert.equal(i.letterbox, 1.1);
      for (const k of ['comic', 'episodes', 'episode', 'dir', 'files', 'index', 'refWidth', 'letterbox']) assert.ok(i.keys.includes(k), `상태 객체에 ${k} 없음: ${i.keys}`);
      obs.push(`viewer:open-path(10화/03.png) 상태: comic=${i.comic}, episodes=[${i.episodes}], episode=${i.episode}, index=${i.index}, files ${i.files.length}개, refWidth=${i.refWidth}, letterbox=${i.letterbox}`);
    });
    c.obs(obs.join(' / '));
  }, 90000),
  step('EP-06', '회차 폴더를 직접 열면 부모의 형제 회차로 이동한다 (2화 폴더: (2/3), ← 1화, → 10화 / 10화 폴더: (3/3), → 토스트)', '정확 일치', async (c) => {
    const obs = [];
    await withApp(F.ep2Dir, async ({ page }) => {
      let s = await waitReady(page, '2화');
      assertEpisodeBar(s, { comic: 'comic', name: '2화', n: 2, N: EP_COUNT, pages: 2 }, '회차 폴더(2화) 인자');
      assert.equal(s.index, 0);
      assert.equal(s.scrollTop, 0);
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '1화');
      assert.equal(s.episode, 0);
      await press(page, 'ArrowRight');
      await waitReady(page, '2화');
      await press(page, 'ArrowRight');
      s = await waitReady(page, '10화');
      assert.equal(s.episode, 2);
      obs.push('2화 폴더 인자 → (2/3), ← 1화, → → 10화');
    });
    await withApp(F.ep10Dir, async ({ page }) => {
      let s = await waitReady(page, '10화');
      assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: EP_COUNT, pages: 5 }, '회차 폴더(10화) 인자');
      await ensureNoToast(page);
      await press(page, 'ArrowRight');
      s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '마지막 회차 토스트');
      assert.equal(s.name, '10화');
      obs.push('10화 폴더 인자 → (3/3), → 토스트');
    });
    await withApp(F.comicDir, async ({ page }) => {
      const i = await openInfo(page, F.ep2Dir);
      assert.equal(i.error, undefined);
      assert.equal(i.comic, 'comic');
      assert.ok(samePath(i.comicDir, F.comicDir));
      assert.deepEqual(i.episodes, COMIC_EPS.map((e) => e.name));
      assert.equal(i.episode, 1);
      assert.equal(i.index, 0);
      obs.push(`viewer:open-path(2화 폴더): comic=${i.comic}, episode=${i.episode}, index=${i.index}`);
    });
    c.obs(obs.join(' / '));
  }, 90000),
  step('EP-07', '회차 판정: 이미지 없는 하위 폴더(자료·빈폴더)는 회차가 아니고 만화 폴더 직속 표지(cover.png)·txt 는 무시, 하위의 하위 폴더는 탐색하지 않음, 이미지가 든 하위 폴더가 있으면 그 폴더는 만화 폴더(규칙 ①), 이미지 없는 폴더·여러 만화가 든 상위 폴더는 empty, 비이미지 파일은 unsupported', '정확 일치 (viewer:open-path 상태 객체 + UI)', async (c) => {
    const obs = [];
    await withApp(F.comicDir, async ({ page, app }) => {
      // 헤더 크기 읽기는 현재 회차의 파일만(다른 회차는 이름·경로만): src/imagesize.js 의 fs.openSync 호출을 기록한다.
      await app.evaluate(() => {
        const fs = (process.getBuiltinModule && process.getBuiltinModule('fs')) || require('fs');
        globalThis.__opened = [];
        globalThis.__origOpen = globalThis.__origOpen || fs.openSync;
        fs.openSync = function (p, ...rest) {
          globalThis.__opened.push(String(p));
          return globalThis.__origOpen.call(this, p, ...rest);
        };
      });
      const readOpened = async () => (await app.evaluate(() => globalThis.__opened.splice(0))).filter((p) => IMAGE_EXTS.has(path.extname(p).toLowerCase()));
      const a = await openInfo(page, F.comicDir);
      const op1 = await readOpened();
      const x2 = await openInfo(page, F.ep2Dir);
      const op2 = await readOpened();
      await app.evaluate(() => { ((process.getBuiltinModule && process.getBuiltinModule('fs')) || require('fs')).openSync = globalThis.__origOpen; });
      const under = (list, dir) => list.filter((p) => path.resolve(p).toLowerCase().startsWith(`${path.resolve(dir).toLowerCase()}${path.sep}`));
      if (op1.length === 0) note('EP-07 관찰: fs.openSync 호출이 관찰되지 않아 "현재 회차 파일만 헤더를 읽는다" 를 검증하지 못함(헤더 읽기 방식이 imagesize.js 의 openSync 가 아님)');
      else {
        assert.equal(under(op1, F.ep1Dir).length, op1.length, `만화 폴더 열기: 헤더를 읽은 파일이 1화 밖에도 있음 ${JSON.stringify(op1.filter((p) => !under([p], F.ep1Dir).length))}`);
        assert.ok(op1.length >= COMIC_EPS[0].files.length, `1화 파일 ${COMIC_EPS[0].files.length}개의 헤더를 읽어야 함(읽은 ${op1.length})`);
        assert.equal(under(op2, F.ep2Dir).length, op2.length, `2화 열기: 헤더를 읽은 파일이 2화 밖에도 있음 ${JSON.stringify(op2.filter((p) => !under([p], F.ep2Dir).length))}`);
      }
      assert.equal(x2.episode, 1);
      obs.push(`헤더 읽기(fs.openSync): 만화 폴더 열기 → 1화 파일만 ${op1.length}회, 2화 열기 → 2화 파일만 ${op2.length}회`);
      assert.equal(a.error, undefined);
      assert.deepEqual(a.episodes, ['1화', '2화', '10화'], '자료/빈폴더 제외, 자연 정렬');
      assert.equal(a.episode, 0);
      assert.equal(a.comic, 'comic');
      assert.deepEqual(a.files, COMIC_EPS[0].files, '1화 파일(info.txt·cover.png 제외)');
      assert.ok(!a.files.includes('cover.png') && !a.files.includes('info.txt'));
      for (const [dir, e] of [[F.ep2Dir, COMIC_EPS[1]], [F.ep10Dir, COMIC_EPS[2]]]) {
        const x = await openInfo(page, dir);
        assert.deepEqual(x.files, e.files);
        assert.ok(!x.files.includes('cover.png'));
      }
      obs.push(`만화 폴더: 회차=[${a.episodes}], 1화 파일=[${a.files}], cover.png/info.txt/자료/빈폴더 제외`);
      const memo = await openInfo(page, F.memoDir);
      assert.equal(memo.error, 'empty', `자료(txt 만) 폴더 → empty, 실제 ${JSON.stringify(memo)}`);
      const emp = await openInfo(page, F.emptyEpDir);
      assert.equal(emp.error, 'empty', `빈 폴더 → empty, 실제 ${JSON.stringify(emp)}`);
      // 이미지가 하나도 없는 폴더의 txt 는 계약상 unsupported(비이미지 확장자)와 empty(이미지 없는 폴더)가 겹친다: 앱은 폴더 검사가 먼저라 empty. 둘 다 오류로 본다(판단 보류 항목).
      const txt = await openInfo(page, F.memoTxt);
      assert.ok(['empty', 'unsupported'].includes(txt.error), `이미지 없는 폴더의 txt 파일 → empty|unsupported, 실제 ${JSON.stringify(txt)}`);
      const txt2 = await openInfo(page, F.bTxt);
      assert.equal(txt2.error, 'unsupported', `이미지가 있는 폴더의 txt 파일 → unsupported, 실제 ${JSON.stringify(txt2)}`);
      note(`EP-07 관찰: 이미지 없는 폴더의 memo.txt 를 열면 ${txt.error} (계약의 "비이미지 확장자 = unsupported" 와 "이미지 없는 폴더 = empty" 가 겹침 — 판단 보류)`);
      const multi = await openInfo(page, F.multiDir);
      assert.equal(multi.error, 'empty', `여러 만화가 든 상위 폴더(한 단계만 인식) → empty, 실제 ${JSON.stringify(multi)}`);
      obs.push(`자료 폴더 empty, 빈 폴더 empty, memo.txt ${txt.error}, 이미지 폴더의 note.txt ${txt2.error}, 상위 폴더(multi) empty`);
      const nested = await openInfo(page, F.nestedDir);
      assert.deepEqual(nested.episodes, ['1화', '2화'], '하위의 하위(1화/덤)는 회차가 아님');
      assert.deepEqual(nested.files, ['01.png'], '1화 의 직속 이미지만(덤/bonus.png 제외)');
      const inner = await openInfo(page, path.join(F.nestedDir, '1화'));
      assert.equal(inner.comic, '1화', '이미지가 든 하위 폴더(덤)가 있는 폴더는 만화 폴더(규칙 ①)');
      assert.deepEqual(inner.episodes, ['덤']);
      assert.deepEqual(inner.files, ['bonus.png']);
      obs.push(`nested: 회차=[${nested.episodes}], 1화 파일=[${nested.files}]; nested/1화 를 열면 규칙 ①로 만화=${inner.comic}, 회차=[${inner.episodes}]`);
      const cover = await openInfo(page, F.comicCover);
      assert.equal(cover.error, undefined);
      assert.equal(cover.comic, 'lib', '이미지 파일이 든 폴더(comic)가 회차, 만화 폴더는 그 부모(lib)');
      assert.deepEqual(cover.episodes, ['comic']);
      assert.deepEqual(cover.files, ['cover.png']);
      obs.push(`cover.png 를 열면(계약 문장 그대로) 회차=comic, 만화=lib, 파일=[${cover.files}]`);
    });
    await withApp(F.memoDir, async ({ page }) => {
      const s = await snap(page);
      assert.equal(s.state, 'empty');
      assert.ok(s.msgText.includes('이 폴더에 이미지가 없습니다'), `메시지 ${s.msgText}`);
      obs.push('UI: 자료 폴더 인자 → state=empty + "이 폴더에 이미지가 없습니다"');
    });
    c.obs(obs.join(' / '));
  }, 90000),
  step('EP-08', '형제가 없는 단독 폴더는 회차 1개(폴더·이미지 파일 인자 모두): (1/1), ←/→ 모두 양쪽 끝 토스트, 상태 불변', '정확 일치, scrollTop ±1', async (c) => {
    const obs = [];
    for (const [arg, label] of [[F.basicDir, '폴더'], [F.b2, '이미지 파일(2.png)']]) {
      await withApp(arg, async ({ page }) => {
        let s = await waitReady(page, { comic: 'basic' });
        assertEpisodeBar(s, { comic: 'basic', name: 'ep', n: 1, N: 1, pages: 4 }, label);
        const before = s;
        await ensureNoToast(page);
        await press(page, 'ArrowLeft');
        s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_FIRST, `${label}: ← 토스트`);
        approx(s.scrollTop, before.scrollTop, 1);
        assert.equal(s.index, before.index);
        await waitSnap(page, (v) => v.toastHidden, '토스트 숨김', 5000);
        await press(page, 'ArrowRight');
        s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, `${label}: → 토스트`);
        approx(s.scrollTop, before.scrollTop, 1);
        assert.equal(s.index, before.index);
        assert.equal(s.name, 'ep');
        obs.push(`${label}: (1/1), ← "${EDGE_FIRST}", → "${EDGE_LAST}", scrollTop ${before.scrollTop} 불변`);
      });
    }
    await withApp(F.basicDir, async ({ page }) => {
      const i = await openInfo(page, F.basicDir);
      assert.deepEqual(i.episodes, ['ep']);
      assert.equal(i.comic, 'basic');
      assert.equal(i.episode, 0);
      obs.push(`viewer:open-path(단독 폴더): episodes=[${i.episodes}], comic=${i.comic}`);
    });
    c.obs(obs.join(' / '));
  }, 90000),
  step('OPN-09a', '드롭: CDP Input.dispatchDragEvent 로 만화 폴더·이미지 파일·txt 를 창에 놓으면 새 상태 객체로 열림(폭 맞춤 리셋 포함). 드래그 주입이 안 되면 수동 확인으로 넘김(MANUAL)', '정확 일치. 실제 탐색기 드래그는 수동(OPN-09)', async (c) => {
    return withApp(F.basicDir, async ({ page }) => {
      await waitReady(page, { comic: 'basic' });
      await page.evaluate(() => {
        window.__drops = 0;
        window.addEventListener('drop', () => { window.__drops++; }, true);
      });
      const dropPaths = async (files) => {
        const cdp = await cdpOf(page);
        const s = await snap(page);
        const { x, y } = center(s);
        const data = { items: [], files, dragOperationsMask: 1 };
        for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
      };
      await press(page, 'Control+Equal');
      assert.equal((await snap(page)).fit, false, '사전조건: 줌 상태');
      try {
        await dropPaths([F.comicDir]);
      } catch (e) {
        c.obs(`CDP 드래그 주입 실패(${String(e.message).split('\n')[0]}) → 수동 확인`);
        return { manual: true };
      }
      await sleep(600);
      if ((await page.evaluate(() => window.__drops)) === 0) {
        c.obs('CDP 드롭이 렌더러 drop 이벤트로 전달되지 않음 → 수동 확인(OPN-09)');
        return { manual: true };
      }
      let s = await waitReady(page, { comic: 'comic' });
      assertEpisodeBar(s, { comic: 'comic', name: '1화', n: 1, N: EP_COUNT, pages: 3 }, '만화 폴더 드롭');
      assert.equal(s.fit, true, '새 경로를 열면 폭 맞춤으로 리셋');
      await dropPaths([F.ep10File3]);
      s = await waitReady(page, { comic: 'comic', name: '10화' });
      assert.equal(s.index, 2);
      approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5);
      await ensureNoToast(page);
      await dropPaths([F.bTxt]);
      s = await waitSnap(page, (v) => !v.toastHidden && v.toastText.includes('지원하지 않는 형식'), 'txt 드롭 토스트');
      assert.equal(s.name, '10화', 'txt 드롭은 현재 보기를 유지');
      c.obs(`드롭: 만화 폴더 → 1화(1/3) fit=true, 10화/03.png → (3/3) index 2, txt → 토스트 "${s.toastText}" 후 현재 보기 유지`);
    });
  }, 90000),
], { noApp: true });

// =============================================================== SUITE: 열어 둔 채 폴더 변화 (EP-10 재스캔, EP-11 삭제) — 공용 픽스처는 건드리지 않고 임시 복사본만 변경
const copyComic = (label) => {
  const dst = path.join(TMP, 'work', label, 'comic');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(F.comicDir, dst, { recursive: true });
  return dst;
};
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

suite('ep-rescan', null, [
  step('EP-10', '열어 둔 채 새 회차 폴더를 만들면 →/← 로 도달(회차 이동마다 재스캔): 마지막 회차에서 →(새 11화), 자연 정렬 중간 삽입(3화), 첫 회차에서 ←(새 0화), 이미지 없는 새 폴더는 회차가 아님, #index 의 N 갱신', '정확 일치 (임시 복사본)', async (c) => {
    const obs = [];
    const dst = copyComic('ep10');
    await withApp(path.join(dst, '10화'), async ({ page }) => {
      let s = await waitReady(page, '10화');
      assertEpisodeBar(s, { comic: 'comic', name: '10화', n: 3, N: 3, pages: 5 }, '복사본 10화(마지막)');
      // (1) 마지막 회차에서 → : 새 11화 도달
      fs.cpSync(path.join(dst, '2화'), path.join(dst, '11화'), { recursive: true });
      await ensureNoToast(page);
      await press(page, 'ArrowRight');
      s = await waitReady(page, '11화');
      assertEpisodeBar(s, { comic: 'comic', name: '11화', n: 4, N: 4, pages: 2 }, '마지막 회차에서 → (새 11화)');
      assert.deepEqual(pageDirs(s), ['11화']);
      obs.push('(1) 마지막(10화)에서 → : 열려 있는 동안 만든 11화 도달 (4/4)');
      // (2) 중간 삽입: 3화 생성 → 11화에서 ← = 10화(4/5), ← = 3화(3/5)
      fs.cpSync(path.join(dst, '1화'), path.join(dst, '3화'), { recursive: true });
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '10화');
      assert.equal(s.indexText, '(4/5)', '3화 삽입 후 10화 는 4/5');
      assert.equal(s.episodes, 5);
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '3화');
      assert.equal(s.indexText, '(3/5)');
      assert.deepEqual(pageNames(s), COMIC_EPS[0].files, '3화(1화 복사본)의 이미지');
      obs.push('(2) 3화 삽입: 11화 ← 10화 (4/5) ← 3화 (3/5), 자연 정렬 위치');
      // (3) 첫 회차에서 ← : 0화 생성
      await press(page, 'ArrowLeft');
      await waitReady(page, '2화');
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '1화');
      assert.equal(s.indexText, '(1/5)');
      fs.cpSync(path.join(dst, '2화'), path.join(dst, '0화'), { recursive: true });
      await ensureNoToast(page);
      await press(page, 'ArrowLeft');
      s = await waitReady(page, '0화');
      assert.equal(s.indexText, '(1/6)', '새 0화 가 맨 앞');
      assert.equal(s.episodes, 6);
      obs.push('(3) 첫 회차(1화)에서 ← : 새 0화 도달 (1/6)');
      // (4) 이미지 없는 새 폴더는 회차가 아님 → 마지막(11화)에서 → 는 토스트
      fs.mkdirSync(path.join(dst, '12화'), { recursive: true });
      fs.writeFileSync(path.join(dst, '12화', 'note.txt'), 'x', 'utf8');
      s = await gotoEpisode(page, 5);
      assert.equal(s.name, '11화');
      await ensureNoToast(page);
      await press(page, 'ArrowRight');
      s = await waitSnap(page, (v) => !v.toastHidden && v.toastText === EDGE_LAST, '이미지 없는 12화 는 회차가 아니라 마지막 토스트');
      assert.equal(s.name, '11화');
      assert.equal(s.episodes, 6);
      obs.push('(4) 이미지 없는 새 폴더(12화)는 회차가 아님: 11화(6/6)에서 → 토스트');
    });
    c.obs(obs.join(' / '));
  }, 120000),
  step('EP-11', '현재 회차 폴더를 삭제해도 ←/→ 가 깨지지 않음(렌더러 오류·예외·빈 화면 없이 일관된 회차 표시), go-episode IPC 가 예외 없이 상태/edge/error 를 돌려줌, 모든 회차를 지워도 앱 생존', '정확 일치 + 관찰 기록 (임시 복사본)', async (c) => {
    const obs = [];
    const dst = copyComic('ep11');
    await withApp(path.join(dst, '2화'), async ({ page, app }) => {
      let s = await waitReady(page, '2화');
      assert.equal(s.episode, 1);
      rmrf(path.join(dst, '2화'));
      assert.ok(!fs.existsSync(path.join(dst, '2화')), '사전조건: 2화 삭제');
      // 삭제된 회차에서 직접 IPC: 예외 없이 상태 | edge | error
      const io = await callIpc(app, 'viewer:go-episode', path.join(dst, '2화'), 1);
      assert.ok(io.ok && !io.threw, `삭제된 회차 기준 go-episode 가 예외: ${JSON.stringify(io)}`);
      assert.ok(io.r && (io.r.files !== undefined || io.r.edge !== undefined || io.r.error !== undefined), `상태/edge/error 가 아님: ${JSON.stringify(io.r)}`);
      obs.push(`삭제된 2화 기준 go-episode(+1) → ${JSON.stringify({ edge: io.r.edge, error: io.r.error, episode: io.r.episode, name: io.r.dir && path.basename(io.r.dir) })}`);
      await ensureNoToast(page);
      await press(page, 'ArrowRight');
      await sleep(1200);
      s = await snap(page);
      assert.equal(s.state, 'ready', `삭제 후 → : state=${s.state}`);
      assert.deepEqual(pageDirs(s), [s.name], `표시 중인 이미지 폴더(${pageDirs(s)})와 #name(${s.name}) 이 불일치`);
      assert.ok(s.pages.length > 0);
      obs.push(`2화 삭제 후 → : #name=${s.name} ${s.indexText} toast="${s.toastHidden ? '' : s.toastText}"`);
      note(`EP-11 관찰: 현재 회차(2화) 삭제 후 → 입력의 결과 = #name ${s.name} ${s.indexText} (재스캔 목록 [1화,10화] 기준)`);
      for (let i = 0; i < 4; i++) {
        await press(page, 'ArrowLeft');
        await sleep(700);
      }
      s = await snap(page);
      assert.equal(s.state, 'ready');
      assert.equal(s.name, '1화', '← 4회 후 첫 회차(1화)');
      assert.equal(s.episodes, 2, '삭제 후 재스캔된 회차 수(1화·10화)');
      assert.equal(s.indexText, '(1/2)');
      obs.push(`← 4회 → 1화 (1/2)`);
      // 모든 회차를 지워도 앱이 죽지 않음
      rmrf(path.join(dst, '1화'));
      rmrf(path.join(dst, '10화'));
      await press(page, 'ArrowRight');
      await sleep(800);
      await press(page, 'ArrowLeft');
      await sleep(800);
      rmrf(dst);
      await press(page, 'ArrowRight');
      await sleep(800);
      await press(page, 'ArrowLeft');
      await sleep(800);
      assert.equal(app.process().exitCode, null, '앱 프로세스 종료됨');
      assert.equal(await page.evaluate(() => 1 + 1), 2, '렌더러 응답 없음');
      s = await snap(page);
      obs.push(`모든 회차·만화 폴더 삭제 후 ←/→ : 앱 생존, state=${s.state}, #name=${s.name}, toast="${s.toastHidden ? '' : s.toastText}", msg="${s.msgHidden ? '' : s.msgText.split('\n')[0]}"`);
    });
    c.obs(obs.join(' / '));
  }, 120000),
], { noApp: true });

// =============================================================== SUITE: Ctrl+O / Ctrl+Shift+O (EP-15) — dialog.showOpenDialog 목
suite('dialog-opts', () => F.comicDir, [
  step('EP-15', 'Ctrl+O = 파일 선택(openFile), Ctrl+Shift+O = 폴더 선택(openDirectory)으로 대화상자 호출(한 번에 한 번), 선택 결과(만화 폴더·이미지 파일)가 새 상태로 열리고 취소하면 상태 불변, viewer:open-dialog({directory}) IPC 직접 호출도 같음', '목: dialog.showOpenDialog 호출 옵션 properties 기록. 대화상자 실물은 수동', async (c) => {
    const { page, app } = c;
    await stubDialog(app);
    await waitReady(page, '1화');
    const obs = [];
    await press(page, 'Control+KeyO');
    await poll(async () => (await dlgCalls(app)).length === 1, { timeout: 4000, desc: 'Ctrl+O 로 대화상자 호출' });
    let calls = await dlgCalls(app);
    assert.ok(calls[0].properties && calls[0].properties.includes('openFile'), `Ctrl+O properties=${JSON.stringify(calls[0].properties)}`);
    assert.ok(!calls[0].properties.includes('openDirectory'), 'Ctrl+O 가 폴더 선택으로 열림');
    await sleep(400);
    await press(page, 'Control+Shift+KeyO');
    await poll(async () => (await dlgCalls(app)).length === 2, { timeout: 4000, desc: 'Ctrl+Shift+O 로 대화상자 호출' });
    await sleep(500);
    calls = await dlgCalls(app);
    assert.equal(calls.length, 2, `Ctrl+Shift+O 가 대화상자를 ${calls.length - 1}번 호출함`);
    assert.ok(calls[1].properties && calls[1].properties.includes('openDirectory'), `Ctrl+Shift+O properties=${JSON.stringify(calls[1].properties)}`);
    obs.push(`Ctrl+O properties=[${calls[0].properties}], Ctrl+Shift+O properties=[${calls[1].properties}]`);
    // 폴더 선택 결과 → 새 만화 열림
    await dlgNext(app, { canceled: false, filePaths: [F.variedDir] });
    await press(page, 'Control+Shift+KeyO');
    let s = await waitReady(page, { comic: 'varied' });
    assertEpisodeBar(s, { comic: 'varied', name: '1화', n: 1, N: 3, pages: 2 }, '폴더 선택 결과');
    assert.equal(s.fit, true);
    // 파일 선택 결과 → 그 회차·그 장
    await sleep(500);
    await dlgNext(app, { canceled: false, filePaths: [F.ep10File3] });
    await press(page, 'Control+KeyO');
    s = await waitReady(page, { comic: 'comic', name: '10화' });
    assert.equal(s.index, 2);
    assert.equal(s.indexText, '(3/3)');
    approx(s.scrollTop, Math.min(s.pages[2].y, maxTopOf(s)), 1.5);
    // 취소 → 상태 불변
    await sleep(500);
    const before = await snap(page);
    await dlgNext(app, { canceled: true, filePaths: [] });
    await press(page, 'Control+Shift+KeyO');
    await sleep(700);
    s = await snap(page);
    assert.equal(s.name, before.name);
    assert.equal(s.comic, before.comic);
    approx(s.scrollTop, before.scrollTop, 1);
    obs.push('폴더 선택(varied) → (1/3) fit, 파일 선택(10화/03.png) → (3/3) index 2, 취소 → 불변');
    // IPC 직접 호출: {directory:true} / 인자 없음 / {directory:false}
    const before2 = (await dlgCalls(app)).length;
    await callIpc(app, 'viewer:open-dialog', { directory: true });
    await callIpc(app, 'viewer:open-dialog');
    await callIpc(app, 'viewer:open-dialog', { directory: false });
    const c2 = (await dlgCalls(app)).slice(before2);
    assert.equal(c2.length, 3, `IPC 직접 호출 3회가 대화상자 ${c2.length}회`);
    assert.ok(c2[0].properties.includes('openDirectory'), `{directory:true} properties=${c2[0].properties}`);
    assert.ok(c2[1].properties.includes('openFile') && !c2[1].properties.includes('openDirectory'), `인자 없음 properties=${c2[1].properties}`);
    assert.ok(c2[2].properties.includes('openFile') && !c2[2].properties.includes('openDirectory'), `{directory:false} properties=${c2[2].properties}`);
    obs.push(`IPC viewer:open-dialog({directory:true})→[${c2[0].properties}], ()→[${c2[1].properties}], ({directory:false})→[${c2[2].properties}]`);
    for (const o of obs) c.obs(o);
  }, 90000),
]);

// =============================================================== SUITE: 한글·특수문자 회차명 / 폭이 다른 회차 / 손상 이미지 회차
suite('ep-special', () => F.specialDir, [
  step('EP-04(추가)', '한글·특수문자 회차명(제1화 - 시작 #1 / 제2화 (특별) & \'q\' %41 / 제10화 [z] 한글): 자연 정렬(제2화 < 제10화), 이동 시 이미지 정상 로드(경로 인코딩), 상단 바·제목 표시', '정확 일치', async (c) => {
    const { page, app } = c;
    const rows = [];
    await waitReady(page, { comic: 'special' });
    for (let i = 0; i < SPECIAL_EPS.length; i++) {
      await gotoEpisode(page, i);
      const s = await waitSnap(page, (v) => v.episode === i && v.state === 'ready' && v.pages.length > 0 && v.pages.every((p) => p.complete && p.natW > 0 && !p.broken), `${SPECIAL_EPS[i].name}: 이미지 로드`, 20000);
      assertEpisodeBar(s, { comic: 'special', name: SPECIAL_EPS[i].name, n: i + 1, N: SPECIAL_EPS.length, pages: SPECIAL_EPS[i].h.length }, SPECIAL_EPS[i].name);
      assert.deepEqual(pageDirs(s), [SPECIAL_EPS[i].name]);
      assert.equal(await winTitle(app), s.title);
      rows.push(`${s.name}${s.indexText} ${s.pages.length}장 로드`);
    }
    c.obs(rows.join(' → '));
  }),
]);

suite('ep-varied', () => F.variedDir, [
  step('EP-02(추가)', '폭이 다른 회차(800/720/1000) 사이 이동: 창 크기 불변(초기 창은 첫 회차 기준), 폭 맞춤이면 #strip 폭 = clientWidth/1.1 이고 scale = 그 회차 기준 폭 기준, 줌 상태에서는 data-scale 유지', '정확 일치, 레터박스·폭 허용 오차(assertFitLayout)', async (c) => {
    const { page, app } = c;
    const w0 = await winInfo(app);
    assert.deepEqual(w0.content, [880, 820], '초기 창은 첫 회차(폭 800) 기준');
    const rows = [];
    for (let i = 0; i < VARIED_EPS.length; i++) {
      const s = await gotoEpisode(page, i);
      await resetView(page);
      const t = await snap(page);
      assertEpisodeBar(t, { comic: 'varied', name: VARIED_EPS[i].name, n: i + 1, N: 3, pages: 2 }, `회차 ${i}`);
      assertFitLayout(t, `varied ${VARIED_EPS[i].name} (기준 폭 ${VARIED_EPS[i].w})`, VARIED_EPS[i].w);
      assert.deepEqual((await winInfo(app)).content, w0.content, '회차 이동은 창 크기를 건드리지 않음');
      rows.push(`${VARIED_EPS[i].name}(폭 ${VARIED_EPS[i].w}): strip=${t.strip.width.toFixed(1)}, scale=${t.scaleStr}`);
    }
    await gotoEpisode(page, 0);
    await press(page, 'Control+1');
    const z = await snap(page);
    assert.equal(z.scaleStr, '1.0000');
    await press(page, 'ArrowRight');
    const s1 = await waitReady(page, '2화');
    assert.equal(s1.fit, false);
    assert.equal(s1.scaleStr, '1.0000', '줌(100%) 상태에서 폭이 다른 회차로 이동해도 data-scale 유지');
    approx(s1.strip.width, 720, 1.5, '100% 에서 2화(폭 720)의 #strip 폭');
    await press(page, 'ArrowRight');
    const s2 = await waitReady(page, '3화');
    assert.equal(s2.scaleStr, '1.0000');
    approx(s2.strip.width, 1000, 1.5);
    await press(page, 'Control+0');
    c.obs(`${rows.join(' / ')}; Ctrl+1 후 2화(720)·3화(1000) 이동 → scale 1.0000 유지, #strip 폭 720/1000; 창 내부 ${w0.content.join('×')} 불변`);
  }),
]);

suite('ep-broken', () => F.brokenComicDir, [
  step('ERR-04', '손상 이미지가 든 회차로 이동해도 ←/→ 가 계속 동작: 2화(정상·garbage·정상)·3화(정상+0바이트)의 자리표시자, 이웃 장 정상, 되돌아와도 정상', '정확 일치', async (c) => {
    const { page } = c;
    let s = await waitReady(page, '1화');
    assertEpisodeBar(s, { comic: 'brokencomic', name: '1화', n: 1, N: 3, pages: 2 }, '1화');
    s = await waitSnap(page, (v) => v.pages.every((p) => p.complete), '1화 로드', 15000);
    assert.ok(s.pages.every((p) => !p.broken), '정상 회차에 자리표시자');
    await press(page, 'ArrowRight');
    s = await waitReady(page, '2화');
    s = await waitSnap(page, (v) => v.pages[1] && v.pages[1].broken && v.pages[0].complete && v.pages[2].complete, '2화 손상 장 자리표시자', 20000);
    assertEpisodeBar(s, { comic: 'brokencomic', name: '2화', n: 2, N: 3, pages: 3 }, '2화');
    assertPlaceholder(s, 1, 'broken.png', '2화 garbage');
    assert.ok(!s.pages[0].broken && !s.pages[2].broken, '이웃 장이 손상 처리됨');
    assert.equal(s.msgHidden, true);
    assertContiguous(s, '손상 장 포함 2화');
    await press(page, 'ArrowRight');
    s = await waitReady(page, '3화');
    s = await waitSnap(page, (v) => v.pages[1] && v.pages[1].broken && v.pages[0].complete, '3화 0바이트 장 자리표시자', 20000);
    assertEpisodeBar(s, { comic: 'brokencomic', name: '3화', n: 3, N: 3, pages: 2 }, '3화');
    assertPlaceholder(s, 1, 'z-zero.png', '3화 0바이트');
    await press(page, 'ArrowLeft');
    await waitReady(page, '2화');
    await press(page, 'ArrowLeft');
    s = await waitReady(page, '1화');
    s = await waitSnap(page, (v) => v.pages.every((p) => p.complete), '1화 재로드', 15000);
    assert.ok(s.pages.every((p) => !p.broken), '되돌아온 정상 회차에 자리표시자가 남음');
    assert.equal(s.state, 'ready');
    c.obs('1화(정상) → 2화(garbage 자리표시자, 이웃 정상) → 3화(0바이트 자리표시자) → ← ← 1화(정상, 자리표시자 없음), state 는 내내 ready');
  }),
]);

// =============================================================== SUITE: 직접 구현 스크롤바 (SBR-01 ~ SBR-10)
// 썸 위치는 컴포지터 애니메이션이라 마지막 스크롤 변경 뒤 프레임 2개를 기다린 다음(barSnap) 읽는다. 공식은 plan.md §8-3 그대로:
//  트랙 = 바 길이 − 2×2(양끝 여백), 썸 길이 = max(40, 트랙×보이는/전체), 썸 위치 = 스크롤/(전체−보이는)×(트랙−썸 길이).
const hitTest = (page, x, y) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return { id: el ? el.id : null, cls: el ? el.className : null, inVbar: !!(el && el.closest('#vbar')), inHbar: !!(el && el.closest('#hbar')), inScroller: !!(el && el.closest('#scroller')) };
  }, [x, y]);

// 바 지오메트리: 두께 16, 오른쪽/아래 가장자리 정렬, 두 바가 모두 보이면 서로의 모서리(16px)를 비움
function assertBarGeometry(s, label) {
  const view = s.view;
  assert.ok(view, `${label}: #view 요소가 없음`);
  approx(view.width, s.clientWidth, SNAP_TOL, `${label}: #view 폭 = #scroller 폭(오버레이라 폭을 줄이지 않음)`);
  approx(view.height, s.clientHeight, SNAP_TOL, `${label}: #view 높이 = #scroller 높이`);
  const v = barVisible(s.vbar);
  const h = barVisible(s.hbar);
  if (v) {
    approx(s.vbar.rect.width, BAR_W, SNAP_TOL, `${label}: #vbar 두께`);
    approx(s.vbar.rect.right, view.right, SNAP_TOL, `${label}: #vbar 는 오른쪽 가장자리`);
    approx(s.vbar.rect.top, view.top, SNAP_TOL, `${label}: #vbar 위쪽 정렬`);
    approx(s.vbar.rect.height, view.height - (h ? BAR_W : 0), SNAP_TOL, `${label}: #vbar 높이(두 바가 보이면 모서리 ${BAR_W}px 비움)`);
    assert.ok(s.vbar.thumb && s.vbar.thumb.left >= s.vbar.rect.left - 0.5 && s.vbar.thumb.right <= s.vbar.rect.right + 0.5, `${label}: 썸이 바 안에 있어야 함`);
  }
  if (h) {
    approx(s.hbar.rect.height, BAR_W, SNAP_TOL, `${label}: #hbar 두께`);
    approx(s.hbar.rect.bottom, view.bottom, SNAP_TOL, `${label}: #hbar 는 아래쪽 가장자리`);
    approx(s.hbar.rect.left, view.left, SNAP_TOL, `${label}: #hbar 왼쪽 정렬`);
    approx(s.hbar.rect.width, view.width - (v ? BAR_W : 0), SNAP_TOL, `${label}: #hbar 폭(두 바가 보이면 모서리 ${BAR_W}px 비움)`);
    assert.ok(s.hbar.thumb && s.hbar.thumb.top >= s.hbar.rect.top - 0.5 && s.hbar.thumb.bottom <= s.hbar.rect.bottom + 0.5, `${label}: 가로 썸이 바 안에 있어야 함`);
  }
}

// 같은 프레임 시험: 스크롤을 바꾼 직후 다음 rAF 콜백(= 같은 프레임의 렌더링 직전)에서 썸 위치를 읽는다.
const sameFrameSample = (page, top) =>
  page.evaluate(async (t) => {
    const sc = document.getElementById('scroller');
    sc.scrollTop = t;
    await new Promise((r) => requestAnimationFrame(r));
    const bar = document.getElementById('vbar').getBoundingClientRect();
    const th = document.querySelector('#vbar .sthumb').getBoundingClientRect();
    return { scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, barTop: bar.top, barH: bar.height, thumbTop: th.top, thumbH: th.height };
  }, top);
function sampleError(x) {
  const trackLen = x.barH - 2 * TRACK_PAD;
  const len = Math.max(THUMB_MIN, (trackLen * x.clientHeight) / x.scrollHeight);
  const max = x.scrollHeight - x.clientHeight;
  const off = max > 0 ? (x.scrollTop / max) * (trackLen - len) : 0;
  return { len, off, dl: Math.abs(x.thumbH - len), dp: Math.abs(x.thumbTop - (x.barTop + TRACK_PAD) - off) };
}
const startSampler = (page) =>
  page.evaluate(() => {
    window.__bs = [];
    window.__bsOn = true;
    const sc = document.getElementById('scroller');
    const tick = () => {
      if (!window.__bsOn) return;
      const bar = document.getElementById('vbar');
      const th = bar && bar.querySelector('.sthumb');
      const br = bar ? bar.getBoundingClientRect() : null;
      const tr = th ? th.getBoundingClientRect() : null;
      window.__bs.push({
        hidden: !bar || bar.hidden || getComputedStyle(bar).display === 'none',
        scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight,
        barTop: br ? br.top : 0, barH: br ? br.height : 0, thumbTop: tr ? tr.top : 0, thumbH: tr ? tr.height : 0,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stopSampler = (page) =>
  page.evaluate(() => {
    window.__bsOn = false;
    return window.__bs;
  });

suite('sbr-main', () => F.strDir, [
  step('SBR-01', '네이티브 스크롤바·거터 없음(clientWidth == offsetWidth == innerWidth, scrollbar-width:none, ::-webkit-scrollbar display:none), 초기 창 내부 폭 = round(기준 폭×1.1), 좌우 레터박스 대칭, 바는 오버레이(두께 16·가장자리 정렬·두 바가 보이면 모서리 비움·바 바로 밖은 콘텐츠)', '정확 일치, 지오메트리 ±0.5px', async (c) => {
    const { page, app } = c;
    const obs = [];
    await restoreSize(app, page);
    await resetView(page);
    let s = await barSnap(page);
    const w = await winInfo(app);
    assert.deepEqual(w.content, [Math.round(800 * LB), 820], '초기 창 내부 크기 = round(기준 폭 × 1.1) × 820 (스크롤바 14px 가산 없음)');
    assert.equal(s.innerW, w.content[0]);
    assert.equal(s.clientWidth, s.innerW, 'clientWidth == innerWidth (거터 없음)');
    assert.equal(s.offsetWidth, s.clientWidth, 'offsetWidth == clientWidth');
    assert.equal(s.offsetHeight, s.clientHeight, 'offsetHeight == clientHeight');
    assert.equal(s.clientHeight, s.innerH - TOPBAR_H);
    assert.equal(s.scrollerCss.scrollbarWidth, 'none', 'scrollbar-width');
    assert.equal(s.scrollerCss.webkitScrollbarDisplay, 'none', '::-webkit-scrollbar display');
    assert.ok(s.scrollHeight > s.clientHeight, '사전조건: 세로 오버플로(네이티브 바라면 거터가 생김)');
    const l = s.strip.left - s.sr.left;
    const r = s.sr.left + s.clientWidth - (s.strip.left + s.strip.width);
    approx(l, r, SNAP_TOL, '좌우 레터박스 대칭');
    approx(l, (s.clientWidth - s.strip.width) / 2, SNAP_TOL, '좌 레터박스 = (clientWidth − #strip 폭)/2');
    assertBarGeometry(s, '폭 맞춤');
    assert.ok(barVisible(s.vbar), '#vbar 표시');
    assert.ok(s.hbar && !barVisible(s.hbar), '#hbar 요소는 있되 폭 맞춤에서는 숨김');
    const vb = s.vbar.rect;
    let hit = await hitTest(page, vb.left + 1, vb.top + 100);
    assert.ok(hit.inVbar, `바 안쪽(+1px)은 #vbar 가 잡아야 함: ${JSON.stringify(hit)}`);
    hit = await hitTest(page, vb.left - 1, vb.top + 100);
    assert.ok(!hit.inVbar && hit.inScroller, `바 바로 바깥(-1px)은 콘텐츠: ${JSON.stringify(hit)}`);
    obs.push(`창 내부 ${w.content.join('×')}, clientWidth=${s.clientWidth}=offsetWidth=innerWidth, scrollbar-width=${s.scrollerCss.scrollbarWidth}, ::-webkit-scrollbar=${s.scrollerCss.webkitScrollbarDisplay}, 레터박스 ${l.toFixed(1)}/${r.toFixed(1)}, #vbar ${vb.width}×${vb.height.toFixed(0)} 오른쪽 정렬`);
    // 확대: 두 바가 보이고 모서리를 비움, 그래도 clientWidth/Height 불변(오버레이)
    for (let i = 0; i < 3; i++) await press(page, 'Control+Equal');
    s = await barSnap(page);
    assert.ok(barVisible(s.vbar) && barVisible(s.hbar), '확대 후 두 바 모두 보임');
    assert.equal(s.clientWidth, s.innerW, '확대해도 clientWidth == innerWidth');
    assert.equal(s.clientHeight, s.innerH - TOPBAR_H, '확대해도 clientHeight 불변(가로 바가 높이를 줄이지 않음)');
    assert.equal(s.offsetWidth - s.clientWidth, 0);
    assert.equal(s.offsetHeight - s.clientHeight, 0);
    assertBarGeometry(s, '확대(두 바)');
    hit = await hitTest(page, s.view.right - 4, s.view.bottom - 4);
    assert.ok(!hit.inVbar && !hit.inHbar && hit.inScroller, `비워 둔 모서리는 콘텐츠: ${JSON.stringify(hit)}`);
    hit = await hitTest(page, s.hbar.rect.left + 100, s.hbar.rect.top + 1);
    assert.ok(hit.inHbar, `가로 바 안쪽(+1px): ${JSON.stringify(hit)}`);
    hit = await hitTest(page, s.hbar.rect.left + 100, s.hbar.rect.top - 1);
    assert.ok(!hit.inHbar && hit.inScroller, `가로 바 바로 바깥(-1px): ${JSON.stringify(hit)}`);
    obs.push(`확대(두 바): #vbar 높이 ${s.vbar.rect.height.toFixed(0)}=view ${s.view.height.toFixed(0)}−16, #hbar 폭 ${s.hbar.rect.width.toFixed(0)}=view ${s.view.width.toFixed(0)}−16, 모서리 비움, clientWidth/Height 불변`);
    await press(page, 'Control+0');
    // 다른 기준 폭의 초기 창 폭
    for (const [arg, name, ref, wantW] of [[F.mixDir, 'mix', 720, 792], [F.narrow, 'narrow', 400, 480]]) {
      await withApp(arg, async ({ page: p2, app: a2 }) => {
        await waitReady(p2, { comic: name });
        const t = await snap(p2);
        const w2 = await winInfo(a2);
        assert.deepEqual(w2.content, [wantW, 820], `${name}: 초기 창 내부 크기`);
        assert.equal(t.clientWidth, t.innerW);
        assert.equal(t.offsetWidth, t.clientWidth);
        approx(t.strip.left - t.sr.left, t.sr.left + t.clientWidth - (t.strip.left + t.strip.width), SNAP_TOL, `${name}: 레터박스 대칭`);
        obs.push(`${name}(기준 폭 ${ref}): 내부 ${w2.content.join('×')} (round(${ref}×1.1)=${Math.round(ref * LB)}${wantW !== Math.round(ref * LB) ? ` → 최소 폭 ${wantW}` : ''}), clientWidth=${t.clientWidth}`);
      });
    }
    for (const o of obs) c.obs(o);
  }, 90000),
  step('SBR-02', '썸 길이 = max(40, 트랙×보이는/전체), 위치 = 스크롤/(전체−보이는)×(트랙−썸 길이): 스크롤 0·중간·끝·임의 위치(세로 15곳·가로 11곳), 양끝 여백 2px, 최소 길이 40(24장 회차)', `±${THUMB_TOL}px (길이·이동 거리 반올림 1회분)`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    let s = await barSnap(page);
    const max = s.scrollHeight - s.clientHeight;
    assert.ok(max > 5000, `사전조건: 긴 회차 max=${max}`);
    let worst = 0;
    for (const t of scrollPositions(max)) {
      await setScroll(page, t, null);
      s = await barSnap(page);
      const e = assertThumb(s, 'y', `세로 scrollTop=${s.scrollTop}`);
      worst = Math.max(worst, Math.abs(thumbLen(s.vbar, 'y') - e.len), Math.abs(thumbStart(s.vbar, 'y') - e.trackStart - e.off));
    }
    const e0 = expectedThumb(s, 'y');
    await setScroll(page, 0, null);
    s = await barSnap(page);
    approx(s.vbar.thumb.top - s.vbar.rect.top, TRACK_PAD, THUMB_TOL, '스크롤 0: 썸 위쪽 여백(트랙 시작)');
    await setScroll(page, max, null);
    s = await barSnap(page);
    approx(s.vbar.rect.bottom - s.vbar.thumb.bottom, TRACK_PAD, THUMB_TOL, '스크롤 끝: 썸 아래쪽 여백(트랙 끝)');
    c.obs(`세로: 트랙 ${e0.trackLen.toFixed(0)}, 보이는 ${e0.visible}/전체 ${e0.total.toFixed(0)} → 썸 길이 ${e0.len.toFixed(1)}, 15곳(0·1·중간·끝-1·끝+임의 10) 최대 오차 ${worst.toFixed(2)}px`);
    // 가로(확대 후, 세로 바가 있어 #hbar 가 16px 짧음)
    for (let i = 0; i < 4; i++) await press(page, 'Control+Equal');
    s = await barSnap(page);
    assert.ok(barVisible(s.hbar) && s.scrollWidth > s.clientWidth, '사전조건: 가로 오버플로');
    const maxX = s.scrollWidth - s.clientWidth;
    let worstX = 0;
    for (const t of scrollPositions(maxX, 6, 777)) {
      await setScroll(page, null, t);
      s = await barSnap(page);
      const e = assertThumb(s, 'x', `가로 scrollLeft=${s.scrollLeft}`);
      assertThumb(s, 'y', `확대 후 세로(scrollTop=${s.scrollTop})`);
      worstX = Math.max(worstX, Math.abs(thumbLen(s.hbar, 'x') - e.len), Math.abs(thumbStart(s.hbar, 'x') - e.trackStart - e.off));
    }
    const ex = expectedThumb(s, 'x');
    await setScroll(page, null, 0);
    s = await barSnap(page);
    approx(s.hbar.thumb.left - s.hbar.rect.left, TRACK_PAD, THUMB_TOL, '가로 0: 썸 왼쪽 여백');
    await setScroll(page, null, maxX);
    s = await barSnap(page);
    approx(s.hbar.rect.right - s.hbar.thumb.right, TRACK_PAD, THUMB_TOL, '가로 끝: 썸 오른쪽 여백');
    await press(page, 'Control+0');
    c.obs(`가로(확대 ${s.scaleStr}): 트랙 ${ex.trackLen.toFixed(0)}, 보이는 ${ex.visible}/전체 ${ex.total} → 썸 길이 ${ex.len.toFixed(1)}, 11곳 최대 오차 ${worstX.toFixed(2)}px`);
    // 최소 길이 40: 24장(720×2000) 회차는 계산 길이가 40 미만
    await withApp(F.manyDir, async ({ page: p2 }) => {
      await waitReady(p2, { comic: 'many' });
      let t = await barSnap(p2);
      const m = expectedThumb(t, 'y');
      assert.ok((m.trackLen * m.visible) / m.total < THUMB_MIN, `사전조건: 계산 길이 ${((m.trackLen * m.visible) / m.total).toFixed(1)} < ${THUMB_MIN}`);
      approx(thumbLen(t.vbar, 'y'), THUMB_MIN, THUMB_TOL, '최소 길이 40');
      for (const pos of [0, Math.round(m.max / 2), m.max]) {
        await setScroll(p2, pos, null);
        t = await barSnap(p2);
        assertThumb(t, 'y', `many 최소 길이 구간 scrollTop=${t.scrollTop}`);
        approx(thumbLen(t.vbar, 'y'), THUMB_MIN, THUMB_TOL, `many scrollTop=${t.scrollTop}: 길이 40 유지`);
      }
      c.obs(`24장 회차: 계산 길이 ${((m.trackLen * m.visible) / m.total).toFixed(1)} → 썸 길이 ${THUMB_MIN}(최소), 0/중간/끝 위치 공식 일치`);
    });
  }, 120000),
  step('SBR-03', '썸 위치는 스크롤 연동 애니메이션(ScrollTimeline, source=#scroller)이 구동하고, 스크롤을 바꾼 직후 같은 프레임(rAF)에서 위치가 맞으며 휠 스크롤 중 매 프레임 일치', `타임라인 종류 정확 일치, ±${SAMPLE_TOL}px`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    let s = await barSnap(page);
    const a = s.vbar.anims;
    assert.ok(Array.isArray(a) && a.length >= 1, `#vbar .sthumb 에 애니메이션이 없음(getAnimations()=${JSON.stringify(a)}) — JS 위치 지정 폴백이거나 미구현`);
    const sa = a.find((x) => x.scroll);
    assert.ok(sa, `#vbar 썸 애니메이션이 ScrollTimeline 이 아님: ${JSON.stringify(a)}`);
    assert.equal(sa.type, 'ScrollTimeline');
    assert.equal(sa.source, 'scroller', `타임라인 source=${sa.source}`);
    assert.ok(['y', 'block'].includes(sa.axis), `세로 바 타임라인 axis=${sa.axis}`);
    for (let i = 0; i < 2; i++) await press(page, 'Control+Equal');
    s = await barSnap(page);
    assert.ok(barVisible(s.hbar), '사전조건: #hbar 표시');
    const ah = s.hbar.anims;
    const sh = ah && ah.find((x) => x.scroll);
    assert.ok(sh, `#hbar 썸 애니메이션이 ScrollTimeline 이 아님: ${JSON.stringify(ah)}`);
    assert.equal(sh.source, 'scroller');
    assert.ok(['x', 'inline'].includes(sh.axis), `가로 바 타임라인 axis=${sh.axis}`);
    await press(page, 'Control+0');
    s = await barSnap(page);
    const max = s.scrollHeight - s.clientHeight;
    // 같은 프레임: 큰 점프를 연달아 — 한 프레임 늦으면 점프 폭만큼 어긋난다
    const rows = [];
    let worst = 0;
    for (const t of scrollPositions(max, 8, 424242)) {
      const x = await sameFrameSample(page, t);
      const err = sampleError(x);
      worst = Math.max(worst, err.dp, err.dl);
      assert.ok(err.dp <= SAMPLE_TOL, `scrollTop=${x.scrollTop} 설정 직후 같은 프레임 썸 위치 오차 ${err.dp.toFixed(2)}px (기대 ${err.off.toFixed(1)}, 실제 ${(x.thumbTop - x.barTop - TRACK_PAD).toFixed(1)})`);
      assert.ok(err.dl <= SAMPLE_TOL, `썸 길이 오차 ${err.dl.toFixed(2)}px`);
      rows.push(Math.round(x.scrollTop));
    }
    // 휠 스크롤(스무스 포함) 중 매 프레임: scrollTop 과 썸 위치가 항상 공식과 맞음
    await resetView(page);
    const p = center(await snap(page));
    await page.mouse.move(p.x, p.y);
    await startSampler(page);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 700);
      await sleep(120);
    }
    await settleScroll(page, 250, 6000);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -900);
      await sleep(120);
    }
    await settleScroll(page, 250, 6000);
    const samples = await stopSampler(page);
    const moving = samples.filter((x) => !x.hidden && x.barH > 0);
    const distinct = new Set(moving.map((x) => Math.round(x.scrollTop))).size;
    assert.ok(distinct >= 6, `휠 스크롤 중 서로 다른 scrollTop 표본이 ${distinct}개뿐(스크롤 진행을 관찰하지 못함)`);
    let worstS = 0;
    for (const x of moving) {
      const err = sampleError(x);
      worstS = Math.max(worstS, err.dp);
      assert.ok(err.dp <= SAMPLE_TOL, `휠 스크롤 중 scrollTop=${x.scrollTop.toFixed(1)} 에서 썸 위치 오차 ${err.dp.toFixed(2)}px (뒤늦게 따라옴)`);
    }
    c.obs(`#vbar 썸: ${sa.type}(source=${sa.source}, axis=${sa.axis}), #hbar 썸: ${sh.type}(axis=${sh.axis}); 같은 프레임 점프 ${rows.length}회 최대 오차 ${worst.toFixed(2)}px; 휠 스크롤 중 ${moving.length}프레임(서로 다른 scrollTop ${distinct}개) 최대 오차 ${worstS.toFixed(2)}px`);
  }, 90000),
  step('SBR-04', '썸 드래그: 누르는 순간 안 튐(썸 위·중앙·아래 어디를 눌러도 scrollTop·썸 위치 불변, .dragging), 이동 1:1(마우스 N px = 썸 N px), 뷰 영역 밖·창 밖으로 나가도 추적하고 양끝 clamp, 놓으면 종료, blur/pointercancel 에서도 종료', `썸 이동 ±1.5px, 누른 순간 ±0.5px`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    const obs = [];
    const prep = async (frac) => {
      await resetView(page);
      const s = await barSnap(page);
      await setScroll(page, Math.round((s.scrollHeight - s.clientHeight) * frac), null);
      return barSnap(page);
    };
    // (1) 누르는 순간 튀지 않음
    for (const [label, off] of [['썸 위쪽 끝(+4px)', (T) => 4], ['썸 중앙', (T) => T.height / 2], ['썸 아래쪽 끝(-4px)', (T) => T.height - 4]]) {
      const s0 = await prep(0.4);
      const T = s0.vbar.thumb;
      const x = T.left + T.width / 2;
      await page.mouse.move(x, T.top + off(T));
      await sleep(350);
      const before = await barSnap(page);
      await page.mouse.down();
      const down = await snap(page);
      approx(down.scrollTop, before.scrollTop, SNAP_TOL, `${label}: 누른 순간 scrollTop 이 튐`);
      const fr = await barSnap(page);
      approx(fr.scrollTop, before.scrollTop, SNAP_TOL, `${label}: 누른 뒤 프레임에서 scrollTop 이 튐`);
      approx(fr.vbar.thumb.top, before.vbar.thumb.top, SNAP_TOL, `${label}: 누른 순간 썸이 튐`);
      assert.equal(fr.anyDragging, true, `${label}: 누르면 .dragging`);
      await page.mouse.up();
      await sleep(80);
      assert.equal((await snap(page)).anyDragging, false, `${label}: 놓으면 .dragging 해제`);
      obs.push(`${label}: scrollTop ${before.scrollTop}→${down.scrollTop}, 썸 top ${before.vbar.thumb.top.toFixed(1)}→${fr.vbar.thumb.top.toFixed(1)} 불변`);
    }
    // (2) 1:1 이동, (3) 뷰 영역 밖, (4) 창 밖, clamp
    let s = await prep(0.4);
    const T0 = s.vbar.thumb;
    const x = T0.left + T0.width / 2;
    const y0 = T0.top + T0.height / 2;
    await page.mouse.move(x, y0);
    await sleep(350);
    const base = await barSnap(page);
    const top0 = base.vbar.thumb.top;
    const sc0 = base.scrollTop;
    const e0 = expectedThumb(base, 'y');
    const ratio = e0.max / e0.travel;
    await page.mouse.down();
    let prev = sc0;
    let worst = 0;
    for (let k = 1; k <= 8; k++) {
      await page.mouse.move(x, y0 + k * 12);
      const sk = await barSnap(page);
      const d = sk.vbar.thumb.top - top0;
      worst = Math.max(worst, Math.abs(d - k * 12));
      approx(d, k * 12, DRAG_TOL, `1:1 이동 ${k}단계(마우스 ${k * 12}px) 썸 이동량`);
      assertThumb(sk, 'y', `드래그 ${k}단계`);
      approx(sk.scrollTop - sc0, k * 12 * ratio, ratio * DRAG_TOL + 1, `드래그 ${k}단계 scrollTop 이동량(썸 1px = 스크롤 ${ratio.toFixed(1)}px)`);
      assert.ok(sk.scrollTop > prev, `드래그 ${k}단계: scrollTop 단조 증가 ${prev}→${sk.scrollTop}`);
      prev = sk.scrollTop;
    }
    obs.push(`1:1: 마우스 12px×8단계 썸 이동 최대 오차 ${worst.toFixed(2)}px (썸 1px = 스크롤 ${ratio.toFixed(1)}px), scrollTop 단조 증가`);
    await page.mouse.move(base.sr.left + 120, y0 + 150);
    s = await barSnap(page);
    approx(s.vbar.thumb.top - top0, 150, DRAG_TOL, '바 밖(콘텐츠 위, x 를 크게 벗어남)에서도 추적');
    assertThumb(s, 'y', '바 밖 추적');
    await page.mouse.move(base.innerW + 300, y0 + 170);
    s = await barSnap(page);
    approx(s.vbar.thumb.top - top0, 170, DRAG_TOL, '창 오른쪽 밖에서도 추적');
    await page.mouse.move(base.innerW + 300, base.innerH + 400);
    s = await barSnap(page);
    approx(s.scrollTop, e0.max, DRAG_TOL, '창 아래 밖으로 → 끝 clamp');
    approx(s.vbar.rect.bottom - s.vbar.thumb.bottom, TRACK_PAD, THUMB_TOL, '끝 clamp: 썸 아래 여백');
    await page.mouse.move(-400, -400);
    s = await barSnap(page);
    approx(s.scrollTop, 0, DRAG_TOL, '창 왼쪽 위 밖으로 → 처음 clamp');
    assert.equal(s.anyDragging, true, '창 밖에서도 드래그 유지');
    obs.push('바 밖(x −·콘텐츠 위)/창 밖(오른쪽·아래·왼쪽 위)에서도 추적, 아래 밖 = 끝 clamp, 위 밖 = 처음 clamp');
    await page.mouse.up();
    await sleep(80);
    s = await snap(page);
    assert.equal(s.anyDragging, false, '창 밖에서 놓아도 종료');
    const after = s.scrollTop;
    await page.mouse.move(x, y0 + 40);
    await sleep(100);
    approx((await snap(page)).scrollTop, after, SNAP_TOL, '놓은 뒤 mousemove 가 스크롤함');
    // (5) blur 로 종료
    s = await prep(0.4);
    let T = s.vbar.thumb;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2);
    await sleep(350);
    await page.mouse.down();
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2 + 30);
    await barSnap(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    s = await snap(page);
    assert.equal(s.anyDragging, false, 'blur 에서 드래그가 끝나지 않음');
    const afterBlur = s.scrollTop;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2 + 90);
    await sleep(100);
    approx((await snap(page)).scrollTop, afterBlur, SNAP_TOL, 'blur 뒤 mousemove 가 계속 스크롤함');
    await page.mouse.up();
    // (6) pointercancel 로 종료 (합성 이벤트, mouse pointerId=1)
    s = await prep(0.4);
    T = s.vbar.thumb;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2);
    await sleep(350);
    await page.mouse.down();
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2 + 30);
    await barSnap(page);
    await page.evaluate(() => {
      const th = document.querySelector('#vbar .sthumb');
      th.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true, cancelable: true }));
    });
    s = await snap(page);
    assert.equal(s.anyDragging, false, 'pointercancel 에서 드래그가 끝나지 않음');
    const afterCancel = s.scrollTop;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2 + 90);
    await sleep(100);
    approx((await snap(page)).scrollTop, afterCancel, SNAP_TOL, 'pointercancel 뒤 mousemove 가 계속 스크롤함');
    await page.mouse.up();
    obs.push('놓기(창 밖), blur, pointercancel(합성) 모두 드래그 종료 후 mousemove 무반응');
    for (const o of obs) c.obs(o);
  }, 120000),
  step('SBR-05', '트랙 클릭: 클릭한 위치가 썸 중앙이 되도록 즉시 이동(스무스 아님), 처음/끝 clamp, 누른 채 이어서 드래그', `scrollTop ±(썸 1.5px 분), 썸 중앙 ±1.5px, 클릭 후 scrollTop 변화 ±1`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    const obs = [];
    const clickCase = async (startFrac, clickFrac, label, drag) => {
      await resetView(page);
      let s0 = await barSnap(page);
      await setScroll(page, Math.round((s0.scrollHeight - s0.clientHeight) * startFrac), null);
      s0 = await barSnap(page);
      const e0 = expectedThumb(s0, 'y');
      const tr = trackOf(s0.vbar, 'y');
      const bx = s0.vbar.rect.left + s0.vbar.rect.width / 2;
      const y = tr.start + tr.len * clickFrac;
      const T = s0.vbar.thumb;
      assert.ok(y < T.top - 4 || y > T.bottom + 4, `${label}: 클릭 위치(${y.toFixed(0)})가 썸(${T.top.toFixed(0)}~${T.bottom.toFixed(0)}) 위`);
      await page.mouse.move(bx, y);
      await page.mouse.down();
      const imm = await snap(page);
      const wantOff = Math.min(Math.max(y - e0.len / 2 - e0.trackStart, 0), e0.travel);
      const wantScroll = (wantOff / e0.travel) * e0.max;
      const ratio = e0.max / e0.travel;
      approx(imm.scrollTop, wantScroll, ratio * DRAG_TOL + 1, `${label}: 클릭 직후 scrollTop (클릭 위치가 썸 중앙 → 기대 ${wantScroll.toFixed(0)})`);
      const fr = await barSnap(page);
      approx(fr.scrollTop, imm.scrollTop, 1, `${label}: 클릭 뒤 스크롤이 계속 움직임(스무스 스크롤 아님)`);
      const wantCenter = Math.min(Math.max(y, tr.start + e0.len / 2), tr.start + tr.len - e0.len / 2);
      approx(fr.vbar.thumb.top + fr.vbar.thumb.height / 2, wantCenter, DRAG_TOL, `${label}: 썸 중앙 = 클릭 y`);
      assertThumb(fr, 'y', `${label}: 클릭 후`);
      assert.equal(fr.anyDragging, true, `${label}: 누른 채 드래그를 이어갈 수 있어야 함(.dragging)`);
      let tail = '';
      if (drag) {
        const dy = y > s0.vbar.rect.top + s0.vbar.rect.height / 2 ? -40 : 40;
        const c0 = fr.vbar.thumb.top + fr.vbar.thumb.height / 2;
        await page.mouse.move(bx, y + dy);
        const d = await barSnap(page);
        approx(d.vbar.thumb.top + d.vbar.thumb.height / 2 - c0, dy, DRAG_TOL, `${label}: 이어서 드래그 ${dy}px`);
        assertThumb(d, 'y', `${label}: 이어서 드래그 후`);
        tail = `, 이어서 ${dy}px 드래그 OK`;
      }
      await page.mouse.up();
      await sleep(80);
      assert.equal((await snap(page)).anyDragging, false, `${label}: 놓으면 종료`);
      return `${label}: scrollTop ${imm.scrollTop.toFixed(0)}(기대 ${wantScroll.toFixed(0)}), 썸 중앙 ${(fr.vbar.thumb.top + fr.vbar.thumb.height / 2).toFixed(1)}(클릭 ${y.toFixed(1)})${tail}`;
    };
    obs.push(await clickCase(0, 0.7, '맨 위에서 트랙 70% 클릭', true));
    obs.push(await clickCase(0.9, 0.3, '90% 위치에서 트랙 30% 클릭', true));
    obs.push(await clickCase(0.5, 0.2, '중간에서 트랙 20% 클릭', true));
    obs.push(await clickCase(0, 0.995, '트랙 맨 끝 클릭(끝 clamp)', false));
    obs.push(await clickCase(0.9, 0.003, '트랙 맨 처음 클릭(처음 clamp)', false));
    for (const o of obs) c.obs(o);
  }, 90000),
  step('SBR-06', '바 위의 휠은 콘텐츠를 스크롤한다(세로 바 트랙·썸 위, 가로 바 위)', `scrollTop ≥100(+300 휠), 왕복 후 ±${SCROLL_TOL}px`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    let s = await barSnap(page);
    const obs = [];
    const rt = async (x, y, label) => {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 300);
      let r = await settleScroll(page);
      assert.ok(r.top >= 100, `${label}: 바 위의 휠이 콘텐츠를 스크롤하지 않음 scrollTop=${r.top}`);
      const down = r.top;
      await page.mouse.wheel(0, -300);
      r = await settleScroll(page);
      approx(r.top, 0, SCROLL_TOL, `${label}: 휠 ±300 왕복`);
      obs.push(`${label}: +300 → scrollTop ${down}, -300 → ${r.top}`);
    };
    await rt(s.vbar.rect.left + s.vbar.rect.width / 2, s.vbar.rect.top + s.vbar.rect.height * 0.8, '#vbar 트랙');
    const T = s.vbar.thumb;
    await rt(T.left + T.width / 2, T.top + T.height / 2, '#vbar 썸');
    for (let i = 0; i < 2; i++) await press(page, 'Control+Equal');
    await setScroll(page, 0, 0);
    s = await barSnap(page);
    assert.ok(barVisible(s.hbar), '사전조건: #hbar 표시');
    await page.mouse.move(s.hbar.rect.left + s.hbar.rect.width / 2, s.hbar.rect.top + s.hbar.rect.height / 2);
    await page.mouse.wheel(0, 300);
    await settleScroll(page);
    const r = await snap(page);
    assert.ok(r.scrollTop >= 100 || r.scrollLeft >= 100, `#hbar 위의 휠이 콘텐츠를 스크롤하지 않음 (${r.scrollTop},${r.scrollLeft})`);
    obs.push(`#hbar 위: +300 → scrollTop ${r.scrollTop}, scrollLeft ${r.scrollLeft}`);
    await press(page, 'Control+0');
    for (const o of obs) c.obs(o);
  }),
  step('SBR-07', '가로 바는 확대로 가로 스크롤이 생길 때만 보이고(폭 맞춤·Ctrl+0 에서 숨김) 가로 썸 드래그가 1:1 로 맞다', '썸 이동 ±1.5px, 공식 ±1px', async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    let s = await barSnap(page);
    assert.ok(s.hbar, '#hbar 요소가 있어야 함');
    assert.ok(!barVisible(s.hbar), '폭 맞춤에서는 #hbar 숨김');
    assert.ok(s.scrollWidth <= s.clientWidth);
    await press(page, 'Control+Equal');
    await press(page, 'Control+Equal');
    s = await barSnap(page);
    assert.ok(s.scrollWidth > s.clientWidth + 100, '사전조건: 확대로 가로 스크롤 생김');
    assert.ok(barVisible(s.hbar), '가로 스크롤이 생기면 #hbar 표시');
    assertBarGeometry(s, '확대');
    assertThumb(s, 'x', `가로 바(확대 직후 scrollLeft=${s.scrollLeft})`);
    await setScroll(page, null, 0);
    s = await barSnap(page);
    assertThumb(s, 'x', '가로 바(scrollLeft 0)');
    // 드래그 1:1 (왼쪽 끝에서 시작해 +150px 까지 clamp 없이 이동할 여유가 있다)
    const T0 = s.hbar.thumb;
    const x0 = T0.left + T0.width / 2;
    const y = T0.top + T0.height / 2;
    const e0 = expectedThumb(s, 'x');
    const ratio = e0.max / e0.travel;
    await page.mouse.move(x0, y);
    await sleep(350);
    const base = await barSnap(page);
    const left0 = base.hbar.thumb.left;
    await page.mouse.down();
    const down = await snap(page);
    approx(down.scrollLeft, base.scrollLeft, SNAP_TOL, '누른 순간 scrollLeft 이 튐');
    let worst = 0;
    for (let k = 1; k <= 6; k++) {
      await page.mouse.move(x0 + k * 25, y);
      const sk = await barSnap(page);
      worst = Math.max(worst, Math.abs(sk.hbar.thumb.left - left0 - k * 25));
      approx(sk.hbar.thumb.left - left0, k * 25, DRAG_TOL, `가로 1:1 ${k}단계(마우스 ${k * 25}px)`);
      assertThumb(sk, 'x', `가로 드래그 ${k}단계`);
      approx(sk.scrollLeft - base.scrollLeft, k * 25 * ratio, ratio * DRAG_TOL + 1, `가로 드래그 ${k}단계 scrollLeft 이동량`);
    }
    await page.mouse.move(x0 + 150, y - 300);
    s = await barSnap(page);
    approx(s.hbar.thumb.left - left0, 150, DRAG_TOL, '바 밖(위쪽 콘텐츠)에서도 추적');
    assert.equal(s.scrollTop, base.scrollTop, '가로 바 드래그 중 세로 스크롤이 움직임');
    await page.mouse.move(base.innerW + 400, y);
    s = await barSnap(page);
    approx(s.scrollLeft, e0.max, DRAG_TOL, '창 오른쪽 밖으로 → 끝 clamp');
    await page.mouse.up();
    await press(page, 'Control+0');
    s = await barSnap(page);
    assert.ok(!barVisible(s.hbar), 'Ctrl+0 후 #hbar 숨김');
    await press(page, 'Control+1');
    s = await barSnap(page);
    assert.equal(barVisible(s.hbar), s.scrollWidth > s.clientWidth + 0.5, '100%(strip 800 < clientWidth 880)에서는 가로 스크롤이 없어 숨김');
    await press(page, 'Control+0');
    c.obs(`확대(×1.5625): #hbar 표시, 썸 길이 ${thumbLen(base.hbar, 'x').toFixed(1)}(공식 ${e0.len.toFixed(1)}), 드래그 25px×6단계 1:1 최대 오차 ${worst.toFixed(2)}px, 세로 불변, 바 밖·창 밖 추적·끝 clamp; Ctrl+0/Ctrl+1(100%) 후 숨김`);
  }),
  step('SBR-09', '줌·창 크기 변경 후에도 썸이 공식과 일치(세로·가로), 바 표시 여부 = 해당 축 스크롤 가능 여부, 임의 위치에서도 일치', `±${THUMB_TOL}px, 표시 여부 정확 일치`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const rows = [];
    const check = async (label, scrollFrac) => {
      await settleLayout(page, 250);
      let s = await barSnap(page);
      if (scrollFrac !== undefined) {
        await setScroll(page, Math.round((s.scrollHeight - s.clientHeight) * scrollFrac), scrollFrac > 0 && s.scrollWidth > s.clientWidth ? Math.round((s.scrollWidth - s.clientWidth) * scrollFrac) : null);
        s = await barSnap(page);
      }
      const vNeed = s.scrollHeight > s.clientHeight + 0.5;
      const hNeed = s.scrollWidth > s.clientWidth + 0.5;
      assert.equal(barVisible(s.vbar), vNeed, `${label}: #vbar 표시 여부(세로 스크롤 ${vNeed})`);
      assert.equal(barVisible(s.hbar), hNeed, `${label}: #hbar 표시 여부(가로 스크롤 ${hNeed})`);
      if (vNeed) assertThumb(s, 'y', `${label} 세로`);
      if (hNeed) assertThumb(s, 'x', `${label} 가로`);
      assertBarGeometry(s, label);
      rows.push(`${label}: 세로 ${vNeed ? `${thumbLen(s.vbar, 'y').toFixed(1)}` : '숨김'}/가로 ${hNeed ? `${thumbLen(s.hbar, 'x').toFixed(1)}` : '숨김'}`);
    };
    const ctrlWheelC = async (dy) => {
      const p = center(await snap(page));
      await ctrlWheel(page, p.x, p.y, dy);
    };
    const ops = [
      ['Ctrl+= 1', () => press(page, 'Control+Equal'), 0.5],
      ['Ctrl+= 2', () => press(page, 'Control+Equal'), 0.3],
      ['Ctrl+- 1', () => press(page, 'Control+Minus'), 0.7],
      ['Ctrl+0', () => press(page, 'Control+0'), 0.5],
      ['Ctrl+1', () => press(page, 'Control+1'), 0.9],
      ['Ctrl+휠 위', () => ctrlWheelC(-300), 0.5],
      ['Ctrl+휠 아래 ×2', async () => { await ctrlWheelC(300); await ctrlWheelC(300); }, 0.2],
      ['Ctrl+= 5(최대 근처)', async () => { for (let i = 0; i < 5; i++) await press(page, 'Control+Equal'); }, 0.6],
      ['Ctrl+0 복귀', () => press(page, 'Control+0'), 0],
    ];
    for (const [label, op, frac] of ops) {
      await op();
      await check(`줌 ${label}`);
      await check(`줌 ${label} @스크롤 ${frac}`, frac);
    }
    for (const [w, h] of [[700, 600], [1300, 850], [500, 420], [1000, 700]]) {
      await resizeTo(app, page, w, h);
      await check(`창 ${w}x${h}`);
      await check(`창 ${w}x${h} @스크롤 0.5`, 0.5);
    }
    await resizeTo(app, page, 900, 700);
    await press(page, 'Control+1');
    await check('창 900x700 Ctrl+1');
    await press(page, 'Control+0');
    await restoreSize(app, page);
    await check('원래 창');
    c.obs(`${rows.length}개 상태(줌 ${ops.length}종 + 창 크기 5종, 각각 맨 위·임의 위치) 모두 공식 일치. 예: ${rows.slice(0, 4).join(' | ')}`);
  }, 180000),
  step('SBR-09(로드)', '이미지가 로드되는 동안 썸 길이가 변하지 않음(헤더 크기를 아는 회차: 800×1200 10장, lazy 로드를 스크롤로 유도) + 매 프레임 위치 공식 일치', `썸 길이 변동 ≤ 0.5px, scrollHeight 변동 ≤ 2px, 위치 ±${SAMPLE_TOL}px`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await startSampler(page);
    await openViaMain(app, page, F.lazyDir);
    let s = await waitReady(page, { comic: 'lazy' });
    assert.equal(s.pages.length, 10);
    const notYet = s.pages.slice(4).filter((p) => !(p.complete && p.natW > 0)).length;
    assert.ok(notYet >= 3, `사전조건: 먼 장은 아직 로드되지 않아야 함(미로드 ${notYet}장) — lazy 로드 시험이 의미 없음`);
    const max = s.scrollHeight - s.clientHeight;
    for (let k = 0; k <= 12; k++) {
      await setScroll(page, Math.round((max * k) / 12), null);
      await sleep(150);
    }
    await setScroll(page, 0, null);
    await sleep(300);
    s = await waitSnap(page, (v) => v.pages.every((p) => p.complete && p.natW > 0), '모든 장 로드', 20000);
    const final = await barSnap(page);
    const samples = await stopSampler(page);
    const target = final.scrollHeight;
    const idx0 = samples.findIndex((x) => !x.hidden && Math.abs(x.scrollHeight - target) <= 2);
    assert.ok(idx0 >= 0, '새 회차의 첫 표본을 찾지 못함');
    const tail = samples.slice(idx0).filter((x) => !x.hidden && x.barH > 0);
    assert.ok(tail.length >= 30, `표본이 너무 적음 ${tail.length}`);
    const lens = tail.map((x) => x.thumbH);
    const spread = Math.max(...lens) - Math.min(...lens);
    assert.ok(spread <= 0.5, `로드 중 썸 길이가 변함: ${Math.min(...lens).toFixed(2)}~${Math.max(...lens).toFixed(2)}`);
    const shs = tail.map((x) => x.scrollHeight);
    assert.ok(Math.max(...shs) - Math.min(...shs) <= 2, `로드 중 scrollHeight 가 변함: ${Math.min(...shs)}~${Math.max(...shs)}`);
    const e = expectedThumb(final, 'y');
    assert.ok(e.len > THUMB_MIN + 5, `사전조건: 최소 길이에 걸리지 않는 회차여야 함(len=${e.len.toFixed(1)})`);
    approx(lens[0], e.len, THUMB_TOL, '첫 프레임부터 썸 길이가 최종 공식값');
    let worst = 0;
    for (const x of tail) worst = Math.max(worst, sampleError(x).dp);
    assert.ok(worst <= SAMPLE_TOL, `로드·스크롤 중 위치 오차 최대 ${worst.toFixed(2)}px`);
    c.obs(`lazy 10장(헤더 크기 사전 확정): 새 회차 첫 프레임부터 ${tail.length}프레임 동안 썸 길이 ${Math.min(...lens).toFixed(2)}~${Math.max(...lens).toFixed(2)}(공식 ${e.len.toFixed(1)}), scrollHeight ${Math.min(...shs)}~${Math.max(...shs)}, 위치 최대 오차 ${worst.toFixed(2)}px, 스크롤 훑기로 미로드 ${notYet}장 이상이 로드됨`);
  }, 90000),
  step('SBR-10', '호버·드래그 시 썸 두께 6 → 10(세로=폭, 가로=높이), 놓고 벗어나면 6 복귀, 바를 눌러도 키보드 포커스·입력(ArrowDown/Home/Ctrl+=)은 그대로', `두께 ±${THICK_TOL}px(전환 애니메이션 정착 대기 최대 1.5s)`, async (c) => {
    const { page, app } = c;
    await restoreSize(app, page);
    await resetView(page);
    const obs = [];
    const activeStart = (await snap(page)).active; // 바를 한 번도 누르기 전의 포커스 요소(아래 드래그·클릭 뒤에도 같아야 함)
    const thick = (s, axis) => (axis === 'y' ? s.vbar.thumb.width : s.hbar.thumb.height);
    const waitThick = (axis, want, desc) =>
      poll(async () => {
        const s = await snap(page);
        return Math.abs(thick(s, axis) - want) <= THICK_TOL ? s : null;
      }, { timeout: 1500, interval: 40, desc });
    let s = await barSnap(page);
    approx(thick(s, 'y'), THUMB_THIN, THICK_TOL, '평소 세로 썸 두께');
    let T = s.vbar.thumb;
    const x = T.left + T.width / 2;
    const y = T.top + T.height / 2;
    await page.mouse.move(x, y);
    await waitThick('y', THUMB_WIDE, '호버: 세로 썸 두께 10');
    await page.mouse.move(s.sr.left + 200, y);
    await waitThick('y', THUMB_THIN, '벗어남: 세로 썸 두께 6 복귀');
    await page.mouse.move(x, y);
    await waitThick('y', THUMB_WIDE, '다시 호버');
    await page.mouse.down();
    await page.mouse.move(s.sr.left + 200, y + 20);
    await sleep(500);
    s = await snap(page);
    approx(thick(s, 'y'), THUMB_WIDE, THICK_TOL, '드래그 중(포인터가 바를 벗어나도) 두께 10');
    await page.mouse.up();
    assert.equal((await snap(page)).active, activeStart, `썸 드래그로 포커스가 이동함 ${activeStart} → ${(await snap(page)).active}`);
    await waitThick('y', THUMB_THIN, '놓고 벗어난 뒤 두께 6 복귀');
    obs.push(`세로 썸: 평소 ${THUMB_THIN} → 호버 ${THUMB_WIDE} → 벗어나면 ${THUMB_THIN} → 드래그 중 ${THUMB_WIDE}(포인터가 바 밖) → 놓으면 ${THUMB_THIN}`);
    // 가로 바
    for (let i = 0; i < 2; i++) await press(page, 'Control+Equal');
    await setScroll(page, 0, 0);
    s = await barSnap(page);
    assert.ok(barVisible(s.hbar), '사전조건: #hbar 표시');
    approx(thick(s, 'x'), THUMB_THIN, THICK_TOL, '평소 가로 썸 두께');
    T = s.hbar.thumb;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2);
    await waitThick('x', THUMB_WIDE, '호버: 가로 썸 두께 10');
    await page.mouse.move(s.sr.left + 200, s.sr.top + 200);
    await waitThick('x', THUMB_THIN, '벗어남: 가로 썸 두께 6 복귀');
    obs.push(`가로 썸: 평소 ${THUMB_THIN} → 호버 ${THUMB_WIDE} → 벗어나면 ${THUMB_THIN}`);
    await press(page, 'Control+0');
    // 포커스·입력
    await resetView(page);
    const active0 = activeStart;
    s = await barSnap(page);
    T = s.vbar.thumb;
    await page.mouse.move(T.left + T.width / 2, T.top + T.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    const tr = trackOf(s.vbar, 'y');
    await page.mouse.move(s.vbar.rect.left + s.vbar.rect.width / 2, tr.start + tr.len * 0.8);
    await page.mouse.down();
    await page.mouse.up();
    s = await snap(page);
    assert.equal(s.active, active0, `바를 눌러 포커스가 이동함 ${active0} → ${s.active}`);
    await setScroll(page, 0, 0);
    await sleep(100);
    await press(page, 'ArrowDown');
    approx((await settleScroll(page)).top, 80, SCROLL_TOL, '바를 누른 뒤 ArrowDown 80px');
    await press(page, 'End');
    await settleScroll(page);
    await press(page, 'Home');
    assert.equal((await settleScroll(page)).top, 0, '바를 누른 뒤 Home');
    const z0 = (await snap(page)).scale;
    await press(page, 'Control+Equal');
    assert.ok((await snap(page)).scale > z0, '바를 누른 뒤 Ctrl+= 줌');
    await press(page, 'Control+0');
    obs.push(`바(썸·트랙) 클릭 전후 document.activeElement=${active0}→${active0} 불변, ArrowDown +80, End/Home, Ctrl+= 정상 동작`);
    for (const o of obs) c.obs(o);
  }, 90000),
]);

// =============================================================== SUITE: 짧은 콘텐츠 / 회차 전환 시 바 (SBR-08, SBR-09)
suite('sbr-short', () => F.short1Dir, [
  step('SBR-08', '콘텐츠가 뷰포트보다 짧으면 두 바가 숨겨지고(hidden) 스크롤되지 않으며, 확대로 세로 오버플로가 생기면 #vbar 가 나타나고 Ctrl+0 으로 다시 숨는다', '표시 여부 정확 일치', async (c) => {
    const { page } = c;
    let s = await barSnap(page);
    assert.ok(s.vbar && s.hbar, '#vbar/#hbar 요소가 있어야 함(숨김 상태)');
    assert.ok(s.scrollHeight <= s.clientHeight, `사전조건: 짧은 콘텐츠 scrollHeight=${s.scrollHeight} clientHeight=${s.clientHeight}`);
    assert.equal(barVisible(s.vbar), false, `짧은 콘텐츠에서 #vbar 가 보임: ${JSON.stringify({ hidden: s.vbar.hidden, rect: s.vbar.rect })}`);
    assert.equal(barVisible(s.hbar), false, `짧은 콘텐츠에서 #hbar 가 보임`);
    assert.equal(s.vbar.hiddenAttr || s.vbar.display === 'none', true, '숨김 = hidden 속성 또는 display:none');
    for (const k of ['PageDown', 'End', 'ArrowDown']) await press(page, k);
    await page.mouse.move(center(s).x, center(s).y);
    await page.mouse.wheel(0, 300);
    await sleep(250);
    assert.equal((await snap(page)).scrollTop, 0, '스크롤할 곳이 없는데 scrollTop 이 움직임');
    let steps = 0;
    for (; steps < 8; steps++) {
      await press(page, 'Control+Equal');
      s = await barSnap(page);
      if (s.scrollHeight > s.clientHeight + 0.5) break;
    }
    assert.ok(barVisible(s.vbar), `확대 ${steps + 1}회 후 세로 오버플로(scrollHeight ${s.scrollHeight} > ${s.clientHeight})인데 #vbar 가 숨겨져 있음`);
    assertThumb(s, 'y', '확대 후 세로');
    await press(page, 'Control+0');
    s = await barSnap(page);
    assert.equal(barVisible(s.vbar), false, 'Ctrl+0 후 #vbar 가 다시 숨겨지지 않음');
    assert.equal(barVisible(s.hbar), false);
    c.obs(`800×300 한 장: scrollHeight ${s.scrollHeight} ≤ clientHeight ${s.clientHeight} → 두 바 숨김(스크롤 입력 무반응), Ctrl+= ${steps + 1}회 → #vbar 표시·공식 일치, Ctrl+0 → 다시 숨김`);
  }),
], {});

suite('sbr-mixlen', () => F.mixlenDir, [
  step('SBR-09(회차 전환)', '회차를 옮기면 바 표시와 썸 길이가 새 회차에 맞게 갱신(짧은 1화=숨김 / 2화=길이 약 102 / 짧은 3화=숨김 / 4화=길이 약 51), 이동 직후 맨 위라 썸이 트랙 시작', `표시 여부 정확 일치, ±${THUMB_TOL}px`, async (c) => {
    const { page } = c;
    const rows = [];
    const sums = MIXLEN_EPS.map((e) => e.h.reduce((a, b) => a + b, 0));
    const visit = async (i, label) => {
      await gotoEpisode(page, i);
      await resetView(page);
      const s = await barSnap(page);
      const need = s.scrollHeight > s.clientHeight + 0.5;
      assert.equal(need, sums[i] * stripScale(s) > s.clientHeight + 0.5, `${label}: 사전조건(회차 길이 ${sums[i]})`);
      assert.equal(barVisible(s.vbar), need, `${label}: #vbar 표시 여부(세로 스크롤 ${need}, scrollHeight=${s.scrollHeight}, clientHeight=${s.clientHeight})`);
      assert.equal(barVisible(s.hbar), false);
      if (need) {
        assertThumb(s, 'y', `${label}(scrollTop 0)`);
        approx(s.vbar.thumb.top - s.vbar.rect.top, TRACK_PAD, THUMB_TOL, `${label}: 이동 직후 썸이 트랙 시작`);
        await setScroll(page, Math.round((s.scrollHeight - s.clientHeight) / 2), null);
        assertThumb(await barSnap(page), 'y', `${label}(중간)`);
        await setScroll(page, 0, null);
      }
      rows.push(`${label}: ${need ? `표시, 썸 길이 ${thumbLen(s.vbar, 'y').toFixed(1)}` : '숨김'}`);
    };
    for (const i of [0, 1, 2, 3]) await visit(i, `→ ${MIXLEN_EPS[i].name}`);
    for (const i of [2, 1, 0]) await visit(i, `← ${MIXLEN_EPS[i].name}`);
    c.obs(rows.join(' / '));
  }, 90000),
]);

// ---------------------------------------------------------------- 목록/보고
const TC_ORDER = [
  'EP-01', 'EP-02', 'EP-03', 'EP-04', 'EP-05', 'EP-06', 'EP-07', 'EP-08', 'EP-09', 'EP-10', 'EP-11', 'EP-12', 'EP-13', 'EP-14', 'EP-15',
  'SBR-01', 'SBR-02', 'SBR-03', 'SBR-04', 'SBR-05', 'SBR-06', 'SBR-07', 'SBR-08', 'SBR-09', 'SBR-10',
  'NAV-03', 'NAV-10', 'NAV-11',
  'DSP-01', 'DSP-02', 'DSP-03', 'DSP-04', 'DSP-05',
  'SCR-01', 'SCR-02', 'SCR-03', 'SCR-04', 'SCR-05', 'SCR-06', 'SCR-07', 'SCR-08', 'SCR-09',
  'ZM-01', 'ZM-02', 'ZM-03', 'ZM-04', 'ZM-05', 'ZM-06', 'ZM-07', 'ZM-08', 'ZM-09', 'ZM-10', 'ZM-11', 'ZM-12', 'ZM-13', 'ZM-14', 'ZM-15', 'ZM-16', 'ZM-17', 'ZM-18',
  'OPN-01', 'OPN-02', 'OPN-03', 'OPN-04', 'OPN-05', 'OPN-06', 'OPN-07', 'OPN-07a', 'OPN-08', 'OPN-08a', 'OPN-09', 'OPN-09a', 'OPN-10', 'OPN-11',
  'ERR-01', 'ERR-02', 'ERR-03', 'ERR-04', 'BIG-01', 'BIG-02', 'BIG-03',
  'STR-01', 'STR-02', 'STR-03', 'STR-04', 'STR-05', 'STR-06', 'STR-07', 'STR-08', 'STR-09', 'STR-10', 'STR-11', 'STR-12', 'STR-13', 'STR-14',
  'WIN-01', 'WIN-02', 'WIN-03', 'WIN-04', 'WIN-05', 'WIN-06', 'WIN-07', 'WIN-08', 'WIN-09', 'WIN-10', 'WIN-11', 'WIN-12', 'WIN-13', 'WIN-14', 'WIN-15', 'WIN-16', 'WIN-17', 'WIN-18',
  'LBX-01', 'LBX-02', 'LBX-03', 'LBX-04',
  'IMG-01', 'IMG-02', 'IMG-03', 'IMG-04',
  'SEC-01', 'SEC-02', 'SEC-03', 'SEC-04',
  'BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-05',
];
const MANUAL_TCS = {
  'SCR-09': '주 모니터(144Hz·배율 150%)에서 실제 키보드로 Space/Shift+Space/PageUp/PageDown 을 누르고 있을 때의 체감(끊김 없이 흐르는지, 뗀 뒤 짧게 감속하는지), 단발 PageDown 곡선 체감, 빠른 홀드 중 장 경계(특히 720×16383 WebP 다장)에서 디코드 공백(#181818 빈 화면)이 거슬리지 않는지 육안, 실제 웹툰 폴더로 확인. 사유: 테스트 창은 보조 모니터(170Hz·배율 1.0) 전용이라 주 모니터 주사율·배율 실물을 쓸 수 없고, 체감과 디코드 공백(화면 합성 결과)은 scrollTop 지표로 측정되지 않으며(CDP screencast 로 별도 관찰은 가능하나 합격 기준 아님), 실제 키 반복 지터는 CDP 입력으로 재현할 수 없음',
  'NAV-10': '사이드 버튼(뒤로/앞으로) 실기기 동작 = 회차 이동 (실제 마우스 하드웨어 필요)',
  'NAV-11': '←는 "현재 회차 맨 위"가 아니라 "이전 회차의 맨 위"로 이동하고 회차를 옮겨도 줌이 유지되는 점이 의도대로 느껴지는지 (사용성 확인)',
  'OPN-08': 'Ctrl+O(파일)·Ctrl+Shift+O(폴더) 네이티브 파일/폴더 선택 대화상자 실물 UI (OS 모달 대화상자. 자동 TC EP-15 는 dialog.showOpenDialog 를 목으로 대체해 호출 옵션만 확인)',
  'OPN-09': '탐색기에서 창으로 실제 드래그&드롭(만화 폴더·회차 폴더·이미지). 자동 TC OPN-09a 의 CDP 드래그 주입은 실제 OS 드래그 소스를 대체하지 못함. 인자 없이 실행한 뒤 폴더를 드롭했을 때 창 폭이 이미지 폭에 맞춰지는지 포함',
  'OPN-10': '설치 후 탐색기 연결 프로그램으로 열기 (설치·파일 연결 변경 필요). 열릴 때 창 폭이 이미지 폭에 맞는지 포함',
  'BLD-05': '설치·연결 등록·제거 (설치 파일 실행 필요)',
  'WIN-17': 'F11·최대화/복원·최소화/복원 후 위치·크기 유지, 최소화한 채로 첫 열기를 해도 크기가 바뀌지 않는지 (실제 창 필요)',
  'WIN-18': 'ready-to-show 폴백 타이머(5초): 창이 안 뜨는 상황을 만들 수 없어 코드 확인 + 수동 (OSR 복사본에서는 제거되어 자동 시험 불가)',
  'WIN-12': '창이 처음 표시될 때 크기 점프·흰 화면 깜빡임이 없는지 육안 확인 (show:false → ready-to-show)',
  'STR-14': '수십 장 폴더를 끝까지 훑은 뒤 렌더러·GPU 메모리(작업 관리자)가 허용 범위인지, 150% 배율 모니터에서 경계 틈이 없는지',
  'STR-13': '실제 분할 웹툰(예: 720×16383 WebP 수십 장) 회차 폴더를 열어 장 경계가 육안으로 이어지고 드래그·스크롤이 끊김 없는지 확인',
  'SBR-11': '실제 마우스로 썸을 잡고 끌 때의 체감(거칠기·점프·잡기 쉬움), 휠로 빠르게 스크롤할 때 썸이 콘텐츠와 같은 프레임으로 움직이는지(컴포지터 스레드 동기는 프레임 단위 육안), 호버 두께 변화·바 색 육안, 150% 배율 모니터에서의 바 두께',
};
const MAIN_CONFIRMED = ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04'];
const AUTO_TCS = TC_ORDER.filter((id) => !MANUAL_TCS[id] && !MAIN_CONFIRMED.includes(id) && id !== 'DSP-05');

async function runSuite(su, filter) {
  const rows = [];
  const arg = typeof su.arg === 'function' ? su.arg() : su.arg;
  const record = (st, status, ms, obs, error) => rows.push({ ids: st.ids, title: st.title, tol: st.tol, status, ms, obs, error });
  const selected = su.steps.filter((st) => !filter || st.ids.some((id) => filter.test(id)));
  if (selected.length === 0) return rows;
  console.log(`--- suite: ${su.name}`);
  if (OSR && OSR_SKIP_SUITES.has(su.name)) {
    for (const st of selected) {
      record(st, 'OSR-SKIP', 0, ['OSR 미실행(창 표시 위험 또는 DSF 강제 불가) — 실제 창 미검증']);
      console.log(`SKIP  ${st.ids.join('·').padEnd(13)} ${st.title} (OSR 미실행: 창 표시 위험/DSF 강제 불가)`);
    }
    return rows;
  }
  let h = null;
  if (!su.noApp) {
    try {
      h = await launchApp(arg);
    } catch (e) {
      for (const st of selected) {
        record(st, 'FAIL', 0, [], e);
        console.log(`FAIL  ${st.ids.join('·').padEnd(13)} ${st.title} (앱 기동 실패: ${String(e.message).split('\n')[0]})`);
      }
      return rows;
    }
  }
  let aborted = null;
  try {
    for (const st of selected) {
      if (aborted) { record(st, 'FAIL', 0, [], new Error(`suite 중단: ${aborted}`)); continue; }
      const obs = [];
      const c = { ...(h || {}), obs: (m) => obs.push(m) };
      const t0 = Date.now();
      let timer;
      try {
        const ret = await Promise.race([
          st.fn(c),
          new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`step 타임아웃 ${st.timeout}ms`), { timeout: true })), st.timeout); }),
        ]);
        record(st, ret && ret.manual ? 'MANUAL' : 'PASS', Date.now() - t0, obs);
      } catch (e) {
        record(st, 'FAIL', Date.now() - t0, obs, e);
        if (e && e.timeout) aborted = `${st.ids.join('·')} 타임아웃`;
      } finally {
        clearTimeout(timer);
      }
      const last = rows[rows.length - 1];
      console.log(`${last.status === 'PASS' ? 'PASS' : last.status === 'MANUAL' ? 'SHOT' : 'FAIL'}  ${st.ids.join('·').padEnd(13)} ${st.title} (${(last.ms / 1000).toFixed(1)}s)`);
      if (last.error) console.log(String(last.error.stack || last.error).split('\n').slice(0, 5).map((l) => `      ${l}`).join('\n'));
    }
    if (h && h.errors.length) {
      rendererErrorTotal += h.errors.length;
      rows.push({ ids: ['ALL'], title: `[${su.name}] 렌더러 pageerror/crash 없음`, tol: '-', status: 'FAIL', ms: 0, obs: [], error: new Error(h.errors.join('; ')) });
      console.log(`FAIL  ALL           [${su.name}] 렌더러 오류: ${h.errors.join('; ')}`);
    }
  } finally {
    if (h) await shutdown(h);
    if (aborted) for (const app of [...liveApps]) await closeApp(app);
  }
  return rows;
}

const mdEsc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function buildTable(results, filtered) {
  const lines = ['| TC ID | 결과 | 실제 관찰값 | 허용 오차 · 방법 |', '|---|---|---|---|'];
  const order = (r) => {
    const i = TC_ORDER.indexOf(baseId(r.ids[0]));
    return i < 0 ? 999 : i;
  };
  const sorted = results.map((r, i) => ({ r, i })).sort((a, b) => order(a.r) - order(b.r) || a.i - b.i).map((x) => x.r);
  for (const r of sorted) {
    const status = r.status === 'PASS' ? 'PASS' : r.status === 'MANUAL' ? '미검증(수동) — 스크린샷만 저장' : r.status === 'OSR-SKIP' ? 'OSR 미실행(창 표시 위험) — 실제 창 미검증' : 'FAIL';
    let obs = r.obs.join(' ; ');
    if (r.error) obs = `${obs ? `${obs} ; ` : ''}실패: ${String(r.error.message || r.error).split('\n')[0]}`;
    lines.push(`| ${r.ids.join('·')} ${mdEsc(r.title)} | ${status} | ${mdEsc(obs)} | ${mdEsc(r.tol)} |`);
  }
  if (!filtered) {
    for (const [id, why] of Object.entries(MANUAL_TCS)) {
      if (id === 'DSP-05') continue;
      lines.push(`| ${id} | 미검증(수동) | 자동화하지 않음 | ${why} |`);
    }
    for (const id of MAIN_CONFIRMED) lines.push(`| ${id} | 미실행(이 e2e 범위 밖 — 메인 에이전트가 확인) | - | plan.md §9 빌드 확인 항목 |`);
  }
  return lines.join('\n');
}

async function main() {
  const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'longroll-e2e-'));
  // 창을 띄우는 suite 가 하나라도 선택되면 보조 모니터 사전 점검(없으면 창을 하나도 띄우지 않고 중단). windowless suite(IMG: Electron 을 띄우지 않는 헤더 파서 단위 검증)만 선택된 경우에만 생략.
  const needsWindows = SUITES.some((su) => !su.windowless && su.steps.some((st) => !filter || st.ids.some((id) => filter.test(id))));
  if (needsWindows) preflightMonitors();
  else console.log('[safety] 선택된 suite 는 창을 띄우지 않음(windowless) — 모니터 사전 점검 생략');
  fs.rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const results = [];
  let leftover = [];
  let tmpRemoved = false;
  let fatal = null;
  try {
    const g0 = Date.now();
    try {
      genFixtures();
      console.log(`[fixtures] ${FX} (${Date.now() - g0}ms)`);
      if (process.env.LONGROLL_E2E_DUMP_FIXTURES) dumpFixtures(process.env.LONGROLL_E2E_DUMP_FIXTURES);
    } catch (e) {
      fatal = e;
      results.push({ ids: ['FX'], title: '픽스처 생성', tol: '-', status: 'FAIL', ms: Date.now() - g0, obs: [], error: e });
      console.log(`FAIL FX 픽스처 생성: ${e.message}`);
    }
    if (!fatal) {
      for (const su of SUITES) results.push(...(await runSuite(su, filter)));
    }
  } finally {
    for (const app of [...liveApps]) await closeApp(app);
    await sleep(800);
    try {
      for (let i = 0; i < 10; i++) {
        leftover = leftoverElectron();
        if (leftover.length === 0) break;
        await sleep(500);
      }
    } catch (e) { leftover = [`확인 실패: ${e.message}`]; }
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      tmpRemoved = !fs.existsSync(TMP);
    } catch (e) { note(`임시 폴더 삭제 실패: ${e.message}`); }
  }

  const covered = new Set(results.filter((r) => r.status !== undefined).flatMap((r) => r.ids.map(baseId)));
  const missing = filter ? [] : AUTO_TCS.filter((id) => !covered.has(id));
  const failed = results.filter((r) => r.status === 'FAIL');
  const passed = results.filter((r) => r.status === 'PASS');

  const table = buildTable(results, !!filter);
  console.log('\n==================== TC 결과 표 ====================');
  console.log(table);
  console.log(`\n합계: PASS ${passed.length} / FAIL ${failed.length} / 스크린샷 ${results.filter((r) => r.status === 'MANUAL').length} (step 단위, TC 기준 아님)`);
  const osrSkipped = results.filter((r) => r.status === 'OSR-SKIP');
  if (OSR) console.log(`OSR 개발 모드(실제 창 아님): 건너뛴 step ${osrSkipped.length}개 = ${osrSkipped.map((r) => r.ids.join('·')).join(', ') || '없음'} — 이 TC 들은 실제 창에서 미검증`);
  if (missing.length) console.log(`!! 결과 행이 없는 자동 TC: ${missing.join(', ')}`);
  if (notes.length) { console.log('\n--- 관찰/방법 기록 ---'); for (const n of notes) console.log(`- ${n}`); }
  if (artifacts.length) { console.log('\n--- 스크린샷 산출물 (DSP-05 수동 확인용, 실행 후 남김) ---'); for (const a of artifacts) console.log(`- ${a}`); }
  console.log('\n--- 정리 확인 ---');
  console.log(`- 남은 electron 프로세스(이 테스트가 띄운 것): ${leftover.length === 0 ? '없음' : leftover.join(', ')}`);
  console.log(`- 임시 픽스처 폴더 삭제: ${tmpRemoved ? '완료' : '실패/잔존'}`);
  console.log(`- 렌더러 pageerror/crash 수집 건수: ${rendererErrorTotal}`);
  console.log(`- 보조 모니터 안전장치: 창 위치 단언 ${safety.checks}회 전부 통과(실패 시 즉시 중단), 폴백 setPosition 사용 ${safety.moved}회${OSR ? `, [OSR] 창 미표시 단언 ${safety.checks}회, show/focus/setFullScreen/maximize 무동작 가드 ${safety.osrGuards || 0}회` : ''}`);
  for (const p of safety.probes) console.log(`    · ${p}`);
  for (const r of safety.rows.slice(0, 6)) console.log(`    · ${r}`);
  if (safety.rows.length > 6) console.log(`    · ... 외 ${safety.rows.length - 6}건 (마지막: ${safety.rows[safety.rows.length - 1]})`);
  try {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'results.md'), `${table}\n`, 'utf8');
    console.log(`- 결과 표 저장: ${path.join(ARTIFACT_DIR, 'results.md')}`);
  } catch { /* ignore */ }

  let code = failed.length > 0 || missing.length > 0 || leftover.length > 0 || !tmpRemoved ? 1 : 0;
  if (results.length === 0) code = 1;
  await sleep(100);
  process.exit(code);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
