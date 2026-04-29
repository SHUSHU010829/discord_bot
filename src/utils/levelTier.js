const TIERS = [
  { min: 0,   key: "bronze",   label: "青銅",   color: "#A77044", emoji: "🥉" },
  { min: 10,  key: "silver",   label: "白銀",   color: "#9BA4B4", emoji: "🥈" },
  { min: 25,  key: "gold",     label: "黃金",   color: "#D4A437", emoji: "🥇" },
  { min: 50,  key: "platinum", label: "白金",   color: "#5BAEB7", emoji: "💎" },
  { min: 75,  key: "diamond",  label: "鑽石",   color: "#6B7FD7", emoji: "💠" },
  { min: 100, key: "legend",   label: "傳說",   color: "#C9302C", emoji: "👑" },
];

const getTier = (level) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (level >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
};

module.exports = { TIERS, getTier };
