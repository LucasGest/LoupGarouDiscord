const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "config.json");

/**
 * Lit la config persistante du bot (data/config.json).
 */
function readConfig() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

/**
 * Écrit/fusionne des clés dans la config persistante.
 */
function writeConfig(data) {
  const current = readConfig();
  fs.writeFileSync(FILE, JSON.stringify({ ...current, ...data }, null, 2));
}

module.exports = { readConfig, writeConfig };
