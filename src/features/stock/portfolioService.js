require("colors");

async function getPosition(client, userId, guildId, symbol) {
  if (!client.userPortfolioCollection) return null;
  return client.userPortfolioCollection.findOne({ userId, guildId, symbol });
}

async function getAllPositions(client, userId, guildId) {
  if (!client.userPortfolioCollection) return [];
  return client.userPortfolioCollection
    .find({ userId, guildId, shares: { $gt: 0 } })
    .toArray();
}

// 加權平均：(oldShares * oldAvg + newShares * price) / (oldShares + newShares)
function calcNewAvgCost(oldShares, oldAvg, addShares, price) {
  if (addShares <= 0) return oldAvg;
  const totalShares = oldShares + addShares;
  if (totalShares <= 0) return 0;
  return (oldShares * oldAvg + addShares * price) / totalShares;
}

async function addPosition(client, userId, guildId, symbol, addShares, price) {
  if (!client.userPortfolioCollection) return null;
  const existing = await getPosition(client, userId, guildId, symbol);
  const oldShares = existing?.shares || 0;
  const oldAvg = existing?.avgCost || 0;
  const newShares = oldShares + addShares;
  const newAvg = calcNewAvgCost(oldShares, oldAvg, addShares, price);

  await client.userPortfolioCollection.updateOne(
    { userId, guildId, symbol },
    {
      $set: {
        shares: newShares,
        avgCost: newAvg,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        userId,
        guildId,
        symbol,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return { shares: newShares, avgCost: newAvg };
}

async function reducePosition(client, userId, guildId, symbol, removeShares) {
  if (!client.userPortfolioCollection) return null;
  const existing = await getPosition(client, userId, guildId, symbol);
  if (!existing || existing.shares < removeShares) return null;
  const remaining = existing.shares - removeShares;
  if (remaining <= 0) {
    await client.userPortfolioCollection.deleteOne({ userId, guildId, symbol });
    return { shares: 0, avgCost: existing.avgCost };
  }
  await client.userPortfolioCollection.updateOne(
    { userId, guildId, symbol },
    { $set: { shares: remaining, updatedAt: new Date() } }
  );
  return { shares: remaining, avgCost: existing.avgCost };
}

module.exports = {
  getPosition,
  getAllPositions,
  calcNewAvgCost,
  addPosition,
  reducePosition,
};
