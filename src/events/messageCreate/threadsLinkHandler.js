const { EmbedBuilder } = require("discord.js");

// ============================================================
// Threads Embed Handler - 支援 Carousel 多圖 + 影片
// 輕量版：HTTP fetch + Googlebot UA
// ============================================================

// 解碼 HTML entities
function decodeHtmlEntities(text) {
  if (!text) return "";
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

// 遞迴搜尋 nested object 中的特定 key
function nestedLookup(key, obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (key in obj) {
    results.push(obj[key]);
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      nestedLookup(key, v, results);
    }
  }

  return results;
}

// 解析單一 thread item
function parseThreadItem(data) {
  const post = data?.post;
  if (!post) return null;

  const result = {
    text: post?.caption?.text || "",
    username: post?.user?.username || "unknown",
    userPic: post?.user?.profile_pic_url || null,
    isVerified: post?.user?.is_verified || false,
    likeCount: post?.like_count || 0,
    replyCount: post?.text_post_app_info?.direct_reply_count || 0,
    images: [],
    videos: [],
  };

  // 處理 carousel（多圖/多影片）
  if (post?.carousel_media && Array.isArray(post.carousel_media)) {
    for (const media of post.carousel_media) {
      // 圖片
      if (media?.image_versions2?.candidates) {
        const candidates = media.image_versions2.candidates;
        // 選擇適中解析度的圖片（通常 index 0 或 1）
        const imgUrl = candidates[0]?.url || candidates[1]?.url;
        if (imgUrl) {
          result.images.push(imgUrl.replace(/&amp;/g, "&"));
        }
      }
      // 影片
      if (media?.video_versions && Array.isArray(media.video_versions)) {
        const videoUrl = media.video_versions[0]?.url;
        if (videoUrl) {
          result.videos.push(videoUrl.replace(/&amp;/g, "&"));
        }
      }
    }
  }

  // 單一圖片貼文（非 carousel）
  if (result.images.length === 0 && post?.image_versions2?.candidates) {
    const candidates = post.image_versions2.candidates;
    const imgUrl = candidates[0]?.url || candidates[1]?.url;
    if (imgUrl) {
      result.images.push(imgUrl.replace(/&amp;/g, "&"));
    }
  }

  // 單一影片貼文（非 carousel）
  if (result.videos.length === 0 && post?.video_versions) {
    const videos = post.video_versions;
    if (Array.isArray(videos) && videos.length > 0) {
      // 去重
      const uniqueVideos = [...new Set(videos.map((v) => v?.url).filter(Boolean))];
      result.videos = uniqueVideos.map((url) => url.replace(/&amp;/g, "&"));
    }
  }

  return result;
}

// 從 HTML 中提取 hidden JSON 並解析 thread 資料
function extractThreadDataFromHtml(html) {
  // 找所有 <script type="application/json" data-sjs> 標籤
  const scriptRegex =
    /<script[^>]*type=["']application\/json["'][^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1];

    // 快速過濾：必須包含 thread_items
    if (!content.includes('"ScheduledServerJS"')) continue;
    if (!content.includes("thread_items")) continue;

    try {
      const data = JSON.parse(content);
      const threadItems = nestedLookup("thread_items", data);

      if (threadItems && threadItems.length > 0) {
        // thread_items 是 array of arrays
        for (const items of threadItems) {
          if (Array.isArray(items) && items.length > 0) {
            const parsed = parseThreadItem(items[0]);
            if (parsed && (parsed.text || parsed.images.length > 0 || parsed.videos.length > 0)) {
              return parsed;
            }
          }
        }
      }
    } catch (e) {
      // JSON parse 失敗，繼續嘗試下一個 script
      continue;
    }
  }

  return null;
}

// Fallback: 從 og meta tags 抓取（原本的方式）
function extractFromOgMeta(html) {
  const title = html.match(/<meta property="og:title" content="([^"]*?)"/)?.[1];
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

  if (!title && !description && images.length === 0) return null;

  // 從 title 解析 username
  let username = "unknown";
  if (title) {
    // 格式通常是 "@username on Threads" 或 "username (@handle)"
    const usernameMatch = title.match(/@([\w.]+)/);
    if (usernameMatch) {
      username = usernameMatch[1];
    }
  }

  return {
    text: description ? decodeHtmlEntities(description) : "",
    username,
    userPic: null,
    isVerified: false,
    likeCount: 0,
    replyCount: 0,
    images,
    videos: [],
  };
}

// 主要抓取函數
async function fetchThreadsData(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 秒 timeout

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[Threads] HTTP ${response.status} for ${url}`);
      return null;
    }

    const html = await response.text();

    // 優先嘗試從 hidden JSON 提取（更完整的資料）
    let data = extractThreadDataFromHtml(html);

    // Fallback 到 og meta
    if (!data) {
      data = extractFromOgMeta(html);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.log(`[Threads] 請求超時：${url}`);
    } else {
      console.log(`[Threads] 抓取失敗：${error.message}`);
    }
    return null;
  }
}

// 擷取 Threads 連結（支援 threads.net 和 threads.com）
function extractThreadsUrl(content) {
  const match = content.match(
    /https?:\/\/(www\.)?(threads\.net|threads\.com)\/@[\w.]+\/post\/[\w-]+/i
  );
  return match ? match[0] : null;
}

// 格式化數字（1000 -> 1K）
function formatNumber(num) {
  if (!num || num < 1000) return String(num || 0);
  if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
}

// 主要 handler
module.exports = async (client, message) => {
  if (message.author.bot) return;

  const threadsUrl = extractThreadsUrl(message.content);
  if (!threadsUrl) return;

  try {
    const data = await fetchThreadsData(threadsUrl);
    if (!data) return;

    // 建立主 embed
    const mainEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setAuthor({
        name: `@${data.username}${data.isVerified ? " ✓" : ""}`,
        url: threadsUrl,
        iconURL: data.userPic || undefined,
      })
      .setURL(threadsUrl);

    // 設定描述文字
    if (data.text) {
      const desc =
        data.text.length > 400 ? data.text.slice(0, 400) + "..." : data.text;
      mainEmbed.setDescription(desc);
    }

    // 添加互動數據
    const stats = [];
    if (data.likeCount > 0) stats.push(`❤️ ${formatNumber(data.likeCount)}`);
    if (data.replyCount > 0) stats.push(`💬 ${formatNumber(data.replyCount)}`);
    if (stats.length > 0) {
      mainEmbed.setFooter({ text: stats.join("  •  ") });
    }

    // 第一張圖放在主 embed
    if (data.images.length > 0) {
      mainEmbed.setImage(data.images[0]);
    }

    const embeds = [mainEmbed];

    // 額外圖片（Discord 限制：最多 4 個 embed 可以組成圖片牆）
    // 使用相同的 URL 讓 Discord 合併成 gallery
    for (let i = 1; i < Math.min(data.images.length, 4); i++) {
      embeds.push(
        new EmbedBuilder().setURL(threadsUrl).setImage(data.images[i])
      );
    }

    // 如果還有更多圖片，在 footer 提示
    if (data.images.length > 4) {
      const existingFooter = mainEmbed.data.footer?.text || "";
      const separator = existingFooter ? "  •  " : "";
      mainEmbed.setFooter({
        text: `${existingFooter}${separator}📷 +${data.images.length - 4} more`,
      });
    }

    // 處理影片：Discord embed 不支援外部影片，提供連結
    let videoMessage = "";
    if (data.videos.length > 0) {
      // 只顯示影片存在的提示，不直接貼 URL（太長太醜）
      videoMessage = `\n🎬 此貼文包含影片`;
    }

    // 隱藏原始 embed
    await message.suppressEmbeds(true);

    // 發送自訂 embed
    await message.reply({
      content: videoMessage || undefined,
      embeds,
      allowedMentions: { repliedUser: false },
    });
  } catch (error) {
    console.log(`[ERROR] Threads link handler 發生錯誤：\n${error}`);
  }
};
