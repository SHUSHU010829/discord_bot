// 統一 config 入口：合併拆檔後的 JSON 區塊。
// 各區塊請改 src/config/<區塊>.json，merge conflict 才會局部化。
const server = require("./server.json");
const voting = require("./voting.json");
const suggestion = require("./suggestion.json");
const level = require("./level.json");
const steamDeals = require("./steamDeals.json");
const freeGames = require("./freeGames.json");
const twitch = require("./twitch.json");
const casino = require("./casino.json");
const shop = require("./shop.json");

module.exports = {
  ...server,
  voting: voting,
  ...suggestion,
  ...level,
  ...steamDeals,
  ...freeGames,
  ...twitch,
  ...casino,
  ...shop,
};
