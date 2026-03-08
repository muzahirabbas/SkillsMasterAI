// removed ReactNode

const navItems = [
    'Dashboard',
    'Skills Library',
    'Generate Skill',
    'Generate Ideas',
    'Agents',
    'Projects',
    'Settings'
]

export function Navigation({ activeTab, onTabSelect }: { activeTab: string, onTabSelect: (tab: string) => void }) {
    return (
        <nav className="flex flex-col gap-1 p-4">
            <div className="mb-8 px-2">
                <h1 className="text-xl font-bold tracking-tight text-indigo-400">SkillsMaster</h1>
                <p className="text-xs text-neutral-500 font-medium tracking-wider uppercase mt-1">Skill Manager</p>
            </div>

            {navItems.map((item) => (
                <button
                    key={item}
                    onClick={() => onTabSelect(item)}
                    className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === item
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50'
                        }`}
                >
                    {item}
                </button>
            ))}
        </nav>
    )
}
