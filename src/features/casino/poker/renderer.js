// 把 poker game state 渲染成 Discord message payload。
// 公牌與動作按鈕為公開；hole cards 走 ephemeral（在按「查看手牌」時 reply）。

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { legalActions, totalPot } = require("./engine");
const { categoryLabel } = require("./hand");
const generatePokerCard = require("../../../utils/generatePokerCard");

const SUIT_EMOJI = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL = {
  A: "A", T: "10", J: "J", Q: "Q", K: "K",
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
};

function formatCard(card) {
  if (!card) return "[ ?? ]";
  return `[${RANK_LABEL[card[0]]}${SUIT_EMOJI[card[1]]}]`;
}

function formatCardLine(cards, expected = 0) {
  const out = cards.map(formatCard);
  for (let i = out.length; i < expected; i += 1) out.push("[  ]");
  return out.join(" ");
}

function phaseLabel(phase) {
  if (!phase) return "等候開始";
  return (
    {
      preflop: "Pre-Flop",
      flop: "Flop（翻牌）",
      turn: "Turn（轉牌）",
      river: "River（河牌）",
      showdown: "Showdown（攤牌）",
    }[phase] || phase
  );
}

function playerStatusBadge(state, p, idx) {
  const tags = [];
  if (state.buttonIdx === idx) tags.push("🟢 D");
  if (state.sbIdx === idx) tags.push("SB");
  if (state.bbIdx === idx) tags.push("BB");
  if (state.toActIdx === idx && state.status === "playing") tags.push("⏳ 行動中");
  if (p.allIn) tags.push("🔥 All-In");
  if (p.folded) tags.push("🚫 棄");
  if (p.busted) tags.push("💀 出局");
  return tags.join(" · ");
}

function buildTableLines(state) {
  const lines = [];
  const pot = totalPot(state);
  lines.push(
    `🃏 **德州撲克** ・ 第 ${state.handNumber || 0} 局 ・ ${phaseLabel(state.phase)}`
  );
  lines.push(
    `盲注：**${state.smallBlind.toLocaleString()}/${state.bigBlind.toLocaleString()}** ・ 進桌：**${state.buyIn.toLocaleString()}** ・ 桌上 ${state.players.filter((p) => !p.busted).length}/${state.maxPlayers} 人`
  );
  lines.push("─────────────────────");

  // 公牌
  if (state.status === "playing" || state.status === "settled") {
    lines.push(`公牌：${formatCardLine(state.community || [], 5)}`);
    lines.push(
      `底池：**${pot.toLocaleString()}** credits ・ 本輪需跟：**${(state.currentBet || 0).toLocaleString()}**`
    );
    if (state.status === "playing" && state.actionDeadline) {
      const ts = Math.floor(new Date(state.actionDeadline).getTime() / 1000);
      const actor = state.players[state.toActIdx];
      if (actor) {
        lines.push(
          `⏳ **輪到 <@${actor.userId}> 行動** ・ <t:${ts}:R> 倒數 ・ 逾時自動處理`
        );
      }
    }
  } else {
    lines.push("公牌：[尚未發牌]");
  }
  lines.push("─────────────────────");

  // 玩家列
  state.players.forEach((p, idx) => {
    const badge = playerStatusBadge(state, p, idx);
    const betPart = p.bet > 0 ? ` ・ 本輪 ${p.bet.toLocaleString()}` : "";
    lines.push(
      `**#${idx + 1}** @${p.username} ・ 籌碼 **${p.chips.toLocaleString()}**${betPart}${badge ? ` ・ ${badge}` : ""}`
    );
  });

  // 攤牌結果
  if (state.status === "settled" && state.settle) {
    lines.push("─────────────────────");
    if (state.settle.showdown && state.settle.scores) {
      for (const s of state.settle.scores) {
        const player = state.players.find((p) => p.userId === s.userId);
        if (!player) continue;
        const hand = formatCardLine(s.holeCards || [], 2);
        const cat = s.score ? categoryLabel(s.score) : "";
        lines.push(`@${player.username} ・ ${hand} ・ ${cat}`);
      }
    }
    for (const pot of state.settle.winners || []) {
      const splitText = pot.splits
        .map((s) => {
          const pl = state.players.find((p) => p.userId === s.userId);
          return `@${pl?.username || s.userId.slice(-4)} ＋${s.amount.toLocaleString()}`;
        })
        .join(" ・ ");
      lines.push(`🏆 底池 ${pot.amount.toLocaleString()} → ${splitText}`);
    }
  }

  // 等候提示
  if (state.status === "waiting") {
    lines.push("─────────────────────");
    lines.push(
      `等候開桌中 ・ 需 ${state.minPlayers}-${state.maxPlayers} 人 ・ 開桌者按 **開始** 開局`
    );
    lines.push("-# 點下方「🪑 加入」入座，開桌者按「🃏 開始」開局");
  }

  return lines.join("\n");
}

function buildActionButtons(state, viewerId) {
  const rows = [];
  const gameId = state.gameId;

  if (state.status === "waiting") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pk_join_${gameId}`)
        .setLabel("加入")
        .setEmoji("🪑")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`pk_leave_${gameId}`)
        .setLabel("離桌")
        .setEmoji("👋")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`pk_start_${gameId}`)
        .setLabel("開始")
        .setEmoji("🃏")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pk_resend_${gameId}`)
        .setLabel("重貼桌面")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(row);
    return rows;
  }

  if (state.status === "playing") {
    const toAct = state.players[state.toActIdx];
    const isMyTurn = !!(viewerId && toAct && toAct.userId === viewerId);
    // 動作按鈕：所有玩家都看到，但只有當前 toAct 能按（handler 內二次驗證）
    const actor = toAct;
    const acts = actor ? legalActions(state, state.toActIdx) : [];
    const toCall = actor ? Math.max(0, state.currentBet - actor.bet) : 0;
    const callLabel = toCall === 0 ? "✓ 過牌" : `跟 ${toCall.toLocaleString()}`;

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pk_fold_${gameId}`)
        .setLabel("棄牌")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!acts.includes("fold")),
      new ButtonBuilder()
        .setCustomId(`pk_callcheck_${gameId}`)
        .setLabel(callLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!acts.includes("check") && !acts.includes("call")),
      new ButtonBuilder()
        .setCustomId(`pk_raise_${gameId}`)
        .setLabel("加注")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!acts.includes("raise")),
      new ButtonBuilder()
        .setCustomId(`pk_allin_${gameId}`)
        .setLabel("All-In")
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!acts.includes("allin")),
      new ButtonBuilder()
        .setCustomId(`pk_hand_${gameId}`)
        .setLabel("查看手牌")
        .setEmoji("🂠")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(row1);

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pk_leave_${gameId}`)
        .setLabel("離桌")
        .setEmoji("👋")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`pk_resend_${gameId}`)
        .setLabel("重貼桌面")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(row2);

    // 抑制未使用警告
    void isMyTurn;
    return rows;
  }

  if (state.status === "settled") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pk_next_${gameId}`)
        .setLabel("下一局")
        .setEmoji("🔁")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`pk_close_${gameId}`)
        .setLabel("解散牌桌")
        .setEmoji("🛑")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`pk_hand_${gameId}`)
        .setLabel("查看手牌")
        .setEmoji("🂠")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`pk_resend_${gameId}`)
        .setLabel("重貼桌面")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(row);
  }

  return rows;
}

async function renderTableMessage(state, { viewerId } = {}) {
  const components =
    state.status === "abandoned" ? [] : buildActionButtons(state, viewerId);
  const allowedMentions = { parse: [] };
  let content = buildTableLines(state);
  let files = [];
  try {
    const buf = await generatePokerCard(state);
    files = [
      new AttachmentBuilder(buf, {
        name: `poker-${state.gameId}-h${state.handNumber || 0}-${state.phase || "wait"}.png`,
      }),
    ];
    // 圖卡涵蓋公牌 / 籌碼 / 玩家；文字內容只留：行動倒數（最重要）+ 標題 + 攤牌結果
    const lines = content.split("\n");
    const headline = lines[0]; // 🃏 德州撲克 ・ 第 N 局 ・ Phase
    const action = lines.find((l) => l.startsWith("⏳"));
    const settleLines = lines.filter((l) => l.startsWith("🏆"));
    const blocks = [];
    if (action) blocks.push(action);
    blocks.push(headline);
    blocks.push(...settleLines);
    content = blocks.filter(Boolean).join("\n");
  } catch (e) {
    console.log(`[WARN] poker card render failed, falling back to text: ${e.message}`);
  }
  return { content, components, files, allowedMentions };
}

function renderEphemeralHand(state, userId) {
  const p = state.players.find((pp) => pp.userId === userId);
  if (!p) {
    return { content: "🂠 你不在這張桌上。", ephemeral: true };
  }
  if (!p.holeCards || p.holeCards.length === 0) {
    return { content: "🂠 還沒發牌喔。", ephemeral: true };
  }
  const hand = formatCardLine(p.holeCards, 2);
  const community = formatCardLine(state.community || [], 5);
  const lines = [
    `🂠 **你的手牌（第 ${state.handNumber} 局）**`,
    `底牌：${hand}`,
    `公牌：${community}`,
    `籌碼：**${p.chips.toLocaleString()}** ・ 本輪 ${p.bet.toLocaleString()} ・ 本局已投 ${p.totalBet.toLocaleString()}`,
  ];
  if (p.folded) lines.push("（你已棄牌）");
  if (p.allIn) lines.push("（你已 All-In）");
  return { content: lines.join("\n"), ephemeral: true };
}

module.exports = {
  renderTableMessage,
  renderEphemeralHand,
  formatCard,
  formatCardLine,
};
