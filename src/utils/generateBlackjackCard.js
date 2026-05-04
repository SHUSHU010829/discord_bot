const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");

const { loadAdditionalAsset } = require("./satoriEmoji");
const { evaluateHand } = require("../features/casino/blackjack/hand");

const FONT_DIR = path.join(__dirname, "../../fonts");
let fontsCache = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [tcBlack, tcMedium, mono] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Black.woff")),
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Medium.woff")),
    fs.readFile(path.join(FONT_DIR, "SpaceMono-Regular.woff")),
  ]);
  fontsCache = [
    { name: "SpaceMono", data: mono, weight: 400, style: "normal" },
    { name: "NotoSansTC", data: tcMedium, weight: 500, style: "normal" },
    { name: "NotoSansTC", data: tcBlack, weight: 900, style: "normal" },
  ];
  return fontsCache;
}

const PALETTE = {
  card: "#F4ECD8",
  ink: "#2A2420",
  muted: "#A89270",
  cardWhite: "#FBF7EC",
  red: "#C9302C",
  teal: "#3D6F6A",
  gold: "#D4A437",
  neutral: "#5C5648",
  hidden: "#C9302C",
};

const RANK_LABEL = {
  A: "A", T: "10", J: "J", Q: "Q", K: "K",
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
};

function isRedSuit(suit) {
  return suit === "H" || suit === "D";
}

// 內嵌 SVG 畫四種花色（NotoSansTC 沒有 ♠♥♦♣ glyph，satori 會直接吞掉）
const SUIT_PATHS = {
  S: "M50 5 C30 30 5 45 5 65 C5 80 18 90 30 90 C40 90 47 84 50 78 C53 84 60 90 70 90 C82 90 95 80 95 65 C95 45 70 30 50 5 Z M40 92 L60 92 L55 70 L45 70 Z",
  H: "M50 90 C20 65 5 50 5 30 C5 16 16 5 30 5 C40 5 47 11 50 18 C53 11 60 5 70 5 C84 5 95 16 95 30 C95 50 80 65 50 90 Z",
  D: "M50 5 L92 50 L50 95 L8 50 Z",
  C: "M50 5 C40 5 32 13 32 23 C32 28 34 32 37 35 C28 33 18 38 18 50 C18 60 26 68 36 68 C42 68 47 65 50 60 C53 65 58 68 64 68 C74 68 82 60 82 50 C82 38 72 33 63 35 C66 32 68 28 68 23 C68 13 60 5 50 5 Z M40 92 L60 92 L55 68 L45 68 Z",
};

function renderSuitSvg(suit, size, color) {
  const path = SUIT_PATHS[suit];
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="${color}"/></svg>`;
}

function pickAccent(state) {
  if (state.status !== "settled") return PALETTE.muted;
  switch (state.result) {
    case "blackjack":
      return PALETTE.gold;
    case "win":
      return PALETTE.teal;
    case "push":
      return PALETTE.neutral;
    case "lose":
    default:
      return PALETTE.muted;
  }
}

function renderCard(card) {
  const rank = card[0];
  const suit = card[1];
  const label = RANK_LABEL[rank];
  const color = isRedSuit(suit) ? PALETTE.red : PALETTE.ink;
  const suitSvg = renderSuitSvg(suit, 64, color);
  // 10 兩個字母排起來會超寬，把字級縮一點
  const rankSize = label.length > 1 ? 78 : 96;
  return `
    <div style="display:flex;width:140px;height:200px;background:${PALETTE.cardWhite};border:3px solid ${PALETTE.ink};box-sizing:border-box;margin:0 8px;flex-direction:column;justify-content:center;align-items:center;padding:14px 0;">
      <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:${rankSize}px;color:${color};line-height:1;letter-spacing:-2px;">${label}</div>
      <div style="display:flex;margin-top:14px;">${suitSvg}</div>
    </div>
  `;
}

function renderHiddenCard() {
  return `
    <div style="display:flex;width:140px;height:200px;background:${PALETTE.hidden};border:3px solid ${PALETTE.ink};box-sizing:border-box;margin:0 8px;align-items:center;justify-content:center;">
      <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:96px;color:${PALETTE.cardWhite};line-height:1;">?</div>
    </div>
  `;
}

function renderHandRow(cards, hideSecond) {
  return cards
    .map((c, i) => (hideSecond && i === 1 ? renderHiddenCard() : renderCard(c)))
    .join("");
}

function buildResultLabel(state) {
  if (state.status !== "settled") return null;
  switch (state.result) {
    case "blackjack":
      return { text: "BLACKJACK", color: PALETTE.gold };
    case "win":
      return { text: "玩家獲勝", color: PALETTE.teal };
    case "push":
      return { text: "平手", color: PALETTE.neutral };
    case "lose":
    default:
      return { text: "莊家獲勝", color: PALETTE.muted };
  }
}

function buildMarkup(data) {
  const { username, state, balance } = data;
  const isPlaying = state.status === "playing";
  const accent = pickAccent(state);
  const resultLabel = buildResultLabel(state);

  const playerEval = evaluateHand(state.playerHand);
  const dealerEval = evaluateHand(state.dealerHand);
  const dealerVisibleTotal = isPlaying
    ? "?"
    : dealerEval.total;

  const handle = `@${(username || "shushu").toUpperCase()}`;
  const stake = state.bet * (state.doubled ? 2 : 1);

  const dealerCards = renderHandRow(state.dealerHand, isPlaying);
  const playerCards = renderHandRow(state.playerHand, false);

  const playerBadge = playerEval.isBust
    ? `<div style="display:flex;margin-left:14px;padding:2px 10px;background:${PALETTE.red};color:${PALETTE.cardWhite};font-family:'SpaceMono';font-size:14px;letter-spacing:2px;">BUST</div>`
    : playerEval.isBlackjack && state.playerHand.length === 2
    ? `<div style="display:flex;margin-left:14px;padding:2px 10px;background:${PALETTE.gold};color:${PALETTE.ink};font-family:'SpaceMono';font-size:14px;letter-spacing:2px;">BJ</div>`
    : "";

  const dealerBadge = !isPlaying && dealerEval.isBust
    ? `<div style="display:flex;margin-left:14px;padding:2px 10px;background:${PALETTE.red};color:${PALETTE.cardWhite};font-family:'SpaceMono';font-size:14px;letter-spacing:2px;">BUST</div>`
    : !isPlaying && dealerEval.isBlackjack && state.dealerHand.length === 2
    ? `<div style="display:flex;margin-left:14px;padding:2px 10px;background:${PALETTE.gold};color:${PALETTE.ink};font-family:'SpaceMono';font-size:14px;letter-spacing:2px;">BJ</div>`
    : "";

  // 結算金額：push = 退回本金、win/blackjack = 派彩、lose = 顯示輸掉的本金
  let settleAmount = 0;
  let settleAmountPrefix = "";
  if (state.result === "push") {
    settleAmount = stake;
    settleAmountPrefix = "退回 ";
  } else if (state.result === "lose") {
    settleAmount = stake;
    settleAmountPrefix = "−";
  } else if (state.payout > 0) {
    settleAmount = state.payout;
    settleAmountPrefix = "+";
  }

  const resultBlock = resultLabel
    ? `
      <div style="display:flex;flex-direction:row;align-items:center;justify-content:center;width:100%;margin-top:28px;margin-bottom:48px;">
        <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:42px;color:${resultLabel.color};letter-spacing:10px;line-height:1;padding-right:10px;">${resultLabel.text}</div>
        ${
          settleAmount > 0
            ? `<div style="display:flex;align-items:flex-end;margin-left:56px;">
                 <div style="display:flex;font-family:'SpaceMono';font-weight:400;font-size:24px;color:${resultLabel.color};line-height:1;margin-right:12px;margin-bottom:4px;">${settleAmountPrefix}</div>
                 <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:42px;color:${resultLabel.color};line-height:1;">${settleAmount.toLocaleString()}</div>
               </div>`
            : ""
        }
      </div>
    `
    : `
      <div style="display:flex;flex-direction:column;align-items:center;width:100%;margin-top:28px;margin-bottom:48px;">
        <div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:22px;color:${PALETTE.muted};letter-spacing:6px;line-height:1;padding-right:6px;">輪到你了</div>
      </div>
    `;

  const stakeLabel = state.doubled
    ? `${state.bet.toLocaleString()} ×2`
    : `${state.bet.toLocaleString()}`;

  return `
    <div style="display:flex;width:1080px;height:860px;background:${PALETTE.card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${PALETTE.card};border:3px solid ${PALETTE.ink};padding:28px 40px;box-sizing:border-box;">

        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:60px;height:60px;background:${accent};border:3px solid ${PALETTE.ink};box-sizing:border-box;align-items:center;justify-content:center;font-family:'SpaceMono';font-weight:400;font-size:30px;color:${PALETTE.card};letter-spacing:-2px;">21</div>
            <div style="display:flex;margin-left:18px;font-family:'NotoSansTC';font-weight:900;font-size:38px;color:${PALETTE.ink};letter-spacing:6px;padding-right:6px;">BLACKJACK</div>
          </div>
          <div style="display:flex;align-items:center;padding:6px 16px;background:${PALETTE.ink};font-family:'NotoSansTC';font-weight:500;font-size:16px;color:${PALETTE.card};letter-spacing:3px;padding-right:19px;">逼逼賭場</div>
        </div>

        <div style="display:flex;width:100%;height:0;margin-top:14px;border-top:2px dashed ${PALETTE.muted};"></div>

        <div style="display:flex;width:100%;align-items:center;margin-top:18px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:18px;letter-spacing:6px;color:${PALETTE.muted};line-height:1;padding-right:6px;">莊家</div>
          <div style="display:flex;margin-left:8px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${PALETTE.ink};line-height:1;">${dealerVisibleTotal}</div>
          ${dealerBadge}
        </div>
        <div style="display:flex;width:100%;justify-content:center;margin-top:6px;">${dealerCards}</div>

        <div style="display:flex;width:100%;height:0;margin-top:14px;border-top:2px dashed ${PALETTE.muted};"></div>

        <div style="display:flex;width:100%;align-items:center;margin-top:14px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:18px;letter-spacing:6px;color:${PALETTE.muted};line-height:1;padding-right:6px;">玩家</div>
          <div style="display:flex;margin-left:8px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${PALETTE.ink};line-height:1;">${playerEval.total}${playerEval.isSoft && !playerEval.isBust ? " (S)" : ""}</div>
          ${playerBadge}
        </div>
        <div style="display:flex;width:100%;justify-content:center;margin-top:6px;">${playerCards}</div>

        ${resultBlock}

        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;padding-top:20px;border-top:2px dashed ${PALETTE.muted};">
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${PALETTE.muted};line-height:1;padding-right:5px;">BET</div>
            <div style="display:flex;margin-left:7px;font-family:'NotoSansTC';font-weight:900;font-size:22px;color:${PALETTE.ink};line-height:1;">${stakeLabel}</div>
          </div>
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${PALETTE.muted};line-height:1;padding-right:5px;">BALANCE</div>
            <div style="display:flex;margin-left:7px;font-family:'NotoSansTC';font-weight:900;font-size:22px;color:${PALETTE.ink};line-height:1;">${(balance ?? 0).toLocaleString()}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:5px;color:${PALETTE.ink};padding-right:5px;">${handle}</div>
        </div>

      </div>
    </div>
  `;
}

async function generateBlackjackCard(data) {
  const fonts = await loadFonts();
  const markup = buildMarkup(data);
  const element = html(markup);

  const svg = await satori(element, {
    width: 1080,
    height: 860,
    fonts,
    loadAdditionalAsset,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
  })
    .render()
    .asPng();

  return Buffer.from(png);
}

module.exports = generateBlackjackCard;
