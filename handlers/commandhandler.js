const fs = require("fs");
const path = require("path");

/**
 * Charge récursivement toutes les commandes depuis le dossier /commands
 * et les enregistre dans client.commands (Collection).
 */
module.exports = (client) => {
  const commandsPath = path.join(__dirname, "..", "commands");
  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);

    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const commandFiles = fs
      .readdirSync(categoryPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = require(path.join(categoryPath, file));

      if (!command.data || !command.data.name) {
        console.warn(
          `[⚠️  Handler] La commande dans ${file} n'a pas de propriété "data.name". Elle sera ignorée.`,
        );
        continue;
      }

      client.commands.set(command.data.name, command);
      console.log(
        `[✅ Handler] Commande chargée : ${command.data.name} (${category})`,
      );
    }
  }
};
