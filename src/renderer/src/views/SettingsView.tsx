import { useState, useEffect, useCallback } from 'react'

export function SettingsView() {
    const [globalProvider, setGlobalProvider] = useState<string>('OpenAI')
    const [globalModel, setGlobalModel] = useState<string>('gpt-4o')
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [installingMenu, setInstallingMenu] = useState(false)

    // Per-provider key state: { OpenAI: ['key1', 'key2'], ... }
    const [providerKeys, setProviderKeys] = useState<Record<string, string[]>>({})
    const [newKeyInput, setNewKeyInput] = useState<string>('')

    const providers = ['OpenAI', 'Anthropic', 'Google', 'xAI', 'Alibaba', 'Ollama', 'OpenRouter', 'Groq', 'DeepSeek', 'Moonshot', 'Together AI', 'NVIDIA']
    const providerModels: Record<string, string[]> = {
        'OpenAI': [
            'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.2', 'gpt-5.1', 'gpt-5-mini', 'gpt-5-nano',
            'o3-mini', 'gpt-4.5-turbo', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
            'gpt-4o-mini', 'o1', 'o1-mini'
        ],
        'Anthropic': [
            'claude-opus-4.5', 'claude-sonnet-4.5', 'claude-4.6-opus-20260205', 'claude-4.6-sonnet-20260217',
            'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus-20240229'
        ],
        'Google': [
            'gemini-3.1-flash-lite', 'gemini-3-flash', 'gemini-3-pro-preview', 'gemini-2.5-pro',
            'gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemma-3-12b-it', 'gemma-2-27b-it', 'gemma-3n-e2b-it'
        ],
        'xAI': [
            'grok-4-0709', 'grok-4-1-fast', 'grok-code-fast-1', 'grok-3', 'grok-2', 'grok-2-mini', 'grok-1.5'
        ],
        'Alibaba': [
            'qwen3-235b-a22b', 'qwen3-30b-a3b', 'qwen2.5-turbo', 'qwen2.5-plus', 'qwen2.5-omni-7b',
            'qwen-coder-32b-instruct', 'qwen-max-2025-01-25', 'qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-coder'
        ],
        'Ollama': [
            'llama3.3', 'llama3.2', 'qwen2.5-coder', 'phi4', 'gemma2', 'mistral', 'deepseek-coder', 'starcoder2'
        ],
        'OpenRouter': [
            'openai/gpt-5.4', 'anthropic/claude-opus-4.5', 'anthropic/claude-4.6-opus-20260205',
            'google/gemini-2.5-flash', 'google/gemini-3-flash', 'xai/grok-4-0709', 'openrouter/deepseek-v3',
            'openrouter/meta-llama-3.3-70b-instruct', 'openrouter/qwen3-30b-a3b', 'google/gemma-3-27b-it',
            'deepseek/deepseek-chat', 'groq/llama-3.3-70b-versatile', 'moonshotai/kimi-k2.5', 'mistralai/mistral-large'
        ],
        'Groq': [
            'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'
        ],
        'DeepSeek': [
            'deepseek-v3', 'deepseek-r1', 'deepseek-chat', 'deepseek-reasoning-r1', 'deepseek-coder'
        ],
        'Moonshot': [
            'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2', 'kimi-k2.5'
        ],
        'Together AI': [
            'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
            'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'
        ],
        'NVIDIA': [
            'meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-3b-instruct', 'meta/llama3-8b-instruct',
            'mistralai/mistral-7b-instruct-v0.3', 'google/gemma-3-12b-it', 'google/gemma-3-27b-it',
            'google/gemma-2-9b-it', 'phi-4-mini-instruct', 'phi-3.5-mini-instruct',
            'granite-3.3-8b-instruct', 'granite-34b-code-instruct', 'granite-3.0-8b-instruct',
            'granite-3.0-3b-a800m-instruct', 'nemotron-mini-4b-instruct', 'jamba-1.5-mini-instruct',
            'breeze-7b-instruct', 'solar-10.7b-instruct'
        ]
    }

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        const prov = await window.api.db.getSetting('globalProvider')
        if (prov) setGlobalProvider(prov)
        const mod = await window.api.db.getSetting('globalModel')
        if (mod) setGlobalModel(mod)

        // Load per-provider keys
        const keysMap: Record<string, string[]> = {}
        for (const p of ['OpenAI', 'Anthropic', 'Google', 'xAI', 'Alibaba', 'Ollama', 'OpenRouter', 'Groq', 'DeepSeek', 'Moonshot', 'Together AI', 'NVIDIA']) {
            const stored = await window.api.db.getSetting(`apiKeys_${p}`)
            keysMap[p] = stored ? JSON.parse(stored) : []
        }
        setProviderKeys(keysMap)
    }

    const saveProviderKeys = useCallback(async (provider: string, keys: string[]) => {
        await window.api.db.setSetting(`apiKeys_${provider}`, JSON.stringify(keys))
        showMessage(`Keys saved for ${provider}!`)
    }, [])

    const addKey = async () => {
        const trimmed = newKeyInput.trim()
        if (!trimmed) return
        const existing = providerKeys[globalProvider] || []
        if (existing.includes(trimmed)) {
            showMessage('Key already exists for this provider.')
            return
        }
        const updated = [...existing, trimmed]
        setProviderKeys(prev => ({ ...prev, [globalProvider]: updated }))
        setNewKeyInput('')
        await saveProviderKeys(globalProvider, updated)
    }

    const removeKey = async (provider: string, index: number) => {
        const updated = (providerKeys[provider] || []).filter((_, i) => i !== index)
        setProviderKeys(prev => ({ ...prev, [provider]: updated }))
        await saveProviderKeys(provider, updated)
    }

    const saveSettings = async (k: string, v: string) => {
        await window.api.db.setSetting(k, v)
        showMessage('Settings saved!')
    }

    const showMessage = (msg: string) => {
        setStatusMessage(msg)
        setTimeout(() => setStatusMessage(null), 4000)
    }

    const handleInstallMenu = async () => {
        setInstallingMenu(true)
        const res = await window.api.db.installContextMenu()
        setInstallingMenu(false)
        if (res.success) {
            showMessage('Context menu installed successfully!')
        } else {
            showMessage(`Failed: ${res.error}`)
        }
    }

    const handleUninstallMenu = async () => {
        setInstallingMenu(true)
        const res = await window.api.db.uninstallContextMenu()
        setInstallingMenu(false)
        if (res.success) {
            showMessage('Context menu uninstalled successfully!')
        } else {
            showMessage(`Failed: ${res.error}`)
        }
    }

    const currentKeys = providerKeys[globalProvider] || []
    const isOllama = globalProvider === 'Ollama'

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
            <h1 className="text-3xl font-bold mb-2">Settings</h1>
            <p className="text-neutral-400 mb-8">Configure SkillsMaster system integrations and global defaults.</p>

            <div className="space-y-6 max-w-2xl">
                {/* Windows Context Menu */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-2">Windows Explorer Integration</h2>
                    <p className="text-sm text-neutral-400 mb-6">
                        Add "Open with SkillsMaster" to your right-click context menu for folders.
                    </p>
                    <div className="flex gap-4">
                        <button disabled={installingMenu} onClick={handleInstallMenu}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-6 rounded-lg transition-colors">
                            Install Context Menu
                        </button>
                        <button disabled={installingMenu} onClick={handleUninstallMenu}
                            className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 text-sm font-medium py-2 px-6 rounded-lg transition-colors">
                            Remove
                        </button>
                    </div>
                </div>

                {/* Global AI Config */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-1">Global AI Generation Engine</h2>
                    <p className="text-sm text-neutral-400 mb-6">Configure the default LLM provider for skill generation and refactoring.</p>

                    <div className="space-y-5">
                        {/* Provider + Model Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1">Provider</label>
                                <select
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-300 focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={globalProvider}
                                    onChange={(e) => {
                                        const p = e.target.value
                                        setGlobalProvider(p)
                                        saveSettings('globalProvider', p)
                                        const defaultModel = providerModels[p]?.[0] || ''
                                        setGlobalModel(defaultModel)
                                        saveSettings('globalModel', defaultModel)
                                        setNewKeyInput('')
                                    }}
                                >
                                    {providers.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="block text-xs font-medium text-neutral-500 mb-0.5">Model (Select preset or type custom)</label>
                                <div className="flex gap-2">
                                    <select
                                        className="w-2/5 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-2 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500 transition-colors"
                                        value={providerModels[globalProvider]?.includes(globalModel) ? globalModel : 'custom'}
                                        onChange={(e) => {
                                            if (e.target.value !== 'custom') {
                                                setGlobalModel(e.target.value)
                                                saveSettings('globalModel', e.target.value)
                                            }
                                        }}
                                    >
                                        {providerModels[globalProvider]?.map(m => <option key={m} value={m}>{m}</option>)}
                                        <option value="custom" className="italic bg-neutral-800 text-indigo-400">✏️ Custom Model ID...</option>
                                    </select>
                                    <input
                                        className="flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-300 focus:outline-none focus:border-indigo-500 transition-colors"
                                        value={globalModel}
                                        placeholder="e.g. my-custom-model"
                                        onChange={(e) => setGlobalModel(e.target.value)}
                                        onBlur={(e) => saveSettings('globalModel', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Per-provider API Keys Section */}
                        <div className="pt-4 border-t border-neutral-800/60">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-neutral-200">{globalProvider} API Keys</h3>
                                    <p className="text-xs text-neutral-500 mt-0.5">
                                        {isOllama
                                            ? 'No key required for local Ollama.'
                                            : currentKeys.length > 1
                                                ? `${currentKeys.length} keys stored — automatic rotation on failure enabled ✓`
                                                : 'Add multiple keys to enable automatic rotation on failure.'}
                                    </p>
                                </div>
                                {currentKeys.length > 1 && (
                                    <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-full">
                                        Auto-rotate ON
                                    </span>
                                )}
                            </div>

                            {/* Key List */}
                            {!isOllama && currentKeys.length > 0 && (
                                <div className="space-y-2 mb-3">
                                    {currentKeys.map((key, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                                            <span className="text-xs text-neutral-500 font-mono w-5 shrink-0">#{i + 1}</span>
                                            <span className="flex-1 font-mono text-xs text-neutral-400 truncate">
                                                {key.slice(0, 8)}{'•'.repeat(Math.min(20, key.length - 8))}
                                            </span>
                                            <button
                                                onClick={() => removeKey(globalProvider, i)}
                                                className="text-red-500/60 hover:text-red-400 text-xs px-1 transition-colors"
                                                title="Remove this key"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add Key Input */}
                            {!isOllama && (
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-300 focus:outline-none focus:border-indigo-500 placeholder-neutral-700 font-mono transition-colors"
                                        placeholder="Paste API key and click Add..."
                                        value={newKeyInput}
                                        onChange={(e) => setNewKeyInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') addKey() }}
                                    />
                                    <button
                                        onClick={addKey}
                                        disabled={!newKeyInput.trim()}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {statusMessage && (
                <div className="fixed bottom-4 right-4 bg-emerald-900/40 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm shadow-xl backdrop-blur-md">
                    {statusMessage}
                </div>
            )}
        </div>
    )
}
