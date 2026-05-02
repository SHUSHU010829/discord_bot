const { levelSystem } = require("../config");

const getServerBoostBonus = (member, source) => {
  const cfg = levelSystem?.serverBoostBonus;
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

module.exports = { getServerBoostBonus };
