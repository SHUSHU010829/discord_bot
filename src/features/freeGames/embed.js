const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const COLOR_FREE = 0x06a77d;

const PLATFORM_META = {
  epic: {
    label: "Epic Games",
    fallbackUrl: () => "https://store.epicgames.com/zh-TW/free-games",
  },
  steam: {
    label: "Steam",
    fallbackUrl: (appid) =>
      appid
        ? `https://store.steampowered.com/app/${appid}/?cc=tw`
        : "https://store.steampowered.com/search/?specials=1&maxprice=free",
  },
};

const truncate = (text, max) => {
  if (!text) return "";
  const stripped = text.replace(/\s+/g, " ").trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + "…";
};

const formatRemaining = (endTime) => {
  if (!endTime) return null;
  const end = DateTime.fromSeconds(endTime, { zone: "Asia/Taipei" });
  const now = DateTime.now().setZone("Asia/Taipei");
  const days = end.diff(now, "days").days;
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days < 1) {
    const hours = Math.max(1, Math.ceil(end.diff(now, "hours").hours));
    return `剩餘 ${hours} 小時`;
  }
  return `剩餘 ${Math.ceil(days)} 天`;
};

const buildFreeGameEmbed = ({ item, steamData = null }) => {
  const meta = PLATFORM_META[item.platform] || PLATFORM_META.steam;

  const displayName =
    (steamData && steamData.name) ||
    item.name ||
    (item.appid ? `App ${item.appid}` : "未知遊戲");

  const steamPrice = steamData?.price_overview;
  const originalPriceText = steamPrice?.initial_formatted || item.originalPrice || null;

  const summaryParts = ["**免費領取**"];
  if (originalPriceText) summaryParts.push(`原價 ~~${originalPriceText}~~`);

  const authorLabel = item.isDlc ? "限免 DLC" : "限時免費";

  const claimUrl = item.link || meta.fallbackUrl(item.appid);

  const embed = new EmbedBuilder()
    .setAuthor({ name: authorLabel })
    .setTitle(displayName.slice(0, 256))
    .setURL(claimUrl)
    .setColor(COLOR_FREE)
    .setDescription(summaryParts.join("  ·  "))
    .setTimestamp(new Date())
    .setFooter({ text: "來源:LootScraper" });

  const image = (steamData && steamData.header_image) || item.image;
  if (image) embed.setImage(image);

  embed.addFields({ name: "平台", value: meta.label, inline: true });

  if (typeof item.score === "number" && item.score > 0) {
    embed.addFields({
      name: "評分",
      value: item.score.toFixed(1),
      inline: true,
    });
  }

  if (item.chineseSupport !== null && item.chineseSupport !== undefined) {
    embed.addFields({
      name: "中文",
      value: item.chineseSupport ? "支援" : "不支援",
      inline: true,
    });
  }

  const remaining = formatRemaining(item.endTime);
  if (remaining) {
    embed.addFields({ name: "截止", value: remaining, inline: true });
  }

  if (item.isDlc && item.parentName) {
    embed.addFields({ name: "本體", value: item.parentName, inline: true });
  }

  const shortDesc = steamData?.short_description || item.description;
  if (shortDesc) {
    embed.addFields({
      name: "簡介",
      value: truncate(shortDesc, 100),
    });
  }

  return embed;
};

module.exports = { buildFreeGameEmbed, PLATFORM_META };
