require("colors");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const {
  HORSES,
  getHorse,
  pickWinnerWeighted,
  simulateRace,
  calcPayout,
} = require("../../features/casino/horseRacing/engine");
const {
  renderFrame,
  renderFinalMessage,
} = require("../../features/casino/horseRacing/renderer");

function getCfg() {
  return casino?.horseRacing || {};
}

const FRAME_DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("賽馬")
    .setDescription("六匹馬賽跑，押你看好的馬奪冠！🐎")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName("馬匹")
        .setDescription("選一匹馬下注（編號越大賠率越高、勝率越低）")
        .setRequired(true)
        .addChoices(
          ...HORSES.map((h) => ({
            name: `${h.id}. ${h.emoji} ${h.name} ×${h.payout.toFixed(1)}`,
            value: h.id,
          })),
        ),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("下注")
        .setDescription("下注 credits（勾選梭哈時可省略）")
        .setRequired(false)
        .setMinValue(getCfg().minBet ?? 10),
    )
    .addBooleanOption((opt) =>
      opt
        .setName("梭哈")
        .setDescription("一次押上目前全部餘額")
        .setRequired(false),
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

      const cfg = getCfg();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 賽馬暫時關閉中！");
      }

      const minBet = cfg.minBet ?? 10;
      const maxBet = cfg.maxBet ?? 1000;

      const horseId = interaction.options.getInteger("馬匹");
      const horse = getHorse(horseId);
      if (!horse) {
        return interaction.editReply("❌ 馬匹編號無效。");
      }

      const betInput = interaction.options.getInteger("下注");
      const allIn = interaction.options.getBoolean("梭哈") === true;
      if (!allIn && (!Number.isInteger(betInput) || betInput < minBet)) {
        return interaction.editReply(
          `下注金額至少需 ${minBet.toLocaleString()} credits（或勾選梭哈）。`,
        );
      }

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
      let bet = allIn ? balance : betInput;
      if (allIn && balance < minBet) {
        return interaction.editReply(
          `💰 餘額不足以梭哈！目前 **${balance.toLocaleString()}** credits，至少需 ${minBet.toLocaleString()}。`,
        );
      }
      if (balance < bet) {
        return interaction.editReply(
          `💰 餘額不足！目前 **${balance.toLocaleString()}** credits，無法下注 ${bet.toLocaleString()}。`,
        );
      }
      // 梭哈也吃 maxBet 上限，避免大戶單局拉爆 RTP
      if (bet > maxBet) bet = maxBet;

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
        meta: { game: "horseRacing", roundId, horseId: horse.id },
      });
      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }
      let balanceAfter = betResult.doc?.totalCoins ?? balance - bet;

      // 跑比賽
      const winnerId = pickWinnerWeighted();
      const { frames, rankings } = simulateRace(winnerId);

      // 動畫：逐幀 editReply
      for (let i = 0; i < frames.length - 1; i++) {
        const content = renderFrame({
          positions: frames[i],
          username,
          bet,
          horse,
          status: "running",
        });
        await interaction.editReply({ content }).catch(() => {});
        await sleep(FRAME_DELAY_MS);
      }

      // 結算
      const won = winnerId === horse.id;
      const payout = won ? calcPayout(bet, horse.payout) : 0;

      if (won && payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          amount: payout,
          source: "payout",
          member,
          meta: {
            game: "horseRacing",
            roundId,
            horseId: horse.id,
            winnerId,
            multiplier: horse.payout,
            bet,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter + payout;
      }

      const finalContent = renderFinalMessage({
        positions: frames[frames.length - 1],
        username,
        bet,
        horse,
        rankings,
        won,
        payout,
        balance: balanceAfter,
      });

      const bankruptLine =
        balanceAfter <= 0
          ? "\n🚨 **你破產了！** 餘額歸零，去發言、聊天賺金幣再來吧！"
          : "";

      await interaction.editReply({
        content: finalContent + bankruptLine,
      });
    } catch (error) {
      console.log(`[ERROR] /賽馬:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 賽馬執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
