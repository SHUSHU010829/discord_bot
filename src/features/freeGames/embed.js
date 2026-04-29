const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const PLATFORM_META = {
  epic: {
    label: "Epic Games",
    emoji: "⚔️",
    color: 0x2a2a2a,
    claimUrl: () => "https://store.epicgames.com/zh-TW/free-games",
  },
  steam: {
    label: "Steam",
    emoji: "🎮",
    color: 0x1b2838,
    claimUrl: (appid) =>
      appid
        ? `https://store.steampowered.com/app/${appid}/?cc=tw`
        : "https://store.steampowered.com/search/?specials=1&maxprice=free",
  },
  gog: {
    label: "GOG",
    emoji: "🛡️",
    color: 0x86328a,
    claimUrl: () => "https://www.gog.com/games?priceRange=0,0",
  },
};

const truncate = (text, max) => {
  if (!text) return "";
  const stripped = text.replace(/\s+/g, " ").trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + "…";
};

const formatDeadline = (endTime) => {
  if (!endTime) return null;
  const end = DateTime.fromSeconds(endTime, { zone: "Asia/Taipei" });
  const now = DateTime.now().setZone("Asia/Taipei");
  const diffDays = end.diff(now, "days").days;
  const dateStr = end.toFormat("yyyy/MM/dd HH:mm");
  if (!Number.isFinite(diffDays) || diffDays <= 0) return dateStr;
  if (diffDays < 1) {
    const hours = Math.max(1, Math.ceil(end.diff(now, "hours").hours));
    return `${dateStr}(剩 ${hours} 小時)`;
  }
  return `${dateStr}(剩 ${Math.ceil(diffDays)} 天)`;
};

/**
 * Build embed for a free-game giveaway.
 *
 * @param {object} params
 * @param {object} params.item - parsed RSS row
 * @param {object} [params.steamData] - Steam appdetails data when available
 */
const buildFreeGameEmbed = ({ item, steamData = null }) => {
  const meta = PLATFORM_META[item.platform] || PLATFORM_META.steam;

  const displayName =
    (steamData && steamData.name) ||
    item.name ||
    (item.appid ? `App ${item.appid}` : "未知遊戲");

  const titlePrefix = item.isDlc ? "🎁 限免 DLC" : "🎁 限時免費";
  const title = `${titlePrefix} - ${displayName}`;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setURL(meta.claimUrl(item.appid))
    .setColor(meta.color)
    .setTimestamp(new Date())
    .setFooter({ text: "資料來源:小黑盒" });

  const image = (steamData && steamData.header_image) || item.image;
  if (image) embed.setImage(image);

  embed.addFields({
    name: "🏪 平台",
    value: `${meta.emoji} ${meta.label}`,
    inline: true,
  });

  // Steam 限免有 price_overview 才有最準確的 NT$ 原價
  const steamPrice = steamData?.price_overview;
  if (steamPrice && steamPrice.initial_formatted) {
    embed.addFields({
      name: "💰 原價",
      value: `${steamPrice.initial_formatted} → 免費`,
      inline: true,
    });
  } else if (item.originalPrice) {
    embed.addFields({
      name: "💰 原價",
      value: `${item.originalPrice} → 免費`,
      inline: true,
    });
  }

  if (typeof item.score === "number" && item.score > 0) {
    embed.addFields({
      name: "⭐ 小黑盒評分",
      value: item.score.toFixed(1),
      inline: true,
    });
  }

  if (item.chineseSupport !== null && item.chineseSupport !== undefined) {
    embed.addFields({
      name: "🌐 中文",
      value: item.chineseSupport ? "支援" : "不支援",
      inline: true,
    });
  }

  const deadline = formatDeadline(item.endTime);
  if (deadline) {
    embed.addFields({ name: "📅 截止", value: deadline, inline: true });
  }

  if (item.isDlc && item.parentName) {
    embed.addFields({
      name: "🧩 本體",
      value: item.parentName,
      inline: false,
    });
  }

  if (steamData?.short_description) {
    embed.addFields({
      name: "📝 簡介",
      value: truncate(steamData.short_description, 100),
    });
  }

  return embed;
};

module.exports = { buildFreeGameEmbed, PLATFORM_META };
