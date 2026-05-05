const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");

const { loadAdditionalAsset } = require("./satoriEmoji");
const LruCache = require("./lruCache");

const slotCardCache = new LruCache(64);

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
  reelBg: "#E8DFC8",
  gold: "#D4A437",
  red: "#C9302C",
  teal: "#3D6F6A",
};

function pickAccent(matchType) {
  switch (matchType) {
    case "jackpot":
      return PALETTE.gold;
    case "triple":
    case "double_cherry":
      return PALETTE.red;
    case "double":
      return PALETTE.teal;
    default:
      return PALETTE.muted;
  }
}

function renderReel(emoji, accent, highlight) {
  const frame = highlight ? accent : PALETTE.ink;
  const frameWidth = highlight ? 4 : 3;
  return `
    <div style="display:flex;width:200px;height:200px;background:${PALETTE.reelBg};border:${frameWidth}px solid ${frame};box-sizing:border-box;align-items:center;justify-content:center;margin:0 14px;">
      <div style="display:flex;font-size:120px;line-height:1;">${emoji}</div>
    </div>
  `;
}

function buildHeadline(matchType) {
  switch (matchType) {
    case "jackpot":
      return { left: "🎉", text: "JACKPOT", right: "🎉" };
    case "triple":
      return { left: "🎊", text: "三連線中獎", right: null };
    case "double_cherry":
      return { left: "🍒", text: "兩個櫻桃", right: null };
    case "double":
      return { left: "✨", text: "兩個一樣", right: null };
    default:
      return { left: "💸", text: "NO MATCH", right: null };
  }
}

function renderHeadline(headline, color, size, weight) {
  const emojiStyle = `display:flex;font-family:'NotoSansTC';font-weight:500;font-size:${size}px;line-height:1;`;
  const textStyle = `display:flex;font-family:'NotoSansTC';font-weight:${weight};font-size:${size}px;color:${color};letter-spacing:6px;line-height:1;padding-right:6px;`;
  const left = headline.left
    ? `<div style="${emojiStyle}margin-right:${Math.round(size * 0.4)}px;">${headline.left}</div>`
    : "";
  const right = headline.right
    ? `<div style="${emojiStyle}margin-left:${Math.round(size * 0.4)}px;">${headline.right}</div>`
    : "";
  return `${left}<div style="${textStyle}">${headline.text}</div>${right}`;
}

function buildMarkup(data) {
  const {
    username,
    reels,
    matchType,
    matchedSymbol,
    bet,
    payout,
    multiplier,
    balance,
  } = data;

  const accent = pickAccent(matchType);
  const won = payout > 0;
  const handle = `@${(username || "shushu").toUpperCase()}`;
  const headline = buildHeadline(matchType, payout);

  const jackpotPool = data.jackpotPool;
  const jackpotBust = data.jackpotBust || 0;
  const jackpotBanner = jackpotPool != null
    ? (() => {
        const isBust = matchType === "jackpot" && jackpotBust > 0;
        const bannerBg = isBust ? PALETTE.gold : PALETTE.reelBg;
        const bannerInk = isBust ? PALETTE.ink : PALETTE.ink;
        const labelText = isBust ? "JACKPOT BUSTED!" : "JACKPOT POOL";
        const amountText = isBust
          ? `+${jackpotBust.toLocaleString()}`
          : jackpotPool.toLocaleString();
        return `
          <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:14px;padding:10px 18px;background:${bannerBg};border:2px solid ${PALETTE.ink};box-sizing:border-box;">
            <div style="display:flex;align-items:center;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:22px;line-height:1;margin-right:10px;">💰</div>
              <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:5px;color:${bannerInk};line-height:1;padding-right:5px;">${labelText}</div>
            </div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:30px;color:${bannerInk};letter-spacing:2px;line-height:1;">${amountText}</div>
          </div>
        `;
      })()
    : "";

  const reelHighlight = (idx) => {
    if (!won || !matchedSymbol) return false;
    if (matchType === "jackpot" || matchType === "triple") return true;
    return reels[idx]?.id === matchedSymbol;
  };

  const reelHtml = reels
    .map((r, idx) => renderReel(r.emoji, accent, reelHighlight(idx)))
    .join("");

  const payoutBlock = won
    ? `
      <div style="display:flex;flex-direction:column;align-items:center;width:100%;margin-top:18px;">
        <div style="display:flex;align-items:center;">${renderHeadline(headline, accent, 30, 900)}</div>
        <div style="display:flex;align-items:flex-end;margin-top:8px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:32px;color:${accent};line-height:1;margin-right:8px;">＋</div>
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:84px;color:${accent};line-height:1;">${payout.toLocaleString()}</div>
        </div>
      </div>
    `
    : `
      <div style="display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;width:100%;">
        <div style="display:flex;align-items:center;">${renderHeadline(headline, PALETTE.muted, 48, 900)}</div>
      </div>
    `;

  const multiplierTag = won
    ? `<div style="display:flex;margin-left:18px;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${PALETTE.muted};line-height:1;">×${multiplier}</div>`
    : "";

  return `
    <div style="display:flex;width:1080px;height:680px;background:${PALETTE.card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${PALETTE.card};border:3px solid ${PALETTE.ink};padding:32px 44px;box-sizing:border-box;">

        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:64px;height:64px;background:${accent};border:3px solid ${PALETTE.ink};box-sizing:border-box;align-items:center;justify-content:center;font-family:'NotoSansTC';font-weight:900;font-size:36px;color:${PALETTE.card};">霸</div>
            <div style="display:flex;margin-left:20px;font-family:'NotoSansTC';font-weight:900;font-size:44px;color:${PALETTE.ink};letter-spacing:6px;padding-right:6px;">SLOT MACHINE</div>
          </div>
          <div style="display:flex;align-items:center;padding:8px 18px;background:${PALETTE.ink};font-family:'NotoSansTC';font-weight:500;font-size:18px;color:${PALETTE.card};letter-spacing:3px;padding-right:21px;">逼逼賭場</div>
        </div>

        <div style="display:flex;width:100%;height:0;margin-top:18px;border-top:2px dashed ${PALETTE.muted};"></div>

        ${jackpotBanner}

        <div style="display:flex;width:100%;justify-content:center;align-items:center;margin-top:24px;">
          ${reelHtml}
        </div>

        ${payoutBlock}

        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;padding-top:14px;border-top:2px dashed ${PALETTE.muted};">
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${PALETTE.muted};line-height:1;padding-right:5px;">BET</div>
            <div style="display:flex;margin-left:7px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${PALETTE.ink};line-height:1;">${bet.toLocaleString()}</div>
            ${multiplierTag}
          </div>
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${PALETTE.muted};line-height:1;padding-right:5px;">BALANCE</div>
            <div style="display:flex;margin-left:7px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${PALETTE.ink};line-height:1;">${balance.toLocaleString()}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:5px;color:${PALETTE.ink};padding-right:5px;">${handle}</div>
        </div>

      </div>
    </div>
  `;
}

function buildCacheKey(data) {
  return [
    data.userId || "",
    data.reels?.map((r) => r.id).join(",") || "",
    data.matchType || "",
    data.bet ?? "",
    data.payout ?? "",
    data.multiplier ?? "",
    data.balance ?? "",
    data.jackpotPool ?? "",
    data.jackpotBust ?? "",
  ].join("|");
}

async function generateSlotCard(data) {
  const cacheKey = buildCacheKey(data);
  const cached = slotCardCache.get(cacheKey);
  if (cached) return cached;

  const fonts = await loadFonts();
  const markup = buildMarkup(data);
  const element = html(markup);

  const svg = await satori(element, {
    width: 1080,
    height: 680,
    fonts,
    loadAdditionalAsset,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
  })
    .render()
    .asPng();

  const buf = Buffer.from(png);
  slotCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateSlotCard;
