import { ipcMain } from 'electron'
import { getDatabase } from './database'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { scanLibrary } from './library'

interface GenerateSkillRequest {
  provider: string
  apiKey: string
  model: string
  name: string
  description: string
  category: string
  targetLanguage?: string
  framework?: string
  toolsUsed?: string
  // New enriched context fields
  projectType?: string       // e.g. "Web App", "CLI Tool", "API / Backend"
  agentTarget?: string       // e.g. "Claude", "Cursor", "Copilot"
  complexity?: string        // "Simple" | "Medium" | "Complex"
  outputStyle?: string       // "Step-by-Step" | "Checklist" | "Direct Rules"
  tone?: string              // "Strict" | "Balanced" | "Flexible"
  additionalInstructions?: string  // free-text extra instructions
  author: string
}

interface GenerateIdeaRequest {
  provider: string
  apiKey: string
  model: string
  projectPath: string
  // New enriched context fields
  userInstructions?: string  // what the user says their project is about
  goalDescription?: string   // what they want to build / improve
  agentTarget?: string       // which agent will use these skills
}

interface RefactorSkillRequest {
  skillId: string
  provider: string
  apiKey: string
  model: string
  prompt: string
}

function getSystemPromptForCategory(category: string, targetLanguage?: string, framework?: string, toolsUsed?: string, projectType?: string, agentTarget?: string, complexity?: string, outputStyle?: string, tone?: string): string {
  const ctxParts = [
    targetLanguage ? `Target Language: ${targetLanguage}` : '',
    framework ? `Framework: ${framework}` : '',
    toolsUsed ? `Tools Available: ${toolsUsed}` : '',
    projectType ? `Project Type: ${projectType}` : '',
    agentTarget ? `Target AI Agent/IDE: ${agentTarget}` : '',
    complexity ? `Skill Complexity Level: ${complexity}` : '',
    outputStyle ? `Preferred Output Style: ${outputStyle}` : '',
    tone ? `Instruction Tone: ${tone}` : ''
  ].filter(Boolean).join('\n- ')

  const contextNote = ctxParts ? `\n\nUser-specified context (MUST be reflected in the skill):\n- ${ctxParts}` : ''

  if (category === 'Workflow') {
    return `You are a Senior Systems Architect designing a multi-step execution workflow for an autonomous coding agent.
Your objective is to generate a \`SKILL.md\` file that guides the agent through a complex, multi-phase task.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Structure the workflow into distinct, sequential phases (e.g., Phase 1: Discovery, Phase 2: Execution, Phase 3: Validation).
3. MANDATORY: Include strict "Halt and Confirm" checkpoints where the agent MUST ask the user for approval before proceeding to the next destructive or complex phase.
4. Detail exactly what context the agent should gather before starting Step 1.
5. Define failure states and recovery steps (what the agent should do if a command fails).

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`
  }

  if (category === 'Tool') {
    return `You are a DevOps Engineer specializing in AI tool integration.
Your objective is to generate a \`SKILL.md\` file that teaches an autonomous coding agent how to use a specific CLI tool, script, or Model Context Protocol (MCP) server.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Clearly define the Tool/CLI environment requirements.
3. If relevant, include a specific \`# MCP Server Requirements\` section detailing exactly what MCP server the user needs to configure.
4. Provide exact command-line syntax and parameter definitions.
5. Include a \`# Common Workflows\` or \`# Examples\` section showing exact copy-paste examples of how the agent should invoke the tool.
6. Outline common error codes or outputs the tool generates and how the agent should parse/handle them.

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`
  }

  // Default: 'Prompt' or any other category
  return `You are an elite Prompt Engineer designing a strict instruction set for an autonomous coding agent.
Your objective is to generate a highly effective \`SKILL.md\` file based on the user's request.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Use clear, hierarchical Markdown headers (## Context, ## Objective, ## Strict Rules, ## Output Format).
3. Be highly prescriptive. Use imperative language ("Do X", "Never do Y").
4. Define constraints clearly to prevent AI hallucinations.
5. Provide a strict output template if the user requests a specific format.

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Strips markdown code fences and returns clean text */
function cleanMarkdown(raw: string): string {
  return raw
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

/** Calls the Gemini REST API and returns the text response, throwing on API errors */
async function callGemini(model: string, apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.error) {
    throw new Error(`Gemini API error (${data.error.code ?? res.status}): ${data.error.message ?? JSON.stringify(data.error)}`)
  }
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(data)}`)
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason
    throw new Error(`Gemini returned empty content${reason ? ` (finishReason: ${reason})` : ''}. Check your model name and API key.`)
  }
  return text
}

/** Shared provider → endpoint map used by all handlers */
const PROVIDER_URLS: Record<string, string> = {
  OpenAI:       'https://api.openai.com/v1/chat/completions',
  xAI:          'https://api.x.ai/v1/chat/completions',
  Ollama:       'http://127.0.0.1:11434/v1/chat/completions',
  Alibaba:      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  OpenRouter:   'https://openrouter.ai/api/v1/chat/completions',
  Groq:         'https://api.groq.com/openai/v1/chat/completions',
  DeepSeek:     'https://api.deepseek.com/v1/chat/completions',
  Moonshot:     'https://api.moonshot.cn/v1/chat/completions',
  'Together AI':'https://api.together.xyz/v1/chat/completions',
  NVIDIA:       'https://integrate.api.nvidia.com/v1/chat/completions',
  Anthropic:    'https://api.anthropic.com/v1/messages'
}

export function setupAiIpcHandlers() {
  ipcMain.handle('generateSkill', async (_event, req: GenerateSkillRequest) => {
    try {
      // 1. Dynamic system prompt based on category
      const systemPrompt = getSystemPromptForCategory(
        req.category,
        req.targetLanguage,
        req.framework,
        req.toolsUsed,
        req.projectType,
        req.agentTarget,
        req.complexity,
        req.outputStyle,
        req.tone
      )

      const extraInstructions = req.additionalInstructions ? `\n\nAdditional instructions from user: ${req.additionalInstructions}` : ''
      const userPrompt = `Create a skill named "${req.name}".
Description: ${req.description}${extraInstructions}

Provide the raw SKILL.md markdown content only.`


      let generatedMarkdown = ''

      // 2. Load key pool for this provider & call
      const db = getDatabase()
      const storedKeys = db.prepare('SELECT value FROM settings WHERE key = ?').get(`apiKeys_${req.provider}`) as any
      const keyPool: string[] = storedKeys ? JSON.parse(storedKeys.value) : (req.apiKey ? [req.apiKey] : [])
      const effectiveKey = keyPool[0] || req.apiKey || ''


      if (req.provider === 'Google') {
        generatedMarkdown = await callGemini(req.model, effectiveKey, systemPrompt, userPrompt)
      } else if (PROVIDER_URLS[req.provider]) {
        const pool = req.provider === 'Ollama' ? ['none'] : keyPool
        generatedMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool, systemPrompt, userPrompt)
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`)
      }

      if (!generatedMarkdown) {
        throw new Error('Failed to generate skill content (empty response)')
      }

      // 3. Save to filesystem
      const sanitizedName = req.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
      const sanitizedAuthor = req.author.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
      const targetDir = path.join(os.homedir(), '.skillsmaster', 'skills', sanitizedName, 'v1.0')

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      // Prepare metadata.json (still kept for backward compatibility/fast registry scanning)
      const metadata = {
        namespace: `${sanitizedAuthor}.${sanitizedName}`,
        name: sanitizedName,
        category: req.category,
        description: req.description
      }

      // Clean markdown block ticks
      generatedMarkdown = cleanMarkdown(generatedMarkdown)

      // Ensure Markdown has YAML frontmatter (fallback if LLM missed it)
      if (!generatedMarkdown.startsWith('---')) {
        const frontmatter = `---\nname: ${req.name}\ndescription: ${req.description}\nversion: 1.0\n---\n\n`
        generatedMarkdown = frontmatter + generatedMarkdown
      }

      // Output files
      fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), generatedMarkdown)
      
      // Auto-extract examples block or just make generic
      const exampleStr = '# Examples\\n\\nAdd specific testing inputs and outputs here.'
      fs.writeFileSync(path.join(targetDir, 'examples.md'), exampleStr)

      // 4. Force library scan so DB syncs the new skill
      scanLibrary()

      return { success: true, namespace: metadata.namespace }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('generateIdeas', async (_event, req: GenerateIdeaRequest) => {
    try {
      // ── Deep Project Scanner (Task 1) ─────────────────────────────────────
      if (!fs.existsSync(req.projectPath)) throw new Error('Directory does not exist')

      const IGNORED_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', 'build', '.next', 'out', 'coverage', '.turbo'])

      // 1. Build directory tree (3 levels deep)
      function walkTree(dir: string, depth: number): string {
        if (depth > 3) return ''
        let out = ''
        let entries: string[]
        try { entries = fs.readdirSync(dir) } catch { return '' }
        for (const entry of entries) {
          if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue
          const full = path.join(dir, entry)
          const stat = fs.statSync(full)
          const indent = '  '.repeat(depth)
          if (stat.isDirectory()) {
            out += `${indent}📁 ${entry}/\n`
            if (depth < 3) out += walkTree(full, depth + 1)
          } else {
            out += `${indent}📄 ${entry}\n`
          }
        }
        return out
      }
      const directoryTree = walkTree(req.projectPath, 0)

      // 2. Read key config files
      let contextStr = `## Directory Structure\n\`\`\`\n${directoryTree || '(empty)'}\n\`\`\`\n\n`

      const filesToCheck = ['package.json', 'requirements.txt', 'README.md', 'claude.md', 'gemini.md', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'composer.json']
      for (const f of filesToCheck) {
        const filePath = path.join(req.projectPath, f)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8').substring(0, 1500)
          contextStr += `## ${f}\n\`\`\`\n${content}\n\`\`\`\n\n`
        }
      }

      // 3. Detect recent error logs (last 50 lines)
      let errorContext = ''
      const logPatterns = ['npm-debug.log', 'yarn-error.log', 'error.log', 'app.log']
      for (const logName of logPatterns) {
        const logPath = path.join(req.projectPath, logName)
        if (fs.existsSync(logPath)) {
          const lines = fs.readFileSync(logPath, 'utf8').split('\n').slice(-50).join('\n')
          errorContext += `## Error Log: ${logName} (last 50 lines)\n\`\`\`\n${lines}\n\`\`\`\n\n`
          break // only include first found log
        }
      }

      if (errorContext) contextStr += errorContext

      // ── AI Prompt with Deep Context ────────────────────────────────────────
      // Build user context section from new optional fields
      const userContextParts: string[] = []
      if (req.userInstructions) userContextParts.push(`Project Description (by user): ${req.userInstructions}`)
      if (req.goalDescription) userContextParts.push(`Goals / What to Build: ${req.goalDescription}`)
      if (req.agentTarget) userContextParts.push(`Target AI Agent/IDE: ${req.agentTarget}`)
      const userContextBlock = userContextParts.length > 0
        ? `\n\n## User-Provided Context\n${userContextParts.join('\n')}`
        : ''

      const systemPrompt = `You are an expert AI coding assistant analyzing a real project's architecture.
The user wants to generate AI coding agent skill ideas based on the ACTUAL structure and state of their project.
You MUST analyze the directory tree, tech stack, error logs, AND any user-provided context/goals below.

PRIORITY: If the user has provided goals or project descriptions, those take HIGHEST priority when suggesting skills.
Suggest skills that directly address what the user says they want to build or improve.

Suggest exactly 4 highly specific, actionable skills. DO NOT suggest generic skills.
Each skill must be something a coding agent could realistically use to improve THIS specific project.

Respond ONLY with a valid JSON array of 4-20 objects. Each must have:
- name: short lowercase dashed name (e.g. "batch-3d-export-workflow")
- category: one of "Prompt", "Workflow", or "Tool"
- description: one specific sentence referencing the actual project structure or user goals`

      const userPrompt = `Project Context:${userContextBlock}\n\n${contextStr}`

      let resultStr = ''

      // Load key pool from DB
      const storedKeys2 = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(`apiKeys_${req.provider}`) as any
      const keyPool2: string[] = storedKeys2 ? JSON.parse(storedKeys2.value) : (req.apiKey ? [req.apiKey] : [])
      const effectiveKey2 = keyPool2[0] || req.apiKey || ''


      if (req.provider === 'Google') {
        resultStr = await callGemini(req.model, effectiveKey2, systemPrompt, userPrompt)
      } else if (PROVIDER_URLS[req.provider]) {
        const pool2 = req.provider === 'Ollama' ? ['none'] : keyPool2
        resultStr = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool2, systemPrompt, userPrompt)
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`)
      }

      if (!resultStr) throw new Error('AI returned an empty response. Check your API key and model selection.')

      // Robust JSON extraction: strip markdown fences, then find the JSON array
      let cleaned = resultStr.replace(/```json/gi, '').replace(/```/gi, '').trim()
      // Find the first [ ... ] block in case the AI added preamble text
      const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) cleaned = jsonMatch[0]

      let ideas: any[]
      try {
        ideas = JSON.parse(cleaned)
      } catch {
        throw new Error(`AI response was not valid JSON. Raw response: ${cleaned.substring(0, 200)}`)
      }

      return { success: true, ideas }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('refactorSkill', async (_event, req: RefactorSkillRequest) => {
    try {
      const db = getDatabase()
      
      const skillRow = db.prepare('SELECT name, namespace FROM skills WHERE id = ?').get(req.skillId) as any
      if (!skillRow) throw new Error('Skill not found in database')
        
      const versionRow = db.prepare('SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1').get(req.skillId) as any
      if (!versionRow) throw new Error('Skill version not found')
        
      const currentVersion = versionRow.version
      const skillsPath = path.join(os.homedir(), '.skillsmaster', 'skills')
      const targetFolderId = skillRow.name // since generator uses just the name for folder
      const oldVersionPath = path.join(skillsPath, targetFolderId, currentVersion)
      
      if (!fs.existsSync(path.join(oldVersionPath, 'skill.md')) && !fs.existsSync(path.join(oldVersionPath, 'SKILL.md'))) {
        throw new Error('Could not read existing skill.md or SKILL.md on disk')
      }

      const existingFileName = fs.existsSync(path.join(oldVersionPath, 'SKILL.md')) ? 'SKILL.md' : 'skill.md'
      const existingMarkdown = fs.readFileSync(path.join(oldVersionPath, existingFileName), 'utf8')
      let existingMetadata = {}
      try {
        existingMetadata = JSON.parse(fs.readFileSync(path.join(oldVersionPath, 'metadata.json'), 'utf8'))
      } catch (e) {}

      // LLM call
      const systemPrompt = `You are an expert AI agent manager. The user wants to refactor an existing Anthropic-style skill for a coding agent.
Respond ONLY with the complete, updated raw Markdown for the skill's instructions. Keep all existing good parts.
Ensure the top of the file contains YAML frontmatter.`

      const userPrompt = `Existing Skill:\n\n${existingMarkdown}\n\nRefactoring Instructions:\n${req.prompt}`

      let newMarkdown = ''

      // Load key pool from DB
      const storedKeys3 = db.prepare('SELECT value FROM settings WHERE key = ?').get(`apiKeys_${req.provider}`) as any
      const keyPool3: string[] = storedKeys3 ? JSON.parse(storedKeys3.value) : (req.apiKey ? [req.apiKey] : [])
      const effectiveKey3 = keyPool3[0] || req.apiKey || ''


      if (req.provider === 'Google') {
        newMarkdown = await callGemini(req.model, effectiveKey3, systemPrompt, userPrompt)
      } else if (PROVIDER_URLS[req.provider]) {
        const pool3 = req.provider === 'Ollama' ? ['none'] : keyPool3
        newMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool3, systemPrompt, userPrompt)
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`)
      }

      if (!newMarkdown) throw new Error('Generated markdown was empty')
      newMarkdown = cleanMarkdown(newMarkdown)

      // Calculate new version
      let newVersionStr = 'v1.1'
      const match = currentVersion.match(/v(\d+)\.(\d+)/)
      if (match) {
        newVersionStr = `v${match[1]}.${parseInt(match[2], 10) + 1}`
      }

      const newVersionPath = path.join(skillsPath, targetFolderId, newVersionStr)
      if (!fs.existsSync(newVersionPath)) fs.mkdirSync(newVersionPath, { recursive: true })

      fs.writeFileSync(path.join(newVersionPath, 'metadata.json'), JSON.stringify(existingMetadata, null, 2))
      fs.writeFileSync(path.join(newVersionPath, 'SKILL.md'), newMarkdown)

      if (fs.existsSync(path.join(oldVersionPath, 'examples.md'))) {
        fs.copyFileSync(path.join(oldVersionPath, 'examples.md'), path.join(newVersionPath, 'examples.md'))
      }

      scanLibrary()

      return { success: true, newVersion: newVersionStr }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  // ─── PREVIEW: Generate new markdown but DO NOT save yet ──────────────────
  ipcMain.handle('previewRefactorSkill', async (_event, req: RefactorSkillRequest) => {
    try {
      const db = getDatabase()

      const skillRow = db.prepare('SELECT name, namespace FROM skills WHERE id = ?').get(req.skillId) as any
      if (!skillRow) throw new Error('Skill not found in database')

      const versionRow = db.prepare('SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1').get(req.skillId) as any
      if (!versionRow) throw new Error('Skill version not found')

      const currentVersion = versionRow.version
      const skillsPath = path.join(os.homedir(), '.skillsmaster', 'skills')
      const oldVersionPath = path.join(skillsPath, skillRow.name, currentVersion)

      if (!fs.existsSync(path.join(oldVersionPath, 'skill.md')) && !fs.existsSync(path.join(oldVersionPath, 'SKILL.md'))) {
        throw new Error('Could not read existing SKILL.md on disk')
      }

      const existingFileName = fs.existsSync(path.join(oldVersionPath, 'SKILL.md')) ? 'SKILL.md' : 'skill.md'
      const oldMarkdown = fs.readFileSync(path.join(oldVersionPath, existingFileName), 'utf8')

      const systemPrompt = `You are an expert AI agent manager. The user wants to refactor an existing Anthropic-style skill for a coding agent.
Respond ONLY with the complete, updated raw Markdown for the skill's instructions. Keep all existing good parts.
Ensure the top of the file contains YAML frontmatter.`
      const userPrompt = `Existing Skill:\n\n${oldMarkdown}\n\nRefactoring Instructions:\n${req.prompt}`

      const storedKeys = db.prepare('SELECT value FROM settings WHERE key = ?').get(`apiKeys_${req.provider}`) as any
      const keyPool: string[] = storedKeys ? JSON.parse(storedKeys.value) : (req.apiKey ? [req.apiKey] : [])
      const effectiveKey = keyPool[0] || req.apiKey || ''

      let newMarkdown = ''
      if (req.provider === 'Google') {
        newMarkdown = await callGemini(req.model, effectiveKey, systemPrompt, userPrompt)
      } else if (PROVIDER_URLS[req.provider]) {
        const pool = req.provider === 'Ollama' ? ['none'] : keyPool
        newMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool, systemPrompt, userPrompt)
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`)
      }

      if (!newMarkdown) throw new Error('AI returned empty markdown')
      newMarkdown = cleanMarkdown(newMarkdown)

      // Calculate what the next version string would be (for display, not saving yet)
      const match = currentVersion.match(/v(\d+)\.(\d+)/)
      const nextVersion = match ? `v${match[1]}.${parseInt(match[2], 10) + 1}` : 'v1.1'

      return { success: true, oldMarkdown, newMarkdown, currentVersion, nextVersion, skillName: skillRow.name }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })

  // ─── COMMIT: Save the previewed refactor (replace or new-version) ─────────
  ipcMain.handle('commitRefactorSkill', async (_event, req: {
    skillId: string
    skillName: string
    currentVersion: string
    nextVersion: string
    newMarkdown: string
    mode: 'replace' | 'new-version'
  }) => {
    try {
      const skillsPath = path.join(os.homedir(), '.skillsmaster', 'skills')
      const currentVersionPath = path.join(skillsPath, req.skillName, req.currentVersion)

      let existingMetadata = {}
      try {
        existingMetadata = JSON.parse(fs.readFileSync(path.join(currentVersionPath, 'metadata.json'), 'utf8'))
      } catch (e) {}

      if (req.mode === 'replace') {
        // Overwrite the SKILL.md in the SAME version folder
        const fileName = fs.existsSync(path.join(currentVersionPath, 'SKILL.md')) ? 'SKILL.md' : 'skill.md'
        fs.writeFileSync(path.join(currentVersionPath, fileName), req.newMarkdown)
      } else {
        // Save as new version alongside the old one
        const newVersionPath = path.join(skillsPath, req.skillName, req.nextVersion)
        if (!fs.existsSync(newVersionPath)) fs.mkdirSync(newVersionPath, { recursive: true })
        fs.writeFileSync(path.join(newVersionPath, 'metadata.json'), JSON.stringify(existingMetadata, null, 2))
        fs.writeFileSync(path.join(newVersionPath, 'SKILL.md'), req.newMarkdown)

        // Copy examples if they exist
        const examplesFile = path.join(currentVersionPath, 'examples.md')
        if (fs.existsSync(examplesFile)) {
          fs.copyFileSync(examplesFile, path.join(newVersionPath, 'examples.md'))
        }
      }

      scanLibrary()
      return { success: true, savedVersion: req.mode === 'replace' ? req.currentVersion : req.nextVersion }
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err.message }
    }
  })
}




async function callChatCompletionWithPool(endpoint: string, model: string, keys: string[], system: string, user: string): Promise<string> {
  if (!keys || keys.length === 0) throw new Error('No API keys configured for this provider.')

  const isAnthropic = endpoint.includes('anthropic.com')

  // Shuffle keys so we don't always hit the same one first
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  let lastError: Error | null = null

  for (const key of shuffled) {
    try {
      // Anthropic uses a different request/response shape
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (key !== 'none') {
        if (isAnthropic) {
          headers['x-api-key'] = key
          headers['anthropic-version'] = '2023-06-01'
        } else {
          headers['Authorization'] = `Bearer ${key}`
        }
      }

      const bodyObj = isAnthropic
        ? { model, max_tokens: 8192, system, messages: [{ role: 'user', content: user }] }
        : { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }

      const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(bodyObj) })

      if (!resp.ok) {
        const txt = await resp.text()
        // Retry on auth/rate-limit errors
        if (resp.status === 401 || resp.status === 429 || resp.status === 403) {
          console.warn(`Key rejected (HTTP ${resp.status}), trying next key...`)
          lastError = new Error(`Provider Error HTTP ${resp.status}: ${txt}`)
          continue
        }
        throw new Error(`Provider Error HTTP ${resp.status}: ${txt}`)
      }

      const data = await resp.json()

      // Anthropic SDK response: { content: [{ type: 'text', text: '...' }] }
      if (isAnthropic) {
        const text = data.content?.[0]?.text ?? ''
        if (!text && data.error) throw new Error(`Anthropic error: ${JSON.stringify(data.error)}`)
        return text
      }

      // OpenAI-compatible response
      const text = data.choices?.[0]?.message?.content ?? ''
      if (!text && data.error) throw new Error(`API error: ${JSON.stringify(data.error)}`)
      return text
    } catch (err: any) {
      if (err === lastError) continue
      throw err
    }
  }

  throw lastError || new Error('All API keys exhausted for this provider.')
}


