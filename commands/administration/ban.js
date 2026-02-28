const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { readConfig } = require("../../utils/storage");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre du serveur.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o
        .setName("membre")
        .setDescription("Le membre à bannir.")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("raison")
        .setDescription("Raison du bannissement.")
        .setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Nombre de jours de messages à supprimer (0-7).")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction, client) {
    const target = interaction.options.getMember("membre");
    const raison =
      interaction.options.getString("raison") ?? "Aucune raison fournie.";
    const jours = interaction.options.getInteger("jours") ?? 0;

    if (!target)
      return interaction.reply({
        content: "❌ Membre introuvable.",
        ephemeral: true,
      });
    if (target.id === interaction.user.id)
      return interaction.reply({
        content: "❌ Tu ne peux pas te bannir toi-même.",
        ephemeral: true,
      });
    if (!target.bannable)
      return interaction.reply({
        content:
          "❌ Je ne peux pas bannir ce membre (permissions supérieures).",
        ephemeral: true,
      });

    await target.ban({ deleteMessageDays: jours, reason: raison });

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔨 Membre banni")
      .addFields(
        { name: "Membre", value: `${target.user.tag}`, inline: true },
        { name: "Modérateur", value: `${interaction.user.tag}`, inline: true },
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
