// Crash / 火箭 Discord 訊息 payload 渲染。
//
// 單次性結算（指令觸發即跑完），不需要按鈕互動。

const { AttachmentBuilder } = require("discord.js");

const generateCrashCard = require("../../../utils/generateCrashCard");

function settleHeadline(state) {
  if (state.result === "cashout") {
    return `🚀 **成功收手！** ×${state.cashoutAt.toFixed(2)} ＝ +${state.payout.toLocaleString()} credits（本局爆炸於 ×${state.bust.toFixed(2)}）`;
  }
  return `💥 **火箭爆炸！** −${state.bet.toLocaleString()} credits（爆炸於 ×${state.bust.toFixed(2)}，目標 ×${state.autocashout.toFixed(2)}）`;
}

function renderText(state, { username, balance } = {}) {
  const handle = username ? `@${username}` : "";
  const lines = [
    `🚀 **火箭** ・ Bet: **${state.bet.toLocaleString()}**${handle ? ` ・ ${handle}` : ""}`,
    "─────────────────────",
    `自動收手目標：×${state.autocashout.toFixed(2)}`,
    `本局爆炸倍率：×${state.bust.toFixed(2)}`,
    settleHeadline(state),
  ];
  if (typeof balance === "number") {
    lines.push(`餘額：**${balance.toLocaleString()}** credits`);
  }
  return lines.join("\n");
}

async function renderMessage(state, { username, balance } = {}) {
  let content = "";
  let files = [];
  try {
    const buf = await generateCrashCard({
      username,
      state,
      balance: balance ?? 0,
    });
    files = [
      new AttachmentBuilder(buf, {
        name: `crash-${state.gameId || "result"}.png`,
      }),
    ];
    content = settleHeadline(state);
  } catch (e) {
    console.log(
      `[WARN] crash card render failed, falling back to text: ${e.message}`,
    );
    content = renderText(state, { username, balance });
  }

  return { content, components: [], files };
}

module.exports = {
  renderMessage,
  renderText,
  settleHeadline,
};
