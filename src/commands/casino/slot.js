require("colors");
const crypto = require("crypto");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { DateTime } = require("luxon");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { spin } = require("../../features/casino/slot/slotMachine");
const generateSlotCard = require("../../utils/generateSlotCard");

function getSlotConfig() {
  return casino?.slot || {};
}

async function getTodayBetTotal(client, userId, guildId) {
  if (!client.coinTransactionsCollection) return 0;
  const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();
  const agg = await client.coinTransactionsCollection
    .aggregate([
      {
        $match: {
          userId,
          guildId,
          source: "bet",
          "meta.game": "slot",
          date: today,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  return Math.abs(agg[0]?.total || 0);
}

async function isOnCooldown(client, userId, guildId, cooldownMs) {
  if (!cooldownMs || cooldownMs <= 0) return false;
  const since = new Date(Date.now() - cooldownMs);
  const recent = await client.coinTransactionsCollection.findOne(
    {
      userId,
      guildId,
      source: "bet",
      "meta.game": "slot",
      createdAt: { $gt: since },
    },
    { projection: { _id: 1 } }
  );
  return !!recent;
}

function describeMatch(matchType) {
  switch (matchType) {
    case "jackpot":
      return "🎉 JACKPOT！七七七！";
    case "triple":
      return "🎊 三連線！";
    case "double_cherry":
      return "🍒🍒 兩個櫻桃！";
    case "double":
      return "✨ 兩個一樣！";
    default:
      return "💸 沒中，下次再來！";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃角子老虎")
    .setDescription("拉霸試手氣！🎰")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注 credits")
        .setRequired(true)
        .setMinValue(getSlotConfig().minBet ?? 5)
        .setMaxValue(getSlotConfig().maxBet ?? 500)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!client.userCoinsCollection || !client.coinTransactionsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = getSlotConfig();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 吃角子老虎暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 5;
      const maxBet = cfg.maxBet ?? 500;
      const cooldownSeconds = cfg.cooldownSeconds ?? 3;
      const dailyBetLimit = cfg.dailyBetLimit ?? 5000;

      const bet = interaction.options.getInteger("下注");
      if (!Number.isInteger(bet) || bet < minBet || bet > maxBet) {
        return interaction.editReply(
          `下注金額需介於 ${minBet.toLocaleString()} 與 ${maxBet.toLocaleString()} 之間。`
        );
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username = interaction.member?.displayName || interaction.user.username;
      const member = interaction.member;

      const before = await client.userCoinsCollection.findOne({ userId, guildId });
      const balance = before?.totalCoins || 0;
      if (balance < bet) {
        return interaction.editReply(
          `💰 餘額不足！目前 **${balance.toLocaleString()}** credits，無法下注 ${bet.toLocaleString()}。`
        );
      }

      if (await isOnCooldown(client, userId, guildId, cooldownSeconds * 1000)) {
        return interaction.editReply("🎰 機台還在轉，等個幾秒再來！");
      }

      const todayBet = await getTodayBetTotal(client, userId, guildId);
      if (todayBet + bet > dailyBetLimit) {
        const remain = Math.max(0, dailyBetLimit - todayBet);
        return interaction.editReply(
          `📈 今日吃角子老虎下注已達上限。今日已下注 **${todayBet.toLocaleString()}** / ${dailyBetLimit.toLocaleString()}，剩 **${remain.toLocaleString()}**。`
        );
      }

      const roundId = crypto.randomUUID();

      // 扣下注
      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -bet,
        source: "bet",
        member,
        meta: { game: "slot", roundId },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }

      // 跑抽獎
      const result = spin({ bet });
      let balanceAfter = betResult.doc?.totalCoins ?? balance - bet;

      // 派彩
      if (result.payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          avatarHash: interaction.user.avatar,
          amount: result.payout,
          source: "payout",
          member,
          meta: {
            game: "slot",
            matchType: result.matchType,
            matchKey: result.matchKey,
            multiplier: result.multiplier,
            bet,
            roundId,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter + result.payout;
      }

      // 出圖
      const buf = await generateSlotCard({
        userId,
        username,
        reels: result.reels,
        matchType: result.matchType,
        matchedSymbol: result.matchedSymbol,
        bet,
        payout: result.payout,
        multiplier: result.multiplier,
        balance: balanceAfter,
      });

      const attachment = new AttachmentBuilder(buf, {
        name: `slot-${roundId}.png`,
      });

      const headline =
        result.matchType === "jackpot"
          ? `🎉 **JACKPOT！** ＋${result.payout.toLocaleString()} credits！`
          : result.payout > 0
          ? `${describeMatch(result.matchType)} ＋${result.payout.toLocaleString()} credits`
          : `💸 沒中，下次再來！`;

      await interaction.editReply({
        content: `${headline}\n・下注：**${bet.toLocaleString()}**　・餘額：**${balanceAfter.toLocaleString()}**`,
        files: [attachment],
      });
    } catch (error) {
      console.log(`[ERROR] /吃角子老虎:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 吃角子老虎執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
