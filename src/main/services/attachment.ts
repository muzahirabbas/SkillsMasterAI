import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDatabase } from './database'
import { ipcMain, dialog, BrowserWindow } from 'electron'

export function setupAttachmentIpcHandlers() {
  ipcMain.handle('attachSkill', async (event, skillId: string) => {
    const db = getDatabase()
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    
    // Pick target folder
    if (!browserWindow) return { success: false, error: 'No browser window' }
    
    const result = await dialog.showOpenDialog(browserWindow, {
      properties: ['openDirectory'],
      title: 'Select target project or agent directory'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' }
    }

    const targetPath = result.filePaths[0]

    // Find latest version of the skill
    const versionRow = db.prepare('SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1').get(skillId) as { version: string }
    if (!versionRow) {
      return { success: false, error: 'Skill version not found' }
    }
    const version = versionRow.version

    const skillRow = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as { name: string }
    
    // Source path
    const skillsLibraryPath = path.join(os.homedir(), '.skillsmaster', 'skills')
    const sourcePath = path.join(skillsLibraryPath, skillRow.name, version)

    // Detect if we should put it in .skills/ or skills/ based on convention
    // Usually project/.skills/skill-name
    const targetSkillFolder = path.join(targetPath, '.skills', skillRow.name)

    try {
      if (!fs.existsSync(path.join(targetPath, '.skills'))) {
        fs.mkdirSync(path.join(targetPath, '.skills'), { recursive: true })
      }

      fs.cpSync(sourcePath, targetSkillFolder, { recursive: true, force: true })

      // Record installation
      db.prepare('INSERT INTO installations (skill_id, version, path) VALUES (?, ?, ?)').run(skillId, version, targetSkillFolder)

      return { success: true, target: targetSkillFolder }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('syncSkillToTarget', async (_, skillId: string, targetPath: string) => {
    const db = getDatabase()
    
    // Find latest version of the skill
    const versionRow = db.prepare('SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1').get(skillId) as { version: string }
    if (!versionRow) {
      return { success: false, error: 'Skill version not found' }
    }
    const version = versionRow.version

    const skillRow = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as { name: string }
    
    // Source path
    const skillsLibraryPath = path.join(os.homedir(), '.skillsmaster', 'skills')
    const sourcePath = path.join(skillsLibraryPath, skillRow.name, version)

    // Convention is project/.agent/skills/skill-name OR project/skills/skill-name etc.
    // For standard, we'll assume targetPath already has the correct folder (e.g. .agent/skills)
    const targetSkillFolder = path.join(targetPath, skillRow.name)

    try {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      fs.cpSync(sourcePath, targetSkillFolder, { recursive: true, force: true })

      // Record installation (optional but good for tracking)
      db.prepare('INSERT INTO installations (skill_id, version, path) VALUES (?, ?, ?)').run(skillId, version, targetSkillFolder)

      return { success: true, target: targetSkillFolder }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('unsyncSkill', async (_, skillId: string, targetPath: string) => {
    const db = getDatabase()
    try {
      const skillRow = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as { name: string }
      if (!skillRow) return { success: false, error: 'Skill not found' }

      if (targetPath === 'EVERYWHERE') {
        const installs = db.prepare('SELECT path FROM installations WHERE skill_id = ?').all(skillId) as { path: string }[]
        for (const inst of installs) {
          if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true })
        }
        db.prepare('DELETE FROM installations WHERE skill_id = ?').run(skillId)
      } else {
        // We append the skill name to the target path explicitly since global agents don't append .agent/skills but simply dump into the folder
        const targetSkillFolder = path.join(targetPath, skillRow.name)

        console.log("== UNSYNC DEBUG ==")
        console.log("targetPath from UI:", targetPath)
        console.log("targetSkillFolder normalized:", targetSkillFolder)

        // Find existing installations that match this path precisely or via root
        const exactInstalls = db.prepare(`SELECT path FROM installations WHERE skill_id = ? AND (path = ? OR path LIKE ? || '%')`).all(skillId, targetSkillFolder, targetPath) as { path: string }[]
        
        console.log("exactInstalls found in DB:", exactInstalls)
        
        if (exactInstalls.length > 0) {
            for (const inst of exactInstalls) {
                if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true })
                db.prepare('DELETE FROM installations WHERE skill_id = ? AND path = ?').run(skillId, inst.path)
            }
        } else {
            // Fallback to name convention if DB entry missing
            if (fs.existsSync(targetSkillFolder)) fs.rmSync(targetSkillFolder, { recursive: true, force: true })
            db.prepare('DELETE FROM installations WHERE skill_id = ? AND path = ?').run(skillId, targetSkillFolder)
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('deleteSkill', async (_, skillId: string) => {
    const db = getDatabase()
    try {
      const skillRow = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as { name: string }
      if (!skillRow) return { success: false, error: 'Skill not found' }

      // 1. Remove from all targets (unsync everywhere)
      const installs = db.prepare('SELECT path FROM installations WHERE skill_id = ?').all(skillId) as { path: string }[]
      for (const inst of installs) {
        if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true })
      }

      // 2. Remove locally from ~/.skillsmaster
      const skillsLibraryPath = path.join(os.homedir(), '.skillsmaster', 'skills', skillRow.name)
      if (fs.existsSync(skillsLibraryPath)) {
        fs.rmSync(skillsLibraryPath, { recursive: true, force: true })
      }

      // 3. Remove from database (cascading deletes installs and versions)
      db.prepare('DELETE FROM skills WHERE id = ?').run(skillId)

      return { success: true }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })
}
