// 用 Claude API 分析推薦訊息。出錯或缺 key 時 fall back 到啟發式分類。
// 模型：claude-haiku-4-5（快、便宜，適合 one-shot 分類）。

const axios = require("axios");
const {
  normalizeAnalysis,
  heuristicAnalyze,
  stripUrls,
  isGenericPlaceName,
} = require("../utils/recommendationParser");
const { formatMapContextForPrompt } = require("./mapMetaFetcher");

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const API_TIMEOUT_MS = 15_000;
// 遇到 Overloaded / 5xx 時的重試設定
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const RETRY_DELAYS_MS = [1500, 4000, 9000];

// 簡單失敗保險絲：連續失敗 → 暫停一段時間避免無謂呼叫
const CB_FAIL_WINDOW_MS = 5 * 60 * 1000;
const CB_FAIL_THRESHOLD = 3;
const CB_PAUSE_MS = 15 * 60 * 1000;
const circuit = { failures: [], pausedUntil: 0 };

function circuitOpen() {
  return Date.now() < circuit.pausedUntil;
}

function recordFailure() {
  const now = Date.now();
  circuit.failures = circuit.failures.filter(
    (t) => now - t <= CB_FAIL_WINDOW_MS,
  );
  circuit.failures.push(now);
  if (circuit.failures.length >= CB_FAIL_THRESHOLD) {
    circuit.pausedUntil = now + CB_PAUSE_MS;
    circuit.failures = [];
    console.log(
      `[Recommendation] AI 連續失敗，暫停 ${CB_PAUSE_MS / 60000} 分鐘`.yellow,
    );
  }
}

function recordSuccess() {
  circuit.failures = [];
}

const SYSTEM_PROMPT = `你是一個專門處理推薦資訊的分類助手。
使用者會給你一段來自 Discord 推薦頻道的訊息（通常是餐廳、酒吧、飲料、娛樂場所的介紹），
請從訊息中抽取關鍵資訊並輸出嚴格的 JSON。

請使用繁體中文。請只輸出 JSON，不要加任何說明文字或 markdown code fence。

JSON 結構（所有欄位都必須有，沒資訊就用 null 或空陣列）：
{
  "name": "店名或場所名稱（簡短，不含描述）",
  "type": "restaurant | bar | beverage | entertainment | other",
  "cuisine": "若 type=restaurant，標出料理類型（如：日式、韓式、火鍋、燒肉、義式、咖啡廳、早午餐、甜點、小吃...）；否則 null",
  "mealTimes": ["breakfast" | "lunch" | "dinner" | "snack"]，依文字判斷適合的時段；不確定填空陣列,
  "area": "地區（縣市或行政區或商圈，例：台北市信義區、東區、西門町）",
  "summary": "用一句話總結這個推薦的特色（30 字內）",
  "keywords": ["搜尋關鍵字陣列，包含店名、菜色、特色、地區別名等，每個 token 不要太長"]
}

type 規則：
- 餐廳（吃正餐、料理為主）→ restaurant
- 酒吧/居酒屋/餐酒館/精釀店 → bar
- 手搖飲料、咖啡廳（不主打餐點）、茶飲店 → beverage
- KTV、桌遊、電影院、密室、樂園、SPA、夜店 → entertainment
- 無法判斷 → other

name 規則：
- 必須是實際店名或場所名稱
- 不可以使用 "Google Maps"、"Google 地圖"、"地圖"、"連結" 等通用詞當作 name
- 如果使用者訊息與 Google Maps 連結資訊都沒有明確店名，name 填 null`;

async function callClaudeOnce(apiKey, userContent) {
  return axios.post(
    ANTHROPIC_API,
    {
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    },
    {
      timeout: API_TIMEOUT_MS,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    },
  );
}

async function classifyWithClaude(text, mapContext = "") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (circuitOpen()) return null;

  const userContent = mapContext
    ? `請分析以下推薦訊息並輸出 JSON：\n\n[使用者訊息]\n${text}\n\n[Google Maps 連結資訊（如與訊息衝突，以訊息為主）]\n${mapContext}`
    : `請分析以下推薦訊息並輸出 JSON：\n\n${text}`;

  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await callClaudeOnce(apiKey, userContent);
      const blocks = response.data?.content || [];
      const textBlock = blocks.find((b) => b.type === "text");
      if (!textBlock?.text) {
        recordFailure();
        return null;
      }
      const parsed = parseJsonLoose(textBlock.text);
      if (!parsed) {
        recordFailure();
        return null;
      }
      recordSuccess();
      return parsed;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const isRetryable =
        RETRY_STATUSES.has(status) ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNABORTED";

      if (!isRetryable || attempt >= RETRY_DELAYS_MS.length) break;

      const delay = RETRY_DELAYS_MS[attempt];
      const reason =
        error.response?.data?.error?.message || error.code || error.message;
      console.log(
        `[Recommendation] Claude API ${status || error.code} 重試中（${attempt + 1}/${RETRY_DELAYS_MS.length}，${delay}ms）：${reason}`
          .yellow,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  recordFailure();
  const detail =
    lastError?.response?.data?.error?.message ||
    lastError?.message ||
    lastError;
  console.log(`[Recommendation] Claude API 失敗：${detail}`.yellow);
  return null;
}

// 抽出第一個 JSON 物件（防 Claude 不小心多輸出文字或 code fence）
function parseJsonLoose(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // 去掉可能的 ```json ... ``` 包裝
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // 取最外層大括號區段
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 對外介面：給訊息純文字 → 回傳 normalized 分析結果
// options.mapMetas: 由 mapMetaFetcher 抓回來的陣列，會以額外 context 餵給 AI
async function analyzeRecommendation(rawText, options = {}) {
  const text = stripUrls(rawText || "").trim();
  const mapContext = formatMapContextForPrompt(options.mapMetas);

  if (!text && !mapContext) return heuristicAnalyze("");

  const aiResult = await classifyWithClaude(text, mapContext);
  if (aiResult) {
    return normalizeAnalysis(aiResult, text);
  }

  // Fallback：啟發式無法命中時，把 mapMeta 的 placeName 拿來補 name
  const fallback = heuristicAnalyze(text);
  const firstMeta = Array.isArray(options.mapMetas) ? options.mapMetas[0] : null;
  if (
    firstMeta?.placeName &&
    !isGenericPlaceName(firstMeta.placeName) &&
    !fallback.name
  ) {
    fallback.name = firstMeta.placeName.slice(0, 50);
  }
  return fallback;
}

module.exports = {
  analyzeRecommendation,
  // 測試/手動 reanalyze 用
  classifyWithClaude,
};
