const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { readImageSize } = require('./imagesize');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const LETTERBOX_RATIO = 1.1;
const MAX_EPISODE_DELTA = 1000000;
const DEFAULT_CONTENT_SIZE = { width: 1100, height: 820 };
const WORK_AREA_MARGIN = { width: 16, height: 60 };
const SHOW_FALLBACK_MS = 5000;

if (process.env.LONGROLL_USER_DATA) {
  app.setPath('userData', process.env.LONGROLL_USER_DATA);
}
app.setAppUserModelId('com.longroll.viewer');

let mainWindow = null;
let initialState = null;
let rendererReady = false;
let contentSized = false;
let emptyStartSize = null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function sortNames(names) {
  return names.sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}

function referenceWidth(files) {
  const counts = new Map();
  for (const f of files) if (f.w > 0) counts.set(f.w, (counts.get(f.w) || 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [w, n] of counts) {
    if (n > bestCount) {
      best = w;
      bestCount = n;
    }
  }
  return best;
}

const samePath = (a, b) => a.toLowerCase() === b.toLowerCase();

function hasImage(dir) {
  let handle;
  try {
    handle = fs.opendirSync(dir);
  } catch {
    return false;
  }
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) return true;
    }
  } catch {
    /* 읽는 도중 오류는 이미지 없음으로 본다 */
  } finally {
    try {
      handle.closeSync();
    } catch {
      /* ignore */
    }
  }
  return false;
}

function scanEpisodes(comicDir) {
  let entries;
  try {
    entries = fs.readdirSync(comicDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries.filter((d) => d.isDirectory() && hasImage(path.join(comicDir, d.name))).map((d) => d.name);
  sortNames(names);
  return names.map((name) => ({ name, path: path.join(comicDir, name) }));
}

function comicInfo(dir) {
  return { name: path.basename(dir) || path.parse(dir).root || dir, dir };
}

function siblingEpisodes(episodeDir) {
  const comicDir = path.dirname(episodeDir);
  let episodes = comicDir === episodeDir ? [] : scanEpisodes(comicDir);
  let episode = episodes.findIndex((e) => samePath(e.path, episodeDir));
  if (episode < 0) {
    episodes = [{ name: path.basename(episodeDir) || episodeDir, path: episodeDir }];
    episode = 0;
  }
  return { comicDir, episodes, episode };
}

function loadEpisode(dir) {
  let names;
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && IMAGE_EXTS.has(path.extname(d.name).toLowerCase()))
      .map((d) => d.name);
  } catch {
    return { error: 'unreadable', path: dir };
  }
  if (names.length === 0) return { error: 'empty', path: dir };
  sortNames(names);

  const files = names.map((name) => {
    const full = path.join(dir, name);
    const size = readImageSize(full);
    return { name, path: full, url: pathToFileURL(full).href, w: size ? size.w : 0, h: size ? size.h : 0 };
  });
  return { dir, files, refWidth: referenceWidth(files), letterbox: LETTERBOX_RATIO };
}

function buildState(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return { error: 'not-found', path: target };
  }

  const isDir = stat.isDirectory();
  let comicDir = null;
  let episodes = null;
  let episode = 0;
  let episodeDir;
  if (isDir) {
    const subs = scanEpisodes(target);
    if (subs.length > 0) {
      comicDir = target;
      episodes = subs;
      episodeDir = subs[0].path;
    } else {
      episodeDir = target;
    }
  } else {
    episodeDir = path.dirname(target);
  }

  const loaded = loadEpisode(episodeDir);
  if (loaded.error) return loaded;

  let index = 0;
  if (!isDir) {
    index = loaded.files.findIndex((f) => samePath(f.path, target));
    if (index < 0) return { error: 'unsupported', path: target };
  }
  if (!episodes) ({ comicDir, episodes, episode } = siblingEpisodes(episodeDir));
  return { comic: comicInfo(comicDir), episodes, episode, ...loaded, index };
}

function goEpisode(fromPath, delta) {
  if (typeof fromPath !== 'string' || !fromPath) return { error: 'not-found', path: '' };
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_EPISODE_DELTA) {
    return { error: 'invalid', path: fromPath };
  }
  const from = path.resolve(fromPath);
  const comicDir = path.dirname(from);
  const episodes = comicDir === from ? [] : scanEpisodes(comicDir);
  if (episodes.length === 0) return { error: 'empty', path: comicDir };

  const current = episodes.findIndex((e) => samePath(e.path, from));
  let target;
  if (current >= 0) {
    target = clamp(current + delta, 0, episodes.length - 1);
    if (target === current) {
      return { edge: delta < 0 ? 'first' : 'last', comic: comicInfo(comicDir), episodes, episode: current };
    }
  } else {
    const name = path.basename(from);
    const before = episodes.filter((e) => collator.compare(e.name, name) < 0).length;
    target = clamp(delta > 0 ? before + delta - 1 : before + delta, 0, episodes.length - 1);
  }

  const loaded = loadEpisode(episodes[target].path);
  if (loaded.error) return loaded;
  return { comic: comicInfo(comicDir), episodes, episode: target, ...loaded, index: 0 };
}

function pickPathFromArgs(argv, cwd) {
  const appPath = path.resolve(app.getAppPath());
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const full = path.resolve(cwd, arg);
    if (full === appPath) continue;
    try {
      fs.statSync(full);
      return full;
    } catch {
      /* not a path */
    }
  }
  return null;
}

function windowPosition() {
  const [x, y] = (process.env.LONGROLL_WINDOW_POS || '').split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : {};
}

function initialContentSize(state, point) {
  const display = point ? screen.getDisplayNearestPoint(point) : screen.getPrimaryDisplay();
  const area = display.workArea;
  let { width, height } = DEFAULT_CONTENT_SIZE;
  if (state && state.refWidth > 0) width = Math.round(state.refWidth * LETTERBOX_RATIO);
  return {
    width: Math.min(width, area.width - WORK_AREA_MARGIN.width),
    height: Math.min(height, area.height - WORK_AREA_MARGIN.height),
  };
}

function fitContentSize(win, width, height) {
  win.setContentSize(width, height);
  const [cw, ch] = win.getContentSize();
  if (cw === width && ch === height) return;
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: b.width + (width - cw), height: b.height + (height - ch) });
}

function sizeWindowForContent(win, state) {
  if (contentSized || !win || win.isDestroyed() || !state || state.error) return;
  contentSized = true;
  if (!emptyStartSize || win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
  const [cw, ch] = win.getContentSize();
  if (Math.abs(cw - emptyStartSize.width) > 2 || Math.abs(ch - emptyStartSize.height) > 2) return;

  const before = win.getBounds();
  const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  const next = initialContentSize(state, center);
  fitContentSize(win, next.width, next.height);
  const after = win.getBounds();
  const area = screen.getDisplayNearestPoint(center).workArea;
  win.setBounds({
    x: clamp(Math.round(before.x + (before.width - after.width) / 2), area.x, area.x + area.width - after.width),
    y: clamp(Math.round(before.y + (before.height - after.height) / 2), area.y, area.y + area.height - after.height),
    width: after.width,
    height: after.height,
  });
}

function createWindow() {
  const position = windowPosition();
  const contentSize = initialContentSize(initialState, 'x' in position ? position : null);
  contentSized = Boolean(initialState && !initialState.error);
  emptyStartSize = contentSized ? null : contentSize;
  mainWindow = new BrowserWindow({
    ...contentSize,
    useContentSize: true,
    show: false,
    ...position,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    title: 'Longroll',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  fitContentSize(mainWindow, contentSize.width, contentSize.height);
  const showWindow = () => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once('ready-to-show', showWindow);
  setTimeout(showWindow, SHOW_FALLBACK_MS).unref();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') mainWindow.webContents.send('viewer:nav', -1);
    else if (cmd === 'browser-forward') mainWindow.webContents.send('viewer:nav', 1);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('viewer:get-initial', () => {
  rendererReady = true;
  const state = initialState;
  initialState = null;
  sizeWindowForContent(mainWindow, state);
  return state;
});

ipcMain.handle('viewer:open-path', (_e, target) => {
  if (typeof target !== 'string' || !target) return { error: 'not-found', path: '' };
  const state = buildState(path.resolve(target));
  sizeWindowForContent(mainWindow, state);
  return state;
});

ipcMain.handle('viewer:go-episode', (_e, fromPath, delta) => goEpisode(fromPath, delta));

ipcMain.handle('viewer:open-dialog', async (e, opts) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const options =
    opts && opts.directory
      ? { properties: ['openDirectory'] }
      : {
          properties: ['openFile'],
          filters: [
            { name: 'Images', extensions: [...IMAGE_EXTS].map((x) => x.slice(1)) },
            { name: 'All files', extensions: ['*'] },
          ],
        };
  const result = await dialog.showOpenDialog(win, options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const state = buildState(result.filePaths[0]);
  sizeWindowForContent(win, state);
  return state;
});

ipcMain.handle('viewer:toggle-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.handle('viewer:exit-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && win.isFullScreen()) win.setFullScreen(false);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    const target = pickPathFromArgs(argv, cwd);
    const state = target ? buildState(target) : null;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (!state) return;
    sizeWindowForContent(mainWindow, state);
    if (rendererReady && mainWindow) mainWindow.webContents.send('viewer:open', state);
    else initialState = state;
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const target = pickPathFromArgs(process.argv, process.cwd());
    if (!initialState && target) initialState = buildState(target);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
