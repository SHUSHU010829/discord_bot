require("colors");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  InteractionContextType,
} = require("discord.js");

const { shop } = require("../../config");

function fmtExpiry(expiresAt) {
  if (!expiresAt) return "永久";
  const ts = Math.floor(new Date(expiresAt).getTime() / 1000);
  return `<t:${ts}:R>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("背包")
    .setDescription("查看你購買的道具與生效中的 buff 🎒")
    .setContexts(InteractionContextType.Guild)
    .toJSON(),

  run: async (client, interaction) => {
    if (!shop?.enabled) {
      return interaction.reply({
        content: "🔧 商店系統尚未啟動！",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!client.userInventoryCollection || !client.userCoinsCollection) {
        return interaction.editReply("🔧 商店系統尚未就緒");
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const items = await client.userInventoryCollection
        .find({ userId, guildId, expired: { $ne: true } })
        .sort({ acquiredAt: -1 })
        .limit(50)
        .toArray();

      const coinDoc = await client.userCoinsCollection
        .findOne({ userId, guildId }, { projection: { activeBuffs: 1, totalCoins: 1 } });

      const now = Date.now();
      const activeBuffs = (coinDoc?.activeBuffs || []).filter((b) => {
        const exp = b?.expiresAt ? new Date(b.expiresAt).getTime() : 0;
        return exp > now;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${interaction.user.username} 的背包`)
        .setColor(0x9b59b6)
        .setDescription(`目前金幣：**${(coinDoc?.totalCoins || 0).toLocaleString()}**`);

      if (activeBuffs.length > 0) {
        const buffText = activeBuffs
          .map(
            (b) =>
              `・${b.type === "xp_boost" ? "📈 XP" : "💰 金幣"} ×${b.multiplier}（${fmtExpiry(b.expiresAt)}）`,
          )
          .join("\n");
        embed.addFields({ name: "✨ 生效中的 buff", value: buffText });
      } else {
        embed.addFields({
          name: "✨ 生效中的 buff",
          value: "（沒有）",
        });
      }

      if (items.length === 0) {
        embed.addFields({ name: "📦 道具", value: "（背包是空的）" });
      } else {
        const grouped = new Map();
        for (const it of items) {
          const cat = it.type;
          if (!grouped.has(cat)) grouped.set(cat, []);
          grouped.get(cat).push(it);
        }

        const TYPE_LABEL = {
          role_color: "🎨 顏色身份組",
          wallet_theme: "🎴 卡面風格",
          custom_title: "🪪 自訂稱號",
          casino_token: "🎲 賭場道具",
        };

        for (const [type, list] of grouped.entries()) {
          const text = list
            .map((it) => {
              const equipped = it.equipped ? " ✅" : "";
              const qty = it.qty ? ` ×${it.qty}` : "";
              const exp = it.expiresAt ? ` — 到期：${fmtExpiry(it.expiresAt)}` : "";
              return `\`${String(it._id)}\` **${it.name}**${qty}${equipped}${exp}`;
            })
            .join("\n");
          embed.addFields({
            name: TYPE_LABEL[type] || type,
            value: text.slice(0, 1024),
          });
        }
      }

      embed.setFooter({
        text: "顏色／主題：複製 ID 後 /商店 裝備；自訂稱號：/商店 設定稱號",
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.log(`[ERROR] /背包:\n${error}\n${error.stack}`.red);
      await interaction.editReply("🔧 背包讀取失敗").catch(() => {});
    }
  },
};
