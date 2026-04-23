const FORTUNE_THEMES = {
  大吉: {
    bg: "#C9302C",
    card: "#F4ECD8",
    accent: "#C9302C",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
  中吉: {
    bg: "#D94C2A",
    card: "#F4ECD8",
    accent: "#D94C2A",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
  小吉: {
    bg: "#C65D3A",
    card: "#F4ECD8",
    accent: "#C65D3A",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
  沒想法: {
    bg: "#8A8270",
    card: "#F4ECD8",
    accent: "#5C5648",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
  凶: {
    bg: "#5C2A2A",
    card: "#F4ECD8",
    accent: "#5C2A2A",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
  大凶: {
    bg: "#2A2420",
    card: "#E8DFC8",
    accent: "#2A2420",
    ink: "#2A2420",
    muted: "#A89270",
    teal: "#3D6F6A",
  },
};

module.exports = (fortuneText) =>
  FORTUNE_THEMES[fortuneText] || FORTUNE_THEMES["沒想法"];
