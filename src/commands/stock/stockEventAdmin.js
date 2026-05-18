require("colors");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  InteractionContextType,
} = require("discord.js");

const { stockSystem } = require("../../config");
const {
  fireEvent,
  getMergedEventDefs,
  getStaticEventDefs,
} = require("../../features/stock/eventEngine");

const TARGET_ALL = "ALL";

function normalizeSymbol(input) {
  if (!input) return TARGET_ALL;
  const v = String(input).trim().toUpperCase();
  return v === "" || v === "ALL" || v === "全部" ? TARGET_ALL : v;
}

function slugifyId(name) {
  // 將事件名稱壓成簡短英數 id，失敗則回傳 time-based fallback
  const cleaned = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (cleaned) return `custom_${cleaned}`.slice(0, 64);
  return `custom_${Date.now().toString(36)}`;
}

async function ensureSymbolExists(client, guildId, symbol) {
  if (symbol === TARGET_ALL) return true;
  if (!client.stockMarketCollection) return false;
  const found = await client.stockMarketCollection.findOne({ guildId, symbol });
  return !!found;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("股市事件")
    .setDescription("[ADMIN] 管理股市突發事件（一次性觸發或加入事件簿）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sc) =>
      sc
        .setName("觸發")
        .setDescription("[ADMIN] 立即觸發一次性事件（不加入事件簿）")
        .addStringOption((o) =>
          o.setName("名稱").setDescription("事件顯示名稱，例如：央行救市").setRequired(true)
        )
        .addNumberOption((o) =>
          o
            .setName("漲跌幅")
            .setDescription("百分比，例如 5 表示 +5%，-7 表示 -7%（範圍 -50 ~ 50）")
            .setMinValue(-50)
            .setMaxValue(50)
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("目標")
            .setDescription("股票代號（例如 TSPP），留空或填 ALL 代表全市場")
            .setRequired(false)
        )
        .addBooleanOption((o) =>
          o
            .setName("略過冷卻")
            .setDescription("是否略過事件冷卻時間（預設 true）")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("依id觸發")
        .setDescription("[ADMIN] 依現有事件 id 立即觸發（不會新增到事件簿）")
        .addStringOption((o) =>
          o.setName("id").setDescription("事件 id，可用「列表」查看").setRequired(true)
        )
        .addBooleanOption((o) =>
          o
            .setName("略過冷卻")
            .setDescription("是否略過事件冷卻時間（預設 true）")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("加入事件簿")
        .setDescription("[ADMIN] 新增事件至事件簿，未來會隨機觸發")
        .addStringOption((o) =>
          o.setName("名稱").setDescription("事件顯示名稱").setRequired(true)
        )
        .addNumberOption((o) =>
          o
            .setName("漲跌幅")
            .setDescription("百分比，例如 8 表示 +8%（範圍 -50 ~ 50）")
            .setMinValue(-50)
            .setMaxValue(50)
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("目標")
            .setDescription("股票代號（例如 TSPP），留空或填 ALL 代表全市場")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("自訂事件 id（英數/底線），留空自動由名稱產生")
            .setRequired(false)
        )
        .addBooleanOption((o) =>
          o
            .setName("立即觸發")
            .setDescription("新增後是否立即觸發一次（預設 false）")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("移除")
        .setDescription("[ADMIN] 從事件簿移除自訂事件")
        .addStringOption((o) =>
          o.setName("id").setDescription("要移除的事件 id").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("列表").setDescription("[ADMIN] 列出所有可用事件（static + 自訂）")
    )
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (!stockSystem?.enabled) return interaction.editReply("🔧 股市系統未啟用。");
      if (!client.stockMarketCollection || !client.stockEventsCollection) {
        return interaction.editReply("🔧 股市系統尚未就緒。");
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === "觸發") {
        const name = interaction.options.getString("名稱").trim();
        const pct = interaction.options.getNumber("漲跌幅");
        const target = normalizeSymbol(interaction.options.getString("目標"));
        const force = interaction.options.getBoolean("略過冷卻") ?? true;

        if (pct === 0) return interaction.editReply("❌ 漲跌幅不能為 0。");
        const exists = await ensureSymbolExists(client, guildId, target);
        if (!exists) return interaction.editReply(`❌ 找不到股票代號 \`${target}\`。`);

        const effect = pct / 100;
        const def = {
          id: `adhoc_${Date.now().toString(36)}`,
          name,
          effect,
          stock: target,
          dir: effect >= 0 ? "up" : "dn",
        };
        const result = await fireEvent(client, guildId, def.id, {
          force,
          customDef: def,
          triggeredBy: interaction.user.id,
        });
        if (!result) {
          return interaction.editReply(
            "⚠️ 事件未產生任何價格變動（可能標的不存在或變動被地板價限制）。"
          );
        }
        const sign = effect >= 0 ? "+" : "";
        return interaction.editReply(
          `✅ 已觸發一次性事件 **${name}**｜目標 \`${target}\`｜${sign}${(effect * 100).toFixed(1)}%｜影響 ${result.changes.length} 支`
        );
      }

      if (sub === "依id觸發") {
        const eventId = interaction.options.getString("id").trim();
        const force = interaction.options.getBoolean("略過冷卻") ?? true;
        const result = await fireEvent(client, guildId, eventId, {
          force,
          triggeredBy: interaction.user.id,
        });
        if (!result) {
          return interaction.editReply(
            `⚠️ 觸發失敗：找不到 id \`${eventId}\`，或在冷卻中、或無價格變動。`
          );
        }
        const sign = result.def.effect >= 0 ? "+" : "";
        return interaction.editReply(
          `✅ 已觸發 **${result.def.name}** (\`${result.def.id}\`)｜${sign}${(result.def.effect * 100).toFixed(1)}%｜影響 ${result.changes.length} 支`
        );
      }

      if (sub === "加入事件簿") {
        if (!client.stockEventDefsCollection) {
          return interaction.editReply("🔧 事件簿尚未就緒（StockEventDefs collection 不存在）。");
        }
        const name = interaction.options.getString("名稱").trim();
        const pct = interaction.options.getNumber("漲跌幅");
        const target = normalizeSymbol(interaction.options.getString("目標"));
        const rawId = interaction.options.getString("id");
        const fireNow = interaction.options.getBoolean("立即觸發") ?? false;

        if (pct === 0) return interaction.editReply("❌ 漲跌幅不能為 0。");
        const exists = await ensureSymbolExists(client, guildId, target);
        if (!exists) return interaction.editReply(`❌ 找不到股票代號 \`${target}\`。`);

        const id = rawId
          ? String(rawId).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 64)
          : slugifyId(name);
        if (!id) return interaction.editReply("❌ id 格式無效。");

        // 不允許覆蓋 static 預設事件
        const staticHit = getStaticEventDefs().find((e) => e.id === id);
        if (staticHit) {
          return interaction.editReply(
            `❌ 該 id \`${id}\` 與預設事件衝突，請改用其他 id。`
          );
        }

        const effect = pct / 100;
        const doc = {
          guildId,
          id,
          name,
          effect,
          stock: target,
          dir: effect >= 0 ? "up" : "dn",
          enabled: true,
          createdAt: new Date(),
          createdBy: interaction.user.id,
        };
        try {
          await client.stockEventDefsCollection.updateOne(
            { guildId, id },
            { $set: doc },
            { upsert: true }
          );
        } catch (e) {
          return interaction.editReply(`❌ 寫入失敗：${e?.message || e}`);
        }

        let suffix = "";
        if (fireNow) {
          const result = await fireEvent(client, guildId, id, {
            force: true,
            triggeredBy: interaction.user.id,
          });
          suffix = result
            ? `\n• 已立即觸發，影響 ${result.changes.length} 支`
            : "\n• 立即觸發未產生變動";
        }
        const sign = effect >= 0 ? "+" : "";
        return interaction.editReply(
          `✅ 已加入事件簿：\n• id：\`${id}\`\n• 名稱：${name}\n• 目標：\`${target}\`\n• 幅度：${sign}${(effect * 100).toFixed(1)}%${suffix}`
        );
      }

      if (sub === "移除") {
        if (!client.stockEventDefsCollection) {
          return interaction.editReply("🔧 事件簿尚未就緒。");
        }
        const id = interaction.options.getString("id").trim();
        const res = await client.stockEventDefsCollection.deleteOne({ guildId, id });
        if (res.deletedCount === 0) {
          return interaction.editReply(`⚠️ 找不到自訂事件 \`${id}\`（預設事件無法移除）。`);
        }
        return interaction.editReply(`✅ 已移除自訂事件 \`${id}\``);
      }

      if (sub === "列表") {
        const defs = await getMergedEventDefs(client, guildId);
        if (defs.length === 0) return interaction.editReply("（無）");
        const staticDefs = defs.filter((d) => d.source !== "dynamic");
        const dynamicDefs = defs.filter((d) => d.source === "dynamic");

        const fmt = (d) => {
          const sign = d.effect >= 0 ? "+" : "";
          return `\`${d.id}\` ${d.name}｜\`${d.stock}\`｜${sign}${(d.effect * 100).toFixed(1)}%`;
        };
        const embed = new EmbedBuilder()
          .setTitle("📒 股市事件清單")
          .setColor(0x3498db)
          .setTimestamp(new Date());
        if (staticDefs.length) {
          embed.addFields({
            name: `預設事件（${staticDefs.length}）`,
            value: staticDefs.slice(0, 25).map(fmt).join("\n") || "（無）",
          });
        }
        if (dynamicDefs.length) {
          embed.addFields({
            name: `自訂事件（${dynamicDefs.length}）`,
            value: dynamicDefs.slice(0, 25).map(fmt).join("\n") || "（無）",
          });
        }
        return interaction.editReply({ embeds: [embed] });
      }

      return interaction.editReply("❌ 未知子指令。");
    } catch (error) {
      console.log(`[ERROR] /股市事件:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply(`🔧 指令失敗：${error?.message || error}`)
        .catch(() => {});
    }
  },
};
