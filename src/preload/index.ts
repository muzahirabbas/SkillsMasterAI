import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    getSkills: () => ipcRenderer.invoke('db:getSkills'),
    getVersions: (skillId: string) => ipcRenderer.invoke('db:getVersions', skillId),
    getRecentInstalls: () => ipcRenderer.invoke('db:getRecentInstalls'),
    scanLibrary: () => ipcRenderer.invoke('db:scanLibrary'),
    attachSkill: (skillId: string) => ipcRenderer.invoke('attachSkill', skillId),
    deleteSkill: (skillId: string) => ipcRenderer.invoke('deleteSkill', skillId),
    unsyncSkill: (skillId: string, targetPath: string) => ipcRenderer.invoke('unsyncSkill', skillId, targetPath),
    generateSkill: (req: any) => ipcRenderer.invoke('generateSkill', req),
    generateIdeas: (req: any) => ipcRenderer.invoke('generateIdeas', req),
    refactorSkill: (req: any) => ipcRenderer.invoke('refactorSkill', req),
    previewRefactorSkill: (req: any) => ipcRenderer.invoke('previewRefactorSkill', req),
    commitRefactorSkill: (req: any) => ipcRenderer.invoke('commitRefactorSkill', req),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    installContextMenu: () => ipcRenderer.invoke('installContextMenu'),
    uninstallContextMenu: () => ipcRenderer.invoke('uninstallContextMenu'),
    scanActiveProject: (path: string) => ipcRenderer.invoke('scanActiveProject', path),
    getActiveProjectPath: () => ipcRenderer.invoke('getActiveProjectPath'),
    setActiveProjectPath: (path: string, save?: boolean) => ipcRenderer.invoke('setActiveProjectPath', path, save),
    getSetting: (key: string) => ipcRenderer.invoke('getSetting', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('setSetting', key, value),
    syncSkillToTarget: (skillId: string, targetPath: string) => ipcRenderer.invoke('syncSkillToTarget', skillId, targetPath),
    resolvePath: (inputPath: string) => ipcRenderer.invoke('resolvePath', inputPath),
    exportSkillPack: (skillIds: string[]) => ipcRenderer.invoke('exportSkillPack', skillIds),
    importSkillPack: () => ipcRenderer.invoke('importSkillPack'),
    importSkillFromFolder: () => ipcRenderer.invoke('importSkillFromFolder'),
    importFromAgent: (agentName: string, agentPath: string) => ipcRenderer.invoke('importFromAgent', agentName, agentPath),
  },
  onActiveProject: (callback: (path: string) => void) => {
    // Remove any previous listeners to prevent duplicates on re-renders
    ipcRenderer.removeAllListeners('active-project-path')
    const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
    ipcRenderer.on('active-project-path', handler)
    // Return cleanup so callers can unsubscribe (e.g. useEffect return)
    return () => ipcRenderer.removeListener('active-project-path', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
