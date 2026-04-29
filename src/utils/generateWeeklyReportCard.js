const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");

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
  const { topXp, totalXp, levelUpCount, checkinCount, weekRangeLabel } = data;

  const card = "#F4ECD8";
  const ink = "#2A2420";
  const accent = "#C9302C";
  const muted = "#A89270";
  const subtle = "#E8DFC8";

  const rows = topXp.length
    ? topXp
        .map((t, i) => {
          const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
          const name = t.username || `<@${t.userId}>`;
          return `
            <div style="display:flex;width:100%;justify-content:space-between;align-items:center;padding:10px 14px;background:${subtle};border:2px solid ${ink};box-sizing:border-box;margin-bottom:8px;">
              <div style="display:flex;align-items:center;font-family:'NotoSansTC';font-weight:900;font-size:24px;color:${ink};">
                <div style="display:flex;width:42px;">${medal}</div>
                <div style="display:flex;">${name}</div>
              </div>
              <div style="display:flex;font-family:'SpaceMono';font-size:22px;color:${accent};">+${t.xp.toLocaleString()} XP</div>
            </div>
          `;
        })
        .join("")
    : `<div style="display:flex;font-family:'NotoSansTC';font-size:20px;color:${muted};">本週沒有人累積 XP</div>`;

  return `
    <div style="display:flex;width:1080px;height:1350px;background:${card};padding:40px;box-sizing:border-box;font-family:'NotoSansTC';flex-direction:column;">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${card};border:3px solid ${ink};padding:36px 40px;box-sizing:border-box;">

        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:6px;color:${muted};">WEEKLY LEVEL REPORT</div>
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${ink};margin-top:8px;line-height:1;">📈 本週等級週報</div>
          <div style="display:flex;font-family:'SpaceMono';font-size:16px;color:${muted};margin-top:10px;">${weekRangeLabel}</div>
        </div>

        <div style="display:flex;width:100%;margin-top:28px;gap:14px;">
          <div style="display:flex;flex:1;flex-direction:column;background:${subtle};border:2px solid ${ink};padding:16px 20px;box-sizing:border-box;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">TOTAL XP</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:34px;color:${ink};line-height:1;margin-top:6px;">${totalXp.toLocaleString()}</div>
          </div>
          <div style="display:flex;flex:1;flex-direction:column;background:${subtle};border:2px solid ${ink};padding:16px 20px;box-sizing:border-box;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">LEVEL UPS</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:34px;color:${accent};line-height:1;margin-top:6px;">${levelUpCount}</div>
          </div>
          <div style="display:flex;flex:1;flex-direction:column;background:${subtle};border:2px solid ${ink};padding:16px 20px;box-sizing:border-box;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${muted};">CHECK-INS</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:34px;color:${ink};line-height:1;margin-top:6px;">${checkinCount}</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;width:100%;margin-top:28px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:28px;color:${ink};margin-bottom:14px;">🏆 本週 XP TOP 10</div>
          <div style="display:flex;flex-direction:column;width:100%;">
            ${rows}
          </div>
        </div>

      </div>
    </div>
  `;
}

module.exports = async function generateWeeklyReportCard(data) {
  const fonts = await loadFonts();
  const markup = buildMarkup(data);
  const element = html(markup);

  const svg = await satori(element, {
    width: 1080,
    height: 1350,
    fonts,
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
  })
    .render()
    .asPng();

  return Buffer.from(png);
};
