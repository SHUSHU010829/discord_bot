const { EmbedBuilder } = require("discord.js");

// 解碼 HTML entities
function decodeHtmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

// 從 HTML 抓 og meta tag
async function fetchThreadsMeta(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    const title = html.match(
      /<meta property="og:title" content="([^"]*?)"/
    )?.[1];
    const description = html.match(
      /<meta property="og:description" content="([^"]*?)"/
    )?.[1];
    // 抓所有圖片
    const imageMatches = [
      ...html.matchAll(/<meta property="og:image" content="([^"]*?)"/g),
    ];
    const allImages = imageMatches.map((m) => m[1].replace(/&amp;/g, "&"));
    // 過濾大頭貼：Instagram CDN 大頭貼路徑格式為 /t51.xxxxx-19/
    const images = allImages.filter((url) => !/\/t51\.\d+-19\//.test(url));

    if (!title && !description) return null;

    return {
      title: title ? decodeHtmlEntities(title) : null,
      description: description ? decodeHtmlEntities(description) : null,
      images,
    };
  } catch (error) {
    console.log(`[Threads] 抓取 meta 失敗：${error.message}`);
    return null;
  }
}

// 擷取 Threads 連結
function extractThreadsUrl(content) {
  const match = content.match(
    /https?:\/\/(www\.)?(threads\.net|threads\.com)\/@[\w.]+\/post\/[\w-]+/
  );
  return match ? match[0] : null;
}

module.exports = async (client, message) => {
  if (message.author.bot) return;

  const threadsUrl = extractThreadsUrl(message.content);
  if (!threadsUrl) return;

  try {
    const meta = await fetchThreadsMeta(threadsUrl);
    if (!meta) return;

    // 主 embed
    const mainEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setAuthor({
        name: meta.title || "Threads",
        url: threadsUrl,
      })
      .setURL(threadsUrl);

    if (meta.description) {
      const desc =
        meta.description.length > 400
          ? meta.description.slice(0, 400) + "..."
          : meta.description;
      mainEmbed.setDescription(desc);
    }

    // 第一張圖放在主 embed
    if (meta.images.length > 0) {
      mainEmbed.setImage(meta.images[0]);
    }

    const embeds = [mainEmbed];

    // 第二張之後，用額外的空 embed 帶圖（URL 相同會合併成圖片群組）
    for (let i = 1; i < Math.min(meta.images.length, 4); i++) {
      embeds.push(
        new EmbedBuilder().setURL(threadsUrl).setImage(meta.images[i])
      );
    }

    await message.suppressEmbeds(true);
    await message.reply({ embeds });
  } catch (error) {
    console.log(`[ERROR] Threads link handler 發生錯誤：\n${error}`);
  }
};
