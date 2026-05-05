// 經典紅（免費預設）：米黃紙 + 朱紅 + 墨褐 + Mono 卡號感
// 使用者沒裝備任何商店風格時的 fallback。視覺上有意保留原本的舒舒卡風格。

const {
  fmtNumber,
  xpProgress,
  avatarFallbackChar,
  htmlEscape,
  safeUsername,
} = require("./_shared");

const COLORS = {
  card: "#F4ECD8",
  ink: "#2A2420",
  muted: "#A89270",
  accent: "#C73E2E",
  subtle: "#E8DFC8",
};

function wallet(data) {
  const safeName = safeUsername(data.username, 14);
  const displayName = safeName.toUpperCase();
  const logoChar = avatarFallbackChar(safeName);
  const handle = `@${displayName}`;
  const cardNoStr = String(data.cardNo ?? "0000").padStart(4, "0");
  const tier = String(data.tier || "standard").toUpperCase();

  return `
    <div style="display:flex;width:1080px;height:600px;background:${COLORS.card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${COLORS.card};border:3px solid ${COLORS.ink};padding:36px 44px;box-sizing:border-box;">

        <!-- Header：logo 方塊 + 使用者名 + tier，右上 CARD NO. -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:84px;height:84px;background:${COLORS.accent};border:3px solid ${COLORS.ink};box-sizing:border-box;align-items:center;justify-content:center;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${COLORS.card};line-height:1;">${htmlEscape(logoChar)}</div>
            </div>
            <div style="display:flex;flex-direction:column;margin-left:24px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:54px;color:${COLORS.ink};line-height:1;letter-spacing:4px;padding-right:4px;">${htmlEscape(displayName)}</div>
              <div style="display:flex;align-self:flex-start;margin-top:10px;padding:6px 16px;background:${COLORS.ink};font-family:'NotoSansTC';font-weight:500;font-size:16px;color:${COLORS.card};letter-spacing:5px;padding-right:21px;">${htmlEscape(tier)}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${COLORS.muted};padding-right:3px;">CARD NO.</div>
            <div style="display:flex;margin-top:6px;font-family:'SpaceMono';font-size:26px;color:${COLORS.ink};letter-spacing:3px;padding-right:3px;">${cardNoStr}</div>
          </div>
        </div>

        <!-- BALANCE 標籤 + 點點分隔線 -->
        <div style="display:flex;width:100%;align-items:center;margin-top:36px;">
          <div style="display:flex;font-family:'SpaceMono';font-size:14px;letter-spacing:6px;color:${COLORS.muted};padding-right:6px;">— BALANCE —</div>
          <div style="display:flex;flex:1;height:0;border-top:2px dashed ${COLORS.muted};margin-left:18px;"></div>
        </div>

        <!-- 大數字 + CREDITS -->
        <div style="display:flex;align-items:flex-end;width:100%;margin-top:14px;">
          <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:170px;color:${COLORS.accent};line-height:1;letter-spacing:-4px;">${fmtNumber(data.totalCoins || 0)}</div>
          <div style="display:flex;margin-left:24px;margin-bottom:24px;font-family:'NotoSansTC';font-weight:500;font-size:36px;color:${COLORS.ink};letter-spacing:8px;padding-right:8px;">CREDITS</div>
        </div>

        <!-- 下方點點分隔線 -->
        <div style="display:flex;width:100%;height:0;margin-top:18px;border-top:2px dashed ${COLORS.muted};"></div>

        <!-- Footer：LIFETIME（左）・@USERNAME（右） -->
        <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:auto;">
          <div style="display:flex;align-items:baseline;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:5px;color:${COLORS.muted};padding-right:5px;">LIFETIME</div>
            <div style="display:flex;margin-left:14px;font-family:'NotoSansTC';font-weight:900;font-size:26px;color:${COLORS.ink};">${fmtNumber(data.lifetimeCoins || 0)}</div>
          </div>
          <div style="display:flex;font-family:'SpaceMono';font-size:15px;letter-spacing:6px;color:${COLORS.ink};padding-right:6px;">${htmlEscape(handle)}</div>
        </div>

      </div>
    </div>
  `;
}

function level(data) {
  const username = data.username || "?";
  const tier = data.tier || { color: COLORS.accent, emoji: "", label: "—" };
  const accent = data.cardAccent || tier.color || COLORS.accent;
  const progressPct = Math.max(0, Math.min(100, (data.progress || 0) * 100));

  const avatarSize = 110;
  const avatarHtml = data.avatarDataUri
    ? `<img src="${data.avatarDataUri}" style="display:flex;width:${avatarSize}px;height:${avatarSize}px;object-fit:cover;" />`
    : `<div style="display:flex;width:${avatarSize}px;height:${avatarSize}px;background:${COLORS.ink};color:${COLORS.card};font-family:'NotoSansTC';font-weight:900;font-size:54px;justify-content:center;align-items:center;">${avatarFallbackChar(username)}</div>`;

  const badgesArr = (data.badges || []).slice(0, 5);
  const badgePadding = Math.max(0, 5 - badgesArr.length);
  const badgeHtml = badgesArr
    .map(
      (b) => `
        <div style="display:flex;width:60px;height:60px;background:${COLORS.subtle};border:2px solid ${COLORS.ink};box-sizing:border-box;justify-content:center;align-items:center;font-family:'NotoSansTC';font-weight:500;font-size:28px;line-height:1;">${htmlEscape(b.emoji || "🏅")}</div>
      `,
    )
    .join("");
  const badgePlaceholderHtml = Array(badgePadding)
    .fill(0)
    .map(
      () => `
        <div style="display:flex;width:60px;height:60px;background:transparent;border:2px dashed ${COLORS.muted};box-sizing:border-box;opacity:0.5;"></div>
      `,
    )
    .join("");

  function fmtVoice(min) {
    if (!min || min <= 0) return "0m";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 1000) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${h.toLocaleString()}h`;
  }

  const stats = [
    { label: "MESSAGES", value: fmtNumber(data.totalMessages || 0), unit: "" },
    { label: "VOICE", value: fmtVoice(data.totalVoiceMinutes), unit: "" },
    { label: "STREAK", value: String(data.streak || 0), unit: "天" },
    { label: "FREEZE", value: String(data.streakFreezes ?? 0), unit: "🛡️" },
    { label: "TOTAL XP", value: fmtNumber(data.totalXp || 0), unit: "" },
  ];
  const statsHtml = stats
    .map(
      (s) => `
        <div style="display:flex;flex:1;flex-direction:column;background:${COLORS.subtle};border:2px solid ${COLORS.ink};padding:10px 14px;box-sizing:border-box;">
          <div style="display:flex;font-family:'SpaceMono';font-size:11px;letter-spacing:3px;color:${COLORS.muted};">${s.label}</div>
          <div style="display:flex;align-items:baseline;margin-top:4px;">
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:26px;color:${COLORS.ink};line-height:1;">${htmlEscape(s.value)}</div>
            ${s.unit ? `<div style="display:flex;margin-left:4px;font-family:'NotoSansTC';font-weight:500;font-size:14px;color:${COLORS.muted};">${htmlEscape(s.unit)}</div>` : ""}
          </div>
        </div>
      `,
    )
    .join("");

  return `
    <div style="display:flex;width:1080px;height:600px;background:${COLORS.card};padding:24px;box-sizing:border-box;font-family:'NotoSansTC';">
      <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${COLORS.card};border:3px solid ${COLORS.ink};padding:28px 36px;box-sizing:border-box;">

        <!-- Header -->
        <div style="display:flex;width:100%;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:120px;height:120px;background:${accent};padding:5px;box-sizing:border-box;align-items:center;justify-content:center;">
              ${avatarHtml}
            </div>
            <div style="display:flex;flex-direction:column;margin-left:22px;max-width:480px;">
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:34px;color:${COLORS.ink};line-height:1.1;letter-spacing:1px;">${htmlEscape(username)}</div>
              <div style="display:flex;margin-top:8px;padding:5px 12px;background:${COLORS.ink};color:${COLORS.card};font-family:'NotoSansTC';font-weight:500;font-size:16px;letter-spacing:3px;align-self:flex-start;">${htmlEscape(data.title || "—")}</div>
              <div style="display:flex;margin-top:8px;font-family:'SpaceMono';font-size:13px;letter-spacing:2px;color:${COLORS.muted};">RANK #${data.rank || 0} / ${data.totalUsers || 0}</div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:6px;color:${COLORS.muted};">LEVEL</div>
            <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:96px;color:${accent};line-height:1;letter-spacing:-2px;margin-top:-2px;">${data.level || 0}</div>
            <div style="display:flex;align-items:center;margin-top:2px;padding:4px 14px;background:${accent};">
              ${tier.emoji ? `<div style="display:flex;font-family:'NotoSansTC';font-weight:500;font-size:15px;line-height:1;margin-right:5px;">${htmlEscape(tier.emoji)}</div>` : ""}
              <div style="display:flex;font-family:'NotoSansTC';font-weight:900;font-size:15px;color:${COLORS.card};letter-spacing:5px;">${htmlEscape(tier.label || "")}</div>
            </div>
          </div>
        </div>

        <!-- XP progress -->
        <div style="display:flex;flex-direction:column;width:100%;margin-top:22px;">
          <div style="display:flex;width:100%;justify-content:space-between;align-items:flex-end;margin-bottom:6px;">
            <div style="display:flex;font-family:'SpaceMono';font-size:13px;letter-spacing:3px;color:${COLORS.muted};">EXP PROGRESS</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:16px;color:${COLORS.ink};">
              ${fmtNumber(data.currentLevelXp || 0)} / ${fmtNumber(data.xpToNextLevel || 0)} XP
            </div>
          </div>
          <div style="display:flex;width:100%;height:26px;background:${COLORS.subtle};border:2px solid ${COLORS.ink};box-sizing:border-box;">
            <div style="display:flex;width:${progressPct}%;height:100%;background:${accent};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;width:100%;margin-top:4px;">
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${COLORS.muted};">Lv.${data.level || 0}</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${COLORS.muted};">總 ${fmtNumber(data.totalXp || 0)} XP</div>
            <div style="display:flex;font-family:'SpaceMono';font-size:12px;color:${COLORS.muted};">Lv.${(data.level || 0) + 1}</div>
          </div>
        </div>

        <!-- Stats grid -->
        <div style="display:flex;width:100%;margin-top:18px;gap:12px;">
          ${statsHtml}
        </div>

        <!-- Badge row -->
        <div style="display:flex;width:100%;margin-top:auto;align-items:center;justify-content:space-between;">
          <div style="display:flex;font-family:'SpaceMono';font-size:12px;letter-spacing:3px;color:${COLORS.muted};">BADGES ${badgesArr.length}/5</div>
          <div style="display:flex;gap:8px;">
            ${badgeHtml}${badgePlaceholderHtml}
          </div>
        </div>

      </div>
    </div>
  `;
}

module.exports = { wallet, level, COLORS };
