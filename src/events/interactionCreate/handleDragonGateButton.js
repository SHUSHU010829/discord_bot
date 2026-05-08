const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { shoot } = require("../../features/casino/dragonGate/engine");
const { renderMessage } = require("../../features/casino/dragonGate/renderer");
const logger = require("../../utils/logger");
const { trackError, trackSuccess } = require("../../utils/errorTracker");
const { consume } = require("../../utils/rateLimiter");
const { MessageFlags } = require("discord.js");

function getDragonGateConfig() {
  return casino?.dragonGate || {};
}

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId?.startsWith("dg_")) return;
    if (!client.dragonGateGamesCollection) return;

    // customId 格式：dg_<action>_<gameId>，gameId 是 uuid 含 "-"
    const rest = interaction.customId.slice("dg_".length);
    const splitIdx = rest.indexOf("_");
    if (splitIdx < 0) return;
    const action = rest.slice(0, splitIdx);
    const gameId = rest.slice(splitIdx + 1);

    if (!["shoot"].includes(action)) return;

    // 速率限制：擋連點，避免製造 10062
    const rl = consume(interaction.user.id, "btn:dragonGate", {
      windowMs: 1000,
      max: 1,
    });
    if (!rl.allowed) {
      try {
        await interaction.reply({
          content: `⏳ 點太快了，等 ${Math.ceil(rl.retryAfterMs / 1000)} 秒。`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (_) { /* noop */ }
      return;
    }

    try {
      await interaction.deferUpdate();
    } catch (deferErr) {
      if (deferErr?.code === 10062) {
        logger.warn(
          { source: "dragonGate-button", gameId },
          "互動已逾期,無法 defer"
        );
        trackError("dragonGate-button", deferErr, { gameId, reason: "expired" });
        return;
      }
      throw deferErr;
    }

    const state = await client.dragonGateGamesCollection.findOne({ gameId });
    if (!state) {
      return interaction.followUp({
        content: "🐉 這局已過期或找不到了。",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (state.userId !== interaction.user.id) {
      return interaction.followUp({
        content: "🚫 這不是你的局！別亂按 ㄎㄎ",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (state.status !== "playing") {
      return interaction.followUp({
        content: "🐉 這局已結束。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const userId = state.userId;
    const guildId = state.guildId;
    const username = state.username || interaction.user.username;
    const member = interaction.member;

    const next = shoot(state);

    const cfg = getDragonGateConfig();
    const ttlSec = cfg.gameTtlSeconds ?? 300;
    const now = new Date();

    await client.dragonGateGamesCollection.updateOne(
      { _id: state._id },
      {
        $set: {
          deck: next.deck,
          thirdCard: next.thirdCard,
          status: next.status,
          result: next.result,
          payout: next.payout,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + ttlSec * 1000),
        },
      }
    );

    let balanceAfter;
    if (next.status === "settled" && next.payout > 0) {
      const payoutResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        amount: next.payout,
        source: "payout",
        member,
        meta: {
          game: "dragonGate",
          result: next.result,
          gameId,
          bet: next.bet,
          lock: next.lock,
          multiplier: next.multiplier,
        },
      });
      balanceAfter = payoutResult?.doc?.totalCoins;
    }
    if (balanceAfter === undefined) {
      const after = await client.userCoinsCollection.findOne({ userId, guildId });
      balanceAfter = after?.totalCoins || 0;
    }

    const payload = await renderMessage(
      { ...next, gameId },
      { username, balance: balanceAfter }
    );
    await interaction.editReply({
      ...payload,
      attachments: [],
    });
    trackSuccess("dragonGate-button");
  } catch (error) {
    logger.error(
      { source: "dragonGate-button", userId: interaction.user?.id, customId: interaction.customId, err: error.message, stack: error.stack },
      "射龍門按鈕處理失敗"
    );
    trackError("dragonGate-button", error, { userId: interaction.user?.id, customId: interaction.customId });
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "🔧 射龍門按鈕處理失敗，請呼叫舒舒！",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: "🔧 射龍門按鈕處理失敗，請呼叫舒舒！",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
