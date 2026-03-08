"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  db: {
    getSkills: () => electron.ipcRenderer.invoke("db:getSkills"),
    getVersions: (skillId) => electron.ipcRenderer.invoke("db:getVersions", skillId),
    getRecentInstalls: () => electron.ipcRenderer.invoke("db:getRecentInstalls"),
    scanLibrary: () => electron.ipcRenderer.invoke("db:scanLibrary"),
    attachSkill: (skillId) => electron.ipcRenderer.invoke("attachSkill", skillId),
    deleteSkill: (skillId) => electron.ipcRenderer.invoke("deleteSkill", skillId),
    unsyncSkill: (skillId, targetPath) => electron.ipcRenderer.invoke("unsyncSkill", skillId, targetPath),
    generateSkill: (req) => electron.ipcRenderer.invoke("generateSkill", req),
    generateIdeas: (req) => electron.ipcRenderer.invoke("generateIdeas", req),
    refactorSkill: (req) => electron.ipcRenderer.invoke("refactorSkill", req),
    previewRefactorSkill: (req) => electron.ipcRenderer.invoke("previewRefactorSkill", req),
    commitRefactorSkill: (req) => electron.ipcRenderer.invoke("commitRefactorSkill", req),
    selectDirectory: () => electron.ipcRenderer.invoke("dialog:selectDirectory"),
    installContextMenu: () => electron.ipcRenderer.invoke("installContextMenu"),
    uninstallContextMenu: () => electron.ipcRenderer.invoke("uninstallContextMenu"),
    scanActiveProject: (path) => electron.ipcRenderer.invoke("scanActiveProject", path),
    getActiveProjectPath: () => electron.ipcRenderer.invoke("getActiveProjectPath"),
    setActiveProjectPath: (path, save) => electron.ipcRenderer.invoke("setActiveProjectPath", path, save),
    getSetting: (key) => electron.ipcRenderer.invoke("getSetting", key),
    setSetting: (key, value) => electron.ipcRenderer.invoke("setSetting", key, value),
    syncSkillToTarget: (skillId, targetPath) => electron.ipcRenderer.invoke("syncSkillToTarget", skillId, targetPath),
    resolvePath: (inputPath) => electron.ipcRenderer.invoke("resolvePath", inputPath),
    exportSkillPack: (skillIds) => electron.ipcRenderer.invoke("exportSkillPack", skillIds),
    importSkillPack: () => electron.ipcRenderer.invoke("importSkillPack"),
    importSkillFromFolder: () => electron.ipcRenderer.invoke("importSkillFromFolder"),
    importFromAgent: (agentName, agentPath) => electron.ipcRenderer.invoke("importFromAgent", agentName, agentPath)
  },
  onActiveProject: (callback) => {
    electron.ipcRenderer.removeAllListeners("active-project-path");
    const handler = (_event, path) => callback(path);
    electron.ipcRenderer.on("active-project-path", handler);
    return () => electron.ipcRenderer.removeListener("active-project-path", handler);
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
