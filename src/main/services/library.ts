import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDatabase } from './database'
import { ipcMain } from 'electron'

export function setupLibraryIpcHandlers() {
  ipcMain.handle('db:scanLibrary', () => {
    scanLibrary()
  })
}

export function scanLibrary() {
  const db = getDatabase()
  const skillsPath = path.join(os.homedir(), '.skillsmaster', 'skills')

  if (!fs.existsSync(skillsPath)) {
    fs.mkdirSync(skillsPath, { recursive: true })
    return
  }

  const skillFolders = fs.readdirSync(skillsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())

  for (const skillFolder of skillFolders) {
    const fullFolderPath = path.join(skillsPath, skillFolder.name)
    const versionFolders = fs.readdirSync(fullFolderPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())

    for (const versionFolder of versionFolders) {
      const versionPath = path.join(fullFolderPath, versionFolder.name)
      const metadataPath = path.join(versionPath, 'metadata.json')

      if (fs.existsSync(metadataPath)) {
        try {
          const content = fs.readFileSync(metadataPath, 'utf8')
          const metadata = JSON.parse(content)

          const id = metadata.namespace || `unknown.${skillFolder.name}`
          const parts = id.split('.')
          const author = parts[0]
          const name = parts.slice(1).join('.') || id

          const category = metadata.category || 'Basic Skill'
          const description = metadata.description || ''
          const version = versionFolder.name

          // Upsert skill
          db.prepare(`
            INSERT OR REPLACE INTO skills (id, name, namespace, category, description)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, name, author, category, description)

          // Insert version if not exists
          db.prepare(`
            INSERT OR IGNORE INTO versions (skill_id, version)
            VALUES (?, ?)
          `).run(id, version)

        } catch (err) {
          console.error(`Failed to parse metadata for ${skillFolder.name}/${versionFolder.name}`, err)
        }
      }
    }
  }

  console.log('Library scan completed')
}
