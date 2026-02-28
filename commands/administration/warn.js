const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { readConfig, writeConfig } = require("../../utils/storage");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o
        .setName("membre")
        .setDescription("Le membre à avertir.")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("raison")
        .setDescription("Raison de l'avertissement.")
        .setRequired(true),
    ),

  async execute(interaction, client) {
    const target = interaction.options.getMember("membre");
    const raison = interaction.options.getString("raison");

    if (!target)
      return interaction.reply({
        content: "❌ Membre introuvable.",
        ephemeral: true,
      });
    if (target.user.bot)
      return interaction.reply({
        content: "❌ Tu ne peux pas avertir un bot.",
        ephemeral: true,
      });

    // Stockage des warns dans config.json
    const config = readConfig();
    if (!config.warns) config.warns = {};
    if (!config.warns[target.id]) config.warns[target.id] = [];

    config.warns[target.id].push({
      raison,
      moderateur: interaction.user.tag,
      date: new Date().toISOString(),
    });

    writeConfig({ warns: config.warns });

    const totalWarns = config.warns[target.id].length;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("⚠️ Avertissement")
      .addFields(
        { name: "Membre", value: `${target.user.tag}`, inline: true },
        { name: "Modérateur", value: `${interaction.user.tag}`, inline: true },
        { name: "Total warns", value: `${totalWarns}`, inline: true },
        { name: "Raison", value: raison },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await sendLog(client, embed);
  },
};

async function sendLog(client, embed) {
  const { logChannelId } = readConfig();
  if (!logChannelId) return;
  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (channel) channel.send({ embeds: [embed] });
}
