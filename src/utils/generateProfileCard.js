const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const axios = require("axios");

const { loadAdditionalAsset } = require("./satoriEmoji");

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

function formatVoiceTime(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 100) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${h}h`;
}

function buildMarkup(data) {
  const {
    username,
    avatarDataUri,
    level,
    currentLevelXp,
    xpToNextLevel,
    progress,
    totalXp,
    rank,
    totalUsers,
    tier,
    title,
    streak,
    totalMessages,
    totalVoiceMinutes,
    badges,
  } = data;

  const accent = tier.color;
  const ink = "#2A2420";
  const card = "#F4ECD8";
  const muted = "#A89270";
  const subtle = "#E8DFC8";

  const progressPct = Math.max(0, Math.min(100, progress * 100));

  const avatarSize = 110;
  const avatarHtml = avatarDataUri
    ? `<img src="${avatarDataUri}" style="display:flex;width:${avatarSize}px;height:${avatarSize}px;object-fit:cover;" />`
    : `<div style="display:flex;width:${avatarSize}px;height:${avatarSize}px;background:${ink};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:54px;justify-content:center;align-items:center;">${(username || "?").charAt(0).toUpperCase()}</div>`;

  const badgesArr = (badges || []).slice(0, 5);
  const badgePadding = Math.max(0, 5 - badgesArr.length);

  const badgeHtml = badgesArr
    .map(
      (b) => `
        <div style="display:flex;width:60px;height:60px;background:${subtle};border:2px solid ${ink};box-sizing:border-box;justify-content:center;align-items:center;font-family:'NotoSansTC';font-weight:900;font-size:28px;line-height:1;">${b.emoji || "🏅"}</div>
      `
    )
    .join("");
  const badgePlaceholderHtml = Array(badgePadding)
    .fill(0)
    .map(
      () => `
        <div style="display:flex;width:60px;height:60px;background:transparent;border:2px dashed ${muted};box-sizing:border-box;opacity:0.5;"></div>
      `
    )
    .join("");

  const stats = [
    { label: "MESSAGES", value: totalMessages.toLocaleString(), unit: "" },
    { label: "VOICE", value: formatVoiceTime(totalVoiceMinutes), unit: "" },
    { label: "STREAK", value: String(streak), unit: "天" },
    { label: "TOTAL XP", value: totalXp.toLocaleString(), unit: "" },
  ];

  const statsHtml = stats
    .map(
      (s) => `
        <div style="display:flex;flex:1;flex-direction:column;background:${subtle};border:2px solid ${ink};padding:10px 14px;box-sizing:border-box;">
          <div style="display:flex;font-family:'SpaceMono';font-size:11px;letter-spacing:3px;color:${muted};">${s.label}</div>
          <div style="display:flex;align-items:baseline;margin-top:4px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:26px;color:${ink};line-height:1;">${s.value}</div>
            ${s.unit ? `<div style="display:flex;margin-left:4px;font-family:'NotoSansTC';font-weight:500;font-size:14px;color:${muted};">${s.unit}</div>` : ""}
          </div>
        </div>
      `
    )
    .join("");

  return `
    <div style="display:flex;width:1080px;height:600px;background:${card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:28px 36px;box-sizing:border-box;">

        <!-- A. Header: avatar + name vs tier number -->
        <div style="display:flex;width:100%;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;">
            <!-- Avatar with tier ring -->
            <div style="display:flex;width:120px;height:120px;background:${accent};padding:5px;box-sizing:border-box;align-items:center;justify-content:center;">
              ${avatarHtml}
            </div>

            <div style="display:flex;flex-direction:column;margin-left:22px;max-width:480px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:34px;color:${ink};line-height:1.1;letter-spacing:1px;">${username}</div>
              <div style="display:flex;margin-top:8px;padding:5px 12px;background:${ink};color:${card};font-family:'NotoSansTC';font-weight:500;font-size:16px;letter-spacing:3px;align-self:flex-start;">${title}</div>
              <div style="display:flex;margin-top:8px;font-family:'SpaceMono';font-size:13px;letter-spacing:2px;color:${muted};">RANK #${rank} / ${totalUsers}</div>
            </div>
          </div>

          <!-- Tier big number -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:6px;color:${muted};">LEVEL</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:96px;color:${accent};line-height:1;letter-spacing:-2px;margin-top:-2px;">${level}</div>
            <div style="display:flex;margin-top:2px;padding:4px 14px;background:${accent};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:15px;letter-spacing:5px;">${tier.emoji} ${tier.label}</div>
          </div>
        </div>

        <!-- B. XP progress -->
        <div style="display:flex;flex-direction:column;width:100%;margin-top:22px;">
          <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-end;margin-bottom:6px;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${muted};">EXP PROGRESS</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:16px;color:${ink};">
              ${currentLevelXp.toLocaleString()} / ${xpToNextLevel.toLocaleString()} XP
            </div>
          </div>
          <div style="display:flex;width:100%;height:26px;background:${subtle};border:2px solid ${ink};box-sizing:border-box;">
            <div style="display:flex;width:${progressPct}%;height:100%;background:${accent};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;width:100%;margin-top:4px;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${muted};">Lv.${level}</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${muted};">總 ${totalXp.toLocaleString()} XP</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${muted};">Lv.${level + 1}</div>
          </div>
        </div>

        <!-- C. Stats grid -->
        <div style="display:flex;width:100%;margin-top:18px;gap:12px;">
          ${statsHtml}
        </div>

        <!-- D. Badge row -->
        <div style="display:flex;width:100%;margin-top:auto;align-items:center;justify-content:space-between;">
          <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">BADGES ${badgesArr.length}/5</div>
          <div style="display:flex;gap:8px;">
            ${badgeHtml}${badgePlaceholderHtml}
          </div>
        </div>

      </div>
    </div>
  `;
}

async function generateProfileCard(data) {
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

  return Buffer.from(png);
}

module.exports = generateProfileCard;
