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
    const image = html.match(
      /<meta property="og:image" content="([^"]*?)"/
    )?.[1];

    if (!title && !description) return null;

    return {
      title: title ? decodeHtmlEntities(title) : null,
      description: description ? decodeHtmlEntities(description) : null,
      // image URL 裡的 &amp; 也要還原
      image: image ? image.replace(/&amp;/g, "&") : null,
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

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setAuthor({
        name: meta.title || "Threads",
        url: threadsUrl,
      })
      .setURL(threadsUrl);

    if (meta.description) {
      // 超過 4096 字截斷
      const desc =
        meta.description.length > 400
          ? meta.description.slice(0, 400) + "..."
          : meta.description;
      embed.setDescription(desc);
    }

    if (meta.image) {
      embed.setImage(meta.image);
    }
    
    await message.suppressEmbeds(true); // 隱藏原本的空白預覽
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.log(`[ERROR] Threads link handler 發生錯誤：\n${error}`);
  }
};
