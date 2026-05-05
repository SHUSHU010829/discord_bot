require("colors");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { guess, cashOut } = require("../../features/casino/hilo/engine");
const { renderMessage } = require("../../features/casino/hilo/renderer");

function getHiloConfig() {
  return casino?.hilo || {};
}

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId?.startsWith("hl_")) return;
    if (!client.hiloGamesCollection) return;

    // customId 格式：hl_<action>_<gameId>，gameId 是 uuid 含 "-"
    const rest = interaction.customId.slice("hl_".length);
    const splitIdx = rest.indexOf("_");
    if (splitIdx < 0) return;
    const action = rest.slice(0, splitIdx);
    const gameId = rest.slice(splitIdx + 1);

    if (!["hi", "lo", "same", "cash"].includes(action)) return;

    const state = await client.hiloGamesCollection.findOne({ gameId });
    if (!state) {
      return interaction.reply({
        content: "🎴 這局已過期或找不到了。",
        ephemeral: true,
      });
    }
    if (state.userId !== interaction.user.id) {
      return interaction.reply({
        content: "🚫 這不是你的局！別亂按 ㄎㄎ",
        ephemeral: true,
      });
    }
    if (state.status !== "playing") {
      return interaction.reply({
        content: "🎴 這局已結束。",
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    const userId = state.userId;
    const guildId = state.guildId;
    const username = state.username || interaction.user.username;
    const member = interaction.member;

    let next;
    if (action === "cash") {
      if (!state.wins || state.wins <= 0) {
        return interaction.followUp({
          content: "🚫 至少要贏一把才能收手！",
          ephemeral: true,
        });
      }
      next = cashOut(state);
    } else {
      next = guess(state, action);
    }

    const cfg = getHiloConfig();
    const ttlSec = cfg.gameTtlSeconds ?? 300;
    const now = new Date();

    await client.hiloGamesCollection.updateOne(
      { _id: state._id },
      {
        $set: {
          deck: next.deck,
          baseCard: next.baseCard,
          history: next.history,
          accMultiplier: next.accMultiplier,
          wins: next.wins,
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
          game: "hilo",
          result: next.result,
          gameId,
          bet: next.bet,
          wins: next.wins,
          accMultiplier: next.accMultiplier,
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
  } catch (error) {
    console.log(`[ERROR] handleHiloButton:\n${error}\n${error.stack}`.red);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "🔧 HI-LO 按鈕處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "🔧 HI-LO 按鈕處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
