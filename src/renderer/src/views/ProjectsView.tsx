import { useEffect, useState } from 'react'

export function ProjectsView() {
    const [activeProject, setActiveProject] = useState<string | null>(null)
    const [localSkills, setLocalSkills] = useState<any[]>([])
    const [savedProjects, setSavedProjects] = useState<any[]>([])

    useEffect(() => {
        loadSavedProjects()

        const cleanup = window.api.onActiveProject((path: string) => {
            setActiveProject(path)
            scanProject(path)
            // Refresh list because the backend just auto-added it
            loadSavedProjects()
        })

        // On initial load, try to get the active project
        window.api.db.getActiveProjectPath().then(path => {
            if (path) {
                setActiveProject(path)
                scanProject(path)
                loadSavedProjects()
            }
        })

        return cleanup
    }, [])


    const loadSavedProjects = async () => {
        const raw = await window.api.db.getSetting('connectedProjects')
        if (raw) setSavedProjects(JSON.parse(raw))
    }

    const removeProjectFromSaved = async (path: string) => {
        const existingStr = await window.api.db.getSetting('connectedProjects')
        const existing = existingStr ? JSON.parse(existingStr) : []
        const filtered = existing.filter((p: any) => p.path !== path)

        await window.api.db.setSetting('connectedProjects', JSON.stringify(filtered))
        setSavedProjects(filtered)

        if (activeProject === path) {
            setActiveProject(null)
            setLocalSkills([])
        }
    }

    const scanProject = async (path: string) => {
        const res = await window.api.db.scanActiveProject(path)
        if (res.success) {
            setLocalSkills(res.skills || [])
        }
    }

    const selectProject = async () => {
        const dir = await window.api.db.selectDirectory()
        if (dir) {
            setActiveProject(dir)
            scanProject(dir)
            // This triggers the backend auto-add logic
            await window.api.db.setActiveProjectPath(dir)
        }
    }

    const handleSelectSaved = (path: string) => {
        setActiveProject(path)
        scanProject(path)
        window.api.db.setActiveProjectPath(path)
    }

    return (
        <div className="flex-1 flex overflow-hidden bg-neutral-950">
            {/* Sidebar List */}
            <div className="w-1/3 min-w-[320px] border-r border-neutral-800 flex flex-col p-6">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Workspaces</h2>
                    <button onClick={selectProject} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] uppercase tracking-widest font-black py-1.5 px-3 rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                        Add +
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                    {savedProjects.length === 0 ? (
                        <div className="text-center py-10 opacity-40">
                            <p className="text-sm italic">No connected projects yet.</p>
                        </div>
                    ) : (
                        savedProjects.map((p, i) => (
                            <div key={i} className="group relative">
                                <button
                                    onClick={() => handleSelectSaved(p.path)}
                                    className={`w-full text-left p-4 rounded-xl transition-all border ${activeProject === p.path ? 'bg-indigo-500/10 border-indigo-500/50 shadow-inner' : 'bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-600'}`}
                                >
                                    <div className="font-bold text-neutral-200 group-hover:text-white transition-colors truncate pr-8">{p.name}</div>
                                    <div className="text-[10px] text-neutral-500 font-mono mt-1 break-all line-clamp-1">{p.path}</div>
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); removeProjectFromSaved(p.path); }}
                                    className="absolute top-4 right-4 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-all active:scale-90"
                                    title="Remove Workspace"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                {activeProject ? (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <header>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                                <h3 className="text-xs font-black text-neutral-500 uppercase tracking-[0.2em]">Target Workspace</h3>
                            </div>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 font-mono text-sm break-all shadow-inner text-neutral-400 group relative">
                                {activeProject}
                            </div>
                        </header>

                        <div className="space-y-6">
                            <div className="flex justify-between items-end border-b border-neutral-800 pb-4">
                                <h2 className="text-xl font-bold text-neutral-200">Attached Agent Skills</h2>
                                <span className="text-[10px] font-black tracking-widest text-neutral-500 uppercase">{localSkills.length} SKILLS FOUND</span>
                            </div>

                            {localSkills.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {localSkills.map((skill, i) => (
                                        <div key={i} className="group bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-6 hover:border-indigo-500/40 transition-all hover:bg-neutral-900">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 group-hover:animate-pulse" />
                                                <h3 className="font-bold text-neutral-100">{skill.name}</h3>
                                            </div>
                                            <p className="text-sm text-neutral-400 leading-relaxed">{skill.description}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-3xl">
                                    <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-900 text-neutral-600">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.641.32a2 2 0 01-1.284.17l-3.32-.474a2 2 0 00-1.022.547l-2.24 2.24A2 2 0 004.929 20h2.956c1.106 0 2-.894 2-2v-1.12c0-.552.448-1 1-1s1 .448 1 1V18c0 1.106.894 2 2 2h2.956a2 2 0 001.414-3.414l-2.24-2.24z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-neutral-400 font-medium">No Local Skills Detected</h4>
                                    <p className="text-xs text-neutral-600 mt-1 max-w-[200px] mx-auto">This project doesn't have any skills in its .agent/skills folder yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in duration-700">
                        <div className="w-24 h-24 bg-neutral-900 rounded-full flex items-center justify-center text-neutral-800 shadow-xl border border-neutral-800">
                            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-neutral-200">Select a Workspace</h2>
                            <p className="text-neutral-500 mt-2 max-w-sm">Pick a project from the left or add a new folder to see your AI team's local capabilities.</p>
                        </div>
                        <button onClick={selectProject} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-6 py-3 rounded-2xl font-bold transition-all active:scale-95">
                            Browse Filesystem
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
