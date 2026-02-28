/**
 * Système de classement persistant par serveur.
 * Stocké dans data/config.json sous la clé "classement"
 */
const { readConfig, writeConfig } = require("./storage");

function getClassement(guildId) {
  const config = readConfig();
  return config.classement?.[guildId] ?? {};
}

/**
 * Ajoute des victoires aux gagnants.
 * @param {string} guildId
 * @param {Array<{userId, displayName}>} gagnants
 */
function enregistrerVictoire(guildId, gagnants) {
  const config = readConfig();
  const classement = config.classement ?? {};
  const serveur = classement[guildId] ?? {};

  for (const { userId, displayName } of gagnants) {
    if (!serveur[userId])
      serveur[userId] = { displayName, victoires: 0, parties: 0 };
    serveur[userId].victoires++;
    serveur[userId].parties++;
    serveur[userId].displayName = displayName; // màj pseudo
  }

  // Incrémenter parties pour tout le monde (perdants aussi)
  classement[guildId] = serveur;
  writeConfig({ classement });
}

function enregistrerPartie(guildId, tousLesJoueurs) {
  const config = readConfig();
  const classement = config.classement ?? {};
  const serveur = classement[guildId] ?? {};

  for (const { userId, displayName } of tousLesJoueurs) {
    if (!serveur[userId])
      serveur[userId] = { displayName, victoires: 0, parties: 0 };
    serveur[userId].parties++;
    serveur[userId].displayName = displayName;
  }

  classement[guildId] = serveur;
  writeConfig({ classement });
}

/**
 * Retourne le top 10 formaté pour un embed Discord.
 */
function buildClassementEmbed(guildId, guild) {
  const { EmbedBuilder } = require("discord.js");
  const serveur = getClassement(guildId);
  const sorted = Object.entries(serveur)
    .sort(([, a], [, b]) => b.victoires - a.victoires || b.parties - a.parties)
    .slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];
  const lignes = sorted.length
    ? sorted
        .map(([, data], i) => {
          const ratio =
            data.parties > 0
              ? ((data.victoires / data.parties) * 100).toFixed(0)
              : 0;
          return `${medals[i] ?? `**${i + 1}.**`} **${data.displayName}** — ${data.victoires} victoire${data.victoires > 1 ? "s" : ""} · ${data.parties} partie${data.parties > 1 ? "s" : ""} · ${ratio}% win`;
        })
        .join("\n")
    : "*Aucune partie jouée pour l'instant...*";

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 Classement Loup-Garou")
    .setDescription(lignes)
    .setFooter({ text: `Serveur : ${guild?.name ?? guildId}` })
    .setTimestamp();
}

module.exports = {
  enregistrerVictoire,
  enregistrerPartie,
  buildClassementEmbed,
  getClassement,
};
