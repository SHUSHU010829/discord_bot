const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");

const { loadAdditionalAsset } = require("./satoriEmoji");
const LruCache = require("./lruCache");

const sicboCardCache = new LruCache(64);

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

// 骰面點點位置（0-1 比例座標），200×200 之骰子可直接乘出實際 px。
function pipPositions(rank) {
  const map = {
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.25, 0.2],
      [0.75, 0.2],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.25, 0.8],
      [0.75, 0.8],
    ],
  };
  return map[rank] || [];
}

function renderDie(rank, size, frameColor, frameWidth) {
  const pips = pipPositions(rank);
  const pipSize = Math.round(size * 0.13);
  const pipNodes = pips
    .map((p) => {
      const left = Math.round(p[0] * size - pipSize / 2);
      const top = Math.round(p[1] * size - pipSize / 2);
      return `<div style="position:absolute;left:${left}px;top:${top}px;width:${pipSize}px;height:${pipSize}px;background:#2A2420;border-radius:9999px;display:flex;"></div>`;
    })
    .join("");

  return `
    <div style="position:relative;display:flex;width:${size}px;height:${size}px;background:#FFFFFF;border:${frameWidth}px solid ${frameColor};border-radius:14px;box-sizing:border-box;margin:0 14px;">
      ${pipNodes}
    </div>
  `;
}

function buildMarkup(data) {
  const {
    username,
    dice,
    sum,
    betLabel,
    betAmount,
    won,
    isTriple,
    payout,
    multiplier,
    balance,
  } = data;

  const card = "#F4ECD8";
  const ink = "#2A2420";
  const muted = "#A89270";
  const teal = "#3D6F6A";
  const gold = "#D4A437";

  const accent = isTriple && won ? gold : won ? teal : muted;
  const dieFrame = isTriple && won ? gold : ink;
  const dieFrameWidth = isTriple && won ? 4 : 3;

  const resultLine = won
    ? isTriple
      ? `🎉 圍骰！＋${payout.toLocaleString()} CREDITS`
      : `✨ 中獎！＋${payout.toLocaleString()} CREDITS`
    : `💸 沒中，下次加油！`;

  const handle = `@${(username || "shushu").toUpperCase()}`;

  const dice0 = renderDie(dice[0], 200, dieFrame, dieFrameWidth);
  const dice1 = renderDie(dice[1], 200, dieFrame, dieFrameWidth);
  const dice2 = renderDie(dice[2], 200, dieFrame, dieFrameWidth);

  return `
    <div style="display:flex;width:1080px;height:680px;background:${card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:32px 44px;box-sizing:border-box;">

        <!-- Header：SIC BO 標題 + 押法 tag -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:64px;height:64px;background:${accent};border:3px solid ${ink};box-sizing:border-box;align-items:center;justify-content:center;font-family:'NotoSansTC';font-weight:900;font-size:36px;color:${card};">骰</div>
            <div style="display:flex;margin-left:20px;font-family:'NotoSansTC';font-weight:900;font-size:44px;color:${ink};letter-spacing:6px;">SIC BO</div>
          </div>
          <div style="display:flex;align-items:center;padding:8px 18px;background:${ink};font-family:'NotoSansTC';font-weight:500;font-size:18px;color:${card};letter-spacing:3px;">${betLabel}</div>
        </div>

        <!-- 點點分隔線 -->
        <div style="display:flex;width:100%;height:0;margin-top:18px;border-top:2px dashed ${muted};"></div>

        <!-- 三顆骰子 -->
        <div style="display:flex;width:100%;justify-content:center;align-items:center;margin-top:28px;">
          ${dice0}
          ${dice1}
          ${dice2}
        </div>

        <!-- SUM -->
        <div style="display:flex;justify-content:center;align-items:flex-end;width:100%;margin-top:24px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:16px;letter-spacing:6px;color:${muted};line-height:1;">SUM</div>
          <div style="display:flex;margin-left:16px;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${accent};line-height:1;">${sum}</div>
        </div>

        <!-- 結果文字 -->
        <div style="display:flex;justify-content:center;width:100%;margin-top:18px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:30px;color:${accent};letter-spacing:2px;">${resultLine}</div>
        </div>

        <!-- 底部 BET / BALANCE / @USER -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;padding-top:14px;border-top:2px dashed ${muted};">
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${muted};line-height:1;">BET</div>
            <div style="display:flex;margin-left:12px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${ink};line-height:1;">${betAmount.toLocaleString()}</div>
            ${won ? `<div style="display:flex;margin-left:18px;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${muted};line-height:1;">×${multiplier}</div>` : ""}
          </div>
          <div style="display:flex;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${muted};line-height:1;">BALANCE</div>
            <div style="display:flex;margin-left:12px;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${ink};line-height:1;">${balance.toLocaleString()}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:5px;color:${ink};">${handle}</div>
        </div>

      </div>
    </div>
  `;
}

function buildCacheKey(data) {
  return [
    data.userId || "",
    data.dice?.join(",") || "",
    data.betLabel || "",
    data.betAmount ?? "",
    data.won ? 1 : 0,
    data.isTriple ? 1 : 0,
    data.payout ?? "",
    data.multiplier ?? "",
    data.balance ?? "",
  ].join("|");
}

async function generateSicboCard(data) {
  const cacheKey = buildCacheKey(data);
  const cached = sicboCardCache.get(cacheKey);
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
  sicboCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateSicboCard;
