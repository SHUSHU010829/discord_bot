// 把 game state 渲染成 Discord 訊息 payload。
// 給 /二十一點 開局時用，給 button handler 更新時也用同一份。

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { evaluateHand } = require("./hand");
const { FIVE_CARD_THRESHOLD } = require("./engine");
const generateBlackjackCard = require("../../../utils/generateBlackjackCard");

const SUIT_EMOJI = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL = {
  A: "A", T: "10", J: "J", Q: "Q", K: "K",
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
};

function formatCard(card) {
  return `${RANK_LABEL[card[0]]}${SUIT_EMOJI[card[1]]}`;
}

function renderHandLine(label, cards, total, isHidden) {
  if (isHidden) {
    // 莊家暗牌：只顯示第一張，第二張用問號蓋住
    return `${label}：[ ${formatCard(cards[0])} ] [ ?? ]　= ?`;
  }
  const parts = cards.map((c) => `[ ${formatCard(c)} ]`).join(" ");
  return `${label}：${parts}　= ${total}`;
}

function buildButtons(state, balance) {
  const gameId = state.gameId;
  const canDouble =
    state.status === "playing" &&
    state.playerHand.length === 2 &&
    !state.doubled &&
    balance >= state.bet;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit_${gameId}`)
      .setLabel("要牌")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.status !== "playing"),
    new ButtonBuilder()
      .setCustomId(`bj_stand_${gameId}`)
      .setLabel("停牌")
      .setEmoji("✋")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.status !== "playing"),
    new ButtonBuilder()
      .setCustomId(`bj_double_${gameId}`)
      .setLabel("加倍")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canDouble)
  );
}

function settleHeadline(state) {
  const stake = state.bet * (state.doubled ? 2 : 1);
  switch (state.result) {
    case "blackjack":
      return `🎉 **BLACKJACK！** ＋${state.payout.toLocaleString()} credits`;
    case "fivecard":
      return `🏆 **過五關！** ＋${state.payout.toLocaleString()} credits`;
    case "win":
      return `✨ **你贏了！** ＋${state.payout.toLocaleString()} credits`;
    case "push":
      return `🤝 **平手** 退回 ${stake.toLocaleString()} credits`;
    case "lose":
      return `💸 **莊家贏了** －${stake.toLocaleString()} credits，下次加油！`;
    default:
      return "";
  }
}

// 依據 state 產生純文字訊息（M2 版）。M3 會額外生圖。
function renderText(state, { username, balance } = {}) {
  const isPlaying = state.status === "playing";
  const playerEval = evaluateHand(state.playerHand);
  const dealerEval = evaluateHand(state.dealerHand);

  const dealerLine = renderHandLine(
    "莊家",
    state.dealerHand,
    dealerEval.total,
    isPlaying // 結算前都暗牌
  );
  const playerLine = renderHandLine(
    "你的",
    state.playerHand,
    playerEval.total,
    false
  );

  const handle = username ? `@${username}` : "";
  const stake = state.bet * (state.doubled ? 2 : 1);
  const stakeLabel = state.doubled
    ? `Bet: ${state.bet.toLocaleString()} ×2 = **${stake.toLocaleString()}**`
    : `Bet: **${state.bet.toLocaleString()}**`;

  const lines = [
    `🃏 **BLACKJACK** ・ ${stakeLabel}${handle ? ` ・ ${handle}` : ""}`,
    "─────────────────────",
    dealerLine,
    playerLine,
  ];

  if (isPlaying && state.playerHand.length >= 3 && !playerEval.isBust) {
    const remain = FIVE_CARD_THRESHOLD - state.playerHand.length;
    if (remain > 0) {
      lines.push(`🏆 再抽 ${remain} 張未爆牌即過五關（賠率 2:1）`);
    }
  }

  if (!isPlaying) {
    lines.push("─────────────────────");
    lines.push(settleHeadline(state));
    if (typeof balance === "number") {
      lines.push(`餘額：**${balance.toLocaleString()}** credits`);
    }
  }

  return lines.join("\n");
}

function buildSettleHeadlineLine(state) {
  if (state.status !== "settled") return null;
  return settleHeadline(state);
}

async function renderMessage(state, { username, balance } = {}) {
  const components =
    state.status === "playing" ? [buildButtons(state, balance ?? 0)] : [];

  let content = "";
  let files = [];
  try {
    const buf = await generateBlackjackCard({
      username,
      state,
      balance: balance ?? 0,
    });
    files = [
      new AttachmentBuilder(buf, { name: `blackjack-${state.gameId}.png` }),
    ];
    // 圖卡已含完整資訊；只在結算時補一句結算文字方便手機通知預覽
    const settleLine = buildSettleHeadlineLine(state);
    if (settleLine) content = settleLine;
  } catch (e) {
    // 圖卡生成失敗就 fallback 純文字
    console.log(`[WARN] blackjack card render failed, falling back to text: ${e.message}`);
    content = renderText(state, { username, balance });
  }

  return { content, components, files };
}

module.exports = {
  renderMessage,
  renderText,
  buildButtons,
  formatCard,
  settleHeadline,
};
