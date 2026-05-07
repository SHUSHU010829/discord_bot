const axios = require("axios");
const { DateTime } = require("luxon");

const DEFAULT_BASE_URL = "https://www.gamerpower.com/api/giveaways";

// GamerPower 的 platform 參數值
const PLATFORM_QUERY = {
  epic: "epic-games-store",
  steam: "steam",
  android: "android",
  ios: "ios",
};

// 只取出對 Discord 推播有意義的類型;DLC 也保留 (在 embed 端會顯示為「限免 DLC」)
const ALLOWED_TYPES = new Set(["game", "dlc", "early access"]);

const isDlcType = (type) => /dlc|loot/i.test(type || "");
const isAlwaysFreeWorth = (worth) =>
  !worth || /n\/a|free/i.test(String(worth));

// open_giveaway 會給原始 store URL，open_giveaway_url 是 GamerPower 站內轉跳
const pickStoreUrl = (item) => item.open_giveaway || item.open_giveaway_url || null;

// Steam URL: https://store.steampowered.com/app/220/
const extractAppId = (link) => {
  if (!link) return null;
  const m = String(link).match(/\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
};

// GamerPower end_date 多為 "yyyy-MM-dd HH:mm:ss" (UTC)，部分是 "N/A"
const parseEndTime = (raw) => {
  if (!raw || /n\/a/i.test(String(raw))) return null;
  const dt = DateTime.fromFormat(String(raw).trim(), "yyyy-MM-dd HH:mm:ss", {
    zone: "utc",
  });
  return dt.isValid ? Math.trunc(dt.toSeconds()) : null;
};

const parseOriginalPrice = (worth) => {
  if (isAlwaysFreeWorth(worth)) return null;
  return String(worth).trim();
};

// type === "DLC" / "Early Access" / "Game" / "Beta" / "Other"
// duration 沿用 LootScraper 的命名讓 embed 對照表能直接命中
const deriveDuration = (item) => {
  if (parseEndTime(item.end_date)) return null; // 有結束日 → 限時免費
  if (/beta/i.test(item.type || "")) return "Temporary";
  return "Always Free";
};

const mapItem = (item, platform) => {
  const link = pickStoreUrl(item);
  return {
    giveawayId: item.id != null ? String(item.id) : null,
    platform,
    appid: platform === "steam" ? extractAppId(link) : null,
    name: (item.title || "").trim() || null,
    image: item.image || item.thumbnail || null,
    score: null, // GamerPower 沒提供評分,後續若是 Steam 會從 appdetails 補
    originalPrice: parseOriginalPrice(item.worth),
    chineseSupport: null,
    endTime: parseEndTime(item.end_date),
    isDlc: isDlcType(item.type),
    parentName: null,
    description: item.description || null,
    link,
    duration: deriveDuration(item),
  };
};

/**
 * 從 GamerPower API 抓單一平台 (epic | steam) 的限免清單。
 *
 * @param {object} opts
 * @param {string} opts.platform  必填,'epic' | 'steam'
 * @param {string} [opts.apiUrl]  覆寫 base URL
 * @param {function} [opts.fetcher]  axios.get 介面 (測試用)
 */
const fetchFreeGamesList = async ({
  platform,
  apiUrl,
  fetcher = axios.get,
}) => {
  const platformParam = PLATFORM_QUERY[platform];
  if (!platformParam) {
    throw new Error(`[freeGames-gp] unsupported platform: ${platform}`);
  }

  const baseUrl = apiUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}?platform=${platformParam}&type=game`;

  const response = await fetcher(url, {
    timeout: 15000,
    headers: {
      Accept: "application/json",
      "User-Agent": "discord-bot-freeGames/1.0",
    },
    validateStatus: (s) => s < 500,
  });

  // GamerPower 在沒命中時會回 204 或 {status: 0}，把它當成空陣列處理
  if (response.status === 204) return [];
  const data = response.data;
  if (!Array.isArray(data)) {
    if (data && data.status === 0) return [];
    throw new Error(
      `[freeGames-gp] unexpected response from ${url}: ${typeof data}`
    );
  }

  return data
    .filter((it) => {
      if (!it || it.status && !/active/i.test(it.status)) return false;
      const type = String(it.type || "").toLowerCase();
      return ALLOWED_TYPES.has(type);
    })
    .map((it) => mapItem(it, platform))
    .filter((it) => it.giveawayId && it.name);
};

module.exports = { fetchFreeGamesList, DEFAULT_BASE_URL };
