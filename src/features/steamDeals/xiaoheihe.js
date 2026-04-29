require("colors");
const axios = require("axios");
const { createHash } = require("node:crypto");

// Signing logic ported from RSSHub (lib/routes/xiaoheihe/util.ts),
// originally from https://github.com/huandu/heybox-url
const dict = "JKMNPQRTX1234OABCDFG56789H";

const md5 = (str) => {
  const h = createHash("md5");
  h.update(str);
  return h.digest();
};

const convertByte = (v) => (v & 0x80 ? 0xff & ((v << 1) ^ 0x1b) : v << 1);
const c3 = (v) => convertByte(v) ^ v;
const c2 = (v) => c3(convertByte(v));
const c1 = (v) => c2(c3(convertByte(v)));
const c0 = (v) => c1(v) ^ c2(v) ^ c3(v);

const checksum = (data) =>
  [
    c0(data[0]) ^ c1(data[1]) ^ c2(data[2]) ^ c3(data[3]),
    c3(data[0]) ^ c0(data[1]) ^ c1(data[2]) ^ c2(data[3]),
    c2(data[0]) ^ c3(data[1]) ^ c0(data[2]) ^ c1(data[3]),
    c1(data[0]) ^ c2(data[1]) ^ c3(data[2]) ^ c0(data[3]),
  ].reduce((prev, value) => prev + value) % 100;

const sign = (url, timestamp = 0, nonce = "") => {
  timestamp ||= Math.trunc(Date.now() / 1000);
  nonce ||= md5(Math.random().toString()).toString("hex").toUpperCase();

  const { pathname } = new URL(url);
  const ts = timestamp + 1;
  const u = "/" + pathname.split("/").filter(Boolean).join("/") + "/";

  let key = "";
  const nonceHash = md5((nonce + dict).replace(/\D/g, ""))
    .toString("hex")
    .toLowerCase();
  const rnd = md5(ts + u + nonceHash)
    .toString("hex")
    .replace(/\D/g, "")
    .slice(0, 9)
    .padEnd(9, "0");

  for (let c = +rnd, i = 0; i < 5; i++) {
    const idx = c % dict.length;
    c = Math.trunc(c / dict.length);
    key += dict[idx];
  }

  const suffix = checksum(
    [...key].slice(-4).map((ch) => ch.codePointAt(0))
  )
    .toString()
    .padStart(2, "0");

  const query = `hkey=${key}${suffix}&_time=${timestamp}&nonce=${nonce}`;
  const urlObj = new URL(url);
  urlObj.search += urlObj.search ? "&" + query : query;
  return urlObj.toString();
};

const BASE_QUERY = {
  filter_head: "pc",
  offset: "0",
  limit: "30",
  os_type: "web",
  app: "heybox",
  client_type: "mobile",
  version: "999.0.3",
  x_client_type: "web",
  x_os_type: "Mac",
  x_app: "heybox",
  heybox_id: "-1",
  include_filter: "-1",
};

/**
 * Fetch the PC discount list from xiaoheihe.
 * Returns an array of raw game records (not yet filtered).
 *
 * Each item is expected to contain at minimum:
 *   - steam_appid (string|number)
 *   - is_lowest (0|1)
 *   - new_lowest (0|1)
 *   - score (number, 小黑盒評分, may be missing)
 *   - end_time (timestamp seconds, may be missing)
 */
const fetchDiscountList = async ({
  limit = 30,
  fetcher = axios.get,
} = {}) => {
  const baseUrl = "https://api.xiaoheihe.cn/game/get_game_list_v3/";
  const query = new URLSearchParams({ ...BASE_QUERY, limit: String(limit) });
  const signedUrl = sign(`${baseUrl}?${query.toString()}`);

  const response = await fetcher(signedUrl, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const games = response?.data?.result?.games;
  if (!Array.isArray(games)) {
    throw new Error(
      `[xiaoheihe] Unexpected response shape: status=${response?.data?.status} msg=${response?.data?.msg}`
    );
  }

  return games
    .map((g) => {
      const appid = g.steam_appid ?? g.appid;
      if (!appid) return null;
      return {
        appid: Number(appid),
        isLowest: Number(g.is_lowest || 0) === 1,
        newLowest: Number(g.new_lowest || 0) === 1,
        score: typeof g.score === "number" ? g.score : null,
        endTime: typeof g.end_time === "number" ? g.end_time : null,
        rawName: g.name || null,
      };
    })
    .filter(Boolean);
};

module.exports = { sign, fetchDiscountList };
