const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const axios = require("axios");

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

async function fetchAvatarDataUri(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    const ext = url.toLowerCase().includes(".png") ? "png" : "jpeg";
    const b64 = Buffer.from(res.data).toString("base64");
    return `data:image/${ext};base64,${b64}`;
  } catch (e) {
    return null;
  }
}

function buildMarkup(data) {
  const {
    username,
    avatarDataUri,
    totalCoins,
    lifetimeCoins,
    earnedToday,
    sources,
    issuedAt,
  } = data;

  // Tatsu-card 風配色：金屬黑卡 + 金色 accent
  const ink = "#0E0B08";
  const card = "#1A1410";
  const cardLight = "#241B14";
  const accent = "#E9C46A";
  const accentDark = "#B8862E";
  const muted = "#7A6B55";
  const text = "#F4ECD8";

  const avatarSize = 96;
  const avatarHtml = avatarDataUri
    ? `<img src="${avatarDataUri}" style="display:flex;width:${avatarSize}px;height:${avatarSize}px;border-radius:${avatarSize}px;object-fit:cover;" />`
    : `<div style="display:flex;width:${avatarSize}px;height:${avatarSize}px;border-radius:${avatarSize}px;background:${accentDark};color:${ink};font-family:'NotoSansTC';font-weight:900;font-size:48px;justify-content:center;align-items:center;">${(username || "?").charAt(0).toUpperCase()}</div>`;

  const sourceRows = sources
    .map(
      (s) => `
        <div style="display:flex;flex:1;flex-direction:column;background:${cardLight};border:1px solid ${accentDark};padding:10px 14px;box-sizing:border-box;">
          <div style="display:flex;font-family:'SpaceMono';font-size:11px;letter-spacing:2px;color:${muted};">${s.label}</div>
          <div style="display:flex;align-items:baseline;margin-top:6px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:22px;color:${text};line-height:1;">${s.value.toLocaleString()}</div>
            <div style="display:flex;margin-left:4px;font-family:'NotoSansTC';font-weight:500;font-size:12px;color:${muted};">枚</div>
          </div>
        </div>
      `
    )
    .join("");

  return `
    <div style="display:flex;width:1080px;height:600px;background:${ink};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${accent};padding:32px 40px;box-sizing:border-box;position:relative;">

        <!-- Brand strip (信用卡風) -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;">
          <div style="display:flex;flex-direction:column;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:6px;color:${accent};">SHUSHU CREDIT</div>
            <div style="display:flex;margin-top:4px;font-family:'NotoSansTC';font-weight:900;font-size:36px;color:${text};letter-spacing:2px;">金幣錢包</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:36px;letter-spacing:4px;color:${accent};">★</div>
        </div>

        <!-- Avatar + name -->
        <div style="display:flex;width:100%;align-items:center;margin-top:24px;">
          <div style="display:flex;width:104px;height:104px;border-radius:104px;background:${accent};padding:4px;box-sizing:border-box;align-items:center;justify-content:center;">
            ${avatarHtml}
          </div>
          <div style="display:flex;flex-direction:column;margin-left:22px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:30px;color:${text};line-height:1.1;letter-spacing:1px;">${username}</div>
            <div style="display:flex;margin-top:6px;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">CARD HOLDER</div>
          </div>
        </div>

        <!-- Big balance -->
        <div style="display:flex;flex-direction:column;width:100%;margin-top:28px;background:${cardLight};border:2px solid ${accent};padding:22px 28px;box-sizing:border-box;">
          <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:5px;color:${accent};">CURRENT BALANCE</div>
          <div style="display:flex;align-items:baseline;margin-top:6px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:78px;color:${accent};line-height:1;letter-spacing:-1px;">${totalCoins.toLocaleString()}</div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:900;font-size:22px;color:${text};">金幣</div>
          </div>
          <div style="display:flex;width:100%;justify-content:space-between;margin-top:10px;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;color:${muted};">歷史總獲得 ${lifetimeCoins.toLocaleString()}</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;color:${muted};">今日已賺 +${earnedToday.toLocaleString()}</div>
          </div>
        </div>

        <!-- Sources grid -->
        <div style="display:flex;width:100%;margin-top:18px;gap:10px;">
          ${sourceRows}
        </div>

        <!-- Footer -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;padding-top:18px;border-top:1px dashed ${accentDark};">
          <div style="display:flex;font-family:'SpaceMono';font-size:11px;letter-spacing:3px;color:${muted};">VALID THRU NEXT FOREVER</div>
          <div style="display:flex;font-family:'SpaceMono';font-size:11px;letter-spacing:2px;color:${muted};">ISSUED ${issuedAt}</div>
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
    data.avatarUrl || "",
    data.totalCoins ?? "",
    data.lifetimeCoins ?? "",
    data.earnedToday ?? "",
    (data.sources || []).map((s) => `${s.label}:${s.value}`).join(","),
    data.issuedAt || "",
  ].join("|");
}

async function generateWalletCard(data) {
  const cacheKey = buildCacheKey(data);
  const cached = walletCardCache.get(cacheKey);
  if (cached) return cached;

  const fonts = await loadFonts();
  const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);
  const markup = buildMarkup({ ...data, avatarDataUri });
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
