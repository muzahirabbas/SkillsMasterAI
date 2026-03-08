import { ReactNode } from 'react'

interface LayoutProps {
  sidebar: ReactNode
  children: ReactNode
}

export function Layout({ sidebar, children }: LayoutProps) {
  return (
    <div className="flex h-screen w-full bg-neutral-950 overflow-hidden text-neutral-50">
      {/* Left Panel */}
      <aside className="w-64 border-r border-neutral-800 bg-neutral-900 flex flex-col shrink-0">
        {sidebar}
      </aside>

      {/* Center & Right content area wrapper */}
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  )
}
