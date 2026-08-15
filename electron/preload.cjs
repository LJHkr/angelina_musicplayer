/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("inkTuneDesktop", {
  chooseAudioFiles: () => ipcRenderer.invoke("library:choose-audio"),
  describeDroppedFile: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) return Promise.resolve(null);
    return ipcRenderer.invoke("library:describe-path", filePath);
  },
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  saveLibrary: (memory) => ipcRenderer.invoke("library:save", memory),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggle-always-on-top"),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
});
