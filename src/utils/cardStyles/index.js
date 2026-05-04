// 風格註冊表：把每個風格 module 的 wallet/level markup builder 集中起來。
// 加新風格的三步驟：1) 新增 .js 檔；2) 在這裡 require 進來；3) 在 STYLES 加 key。

const temple = require("./temple");
const glitch = require("./glitch");
const vaporwave = require("./vaporwave");
const nordic = require("./nordic");
const leather = require("./leather");
const hologram = require("./hologram");
const graffiti = require("./graffiti");

const STYLES = {
  temple,
  glitch,
  vaporwave,
  nordic,
  leather,
  hologram,
  graffiti,
};

const DEFAULT_STYLE = "temple";

function resolveStyleId(maybeStyleId) {
  if (!maybeStyleId) return DEFAULT_STYLE;
  const key = String(maybeStyleId).toLowerCase();
  return STYLES[key] ? key : DEFAULT_STYLE;
}

function getStyle(maybeStyleId) {
  const id = resolveStyleId(maybeStyleId);
  return { id, mod: STYLES[id] };
}

function listStyles() {
  return Object.keys(STYLES);
}

module.exports = { STYLES, DEFAULT_STYLE, getStyle, resolveStyleId, listStyles };
