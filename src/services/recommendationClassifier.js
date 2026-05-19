// 用 Claude API 分析推薦訊息。出錯或缺 key 時 fall back 到啟發式分類。
// 模型：claude-haiku-4-5（快、便宜，適合 one-shot 分類）。
//
// - analyzeRecommendation(text, options)：單筆，給訊息進來即時用，重試短一點
// - analyzeRecommendationBatch(items, options)：把多筆塞進同一個 prompt，
//   給 backfill script 用，重試耐心一點

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
const API_TIMEOUT_MS = 30_000;
// 遇到 Overloaded / 5xx 時的重試設定
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const SHORT_RETRY_DELAYS_MS = [1500, 4000, 9000];
const PATIENT_RETRY_DELAYS_MS = [3000, 8000, 20_000, 45_000, 90_000];
const BATCH_TIMEOUT_MS = 60_000;

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

const SCHEMA_DOC = `欄位定義：
- "name": 店名或場所名稱（簡短，不含描述）。不可以使用 "Google Maps"、"Google 地圖"、"地圖"、"連結" 等通用詞；沒明確店名就填 null。
- "type": "restaurant" | "bar" | "beverage" | "entertainment" | "other"
- "cuisine": 若 type=restaurant，標出料理類型（日式、韓式、火鍋、燒肉、義式、咖啡廳、早午餐、甜點、小吃...）；否則 null
- "mealTimes": 陣列，元素為 "breakfast" | "lunch" | "dinner" | "snack"；不確定填空陣列
- "area": 地區（縣市或行政區或商圈，例：台北市信義區、東區、西門町）
- "summary": 用一句話總結這個推薦的特色（30 字內）
- "keywords": 搜尋關鍵字陣列，包含店名、菜色、特色、地區別名等

type 規則：
- 餐廳（吃正餐、料理為主）→ restaurant
- 酒吧/居酒屋/餐酒館/精釀店 → bar
- 手搖飲料、咖啡廳（不主打餐點）、茶飲店 → beverage
- KTV、桌遊、電影院、密室、樂園、SPA、夜店 → entertainment
- 無法判斷 → other`;

const SYSTEM_PROMPT_SINGLE = `你是一個專門處理推薦資訊的分類助手。
使用者會給你一段來自 Discord 推薦頻道的訊息（通常是餐廳、酒吧、飲料、娛樂場所的介紹），
請從訊息中抽取關鍵資訊並輸出嚴格的 JSON。

請使用繁體中文。請只輸出 JSON，不要加任何說明文字或 markdown code fence。

JSON 結構（所有欄位都必須有，沒資訊就用 null 或空陣列）：
{
  "name": "...",
  "type": "...",
  "cuisine": "...",
  "mealTimes": [...],
  "area": "...",
  "summary": "...",
  "keywords": [...]
}

${SCHEMA_DOC}`;

const SYSTEM_PROMPT_BATCH = `你是一個專門處理推薦資訊的分類助手。
使用者會一次給你多則來自 Discord 推薦頻道的訊息，每則有自己的 id。
請對每一則抽取關鍵資訊並輸出嚴格的 JSON。

請使用繁體中文。請只輸出 JSON，不要加任何說明文字或 markdown code fence。

輸出格式（results 長度必須等於輸入筆數，且 id 必須一一對應）：
{
  "results": [
    { "id": "<輸入的 id>", "name": "...", "type": "...", "cuisine": "...", "mealTimes": [...], "area": "...", "summary": "...", "keywords": [...] }
  ]
}

${SCHEMA_DOC}`;

async function postClaude({
  systemPrompt,
  userContent,
  maxTokens = 600,
  timeoutMs = API_TIMEOUT_MS,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: new Error("ANTHROPIC_API_KEY 未設定") };

  try {
    const response = await axios.post(
      ANTHROPIC_API,
      {
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      },
      {
        timeout: timeoutMs,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      },
    );
    const blocks = response.data?.content || [];
    const textBlock = blocks.find((b) => b.type === "text");
    return { text: textBlock?.text || null };
  } catch (error) {
    return { error };
  }
}

async function callWithRetry(callConfig, retryDelays, label = "single") {
  if (circuitOpen()) return null;

  let lastError = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    const { text, error } = await postClaude(callConfig);
    if (!error) {
      if (!text) {
        recordFailure();
        return null;
      }
      recordSuccess();
      return text;
    }
    lastError = error;
    const status = error.response?.status;
    const isRetryable =
      RETRY_STATUSES.has(status) ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED";

    if (!isRetryable || attempt >= retryDelays.length) break;

    const delay = retryDelays[attempt];
    const reason =
      error.response?.data?.error?.message || error.code || error.message;
    console.log(
      `[Recommendation] Claude API ${status || error.code} 重試中（${label} ${attempt + 1}/${retryDelays.length}，${delay}ms）：${reason}`
        .yellow,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  recordFailure();
  const detail =
    lastError?.response?.data?.error?.message ||
    lastError?.message ||
    String(lastError);
  console.log(`[Recommendation] Claude API 失敗（${label}）：${detail}`.yellow);
  return null;
}

// 抽出第一個 JSON 物件（防 Claude 不小心多輸出文字或 code fence）
function parseJsonLoose(raw) {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function classifyWithClaude(text, mapContext = "", options = {}) {
  const userContent = mapContext
    ? `請分析以下推薦訊息並輸出 JSON：\n\n[使用者訊息]\n${text}\n\n[Google Maps 連結資訊（如與訊息衝突，以訊息為主）]\n${mapContext}`
    : `請分析以下推薦訊息並輸出 JSON：\n\n${text}`;

  const raw = await callWithRetry(
    {
      systemPrompt: SYSTEM_PROMPT_SINGLE,
      userContent,
      maxTokens: 600,
      timeoutMs: API_TIMEOUT_MS,
    },
    options.retryDelays || SHORT_RETRY_DELAYS_MS,
    "single",
  );
  return raw ? parseJsonLoose(raw) : null;
}

function buildBatchUserContent(items) {
  const blocks = items.map((it, idx) => {
    const parts = [`[id=${it.id}]`];
    parts.push(`訊息：\n${it.text || "(空)"}`);
    if (it.mapContext) parts.push(`Maps 資訊：\n${it.mapContext}`);
    return parts.join("\n");
  });
  return `請分析以下 ${items.length} 則推薦訊息，並輸出 JSON。\nresults 陣列長度必須等於 ${items.length}，id 必須使用以下提供的字串。\n\n${blocks.join("\n\n---\n\n")}`;
}

async function classifyBatchWithClaude(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const userContent = buildBatchUserContent(items);

  // 每筆預留 ~250 tokens 輸出
  const maxTokens = Math.min(8000, 500 + items.length * 250);

  const raw = await callWithRetry(
    {
      systemPrompt: SYSTEM_PROMPT_BATCH,
      userContent,
      maxTokens,
      timeoutMs: BATCH_TIMEOUT_MS,
    },
    options.retryDelays || PATIENT_RETRY_DELAYS_MS,
    `batch x${items.length}`,
  );
  if (!raw) return null;

  const parsed = parseJsonLoose(raw);
  if (!parsed?.results || !Array.isArray(parsed.results)) return null;

  const map = new Map();
  for (const r of parsed.results) {
    if (r && r.id != null) map.set(String(r.id), r);
  }
  return map;
}

function applyFallbackName(analysis, mapMetas) {
  const firstMeta = Array.isArray(mapMetas) ? mapMetas[0] : null;
  if (
    firstMeta?.placeName &&
    !isGenericPlaceName(firstMeta.placeName) &&
    !analysis.name
  ) {
    analysis.name = firstMeta.placeName.slice(0, 50);
  }
  return analysis;
}

// 對外介面：單筆分析
async function analyzeRecommendation(rawText, options = {}) {
  const text = stripUrls(rawText || "").trim();
  const mapContext = formatMapContextForPrompt(options.mapMetas);

  if (!text && !mapContext) return heuristicAnalyze("");

  const aiResult = await classifyWithClaude(text, mapContext, options);
  if (aiResult) {
    return normalizeAnalysis(aiResult, text);
  }
  return applyFallbackName(heuristicAnalyze(text), options.mapMetas);
}

// 對外介面：批次分析
// items: [{ id, rawText, mapMetas }]
// 回傳 Map<id, normalizedAnalysis>。AI 失敗時各筆 fallback 啟發式。
async function analyzeRecommendationBatch(items, options = {}) {
  const out = new Map();
  if (!Array.isArray(items) || items.length === 0) return out;

  const prepared = items.map((it) => ({
    id: String(it.id),
    text: stripUrls(it.rawText || "").trim(),
    mapContext: formatMapContextForPrompt(it.mapMetas),
    mapMetas: it.mapMetas,
  }));

  const nonEmpty = prepared.filter((p) => p.text || p.mapContext);

  let aiMap = null;
  if (nonEmpty.length > 0) {
    aiMap = await classifyBatchWithClaude(nonEmpty, options);
  }

  for (const p of prepared) {
    const aiResult = aiMap?.get(p.id);
    if (aiResult) {
      out.set(p.id, normalizeAnalysis(aiResult, p.text));
    } else {
      out.set(p.id, applyFallbackName(heuristicAnalyze(p.text), p.mapMetas));
    }
  }
  return out;
}

module.exports = {
  analyzeRecommendation,
  analyzeRecommendationBatch,
  classifyWithClaude,
};
