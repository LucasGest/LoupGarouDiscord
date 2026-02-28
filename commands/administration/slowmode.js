const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Définir le slowmode du salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o
        .setName("secondes")
        .setDescription("Délai en secondes (0 pour désactiver, max 21600).")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    ),

  async execute(interaction) {
    const secondes = interaction.options.getInteger("secondes");
    await interaction.channel.setRateLimitPerUser(secondes);

    const msg =
      secondes === 0
        ? "✅ Slowmode **désactivé**."
        : `✅ Slowmode défini à **${secondes} seconde(s)**.`;

    await interaction.reply({ content: msg, ephemeral: true });
  },
};
