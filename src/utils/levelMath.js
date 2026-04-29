const xpForLevel = (level) => 5 * level * level + 50 * level + 100;

const getLevelProgress = (totalXp) => {
  let level = 0;
  let xpAccum = 0;
  while (xpAccum + xpForLevel(level) <= totalXp) {
    xpAccum += xpForLevel(level);
    level += 1;
    if (level > 999) break;
  }
  const currentLevelXp = totalXp - xpAccum;
  const xpToNextLevel = xpForLevel(level);
  return {
    level,
    currentLevelXp,
    xpToNextLevel,
    progress: Math.min(1, currentLevelXp / xpToNextLevel),
  };
};

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

module.exports = { xpForLevel, getLevelProgress, randomInt };
