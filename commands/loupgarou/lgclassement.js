const { SlashCommandBuilder } = require("discord.js");
const { buildClassementEmbed } = require("../../utils/classement");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lg-classement")
    .setDescription("Affiche le classement des joueurs Loup-Garou du serveur."),

  async execute(interaction) {
    const embed = buildClassementEmbed(interaction.guildId, interaction.guild);
    await interaction.reply({ embeds: [embed] });
  },
};
