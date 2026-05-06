const cheerio = require("cheerio");

// 從 RSS description 內的 HTML 字串抓出所有 <img src>。
// liveking / picnob 兩種 feed 結構相同,皆能直接套用。
const parseImages = (html) => {
  if (!html || typeof html !== "string") return [];
  const $ = cheerio.load(html);
  const urls = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) urls.push(src);
  });
  return urls;
};

module.exports = { parseImages };
