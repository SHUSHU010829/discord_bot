const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");

const { loadAdditionalAsset } = require("./satoriEmoji");
const LruCache = require("./lruCache");

const walletCardCache = new LruCache(256);

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

function buildMarkup(data) {
  const {
    username,
    totalCoins,
    lifetimeCoins,
    cardNo,
    tier = "standard",
  } = data;

  // 米色 / 紅 / 墨褐配色，沿用 profileCard 的色票
  const card = "#F4ECD8";
  const ink = "#2A2420";
  const muted = "#A89270";
  const accent = "#C73E2E";

  const safeName = (username || "shushu").trim() || "shushu";
  const displayName = safeName.toUpperCase();
  // 取第一個字母（英）或第一個字（中）當 logo
  const logoChar = Array.from(safeName)[0]?.toUpperCase() || "S";
  const handle = `@${displayName}`;
  // 卡號：前面零補滿 4 碼
  const cardNoStr = String(cardNo ?? "0000").padStart(4, "0");

  return `
    <div style="display:flex;width:1080px;height:600px;background:${card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:36px 44px;box-sizing:border-box;">

        <!-- Header：logo 方塊 + 使用者名 + tier，右上 CARD NO. -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:84px;height:84px;background:${accent};border:3px solid ${ink};box-sizing:border-box;align-items:center;justify-content:center;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${card};line-height:1;">${logoChar}</div>
            </div>
            <div style="display:flex;flex-direction:column;margin-left:24px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${ink};line-height:1;letter-spacing:4px;padding-right:4px;">${displayName}</div>
              <div style="display:flex;align-self:flex-start;margin-top:10px;padding:6px 16px;background:${ink};font-family:'NotoSansTC';font-weight:500;font-size:16px;color:${card};letter-spacing:5px;padding-right:21px;">${tier.toUpperCase()}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${muted};padding-right:3px;">CARD NO.</div>
            <div style="display:flex;margin-top:6px;font-family:'SpaceMono';font-size:26px;color:${ink};letter-spacing:3px;padding-right:3px;">${cardNoStr}</div>
          </div>
        </div>

        <!-- BALANCE 標籤 + 點點分隔線 -->
        <div style="display:flex;width:100%;align-items:center;margin-top:36px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:6px;color:${muted};padding-right:6px;">— BALANCE —</div>
          <div style="display:flex;flex:1;height:0;border-top:2px dashed ${muted};margin-left:18px;"></div>
        </div>

        <!-- 大數字 + CREDITS -->
        <div style="display:flex;align-items:flex-end;width:100%;margin-top:14px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:170px;color:${accent};line-height:1;letter-spacing:-4px;">${totalCoins.toLocaleString()}</div>
          <div style="display:flex;margin-left:24px;margin-bottom:24px;font-family:'NotoSansTC';font-weight:500;font-size:36px;color:${ink};letter-spacing:8px;padding-right:8px;">CREDITS</div>
        </div>

        <!-- 下方點點分隔線 -->
        <div style="display:flex;width:100%;height:0;margin-top:18px;border-top:2px dashed ${muted};"></div>

        <!-- Footer：LIFETIME（左）・@USERNAME（右） -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;">
          <div style="display:flex;align-items:baseline;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${muted};padding-right:5px;">LIFETIME</div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:900;font-size:26px;color:${ink};">${(lifetimeCoins ?? 0).toLocaleString()}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:15px;letter-spacing:6px;color:${ink};padding-right:6px;">${handle}</div>
        </div>

      </div>
    </div>
  `;
}

function buildCacheKey(data) {
  return [
    data.userId || "",
    data.guildId || "",
    data.username || "",
    data.totalCoins ?? "",
    data.lifetimeCoins ?? "",
    data.cardNo || "",
    data.tier || "",
  ].join("|");
}

async function generateWalletCard(data) {
  const cacheKey = buildCacheKey(data);
  const cached = walletCardCache.get(cacheKey);
  if (cached) return cached;

  const fonts = await loadFonts();
  const markup = buildMarkup(data);
  const element = html(markup);

  const svg = await satori(element, {
    width: 1080,
    height: 600,
    fonts,
    loadAdditionalAsset,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
  })
    .render()
    .asPng();

  const buf = Buffer.from(png);
  walletCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateWalletCard;
