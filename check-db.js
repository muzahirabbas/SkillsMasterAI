const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Guessing the path. Usually %APPDATA%\skillsmaster\skillsmaster.sqlite
const appData = path.join(os.homedir(), 'AppData', 'Roaming', 'skillsmaster');
const dbPath = path.join(appData, 'skillsmaster.sqlite');

try {
  const db = new Database(dbPath);
  console.log("Installations:");
  console.log(db.prepare('SELECT * FROM installations').all());
  console.log("\nSettings:");
  console.log(db.prepare('SELECT * FROM settings').all());
} catch (e) {
  console.error("Error reading db:", e.message);
}
