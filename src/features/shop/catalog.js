const { shop } = require("../../config");

function getCatalog() {
  return Array.isArray(shop?.items) ? shop.items : [];
}

function getItem(itemId) {
  return getCatalog().find((i) => i.id === itemId) || null;
}

function getCategories() {
  const set = new Set();
  for (const item of getCatalog()) {
    if (item.category) set.add(item.category);
  }
  return Array.from(set);
}

function getTheme(themeId) {
  const themes = shop?.themes || {};
  return themes[themeId] || themes.default || null;
}

module.exports = { getCatalog, getItem, getCategories, getTheme };
