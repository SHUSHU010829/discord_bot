const { coinSystem } = require("../../config");

const getCoinTwitchSubBonus = (member, source) => {
  const cfg = coinSystem?.twitchSubBonus;
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

const getCoinServerBoostBonus = (member, source) => {
  const cfg = coinSystem?.serverBoostBonus;
  if (!cfg?.enabled) return { multiplier: 1, name: null };
  if (!cfg?.roleId || !cfg?.multiplier || cfg.multiplier <= 1) {
    return { multiplier: 1, name: null };
  }
  if (!member?.roles?.cache) return { multiplier: 1, name: null };

  if (Array.isArray(cfg.appliesTo) && cfg.appliesTo.length > 0 && source) {
    if (!cfg.appliesTo.includes(source)) return { multiplier: 1, name: null };
  }

  if (!member.roles.cache.has(cfg.roleId)) return { multiplier: 1, name: null };
  return { multiplier: cfg.multiplier, name: cfg.name || "伺服器加成" };
};

module.exports = { getCoinTwitchSubBonus, getCoinServerBoostBonus };
