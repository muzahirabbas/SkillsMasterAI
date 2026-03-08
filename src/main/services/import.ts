import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { scanLibrary } from './library'

export function setupImportIpcHandlers() {
    ipcMain.handle('importSkillFromFolder', async (event) => {
        const browserWindow = BrowserWindow.fromWebContents(event.sender)
        if (!browserWindow) return { success: false, error: 'No browser window' }

        const result = await dialog.showOpenDialog(browserWindow, {
            properties: ['openDirectory'],
            title: 'Select Skill Folder'
        })

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: 'Cancelled' }
        }

        return await importSkillFromFolder(result.filePaths[0])
    })

    ipcMain.handle('importFromAgent', async (_, agentName: string, agentPath: string) => {
        return await importFromAgent(agentName, agentPath)
    })
}

async function importSkillFromFolder(sourcePath: string) {
    try {
        if (!fs.existsSync(sourcePath)) return { success: false, error: 'Source path does not exist' }

        const skillFileName = fs.existsSync(path.join(sourcePath, 'SKILL.md')) ? 'SKILL.md' : 
                            fs.existsSync(path.join(sourcePath, 'skills.md')) ? 'skills.md' : null
        
        const metadataPath = path.join(sourcePath, 'metadata.json')
        let metadata: any = null

        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
            } catch (e) {}
        }

        // If no metadata, try to generate it from the MD file
        if (!metadata) {
            if (!skillFileName) return { success: false, error: 'No SKILL.md or metadata.json found in folder.' }
            
            const content = fs.readFileSync(path.join(sourcePath, skillFileName), 'utf8')
            const nameMatch = content.match(/^#\s+(.+)$/m)
            const skillName = nameMatch ? nameMatch[1].trim() : path.basename(sourcePath)
            
            metadata = {
                name: skillName,
                namespace: 'imported',
                category: 'Basic Skill',
                description: `Imported from ${sourcePath}`,
                version: '1.0.0'
            }
        }

        const cleanName = (metadata.name || path.basename(sourcePath)).replace(/[^a-z0-9]/gi, '-').toLowerCase()
        const libraryPath = path.join(os.homedir(), '.skillsmaster', 'skills', cleanName, '1.0.0')

        if (!fs.existsSync(libraryPath)) {
            fs.mkdirSync(libraryPath, { recursive: true })
        }

        // Copy everything from source to library
        fs.cpSync(sourcePath, libraryPath, { recursive: true, force: true })

        // Ensure metadata.json exists in target
        fs.writeFileSync(path.join(libraryPath, 'metadata.json'), JSON.stringify(metadata, null, 2))

        // Trigger scan to update DB
        scanLibrary()

        return { success: true, name: metadata.name }
    } catch (err: any) {
        console.error(err)
        return { success: false, error: err.message }
    }
}

async function importFromAgent(agentName: string, agentPath: string) {
    try {
        if (!fs.existsSync(agentPath)) return { success: false, error: `Agent path for ${agentName} does not exist: ${agentPath}` }

        const entries = fs.readdirSync(agentPath, { withFileTypes: true })
        const imported: string[] = []
        const skipped: { name: string, error: any }[] = []

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subPath = path.join(agentPath, entry.name)
                // Check if it's actually a skill folder
                const hasSkill = fs.existsSync(path.join(subPath, 'SKILL.md')) || 
                               fs.existsSync(path.join(subPath, 'skills.md')) ||
                               fs.existsSync(path.join(subPath, 'metadata.json'))
                
                if (hasSkill) {
                    const res = await importSkillFromFolder(subPath)
                    if (res.success) imported.push(entry.name)
                    else skipped.push({ name: entry.name, error: res.error })
                }
            }
        }

        return { success: true, count: imported.length, imported, skipped }
    } catch (err: any) {
        console.error(err)
        return { success: false, error: err.message }
    }
}
