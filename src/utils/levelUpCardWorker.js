// Worker thread: 跑 satori + resvg 把 markup render 成 PNG buffer。
// 由 generateLevelUpCard 主檔透過 worker_threads 啟動，
// 用 id 對應 request/response，主執行緒不會被 CPU 阻塞。
const { parentPort } = require("worker_threads");
const fs = require("fs/promises");
const path = require("path");
const satori = require("satori").default || require("satori");
const { html } = require("satori-html");
const { Resvg } = require("@resvg/resvg-js");
const { loadAdditionalAsset } = require("./satoriEmoji");

const FONT_DIR = path.join(__dirname, "../../fonts");
let fontsCache = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [tcBlack, tcMedium, jpBlack, jpMedium, mono] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Black.woff")),
    fs.readFile(path.join(FONT_DIR, "NotoSansTC-Medium.woff")),
    fs.readFile(path.join(FONT_DIR, "NotoSansJP-Black.otf")),
    fs.readFile(path.join(FONT_DIR, "NotoSansJP-Medium.otf")),
    fs.readFile(path.join(FONT_DIR, "SpaceMono-Regular.woff")),
  ]);
  fontsCache = [
    { name: "SpaceMono", data: mono, weight: 400, style: "normal" },
    { name: "NotoSansTC", data: tcMedium, weight: 500, style: "normal" },
    { name: "NotoSansTC", data: tcBlack, weight: 900, style: "normal" },
    { name: "NotoSansJP", data: jpMedium, weight: 500, style: "normal" },
    { name: "NotoSansJP", data: jpBlack, weight: 900, style: "normal" },
  ];
  return fontsCache;
}

async function renderOne({ markup, width, height }) {
  const fonts = await loadFonts();
  const element = html(markup);
  const svg = await satori(element, {
    width,
    height,
    fonts,
    loadAdditionalAsset,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

parentPort.on("message", async (msg) => {
  const { id, payload } = msg;
  try {
    const buf = await renderOne(payload);
    // 不用 transferList：Node Buffer 通常從 pool 借用同一個 ArrayBuffer，
    // 轉移所有權會破壞其他 Buffer。少量資料用結構化複製就好。
    parentPort.postMessage({ id, ok: true, buf });
  } catch (e) {
    parentPort.postMessage({
      id,
      ok: false,
      error: e?.message || String(e),
      stack: e?.stack,
    });
  }
});
