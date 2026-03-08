import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        getSkills: () => Promise<any[]>
        getVersions: (skillId: string) => Promise<any[]>
        getRecentInstalls: () => Promise<any[]>
        scanLibrary: () => Promise<void>
        attachSkill: (skillId: string) => Promise<{success: boolean, target?: string, error?: string}>
        deleteSkill: (skillId: string) => Promise<{success: boolean, error?: string}>
        unsyncSkill: (skillId: string, targetPath: string) => Promise<{success: boolean, error?: string}>
        generateSkill: (req: any) => Promise<{success: boolean, namespace?: string, error?: string}>
        generateIdeas: (req: any) => Promise<{success: boolean, ideas?: any[], error?: string}>
        refactorSkill: (req: any) => Promise<{success: boolean, newVersion?: string, error?: string}>
        previewRefactorSkill: (req: any) => Promise<{success: boolean, oldMarkdown?: string, newMarkdown?: string, currentVersion?: string, nextVersion?: string, skillName?: string, error?: string}>
        commitRefactorSkill: (req: any) => Promise<{success: boolean, savedVersion?: string, error?: string}>
        selectDirectory: () => Promise<string | null>
        installContextMenu: () => Promise<{success: boolean, error?: string}>
        uninstallContextMenu: () => Promise<{success: boolean, error?: string}>
        scanActiveProject: (path: string) => Promise<{success: boolean, stack?: string[], skills?: any[], error?: string}>
        getActiveProjectPath: () => Promise<string | null>
        setActiveProjectPath: (path: string, save?: boolean) => Promise<boolean>
        getSetting: (key: string) => Promise<string | null>
        setSetting: (key: string, value: string) => Promise<boolean>
        syncSkillToTarget: (skillId: string, targetPath: string) => Promise<{success: boolean, target?: string, error?: string}>
        resolvePath: (inputPath: string) => Promise<string>
        exportSkillPack: (skillIds: string[]) => Promise<{success: boolean, path?: string, count?: number, error?: string}>
        importSkillPack: () => Promise<{success: boolean, imported?: number, skipped?: number, error?: string}>
        importSkillFromFolder: () => Promise<{success: boolean, name?: string, error?: string}>
        importFromAgent: (agentName: string, agentPath: string) => Promise<{success: boolean, count?: number, imported?: string[], skipped?: any[], error?: string}>
      }
      onActiveProject: (callback: (path: string) => void) => void
    }
  }
}
