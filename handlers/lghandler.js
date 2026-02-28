const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { state, getVivants, resetState } = require("../utils/lgstate");
const { buildClassementEmbed } = require("../utils/classement");

// Helper réponse éphémère compatible discord.js v14+
async function repondre(interaction, content, embed = null) {
  try {
    const payload = { content, flags: MessageFlags.Ephemeral };
    if (embed) payload.embeds = [embed];
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (err) {
    // Interaction expirée — on ignore silencieusement
    if (err.code !== 10062) console.error("[LG Handler]", err.message);
  }
}

module.exports = async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    if (err.code !== 10062) console.error("[❌ LG Handler]", err);
  }
};

async function handleInteraction(interaction) {
  // ── Rejoindre ────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_rejoindre") {
    if (state.phase !== "inscription")
      return repondre(interaction, "❌ Les inscriptions sont fermées.");
    if (state.joueurs.has(interaction.user.id))
      return repondre(interaction, "❌ Tu es déjà inscrit !");
    if (state.joueurs.size >= state.format)
      return repondre(
        interaction,
        `❌ La partie est complète (${state.format}/${state.format}).`,
      );

    state.joueurs.set(interaction.user.id, {
      user: interaction.user,
      member: interaction.member,
      role: null,
      vivant: false,
      amoureux: false,
    });

    await updateEmbed(interaction);

    if (state.joueurs.size === state.format) {
      const { lancerPartie } = require("../utils/lgengine");
      const rowOff = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("lg_rejoindre")
          .setLabel("🙋 Rejoindre")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("lg_quitter")
          .setLabel("❌ Quitter")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
      );
      await interaction.message.edit({ components: [rowOff] }).catch(() => {});
      await repondre(
        interaction,
        "✅ Tu as rejoint ! Nombre max atteint — la partie démarre ! 🐺",
      );
      lancerPartie(interaction.guild).catch((err) =>
        console.error("[❌ LG Engine]", err),
      );
      return;
    }
    return repondre(interaction, "✅ Tu as rejoint la partie !");
  }

  // ── Quitter ──────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_quitter") {
    if (state.phase !== "inscription")
      return repondre(interaction, "❌ La partie a déjà commencé.");
    if (!state.joueurs.has(interaction.user.id))
      return repondre(interaction, "❌ Tu n'es pas inscrit.");
    state.joueurs.delete(interaction.user.id);
    await updateEmbed(interaction);
    return repondre(interaction, "✅ Tu as quitté la partie.");
  }

  // ── Nouvelle partie ──────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_nouvelle_partie") {
    if (interaction.user.id !== state.createurId)
      return repondre(
        interaction,
        "❌ Seul le créateur de la partie peut faire ça.",
      );
    const { nettoyerSalons } = require("../utils/lgengine");
    const guild = interaction.guild;
    // Acquitter l'interaction AVANT de nettoyer (évite Unknown interaction)
    await repondre(interaction, "🔄 Remise à zéro en cours...");
    await nettoyerSalons(guild);
    resetState(true); // true = conserver la catégorie
    await interaction.channel
      .send("✅ Salons supprimés ! Lance une nouvelle partie avec `/lg-start`.")
      .catch(() => {});
    return;
  }

  // ── Stop ─────────────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_stop") {
    if (interaction.user.id !== state.createurId)
      return repondre(
        interaction,
        "❌ Seul le créateur de la partie peut faire ça.",
      );
    const { nettoyerPartie } = require("../utils/lgengine");
    await repondre(interaction, "🛑 Suppression en cours...");
    await nettoyerPartie(interaction.guild);
    resetState();
    return;
  }

  // ── Vote suspicion ───────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_vote_suspicion"
  ) {
    const joueur = state.joueurs.get(interaction.user.id);
    if (!joueur?.vivant)
      return repondre(interaction, "❌ Tu ne peux pas voter.");
    if (!state._suspicionVotes) state._suspicionVotes = new Map();
    if (state._suspicionVotes.has(interaction.user.id))
      return repondre(interaction, "❌ Tu as déjà voté !");
    state._suspicionVotes.set(interaction.user.id, interaction.values[0]);
    const cible = state.joueurs.get(interaction.values[0]);
    return repondre(
      interaction,
      `🔍 Tu suspectes **${cible?.user.displayName}**.`,
    );
  }

  // ── Vote village ─────────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_vote_village"
  ) {
    const joueur = state.joueurs.get(interaction.user.id);
    if (!joueur?.vivant)
      return repondre(
        interaction,
        "❌ Tu ne peux pas voter (mort ou non inscrit).",
      );
    if (state.votes.has(interaction.user.id))
      return repondre(interaction, "❌ Tu as déjà voté !");
    state.votes.set(interaction.user.id, interaction.values[0]);
    const cible = state.joueurs.get(interaction.values[0]);
    return repondre(
      interaction,
      `✅ Vote enregistré contre **${cible?.user.displayName}** !`,
    );
  }

  // ── Vote loups ───────────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_loups_vote"
  ) {
    const joueur = state.joueurs.get(interaction.user.id);
    if (!joueur || joueur.role?.id !== "loup_garou")
      return repondre(interaction, "❌ Tu n'es pas un loup.");
    if (state.votes.has(interaction.user.id))
      return repondre(interaction, "❌ Tu as déjà voté !");
    state.votes.set(interaction.user.id, interaction.values[0]);
    const cible = state.joueurs.get(interaction.values[0]);
    return repondre(
      interaction,
      `✅ Vote enregistré contre **${cible?.user.displayName}** !`,
    );
  }

  // ── Cupidon ──────────────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_cupidon_choix"
  ) {
    const { assignerAmoureux } = require("../utils/lgengine");
    await assignerAmoureux(interaction.guild, interaction.values);
    if (state._resolvers.cupidon) {
      state._resolvers.cupidon();
      state._resolvers.cupidon = null;
    }
    const noms = interaction.values
      .map((id) => `**${state.joueurs.get(id)?.user.displayName}**`)
      .join(" et ");
    return repondre(interaction, `💘 Les amoureux désignés : ${noms} !`);
  }

  // ── Voyante ──────────────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_voyante_choix"
  ) {
    const cible = state.joueurs.get(interaction.values[0]);
    if (!cible) return repondre(interaction, "❌ Joueur introuvable.");
    return repondre(
      interaction,
      null,
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🔮 Ta vision")
        .setDescription(
          `**${cible.user.displayName}** est... **${cible.role?.label}**`,
        )
        .setTimestamp(),
    );
  }

  // ── Sorcière : vie ───────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_sorciere_vie") {
    if (!state.sorciere.potionVie)
      return repondre(interaction, "❌ Potion déjà utilisée.");
    state.sorciere.potionVie = false;
    if (state.victimeNuit) {
      const v = state.joueurs.get(state.victimeNuit);
      if (v) {
        v.vivant = true;
      }
      state.victimeNuit = null;
    }
    return repondre(interaction, "💚 Tu as utilisé ta potion de vie !");
  }

  // ── Sorcière : mort ──────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_sorciere_mort") {
    if (!state.sorciere.potionMort)
      return repondre(interaction, "❌ Potion déjà utilisée.");
    const vivants = getVivants();
    const options = vivants.map((j) => ({
      label: j.user.displayName,
      value: j.user.id,
    }));
    try {
      await interaction.reply({
        content: "☠️ Choisis ta cible :",
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("lg_sorciere_mort_cible")
              .setPlaceholder("Choisir...")
              .addOptions(options),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      if (err.code !== 10062) console.error("[LG Sorciere mort]", err.message);
    }
    return;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_sorciere_mort_cible"
  ) {
    if (!state.sorciere.potionMort)
      return repondre(interaction, "❌ Potion déjà utilisée.");
    state.sorciere.potionMort = false;
    state.victimeSorciere = interaction.values[0];
    const cible = state.joueurs.get(interaction.values[0]);
    return repondre(
      interaction,
      `☠️ **${cible?.user.displayName}** sera éliminé(e) cette nuit.`,
    );
  }

  // ── Sorcière : passer ────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "lg_sorciere_passer") {
    return repondre(interaction, "⏩ Tu passes ton tour.");
  }

  // ── Chasseur ─────────────────────────────────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "lg_chasseur_cible"
  ) {
    if (state._resolvers.chasseur) {
      const fn = state._resolvers.chasseur;
      state._resolvers.chasseur = null;
      fn(interaction.values[0]);
    }
    return repondre(interaction, "🔫 Tu as tiré ton dernier coup.");
  }
}

// ── Mise à jour embed inscription ─────────────────────────────────────────────
async function updateEmbed(interaction) {
  const joueurs = [...state.joueurs.values()];
  const liste = joueurs.length
    ? joueurs.map((j, i) => `${i + 1}. ${j.user.displayName}`).join("\n")
    : "*Aucun pour l'instant...*";

  const ancien = interaction.message.embeds[0];
  if (!ancien) return;

  const embed = EmbedBuilder.from(ancien).setDescription(
    ancien.description.replace(
      /\*\*Joueurs inscrits \(\d+\/\d+\) :\*\*[\s\S]*/,
      "",
    ) + `**Joueurs inscrits (${joueurs.length}/${state.format}) :**\n${liste}`,
  );

  await interaction.message.edit({ embeds: [embed] }).catch(() => {});
}
