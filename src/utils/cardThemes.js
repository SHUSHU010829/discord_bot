// 等級卡主題：accent color override（不指定就用 tier.color）
const CARD_THEMES = {
  default: { label: "預設（依 tier 顏色）", accent: null },
  pink:    { label: "粉紅",                accent: "#E97AAB" },
  blue:    { label: "海藍",                accent: "#5E8AD8" },
  gold:    { label: "金箔",                accent: "#D4A437" },
  mint:    { label: "薄荷",                accent: "#7BC9A6" },
  mono:    { label: "墨黑",                accent: "#2A2420" },
};

const THEME_KEYS = Object.keys(CARD_THEMES);

function resolveAccent(themeKey, fallback) {
  const t = CARD_THEMES[themeKey];
  if (!t || !t.accent) return fallback;
  return t.accent;
}

module.exports = { CARD_THEMES, THEME_KEYS, resolveAccent };
