// 簡易 in-memory 失敗計數器：用 source 標籤分群，方便 /diagnostics 端點觀察
// 哪個服務在最近一段時間內噴了多少錯誤。
//
// 用法：
//   const { trackError, trackSuccess } = require("../utils/errorTracker");
//   trackError("vote-button", err, { userId });
//
// 注意：純 in-memory，重啟即清空；要長期觀察請改接 Prometheus。

const WINDOW_MS = 5 * 60 * 1000; // 最近 5 分鐘

const stats = new Map();

function bucket(source) {
  let s = stats.get(source);
  if (!s) {
    s = {
      total: 0,
      successTotal: 0,
      recent: [], // {ts, message}
      successRecent: [], // ts
      lastError: null,
      lastErrorAt: null,
    };
    stats.set(source, s);
  }
  return s;
}

function prune(arr, now) {
  while (arr.length && now - (arr[0].ts ?? arr[0]) > WINDOW_MS) arr.shift();
}

function trackError(source, err, meta) {
  if (!source) return;
  const now = Date.now();
  const s = bucket(source);
  const message = err && err.message ? err.message : String(err);
  s.total += 1;
  s.recent.push({ ts: now, message });
  prune(s.recent, now);
  s.lastError = { message, stack: err && err.stack, meta: meta || null };
  s.lastErrorAt = now;
}

function trackSuccess(source) {
  if (!source) return;
  const now = Date.now();
  const s = bucket(source);
  s.successTotal += 1;
  s.successRecent.push(now);
  prune(s.successRecent, now);
}

function snapshot() {
  const now = Date.now();
  const out = {};
  for (const [source, s] of stats) {
    prune(s.recent, now);
    prune(s.successRecent, now);
    out[source] = {
      errorsTotal: s.total,
      errorsLastWindow: s.recent.length,
      successTotal: s.successTotal,
      successLastWindow: s.successRecent.length,
      lastErrorAt: s.lastErrorAt,
      lastError: s.lastError
        ? { message: s.lastError.message, meta: s.lastError.meta }
        : null,
    };
  }
  return { windowMs: WINDOW_MS, sources: out };
}

function reset() {
  stats.clear();
}

module.exports = { trackError, trackSuccess, snapshot, reset };
