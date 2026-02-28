const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const categories = fs.readdirSync(commandsPath);

// Collecte tous les "data" de chaque commande pour l'envoi à l'API Discord
for (const category of categories) {
  const categoryPath = path.join(commandsPath, category);
  if (!fs.statSync(categoryPath).isDirectory()) continue;

  const commandFiles = fs
    .readdirSync(categoryPath)
    .filter((f) => f.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(path.join(categoryPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`[📦 Deploy] Commande ajoutée : ${command.data.name}`);
    }
  }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(
      `\n[🚀 Deploy] Déploiement de ${commands.length} commande(s)...`,
    );

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );

    console.log("[✅ Deploy] Commandes déployées avec succès sur le serveur !");
  } catch (error) {
    console.error("[❌ Deploy] Erreur lors du déploiement :", error);
  }
})();
