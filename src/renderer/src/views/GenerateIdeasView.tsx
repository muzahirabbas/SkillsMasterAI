import { useState, useEffect } from 'react'

interface Props {
    onGenerate?: (idea: any) => void
}

export function GenerateIdeasView({ onGenerate }: Props) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [form, setForm] = useState({
        projectPath: '',
        userInstructions: '',
        goalDescription: '',
        agentTarget: 'Claude'
    })

    const [ideas, setIdeas] = useState<any[]>([])

    // Load active project path on mount and auto-fill
    useEffect(() => {
        const init = async () => {
            const saved = await window.api.db.getSetting('activeProjectPath')
            if (saved) setForm(f => ({ ...f, projectPath: saved }))
            const live = await window.api.db.getActiveProjectPath()
            if (live) {
                setForm(f => ({ ...f, projectPath: live }))
                await window.api.db.setSetting('activeProjectPath', live)
            }
        }
        init()
        const cleanup = window.api.onActiveProject(async (path: string) => {
            if (path) {
                setForm(f => ({ ...f, projectPath: path }))
                await window.api.db.setSetting('activeProjectPath', path)
            }
        })
        return cleanup
    }, [])

    const handleSelectDir = async () => {
        const dir = await window.api.db.selectDirectory()
        if (dir) {
            setForm({ ...form, projectPath: dir })
            await window.api.db.setActiveProjectPath(dir)
            await window.api.db.setSetting('activeProjectPath', dir)
        }
    }

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            if (!form.projectPath) throw new Error('Please select a project path first.')

            const provider = await window.api.db.getSetting('globalProvider') || 'OpenAI'
            const model = await window.api.db.getSetting('globalModel') || 'gpt-4o'
            const storedKeysRaw = await window.api.db.getSetting(`apiKeys_${provider}`)
            const storedKeys: string[] = storedKeysRaw ? JSON.parse(storedKeysRaw) : []
            const apiKey = storedKeys[0] || ''

            if (!apiKey && provider !== 'Ollama') {
                setError(`API Key is missing for ${provider}. Please add one in Settings → ${provider}.`)
                setLoading(false)
                return
            }

            const res = await window.api.db.generateIdeas({ ...form, provider, model, apiKey })
            if (res.success && res.ideas) {
                setIdeas(res.ideas)
            } else {
                setError(res.error || 'Failed to generate ideas.')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const ChipGroup = ({ label, options, field }: { label: string, options: string[], field: string }) => (
        <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => setForm({ ...form, [field]: opt })}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${form[field] === opt
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                            }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-950 p-8 scrollbar-hide">
            <div className="max-w-4xl mx-auto">
                <header className="mb-10">
                    <h2 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Generate Skill Ideas</h2>
                    <p className="text-neutral-400 text-lg">Deep scan your project architecture and get AI-powered suggestions for agent skills.</p>
                </header>

                {error && <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl animate-in fade-in slide-in-from-top-4">{error}</div>}

                <form onSubmit={handleScan} className="space-y-8">
                    {/* Project Selection */}
                    <section className="bg-neutral-900/40 border border-neutral-800/50 p-8 rounded-2xl space-y-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                            <h3 className="text-xl font-bold text-neutral-200">Active Workspace</h3>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Project Directory</label>
                            <div className="flex gap-2 p-1 bg-black/40 border border-neutral-800 rounded-xl focus-within:border-indigo-500 transition-all shadow-inner">
                                <input required readOnly type="text" className="flex-1 bg-transparent px-3 py-2 text-sm text-neutral-400 focus:outline-none font-mono"
                                    value={form.projectPath} placeholder="/path/to/project" />
                                <button type="button" onClick={handleSelectDir} className="bg-neutral-800 hover:bg-neutral-700 font-bold px-4 rounded-lg text-xs transition-colors text-neutral-200 active:scale-95">
                                    Browse...
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                            <ChipGroup label="Target Agent" field="agentTarget" options={['Claude', 'Cursor', 'Copilot', 'Windsurf', 'Aider', 'Codex CLI', 'Gemini CLI', 'Antigravity IDE']} />
                        </div>
                    </section>

                    {/* Custom Context */}
                    <section className="bg-neutral-900/40 border border-neutral-800/50 p-8 rounded-2xl space-y-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                            <h3 className="text-xl font-bold text-neutral-200">Strategic Intent</h3>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">What is this project about? (Optional)</label>
                                <textarea rows={2} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all resize-none"
                                    value={form.userInstructions} onChange={e => setForm({ ...form, userInstructions: e.target.value })}
                                    placeholder="e.g. A high-performance e-commerce engine built with Rust and Next.js..." />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">What are your current goals? (Optional)</label>
                                <textarea rows={2} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all resize-none"
                                    value={form.goalDescription} onChange={e => setForm({ ...form, goalDescription: e.target.value })}
                                    placeholder="e.g. I want to optimize my database queries and add a complex search workflow." />
                            </div>
                        </div>
                    </section>

                    <div className="flex justify-end pt-2 pb-8">
                        <button disabled={loading || !form.projectPath} type="submit"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-10 rounded-2xl transition-all disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-emerald-600/20 active:scale-95">
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Scanning Architecture...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <span>Analyze & Suggest Skills</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {ideas.length > 0 && (
                    <div className="mt-12 space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                            <h3 className="text-2xl font-bold text-neutral-100">AI-Architected Suggestions</h3>
                            <span className="bg-indigo-500/10 text-indigo-400 text-xs font-bold px-3 py-1 rounded-full border border-indigo-500/20 uppercase tracking-widest">4 Skills Discovered</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ideas.map((idea, i) => (
                                <div key={i} className="group p-6 bg-neutral-900 border border-neutral-800/80 rounded-2xl hover:border-indigo-500/50 hover:bg-neutral-900/60 transition-all duration-300 shadow-lg hover:shadow-indigo-500/10 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-start mb-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] uppercase font-black tracking-[0.2em] text-indigo-500/80 mb-2 block">{idea.category}</span>
                                            <h4 className="text-xl font-bold text-neutral-100 group-hover:text-indigo-400 transition-colors">{idea.name}</h4>
                                        </div>
                                    </div>

                                    <p className="text-sm text-neutral-400 leading-relaxed min-h-[40px] mb-6">{idea.description}</p>

                                    <button
                                        onClick={() => onGenerate && onGenerate(idea)}
                                        className="w-full text-sm font-bold text-white bg-neutral-800 px-4 py-3 rounded-xl cursor-pointer hover:bg-indigo-600 transition-all duration-300 flex items-center justify-center gap-2 group/btn active:scale-[0.98]">
                                        <span>Draft Skill Prototype</span>
                                        <svg className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div >
        </div >
    )
}
