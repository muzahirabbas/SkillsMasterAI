import { useState, useEffect } from 'react'

interface Props {
    prefilledData?: any
    clearPrefill?: () => void
}

export function GenerateSkillView({ prefilledData, clearPrefill }: Props) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [form, setForm] = useState({
        name: '',
        author: 'my',
        category: 'Prompt',
        description: '',
        targetLanguage: '',
        framework: '',
        toolsUsed: '',
        projectType: 'Web App',
        agentTarget: 'Claude',
        complexity: 'Medium',
        outputStyle: 'Direct Rules',
        tone: 'Strict',
        additionalInstructions: ''
    })

    useEffect(() => {
        if (prefilledData) {
            setForm(f => ({
                ...f,
                name: prefilledData.name || '',
                category: prefilledData.category || 'Prompt',
                description: prefilledData.description || ''
            }))
            if (clearPrefill) clearPrefill()
        }
    }, [prefilledData, clearPrefill])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
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

            const res = await window.api.db.generateSkill({ ...form, provider, model, apiKey })
            if (res.success) {
                setSuccess(`Skill "${res.namespace}" successfully generated and saved to library!`)
                setForm(f => ({ ...f, name: '', description: '', additionalInstructions: '' }))
            } else {
                setError(res.error || 'Unknown error occurred.')
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
                    <h2 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Generate Agent Skill</h2>
                    <p className="text-neutral-400 text-lg">Create professional-grade `SKILL.md` blueprints with deep architectural awareness.</p>
                </header>

                {error && <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl animate-in fade-in slide-in-from-top-4">{error}</div>}
                {success && <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl animate-in fade-in slide-in-from-top-4">{success}</div>}

                <form onSubmit={handleSubmit} className="space-y-10">
                    {/* Basic Info Section */}
                    <section className="bg-neutral-900/40 border border-neutral-800/50 p-8 rounded-2xl space-y-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                            <h3 className="text-xl font-bold text-neutral-200">Core Identity</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Namespace / Author</label>
                                <input required type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Skill Name</label>
                                <input required type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. react-performance-optimizer" />
                            </div>
                        </div>

                        <ChipGroup label="Category" field="category" options={['Prompt', 'Workflow', 'Tool']} />
                    </section>

                    {/* Contextual Architecture Section */}
                    <section className="bg-neutral-900/40 border border-neutral-800/50 p-8 rounded-2xl space-y-8 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-purple-500 rounded-full" />
                            <h3 className="text-xl font-bold text-neutral-200">Architectural Context</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ChipGroup label="Project Type" field="projectType" options={['Web App', 'CLI Tool', 'API / Backend', 'Mobile', 'Library']} />
                            <ChipGroup label="Target Agent" field="agentTarget" options={['Claude', 'Cursor', 'Copilot', 'Windsurf', 'Aider', 'Codex CLI', 'Gemini CLI', 'Antigravity IDE']} />
                            <ChipGroup label="Complexity" field="complexity" options={['Simple', 'Medium', 'Complex']} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ChipGroup label="Output Style" field="outputStyle" options={['Step-by-Step', 'Checklist', 'Direct Rules', 'Examples-First']} />
                            <ChipGroup label="Instruction Tone" field="tone" options={['Strict', 'Balanced', 'Flexible']} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Language</label>
                                <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all"
                                    value={form.targetLanguage} onChange={e => setForm({ ...form, targetLanguage: e.target.value })} placeholder="e.g. TypeScript" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Framework</label>
                                <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all"
                                    value={form.framework} onChange={e => setForm({ ...form, framework: e.target.value })} placeholder="e.g. Next.js" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Allowed Tools</label>
                                <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all"
                                    value={form.toolsUsed} onChange={e => setForm({ ...form, toolsUsed: e.target.value })} placeholder="e.g. ripgrep, bash" />
                            </div>
                        </div>
                    </section>

                    {/* Detailed logic Section */}
                    <section className="bg-neutral-900/40 border border-neutral-800/50 p-8 rounded-2xl space-y-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                            <h3 className="text-xl font-bold text-neutral-200">Behavioral Logic</h3>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Main Specialization & Rules</label>
                            <textarea required rows={4} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all resize-none"
                                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Describe exactly what the agent should excel at, specific rules it must follow, and architectural constraints..." />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Additional Custom Instructions (Optional)</label>
                            <textarea rows={3} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all resize-none"
                                value={form.additionalInstructions} onChange={e => setForm({ ...form, additionalInstructions: e.target.value })}
                                placeholder="Any other specific constraints or weird things the AI should know?" />
                        </div>
                    </section>

                    <div className="flex justify-end pt-6 pb-12">
                        <button disabled={loading} type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-2xl transition-all disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95">
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Architecting Skill...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span>Generate Elite Skill</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div >
        </div >
    )
}
