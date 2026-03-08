import { ipcMain, dialog, BrowserWindow } from 'electron'
import AdmZip from 'adm-zip'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDatabase } from './database'
import { scanLibrary } from './library'

const SKILLSMASTER_DIR = path.join(os.homedir(), '.skillsmaster', 'skills')
const PACK_MANIFEST_NAME = 'skillpack.manifest.json'

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function setupSkillPackIpcHandlers(): void {

  // ─── Export Pack ──────────────────────────────────────────────────────────
  ipcMain.handle('exportSkillPack', async (event, skillIds: string[]) => {
    try {
      if (!skillIds || skillIds.length === 0) throw new Error('No skills selected for export')

      const db = getDatabase()
      const skills: any[] = []

      for (const id of skillIds) {
        const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
        if (!skill) continue

        const versions = db.prepare('SELECT * FROM versions WHERE skill_id = ?').all(id) as any[]
        skills.push({ skill, versions })
      }

      if (skills.length === 0) throw new Error('None of the selected skills were found in the database')

      // Build the zip
      const zip = new AdmZip()

      // Add manifest JSON with DB data
      const manifest = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        skills: skills.map(s => ({ ...s.skill, _versions: s.versions }))
      }
      zip.addFile(PACK_MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))

      // Add each skill's folder
      for (const { skill, versions } of skills) {
        const skillDir = path.join(SKILLSMASTER_DIR, skill.name)
        if (!fs.existsSync(skillDir)) continue

        for (const version of versions) {
          const versionDir = path.join(skillDir, version.version)
          if (!fs.existsSync(versionDir)) continue

          const entries = fs.readdirSync(versionDir)
          for (const entry of entries) {
            const filePath = path.join(versionDir, entry)
            const content = fs.readFileSync(filePath)
            zip.addFile(`skills/${skill.name}/${version.version}/${entry}`, content)
          }
        }
      }

      // Show save dialog
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      const saveResult = await dialog.showSaveDialog(browserWindow!, {
        title: 'Export Skill Pack',
        defaultPath: `skillpack-${Date.now()}.skillsmaster`,
        filters: [{ name: 'SkillsMaster Pack', extensions: ['skillsmaster'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'Export cancelled' }
      }

      zip.writeZip(saveResult.filePath)
      return { success: true, path: saveResult.filePath, count: skills.length }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  // ─── Import Pack ──────────────────────────────────────────────────────────
  ipcMain.handle('importSkillPack', async (event) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      const openResult = await dialog.showOpenDialog(browserWindow!, {
        title: 'Import Skill Pack',
        filters: [{ name: 'SkillsMaster Pack', extensions: ['skillsmaster'] }],
        properties: ['openFile']
      })

      if (openResult.canceled || openResult.filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' }
      }

      const packPath = openResult.filePaths[0]
      const zip = new AdmZip(packPath)

      // Read manifest
      const manifestEntry = zip.getEntry(PACK_MANIFEST_NAME)
      if (!manifestEntry) throw new Error('Invalid .skillsmaster file: missing manifest')

      const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
      const db = getDatabase()

      let imported = 0
      let skipped = 0

      for (const skillData of manifest.skills) {
        const { _versions, ...skillRecord } = skillData

        // Check for ID collision — generate new ID if duplicate
        const existing = db.prepare('SELECT id FROM skills WHERE id = ?').get(skillRecord.id)
        const finalId = existing ? generateId() : skillRecord.id

        // Check for name+namespace collision
        const nameCollision = db.prepare('SELECT id FROM skills WHERE name = ? AND namespace = ?').get(skillRecord.name, skillRecord.namespace)
        if (nameCollision) {
          skipped++
          continue
        }

        // Insert skill row
        db.prepare(`
          INSERT INTO skills (id, name, namespace, description, category, tags, author, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          finalId,
          skillRecord.name,
          skillRecord.namespace,
          skillRecord.description || '',
          skillRecord.category || 'Prompt',
          skillRecord.tags || '',
          skillRecord.author || 'imported',
          skillRecord.created_at || new Date().toISOString(),
          new Date().toISOString()
        )

        // Insert version rows
        for (const ver of (_versions || [])) {
          db.prepare(`
            INSERT OR IGNORE INTO versions (skill_id, version, path, is_active)
            VALUES (?, ?, ?, ?)
          `).run(finalId, ver.version, ver.path || `${skillRecord.name}/${ver.version}`, ver.is_active || 1)
        }

        // Extract files from zip into local skills directory
        const entries = zip.getEntries().filter(e => e.entryName.startsWith(`skills/${skillRecord.name}/`))
        for (const entry of entries) {
          if (entry.isDirectory) continue
          // Map: skills/<name>/<version>/file -> ~/.skillsmaster/skills/<name>/<version>/file
          const relativePath = entry.entryName.replace(`skills/${skillRecord.name}/`, '')
          const targetPath = path.join(SKILLSMASTER_DIR, skillRecord.name, relativePath)
          const targetDir = path.dirname(targetPath)
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
          fs.writeFileSync(targetPath, entry.getData())
        }

        imported++
      }

      scanLibrary()
      return { success: true, imported, skipped }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })
}
