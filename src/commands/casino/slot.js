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
const {
  contribute: contributeJackpot,
  bustPool: bustJackpot,
  getPool: getJackpotPool,
  getCfg: getJackpotCfg,
} = require("../../features/casino/slot/jackpotPool");
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
    .setName("拉霸")
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
        return interaction.editReply("🔧 拉霸暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 5;
      const maxBet = cfg.maxBet ?? 500;
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

      const todayBet = await getTodayBetTotal(client, userId, guildId);
      if (todayBet + bet > dailyBetLimit) {
        const remain = Math.max(0, dailyBetLimit - todayBet);
        return interaction.editReply(
          `📈 今日拉霸下注已達上限。今日已下注 **${todayBet.toLocaleString()}** / ${dailyBetLimit.toLocaleString()}，剩 **${remain.toLocaleString()}**。`
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

      // 累積彩池：先把這筆下注的 3% 灌進池
      const jackpotCfg = getJackpotCfg();
      const jackpotEnabled = jackpotCfg?.enabled !== false;
      if (jackpotEnabled) {
        await contributeJackpot(client, guildId, bet).catch((e) =>
          console.log(`[SLOT] jackpot contribute failed: ${e}`.yellow)
        );
      }

      // 跑抽獎
      const result = spin({ bet });
      let balanceAfter = betResult.doc?.totalCoins ?? balance - bet;
      let jackpotBust = 0;

      // 中 jackpot：把整池額外送給玩家、並重置回 seed
      if (jackpotEnabled && result.matchType === "jackpot") {
        jackpotBust = await bustJackpot(client, guildId).catch((e) => {
          console.log(`[SLOT] jackpot bust failed: ${e}`.red);
          return 0;
        });
      }

      const totalPayout = result.payout + jackpotBust;

      // 派彩（base + jackpot bust 一起發）
      if (totalPayout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          avatarHash: interaction.user.avatar,
          amount: totalPayout,
          source: "payout",
          member,
          meta: {
            game: "slot",
            matchType: result.matchType,
            matchKey: result.matchKey,
            multiplier: result.multiplier,
            basePayout: result.payout,
            jackpotBust,
            bet,
            roundId,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter + totalPayout;
      }

      // 取得目前 pool 顯示在卡片上
      let jackpotPool = null;
      if (jackpotEnabled) {
        const poolDoc = await getJackpotPool(client, guildId).catch(() => null);
        jackpotPool = poolDoc?.amount ?? null;
      }

      // 出圖
      const buf = await generateSlotCard({
        userId,
        username,
        reels: result.reels,
        matchType: result.matchType,
        matchedSymbol: result.matchedSymbol,
        bet,
        payout: totalPayout,
        multiplier: result.multiplier,
        balance: balanceAfter,
        jackpotPool,
        jackpotBust,
      });

      const attachment = new AttachmentBuilder(buf, {
        name: `slot-${roundId}.png`,
      });

      const jackpotLine =
        result.matchType === "jackpot" && jackpotBust > 0
          ? `\n💥 **爆池啦！** 你獨得 jackpot pool **+${jackpotBust.toLocaleString()}** credits！（基礎賠率 ${result.payout.toLocaleString()} + 累積池 ${jackpotBust.toLocaleString()}）`
          : "";
      const poolLine =
        jackpotEnabled && jackpotPool != null
          ? `\n💰 目前 Jackpot Pool：**${jackpotPool.toLocaleString()}** credits`
          : "";

      const headline =
        result.matchType === "jackpot"
          ? `🎉 **JACKPOT！** ＋${totalPayout.toLocaleString()} credits！`
          : totalPayout > 0
          ? `${describeMatch(result.matchType)} ＋${totalPayout.toLocaleString()} credits`
          : `💸 沒中，下次再來！`;

      const bankruptLine =
        balanceAfter <= 0
          ? `\n🚨 **你破產了！** 餘額歸零，去發言、聊天賺金幣再來吧！`
          : "";

      await interaction.editReply({
        content: `${headline}${jackpotLine}\n・下注：**${bet.toLocaleString()}**　・餘額：**${balanceAfter.toLocaleString()}**${poolLine}${bankruptLine}`,
        files: [attachment],
      });

      // 爆池公告
      const announceChannelId = jackpotCfg?.announceChannelId;
      if (jackpotBust > 0 && announceChannelId) {
        try {
          const ch = await client.channels.fetch(announceChannelId).catch(() => null);
          if (ch?.isTextBased?.()) {
            ch.send(
              `💥💥💥 **拉霸 JACKPOT 爆池！** <@${userId}> 中了 **+${jackpotBust.toLocaleString()}** credits 累積彩池（七七七！）`
            ).catch(() => {});
          }
        } catch (_) { /* ignore */ }
      }
    } catch (error) {
      console.log(`[ERROR] /拉霸:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 拉霸執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
