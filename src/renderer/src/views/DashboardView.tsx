import { useEffect, useState } from 'react'

export function DashboardView() {
    const [activeProject, setActiveProject] = useState<string | null>(null)
    const [detectedStack, setDetectedStack] = useState<string[]>([])
    const [localSkills, setLocalSkills] = useState<any[]>([])
    const [recentInstalls, setRecentInstalls] = useState<any[]>([])

    useEffect(() => {
        // Restore last active project from persisted setting
        const init = async () => {
            const saved = await window.api.db.getSetting('activeProjectPath')
            if (saved) {
                setActiveProject(saved)
                scanProject(saved)
            }
            // Also check if main process launched with a path
            const live = await window.api.db.getActiveProjectPath()
            if (live) {
                setActiveProject(live)
                scanProject(live)
                await window.api.db.setSetting('activeProjectPath', live)
            }
        }
        init()

        // Listen for active project events pushed from the main process
        const cleanup = window.api.onActiveProject(async (path: string) => {
            setActiveProject(path)
            scanProject(path)
            await window.api.db.setSetting('activeProjectPath', path)
        })

        // Fetch global recent installs
        loadRecentInstalls()

        return cleanup
    }, [])

    const loadRecentInstalls = async () => {
        const installs = await window.api.db.getRecentInstalls()
        setRecentInstalls(installs)
    }

    const scanProject = async (path: string) => {
        const res = await window.api.db.scanActiveProject(path)
        if (res.success) {
            setDetectedStack(res.stack || [])
            setLocalSkills(res.skills || [])
        }
    }

    const selectProject = async () => {
        const dir = await window.api.db.selectDirectory()
        if (dir) {
            setActiveProject(dir)
            scanProject(dir)
            // This triggers the global event so ProjectsView and GenerateIdeas pick it up
            await window.api.db.setActiveProjectPath(dir)
            await window.api.db.setSetting('activeProjectPath', dir)
        }
    }

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-neutral-400 mb-8">Manage your active coding agent workspaces and global configuration.</p>

            <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6 mb-8">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-1">Active Project Context</h2>
                        <p className="text-sm text-neutral-500">SkillsMaster will automatically sync skills to this directory's <code className="bg-neutral-900 px-1 py-0.5 rounded">.agent/skills</code> folder.</p>
                    </div>
                    <button onClick={selectProject} className="text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded-lg transition-colors">
                        Change Project
                    </button>
                </div>

                {activeProject ? (
                    <div className="space-y-6">
                        <div>
                            <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Target Path</p>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 font-mono text-sm break-all">
                                {activeProject}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Tech Stack */}
                            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    Detected Stack
                                </h3>
                                {detectedStack.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {detectedStack.map((s, i) => (
                                            <span key={i} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded text-xs font-medium">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-neutral-500">No recognizable framework files found.</p>
                                )}
                            </div>

                            {/* Local Skills */}
                            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    Local Agent Skills
                                </h3>
                                {localSkills.length > 0 ? (
                                    <ul className="space-y-2">
                                        {localSkills.map((skill, i) => (
                                            <li key={i} className="flex justify-between items-center text-sm border-b border-neutral-800 pb-2 last:border-0 last:pb-0">
                                                <span className="font-medium">{skill.name}</span>
                                                <span className="text-neutral-500 text-xs truncate max-w-[120px]">{skill.description}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-neutral-500">No skills attached to this project.</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-neutral-900/50 border border-dashed border-neutral-800 rounded-xl">
                        <p className="text-neutral-400 text-sm mb-4">No active project selected. You can pick one manually or launch SkillsMaster via right-click context menu inside a folder.</p>
                        <button onClick={selectProject} className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors">
                            Select Local Directory
                        </button>
                    </div>
                )}
            </div>

            {/* Recently Synced Skills */}
            <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4 text-emerald-400">Recently Synced Skills (Global)</h2>
                {recentInstalls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                        {recentInstalls.map((inst, i) => (
                            <div key={i} className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-emerald-500/30 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-neutral-200">{inst.name}</h3>
                                    <span className="text-[10px] text-neutral-500">{new Date(inst.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-neutral-400 mb-3">{inst.description}</p>
                                <div className="text-[10px] text-neutral-600 font-mono bg-black/50 px-2 py-1 rounded truncate" title={inst.path}>
                                    {inst.path}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 border border-dashed border-neutral-800 rounded-lg">
                        <p className="text-sm text-neutral-500">No skills synced recently. Deploy skills from the Library tab.</p>
                    </div>
                )}
            </div>

        </div>
    )
}
