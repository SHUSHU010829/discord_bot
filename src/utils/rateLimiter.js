// 純 in-memory 速率限制器：用 (userId, key) 滑動視窗，外加每使用者全域配額。
//
// 設計重點：
// - Discord 互動 token 只有 3 秒，所以這裡的判斷必須快、不能 await DB。
// - 用 Map<key, number[]> 存時間戳，每次存取時順便剪掉過期的。
// - 沒有 Redis：單機重啟即清空；多副本部署需另外換實作。
//
// 用法：
//   const { consume } = require("../utils/rateLimiter");
//   const r = consume(userId, "cmd:blackjack", { windowMs: 1000, max: 1 });
//   if (!r.allowed) interaction.reply({ content: `⏳ 請稍候 ${Math.ceil(r.retryAfterMs/1000)} 秒` });

const buckets = new Map();

const DEFAULT_GLOBAL = { windowMs: 10_000, max: 8 };
const DEFAULT_PER_KEY = { windowMs: 3_000, max: 1 };

function bucketKey(userId, key) {
  return `${userId}::${key}`;
}

function pruneAndPush(arr, now, windowMs, push) {
  const cutoff = now - windowMs;
  while (arr.length && arr[0] <= cutoff) arr.shift();
  if (push) arr.push(now);
}

function checkBucket(mapKey, now, windowMs, max, dryRun) {
  let arr = buckets.get(mapKey);
  if (!arr) {
    arr = [];
    buckets.set(mapKey, arr);
  }
  pruneAndPush(arr, now, windowMs, false);
  if (arr.length >= max) {
    const retryAfterMs = Math.max(1, arr[0] + windowMs - now);
    return { allowed: false, retryAfterMs };
  }
  if (!dryRun) arr.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

function consume(userId, key, opts = {}) {
  if (!userId || !key) return { allowed: true, retryAfterMs: 0 };
  const now = Date.now();
  const perKey = { ...DEFAULT_PER_KEY, ...opts };
  const global = opts.global === false ? null : { ...DEFAULT_GLOBAL, ...(opts.global || {}) };

  if (global) {
    const g = checkBucket(bucketKey(userId, "__global__"), now, global.windowMs, global.max, true);
    if (!g.allowed) return g;
  }
  const k = checkBucket(bucketKey(userId, key), now, perKey.windowMs, perKey.max, false);
  if (!k.allowed) return k;
  if (global) {
    checkBucket(bucketKey(userId, "__global__"), now, global.windowMs, global.max, false);
  }
  return { allowed: true, retryAfterMs: 0 };
}

function reset() {
  buckets.clear();
}

function size() {
  return buckets.size;
}

module.exports = { consume, reset, size };
