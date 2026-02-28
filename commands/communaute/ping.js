const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Répond avec la latence du bot."),

  async execute(interaction, client) {
    await interaction.reply({ content: "🏓 Calcul...", fetchReply: true });

    const latency = interaction.createdTimestamp - Date.now();
    const apiLatency = Math.round(client.ws.ping);

    interaction.editReply(
      `🏓 **Pong !**\n> Latence bot : \`${Math.abs(latency)}ms\`\n> Latence API : \`${apiLatency}ms\``,
    );
  },
};
