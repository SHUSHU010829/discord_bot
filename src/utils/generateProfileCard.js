// 等級卡入口：跟錢包卡共用同一套風格系統，依 styleId 分派到 cardStyles 模組。
// avatarUrl 會自動 fetch 後轉 base64 data URI 注入給風格元件使用。

const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const axios = require("axios");

const { loadAdditionalAsset } = require("./satoriEmoji");
const LruCache = require("./lruCache");
const { getStyle, resolveStyleId } = require("./cardStyles");

const profileCardCache = new LruCache(256);

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
    { name: "SpaceMono", data: mono, weight: 700, style: "normal" },
    { name: "NotoSansTC", data: tcMedium, weight: 500, style: "normal" },
    { name: "NotoSansTC", data: tcBlack, weight: 900, style: "normal" },
    { name: "NotoSansJP", data: jpMedium, weight: 500, style: "normal" },
    { name: "NotoSansJP", data: jpBlack, weight: 900, style: "normal" },
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

function buildCacheKey(data, styleId) {
  const badges = Array.isArray(data.badges)
    ? data.badges
        .map((b) => (b && typeof b === "object" ? b.id || b.key || JSON.stringify(b) : b))
        .join(",")
    : "";
  return [
    styleId,
    data.userId || "",
    data.guildId || "",
    data.username || "",
    data.avatarUrl || "",
    data.level ?? "",
    data.totalXp ?? "",
    data.streak ?? "",
    data.streakFreezes ?? "",
    data.totalMessages ?? "",
    data.totalVoiceMinutes ?? "",
    data.rank ?? "",
    data.totalUsers ?? "",
    badges,
    data.title || "",
  ].join("|");
}

async function generateProfileCard(data) {
  const requested = data.styleId || data.theme?.styleId || data.theme?.themeId;
  const styleId = resolveStyleId(requested);

  const cacheKey = buildCacheKey(data, styleId);
  const cached = profileCardCache.get(cacheKey);
  if (cached) return cached;

  const fonts = await loadFonts();
  const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);

  const { mod } = getStyle(styleId);
  const markup = mod.level({ ...data, avatarDataUri });
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
  profileCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateProfileCard;
