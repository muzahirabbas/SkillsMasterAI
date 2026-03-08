import Database from 'better-sqlite3'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function initDatabase() {
  const userDataPath = app.getPath('userData')
  const skillsmasterDir = path.join(userDataPath, 'skillsmaster')
  if (!fs.existsSync(skillsmasterDir)) {
    fs.mkdirSync(skillsmasterDir, { recursive: true })
  }
  const dbPath = path.join(skillsmasterDir, 'skillsmaster.sqlite')
  
  db = new Database(dbPath)
  
  db.pragma('journal_mode = WAL')
  
  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT,
      namespace TEXT,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS versions (
      skill_id TEXT,
      version TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (skill_id, version),
      FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT,
      version TEXT,
      path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(skill_id, version) REFERENCES versions(skill_id, version) ON DELETE CASCADE
    );
  `)
  
  // Insert some default categories if empty
  const catCount = db.prepare('SELECT count(*) as count FROM categories').get() as { count: number }
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)')
    insertCat.run('Basic Skill')
    insertCat.run('Advanced Skill')
    insertCat.run('Tool Skill')
  }

  setupIpcHandlers()
}

export function getDatabase(): any {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

function setupIpcHandlers() {
  ipcMain.handle('db:getSkills', () => {
    return db.prepare('SELECT * FROM skills ORDER BY name ASC').all()
  })

  ipcMain.handle('db:getVersions', (_, skillId: string) => {
    return db.prepare('SELECT * FROM versions WHERE skill_id = ? ORDER BY version DESC').all(skillId)
  })

  ipcMain.handle('db:getRecentInstalls', () => {
    return db.prepare(`
      SELECT i.path, i.created_at, s.name, s.description 
      FROM installations i
      JOIN skills s ON i.skill_id = s.id
      ORDER BY i.created_at DESC 
      LIMIT 10
    `).all()
  })

  // We can add more endpoints here like checking installations etc.
}
