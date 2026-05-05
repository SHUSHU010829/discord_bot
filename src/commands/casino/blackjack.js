require("colors");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { startGame } = require("../../features/casino/blackjack/engine");
const { renderMessage } = require("../../features/casino/blackjack/renderer");

function getBjConfig() {
  return casino?.blackjack || {};
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
          "meta.game": "blackjack",
          date: today,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  return Math.abs(agg[0]?.total || 0);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("二十一點")
    .setDescription("跟莊家比 21 點 🃏")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注 credits")
        .setRequired(true)
        .setMinValue(getBjConfig().minBet ?? 10)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("副數")
        .setDescription("使用幾副牌（預設 1，多副牌更接近真實賭場）")
        .setRequired(false)
        .addChoices(
          { name: "1 副（預設）", value: 1 },
          { name: "4 副", value: 4 },
          { name: "6 副", value: 6 },
          { name: "8 副", value: 8 },
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (
        !client.userCoinsCollection ||
        !client.coinTransactionsCollection ||
        !client.blackjackGamesCollection
      ) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = getBjConfig();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 21 點暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 10;
      const dailyBetLimit = cfg.dailyBetLimit ?? 10000;
      const ttlSec = cfg.gameTtlSeconds ?? 300;

      const bet = interaction.options.getInteger("下注");
      const deckCountRaw = interaction.options.getInteger("副數");
      const allowedDeckCounts = cfg.allowedDeckCounts || [1, 4, 6, 8];
      const deckCount = allowedDeckCounts.includes(deckCountRaw) ? deckCountRaw : 1;
      if (!Number.isInteger(bet) || bet < minBet) {
        return interaction.editReply(
          `下注金額至少需 ${minBet.toLocaleString()} credits。`
        );
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username =
        interaction.member?.displayName || interaction.user.username;
      const member = interaction.member;

      // 同時只能有一局 playing
      const existing = await client.blackjackGamesCollection.findOne({
        userId,
        guildId,
        status: "playing",
      });
      if (existing) {
        return interaction.editReply(
          "🃏 你還有一局 21 點沒收尾！先把上一局打完再開新局。"
        );
      }

      const before = await client.userCoinsCollection.findOne({
        userId,
        guildId,
      });
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
          `📈 今日 21 點下注已達上限。今日已下注 **${todayBet.toLocaleString()}** / ${dailyBetLimit.toLocaleString()}，剩 **${remain.toLocaleString()}**。`
        );
      }

      const gameId = crypto.randomUUID();

      // 扣下注
      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -bet,
        source: "bet",
        member,
        meta: { game: "blackjack", gameId },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }
      let balanceAfter = betResult.doc?.totalCoins ?? balance - bet;

      // 開局
      const initial = startGame({ bet, deckCount });
      const now = new Date();
      const doc = {
        gameId,
        userId,
        guildId,
        username,
        bet: initial.bet,
        deckCount: initial.deckCount,
        doubled: initial.doubled,
        status: initial.status,
        deck: initial.deck,
        playerHand: initial.playerHand,
        dealerHand: initial.dealerHand,
        result: initial.result,
        payout: initial.payout,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + ttlSec * 1000),
      };

      // 起手就 settled（雙方 BJ / 玩家 BJ / 莊家 BJ）→ 派彩
      if (initial.status === "settled" && initial.payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          avatarHash: interaction.user.avatar,
          amount: initial.payout,
          source: "payout",
          member,
          meta: {
            game: "blackjack",
            result: initial.result,
            gameId,
            bet,
            doubled: false,
          },
        });
        balanceAfter =
          payoutResult?.doc?.totalCoins ?? balanceAfter + initial.payout;
      }

      await client.blackjackGamesCollection.insertOne(doc);

      const payload = await renderMessage(doc, {
        username,
        balance: balanceAfter,
      });
      await interaction.editReply(payload);
    } catch (error) {
      console.log(`[ERROR] /二十一點:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 21 點執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
