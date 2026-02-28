/**
 * Moteur de jeu Loup-Garou — version complète.
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const {
  state,
  ROLES_JEU,
  ROLE_BY_ID,
  COMPOSITIONS,
  ROLE_FLAVOR,
  resetState,
  getVivants,
  getMorts,
  getLoups,
  getVillage,
  getRoleVivant,
} = require("./lgstate");

const {
  enregistrerVictoire,
  enregistrerPartie,
  buildClassementEmbed,
} = require("./classement");

// ─── Utilitaires ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function melanger(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function compterVotes(votesMap) {
  const comptage = new Map();
  for (const cibleId of votesMap.values()) {
    comptage.set(cibleId, (comptage.get(cibleId) ?? 0) + 1);
  }
  return comptage;
}

function getMajoritaire(comptage) {
  if (!comptage.size) return null;
  const sorted = [...comptage.entries()].sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1];
  const exaequo = sorted.filter(([, v]) => v === max).map(([k]) => k);
  return exaequo.length === 1
    ? { id: exaequo[0], egalite: false }
    : { ids: exaequo, egalite: true };
}

async function sendVillage(payload) {
  if (!state.salons.village) return null;
  return state.salons.village.send(payload).catch(() => null);
}

async function compteARebours(salon, secondes, titre) {
  if (!salon) return;
  const paliers = [secondes, Math.floor(secondes * 0.5), 10, 5, 3, 2, 1]
    .filter((v, i, a) => v > 0 && v < secondes && a.indexOf(v) === i)
    .sort((a, b) => b - a);

  const mkEmbed = (s) =>
    new EmbedBuilder()
      .setColor(s <= 5 ? 0xe74c3c : 0xf39c12)
      .setTitle(titre)
      .setDescription(
        `⏳ **${s} seconde${s > 1 ? "s" : ""}** restante${s > 1 ? "s" : ""}...`,
      );

  let msg = await salon.send({ embeds: [mkEmbed(secondes)] }).catch(() => null);
  let restant = secondes;

  for (const palier of paliers) {
    await sleep((restant - palier) * 1000);
    restant = palier;
    if (msg) await msg.edit({ embeds: [mkEmbed(palier)] }).catch(() => {});
  }
}

// Vérifie si tout le monde a voté → résolution anticipée
function toutLeMondeAVote(votesMap, vivants) {
  return vivants.every((j) => votesMap.has(j.user.id));
}

// Épingler un message
async function epingler(msg) {
  if (msg) await msg.pin().catch(() => {});
}

// Retirer écriture à un joueur mort dans tous les salons
async function retirerAccesMort(joueur) {
  const salons = Object.values(state.salons).filter(Boolean);
  for (const salon of salons) {
    await salon.permissionOverwrites
      .edit(joueur.user.id, {
        SendMessages: false,
        AddReactions: false,
        UseApplicationCommands: false,
      })
      .catch(() => {});
  }
  // Garder ViewChannel = true pour qu'il puisse suivre
}

// ─── 1. Rôle Discord générique ────────────────────────────────────────────────

async function creerRoleJoueur(guild) {
  const role = await guild.roles.create({
    name: "joueur_lg",
    color: 0x2c3e50,
    reason: "Partie Loup-Garou",
    mentionable: false,
    hoist: false,
  });
  state.roles.joueur_lg = role;
}

// ─── 2. Distribution des rôles ────────────────────────────────────────────────

async function distribuerRoles(guild) {
  const compo = COMPOSITIONS[state.format];
  const roleIds = [
    ...Array(compo.loups).fill("loup_garou"),
    ...compo.speciaux,
    ...Array(compo.villageois).fill("villageois"),
  ];

  const joueurs = [...state.joueurs.values()];
  if (roleIds.length !== joueurs.length) {
    console.error(
      `[LG] ERREUR COMPOSITION: ${roleIds.length} roles pour ${joueurs.length} joueurs`,
    );
  }

  const rolesMelanges = melanger(roleIds);

  for (let i = 0; i < joueurs.length; i++) {
    const roleId = rolesMelanges[i];
    const roleJeu = ROLE_BY_ID[roleId];
    if (!roleJeu) {
      console.error(`[LG] Role manquant index ${i}: ${roleId}`);
      continue;
    }

    joueurs[i].role = roleJeu;
    joueurs[i].vivant = true;
    await joueurs[i].member.roles.add(state.roles.joueur_lg).catch(() => {});
  }
}

// ─── 3. Création des salons ───────────────────────────────────────────────────

async function creerSalons(guild) {
  const everyone = guild.roles.everyone;
  const roleJoueur = state.roles.joueur_lg;
  const joueurs = [...state.joueurs.values()];

  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  const allowRead = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
  ];

  async function creerSalon(name, overwrites, parent) {
    return guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent ?? state.categoryId,
      permissionOverwrites: [
        { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
        ...overwrites,
      ],
    });
  }

  // Catégorie — créée une seule fois, réutilisée ensuite
  if (!state.categoryId) {
    const category = await guild.channels.create({
      name: "🐺 Loup-Garou",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
    state.categoryId = category.id;

    // Salon classement — créé une seule fois dans la catégorie, visible par tous
    const salonClassement = await guild.channels
      .create({
        name: "🏆・classement",
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: everyone,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages],
          },
        ],
      })
      .catch(() => null);

    if (salonClassement) {
      state.salons.classement = salonClassement;
      await salonClassement
        .send({
          embeds: [buildClassementEmbed(guild.id, guild)],
        })
        .catch(() => {});
    }
  }

  // #village — tous les joueurs_lg
  state.salons.village = await creerSalon("🏘️・village", [
    { id: roleJoueur, allow },
  ]);
  state.channel = state.salons.village;

  // #tanière — loups + petite fille lecture seule
  const loups = joueurs.filter((j) => j.role?.id === "loup_garou");
  const pf = joueurs.find((j) => j.role?.id === "petite_fille");
  state.salons.loups = await creerSalon("🐺・taniere-des-loups", [
    ...loups.map((j) => ({ id: j.user.id, allow })),
    ...(pf ? [{ id: pf.user.id, allow: allowRead }] : []),
  ]);

  // Salons rôles spéciaux
  const voyante = joueurs.find((j) => j.role?.id === "voyante");
  const sorciere = joueurs.find((j) => j.role?.id === "sorciere");
  const cupidon = joueurs.find((j) => j.role?.id === "cupidon");
  const chasseur = joueurs.find((j) => j.role?.id === "chasseur");
  const amoureux1 = null; // créé après Cupidon

  if (voyante)
    state.salons.voyante = await creerSalon("🔮・voyante", [
      { id: voyante.user.id, allow },
    ]);
  if (sorciere)
    state.salons.sorciere = await creerSalon("🧙・sorciere", [
      { id: sorciere.user.id, allow },
    ]);
  if (cupidon)
    state.salons.cupidon = await creerSalon("💘・cupidon", [
      { id: cupidon.user.id, allow },
    ]);
  if (chasseur)
    state.salons.chasseur = await creerSalon("🔫・chasseur", [
      { id: chasseur.user.id, deny: [PermissionFlagsBits.ViewChannel] },
    ]);
}

// ─── 3b. Annonce des rôles ────────────────────────────────────────────────────

async function annoncerRoles(guild) {
  const joueurs = [...state.joueurs.values()];

  const salonInfo = {
    loup_garou:
      "➡️ Ce salon est votre repaire. Votez ici chaque nuit pour choisir votre victime.",
    voyante:
      "➡️ Chaque nuit, un menu apparaîtra ici pour espionner le rôle d'un joueur.",
    sorciere:
      "➡️ Chaque nuit, tes potions apparaîtront ici. Une de vie, une de mort.",
    chasseur: "➡️ Ce salon s'activera à ta mort pour choisir ta cible.",
    cupidon: "➡️ Dès la première nuit, désigne les deux amoureux ici.",
    petite_fille: "➡️ Tu peux lire les messages des loups en lecture seule !",
    villageois:
      "➡️ Tu n'as pas de pouvoir. Utilise ta persuasion dans **#🏘️・village** !",
  };

  for (const joueur of joueurs) {
    const roleId = joueur.role?.id;
    const roleJeu = joueur.role;
    if (!roleJeu) continue;

    const embed = new EmbedBuilder()
      .setColor(roleJeu.color)
      .setTitle(`🐺 Ton rôle secret — ${roleJeu.label}`)
      .setDescription(ROLE_FLAVOR[roleId])
      .addFields({
        name: "📍 Où agir ?",
        value: salonInfo[roleId] ?? "➡️ Suis les instructions.",
      })
      .setFooter({ text: "🤫 Ne révèle surtout pas ton rôle !" })
      .setTimestamp();

    if (roleId === "villageois") {
      // Salon temporaire privé — supprimé après 30s
      const salonTemp = await guild.channels
        .create({
          name: `🌾・role-${joueur.user.username}`.slice(0, 100),
          type: ChannelType.GuildText,
          parent: state.categoryId,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: joueur.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        })
        .catch(() => null);

      if (salonTemp) {
        await salonTemp
          .send({ content: `${joueur.member}`, embeds: [embed] })
          .catch(() => {});
        setTimeout(
          () => salonTemp.delete("Temporaire 30s").catch(() => {}),
          30000,
        );
      }
    } else {
      const salonDedié = {
        loup_garou: state.salons.loups,
        voyante: state.salons.voyante,
        sorciere: state.salons.sorciere,
        chasseur: state.salons.chasseur,
        cupidon: state.salons.cupidon,
        petite_fille: state.salons.loups,
      }[roleId];

      if (salonDedié) {
        await salonDedié
          .send({ content: `${joueur.member}`, embeds: [embed] })
          .catch(() => {});
      }
    }
  }
}

// ─── 4. Nettoyage ─────────────────────────────────────────────────────────────

async function nettoyerSalons(guild) {
  // Supprime les salons de jeu uniquement — PAS la catégorie, PAS le classement
  const SALONS_A_GARDER = ["classement"];

  for (const [nom, salon] of Object.entries(state.salons)) {
    if (SALONS_A_GARDER.includes(nom)) continue;
    await salon?.delete("Fin LG").catch(() => {});
  }

  // Retirer rôle joueur_lg
  for (const joueur of state.joueurs.values()) {
    if (state.roles.joueur_lg) {
      await joueur.member.roles.remove(state.roles.joueur_lg).catch(() => {});
    }
  }
  await state.roles.joueur_lg?.delete("Fin LG").catch(() => {});
}

async function nettoyerPartie(guild) {
  await nettoyerSalons(guild);
  // Supprimer aussi la catégorie
  if (state.categoryId) {
    const cat = guild.channels.cache.get(state.categoryId);
    await cat?.delete("Fin LG").catch(() => {});
    state.categoryId = null;
  }
}

// ─── 5. Phase nuit ────────────────────────────────────────────────────────────

async function phaseNuit(guild) {
  state.phase = "nuit";
  state.votes = new Map();
  state.victimeNuit = null;
  state.victimeSorciere = null;

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1a1a2e)
        .setTitle(`🌙 Nuit ${state.nuit} — Fermez les yeux...`)
        .setDescription("Les rôles vont agir dans l'ombre...")
        .setTimestamp(),
    ],
  });

  if (state.nuit === 1) await phaseCupidon(guild);
  await phaseLoups(guild);
  await phaseVoyante(guild);
  await phaseSorciere(guild);
  await phaseReveil(guild);
}

// ── Cupidon ───────────────────────────────────────────────────────────────────

async function phaseCupidon(guild) {
  const cupidon = getRoleVivant("cupidon");
  if (!cupidon || !state.salons.cupidon) return;

  const vivants = getVivants();
  const options = vivants.map((j) => ({
    label: j.user.displayName,
    value: j.user.id,
  }));
  const duree = 20;

  await state.salons.cupidon.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6b9d)
        .setTitle("💘 Cupidon, réveille-toi !")
        .setDescription(
          `Choisis les deux amoureux. **${duree} secondes** sinon deux joueurs aléatoires.`,
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_cupidon_choix")
          .setPlaceholder("Choisis 2 joueurs...")
          .setMinValues(2)
          .setMaxValues(2)
          .addOptions(options),
      ),
    ],
  });

  compteARebours(state.salons.cupidon, duree, "💘 Temps restant — Cupidon");

  await new Promise((resolve) => {
    state._resolvers.cupidon = resolve;
    setTimeout(() => {
      if (state._resolvers.cupidon) {
        assignerAmoureux(
          guild,
          melanger(vivants)
            .slice(0, 2)
            .map((j) => j.user.id),
        );
        state._resolvers.cupidon = null;
        resolve();
      }
    }, duree * 1000);
  });
}

async function assignerAmoureux(guild, ids) {
  state.cupidon.amoureux = ids;

  // Créer un salon de communication pour les amoureux
  const [j1, j2] = ids.map((id) => state.joueurs.get(id)).filter(Boolean);
  if (j1) j1.amoureux = true;
  if (j2) j2.amoureux = true;

  if (j1 && j2 && state.categoryId) {
    const allow = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    const salonAmour = await guild.channels
      .create({
        name: "💕・amoureux",
        type: ChannelType.GuildText,
        parent: state.categoryId,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: j1.user.id, allow },
          { id: j2.user.id, allow },
        ],
      })
      .catch(() => null);

    if (salonAmour) {
      state.salons.amoureux = salonAmour;
      await salonAmour
        .send({
          content: `${j1.member} ${j2.member}`,
          embeds: [
            new EmbedBuilder()
              .setColor(0xff6b9d)
              .setTitle("💘 Vous êtes amoureux !")
              .setDescription(
                `**${j1.user.displayName}** et **${j2.user.displayName}**, Cupidon vous a réunis !\n\n` +
                  `Ce salon vous permet de communiquer en secret.\n` +
                  `⚠️ Si l'un de vous meurt, l'autre mourra de chagrin...`,
              ),
          ],
        })
        .catch(() => {});
    }

    // Notifier chacun
    for (const [joueur, autre] of [
      [j1, j2],
      [j2, j1],
    ]) {
      await joueur.member
        .send(
          `💘 Tu es tombé(e) amoureux/amoureuse de **${autre.user.displayName}** ! Un salon secret vous permet de communiquer.`,
        )
        .catch(() => {});
    }
  }
}

// ── Loups ─────────────────────────────────────────────────────────────────────

async function phaseLoups(guild) {
  const loups = getLoups();
  if (!loups.length || !state.salons.loups) return;

  const cibles = getVivants().filter((j) => j.role?.id !== "loup_garou");
  const options = cibles.map((j) => ({
    label: j.user.displayName,
    value: j.user.id,
  }));
  const duree = 20;

  state.votes = new Map();

  await state.salons.loups.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle("🐺 Loups, réveillez-vous !")
        .setDescription(
          `Votez pour votre victime. **${duree} secondes.**\nMajorité requise — égalité = victime aléatoire.`,
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_loups_vote")
          .setPlaceholder("Voter pour...")
          .addOptions(options),
      ),
    ],
  });

  compteARebours(state.salons.loups, duree, "🐺 Temps restant");

  // Attendre fin du timer OU que tous les loups aient voté
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (toutLeMondeAVote(state.votes, loups)) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, duree * 1000);
  });

  const comptage = compterVotes(state.votes);
  const resultat = getMajoritaire(comptage);
  const ciblesVivantes = getVivants().filter(
    (j) => j.role?.id !== "loup_garou",
  );

  if (!resultat)
    state.victimeNuit =
      ciblesVivantes[Math.floor(Math.random() * ciblesVivantes.length)]?.user
        .id ?? null;
  else if (resultat.egalite)
    state.victimeNuit =
      resultat.ids[Math.floor(Math.random() * resultat.ids.length)];
  else state.victimeNuit = resultat.id;

  state.votes = new Map();

  if (state.victimeNuit) {
    const v = state.joueurs.get(state.victimeNuit);
    await state.salons.loups.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8e44ad)
          .setDescription(
            `✅ Victime désignée : **${v?.user.displayName}**. Rendormez-vous...`,
          ),
      ],
    });
  }
}

// ── Voyante ───────────────────────────────────────────────────────────────────

async function phaseVoyante(guild) {
  const voyante = getRoleVivant("voyante");
  if (!voyante || !state.salons.voyante) return;

  const cibles = getVivants().filter((j) => j.user.id !== voyante.user.id);
  const options = cibles.map((j) => ({
    label: j.user.displayName,
    value: j.user.id,
  }));
  const duree = 20;

  await state.salons.voyante.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🔮 Voyante, réveille-toi !")
        .setDescription(
          `Choisis un joueur dont tu veux connaître le rôle. **${duree} secondes.**`,
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_voyante_choix")
          .setPlaceholder("Choisir...")
          .addOptions(options),
      ),
    ],
  });

  compteARebours(state.salons.voyante, duree, "🔮 Temps restant — Voyante");
  await sleep(duree * 1000);
}

// ── Sorcière ──────────────────────────────────────────────────────────────────

async function phaseSorciere(guild) {
  const sorciere = getRoleVivant("sorciere");
  if (!sorciere || !state.salons.sorciere) return;
  if (!state.sorciere.potionVie && !state.sorciere.potionMort) return;

  const victime = state.victimeNuit
    ? state.joueurs.get(state.victimeNuit)
    : null;
  const duree = 20;
  const boutons = [];

  if (state.sorciere.potionVie && victime) {
    boutons.push(
      new ButtonBuilder()
        .setCustomId("lg_sorciere_vie")
        .setLabel(`💚 Sauver ${victime.user.displayName}`)
        .setStyle(ButtonStyle.Success),
    );
  }
  if (state.sorciere.potionMort) {
    boutons.push(
      new ButtonBuilder()
        .setCustomId("lg_sorciere_mort")
        .setLabel("☠️ Potion de mort")
        .setStyle(ButtonStyle.Danger),
    );
  }
  boutons.push(
    new ButtonBuilder()
      .setCustomId("lg_sorciere_passer")
      .setLabel("⏩ Passer")
      .setStyle(ButtonStyle.Secondary),
  );

  const potions = [
    state.sorciere.potionVie ? "💚 Vie" : null,
    state.sorciere.potionMort ? "☠️ Mort" : null,
  ]
    .filter(Boolean)
    .join(", ");

  await state.salons.sorciere.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x27ae60)
        .setTitle("🧙 Sorcière, réveille-toi !")
        .setDescription(
          `Potions : **${potions}**\n` +
            (victime
              ? `Les loups s'en prennent à **${victime.user.displayName}**.\n`
              : "") +
            `**${duree} secondes** pour agir.`,
        ),
    ],
    components: [new ActionRowBuilder().addComponents(boutons)],
  });

  compteARebours(state.salons.sorciere, duree, "🧙 Temps restant — Sorcière");
  await sleep(duree * 1000);
}

// ─── 6. Réveil ────────────────────────────────────────────────────────────────

async function phaseReveil(guild) {
  const morts = [];

  const tuerJoueur = (joueur, cause) => {
    if (joueur?.vivant) {
      joueur.vivant = false;
      morts.push({ joueur, cause });
    }
  };

  if (state.victimeNuit)
    tuerJoueur(state.joueurs.get(state.victimeNuit), "loups");
  if (state.victimeSorciere)
    tuerJoueur(state.joueurs.get(state.victimeSorciere), "sorciere");

  // Morts de chagrin — amoureux
  for (const mort of [...morts]) {
    if (state.cupidon.amoureux.includes(mort.joueur.user.id)) {
      const autreId = state.cupidon.amoureux.find(
        (id) => id !== mort.joueur.user.id,
      );
      tuerJoueur(state.joueurs.get(autreId), "chagrin");
    }
  }

  // Retirer accès écriture aux morts, garder lecture
  for (const mort of morts) {
    await retirerAccesMort(mort.joueur);
  }

  const causesLabel = {
    loups: "🐺 Dévoré(e) par les loups",
    sorciere: "☠️ Victime de la sorcière",
    chagrin: "💔 Mort(e) de chagrin",
  };

  const embedReveil = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`☀️ Le village se réveille — Nuit ${state.nuit}`)
    .setTimestamp();

  if (morts.length === 0) {
    embedReveil.setDescription(
      "✨ Miracle ! Personne n'est mort cette nuit...",
    );
    await sendVillage({ embeds: [embedReveil] });
  } else {
    embedReveil.setDescription(
      morts
        .map(
          (m) =>
            `💀 **${m.joueur.user.displayName}** — ${causesLabel[m.cause]}\n*(Rôle : ${m.joueur.role?.label})*`,
        )
        .join("\n\n"),
    );
    const msgMort = await sendVillage({ embeds: [embedReveil] });
    await epingler(msgMort);
  }

  for (const mort of morts) {
    if (mort.joueur.role?.id === "chasseur")
      await phaseChasseur(mort.joueur, guild);
  }

  if (await verifierVictoire(guild)) return;

  state.nuit++;
  await phaseDiscussion(guild);
}

// ── Chasseur ──────────────────────────────────────────────────────────────────

async function phaseChasseur(chasseur, guild) {
  const cibles = getVivants();
  if (!cibles.length || !state.salons.chasseur) return;
  const duree = 20;

  await state.salons.chasseur.permissionOverwrites
    .edit(chasseur.user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    })
    .catch(() => {});

  await state.salons.chasseur.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("🔫 Chasseur, tire ton dernier coup !")
        .setDescription(`Emporte un joueur avec toi. **${duree} secondes.**`),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_chasseur_cible")
          .setPlaceholder("Choisir une cible...")
          .addOptions(
            cibles.map((j) => ({
              label: j.user.displayName,
              value: j.user.id,
            })),
          ),
      ),
    ],
  });

  compteARebours(state.salons.chasseur, duree, "🔫 Temps restant — Chasseur");

  await new Promise((resolve) => {
    state._resolvers.chasseur = async (id) => {
      const cible = state.joueurs.get(id);
      if (cible?.vivant) {
        cible.vivant = false;
        await retirerAccesMort(cible);
        const msgChasseur = await sendVillage({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe67e22)
              .setTitle("🔫 Le Chasseur tire !")
              .setDescription(
                `**${chasseur.user.displayName}** emporte **${cible.user.displayName}** dans la mort !\n*(Rôle : ${cible.role?.label})*`,
              ),
          ],
        });
        await epingler(msgChasseur);

        if (state.cupidon.amoureux.includes(id)) {
          const autreId = state.cupidon.amoureux.find((i) => i !== id);
          const autre = autreId ? state.joueurs.get(autreId) : null;
          if (autre?.vivant) {
            autre.vivant = false;
            await retirerAccesMort(autre);
            const msgChagrin = await sendVillage({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff6b9d)
                  .setTitle("💔 Mort de chagrin")
                  .setDescription(
                    `**${autre.user.displayName}** ne peut survivre...\n*(Rôle : ${autre.role?.label})*`,
                  ),
              ],
            });
            await epingler(msgChagrin);
          }
        }
      }
      resolve();
    };
    setTimeout(() => {
      if (state._resolvers.chasseur) {
        state._resolvers.chasseur = null;
        resolve();
      }
    }, duree * 1000);
  });
}

// ─── 7. Discussion + vote suspicion ──────────────────────────────────────────

async function phaseDiscussion(guild) {
  state.phase = "discussion";
  const vivants = getVivants();

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`☀️ Jour ${state.nuit - 1} — Discussion`)
        .setDescription(
          `Débattez, accusez, défendez-vous !\n\n` +
            `**Joueurs en vie (${vivants.length}) :**\n` +
            vivants.map((j) => `• ${j.user.displayName}`).join("\n") +
            `\n\n🔍 Vote de suspicion dans **30 secondes**...`,
        )
        .setTimestamp(),
    ],
  });

  await sleep(30000);
  await phaseVoteSuspicion(guild);

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("💬 Débat libre — 2 minutes 30")
        .setDescription(
          "Utilisez le récap pour orienter vos discussions !\n⏳ Vote d'élimination ensuite...",
        ),
    ],
  });

  await sleep(120000);

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⏳ Plus que 30 secondes !")
        .setDescription("Dernière chance !"),
    ],
  });

  await sleep(30000);
  await phaseVote(guild);
}

async function phaseVoteSuspicion(guild) {
  const vivants = getVivants();
  const duree = 30;
  state._suspicionVotes = new Map();

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔍 Vote de suspicion — Qui suspectes-tu ?")
        .setDescription(
          `Ce vote **n'élimine personne** — il sert à orienter le débat.\n**${duree} secondes.**`,
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_vote_suspicion")
          .setPlaceholder("Je suspecte...")
          .addOptions(
            vivants.map((j) => ({
              label: j.user.displayName,
              value: j.user.id,
            })),
          ),
      ),
    ],
  });

  compteARebours(state.salons.village, duree, "🔍 Temps restant — suspicion");

  // Fin quand tout le monde a voté OU timer
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (toutLeMondeAVote(state._suspicionVotes, vivants)) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, duree * 1000);
  });

  const comptage = new Map();
  for (const cibleId of state._suspicionVotes.values()) {
    comptage.set(cibleId, (comptage.get(cibleId) ?? 0) + 1);
  }
  state._suspicionVotes = null;

  if (!comptage.size) {
    await sendVillage({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle("🔍 Résultat — Aucun vote")
          .setDescription("Personne n'a voté."),
      ],
    });
    return;
  }

  const sorted = [...comptage.entries()].sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1];
  const tops = sorted.slice(0, 3);
  let desc = "";

  if (sorted.filter(([, v]) => v === max).length === 1) {
    const j = state.joueurs.get(sorted[0][0]);
    desc = `**${j?.user.displayName}** est le plus suspecté avec **${max} vote${max > 1 ? "s" : ""}** !\n\n`;
  } else {
    desc = `Égalité au sommet !\n\n`;
  }

  desc +=
    "**Classement :**\n" +
    tops
      .map(([id, nb], i) => {
        const j = state.joueurs.get(id);
        return `${["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} **${j?.user.displayName}** — ${nb} vote${nb > 1 ? "s" : ""}`;
      })
      .join("\n");

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔍 Résultat du vote de suspicion")
        .setDescription(desc)
        .setFooter({ text: "Ce résultat n'élimine personne !" })
        .setTimestamp(),
    ],
  });
}

// ─── 8. Vote d'élimination ────────────────────────────────────────────────────

async function phaseVote(guild, revoteIds = null) {
  state.phase = "vote";
  state.votes = new Map();
  const duree = 30;
  const vivants = getVivants();
  const cibles = revoteIds
    ? revoteIds.map((id) => state.joueurs.get(id)).filter(Boolean)
    : vivants;

  await sendVillage({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(
          revoteIds ? "🗳️ Revote — Ex-aequo !" : "🗳️ Vote d'élimination !",
        )
        .setDescription(
          (revoteIds
            ? `Revote entre : ${cibles.map((j) => `**${j.user.displayName}**`).join(" et ")}\n\n`
            : "") +
            `**${duree} secondes !**\n\n**Suspects :**\n${cibles.map((j) => `• ${j.user.displayName}`).join("\n")}`,
        )
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("lg_vote_village")
          .setPlaceholder("Voter pour...")
          .addOptions(
            cibles.map((j) => ({
              label: j.user.displayName,
              value: j.user.id,
            })),
          ),
      ),
    ],
  });

  compteARebours(state.salons.village, duree, "🗳️ Temps restant — vote");

  // Fin quand tous les vivants ont voté OU timer
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (toutLeMondeAVote(state.votes, vivants)) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, duree * 1000);
  });

  const comptage = compterVotes(state.votes);
  const resultat = getMajoritaire(comptage);

  if (!resultat || !comptage.size) {
    await sendVillage({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle("🤷 Aucun vote !")
          .setDescription("La nuit tombe à nouveau."),
      ],
    });
    await sleep(3000);
    await phaseNuit(guild);
    return;
  }

  if (resultat.egalite && !revoteIds) {
    await sendVillage({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle("⚖️ Égalité !")
          .setDescription(
            `Revote dans **5 secondes** entre : ${resultat.ids.map((id) => `**${state.joueurs.get(id)?.user.displayName}**`).join(" et ")}`,
          ),
      ],
    });
    await sleep(5000);
    await phaseVote(guild, resultat.ids);
    return;
  }

  const elimineId = resultat.egalite
    ? resultat.ids[Math.floor(Math.random() * resultat.ids.length)]
    : resultat.id;

  const elimine = state.joueurs.get(elimineId);
  if (elimine?.vivant) {
    elimine.vivant = false;
    await retirerAccesMort(elimine);

    const msgElim = await sendVillage({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("⚰️ Élimination !")
          .setDescription(
            `Le village élimine **${elimine.user.displayName}** !\n\nSon rôle était : **${elimine.role?.label}**`,
          )
          .setTimestamp(),
      ],
    });
    await epingler(msgElim);

    // Mort de chagrin ?
    if (state.cupidon.amoureux.includes(elimineId)) {
      const autreId = state.cupidon.amoureux.find((id) => id !== elimineId);
      const autre = autreId ? state.joueurs.get(autreId) : null;
      if (autre?.vivant) {
        autre.vivant = false;
        await retirerAccesMort(autre);
        const msgChagrin = await sendVillage({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff6b9d)
              .setTitle("💔 Mort de chagrin")
              .setDescription(
                `**${autre.user.displayName}** ne peut survivre...\n*(Rôle : ${autre.role?.label})*`,
              ),
          ],
        });
        await epingler(msgChagrin);
      }
    }

    if (elimine.role?.id === "chasseur") await phaseChasseur(elimine, guild);
  }

  if (await verifierVictoire(guild)) return;
  await sleep(5000);
  await phaseNuit(guild);
}

// ─── 9. Victoire ─────────────────────────────────────────────────────────────

async function verifierVictoire(guild) {
  const loups = getLoups();
  const village = getVillage();
  const vivants = getVivants();

  if (
    vivants.length === 2 &&
    vivants.every((j) => state.cupidon.amoureux.includes(j.user.id))
  ) {
    await announceVictoire(guild, "amoureux", vivants);
    return true;
  }
  if (loups.length === 0) {
    await announceVictoire(
      guild,
      "village",
      village.concat(getMorts().filter((j) => j.role?.id !== "loup_garou")),
    );
    return true;
  }
  if (loups.length >= village.length) {
    await announceVictoire(guild, "loups", loups);
    return true;
  }
  return false;
}

async function announceVictoire(guild, camp, gagnants) {
  const configs = {
    village: {
      color: 0x2ecc71,
      title: "🎉 Le Village a gagné !",
      desc: "Tous les loups ont été éliminés !",
    },
    loups: {
      color: 0x8e44ad,
      title: "🐺 Les Loups-Garous ont gagné !",
      desc: "Les loups dominent le village...",
    },
    amoureux: {
      color: 0xff6b9d,
      title: "💘 Les Amoureux ont gagné !",
      desc: "L'amour a triomphé sur tout !",
    },
  };

  const { color, title, desc } = configs[camp];
  const tous = [...state.joueurs.values()];
  const recap = tous
    .map(
      (j) =>
        `${j.vivant ? "✅" : "💀"} **${j.user.displayName}** — ${j.role?.label ?? "Inconnu"}`,
    )
    .join("\n");

  // Enregistrer classement
  const tousData = tous.map((j) => ({
    userId: j.user.id,
    displayName: j.user.displayName,
  }));
  const gagnantsData = gagnants.map((j) => ({
    userId: j.user.id,
    displayName: j.user.displayName,
  }));
  enregistrerPartie(guild.id, tousData);
  enregistrerVictoire(guild.id, gagnantsData);

  // Mettre à jour le salon #classement
  if (state.salons.classement) {
    try {
      const messages = await state.salons.classement.messages.fetch({
        limit: 10,
      });
      for (const msg of messages.values()) await msg.delete().catch(() => {});
      await state.salons.classement.send({
        embeds: [buildClassementEmbed(guild.id, guild)],
      });
    } catch {}
  }

  // Embed victoire
  const embedVictoire = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`${desc}\n\n**Récap des rôles :**\n${recap}`)
    .setFooter({ text: `Nuits jouées : ${state.nuit - 1}` })
    .setTimestamp();

  // Embed classement mis à jour
  const embedClassement = buildClassementEmbed(guild.id, guild);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lg_nouvelle_partie")
      .setLabel("🔄 Nouvelle partie")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lg_stop")
      .setLabel("🛑 Stop")
      .setStyle(ButtonStyle.Danger),
  );

  // Ouvrir village en lecture seule pour tous les joueurs
  if (state.roles.joueur_lg) {
    await state.salons.village?.permissionOverwrites
      .edit(state.roles.joueur_lg, {
        SendMessages: false,
        ViewChannel: true,
      })
      .catch(() => {});
  }

  await sendVillage({ embeds: [embedVictoire], components: [row] });

  // Créer salon debrief — ouvert à tous les joueurs, 30s de discussion libre
  const debrief = await guild.channels
    .create({
      name: "🗣️・debrief-de-game",
      type: ChannelType.GuildText,
      parent: state.categoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: state.roles.joueur_lg,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    })
    .catch(() => null);

  if (debrief) {
    state.salons.debrief = debrief;
    await debrief
      .send({
        content: tous.map((j) => `${j.member}`).join(" "),
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle("🗣️ Debrief de game !")
            .setDescription(
              `La partie est terminée — **${title}**\n\nParlons-en ! Ce salon sera supprimé avec le reste.`,
            )
            .setTimestamp(),
          embedClassement,
        ],
      })
      .catch(() => {});
  }

  state._guild = guild;
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function lancerPartie(guild) {
  try {
    await creerRoleJoueur(guild);
    await distribuerRoles(guild);
    await creerSalons(guild);
    await annoncerRoles(guild);

    await sendVillage({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2c3e50)
          .setTitle("🐺 La partie commence !")
          .setDescription(
            `Les rôles ont été annoncés dans vos salons respectifs.\n\n` +
              `**Joueurs :**\n${[...state.joueurs.values()].map((j) => `• ${j.user.displayName}`).join("\n")}\n\n` +
              `La première nuit commence dans **5 secondes**...`,
          )
          .setTimestamp(),
      ],
    });

    await sleep(5000);
    await phaseNuit(guild);
  } catch (err) {
    console.error("[❌ LG Engine]", err);
    await nettoyerPartie(guild).catch(() => {});
    resetState();
  }
}

module.exports = {
  lancerPartie,
  assignerAmoureux,
  nettoyerSalons,
  nettoyerPartie,
  state,
};
