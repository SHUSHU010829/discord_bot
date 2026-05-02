const { DateTime } = require("luxon");
const { coinSystem } = require("../../config");

const getTodayCoinsBySources = async (client, userId, guildId, sources) => {
  if (!client.coinTransactionsCollection) return 0;
  const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();

  const agg = await client.coinTransactionsCollection
    .aggregate([
      {
        $match: {
          userId,
          guildId,
          source: { $in: sources },
          date: today,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();

  return agg[0]?.total || 0;
};

module.exports = { getTodayCoinsBySources };
