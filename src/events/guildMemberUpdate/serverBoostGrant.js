require("colors");
const { levelSystem } = require("../../config");
const grantXp = require("../../features/leveling/grantXp");

module.exports = async (client, oldMember, newMember) => {
  try {
    const cfg = levelSystem?.serverBoostBonus;
    if (!levelSystem?.enabled) return;
    if (!cfg?.enabled) return;
    if (!cfg?.grantOnBoost || cfg.grantOnBoost <= 0) return;
    if (!client.userLevelsCollection) return;
    if (!client.levelTransactionsCollection) return;

    const newPremium = newMember?.premiumSince
      ? newMember.premiumSince.toISOString()
      : null;
    if (!newPremium) return;

    const oldPremium = oldMember?.premiumSince
      ? oldMember.premiumSince.toISOString()
      : null;
    if (oldPremium === newPremium) return;

    // 用 premiumSince 當去重鍵：同一次加成不會重複發 XP
    const existing = await client.levelTransactionsCollection.findOne(
      {
        userId: newMember.id,
        guildId: newMember.guild.id,
        source: "boost",
        "meta.premiumSince": newPremium,
      },
      { projection: { _id: 1 } },
    );
    if (existing) return;

    const result = await grantXp(client, {
      userId: newMember.id,
      guildId: newMember.guild.id,
      username: newMember.user.username,
      avatarHash: newMember.user.avatar,
      amount: cfg.grantOnBoost,
      source: "boost",
      counterField: "xpFromBoost",
      member: newMember,
      meta: { premiumSince: newPremium },
    });

    if (result) {
      console.log(
        `[BOOST] ${newMember.user.username} 加成伺服器 (+${cfg.grantOnBoost} XP) Lv.${result.before} → Lv.${result.after}`
          .magenta,
      );
    }
  } catch (error) {
    console.log(`[ERROR] serverBoostGrant:\n${error}\n${error.stack}`.red);
  }
};
