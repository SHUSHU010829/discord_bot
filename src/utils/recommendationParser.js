// 解析推薦訊息：抓 Google Maps 連結、清出純文字、跑啟發式分類。
// AI 分類在 services/recommendationClassifier.js 進行；本檔只做純文字處理，
// 用作 AI 缺席時的 fallback，以及 AI 結果的 schema 驗證。

const {
  TYPES,
  CUISINES,
  CUISINE_KEYWORDS,
  BAR_KEYWORDS,
  CAFE_KEYWORDS,
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

// 過濾 AI 偶爾會把 og:title 直接抄成店名的通用值
function isGenericPlaceName(name) {
  if (!name) return false;
  const t = String(name).trim().toLowerCase();
  if (!t) return false;
  if (/^google\s*(maps?|地圖|地图|マップ|지도)(\s|$|[-—–|·:：])/.test(t)) return true;
  if (/^(地圖|地图|連結|连结|maps?|map|link)$/.test(t)) return true;
  // Discord 自訂表情碼：<a:name:id> 或 <:name:id>，去掉角括號後是 a:xxx:digits
  if (/^a?:[\w]+:\d{6,}$/.test(t)) return true;
  // Discord mention 殘留：@everyone / @here / @user / role id
  if (/^@(everyone|here)$/.test(t)) return true;
  // 純數字 ID（Discord ID 通常 17~20 位）
  if (/^\d{6,}$/.test(t)) return true;
  return false;
}

// 看起來像地址而不是店名（台灣常見格式）：郵遞區號開頭、或縣市+區+路號
function looksLikeAddress(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (!t) return false;
  // 郵遞區號開頭：3~5 位數字 + 台/臺/縣/市/區
  if (/^\d{3,5}\s*[台臺][一-鿿]/.test(t)) return true;
  if (/^\d{3,5}\s*[一-鿿]+[市縣]/.test(t)) return true;
  // 縣市 + 區 + 路/街/巷/弄/號
  if (/[一-鿿]+[市縣].*[一-鿿]+[區鄉鎮].*[一-鿿]+(路|街|巷|弄|大道)/.test(t)) {
    return true;
  }
  // 結尾有 "號" 之類的地址元素
  if (/\d+\s*號(\s*\d+\s*樓)?/.test(t) && /[市縣區鄉鎮路街]/.test(t)) {
    return true;
  }
  return false;
}

// Discord 訊息常見的非語意 token（mention / channel / role / emoji 等）
function stripDiscordTokens(text) {
  if (!text) return "";
  return text
    .replace(/<@[!&]?\d+>/g, " ") // <@123>, <@!123>, <@&123>
    .replace(/<#\d+>/g, " ") // <#channel-id>
    .replace(/<a?:\w+:\d+>/g, " ") // <:name:id>, <a:name:id>
    .replace(/<t:\d+(:[a-zA-Z])?>/g, " ") // <t:timestamp:R>
    .replace(/@(everyone|here)\b/g, " ");
}

function stripUrls(text) {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 給 AI / heuristic 用的文字：URL、Discord token 都剝掉
function cleanMessageText(text) {
  if (!text) return "";
  return stripDiscordTokens(stripUrls(text))
    .replace(/\s+/g, " ")
    .trim();
}

function detectTypeHeuristic(text) {
  if (!text) return "other";
  const lower = text.toLowerCase();
  const hit = (list) => list.some((kw) => lower.includes(kw.toLowerCase()));
  if (hit(BAR_KEYWORDS)) return "bar";
  if (hit(ENTERTAINMENT_KEYWORDS)) return "entertainment";
  if (hit(CAFE_KEYWORDS)) return "cafe";
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
  const cleaned = cleanMessageText(text);
  if (!cleaned) return null;
  const firstLine = cleaned.split(/[\r\n。！!？?…]/)[0].trim();
  // 去頭尾雜訊（emoji、標點）
  const compact = firstLine.replace(/^[\s\W_]+|[\s\W_]+$/g, "").trim();
  if (!compact) return null;
  // 看起來像地址或通用值就不要回
  if (looksLikeAddress(compact) || isGenericPlaceName(compact)) return null;
  // 長度上限 30，太長就截
  return compact.length > 30 ? compact.slice(0, 30) : compact;
}

function extractKeywords(text) {
  if (!text) return [];
  const cleaned = cleanMessageText(text).toLowerCase();
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
  const cleanText = cleanMessageText(text);
  const type = detectTypeHeuristic(cleanText);
  return {
    type,
    cuisine: type === "restaurant" ? detectCuisineHeuristic(cleanText) : null,
    mealTimes:
      type === "restaurant" || type === "beverage" || type === "cafe"
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

  const rawName =
    typeof safe.name === "string" && safe.name.trim()
      ? safe.name.trim().slice(0, 50)
      : null;
  const nameIsBad =
    !rawName || isGenericPlaceName(rawName) || looksLikeAddress(rawName);
  const name = nameIsBad ? fallback.name : rawName;

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

// 推薦訊息門檻判斷：必須有 Google Maps 連結。文字長度（去掉 URL 與
// Discord 表情/mention 之後）會列入考量，但即使無文字，只要有 maps
// 連結還是視為推薦（之後可以靠 mapMetas 補資訊）。
function looksLikeRecommendation(text, minTextLength = 0) {
  const urls = extractMapUrls(text);
  if (urls.length === 0) return false;
  if (minTextLength <= 0) return true;
  const clean = cleanMessageText(text);
  return clean.length >= minTextLength;
}

module.exports = {
  extractMapUrls,
  stripUrls,
  stripDiscordTokens,
  cleanMessageText,
  heuristicAnalyze,
  normalizeAnalysis,
  looksLikeRecommendation,
  extractKeywords,
  isGenericPlaceName,
  looksLikeAddress,
};

module.exports.CUISINES = CUISINES;
