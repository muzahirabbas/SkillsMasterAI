"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const fs = require("fs");
const Database = require("better-sqlite3");
const os = require("os");
const child_process = require("child_process");
const AdmZip = require("adm-zip");
const icon = path.join(__dirname, "../../resources/icon.png");
let db;
function initDatabase() {
  const userDataPath = electron.app.getPath("userData");
  const skillsmasterDir = path.join(userDataPath, "skillsmaster");
  if (!fs.existsSync(skillsmasterDir)) {
    fs.mkdirSync(skillsmasterDir, { recursive: true });
  }
  const dbPath = path.join(skillsmasterDir, "skillsmaster.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT,
      namespace TEXT,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS versions (
      skill_id TEXT,
      version TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (skill_id, version),
      FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT,
      version TEXT,
      path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(skill_id, version) REFERENCES versions(skill_id, version) ON DELETE CASCADE
    );
  `);
  const catCount = db.prepare("SELECT count(*) as count FROM categories").get();
  if (catCount.count === 0) {
    const insertCat = db.prepare("INSERT INTO categories (name) VALUES (?)");
    insertCat.run("Basic Skill");
    insertCat.run("Advanced Skill");
    insertCat.run("Tool Skill");
  }
  setupIpcHandlers();
}
function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
function setupIpcHandlers() {
  electron.ipcMain.handle("db:getSkills", () => {
    return db.prepare("SELECT * FROM skills ORDER BY name ASC").all();
  });
  electron.ipcMain.handle("db:getVersions", (_, skillId) => {
    return db.prepare("SELECT * FROM versions WHERE skill_id = ? ORDER BY version DESC").all(skillId);
  });
  electron.ipcMain.handle("db:getRecentInstalls", () => {
    return db.prepare(`
      SELECT i.path, i.created_at, s.name, s.description 
      FROM installations i
      JOIN skills s ON i.skill_id = s.id
      ORDER BY i.created_at DESC 
      LIMIT 10
    `).all();
  });
}
function setupLibraryIpcHandlers() {
  electron.ipcMain.handle("db:scanLibrary", () => {
    scanLibrary();
  });
}
function scanLibrary() {
  const db2 = getDatabase();
  const skillsPath = path.join(os.homedir(), ".skillsmaster", "skills");
  if (!fs.existsSync(skillsPath)) {
    fs.mkdirSync(skillsPath, { recursive: true });
    return;
  }
  const skillFolders = fs.readdirSync(skillsPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());
  for (const skillFolder of skillFolders) {
    const fullFolderPath = path.join(skillsPath, skillFolder.name);
    const versionFolders = fs.readdirSync(fullFolderPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());
    for (const versionFolder of versionFolders) {
      const versionPath = path.join(fullFolderPath, versionFolder.name);
      const metadataPath = path.join(versionPath, "metadata.json");
      if (fs.existsSync(metadataPath)) {
        try {
          const content = fs.readFileSync(metadataPath, "utf8");
          const metadata = JSON.parse(content);
          const id = metadata.namespace || `unknown.${skillFolder.name}`;
          const parts = id.split(".");
          const author = parts[0];
          const name = parts.slice(1).join(".") || id;
          const category = metadata.category || "Basic Skill";
          const description = metadata.description || "";
          const version = versionFolder.name;
          db2.prepare(`
            INSERT OR REPLACE INTO skills (id, name, namespace, category, description)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, name, author, category, description);
          db2.prepare(`
            INSERT OR IGNORE INTO versions (skill_id, version)
            VALUES (?, ?)
          `).run(id, version);
        } catch (err) {
          console.error(`Failed to parse metadata for ${skillFolder.name}/${versionFolder.name}`, err);
        }
      }
    }
  }
  console.log("Library scan completed");
}
function setupAttachmentIpcHandlers() {
  electron.ipcMain.handle("attachSkill", async (event, skillId) => {
    const db2 = getDatabase();
    const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) return { success: false, error: "No browser window" };
    const result = await electron.dialog.showOpenDialog(browserWindow, {
      properties: ["openDirectory"],
      title: "Select target project or agent directory"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    const targetPath = result.filePaths[0];
    const versionRow = db2.prepare("SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1").get(skillId);
    if (!versionRow) {
      return { success: false, error: "Skill version not found" };
    }
    const version = versionRow.version;
    const skillRow = db2.prepare("SELECT name FROM skills WHERE id = ?").get(skillId);
    const skillsLibraryPath = path.join(os.homedir(), ".skillsmaster", "skills");
    const sourcePath = path.join(skillsLibraryPath, skillRow.name, version);
    const targetSkillFolder = path.join(targetPath, ".skills", skillRow.name);
    try {
      if (!fs.existsSync(path.join(targetPath, ".skills"))) {
        fs.mkdirSync(path.join(targetPath, ".skills"), { recursive: true });
      }
      fs.cpSync(sourcePath, targetSkillFolder, { recursive: true, force: true });
      db2.prepare("INSERT INTO installations (skill_id, version, path) VALUES (?, ?, ?)").run(skillId, version, targetSkillFolder);
      return { success: true, target: targetSkillFolder };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("syncSkillToTarget", async (_, skillId, targetPath) => {
    const db2 = getDatabase();
    const versionRow = db2.prepare("SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1").get(skillId);
    if (!versionRow) {
      return { success: false, error: "Skill version not found" };
    }
    const version = versionRow.version;
    const skillRow = db2.prepare("SELECT name FROM skills WHERE id = ?").get(skillId);
    const skillsLibraryPath = path.join(os.homedir(), ".skillsmaster", "skills");
    const sourcePath = path.join(skillsLibraryPath, skillRow.name, version);
    const targetSkillFolder = path.join(targetPath, skillRow.name);
    try {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      fs.cpSync(sourcePath, targetSkillFolder, { recursive: true, force: true });
      db2.prepare("INSERT INTO installations (skill_id, version, path) VALUES (?, ?, ?)").run(skillId, version, targetSkillFolder);
      return { success: true, target: targetSkillFolder };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("unsyncSkill", async (_, skillId, targetPath) => {
    const db2 = getDatabase();
    try {
      const skillRow = db2.prepare("SELECT name FROM skills WHERE id = ?").get(skillId);
      if (!skillRow) return { success: false, error: "Skill not found" };
      if (targetPath === "EVERYWHERE") {
        const installs = db2.prepare("SELECT path FROM installations WHERE skill_id = ?").all(skillId);
        for (const inst of installs) {
          if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true });
        }
        db2.prepare("DELETE FROM installations WHERE skill_id = ?").run(skillId);
      } else {
        const targetSkillFolder = path.join(targetPath, skillRow.name);
        console.log("== UNSYNC DEBUG ==");
        console.log("targetPath from UI:", targetPath);
        console.log("targetSkillFolder normalized:", targetSkillFolder);
        const exactInstalls = db2.prepare(`SELECT path FROM installations WHERE skill_id = ? AND (path = ? OR path LIKE ? || '%')`).all(skillId, targetSkillFolder, targetPath);
        console.log("exactInstalls found in DB:", exactInstalls);
        if (exactInstalls.length > 0) {
          for (const inst of exactInstalls) {
            if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true });
            db2.prepare("DELETE FROM installations WHERE skill_id = ? AND path = ?").run(skillId, inst.path);
          }
        } else {
          if (fs.existsSync(targetSkillFolder)) fs.rmSync(targetSkillFolder, { recursive: true, force: true });
          db2.prepare("DELETE FROM installations WHERE skill_id = ? AND path = ?").run(skillId, targetSkillFolder);
        }
      }
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("deleteSkill", async (_, skillId) => {
    const db2 = getDatabase();
    try {
      const skillRow = db2.prepare("SELECT name FROM skills WHERE id = ?").get(skillId);
      if (!skillRow) return { success: false, error: "Skill not found" };
      const installs = db2.prepare("SELECT path FROM installations WHERE skill_id = ?").all(skillId);
      for (const inst of installs) {
        if (fs.existsSync(inst.path)) fs.rmSync(inst.path, { recursive: true, force: true });
      }
      const skillsLibraryPath = path.join(os.homedir(), ".skillsmaster", "skills", skillRow.name);
      if (fs.existsSync(skillsLibraryPath)) {
        fs.rmSync(skillsLibraryPath, { recursive: true, force: true });
      }
      db2.prepare("DELETE FROM skills WHERE id = ?").run(skillId);
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
}
function getSystemPromptForCategory(category, targetLanguage, framework, toolsUsed, projectType, agentTarget, complexity, outputStyle, tone) {
  const ctxParts = [
    targetLanguage ? `Target Language: ${targetLanguage}` : "",
    framework ? `Framework: ${framework}` : "",
    toolsUsed ? `Tools Available: ${toolsUsed}` : "",
    projectType ? `Project Type: ${projectType}` : "",
    agentTarget ? `Target AI Agent/IDE: ${agentTarget}` : "",
    complexity ? `Skill Complexity Level: ${complexity}` : "",
    outputStyle ? `Preferred Output Style: ${outputStyle}` : "",
    tone ? `Instruction Tone: ${tone}` : ""
  ].filter(Boolean).join("\n- ");
  const contextNote = ctxParts ? `

User-specified context (MUST be reflected in the skill):
- ${ctxParts}` : "";
  if (category === "Workflow") {
    return `You are a Senior Systems Architect designing a multi-step execution workflow for an autonomous coding agent.
Your objective is to generate a \`SKILL.md\` file that guides the agent through a complex, multi-phase task.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Structure the workflow into distinct, sequential phases (e.g., Phase 1: Discovery, Phase 2: Execution, Phase 3: Validation).
3. MANDATORY: Include strict "Halt and Confirm" checkpoints where the agent MUST ask the user for approval before proceeding to the next destructive or complex phase.
4. Detail exactly what context the agent should gather before starting Step 1.
5. Define failure states and recovery steps (what the agent should do if a command fails).

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`;
  }
  if (category === "Tool") {
    return `You are a DevOps Engineer specializing in AI tool integration.
Your objective is to generate a \`SKILL.md\` file that teaches an autonomous coding agent how to use a specific CLI tool, script, or Model Context Protocol (MCP) server.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Clearly define the Tool/CLI environment requirements.
3. If relevant, include a specific \`# MCP Server Requirements\` section detailing exactly what MCP server the user needs to configure.
4. Provide exact command-line syntax and parameter definitions.
5. Include a \`# Common Workflows\` or \`# Examples\` section showing exact copy-paste examples of how the agent should invoke the tool.
6. Outline common error codes or outputs the tool generates and how the agent should parse/handle them.

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`;
  }
  return `You are an elite Prompt Engineer designing a strict instruction set for an autonomous coding agent.
Your objective is to generate a highly effective \`SKILL.md\` file based on the user's request.

CRITICAL RULES:
1. ALWAYS start the file with YAML frontmatter containing: name, description, version (default to 1.0.0).
2. Use clear, hierarchical Markdown headers (## Context, ## Objective, ## Strict Rules, ## Output Format).
3. Be highly prescriptive. Use imperative language ("Do X", "Never do Y").
4. Define constraints clearly to prevent AI hallucinations.
5. Provide a strict output template if the user requests a specific format.

Do not include conversational filler in your response. Output ONLY the raw Markdown file content.${contextNote}`;
}
function cleanMarkdown(raw) {
  return raw.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}
async function callGemini(model, apiKey, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }]
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Gemini API error (${data.error.code ?? res.status}): ${data.error.message ?? JSON.stringify(data.error)}`);
  }
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned empty content${reason ? ` (finishReason: ${reason})` : ""}. Check your model name and API key.`);
  }
  return text;
}
const PROVIDER_URLS = {
  OpenAI: "https://api.openai.com/v1/chat/completions",
  xAI: "https://api.x.ai/v1/chat/completions",
  Ollama: "http://127.0.0.1:11434/v1/chat/completions",
  Alibaba: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  OpenRouter: "https://openrouter.ai/api/v1/chat/completions",
  Groq: "https://api.groq.com/openai/v1/chat/completions",
  DeepSeek: "https://api.deepseek.com/v1/chat/completions",
  Moonshot: "https://api.moonshot.cn/v1/chat/completions",
  "Together AI": "https://api.together.xyz/v1/chat/completions",
  NVIDIA: "https://integrate.api.nvidia.com/v1/chat/completions",
  Anthropic: "https://api.anthropic.com/v1/messages"
};
function setupAiIpcHandlers() {
  electron.ipcMain.handle("generateSkill", async (_event, req) => {
    try {
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
      );
      const extraInstructions = req.additionalInstructions ? `

Additional instructions from user: ${req.additionalInstructions}` : "";
      const userPrompt = `Create a skill named "${req.name}".
Description: ${req.description}${extraInstructions}

Provide the raw SKILL.md markdown content only.`;
      let generatedMarkdown = "";
      const db2 = getDatabase();
      const storedKeys = db2.prepare("SELECT value FROM settings WHERE key = ?").get(`apiKeys_${req.provider}`);
      const keyPool = storedKeys ? JSON.parse(storedKeys.value) : req.apiKey ? [req.apiKey] : [];
      const effectiveKey = keyPool[0] || req.apiKey || "";
      if (req.provider === "Google") {
        generatedMarkdown = await callGemini(req.model, effectiveKey, systemPrompt, userPrompt);
      } else if (PROVIDER_URLS[req.provider]) {
        const pool = req.provider === "Ollama" ? ["none"] : keyPool;
        generatedMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool, systemPrompt, userPrompt);
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`);
      }
      if (!generatedMarkdown) {
        throw new Error("Failed to generate skill content (empty response)");
      }
      const sanitizedName = req.name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
      const sanitizedAuthor = req.author.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
      const targetDir = path.join(os.homedir(), ".skillsmaster", "skills", sanitizedName, "v1.0");
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const metadata = {
        namespace: `${sanitizedAuthor}.${sanitizedName}`,
        name: sanitizedName,
        category: req.category,
        description: req.description
      };
      generatedMarkdown = cleanMarkdown(generatedMarkdown);
      if (!generatedMarkdown.startsWith("---")) {
        const frontmatter = `---
name: ${req.name}
description: ${req.description}
version: 1.0
---

`;
        generatedMarkdown = frontmatter + generatedMarkdown;
      }
      fs.writeFileSync(path.join(targetDir, "metadata.json"), JSON.stringify(metadata, null, 2));
      fs.writeFileSync(path.join(targetDir, "SKILL.md"), generatedMarkdown);
      const exampleStr = "# Examples\\n\\nAdd specific testing inputs and outputs here.";
      fs.writeFileSync(path.join(targetDir, "examples.md"), exampleStr);
      scanLibrary();
      return { success: true, namespace: metadata.namespace };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("generateIdeas", async (_event, req) => {
    try {
      let walkTree = function(dir, depth) {
        if (depth > 3) return "";
        let out = "";
        let entries;
        try {
          entries = fs.readdirSync(dir);
        } catch {
          return "";
        }
        for (const entry of entries) {
          if (IGNORED_DIRS.has(entry) || entry.startsWith(".")) continue;
          const full = path.join(dir, entry);
          const stat = fs.statSync(full);
          const indent = "  ".repeat(depth);
          if (stat.isDirectory()) {
            out += `${indent}📁 ${entry}/
`;
            if (depth < 3) out += walkTree(full, depth + 1);
          } else {
            out += `${indent}📄 ${entry}
`;
          }
        }
        return out;
      };
      if (!fs.existsSync(req.projectPath)) throw new Error("Directory does not exist");
      const IGNORED_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", ".venv", "__pycache__", "dist", "build", ".next", "out", "coverage", ".turbo"]);
      const directoryTree = walkTree(req.projectPath, 0);
      let contextStr = `## Directory Structure
\`\`\`
${directoryTree || "(empty)"}
\`\`\`

`;
      const filesToCheck = ["package.json", "requirements.txt", "README.md", "claude.md", "gemini.md", "Cargo.toml", "go.mod", "pyproject.toml", "composer.json"];
      for (const f of filesToCheck) {
        const filePath = path.join(req.projectPath, f);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf8").substring(0, 1500);
          contextStr += `## ${f}
\`\`\`
${content}
\`\`\`

`;
        }
      }
      let errorContext = "";
      const logPatterns = ["npm-debug.log", "yarn-error.log", "error.log", "app.log"];
      for (const logName of logPatterns) {
        const logPath = path.join(req.projectPath, logName);
        if (fs.existsSync(logPath)) {
          const lines = fs.readFileSync(logPath, "utf8").split("\n").slice(-50).join("\n");
          errorContext += `## Error Log: ${logName} (last 50 lines)
\`\`\`
${lines}
\`\`\`

`;
          break;
        }
      }
      if (errorContext) contextStr += errorContext;
      const userContextParts = [];
      if (req.userInstructions) userContextParts.push(`Project Description (by user): ${req.userInstructions}`);
      if (req.goalDescription) userContextParts.push(`Goals / What to Build: ${req.goalDescription}`);
      if (req.agentTarget) userContextParts.push(`Target AI Agent/IDE: ${req.agentTarget}`);
      const userContextBlock = userContextParts.length > 0 ? `

## User-Provided Context
${userContextParts.join("\n")}` : "";
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
- description: one specific sentence referencing the actual project structure or user goals`;
      const userPrompt = `Project Context:${userContextBlock}

${contextStr}`;
      let resultStr = "";
      const storedKeys2 = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(`apiKeys_${req.provider}`);
      const keyPool2 = storedKeys2 ? JSON.parse(storedKeys2.value) : req.apiKey ? [req.apiKey] : [];
      const effectiveKey2 = keyPool2[0] || req.apiKey || "";
      if (req.provider === "Google") {
        resultStr = await callGemini(req.model, effectiveKey2, systemPrompt, userPrompt);
      } else if (PROVIDER_URLS[req.provider]) {
        const pool2 = req.provider === "Ollama" ? ["none"] : keyPool2;
        resultStr = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool2, systemPrompt, userPrompt);
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`);
      }
      if (!resultStr) throw new Error("AI returned an empty response. Check your API key and model selection.");
      let cleaned = resultStr.replace(/```json/gi, "").replace(/```/gi, "").trim();
      const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) cleaned = jsonMatch[0];
      let ideas;
      try {
        ideas = JSON.parse(cleaned);
      } catch {
        throw new Error(`AI response was not valid JSON. Raw response: ${cleaned.substring(0, 200)}`);
      }
      return { success: true, ideas };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("refactorSkill", async (_event, req) => {
    try {
      const db2 = getDatabase();
      const skillRow = db2.prepare("SELECT name, namespace FROM skills WHERE id = ?").get(req.skillId);
      if (!skillRow) throw new Error("Skill not found in database");
      const versionRow = db2.prepare("SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1").get(req.skillId);
      if (!versionRow) throw new Error("Skill version not found");
      const currentVersion = versionRow.version;
      const skillsPath = path.join(os.homedir(), ".skillsmaster", "skills");
      const targetFolderId = skillRow.name;
      const oldVersionPath = path.join(skillsPath, targetFolderId, currentVersion);
      if (!fs.existsSync(path.join(oldVersionPath, "skill.md")) && !fs.existsSync(path.join(oldVersionPath, "SKILL.md"))) {
        throw new Error("Could not read existing skill.md or SKILL.md on disk");
      }
      const existingFileName = fs.existsSync(path.join(oldVersionPath, "SKILL.md")) ? "SKILL.md" : "skill.md";
      const existingMarkdown = fs.readFileSync(path.join(oldVersionPath, existingFileName), "utf8");
      let existingMetadata = {};
      try {
        existingMetadata = JSON.parse(fs.readFileSync(path.join(oldVersionPath, "metadata.json"), "utf8"));
      } catch (e) {
      }
      const systemPrompt = `You are an expert AI agent manager. The user wants to refactor an existing Anthropic-style skill for a coding agent.
Respond ONLY with the complete, updated raw Markdown for the skill's instructions. Keep all existing good parts.
Ensure the top of the file contains YAML frontmatter.`;
      const userPrompt = `Existing Skill:

${existingMarkdown}

Refactoring Instructions:
${req.prompt}`;
      let newMarkdown = "";
      const storedKeys3 = db2.prepare("SELECT value FROM settings WHERE key = ?").get(`apiKeys_${req.provider}`);
      const keyPool3 = storedKeys3 ? JSON.parse(storedKeys3.value) : req.apiKey ? [req.apiKey] : [];
      const effectiveKey3 = keyPool3[0] || req.apiKey || "";
      if (req.provider === "Google") {
        newMarkdown = await callGemini(req.model, effectiveKey3, systemPrompt, userPrompt);
      } else if (PROVIDER_URLS[req.provider]) {
        const pool3 = req.provider === "Ollama" ? ["none"] : keyPool3;
        newMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool3, systemPrompt, userPrompt);
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`);
      }
      if (!newMarkdown) throw new Error("Generated markdown was empty");
      newMarkdown = cleanMarkdown(newMarkdown);
      let newVersionStr = "v1.1";
      const match = currentVersion.match(/v(\d+)\.(\d+)/);
      if (match) {
        newVersionStr = `v${match[1]}.${parseInt(match[2], 10) + 1}`;
      }
      const newVersionPath = path.join(skillsPath, targetFolderId, newVersionStr);
      if (!fs.existsSync(newVersionPath)) fs.mkdirSync(newVersionPath, { recursive: true });
      fs.writeFileSync(path.join(newVersionPath, "metadata.json"), JSON.stringify(existingMetadata, null, 2));
      fs.writeFileSync(path.join(newVersionPath, "SKILL.md"), newMarkdown);
      if (fs.existsSync(path.join(oldVersionPath, "examples.md"))) {
        fs.copyFileSync(path.join(oldVersionPath, "examples.md"), path.join(newVersionPath, "examples.md"));
      }
      scanLibrary();
      return { success: true, newVersion: newVersionStr };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("previewRefactorSkill", async (_event, req) => {
    try {
      const db2 = getDatabase();
      const skillRow = db2.prepare("SELECT name, namespace FROM skills WHERE id = ?").get(req.skillId);
      if (!skillRow) throw new Error("Skill not found in database");
      const versionRow = db2.prepare("SELECT version FROM versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1").get(req.skillId);
      if (!versionRow) throw new Error("Skill version not found");
      const currentVersion = versionRow.version;
      const skillsPath = path.join(os.homedir(), ".skillsmaster", "skills");
      const oldVersionPath = path.join(skillsPath, skillRow.name, currentVersion);
      if (!fs.existsSync(path.join(oldVersionPath, "skill.md")) && !fs.existsSync(path.join(oldVersionPath, "SKILL.md"))) {
        throw new Error("Could not read existing SKILL.md on disk");
      }
      const existingFileName = fs.existsSync(path.join(oldVersionPath, "SKILL.md")) ? "SKILL.md" : "skill.md";
      const oldMarkdown = fs.readFileSync(path.join(oldVersionPath, existingFileName), "utf8");
      const systemPrompt = `You are an expert AI agent manager. The user wants to refactor an existing Anthropic-style skill for a coding agent.
Respond ONLY with the complete, updated raw Markdown for the skill's instructions. Keep all existing good parts.
Ensure the top of the file contains YAML frontmatter.`;
      const userPrompt = `Existing Skill:

${oldMarkdown}

Refactoring Instructions:
${req.prompt}`;
      const storedKeys = db2.prepare("SELECT value FROM settings WHERE key = ?").get(`apiKeys_${req.provider}`);
      const keyPool = storedKeys ? JSON.parse(storedKeys.value) : req.apiKey ? [req.apiKey] : [];
      const effectiveKey = keyPool[0] || req.apiKey || "";
      let newMarkdown = "";
      if (req.provider === "Google") {
        newMarkdown = await callGemini(req.model, effectiveKey, systemPrompt, userPrompt);
      } else if (PROVIDER_URLS[req.provider]) {
        const pool = req.provider === "Ollama" ? ["none"] : keyPool;
        newMarkdown = await callChatCompletionWithPool(PROVIDER_URLS[req.provider], req.model, pool, systemPrompt, userPrompt);
      } else {
        throw new Error(`Unsupported provider: ${req.provider}`);
      }
      if (!newMarkdown) throw new Error("AI returned empty markdown");
      newMarkdown = cleanMarkdown(newMarkdown);
      const match = currentVersion.match(/v(\d+)\.(\d+)/);
      const nextVersion = match ? `v${match[1]}.${parseInt(match[2], 10) + 1}` : "v1.1";
      return { success: true, oldMarkdown, newMarkdown, currentVersion, nextVersion, skillName: skillRow.name };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("commitRefactorSkill", async (_event, req) => {
    try {
      const skillsPath = path.join(os.homedir(), ".skillsmaster", "skills");
      const currentVersionPath = path.join(skillsPath, req.skillName, req.currentVersion);
      let existingMetadata = {};
      try {
        existingMetadata = JSON.parse(fs.readFileSync(path.join(currentVersionPath, "metadata.json"), "utf8"));
      } catch (e) {
      }
      if (req.mode === "replace") {
        const fileName = fs.existsSync(path.join(currentVersionPath, "SKILL.md")) ? "SKILL.md" : "skill.md";
        fs.writeFileSync(path.join(currentVersionPath, fileName), req.newMarkdown);
      } else {
        const newVersionPath = path.join(skillsPath, req.skillName, req.nextVersion);
        if (!fs.existsSync(newVersionPath)) fs.mkdirSync(newVersionPath, { recursive: true });
        fs.writeFileSync(path.join(newVersionPath, "metadata.json"), JSON.stringify(existingMetadata, null, 2));
        fs.writeFileSync(path.join(newVersionPath, "SKILL.md"), req.newMarkdown);
        const examplesFile = path.join(currentVersionPath, "examples.md");
        if (fs.existsSync(examplesFile)) {
          fs.copyFileSync(examplesFile, path.join(newVersionPath, "examples.md"));
        }
      }
      scanLibrary();
      return { success: true, savedVersion: req.mode === "replace" ? req.currentVersion : req.nextVersion };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
}
async function callChatCompletionWithPool(endpoint, model, keys, system, user) {
  if (!keys || keys.length === 0) throw new Error("No API keys configured for this provider.");
  const isAnthropic = endpoint.includes("anthropic.com");
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  let lastError = null;
  for (const key of shuffled) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (key !== "none") {
        if (isAnthropic) {
          headers["x-api-key"] = key;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${key}`;
        }
      }
      const bodyObj = isAnthropic ? { model, max_tokens: 8192, system, messages: [{ role: "user", content: user }] } : { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
      const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      if (!resp.ok) {
        const txt = await resp.text();
        if (resp.status === 401 || resp.status === 429 || resp.status === 403) {
          console.warn(`Key rejected (HTTP ${resp.status}), trying next key...`);
          lastError = new Error(`Provider Error HTTP ${resp.status}: ${txt}`);
          continue;
        }
        throw new Error(`Provider Error HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      if (isAnthropic) {
        const text2 = data.content?.[0]?.text ?? "";
        if (!text2 && data.error) throw new Error(`Anthropic error: ${JSON.stringify(data.error)}`);
        return text2;
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text && data.error) throw new Error(`API error: ${JSON.stringify(data.error)}`);
      return text;
    } catch (err) {
      if (err === lastError) continue;
      throw err;
    }
  }
  throw lastError || new Error("All API keys exhausted for this provider.");
}
function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    child_process.exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}
function setupRegistryIpcHandlers() {
  electron.ipcMain.handle("installContextMenu", async () => {
    try {
      if (process.platform !== "win32") return { success: false, error: "Context menu integration is only supported on Windows." };
      const exePath = process.execPath;
      const keyPath = `HKCU\\Software\\Classes\\Directory\\shell\\SkillsMaster`;
      const commandPath = `${keyPath}\\command`;
      const appName = "Open with SkillsMaster";
      const iconPath = `\\"${exePath}\\",0`;
      const executeCommand = `\\"${exePath}\\" \\"%1\\"`;
      await execPromise(`reg add "${keyPath}" /ve /t REG_SZ /d "${appName}" /f`);
      await execPromise(`reg add "${keyPath}" /v "Icon" /t REG_SZ /d "${iconPath}" /f`);
      await execPromise(`reg add "${commandPath}" /ve /t REG_SZ /d "${executeCommand}" /f`);
      const bgKeyPath = `HKCU\\Software\\Classes\\Directory\\Background\\shell\\SkillsMaster`;
      const bgCommandPath = `${bgKeyPath}\\command`;
      const bgExecuteCommand = `\\"${exePath}\\" \\"%V\\"`;
      await execPromise(`reg add "${bgKeyPath}" /ve /t REG_SZ /d "${appName}" /f`);
      await execPromise(`reg add "${bgKeyPath}" /v "Icon" /t REG_SZ /d "${iconPath}" /f`);
      await execPromise(`reg add "${bgCommandPath}" /ve /t REG_SZ /d "${bgExecuteCommand}" /f`);
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("uninstallContextMenu", async () => {
    try {
      if (process.platform !== "win32") return { success: false, error: "Context menu integration is only supported on Windows." };
      await execPromise(`reg delete "HKCU\\Software\\Classes\\Directory\\shell\\SkillsMaster" /f`).catch(() => {
      });
      await execPromise(`reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\SkillsMaster" /f`).catch(() => {
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("scanActiveProject", async (_, projectPath) => {
    try {
      if (!projectPath || !fs.existsSync(projectPath)) {
        return { success: false, error: "Path does not exist" };
      }
      const contextFiles = ["package.json", "requirements.txt", "Cargo.toml", "go.mod", "pyproject.toml"];
      const detectedStack = [];
      for (const file of contextFiles) {
        if (fs.existsSync(path.join(projectPath, file))) {
          if (file === "package.json") {
            detectedStack.push("Node.js");
            try {
              const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, file), "utf8"));
              const deps = { ...pkg.dependencies || {}, ...pkg.devDependencies || {} };
              if (deps["react"]) detectedStack.push("React");
              if (deps["vue"]) detectedStack.push("Vue");
              if (deps["next"]) detectedStack.push("Next.js");
              if (deps["express"]) detectedStack.push("Express");
              if (deps["vite"]) detectedStack.push("Vite");
              if (deps["electron"]) detectedStack.push("Electron");
              if (deps["tailwindcss"]) detectedStack.push("Tailwind CSS");
              if (deps["typescript"]) detectedStack.push("TypeScript");
            } catch (e) {
            }
          }
          if (file === "requirements.txt" || file === "pyproject.toml") detectedStack.push("Python");
          if (file === "Cargo.toml") detectedStack.push("Rust");
          if (file === "go.mod") detectedStack.push("Go");
        }
      }
      const localSkillsPath = path.join(projectPath, ".agent", "skills");
      let localSkills = [];
      if (fs.existsSync(localSkillsPath)) {
        const folders = fs.readdirSync(localSkillsPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());
        for (const folder of folders) {
          const metadataPath = path.join(localSkillsPath, folder.name, "metadata.json");
          if (fs.existsSync(metadataPath)) {
            try {
              const m = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
              localSkills.push(m);
            } catch (e) {
            }
          } else {
            localSkills.push({ name: folder.name, description: "Unknown" });
          }
        }
      }
      return { success: true, stack: detectedStack, skills: localSkills };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
function setupSettingsIpcHandlers() {
  electron.ipcMain.handle("getSetting", (_, key) => {
    const db2 = getDatabase();
    const row = db2.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  });
  electron.ipcMain.handle("setSetting", (_, key, value) => {
    const db2 = getDatabase();
    db2.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    return true;
  });
  electron.ipcMain.handle("selectDirectory", async (event) => {
    const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) return null;
    const result = await electron.dialog.showOpenDialog(browserWindow, {
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  electron.ipcMain.handle("resolvePath", (_, inputPath) => {
    if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
  });
}
const SKILLSMASTER_DIR = path.join(os.homedir(), ".skillsmaster", "skills");
const PACK_MANIFEST_NAME = "skillpack.manifest.json";
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function setupSkillPackIpcHandlers() {
  electron.ipcMain.handle("exportSkillPack", async (event, skillIds) => {
    try {
      if (!skillIds || skillIds.length === 0) throw new Error("No skills selected for export");
      const db2 = getDatabase();
      const skills = [];
      for (const id of skillIds) {
        const skill = db2.prepare("SELECT * FROM skills WHERE id = ?").get(id);
        if (!skill) continue;
        const versions = db2.prepare("SELECT * FROM versions WHERE skill_id = ?").all(id);
        skills.push({ skill, versions });
      }
      if (skills.length === 0) throw new Error("None of the selected skills were found in the database");
      const zip = new AdmZip();
      const manifest = {
        version: "1.0",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        skills: skills.map((s) => ({ ...s.skill, _versions: s.versions }))
      };
      zip.addFile(PACK_MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
      for (const { skill, versions } of skills) {
        const skillDir = path.join(SKILLSMASTER_DIR, skill.name);
        if (!fs.existsSync(skillDir)) continue;
        for (const version of versions) {
          const versionDir = path.join(skillDir, version.version);
          if (!fs.existsSync(versionDir)) continue;
          const entries = fs.readdirSync(versionDir);
          for (const entry of entries) {
            const filePath = path.join(versionDir, entry);
            const content = fs.readFileSync(filePath);
            zip.addFile(`skills/${skill.name}/${version.version}/${entry}`, content);
          }
        }
      }
      const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
      const saveResult = await electron.dialog.showSaveDialog(browserWindow, {
        title: "Export Skill Pack",
        defaultPath: `skillpack-${Date.now()}.skillsmaster`,
        filters: [{ name: "SkillsMaster Pack", extensions: ["skillsmaster"] }]
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: "Export cancelled" };
      }
      zip.writeZip(saveResult.filePath);
      return { success: true, path: saveResult.filePath, count: skills.length };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("importSkillPack", async (event) => {
    try {
      const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
      const openResult = await electron.dialog.showOpenDialog(browserWindow, {
        title: "Import Skill Pack",
        filters: [{ name: "SkillsMaster Pack", extensions: ["skillsmaster"] }],
        properties: ["openFile"]
      });
      if (openResult.canceled || openResult.filePaths.length === 0) {
        return { success: false, error: "Import cancelled" };
      }
      const packPath = openResult.filePaths[0];
      const zip = new AdmZip(packPath);
      const manifestEntry = zip.getEntry(PACK_MANIFEST_NAME);
      if (!manifestEntry) throw new Error("Invalid .skillsmaster file: missing manifest");
      const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
      const db2 = getDatabase();
      let imported = 0;
      let skipped = 0;
      for (const skillData of manifest.skills) {
        const { _versions, ...skillRecord } = skillData;
        const existing = db2.prepare("SELECT id FROM skills WHERE id = ?").get(skillRecord.id);
        const finalId = existing ? generateId() : skillRecord.id;
        const nameCollision = db2.prepare("SELECT id FROM skills WHERE name = ? AND namespace = ?").get(skillRecord.name, skillRecord.namespace);
        if (nameCollision) {
          skipped++;
          continue;
        }
        db2.prepare(`
          INSERT INTO skills (id, name, namespace, description, category, tags, author, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          finalId,
          skillRecord.name,
          skillRecord.namespace,
          skillRecord.description || "",
          skillRecord.category || "Prompt",
          skillRecord.tags || "",
          skillRecord.author || "imported",
          skillRecord.created_at || (/* @__PURE__ */ new Date()).toISOString(),
          (/* @__PURE__ */ new Date()).toISOString()
        );
        for (const ver of _versions || []) {
          db2.prepare(`
            INSERT OR IGNORE INTO versions (skill_id, version, path, is_active)
            VALUES (?, ?, ?, ?)
          `).run(finalId, ver.version, ver.path || `${skillRecord.name}/${ver.version}`, ver.is_active || 1);
        }
        const entries = zip.getEntries().filter((e) => e.entryName.startsWith(`skills/${skillRecord.name}/`));
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const relativePath = entry.entryName.replace(`skills/${skillRecord.name}/`, "");
          const targetPath = path.join(SKILLSMASTER_DIR, skillRecord.name, relativePath);
          const targetDir = path.dirname(targetPath);
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(targetPath, entry.getData());
        }
        imported++;
      }
      scanLibrary();
      return { success: true, imported, skipped };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
}
function setupImportIpcHandlers() {
  electron.ipcMain.handle("importSkillFromFolder", async (event) => {
    const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) return { success: false, error: "No browser window" };
    const result = await electron.dialog.showOpenDialog(browserWindow, {
      properties: ["openDirectory"],
      title: "Select Skill Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    return await importSkillFromFolder(result.filePaths[0]);
  });
  electron.ipcMain.handle("importFromAgent", async (_, agentName, agentPath) => {
    return await importFromAgent(agentName, agentPath);
  });
}
async function importSkillFromFolder(sourcePath) {
  try {
    if (!fs.existsSync(sourcePath)) return { success: false, error: "Source path does not exist" };
    const skillFileName = fs.existsSync(path.join(sourcePath, "SKILL.md")) ? "SKILL.md" : fs.existsSync(path.join(sourcePath, "skills.md")) ? "skills.md" : null;
    const metadataPath = path.join(sourcePath, "metadata.json");
    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      } catch (e) {
      }
    }
    if (!metadata) {
      if (!skillFileName) return { success: false, error: "No SKILL.md or metadata.json found in folder." };
      const content = fs.readFileSync(path.join(sourcePath, skillFileName), "utf8");
      const nameMatch = content.match(/^#\s+(.+)$/m);
      const skillName = nameMatch ? nameMatch[1].trim() : path.basename(sourcePath);
      metadata = {
        name: skillName,
        namespace: "imported",
        category: "Basic Skill",
        description: `Imported from ${sourcePath}`,
        version: "1.0.0"
      };
    }
    const cleanName = (metadata.name || path.basename(sourcePath)).replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const libraryPath = path.join(os.homedir(), ".skillsmaster", "skills", cleanName, "1.0.0");
    if (!fs.existsSync(libraryPath)) {
      fs.mkdirSync(libraryPath, { recursive: true });
    }
    fs.cpSync(sourcePath, libraryPath, { recursive: true, force: true });
    fs.writeFileSync(path.join(libraryPath, "metadata.json"), JSON.stringify(metadata, null, 2));
    scanLibrary();
    return { success: true, name: metadata.name };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}
async function importFromAgent(agentName, agentPath) {
  try {
    if (!fs.existsSync(agentPath)) return { success: false, error: `Agent path for ${agentName} does not exist: ${agentPath}` };
    const entries = fs.readdirSync(agentPath, { withFileTypes: true });
    const imported = [];
    const skipped = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(agentPath, entry.name);
        const hasSkill = fs.existsSync(path.join(subPath, "SKILL.md")) || fs.existsSync(path.join(subPath, "skills.md")) || fs.existsSync(path.join(subPath, "metadata.json"));
        if (hasSkill) {
          const res = await importSkillFromFolder(subPath);
          if (res.success) imported.push(entry.name);
          else skipped.push({ name: entry.name, error: res.error });
        }
      }
    }
    return { success: true, count: imported.length, imported, skipped };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}
function saveProjectToHistory(projPath) {
  try {
    const db2 = getDatabase();
    const row = db2.prepare("SELECT value FROM settings WHERE key = ?").get("connectedProjects");
    let projects = row ? JSON.parse(row.value) : [];
    if (!projects.find((p) => p.path === projPath)) {
      const name = path.basename(projPath) || projPath;
      projects.push({ name, path: projPath });
      db2.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("connectedProjects", JSON.stringify(projects));
    }
  } catch (e) {
    console.error("Failed to auto-add project to history:", e);
  }
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.on("did-finish-load", () => {
    const args = process.argv.slice(utils.is.dev ? 2 : 1);
    let activePath = null;
    for (let i = 0; i < args.length; i++) {
      let currentTry = args[i];
      if (fs.existsSync(currentTry) && (currentTry.includes("\\") || currentTry.includes("/"))) {
        activePath = currentTry;
        break;
      }
      for (let j = i + 1; j < Math.min(i + 10, args.length); j++) {
        currentTry += " " + args[j];
        if (fs.existsSync(currentTry)) {
          activePath = currentTry;
          i = j;
          break;
        }
      }
      if (activePath) break;
    }
    if (activePath) {
      mainWindow.webContents.send("active-project-path", activePath);
      saveProjectToHistory(activePath);
    }
    electron.ipcMain.handle("getActiveProjectPath", () => activePath);
    electron.ipcMain.handle("setActiveProjectPath", (_event, path2, shouldSave = true) => {
      activePath = path2;
      if (shouldSave) saveProjectToHistory(path2);
      electron.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("active-project-path", path2);
      });
      return true;
    });
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.on("ping", () => console.log("pong"));
  electron.ipcMain.handle("dialog:selectDirectory", async (event) => {
    const browserWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) return null;
    const result = await electron.dialog.showOpenDialog(browserWindow, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  try {
    initDatabase();
    scanLibrary();
    setupLibraryIpcHandlers();
    setupAttachmentIpcHandlers();
    setupAiIpcHandlers();
    setupRegistryIpcHandlers();
    setupSettingsIpcHandlers();
    setupSkillPackIpcHandlers();
    setupImportIpcHandlers();
    console.log("Database and Library initialized successfully");
  } catch (err) {
    console.error("Failed to initialize database", err);
  }
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
