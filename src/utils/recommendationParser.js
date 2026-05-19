// 解析推薦訊息：抓 Google Maps 連結、清出純文字、跑啟發式分類。
// AI 分類在 services/recommendationClassifier.js 進行；本檔只做純文字處理，
// 用作 AI 缺席時的 fallback，以及 AI 結果的 schema 驗證。

const {
  TYPES,
  CUISINES,
  CUISINE_KEYWORDS,
  BAR_KEYWORDS,
  BEVERAGE_KEYWORDS,
  ENTERTAINMENT_KEYWORDS,
  MEAL_TIME_KEYWORDS,
  AREA_REGIONS,
  AREA_LANDMARKS,
} = require("../constants/recommendationCategories");

const GMAPS_PATTERNS = [
  /https?:\/\/maps\.app\.goo\.gl\/[^\s<>"')\]]+/gi,
  /https?:\/\/goo\.gl\/maps\/[^\s<>"')\]]+/gi,
  /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps[^\s<>"')\]]*/gi,
  /https?:\/\/maps\.google\.[a-z.]+\/[^\s<>"')\]]*/gi,
  /https?:\/\/g\.co\/kgs\/[^\s<>"')\]]+/gi,
];

function extractMapUrls(text) {
  if (!text) return [];
  const found = new Set();
  for (const re of GMAPS_PATTERNS) {
    const matches = text.match(re);
    if (matches) matches.forEach((u) => found.add(u.replace(/[).,!?。，！？]+$/, "")));
  }
  return Array.from(found);
}

function stripUrls(text) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTypeHeuristic(text) {
  if (!text) return "other";
  const lower = text.toLowerCase();
  const hit = (list) => list.some((kw) => lower.includes(kw.toLowerCase()));
  if (hit(BAR_KEYWORDS)) return "bar";
  if (hit(ENTERTAINMENT_KEYWORDS)) return "entertainment";
  if (hit(BEVERAGE_KEYWORDS)) return "beverage";
  // 餐廳：靠 cuisine 關鍵字或泛用「餐廳/食/吃」字眼判斷
  for (const [, kws] of CUISINE_KEYWORDS) {
    if (hit(kws)) return "restaurant";
  }
  if (/餐廳|餐館|食堂|館子|吃|宵夜|早午餐|brunch|restaurant/i.test(text)) {
    return "restaurant";
  }
  return "other";
}

function detectCuisineHeuristic(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [cuisine, kws] of CUISINE_KEYWORDS) {
    if (kws.some((kw) => lower.includes(kw.toLowerCase()))) return cuisine;
  }
  return null;
}

function detectMealTimesHeuristic(text) {
  if (!text) return [];
  const hits = new Set();
  for (const [mealTime, kws] of MEAL_TIME_KEYWORDS) {
    if (kws.some((kw) => text.includes(kw))) hits.add(mealTime);
  }
  return Array.from(hits);
}

function detectAreaHeuristic(text) {
  if (!text) return null;
  // 1) 行政區（XX區 / XX鄉 / XX鎮）
  const districtMatch = text.match(
    /([一-龥]{1,4}[區鄉鎮市])/,
  );
  if (districtMatch) return districtMatch[1];
  // 2) 縣市
  for (const region of AREA_REGIONS) {
    if (text.includes(region)) return region;
  }
  // 3) 知名地標 / 商圈
  for (const lm of AREA_LANDMARKS) {
    if (text.includes(lm)) return lm;
  }
  return null;
}

// 從訊息文字中粗抽店名候選：第一行或第一個非 emoji 字串
function detectNameHeuristic(text) {
  if (!text) return null;
  const cleaned = stripUrls(text);
  if (!cleaned) return null;
  const firstLine = cleaned.split(/[\r\n。！!？?…]/)[0].trim();
  // 去頭尾雜訊（emoji、標點）
  const compact = firstLine.replace(/^[\s\W_]+|[\s\W_]+$/g, "").trim();
  if (!compact) return null;
  // 長度上限 30，太長就截
  return compact.length > 30 ? compact.slice(0, 30) : compact;
}

function extractKeywords(text) {
  if (!text) return [];
  const cleaned = stripUrls(text).toLowerCase();
  const tokens = new Set();
  // 中文連續 2~6 字 token（粗切，作為 search 用）
  const chineseMatches = cleaned.match(/[一-龥]{2,6}/g) || [];
  chineseMatches.forEach((t) => tokens.add(t));
  // 英文單字
  const englishMatches = cleaned.match(/[a-z][a-z0-9]{1,}/gi) || [];
  englishMatches.forEach((t) => tokens.add(t.toLowerCase()));
  return Array.from(tokens).slice(0, 50);
}

// 啟發式整包分析（AI 失敗時用）
function heuristicAnalyze(text) {
  const cleanText = stripUrls(text);
  const type = detectTypeHeuristic(cleanText);
  return {
    type,
    cuisine: type === "restaurant" ? detectCuisineHeuristic(cleanText) : null,
    mealTimes:
      type === "restaurant" || type === "beverage"
        ? detectMealTimesHeuristic(cleanText)
        : [],
    area: detectAreaHeuristic(cleanText),
    name: detectNameHeuristic(cleanText),
    summary: cleanText.length > 80 ? cleanText.slice(0, 80) + "…" : cleanText,
    keywords: extractKeywords(cleanText),
  };
}

// 把 AI 回傳的物件規整成內部 schema，並過濾不合法值
function normalizeAnalysis(analysis, fallbackText) {
  const safe = analysis && typeof analysis === "object" ? analysis : {};
  const fallback = heuristicAnalyze(fallbackText || "");

  const type = TYPES[safe.type] ? safe.type : fallback.type;

  let cuisine = null;
  if (typeof safe.cuisine === "string" && safe.cuisine.trim()) {
    const v = safe.cuisine.trim();
    // 自由文字也接受，但長度上限 12 字
    cuisine = v.length > 12 ? v.slice(0, 12) : v;
  } else if (type === "restaurant") {
    cuisine = fallback.cuisine;
  }

  const allowedMeals = new Set(["breakfast", "lunch", "dinner", "snack"]);
  let mealTimes = [];
  if (Array.isArray(safe.mealTimes)) {
    mealTimes = safe.mealTimes.filter((m) => allowedMeals.has(m));
  }
  if (mealTimes.length === 0) mealTimes = fallback.mealTimes;

  const area =
    typeof safe.area === "string" && safe.area.trim()
      ? safe.area.trim().slice(0, 30)
      : fallback.area;

  const name =
    typeof safe.name === "string" && safe.name.trim()
      ? safe.name.trim().slice(0, 50)
      : fallback.name;

  const summary =
    typeof safe.summary === "string" && safe.summary.trim()
      ? safe.summary.trim().slice(0, 200)
      : fallback.summary;

  let keywords = [];
  if (Array.isArray(safe.keywords)) {
    keywords = safe.keywords
      .filter((k) => typeof k === "string" && k.trim())
      .map((k) => k.trim().toLowerCase().slice(0, 30));
  }
  if (keywords.length === 0) keywords = fallback.keywords;
  // 合併 fallback 中文 token，增加搜尋命中率
  const mergedKeywords = new Set([...keywords, ...fallback.keywords]);
  keywords = Array.from(mergedKeywords).slice(0, 50);

  return { type, cuisine, mealTimes, area, name, summary, keywords };
}

// 推薦訊息門檻判斷：必須有 Google Maps 連結 + 一段文字
function looksLikeRecommendation(text, minTextLength = 2) {
  const urls = extractMapUrls(text);
  if (urls.length === 0) return false;
  const clean = stripUrls(text);
  return clean.length >= minTextLength;
}

module.exports = {
  extractMapUrls,
  stripUrls,
  heuristicAnalyze,
  normalizeAnalysis,
  looksLikeRecommendation,
  extractKeywords,
};

module.exports.CUISINES = CUISINES;
