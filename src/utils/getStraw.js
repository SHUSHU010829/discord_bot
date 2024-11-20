module.exports = async () => {
  const strawList = [
    { outcome: "🌈 大吉", weight: 5 },
    { outcome: "🔆 中吉", weight: 15 },
    { outcome: "✨ 小吉", weight: 30 },
    { outcome: "💤 沒想法", weight: 30 },
    { outcome: "💥 凶", weight: 15 },
    { outcome: "🔥 大凶", weight: 5 },
  ];

  function getRandomOutcome(list) {
    const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
    const randomNum = Math.random() * totalWeight;
    let weightSum = 0;

    for (const item of list) {
      weightSum += item.weight;
      if (randomNum <= weightSum) {
        return item.outcome;
      }
    }
  }

  return getRandomOutcome(strawList);
};
