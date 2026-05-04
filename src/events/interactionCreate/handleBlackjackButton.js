require("colors");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { hit, stand, doubleDown } = require("../../features/casino/blackjack/engine");
const { renderMessage } = require("../../features/casino/blackjack/renderer");

function getBjConfig() {
  return casino?.blackjack || {};
}

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId?.startsWith("bj_")) return;
    if (!client.blackjackGamesCollection) return;

    // customId 格式：bj_<action>_<gameId>，gameId 是 uuid 含 "-"
    const rest = interaction.customId.slice("bj_".length);
    const splitIdx = rest.indexOf("_");
    if (splitIdx < 0) return;
    const action = rest.slice(0, splitIdx);
    const gameId = rest.slice(splitIdx + 1);

    if (!["hit", "stand", "double"].includes(action)) return;

    const state = await client.blackjackGamesCollection.findOne({ gameId });
    if (!state) {
      return interaction.reply({
        content: "🃏 這局已過期或找不到了。",
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
        content: "🃏 這局已結束。",
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    const userId = state.userId;
    const guildId = state.guildId;
    const username = state.username || interaction.user.username;
    const member = interaction.member;

    // double 之前要先扣第二筆 bet
    if (action === "double") {
      if (state.playerHand.length !== 2 || state.doubled) {
        return interaction.followUp({
          content: "🚫 現在不能 Double。",
          ephemeral: true,
        });
      }
      const before = await client.userCoinsCollection.findOne({ userId, guildId });
      const balance = before?.totalCoins || 0;
      if (balance < state.bet) {
        return interaction.followUp({
          content: `💰 餘額 ${balance.toLocaleString()} 不足以 Double（需要 ${state.bet.toLocaleString()}）。`,
          ephemeral: true,
        });
      }
      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        amount: -state.bet,
        source: "bet",
        member,
        meta: {
          game: "blackjack",
          gameId,
          reason: "double",
        },
      });
      if (!betResult) {
        return interaction.followUp({
          content: "🔧 Double 扣款失敗，請稍後再試。",
          ephemeral: true,
        });
      }
    }

    // 套用動作
    let next;
    if (action === "hit") next = hit(state);
    else if (action === "stand") next = stand(state);
    else next = doubleDown(state);

    const cfg = getBjConfig();
    const ttlSec = cfg.gameTtlSeconds ?? 300;
    const now = new Date();

    await client.blackjackGamesCollection.updateOne(
      { _id: state._id },
      {
        $set: {
          deck: next.deck,
          playerHand: next.playerHand,
          dealerHand: next.dealerHand,
          doubled: next.doubled,
          status: next.status,
          result: next.result,
          payout: next.payout,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + ttlSec * 1000),
        },
      }
    );

    // 結算派彩
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
          game: "blackjack",
          result: next.result,
          gameId,
          bet: next.bet,
          doubled: next.doubled,
        },
      });
      balanceAfter = payoutResult?.doc?.totalCoins;
    }
    if (balanceAfter === undefined) {
      const after = await client.userCoinsCollection.findOne({ userId, guildId });
      balanceAfter = after?.totalCoins || 0;
    }

    // gameId 在 doc 上、不在 next 上（next 來自 engine pure state），補進去給 renderer 命名 attachment
    const payload = await renderMessage(
      { ...next, gameId },
      { username, balance: balanceAfter }
    );
    // editReply 預設不會清掉舊 attachments，每次 hit 都要覆蓋成新檔
    await interaction.editReply({
      ...payload,
      attachments: [],
    });
  } catch (error) {
    console.log(`[ERROR] handleBlackjackButton:\n${error}\n${error.stack}`.red);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "🔧 21 點按鈕處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "🔧 21 點按鈕處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
