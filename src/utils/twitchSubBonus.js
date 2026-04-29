const { levelSystem } = require("../config");

const getTwitchSubBonus = (member, source) => {
  const cfg = levelSystem?.twitchSubBonus;
  if (!cfg?.enabled) return { multiplier: 1, name: null };
  if (!member?.roles?.cache) return { multiplier: 1, name: null };

  if (Array.isArray(cfg.appliesTo) && cfg.appliesTo.length > 0 && source) {
    if (!cfg.appliesTo.includes(source)) return { multiplier: 1, name: null };
  }

  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
  let best = null;
  for (const t of tiers) {
    if (!t?.roleId || !t?.multiplier || t.multiplier <= 1) continue;
    if (!member.roles.cache.has(t.roleId)) continue;
    if (!best || t.multiplier > best.multiplier) best = t;
  }

  if (!best) return { multiplier: 1, name: null };
  return { multiplier: best.multiplier, name: best.name || "Twitch 訂閱" };
};

module.exports = { getTwitchSubBonus };
