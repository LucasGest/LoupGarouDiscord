const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Créer et envoyer un embed dans ce salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("modal_embed")
      .setTitle("✏️ Créer un embed");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("embed_titre")
          .setLabel("Titre")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("embed_description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("embed_couleur")
          .setLabel("Couleur (hex, ex: #3498db)")
          .setStyle(TextInputStyle.Short)
          .setValue("#3498db")
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("embed_footer")
          .setLabel("Footer (optionnel)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );

    await interaction.showModal(modal);
  },
};
