// 射龍門 Discord 訊息 payload 渲染。

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { classifyDeck, valueOf } = require("./engine");

const SUIT_EMOJI = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL = {
  A: "A", T: "10", J: "J", Q: "Q", K: "K",
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
};

function formatCard(card) {
  if (!card) return "🂠";
  return `${RANK_LABEL[card[0]]}${SUIT_EMOJI[card[1]]}`;
}

function buildButtons(state) {
  const gameId = state.gameId;
  const playing = state.status === "playing";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dg_shoot_${gameId}`)
      .setLabel(playing ? `射 ×${state.multiplier.toFixed(2)}` : "射")
      .setEmoji("🐉")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!playing)
  );
}

function settleHeadline(state) {
  const total = state.bet * 2;
  switch (state.result) {
    case "between": {
      const profit = state.payout - total;
      return `🎯 **射中龍門！** ＋${profit.toLocaleString()} credits（×${state.multiplier.toFixed(2)}）`;
    }
    case "outside":
      return `💨 **射出柱外！** －${state.bet.toLocaleString()} credits`;
    case "hitGate":
      return `💥 **碰柱！** 賠雙倍 －${(state.bet * 2).toLocaleString()} credits`;
    case "push":
      return `🤝 **和局退錢** ${describePush(state)}`;
    default:
      return "";
  }
}

function describePush(state) {
  if (valueOf(state.gateLow) === valueOf(state.gateHigh)) {
    return "（對柱）";
  }
  if (Math.abs(valueOf(state.gateLow) - valueOf(state.gateHigh)) === 1) {
    return "（連柱）";
  }
  return "";
}

function renderText(state, { username, balance } = {}) {
  const isPlaying = state.status === "playing";
  const handle = username ? `@${username}` : "";

  const lines = [
    `🐉 **射龍門** ・ Bet: **${state.bet.toLocaleString()}**${handle ? ` ・ ${handle}` : ""}`,
    `-# 下注時鎖倉 ${(state.bet * 2).toLocaleString()} credits（含碰柱保證金）`,
    "─────────────────────",
    `龍門：[ ${formatCard(state.gateLow)} ] ─── [ ${formatCard(state.gateHigh)} ]`,
    `點數：${valueOf(state.gateLow)}  ─  ${valueOf(state.gateHigh)}`,
  ];

  if (isPlaying) {
    const cls = classifyDeck(state.gateLow, state.gateHigh, state.deck);
    lines.push(
      `機率：中間 ${cls.between}/${cls.total}　外面 ${cls.outside}/${cls.total}　碰柱 ${cls.hit}/${cls.total}`
    );
    lines.push(
      `賠率：中間 **×${state.multiplier.toFixed(2)}**　外面 −1×　碰柱 −2×`
    );
    lines.push("按下 🐉 開第三張！");
  } else {
    if (state.thirdCard) {
      lines.push(`開牌：[ ${formatCard(state.thirdCard)} ] ＝ ${valueOf(state.thirdCard)}`);
    }
    lines.push("─────────────────────");
    lines.push(settleHeadline(state));
    if (typeof balance === "number") {
      lines.push(`餘額：**${balance.toLocaleString()}** credits`);
    }
  }

  return lines.join("\n");
}

function renderMessage(state, { username, balance } = {}) {
  const components =
    state.status === "playing" ? [buildButtons(state)] : [];
  const content = renderText(state, { username, balance });
  return { content, components, files: [] };
}

module.exports = {
  renderMessage,
  renderText,
  buildButtons,
  settleHeadline,
  formatCard,
};
