const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { state, resetState } = require("../../utils/lgstate");
const { lancerPartie } = require("../../utils/lgengine");

const COMPOSITIONS_LABEL = {
  8: "2 Loups · Voyante · Sorcière · Chasseur · Cupidon · 2 Villageois",
  12: "3 Loups · Voyante · Sorcière · Chasseur · Cupidon · Petite Fille · 4 Villageois",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lg-start")
    .setDescription("Lancer une partie de Loup-Garou.")
    .addStringOption((o) =>
      o
        .setName("format")
        .setDescription("Nombre de joueurs.")
        .setRequired(true)
        .addChoices(
          { name: "8 joueurs", value: "8" },
          { name: "12 joueurs", value: "12" },
        ),
    ),

  async execute(interaction, client) {
    if (state.active) {
      return interaction.reply({
        content: "❌ Une partie est déjà en cours.",
        ephemeral: true,
      });
    }

    const format = parseInt(interaction.options.getString("format"));

    resetState();
    state.active = true;
    state.phase = "inscription";
    state.format = format;
    state.createurId = interaction.user.id;

    const embed = () =>
      new EmbedBuilder()
        .setColor(0x2c3e50)
        .setTitle(`🐺 Loup-Garou — ${format} joueurs`)
        .setDescription(
          `Partie lancée par **${interaction.user.displayName}** !\n\n` +
            `📋 **Composition :** ${COMPOSITIONS_LABEL[format]}\n\n` +
            `Clique sur **Rejoindre** pour participer.\n\n` +
            `**Joueurs inscrits (0/${format}) :**\n*Aucun pour l'instant...*`,
        )
        .setFooter({
          text: `La partie démarrera automatiquement à ${format}/${format} joueurs.`,
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("lg_rejoindre")
        .setLabel("🙋 Rejoindre")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("lg_quitter")
        .setLabel("❌ Quitter")
        .setStyle(ButtonStyle.Danger),
    );

    // Stocker le message pour mise à jour
    const msg = await interaction.reply({
      embeds: [embed()],
      components: [row],
      fetchReply: true,
    });
    state.inscriptionMessage = msg;
    state.inscriptionEmbed = embed;
    state.lancerPartie = lancerPartie;
    state.guild = interaction.guild;
  },
};
