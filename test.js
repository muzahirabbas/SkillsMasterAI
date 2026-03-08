const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

app.whenReady().then(() => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'skillsmaster', 'skillsmaster.sqlite');
    const db = new Database(dbPath);
    console.log("== INSTALLATIONS == ");
    const installs = db.prepare('SELECT * FROM installations').all();
    console.log(JSON.stringify(installs, null, 2));
    
    console.log("\n== CONNECTED GLOBAL AGENTS ==");
    const agents = db.prepare('SELECT value FROM settings WHERE key = ?').get('connectedGlobalAgents');
    console.log(agents ? agents.value : 'None');
  } catch (e) {
    console.error(e);
  }
  app.quit();
});
