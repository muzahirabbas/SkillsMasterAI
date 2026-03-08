import { useEffect, useState } from 'react'

export function LibraryView() {
    const [skills, setSkills] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('All')
    const [search, setSearch] = useState('')
    const [showImportModal, setShowImportModal] = useState(false)
    const [connectedAgents, setConnectedAgents] = useState<any[]>([])
    const [importStatus, setImportStatus] = useState<{ success?: boolean, message?: string } | null>(null)

    useEffect(() => {
        loadSkills()
        loadAgents()
    }, [])

    const loadSkills = async () => {
        setLoading(true)
        const data = await window.api.db.getSkills()
        setSkills(data)
        setLoading(false)
    }

    const loadAgents = async () => {
        const raw = await window.api.db.getSetting('connectedGlobalAgents')
        if (raw) setConnectedAgents(JSON.parse(raw))
    }

    const handleImportFolder = async () => {
        setImportStatus({ message: 'Selecting folder...' })
        const res = await window.api.db.importSkillFromFolder()
        if (res.success) {
            setImportStatus({ success: true, message: `Successfully imported ${res.name}!` })
            loadSkills()
        } else if (res.error !== 'Cancelled') {
            setImportStatus({ success: false, message: res.error })
        } else {
            setImportStatus(null)
        }
    }

    const handleImportAgent = async (agent: any) => {
        setImportStatus({ message: `Scanning ${agent.name}...` })
        const res = await window.api.db.importFromAgent(agent.name, agent.path)
        if (res.success) {
            setImportStatus({ success: true, message: `Imported ${res.count} skills from ${agent.name}!` })
            loadSkills()
        } else {
            setImportStatus({ success: false, message: res.error })
        }
    }

    const filteredSkills = skills.filter(s => {
        const matchesFilter = filter === 'All' || s.category === filter
        const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.description.toLowerCase().includes(search.toLowerCase())
        return matchesFilter && matchesSearch
    })

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-neutral-950">
            {/* Header */}
            <header className="p-8 border-b border-neutral-900 flex justify-between items-center bg-black/20 backdrop-blur-md">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Skill Library</h1>
                    <p className="text-neutral-500 text-sm mt-1">Manage and deploy your curated AI agent capabilities.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-5 py-2.5 rounded-xl border border-neutral-800 transition-all font-bold text-sm flex items-center gap-2 active:scale-95"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import External
                    </button>
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
                        Create New +
                    </button>
                </div>
            </header>

            {/* Filters */}
            <div className="px-8 py-4 flex flex-wrap gap-4 items-center bg-neutral-900/20 border-b border-neutral-900/50">
                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder="Search skills..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all pl-10"
                    />
                    <svg className="w-4 h-4 absolute left-3 top-2.5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex bg-neutral-900/50 p-1 rounded-xl border border-neutral-800">
                    {['All', 'Basic Skill', 'Advanced Skill', 'Tool Skill'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === cat ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Skill Grid */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : filteredSkills.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSkills.map(skill => (
                            <div key={skill.id} className="group bg-[#0a0a0a] border border-neutral-800 p-6 rounded-2xl hover:border-indigo-500/50 transition-all hover:bg-neutral-900/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button className="p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="mb-4">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-2 block">{skill.category}</span>
                                    <h3 className="text-xl font-bold text-neutral-100">{skill.name}</h3>
                                    <p className="text-xs text-neutral-500 font-mono mt-0.5">{skill.namespace}</p>
                                </div>

                                <p className="text-sm text-neutral-400 line-clamp-2 mb-6 min-h-[40px] leading-relaxed">
                                    {skill.description || 'No description provided.'}
                                </p>

                                <div className="flex gap-2">
                                    <button className="flex-1 bg-neutral-900 hover:bg-indigo-600 border border-neutral-800 hover:border-indigo-500 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95">
                                        Deploy Sync
                                    </button>
                                    <button className="px-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:text-red-400 hover:border-red-400/50 transition-all active:scale-95">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                        <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-lg font-medium">No skills found</p>
                        <p className="text-sm">Try changing your filters or searching for something else.</p>
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
                    <div className="bg-[#0a0a0a] border border-neutral-800 w-full max-w-2xl rounded-3xl shadow-2xl relative overflow-hidden flex flex-col p-8 space-y-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-bold text-neutral-100">Import External Skills</h2>
                                <p className="text-neutral-500 text-sm mt-1">Import existing AI capabilities into your SkillsMaster library.</p>
                            </div>
                            <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-neutral-900 rounded-xl transition-colors">
                                <svg className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {importStatus && (
                            <div className={`p-4 rounded-2xl border text-sm font-medium ${importStatus.success === true ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : importStatus.success === false ? 'bg-red-500/10 border-red-500/20 text-red-100' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                                {importStatus.message}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Option 1: Manual Folder */}
                            <button onClick={handleImportFolder} className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-3xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group text-left flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold mb-2">External Folder</h3>
                                <p className="text-xs text-neutral-500 leading-relaxed">Select any folder on your PC containing a <code className="text-indigo-400">SKILL.md</code> file.</p>
                            </button>

                            {/* Option 2: Connected Agent */}
                            <div className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-3xl flex flex-col">
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mb-6">
                                        <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold mb-2">Connected Agents</h3>
                                    <p className="text-xs text-neutral-500 pr-4">Bulk import all skills from your connected agent directories.</p>
                                </div>

                                <div className="space-y-2 mt-auto">
                                    {connectedAgents.length > 0 ? (
                                        connectedAgents.map(agent => (
                                            <button
                                                key={agent.name}
                                                onClick={() => handleImportAgent(agent)}
                                                className="w-full bg-neutral-950 hover:bg-purple-600 border border-neutral-800 hover:border-purple-500 p-2.5 rounded-xl text-xs font-bold transition-all text-neutral-300 hover:text-white flex justify-between items-center"
                                            >
                                                <span>{agent.name}</span>
                                                <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        ))
                                    ) : (
                                        <p className="text-[10px] text-neutral-600 italic text-center">No agents connected. Go to 'Agents' tab first.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <p className="text-[10px] text-neutral-600 text-center uppercase tracking-widest font-black">SkillsMaster will auto-generate manifest files for incompatible formats</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
