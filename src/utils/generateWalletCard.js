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
    cardNo = "0000",
    tier = "standard",
  } = data;

  // 米色 / 紅 / 墨褐配色，沿用 profileCard 的色票
  const card = "#F4ECD8";
  const ink = "#2A2420";
  const muted = "#A89270";
  const subtle = "#E8DFC8";
  const accent = "#C73E2E";

  const handle = `@${(username || "shushu").toUpperCase()}`;

  return `
    <div style="display:flex;width:1080px;height:600px;background:${card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:36px 44px;box-sizing:border-box;">

        <!-- Header：logo 方塊 + SHUSHU + tier，右上 CARD NO. -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:84px;height:84px;background:${accent};border:3px solid ${ink};box-sizing:border-box;align-items:center;justify-content:center;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${card};line-height:1;">S</div>
            </div>
            <div style="display:flex;flex-direction:column;margin-left:24px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${ink};line-height:1;letter-spacing:4px;">SHUSHU</div>
              <div style="display:flex;align-self:flex-start;margin-top:10px;padding:6px 16px;background:${ink};font-family:'NotoSansTC';font-weight:500;font-size:16px;color:${card};letter-spacing:5px;">${tier.toUpperCase()}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${muted};">CARD NO.</div>
            <div style="display:flex;margin-top:6px;font-family:'SpaceMono';font-size:26px;color:${ink};letter-spacing:3px;">${cardNo}</div>
          </div>
        </div>

        <!-- BALANCE 標籤 + 點點分隔線 -->
        <div style="display:flex;width:100%;align-items:center;margin-top:36px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:6px;color:${muted};">— &nbsp;BALANCE&nbsp; —</div>
          <div style="display:flex;flex:1;height:0;border-top:2px dotted ${muted};margin-left:18px;"></div>
        </div>

        <!-- 大數字 + CREDITS -->
        <div style="display:flex;align-items:flex-end;width:100%;margin-top:14px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:170px;color:${accent};line-height:1;letter-spacing:-4px;">${totalCoins.toLocaleString()}</div>
          <div style="display:flex;margin-left:24px;margin-bottom:24px;font-family:'NotoSansTC';font-weight:500;font-size:36px;color:${ink};letter-spacing:8px;">CREDITS</div>
        </div>

        <!-- 下方點點分隔線 -->
        <div style="display:flex;width:100%;height:0;margin-top:18px;border-top:2px dotted ${muted};"></div>

        <!-- Footer：LIFETIME（左）・@USERNAME（右） -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;">
          <div style="display:flex;align-items:baseline;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${muted};">LIFETIME</div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:900;font-size:26px;color:${ink};">${lifetimeCoins.toLocaleString()}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:15px;letter-spacing:6px;color:${ink};">${handle}</div>
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
