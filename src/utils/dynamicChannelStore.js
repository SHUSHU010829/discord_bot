// Persistent store for dynamic voice channel ownership.
// Survives redeploys via the data volume so we can reconcile orphan empty
// channels and keep owner permissions consistent after restarts.

const fs = require("fs");
const { getDataFile } = require("./dataPaths");
require("colors");

const STORE_FILE = getDataFile("dynamic-voice-channels.json");

// In-memory state. Loaded once on first access.
let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
      cache = new Map(Object.entries(raw.channels || {}));
      return cache;
    }
  } catch (error) {
    console.log(`[ERROR] 讀取 dynamic-voice-channels.json 失敗：${error}`.red);
  }
  cache = new Map();
  return cache;
}

function persist() {
  try {
    const data = { channels: Object.fromEntries(load()) };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`[ERROR] 寫入 dynamic-voice-channels.json 失敗：${error}`.red);
  }
}

function get(channelId) {
  return load().get(channelId);
}

function has(channelId) {
  return load().has(channelId);
}

function set(channelId, info) {
  load().set(channelId, info);
  persist();
}

function remove(channelId) {
  const removed = load().delete(channelId);
  if (removed) persist();
  return removed;
}

function entries() {
  return load().entries();
}

module.exports = { get, has, set, remove, entries };
