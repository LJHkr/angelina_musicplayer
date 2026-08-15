/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const smokeTest = process.argv.includes("--smoke-test");
const memorySmokeWrite = process.argv.includes("--memory-smoke-write");
const memorySmokeRead = process.argv.includes("--memory-smoke-read");
const persistenceSmoke = memorySmokeWrite || memorySmokeRead;
let mainWindow = null;
let smokeTimer = null;

app.setName("InkTune");
app.setAppUserModelId("com.inktune.player");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus"]);

function getLibraryFilePath() {
  return smokeTest || persistenceSmoke
    ? path.join(app.getPath("temp"), "inktune-smoke-library.json")
    : path.join(app.getPath("userData"), "library.json");
}

function describeAudioPath(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return null;
  if (!AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;

  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return null;
    return {
      name: path.basename(filePath),
      filePath,
      url: pathToFileURL(filePath).href,
      size: stats.size,
      lastModified: stats.mtimeMs,
    };
  } catch {
    return null;
  }
}

function loadLibraryMemory() {
  const emptyMemory = { tracks: [], currentTrackId: null, missingCount: 0 };
  const libraryFilePath = getLibraryFilePath();
  if (!fs.existsSync(libraryFilePath)) return emptyMemory;

  try {
    const stored = JSON.parse(fs.readFileSync(libraryFilePath, "utf8"));
    const storedTracks = Array.isArray(stored?.tracks) ? stored.tracks : [];
    const tracks = [];
    let missingCount = 0;

    for (const item of storedTracks) {
      const descriptor = describeAudioPath(item?.filePath);
      if (!descriptor) {
        missingCount += 1;
        continue;
      }
      const fallbackTitle = descriptor.name.replace(/\.[^.]+$/, "") || "未命名曲目";
      tracks.push({
        id: typeof item.id === "string" && item.id ? item.id : `${descriptor.filePath}-${descriptor.lastModified}`,
        title: typeof item.title === "string" && item.title ? item.title : fallbackTitle,
        artist: typeof item.artist === "string" && item.artist ? item.artist : "本地收藏",
        filePath: descriptor.filePath,
        url: descriptor.url,
        size: descriptor.size,
        lastModified: descriptor.lastModified,
      });
    }

    const currentTrackId = typeof stored?.currentTrackId === "string" &&
      tracks.some((track) => track.id === stored.currentTrackId)
      ? stored.currentTrackId
      : null;
    return { tracks, currentTrackId, missingCount };
  } catch {
    return emptyMemory;
  }
}

function saveLibraryMemory(memory) {
  const incomingTracks = Array.isArray(memory?.tracks) ? memory.tracks : [];
  const tracks = incomingTracks.flatMap((item) => {
    const descriptor = describeAudioPath(item?.filePath);
    if (!descriptor) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `${descriptor.filePath}-${descriptor.lastModified}`,
      title: typeof item.title === "string" && item.title ? item.title : descriptor.name.replace(/\.[^.]+$/, ""),
      artist: typeof item.artist === "string" && item.artist ? item.artist : "本地收藏",
      filePath: descriptor.filePath,
      size: descriptor.size,
      lastModified: descriptor.lastModified,
    }];
  });
  const currentTrackId = typeof memory?.currentTrackId === "string" &&
    tracks.some((track) => track.id === memory.currentTrackId)
    ? memory.currentTrackId
    : null;
  const libraryFilePath = getLibraryFilePath();
  fs.mkdirSync(path.dirname(libraryFilePath), { recursive: true });
  fs.writeFileSync(libraryFilePath, JSON.stringify({ version: 1, currentTrackId, tracks }, null, 2), "utf8");
  return true;
}

function getMemorySmokeAudioPath() {
  return path.join(app.getPath("temp"), "inktune-memory-smoke.mp3");
}

function cleanupSmokeLibrary() {
  if (!smokeTest && !persistenceSmoke) return;
  try { fs.rmSync(getLibraryFilePath(), { force: true }); } catch { /* best-effort smoke cleanup */ }
  try { fs.rmSync(getMemorySmokeAudioPath(), { force: true }); } catch { /* best-effort smoke cleanup */ }
}

function runMemorySmokeWrite() {
  cleanupSmokeLibrary();
  const audioPath = getMemorySmokeAudioPath();
  fs.writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]));
  const saved = saveLibraryMemory({
    currentTrackId: "memory-smoke-track",
    tracks: [{
      id: "memory-smoke-track",
      title: "Memory Smoke",
      artist: "InkTune",
      filePath: audioPath,
      size: 10,
      lastModified: Date.now(),
    }],
  });
  return saved && fs.existsSync(getLibraryFilePath());
}

function runMemorySmokeRead() {
  const memory = loadLibraryMemory();
  const expectedUrl = pathToFileURL(getMemorySmokeAudioPath()).href;
  const ready = memory.tracks.length === 1 &&
    memory.tracks[0].id === "memory-smoke-track" &&
    memory.tracks[0].url === expectedUrl &&
    memory.currentTrackId === "memory-smoke-track" &&
    memory.missingCount === 0;
  cleanupSmokeLibrary();
  return ready;
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  mainWindow = new BrowserWindow({
    width: 530,
    height: 940,
    minWidth: 360,
    minHeight: 560,
    frame: false,
    thickFrame: true,
    show: !smokeTest,
    backgroundColor: "#f8d7c3",
    autoHideMenuBar: true,
    icon: iconPath,
    title: "InkTune 手绘音乐播放器",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  const entryPath = path.join(__dirname, "..", "desktop-dist", "index.html");

  if (smokeTest) {
    smokeTimer = setTimeout(() => app.exit(4), 15000);
    mainWindow.webContents.once("did-fail-load", () => {
      clearTimeout(smokeTimer);
      app.exit(3);
    });
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        mainWindow.setSize(360, 560);
        const diagnostics = await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => window.setTimeout(async () => {
            const shell = document.querySelector('.desktop-shell');
            const card = document.querySelector('.player-card');
            const cardRect = card?.getBoundingClientRect();
            const cardStyle = card ? getComputedStyle(card) : null;
            const shellStyle = shell ? getComputedStyle(shell) : null;
            const visualScale = cardRect ? cardRect.width / 476 : 1;
            const pinned = await window.inkTuneDesktop?.toggleAlwaysOnTop();
            const persistenceSaved = await window.inkTuneDesktop?.saveLibrary({ tracks: [], currentTrackId: null });
            const restoredMemory = await window.inkTuneDesktop?.loadLibrary();
            resolve({
              hasShell: Boolean(shell),
              hasCard: Boolean(card),
              hasTitle: document.body.innerText.includes('InkTune'),
              windowControlCount: document.querySelectorAll('.window-controls button').length,
              desktopApiReady: [
                'chooseAudioFiles', 'describeDroppedFile', 'loadLibrary', 'saveLibrary',
                'toggleAlwaysOnTop', 'minimize', 'toggleMaximize', 'close',
              ].every((name) => typeof window.inkTuneDesktop?.[name] === 'function'),
              persistenceReady: persistenceSaved === true && Array.isArray(restoredMemory?.tracks),
              pinned,
              visualScale,
              cardRect: cardRect ? {
                left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom,
                width: cardRect.width, height: cardRect.height,
              } : null,
              viewport: { width: window.innerWidth, height: window.innerHeight },
              appRegion: shellStyle?.getPropertyValue('-webkit-app-region') || '',
              htmlOverflow: getComputedStyle(document.documentElement).overflow,
              bodyOverflow: getComputedStyle(document.body).overflow,
              userSelect: cardStyle?.userSelect || '',
            });
          }, 250))
        `);
        const ready = Boolean(
          diagnostics.hasShell && diagnostics.hasCard && diagnostics.hasTitle &&
          diagnostics.windowControlCount === 4 && diagnostics.desktopApiReady &&
          diagnostics.persistenceReady && diagnostics.pinned === true &&
          diagnostics.visualScale < 0.8 && diagnostics.cardRect &&
          diagnostics.cardRect.left >= 0 && diagnostics.cardRect.top >= 0 &&
          diagnostics.cardRect.right <= diagnostics.viewport.width &&
          diagnostics.cardRect.bottom <= diagnostics.viewport.height &&
          diagnostics.appRegion === 'drag' &&
          diagnostics.htmlOverflow === 'hidden' && diagnostics.bodyOverflow === 'hidden' &&
          diagnostics.userSelect === 'none'
        );
        cleanupSmokeLibrary();
        clearTimeout(smokeTimer);
        app.exit(ready ? 0 : 2);
      } catch {
        cleanupSmokeLibrary();
        clearTimeout(smokeTimer);
        app.exit(2);
      }
    });
  }

  void mainWindow.loadFile(entryPath);
  mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("library:choose-audio", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "选择本地音乐",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "音频文件", extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"] }],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  return result.filePaths.map(describeAudioPath).filter(Boolean);
});

ipcMain.handle("library:describe-path", (_event, filePath) => describeAudioPath(filePath));
ipcMain.handle("library:load", () => loadLibraryMemory());
ipcMain.handle("library:save", (_event, memory) => saveLibraryMemory(memory));

ipcMain.handle("window:toggle-always-on-top", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  const next = !window.isAlwaysOnTop();
  window.setAlwaysOnTop(next);
  return next;
});

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    if (memorySmokeWrite) {
      app.exit(runMemorySmokeWrite() ? 0 : 5);
      return;
    }
    if (memorySmokeRead) {
      app.exit(runMemorySmokeRead() ? 0 : 6);
      return;
    }

    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => app.quit());
