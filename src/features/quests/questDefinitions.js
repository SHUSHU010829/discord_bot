const { questSystem } = require("../../config");

const dailyQuests = () => questSystem?.daily || [];
const weeklyQuests = () => questSystem?.weekly || [];

const allQuests = () => [
  ...dailyQuests().map((q) => ({ ...q, period: "daily" })),
  ...weeklyQuests().map((q) => ({ ...q, period: "weekly" })),
];

const getQuestById = (id) => {
  for (const q of dailyQuests()) {
    if (q.id === id) return { ...q, period: "daily" };
  }
  for (const q of weeklyQuests()) {
    if (q.id === id) return { ...q, period: "weekly" };
  }
  return null;
};

const isEnabled = () => questSystem?.enabled !== false;

module.exports = {
  dailyQuests,
  weeklyQuests,
  allQuests,
  getQuestById,
  isEnabled,
};
