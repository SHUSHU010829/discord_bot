const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const TWITCH_PURPLE = 0x9146ff;

const formatNumber = (n) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
};

const buildThumbnailUrl = (template, { width = 640, height = 360 } = {}) => {
  if (!template) return null;
  // 加上 cache-buster 避免 Discord 把舊縮圖快取住
  const url = template
    .replace("{width}", String(width))
    .replace("{height}", String(height));
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
};

/**
 * 組出開台通知 embed + Watch Stream 按鈕。
 *
 * @param {object} opts
 * @param {object} opts.stream  Helix /streams 回傳的單筆資料
 * @param {object} opts.user    Helix /users 回傳的單筆資料 (拿 display_name / profile_image_url)
 */
const buildLiveStreamPayload = ({ stream, user }) => {
  const login = (user?.login || stream?.user_login || "").toLowerCase();
  const displayName = user?.display_name || stream?.user_name || login;
  const channelUrl = `https://www.twitch.tv/${login}`;

  const title = stream?.title?.trim() || "（無標題）";
  const game = stream?.game_name?.trim() || "未分類";
  const viewers = formatNumber(stream?.viewer_count ?? 0);
  const startedAt = stream?.started_at ? new Date(stream.started_at) : new Date();

  const embed = new EmbedBuilder()
    .setColor(TWITCH_PURPLE)
    .setAuthor({
      name: `${displayName} is now live on Twitch!`,
      iconURL: user?.profile_image_url || undefined,
      url: channelUrl,
    })
    .setTitle(title.slice(0, 256))
    .setURL(channelUrl)
    .addFields(
      { name: "Game", value: game.slice(0, 1024), inline: true },
      { name: "Viewers", value: viewers, inline: true }
    )
    .setTimestamp(startedAt)
    .setFooter({ text: `twitch.tv/${login}` });

  const thumb = buildThumbnailUrl(stream?.thumbnail_url);
  if (thumb) embed.setImage(thumb);

  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("Watch Stream")
    .setURL(channelUrl);

  const row = new ActionRowBuilder().addComponents(button);

  return { embeds: [embed], components: [row] };
};

module.exports = { buildLiveStreamPayload, TWITCH_PURPLE };
