require("colors");
const crypto = require("crypto");
const {
  SlashCommandBuilder,
  InteractionContextType,
} = require("discord.js");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const parseBetAmount = require("../../utils/parseBetAmount");
const {
  resolveGame,
  MIN_AUTOCASHOUT,
  DEFAULT_AUTOCASHOUT,
  DEFAULT_HOUSE_EDGE,
} = require("../../features/casino/crash/engine");
const { renderMessage } = require("../../features/casino/crash/renderer");

function getCrashConfig() {
  return casino?.crash || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("火箭")
    .setDescription("🚀 押注火箭！倍率衝多高就賺多少，爆炸就歸零")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注金額（支援 100、1.5k、10%、all）")
        .setRequired(true),
    )
    .addNumberOption((opt) =>
      opt
        .setName("自動收手")
        .setDescription(`達到此倍率自動收手（最低 ${MIN_AUTOCASHOUT}，預設 ${DEFAULT_AUTOCASHOUT}）`)
        .setMinValue(MIN_AUTOCASHOUT)
        .setRequired(false),
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
        !client.coinTransactionsCollection
      ) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = getCrashConfig();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 火箭暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 10;
      const maxBet = cfg.maxBet ?? 0; // 0 = 不設上限
      const houseEdge = cfg.houseEdge ?? DEFAULT_HOUSE_EDGE;

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username =
        interaction.member?.displayName || interaction.user.username;
      const member = interaction.member;

      const before = await client.userCoinsCollection.findOne({
        userId,
        guildId,
      });
      const balance = before?.totalCoins || 0;

      const rawBet = interaction.options.getString("下注");
      const parsed = parseBetAmount(rawBet, balance);
      if (!parsed.ok) {
        return interaction.editReply(`下注格式錯誤：${parsed.reason}`);
      }
      const bet = parsed.amount;

      if (bet < minBet) {
        return interaction.editReply(
          `下注金額至少需 **${minBet.toLocaleString()}** credits。`,
        );
      }
      if (maxBet > 0 && bet > maxBet) {
        return interaction.editReply(
          `下注金額上限 **${maxBet.toLocaleString()}** credits。`,
        );
      }
      if (balance < bet) {
        return interaction.editReply(
          `💰 餘額不足！目前 **${balance.toLocaleString()}** credits，無法下注 ${bet.toLocaleString()}。`,
        );
      }

      const autocashoutInput =
        interaction.options.getNumber("自動收手") ?? DEFAULT_AUTOCASHOUT;

      const gameId = crypto.randomUUID();

      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -bet,
        source: "bet",
        member,
        meta: { game: "crash", gameId },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }
      let balanceAfter = betResult.doc?.totalCoins ?? balance - bet;

      const settled = resolveGame({
        bet,
        autocashout: autocashoutInput,
        houseEdge,
      });

      if (settled.payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          amount: settled.payout,
          source: "payout",
          member,
          meta: {
            game: "crash",
            result: settled.result,
            gameId,
            bet: settled.bet,
            autocashout: settled.autocashout,
            cashoutAt: settled.cashoutAt,
            bust: settled.bust,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter;
      }

      // 紀錄到資料庫供歷史查詢（如有設定 collection）
      if (client.crashGamesCollection) {
        const now = new Date();
        try {
          await client.crashGamesCollection.insertOne({
            gameId,
            userId,
            guildId,
            username,
            bet: settled.bet,
            autocashout: settled.autocashout,
            bust: settled.bust,
            cashoutAt: settled.cashoutAt,
            houseEdge: settled.houseEdge,
            status: settled.status,
            result: settled.result,
            payout: settled.payout,
            createdAt: now,
            updatedAt: now,
          });
        } catch (e) {
          console.log(`[WARN] crash game insert failed: ${e.message}`.yellow);
        }
      }

      const payload = await renderMessage(
        { ...settled, gameId },
        { username, balance: balanceAfter },
      );
      await interaction.editReply(payload);
    } catch (error) {
      console.log(`[ERROR] /火箭:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 火箭執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
