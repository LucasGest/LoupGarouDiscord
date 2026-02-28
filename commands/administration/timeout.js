const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { readConfig } = require("../../utils/storage");

const DUREES = [
  { name: "60 secondes", value: 60 },
  { name: "5 minutes", value: 300 },
  { name: "10 minutes", value: 600 },
  { name: "30 minutes", value: 1800 },
  { name: "1 heure", value: 3600 },
  { name: "1 jour", value: 86400 },
  { name: "1 semaine", value: 604800 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mettre un membre en sourdine temporairement.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o
        .setName("membre")
        .setDescription("Le membre à mettre en timeout.")
        .setRequired(true),
    )
    .addStringOption((o) => {
      o.setName("durée").setDescription("Durée du timeout.").setRequired(true);
      DUREES.forEach((d) =>
        o.addChoices({ name: d.name, value: String(d.value) }),
      );
      return o;
    })
    .addStringOption((o) =>
      o
        .setName("raison")
        .setDescription("Raison du timeout.")
        .setRequired(false),
    ),

  async execute(interaction, client) {
    const target = interaction.options.getMember("membre");
    const dureeSecondes = parseInt(interaction.options.getString("durée"));
    const raison =
      interaction.options.getString("raison") ?? "Aucune raison fournie.";
    const dureeLabel = DUREES.find((d) => d.value === dureeSecondes)?.name;

    if (!target)
      return interaction.reply({
        content: "❌ Membre introuvable.",
        ephemeral: true,
      });
    if (target.id === interaction.user.id)
      return interaction.reply({
        content: "❌ Tu ne peux pas te mettre en timeout toi-même.",
        ephemeral: true,
      });
    if (!target.moderatable)
      return interaction.reply({
        content:
          "❌ Je ne peux pas mettre ce membre en timeout (permissions supérieures).",
        ephemeral: true,
      });

    await target.timeout(dureeSecondes * 1000, raison);

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🔇 Membre mis en timeout")
      .addFields(
        { name: "Membre", value: `${target.user.tag}`, inline: true },
        { name: "Modérateur", value: `${interaction.user.tag}`, inline: true },
        { name: "Durée", value: dureeLabel, inline: true },
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
