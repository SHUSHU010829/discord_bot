const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const { DateTime } = require("luxon");
const axios = require("axios");

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

function buildCalendar(today, timezone, checkinDates) {
  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const d = DateTime.fromISO(today, { zone: timezone })
      .minus({ days: i })
      .toISODate();
    cells.push({
      date: d,
      checked: checkinDates.has(d),
      isToday: i === 0,
    });
  }
  return cells;
}

function buildMarkup(data) {
  const {
    username,
    avatarDataUri,
    streak,
    totalCheckins,
    xpEarned,
    multiplier,
    afterLevel,
    today,
    timezone,
    checkinDates,
  } = data;

  const ink = "#2A2420";
  const card = "#F4ECD8";
  const accent = "#C9302C";
  const muted = "#A89270";
  const subtle = "#E8DFC8";
  const teal = "#3D6F6A";

  const cells = buildCalendar(today, timezone, checkinDates);

  // 6 列 × 5 欄 = 30 格
  const calendarRows = [];
  for (let r = 0; r < 6; r++) {
    calendarRows.push(cells.slice(r * 5, r * 5 + 5));
  }

  const renderCell = (cell) => {
    if (cell.isToday) {
      return `<div style="display:flex;width:80px;height:80px;background:${accent};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:28px;justify-content:center;align-items:center;border:3px solid ${ink};">✓</div>`;
    }
    if (cell.checked) {
      return `<div style="display:flex;width:80px;height:80px;background:${teal};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:24px;justify-content:center;align-items:center;">✓</div>`;
    }
    return `<div style="display:flex;width:80px;height:80px;background:${subtle};border:1px solid ${muted};"></div>`;
  };

  const calendarHtml = calendarRows
    .map(
      (row) => `
        <div style="display:flex;gap:10px;">
          ${row.map(renderCell).join("")}
        </div>`
    )
    .join("");

  const avatarHtml = avatarDataUri
    ? `<img src="${avatarDataUri}" width="80" height="80" style="object-fit:cover;border:3px solid ${ink};" />`
    : `<div style="display:flex;width:80px;height:80px;background:${ink};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:38px;justify-content:center;align-items:center;border:3px solid ${ink};">${(username || "?").charAt(0).toUpperCase()}</div>`;

  const bonusHtml =
    multiplier > 1
      ? `<div style="display:flex;margin-top:10px;padding:6px 18px;background:${accent};color:${card};font-family:'NotoSansTC';font-weight:900;font-size:18px;letter-spacing:6px;">CHAIN BONUS x${multiplier}</div>`
      : `<div style="display:flex;margin-top:10px;font-family:'SpaceMono';font-size:14px;letter-spacing:4px;color:${muted};">CONNECT 7 DAYS · UNLOCK x1.5</div>`;

  return `
    <div style="display:flex;width:1080px;height:900px;background:${card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:36px 44px;box-sizing:border-box;">

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <div style="display:flex;align-items:center;">
            ${avatarHtml}
            <div style="display:flex;flex-direction:column;margin-left:18px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:30px;color:${ink};line-height:1.1;">${username}</div>
              <div style="display:flex;margin-top:6px;font-family:'SpaceMono';font-size:14px;letter-spacing:2px;color:${muted};">DAILY CHECK-IN</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:3px;color:${muted};">DATE</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:24px;color:${ink};">${today}</div>
          </div>
        </div>

        <!-- Streak block -->
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;margin-top:24px;padding:32px 0;background:${ink};color:${card};">
          <div style="display:flex;font-family:'SpaceMono';font-size:16px;letter-spacing:10px;color:${muted};">— STREAK —</div>
          <div style="display:flex;align-items:baseline;margin-top:8px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:140px;color:${accent};line-height:1;">${streak}</div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:500;font-size:36px;color:${card};">天</div>
          </div>
          ${bonusHtml}
        </div>

        <!-- Calendar -->
        <div style="display:flex;flex-direction:column;width:100%;margin-top:24px;align-items:center;">
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:6px;color:${muted};">— LAST 30 DAYS —</div>
          <div style="display:flex;flex-direction:column;margin-top:14px;gap:8px;">
            ${calendarHtml}
          </div>
        </div>

        <!-- Footer summary -->
        <div style="display:flex;width:100%;margin-top:auto;padding-top:18px;border-top:1px dashed ${muted};justify-content:space-between;align-items:center;">
          <div style="display:flex;flex-direction:column;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">XP EARNED</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:32px;color:${accent};">+${xpEarned}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">TOTAL CHECK-INS</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:32px;color:${ink};">${totalCheckins}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">CURRENT LEVEL</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:32px;color:${ink};">${afterLevel ?? "-"}</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

async function generateCheckinCard(data) {
  const fonts = await loadFonts();
  const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);
  const markup = buildMarkup({ ...data, avatarDataUri });
  const element = html(markup);

  const svg = await satori(element, {
    width: 1080,
    height: 900,
    fonts,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
  })
    .render()
    .asPng();

  return Buffer.from(png);
}

module.exports = generateCheckinCard;
