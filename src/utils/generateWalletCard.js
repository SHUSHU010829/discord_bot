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
    tier = "standard",
  } = data;

  const avatarSize = 48;
  const avatarHtml = avatarDataUri
    ? `<img src="${avatarDataUri}" style="display:flex;width:${avatarSize}px;height:${avatarSize}px;border-radius:${avatarSize}px;object-fit:cover;" />`
    : `<div style="display:flex;width:${avatarSize}px;height:${avatarSize}px;border-radius:${avatarSize}px;background:#FFFFFF;color:#1A55C2;font-family:'NotoSansTC';font-weight:900;font-size:24px;justify-content:center;align-items:center;">${(username || "?").charAt(0).toUpperCase()}</div>`;

  return `
    <div style="display:flex;width:1080px;height:680px;background:#11151C;padding:40px;box-sizing:border-box;align-items:center;justify-content:center;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:1000px;height:600px;border-radius:36px;background:linear-gradient(135deg,#2D7BE8 0%,#1A55C2 55%,#0F3F9C 100%);padding:44px 52px;box-sizing:border-box;position:relative;overflow:hidden;">

        <!-- 亮面光暈（右上） -->
        <div style="display:flex;position:absolute;top:-260px;right:-160px;width:820px;height:820px;border-radius:820px;background:linear-gradient(225deg,rgba(255,255,255,0.28) 0%,rgba(255,255,255,0.10) 35%,rgba(255,255,255,0) 65%);"></div>
        <!-- 底部第二道淡光暈 -->
        <div style="display:flex;position:absolute;bottom:-300px;left:-180px;width:700px;height:700px;border-radius:700px;background:radial-gradient(closest-side,rgba(255,255,255,0.10),rgba(255,255,255,0));"></div>

        <!-- 頂列：品牌 logo + tier -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:64px;color:#FFFFFF;letter-spacing:-2px;line-height:1;">shushu.</div>
          <div style="display:flex;margin-top:18px;font-family:'NotoSansTC';font-weight:500;font-size:24px;color:#FFFFFF;letter-spacing:1px;">${tier}</div>
        </div>

        <!-- 三行幣值（中間黃色強調） -->
        <div style="display:flex;flex-direction:column;margin-top:42px;">
          <div style="display:flex;align-items:center;font-family:'NotoSansTC';font-weight:700;font-size:34px;color:#FFFFFF;">
            <div style="display:flex;font-size:32px;line-height:1;">💰</div>
            <div style="display:flex;margin-left:14px;">${totalCoins.toLocaleString()} Credits</div>
          </div>
          <div style="display:flex;align-items:center;margin-top:16px;font-family:'NotoSansTC';font-weight:700;font-size:34px;color:#FFD93D;">
            <div style="display:flex;font-size:32px;line-height:1;">🪙</div>
            <div style="display:flex;margin-left:14px;">+${earnedToday.toLocaleString()} Today</div>
          </div>
          <div style="display:flex;align-items:center;margin-top:16px;font-family:'NotoSansTC';font-weight:700;font-size:34px;color:#FFFFFF;">
            <div style="display:flex;font-size:32px;line-height:1;">💬</div>
            <div style="display:flex;margin-left:14px;">${lifetimeCoins.toLocaleString()} Lifetime</div>
          </div>
        </div>

        <!-- 晶片（右側，主體區下半） -->
        <div style="display:flex;flex-direction:column;position:absolute;top:248px;right:64px;width:124px;height:98px;border-radius:14px;background:linear-gradient(135deg,#F8F1D8 0%,#D9C68A 60%,#B89A4A 100%);padding:10px 12px;box-sizing:border-box;justify-content:space-between;">
          <div style="display:flex;width:100%;height:6px;background:rgba(0,0,0,0.18);border-radius:4px;"></div>
          <div style="display:flex;width:100%;height:6px;background:rgba(0,0,0,0.18);border-radius:4px;"></div>
          <div style="display:flex;width:100%;height:6px;background:rgba(0,0,0,0.18);border-radius:4px;"></div>
          <div style="display:flex;width:100%;height:6px;background:rgba(0,0,0,0.18);border-radius:4px;"></div>
          <div style="display:flex;width:100%;height:6px;background:rgba(0,0,0,0.18);border-radius:4px;"></div>
        </div>

        <!-- 底列：頭像 + 使用者名稱（左）・四個白點（右） -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:54px;height:54px;border-radius:54px;background:#FFFFFF;align-items:center;justify-content:center;padding:3px;box-sizing:border-box;">
              ${avatarHtml}
            </div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:700;font-size:24px;color:#FFFFFF;letter-spacing:0.5px;">${username}</div>
          </div>
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:12px;height:12px;border-radius:12px;background:#FFFFFF;"></div>
            <div style="display:flex;width:12px;height:12px;border-radius:12px;background:#FFFFFF;margin-left:16px;"></div>
            <div style="display:flex;width:12px;height:12px;border-radius:12px;background:#FFFFFF;margin-left:16px;"></div>
            <div style="display:flex;width:12px;height:12px;border-radius:12px;background:#FFFFFF;margin-left:16px;"></div>
          </div>
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
    data.tier || "",
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
  walletCardCache.set(cacheKey, buf);
  return buf;
}

module.exports = generateWalletCard;
