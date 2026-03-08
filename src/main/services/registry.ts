import { ipcMain } from 'electron'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'

// Helper to execute bash/cmd
function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve(stdout || stderr)
      }
    })
  })
}

export function setupRegistryIpcHandlers() {
  ipcMain.handle('installContextMenu', async () => {
    try {
      if (process.platform !== 'win32') return { success: false, error: 'Context menu integration is only supported on Windows.' }

      const exePath = process.execPath
      
      // We only want to install this for the built executable, but handling dev paths works similarly with electron.exe
      // The quoting is important for Windows Registry
      
      const keyPath = `HKCU\\Software\\Classes\\Directory\\shell\\SkillsMaster`
      const commandPath = `${keyPath}\\command`
      
      const appName = "Open with SkillsMaster"
      const iconPath = `\\"${exePath}\\",0` // Use main exe icon
      const executeCommand = `\\"${exePath}\\" \\"%1\\"` // %1 is the directory path passed by Windows

      // 1. Add top level key with name
      await execPromise(`reg add "${keyPath}" /ve /t REG_SZ /d "${appName}" /f`)
      
      // 2. Add icon
      await execPromise(`reg add "${keyPath}" /v "Icon" /t REG_SZ /d "${iconPath}" /f`)
      
      // 3. Add command
      await execPromise(`reg add "${commandPath}" /ve /t REG_SZ /d "${executeCommand}" /f`)

      // Add to directory background (right click inside folder)
      const bgKeyPath = `HKCU\\Software\\Classes\\Directory\\Background\\shell\\SkillsMaster`
      const bgCommandPath = `${bgKeyPath}\\command`
      const bgExecuteCommand = `\\"${exePath}\\" \\"%V\\"`

      await execPromise(`reg add "${bgKeyPath}" /ve /t REG_SZ /d "${appName}" /f`)
      await execPromise(`reg add "${bgKeyPath}" /v "Icon" /t REG_SZ /d "${iconPath}" /f`)
      await execPromise(`reg add "${bgCommandPath}" /ve /t REG_SZ /d "${bgExecuteCommand}" /f`)

      return { success: true }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('uninstallContextMenu', async () => {
    try {
      if (process.platform !== 'win32') return { success: false, error: 'Context menu integration is only supported on Windows.' }

      await execPromise(`reg delete "HKCU\\Software\\Classes\\Directory\\shell\\SkillsMaster" /f`).catch(() => {})
      await execPromise(`reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\SkillsMaster" /f`).catch(() => {})
      
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Returns if the active project scan finds project/skills data
  ipcMain.handle('scanActiveProject', async (_, projectPath: string) => {
    try {
      if (!projectPath || !fs.existsSync(projectPath)) {
         return { success: false, error: 'Path does not exist' }
      }

      const contextFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pyproject.toml']
      const detectedStack: string[] = []

      for (const file of contextFiles) {
        if (fs.existsSync(path.join(projectPath, file))) {
          if (file === 'package.json') {
             detectedStack.push('Node.js')
             try {
                 const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, file), 'utf8'))
                 const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
                 if (deps['react']) detectedStack.push('React')
                 if (deps['vue']) detectedStack.push('Vue')
                 if (deps['next']) detectedStack.push('Next.js')
                 if (deps['express']) detectedStack.push('Express')
                 if (deps['vite']) detectedStack.push('Vite')
                 if (deps['electron']) detectedStack.push('Electron')
                 if (deps['tailwindcss']) detectedStack.push('Tailwind CSS')
                 if (deps['typescript']) detectedStack.push('TypeScript')
             } catch(e) {}
          }
          if (file === 'requirements.txt' || file === 'pyproject.toml') detectedStack.push('Python')
          if (file === 'Cargo.toml') detectedStack.push('Rust')
          if (file === 'go.mod') detectedStack.push('Go')
        }
      }

      // Check existing skills
      const localSkillsPath = path.join(projectPath, '.agent', 'skills')
      let localSkills: any[] = []
      
      if (fs.existsSync(localSkillsPath)) {
         const folders = fs.readdirSync(localSkillsPath, { withFileTypes: true })
           .filter(dirent => dirent.isDirectory())
         
         for (const folder of folders) {
             const metadataPath = path.join(localSkillsPath, folder.name, 'metadata.json')
             if (fs.existsSync(metadataPath)) {
                 try {
                     const m = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
                     localSkills.push(m)
                 } catch (e) {}
             } else {
                 localSkills.push({ name: folder.name, description: 'Unknown' })
             }
         }
      }

      return { success: true, stack: detectedStack, skills: localSkills }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
