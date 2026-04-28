const CATEGORIES = {
  breakfast: { label: "早餐", emoji: "🌅" },
  lunch: { label: "午餐", emoji: "🌞" },
  dinner: { label: "晚餐", emoji: "🌙" },
  snack: { label: "宵夜", emoji: "🌃" },
  beverage: { label: "飲料", emoji: "🥤" },
};

const CATEGORY_LABEL = Object.fromEntries(
  Object.entries(CATEGORIES).map(([key, { label }]) => [key, label])
);

const CATEGORY_DISPLAY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([key, { label, emoji }]) => [
    key,
    `${emoji} ${label}`,
  ])
);

const CATEGORY_CHOICES = Object.entries(CATEGORIES).map(
  ([value, { label, emoji }]) => ({
    name: `${emoji} ${label}`,
    value,
  })
);

const CATEGORY_MAP_ZH_TO_KEY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([key, { label }]) => [label, key])
);

module.exports = {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_DISPLAY,
  CATEGORY_CHOICES,
  CATEGORY_MAP_ZH_TO_KEY,
};
