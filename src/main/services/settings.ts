import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import os from 'os'
import path from 'path'

export function setupSettingsIpcHandlers() {
  ipcMain.handle('getSetting', (_, key: string) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string }
    return row ? row.value : null
  })

  ipcMain.handle('setSetting', (_, key: string, value: string) => {
    const db = getDatabase()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    return true
  })

  ipcMain.handle('selectDirectory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) return null
    
    const result = await dialog.showOpenDialog(browserWindow, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('resolvePath', (_, inputPath: string) => {
    if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
      return path.join(os.homedir(), inputPath.slice(2))
    }
    return inputPath
  })
}
