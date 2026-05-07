// /賽馬 — 開一場 channel-scoped 賽馬，10 分鐘售票期，到時自動開賽。
//
// 流程：
//   1) 開盤者下指令 → 在頻道貼售票訊息（按鈕押注）
//   2) 任何人點 hr_pick_<horseId>_<gameId> → 跳 modal 輸入金額 → 入注
//   3) cron / setTimeout 撈到 expiresAt 過期或開盤者按 🚀 → 自動開賽
//   4) 開賽：simulateRace 跑動畫，到結尾依各筆下注分別 grantCoins 派彩
//   5) 0 人下注 → 直接取消、不跑動畫

require("colors");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");

const { coinSystem, casino } = require("../../config");
const {
  renderBettingPhase,
} = require("../../features/casino/horseRacing/renderer");
const { startRaceIfDue } = require("../../features/casino/horseRacing/raceRunner");

function getCfg() {
  return casino?.horseRacing || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("賽馬")
    .setDescription("🐎 開一場賽馬！售票期內大家進來押注，時間到自動開賽")
    .setDMPermission(false)
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
      if (!client.horseRaceGamesCollection) {
        return interaction.editReply("🔧 賽馬系統未啟動，請聯絡舒舒！");
      }

      const cfg = getCfg();
      if (cfg.enabled === false) {
        return interaction.editReply("🔧 賽馬暫時關閉中！");
      }

      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      const userId = interaction.user.id;
      const username =
        interaction.member?.displayName || interaction.user.username;

      // 同頻道一次只能有一場 betting/running
      const existing = await client.horseRaceGamesCollection.findOne({
        channelId,
        status: { $in: ["betting", "running"] },
      });
      if (existing) {
        return interaction.editReply(
          "🐎 這個頻道已經有一場賽馬在進行中，先等它跑完再開新場！",
        );
      }

      const windowSec = cfg.bettingWindowSeconds ?? 600;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + windowSec * 1000);
      const gameId = crypto.randomUUID();

      const state = {
        gameId,
        guildId,
        channelId,
        messageId: null,
        hostUserId: userId,
        hostUsername: username,
        status: "betting",
        bets: [],
        winnerId: null,
        rankings: null,
        finalPositions: null,
        settles: null,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };

      await client.horseRaceGamesCollection.insertOne(state);

      const payload = renderBettingPhase(state);
      const message = await interaction.editReply(payload);

      // 紀錄 messageId 供之後 edit
      await client.horseRaceGamesCollection.updateOne(
        { gameId },
        { $set: { messageId: message.id, updatedAt: new Date() } },
      );

      // 安排 setTimeout 自動開賽（cron 也會撈，重複觸發靠 atomic update 防重）
      const delayMs = expiresAt.getTime() - Date.now();
      if (delayMs > 0) {
        setTimeout(() => {
          startRaceIfDue(client, gameId).catch((e) =>
            console.log(`[HORSE] auto-start failed (timeout): ${e}`.yellow),
          );
        }, delayMs).unref?.();
      }
    } catch (error) {
      console.log(`[ERROR] /賽馬:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 賽馬開盤失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
