const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const axios = require("axios");

const { getTier } = require("./levelTier");
const { loadAdditionalAsset } = require("./satoriEmoji");
const LruCache = require("./lruCache");

const levelUpCardCache = new LruCache(256);

const FONT_DIR = path.join(__dirname, "../../fonts");
let fontsCache = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [tcBlack, tcMedium, jpBlack, jpMedium, mono] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Black.woff")),
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Medium.woff")),
    fs.readFile(path.join(FONT_DIR, "NotoSansJP-Black.otf")),
    fs.readFile(path.join(FONT_DIR, "NotoSansJP-Medium.otf")),
    fs.readFile(path.join(FONT_DIR, "SpaceMono-Regular.woff")),
  ]);
  fontsCache = [
    { name: "SpaceMono", data: mono, weight: 400, style: "normal" },
    { name: "NotoSansTC", data: tcMedium, weight: 500, style: "normal" },
    { name: "NotoSansTC", data: tcBlack, weight: 900, style: "normal" },
    { name: "NotoSansJP", data: jpMedium, weight: 500, style: "normal" },
    { name: "NotoSansJP", data: jpBlack, weight: 900, style: "normal" },
  ];
  return fontsCache;
}

function detectImageMime(buffer, contentType) {
  if (buffer && buffer.length >= 4) {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
  }
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("image/png")) return "image/png";
    if (ct.includes("image/jpeg") || ct.includes("image/jpg")) {
      return "image/jpeg";
    }
  }
  return null;
}

async function fetchAvatarDataUri(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    const buffer = Buffer.from(res.data);
    const mime = detectImageMime(buffer, res.headers?.["content-type"]);
    if (!mime) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (e) {
    return null;
  }
}

function buildMarkup({ username, avatarDataUri, beforeLevel, afterLevel, totalXp }) {
  const tier = getTier(afterLevel);
  const ink = "#2A2420";
  const card = "#F4ECD8";
  const muted = "#A89270";
  const accent = tier.color;

  const avatarHtml = avatarDataUri
    ? `<img src="${avatarDataUri}" style="display:flex;width:130px;height:130px;object-fit:cover;" />`
    : `<div style="display:flex;width:130px;height:130px;background:${ink};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:64px;justify-content:center;align-items:center;">${(username || "?").charAt(0).toUpperCase()}</div>`;

  return `
    <div style="display:flex;width:800px;height:400px;background:${card};padding:18px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:30px 36px;box-sizing:border-box;align-items:center;">

        <div style="display:flex;width:140px;height:140px;background:${accent};padding:5px;box-sizing:border-box;align-items:center;justify-content:center;">
          ${avatarHtml}
        </div>

        <div style="display:flex;flex-direction:column;flex:1;margin-left:30px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:16px;letter-spacing:8px;color:${muted};">— LEVEL UP —</div>
          <div style="display:flex;margin-top:6px;font-family:'NotoSansTC';font-weight:900;font-size:30px;color:${ink};line-height:1.1;">${username}</div>

          <div style="display:flex;align-items:center;margin-top:14px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:50px;color:${muted};line-height:1;">Lv.${beforeLevel}</div>
            <div style="display:flex;margin:0 18px;font-family:'NotoSansTC';font-weight:900;font-size:36px;color:${ink};">→</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:80px;color:${accent};line-height:1;">Lv.${afterLevel}</div>
          </div>

          <div style="display:flex;margin-top:16px;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;padding:6px 14px;background:${accent};">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:16px;line-height:1;margin-right:6px;">${tier.emoji}</div>
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:16px;color:${card};letter-spacing:5px;">${tier.label}</div>
            </div>
            <div style="display:flex;font-family:'SpaceMono';font-size:16px;color:${ink};">${totalXp.toLocaleString()} XP</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function buildCacheKey(data) {
  return [
    data.userId || data.username || "",
    data.fromLevel ?? "",
    data.toLevel ?? "",
    data.cardAccent || "",
  ].join("|");
}

async function generateLevelUpCard(data) {
  const cacheKey = buildCacheKey(data);
  const cached = levelUpCardCache.get(cacheKey);
  if (cached) return cached;

  const fonts = await loadFonts();
  const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);
  const markup = buildMarkup({ ...data, avatarDataUri });
  const element = html(markup);

  const svg = await satori(element, {
    width: 800,
    height: 400,
    fonts,
    loadAdditionalAsset,
  });

  // Resvg.render() 是同步且 CPU-bound，在這之前讓 event loop 先排空
  // 等待中的 Discord interaction callback、心跳等等才不會被整個 frame 卡住
  await new Promise((resolve) => setImmediate(resolve));

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 800 },
  })
    .render()
    .asPng();

  const buf = Buffer.from(png);
  levelUpCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateLevelUpCard;
