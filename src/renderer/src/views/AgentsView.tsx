import { useState, useEffect } from 'react'

const AGENTS = [
    {
        name: 'Claude Code',
        description: 'Official CLI from Anthropic for Claude.',
        path: '~/.claude/skills',
        type: 'global',
        color: 'from-amber-500/20 to-amber-700/20'
    },
    {
        name: 'Gemini CLI',
        description: 'Command line interface for Google Gemini models.',
        path: '~/.gemini/commands',
        type: 'global',
        color: 'from-blue-500/20 to-blue-700/20'
    },
    {
        name: 'Cursor',
        description: 'AI code editor built for pair programming.',
        path: '.cursor/rules',
        type: 'local',
        color: 'from-neutral-500/20 to-neutral-700/20'
    },
    {
        name: 'GitHub Copilot',
        description: 'AI pair programmer integrated into your IDE.',
        path: '.github/copilot/prompts',
        type: 'local',
        color: 'from-gray-500/20 to-gray-700/20'
    },
    {
        name: 'Codex CLI',
        description: 'OpenAI Codex command line interface.',
        path: '~/.codex/skills',
        type: 'global',
        color: 'from-teal-500/20 to-teal-700/20'
    },
    {
        name: 'Antigravity IDE',
        description: 'IDE and Agent-first dev environment from DeepMind.',
        path: '~/.gemini/antigravity/skills',
        type: 'global',
        color: 'from-purple-500/20 to-purple-700/20'
    },
    {
        name: 'Windsurf',
        description: 'Next generation AI-powered IDE by Codeium.',
        path: '.windsurf/rules',
        type: 'local',
        color: 'from-cyan-500/20 to-cyan-700/20'
    }
]

export function AgentsView() {
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    const showMessage = (msg: string) => {
        setStatusMessage(msg)
        setTimeout(() => setStatusMessage(null), 4000)
    }

    const [connectedGlobalAgents, setConnectedGlobalAgents] = useState<any[]>([])
    const [enabledLocalAgents, setEnabledLocalAgents] = useState<string[]>([])
    const [_connectedProjects, setConnectedProjects] = useState<any[]>([])

    useEffect(() => {
        loadConnections()
    }, [])

    const loadConnections = async () => {
        const globalStr = await window.api.db.getSetting('connectedGlobalAgents')
        const localStr = await window.api.db.getSetting('enabledLocalAgents')
        const projectStr = await window.api.db.getSetting('connectedProjects')

        setConnectedGlobalAgents(globalStr ? JSON.parse(globalStr) : [])
        setEnabledLocalAgents(localStr ? JSON.parse(localStr) : [])
        setConnectedProjects(projectStr ? JSON.parse(projectStr) : [])
    }

    const handleConnect = async (agent: typeof AGENTS[0]) => {
        if (agent.type === 'global') {
            const resolvedPath = await window.api.db.resolvePath(agent.path)
            const isConnected = connectedGlobalAgents.find((a: any) => a.path === resolvedPath)

            let newAgents = [...connectedGlobalAgents]
            if (isConnected) {
                newAgents = newAgents.filter(a => a.path !== resolvedPath)
                showMessage(`Disconnected ${agent.name} from global sync targets.`)
            } else {
                newAgents = newAgents.filter(a => a.path !== resolvedPath)
                newAgents.push({ name: agent.name, path: resolvedPath })
                showMessage(`Connected! ${agent.name} added to global sync targets.`)
            }

            await window.api.db.setSetting('connectedGlobalAgents', JSON.stringify(newAgents))
            setConnectedGlobalAgents(newAgents)
        } else {
            // Check if already "connected" (enabled for local)
            const isConnected = enabledLocalAgents.includes(agent.name)

            if (isConnected) {
                const newLocals = enabledLocalAgents.filter(name => name !== agent.name)
                await window.api.db.setSetting('enabledLocalAgents', JSON.stringify(newLocals))
                setEnabledLocalAgents(newLocals)
                showMessage(`Disconnected ${agent.name}. Local sync disabled.`)
            } else {
                // Mark this agent type as enabled globally
                const newLocals = [...enabledLocalAgents, agent.name]
                await window.api.db.setSetting('enabledLocalAgents', JSON.stringify(newLocals))
                setEnabledLocalAgents(newLocals)
                showMessage(`Connected! ${agent.name} is now enabled for all active projects.`)
            }
        }
    }

    const handleReset = async () => {
        await window.api.db.setSetting('connectedGlobalAgents', '[]')
        setConnectedGlobalAgents([])
        showMessage('Global connections forcefully reset.')
    }

    const isAgentConnected = (agent: typeof AGENTS[0]) => {
        if (agent.type === 'global') {
            return !!connectedGlobalAgents.find(a => a.name === agent.name)
        }
        return enabledLocalAgents.includes(agent.name)
    }

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Connected Agents</h1>
                    <p className="text-neutral-400">Link SkillsMaster to your favorite AI coding agents to seamless sync skills directly into their active contexts.</p>
                </div>
                <button onClick={handleReset} className="text-xs bg-red-900/20 text-red-500 hover:bg-red-900/40 px-3 py-1.5 rounded border border-red-900/30 transition-colors">
                    Reset Connections
                </button>
            </div>

            <div className="grid grid-cols-2 gap-6 max-w-4xl">
                {AGENTS.map(agent => (
                    <div key={agent.name} className={`bg-gradient-to-br ${agent.color} border border-neutral-800 rounded-xl p-6 relative overflow-hidden group hover:border-neutral-600 transition-colors`}>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <h3 className="text-xl font-bold text-neutral-200">{agent.name}</h3>
                                <div className="mt-1">
                                    <span className="text-[10px] uppercase font-bold tracking-wider bg-black/40 text-neutral-400 px-2 py-0.5 rounded">
                                        {agent.type === 'global' ? 'System-Wide' : 'Project-Local'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-neutral-400 mb-6 relative z-10">{agent.description}</p>

                        <div className="flex items-center justify-between relative z-10">
                            <code className="text-xs font-mono text-neutral-500 bg-black/40 px-2 py-1 rounded">
                                {agent.path}
                            </code>
                            <button onClick={() => handleConnect(agent)} className={`text-sm font-bold min-w-[120px] py-2 px-4 rounded-xl transition-all active:scale-95 border-2 ${isAgentConnected(agent)
                                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                                }`}>
                                {isAgentConnected(agent) ? 'Disconnect' : 'Connect'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {statusMessage && (
                <div className="fixed bottom-4 right-4 bg-emerald-900/40 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm shadow-xl backdrop-blur-md z-50">
                    {statusMessage}
                </div>
            )}
        </div>
    )
}
