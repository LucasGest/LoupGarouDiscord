const {
  Client,
  GatewayIntentBits,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
require("dotenv").config();
const loadCommands = require("./handlers/commandHandler");
const { readConfig, writeConfig } = require("./utils/storage");

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
loadCommands(client);

// ─── Helpers log ──────────────────────────────────────────────────────────────

async function resolveLogChannel() {
  const savedId = readConfig().logChannelId ?? process.env.READY_CHANNEL_ID;
  if (!savedId) return null;
  return client.channels.fetch(savedId).catch(() => null);
}

// Embed de démarrage
function buildStartEmbed() {
  const now = new Date();
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: client.user.username,
      iconURL: client.user.displayAvatarURL(),
    })
    .setTitle("🟢 Bot en ligne")
    .setDescription(
      "> Le bot vient de démarrer avec succès.\n\n" +
        "**Statut :** Opérationnel\n" +
        `**Tag :** \`${client.user.tag}\`\n` +
        `**ID :** \`${client.user.id}\`\n` +
        `**Serveurs :** \`${client.guilds.cache.size}\`\n` +
        `**Commandes chargées :** \`${client.commands.size}\`\n` +
        `**Heure de démarrage :** <t:${Math.floor(now.getTime() / 1000)}:F>\n` +
        `**Uptime depuis :** <t:${Math.floor(now.getTime() / 1000)}:R>`,
    )
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: "🛡️ Système de log — Trouver un nom",
      iconURL: client.user.displayAvatarURL(),
    })
    .setTimestamp();
}

// Embed de backup / rapport d'activité
function buildBackupEmbed() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  const mem = process.memoryUsage();
  const memMb = (mem.heapUsed / 1024 / 1024).toFixed(1);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: client.user.username,
      iconURL: client.user.displayAvatarURL(),
    })
    .setTitle("💾 Rapport de backup — Bot actif")
    .setDescription(
      "> Rapport automatique généré toutes les heures.\n\n" +
        `**⏱️ Uptime :** \`${uptimeStr}\`\n` +
        `**🖥️ RAM utilisée :** \`${memMb} MB\`\n` +
        `**🌐 Serveurs :** \`${client.guilds.cache.size}\`\n` +
        `**📦 Commandes :** \`${client.commands.size}\`\n` +
        `**🏓 Ping API :** \`${client.ws.ping}ms\``,
    )
    .setFooter({
      text: "🛡️ Backup automatique — Trouver un nom",
      iconURL: client.user.displayAvatarURL(),
    })
    .setTimestamp();
}

async function askAdminToSetupLogChannel(guild) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_log_channel")
      .setLabel("⚙️ Configurer le salon de log")
      .setStyle(ButtonStyle.Primary),
  );

  const channel = guild.channels.cache.find(
    (c) =>
      c.isTextBased() &&
      c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages),
  );

  if (!channel) return console.error("[❌ Setup] Aucun salon accessible.");

  await channel.send({
    content: `👋 Salut ! **${client.user.username}** n'a pas de salon de log configuré.\nUn administrateur doit cliquer ci-dessous.`,
    components: [row],
  });
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`[🤖 Bot] Connecté en tant que ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return console.error("[❌ Ready] Aucun serveur trouvé.");

  const channel = await resolveLogChannel();

  if (!channel) {
    console.warn("[⚠️  Ready] Aucun salon de log configuré.");
    await askAdminToSetupLogChannel(guild);
    return;
  }

  // Renommer le salon avec l'emoji robot
  await channel.setName("🤖・bot-logs").catch(() => {});

  // Embed de démarrage
  await channel.send({ embeds: [buildStartEmbed()] });

  // Backup toutes les heures
  setInterval(
    async () => {
      const logCh = await resolveLogChannel();
      if (logCh)
        await logCh.send({ embeds: [buildBackupEmbed()] }).catch(() => {});
    },
    60 * 60 * 1000,
  );
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // ── Slash commandes ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "❌ Commande inconnue.",
        ephemeral: true,
      });
    }
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(
        `[❌ Commande] Erreur dans "${interaction.commandName}" :`,
        error,
      );
      const payload = {
        content: "❌ Une erreur est survenue.",
        ephemeral: true,
      };
      interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload);
    }
    return;
  }

  // ── Bouton setup log ─────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "setup_log_channel") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ Réservé aux administrateurs.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_log_channel")
      .setTitle("⚙️ Configuration du salon de log");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("channel_name_input")
          .setLabel("Nom du salon de log")
          .setPlaceholder("Ex : bot-logs")
          .setValue("bot-logs")
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(100)
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Modal embed ───────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "modal_embed") {
    const titre = interaction.fields.getTextInputValue("embed_titre");
    const description =
      interaction.fields.getTextInputValue("embed_description");
    const couleurRaw = interaction.fields
      .getTextInputValue("embed_couleur")
      .trim();
    const footer = interaction.fields.getTextInputValue("embed_footer");
    const couleur = /^#[0-9A-Fa-f]{6}$/.test(couleurRaw)
      ? couleurRaw
      : "#3498db";

    const embed = new EmbedBuilder()
      .setTitle(titre)
      .setDescription(description)
      .setColor(couleur);

    if (footer) embed.setFooter({ text: footer });

    await interaction.reply({ content: "✅ Embed envoyé !", ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
    return;
  }

  // ── Modal log channel ─────────────────────────────────────────────────────────
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "modal_log_channel"
  ) {
    await interaction.deferReply({ ephemeral: true });

    const channelName = interaction.fields
      .getTextInputValue("channel_name_input")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    const guild = interaction.guild;

    try {
      const logChannel = await guild.channels.create({
        name: "🤖・bot-logs",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        ],
        topic: `Salon de log du bot ${client.user.username}.`,
      });

      writeConfig({ logChannelId: logChannel.id });

      await interaction.editReply({
        content: `✅ Salon de log **${logChannel.name}** créé ! (${logChannel})`,
      });

      await logChannel.send({ embeds: [buildStartEmbed()] });

      console.log(
        `[✅ Setup] Salon de log créé : #${logChannel.name} (${logChannel.id})`,
      );
    } catch (err) {
      console.error("[❌ Setup] Erreur :", err.message);
      await interaction.editReply({
        content:
          "❌ Impossible de créer le salon. Vérifie les permissions **Gérer les salons**.",
      });
    }
    return;
  }
});

// ─── Connexion ────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);

// ─── Handler Loup-Garou ───────────────────────────────────────────────────────
const lgHandler = require("./handlers/lghandler");
client.on("interactionCreate", lgHandler);
