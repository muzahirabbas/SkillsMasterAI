import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { initDatabase, getDatabase } from './services/database'
import { scanLibrary, setupLibraryIpcHandlers } from './services/library'
import { setupAttachmentIpcHandlers } from './services/attachment'
import { setupAiIpcHandlers } from './services/ai'
import { setupRegistryIpcHandlers } from './services/registry'
import { setupSettingsIpcHandlers } from './services/settings'
import { setupSkillPackIpcHandlers } from './services/skillpack'
import { setupImportIpcHandlers } from './services/import'

// Helper to auto-save project to connected projects list
function saveProjectToHistory(projPath: string) {
    try {
        const db = getDatabase()
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('connectedProjects') as { value: string }
        let projects = row ? JSON.parse(row.value) : []
        
        if (!projects.find(p => p.path === projPath)) {
            const name = path.basename(projPath) || projPath
            projects.push({ name, path: projPath })
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('connectedProjects', JSON.stringify(projects))
        }
    } catch (e) {
        console.error('Failed to auto-add project to history:', e)
    }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Reconstruct path from args (might be split if quoting fails)
    const args = process.argv.slice(is.dev ? 2 : 1)
    let activePath: string | null = null
    
    // Safety net: iterate through arguments and try to find/build a valid path
    for (let i = 0; i < args.length; i++) {
        let currentTry = args[i]
        // If it looks like a path and exists, we take it
        if (fs.existsSync(currentTry) && (currentTry.includes('\\') || currentTry.includes('/'))) {
            activePath = currentTry
            break
        }
        // If not, try joining with next args (up to 10) to see if a split path exists
        for (let j = i + 1; j < Math.min(i + 10, args.length); j++) {
            currentTry += ' ' + args[j]
            if (fs.existsSync(currentTry)) {
                activePath = currentTry
                i = j // skip joined args
                break
            }
        }
        if (activePath) break
    }

    if (activePath) {
      mainWindow.webContents.send('active-project-path', activePath)
      saveProjectToHistory(activePath)
    }
    
    // Also handle direct fetch
    ipcMain.handle('getActiveProjectPath', () => activePath)
    ipcMain.handle('setActiveProjectPath', (_event, path: string, shouldSave = true) => {
      activePath = path
      if (shouldSave) saveProjectToHistory(path)
      // Notify all windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('active-project-path', path)
      })
      return true
    })
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('dialog:selectDirectory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) return null
    const result = await dialog.showOpenDialog(browserWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  try {
    initDatabase()
    scanLibrary()
    setupLibraryIpcHandlers()
    setupAttachmentIpcHandlers()
    setupAiIpcHandlers()
    setupRegistryIpcHandlers()
    setupSettingsIpcHandlers()
    setupSkillPackIpcHandlers()
    setupImportIpcHandlers()
    console.log('Database and Library initialized successfully')
  } catch (err) {
    console.error('Failed to initialize database', err)
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
