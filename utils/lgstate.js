const state = {
  active: false,
  format: null,
  guild: null,
  categoryId: null, // catégorie conservée entre parties
  channel: null,
  salons: {},
  roles: {},
  joueurs: new Map(),
  phase: null,
  nuit: 1,
  sorciere: { potionVie: true, potionMort: true },
  cupidon: { amoureux: [] },
  victimeNuit: null,
  victimeSorciere: null,
  votes: new Map(),
  _suspicionVotes: null,
  inscriptionMessage: null,
  createurId: null,
  _guild: null,
  _resolvers: {},
};

const ROLES_JEU = [
  { id: "loup_garou", label: "🐺 Loup-Garou", camp: "loups", color: 0x8e44ad },
  {
    id: "villageois",
    label: "👨‍🌾 Villageois",
    camp: "village",
    color: 0x27ae60,
  },
  { id: "voyante", label: "🔮 Voyante", camp: "village", color: 0x9b59b6 },
  { id: "sorciere", label: "🧙 Sorcière", camp: "village", color: 0x1abc9c },
  { id: "chasseur", label: "🔫 Chasseur", camp: "village", color: 0xe67e22 },
  { id: "cupidon", label: "💘 Cupidon", camp: "village", color: 0xff6b9d },
  {
    id: "petite_fille",
    label: "👧 Petite Fille",
    camp: "village",
    color: 0xf1c40f,
  },
];

const ROLE_BY_ID = Object.fromEntries(ROLES_JEU.map((r) => [r.id, r]));

const COMPOSITIONS = {
  8: {
    loups: 2,
    speciaux: ["voyante", "sorciere", "chasseur", "cupidon"],
    villageois: 2,
  },
  12: {
    loups: 3,
    speciaux: ["voyante", "sorciere", "chasseur", "cupidon", "petite_fille"],
    villageois: 4,
  },
};

const ROLE_FLAVOR = {
  loup_garou:
    "🐺 Tu es un **Loup-Garou**.\nChaque nuit, vote avec tes congénères dans votre salon secret pour dévorer un villageois.\nReste discret le jour !",
  villageois:
    "👨‍🌾 Tu es un **Villageois**.\nPas de pouvoir spécial — use de ta persuasion pour débusquer les loups lors des votes !",
  voyante:
    "🔮 Tu es la **Voyante**.\nChaque nuit, tu peux découvrir le rôle d'un joueur dans ton salon secret.",
  sorciere:
    "🧙 Tu es la **Sorcière**.\nTu possèdes une potion de vie et une potion de mort.\nUtilise-les dans ton salon secret chaque nuit.",
  chasseur:
    "🔫 Tu es le **Chasseur**.\nSi tu es éliminé, tu peux emporter un joueur avec toi dans ton salon secret.",
  cupidon:
    "💘 Tu es **Cupidon**.\nLa première nuit, désigne deux amoureux dans ton salon secret.\nSi l'un meurt, l'autre mourra de chagrin.",
  petite_fille:
    "👧 Tu es la **Petite Fille**.\nTu peux espionner le salon des loups en lecture seule chaque nuit.\nGare à toi si tu te fais prendre !",
};

// Reset partiel — conserve categoryId, salon classement et createurId
function resetState(keepCategory = false) {
  const savedCategory = keepCategory ? state.categoryId : null;
  const savedClassement = keepCategory ? state.salons.classement : null;
  const savedCreateurId = state.createurId;

  state.active = false;
  state.format = null;
  state.guild = null;
  state.categoryId = savedCategory;
  state.channel = null;
  state.salons = savedClassement ? { classement: savedClassement } : {};
  state.roles = {};
  state.joueurs = new Map();
  state.phase = null;
  state.nuit = 1;
  state.sorciere = { potionVie: true, potionMort: true };
  state.cupidon = { amoureux: [] };
  state.victimeNuit = null;
  state.victimeSorciere = null;
  state.votes = new Map();
  state._suspicionVotes = null;
  state.inscriptionMessage = null;
  state.createurId = savedCreateurId;
  state._guild = null;
  state._resolvers = {};
}

const getVivants = () => [...state.joueurs.values()].filter((j) => j.vivant);
const getMorts = () => [...state.joueurs.values()].filter((j) => !j.vivant);
const getLoups = () => getVivants().filter((j) => j.role?.id === "loup_garou");
const getVillage = () =>
  getVivants().filter((j) => j.role?.id !== "loup_garou");
const getRoleVivant = (id) =>
  getVivants().find((j) => j.role?.id === id) ?? null;

module.exports = {
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
};
