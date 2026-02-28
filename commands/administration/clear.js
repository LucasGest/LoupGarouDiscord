const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages dans le salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages à supprimer (1-100).")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((o) =>
      o
        .setName("membre")
        .setDescription("Ne supprimer que les messages de ce membre.")
        .setRequired(false),
    ),

  async execute(interaction) {
    const nombre = interaction.options.getInteger("nombre");
    const membre = interaction.options.getUser("membre");

    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });

    const aSupprimer = membre
      ? messages.filter((m) => m.author.id === membre.id).first(nombre)
      : [...messages.values()].slice(0, nombre);

    const supprimés = await interaction.channel.bulkDelete(aSupprimer, true);

    await interaction.editReply({
      content: `✅ **${supprimés.size}** message(s) supprimé(s)${membre ? ` de **${membre.tag}**` : ""}.`,
    });
  },
};
