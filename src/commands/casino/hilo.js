require("colors");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { startGame } = require("../../features/casino/hilo/engine");
const { renderMessage } = require("../../features/casino/hilo/renderer");

function getHiloConfig() {
  return casino?.hilo || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hilo")
    .setDescription("猜大小！下一張比底牌大、小、還是相同？🎴")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注 credits")
        .setRequired(true)
        .setMinValue(getHiloConfig().minBet ?? 10)
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
        !client.hiloGamesCollection
      ) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = getHiloConfig();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 HI-LO 暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 10;
      const ttlSec = cfg.gameTtlSeconds ?? 300;
      const houseEdge = cfg.houseEdge ?? 0.05;
      const maxRounds = cfg.maxRounds ?? 10;

      const bet = interaction.options.getInteger("下注");
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
      const existing = await client.hiloGamesCollection.findOne({
        userId,
        guildId,
        status: "playing",
      });
      if (existing) {
        return interaction.editReply(
          "🎴 你還有一局 HI-LO 沒收尾！先把上一局打完再開新局。"
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

      const gameId = crypto.randomUUID();

      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -bet,
        source: "bet",
        member,
        meta: { game: "hilo", gameId },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }
      const balanceAfter = betResult.doc?.totalCoins ?? balance - bet;

      const initial = startGame({ bet, houseEdge, maxRounds });
      const now = new Date();
      const doc = {
        gameId,
        userId,
        guildId,
        username,
        bet: initial.bet,
        status: initial.status,
        deck: initial.deck,
        baseCard: initial.baseCard,
        history: initial.history,
        accMultiplier: initial.accMultiplier,
        wins: initial.wins,
        houseEdge: initial.houseEdge,
        maxRounds: initial.maxRounds,
        result: initial.result,
        payout: initial.payout,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + ttlSec * 1000),
      };

      await client.hiloGamesCollection.insertOne(doc);

      const payload = await renderMessage(doc, {
        username,
        balance: balanceAfter,
      });
      await interaction.editReply(payload);
    } catch (error) {
      console.log(`[ERROR] /hilo:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 HI-LO 執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
