require("colors");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { startGame } = require("../../features/casino/dragonGate/engine");
const { renderMessage } = require("../../features/casino/dragonGate/renderer");

function getDragonGateConfig() {
  return casino?.dragonGate || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("射龍門")
    .setDescription("🐉 開兩柱，第三張射進中間就贏！碰柱賠雙倍。")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注 credits（會鎖倉 2× 含碰柱保證金）")
        .setRequired(true)
        .setMinValue(getDragonGateConfig().minBet ?? 10)
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
        !client.dragonGateGamesCollection
      ) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = getDragonGateConfig();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 射龍門暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 10;
      const maxBet = cfg.maxBet ?? 500;
      const ttlSec = cfg.gameTtlSeconds ?? 300;
      const houseEdge = cfg.houseEdge ?? 0.05;

      const bet = interaction.options.getInteger("下注");
      if (!Number.isInteger(bet) || bet < minBet) {
        return interaction.editReply(
          `下注金額至少需 ${minBet.toLocaleString()} credits。`
        );
      }
      if (bet > maxBet) {
        return interaction.editReply(
          `下注金額上限為 ${maxBet.toLocaleString()} credits。`
        );
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username =
        interaction.member?.displayName || interaction.user.username;
      const member = interaction.member;

      // 同時只能有一局 playing
      const existing = await client.dragonGateGamesCollection.findOne({
        userId,
        guildId,
        status: "playing",
      });
      if (existing) {
        return interaction.editReply(
          "🐉 你還有一局射龍門沒收尾！先把上一局打完再開新局。"
        );
      }

      const before = await client.userCoinsCollection.findOne({
        userId,
        guildId,
      });
      const balance = before?.totalCoins || 0;
      const lock = bet * 2;
      if (balance < lock) {
        return interaction.editReply(
          `💰 餘額不足！射龍門需鎖 2× 下注（${lock.toLocaleString()}）含碰柱保證金，目前 **${balance.toLocaleString()}** credits。`
        );
      }

      const gameId = crypto.randomUUID();

      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -lock,
        source: "bet",
        member,
        meta: { game: "dragonGate", gameId, bet, lock },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }
      let balanceAfter = betResult.doc?.totalCoins ?? balance - lock;

      const initial = startGame({ bet, houseEdge });
      const now = new Date();
      const doc = {
        gameId,
        userId,
        guildId,
        username,
        bet: initial.bet,
        lock: initial.lock,
        status: initial.status,
        deck: initial.deck,
        gateLow: initial.gateLow,
        gateHigh: initial.gateHigh,
        thirdCard: initial.thirdCard,
        houseEdge: initial.houseEdge,
        multiplier: initial.multiplier,
        result: initial.result,
        payout: initial.payout,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + ttlSec * 1000),
      };

      await client.dragonGateGamesCollection.insertOne(doc);

      // 開局即和局（對柱／連柱）→ 直接退錢結算
      if (doc.status === "settled" && doc.payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          amount: doc.payout,
          source: "payout",
          member,
          meta: {
            game: "dragonGate",
            result: doc.result,
            gameId,
            bet,
            lock: doc.lock,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter;
      }

      const payload = renderMessage(
        { ...doc, gameId },
        { username, balance: balanceAfter }
      );
      await interaction.editReply(payload);
    } catch (error) {
      console.log(`[ERROR] /射龍門:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 射龍門執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
