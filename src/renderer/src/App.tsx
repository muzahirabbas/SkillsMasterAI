import { Navigation } from './components/layout/Navigation'
import { Layout } from './components/layout/Layout'
import { useState } from 'react'
import { LibraryView } from './views/LibraryView'
import { GenerateSkillView } from './views/GenerateSkillView'
import { GenerateIdeasView } from './views/GenerateIdeasView'
import { DashboardView } from './views/DashboardView'
import { SettingsView } from './views/SettingsView'
import { AgentsView } from './views/AgentsView'
import { ProjectsView } from './views/ProjectsView'

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [prefilledIdea, setPrefilledIdea] = useState<any>(null)

  return (
    <Layout sidebar={<Navigation activeTab={activeTab} onTabSelect={setActiveTab} />}>
      {activeTab === 'Dashboard' && <DashboardView />}
      {activeTab === 'Skills Library' && <LibraryView />}
      {activeTab === 'Generate Skill' && <GenerateSkillView prefilledData={prefilledIdea} clearPrefill={() => setPrefilledIdea(null)} />}
      {activeTab === 'Generate Ideas' && <GenerateIdeasView onGenerate={(idea: any) => { setPrefilledIdea(idea); setActiveTab('Generate Skill') }} />}
      {activeTab === 'Agents' && <AgentsView />}
      {activeTab === 'Projects' && <ProjectsView />}
      {activeTab === 'Settings' && <SettingsView />}
    </Layout>
  )
}

export default App
