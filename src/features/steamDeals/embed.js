const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const { buildStoreUrl } = require("./steam");

const truncate = (text, max) => {
  if (!text) return "";
  const stripped = text.replace(/\s+/g, " ").trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + "…";
};

const formatRemainingDays = (endTime) => {
  if (!endTime) return null;
  const end = DateTime.fromSeconds(endTime, { zone: "Asia/Taipei" });
  const now = DateTime.now().setZone("Asia/Taipei");
  const diff = end.diff(now, "days").days;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return `剩餘 ${Math.ceil(diff)} 天`;
};

/**
 * Build a Discord embed for a Steam deal.
 * xhh: { appid, isLowest, newLowest, score, endTime }
 * steam: appdetails data object
 */
const buildDealEmbed = ({ xhh, steam }) => {
  const price = steam.price_overview || {};
  const discount = price.discount_percent || 0;
  const finalFmt = price.final_formatted || "";
  const initialFmt = price.initial_formatted || "";

  const priceLine =
    initialFmt && initialFmt !== finalFmt
      ? `${finalFmt}（原價 ${initialFmt}）`
      : finalFmt || "—";

  const isLowest = xhh.isLowest || xhh.newLowest;
  const discountLine = `-${discount}%${isLowest ? " 🔥 [史低]" : ""}`;

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${steam.name || xhh.rawName || `App ${xhh.appid}`}`)
    .setURL(buildStoreUrl(xhh.appid))
    .setTimestamp(new Date())
    .setFooter({ text: "資料來源:小黑盒 + Steam" });

  if (steam.header_image) embed.setImage(steam.header_image);

  embed.addFields(
    { name: "💰 價格", value: priceLine, inline: true },
    { name: "🏷️ 折扣", value: discountLine, inline: true }
  );

  if (typeof xhh.score === "number" && xhh.score > 0) {
    embed.addFields({
      name: "⭐ 小黑盒評分",
      value: xhh.score.toFixed(1),
      inline: true,
    });
  }

  const remaining = formatRemainingDays(xhh.endTime);
  if (remaining) {
    embed.addFields({ name: "📅 截止", value: remaining, inline: true });
  }

  if (steam.short_description) {
    embed.addFields({
      name: "📝 簡介",
      value: truncate(steam.short_description, 100),
    });
  }

  return embed;
};

module.exports = { buildDealEmbed };
