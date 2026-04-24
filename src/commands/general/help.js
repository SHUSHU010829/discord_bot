require("colors");

const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} = require("discord.js");

const HOME_COLOR = 0x00ae86;
const CATEGORY_COLOR = 0x5865f2;
const TIMEOUT_MS = 3 * 60 * 1000;
const COMMANDS_ROOT = path.join(__dirname, "..");

// 類別資料夾名稱 → 顯示設定
const CATEGORY_META = {
  food: { label: "食物飲料", emoji: "🍽️", order: 1, blurb: "吃/喝什麼、食物清單、排行榜、飲料菜單管理" },
  draw: { label: "抽選工具", emoji: "🎲", order: 2, blurb: "抽籤、二選一、鹹魚翻身樂透" },
  weather: { label: "天氣", emoji: "🌤️", order: 3, blurb: "全台與個別縣市天氣查詢" },
  currency: { label: "匯率", emoji: "💱", order: 4, blurb: "即時匯率與加密貨幣報價" },
  stats: { label: "統計", emoji: "📊", order: 5, blurb: "訊息/語音統計與排行榜" },
  roles: { label: "身份組", emoji: "🎮", order: 6, blurb: "遊戲身份組選單管理" },
  ticket: { label: "票務投票", emoji: "🎫", order: 7, blurb: "建議面板、票務、遊戲頻道提案投票" },
  general: { label: "一般", emoji: "📰", order: 8, blurb: "每日早報與本手冊" },
  post: { label: "情勒文", emoji: "📝", order: 9, blurb: "情勒文產生與新增" },
  ask: { label: "問答", emoji: "💬", order: 10, blurb: "跟逼逼機器人聊天" },
  misc: { label: "其他", emoji: "🛠️", order: 11, blurb: "雜項小工具" },
};

const OPTION_TYPE_LABEL = {
  [ApplicationCommandOptionType.Subcommand]: "子指令",
  [ApplicationCommandOptionType.SubcommandGroup]: "子指令群組",
  [ApplicationCommandOptionType.String]: "文字",
  [ApplicationCommandOptionType.Integer]: "整數",
  [ApplicationCommandOptionType.Boolean]: "是/否",
  [ApplicationCommandOptionType.User]: "用戶",
  [ApplicationCommandOptionType.Channel]: "頻道",
  [ApplicationCommandOptionType.Role]: "身份組",
  [ApplicationCommandOptionType.Mentionable]: "可提及對象",
  [ApplicationCommandOptionType.Number]: "數字",
  [ApplicationCommandOptionType.Attachment]: "附件",
};

let cachedIndex = null;

function loadCommandIndex() {
  if (cachedIndex) return cachedIndex;

  const categories = fs
    .readdirSync(COMMANDS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const commands = [];
  for (const category of categories) {
    const dirPath = path.join(COMMANDS_ROOT, category);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = require(path.join(dirPath, file));
        if (!mod || !mod.data || !mod.data.name) continue;
        if (mod.deleted) continue;
        if (mod.data.name === "help") continue;

        commands.push({
          name: mod.data.name,
          description: mod.data.description || "（無描述）",
          options: Array.isArray(mod.data.options) ? mod.data.options : [],
          defaultMemberPermissions: mod.data.default_member_permissions,
          userPermissions: mod.userPermissions || [],
          category,
        });
      } catch (err) {
        console.log(
          `[WARN] /help 無法載入 ${category}/${file}: ${err.message}`.yellow,
        );
      }
    }
  }

  commands.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

  const byCategory = new Map();
  for (const cmd of commands) {
    if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
    byCategory.get(cmd.category).push(cmd);
  }

  cachedIndex = { commands, byCategory };
  return cachedIndex;
}

function isAdminOnly(cmd) {
  const adminBit = PermissionFlagsBits.Administrator;
  if (cmd.defaultMemberPermissions != null) {
    try {
      const bits = BigInt(cmd.defaultMemberPermissions);
      if ((bits & adminBit) === adminBit) return true;
    } catch {
      /* noop */
    }
  }
  return cmd.userPermissions.some(
    (p) => p === "Administrator" || p === adminBit,
  );
}

function sortedCategories() {
  const { byCategory } = loadCommandIndex();
  return [...byCategory.entries()].sort(
    ([a], [b]) =>
      (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99),
  );
}

function formatOption(option, indent = "") {
  const typeLabel = OPTION_TYPE_LABEL[option.type] || "參數";
  const required = option.required ? "必填" : "可選";
  const desc = option.description || "";
  return `${indent}• \`${option.name}\` (${required}, ${typeLabel}) — ${desc}`;
}

function formatSubcommand(sub) {
  const lines = [`▸ \`${sub.name}\` — ${sub.description || ""}`];
  for (const opt of sub.options || []) {
    lines.push(formatOption(opt, "　"));
  }
  return lines.join("\n");
}

function formatCommandBody(cmd) {
  const lines = [cmd.description];
  const opts = cmd.options || [];
  const subs = opts.filter(
    (o) => o.type === ApplicationCommandOptionType.Subcommand,
  );
  const flat = opts.filter(
    (o) =>
      o.type !== ApplicationCommandOptionType.Subcommand &&
      o.type !== ApplicationCommandOptionType.SubcommandGroup,
  );

  if (flat.length) {
    lines.push("");
    lines.push(...flat.map((o) => formatOption(o)));
  }

  if (subs.length) {
    if (flat.length) lines.push("");
    lines.push(...subs.map(formatSubcommand));
  }

  return lines.join("\n");
}

function clamp(value, max) {
  if (!value) return "—";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function buildHomeEmbed() {
  const categories = sortedCategories();
  const total = categories.reduce((n, [, arr]) => n + arr.length, 0);

  const embed = new EmbedBuilder()
    .setTitle("📚 逼逼機器人使用手冊")
    .setColor(HOME_COLOR)
    .setDescription(
      `嗨！我是逼逼機器人 🤖\n` +
        `共有 **${total}** 個指令，分成 **${categories.length}** 大類。\n\n` +
        `👇 從下方選單挑一個類別開始看\n` +
        `🔎 或用 \`/help 指令:<名稱>\` 直接查單一指令`,
    )
    .addFields(
      categories.map(([key, cmds]) => {
        const meta = CATEGORY_META[key] || {
          label: key,
          emoji: "📁",
          blurb: "",
        };
        return {
          name: `${meta.emoji} ${meta.label} ・ ${cmds.length} 個指令`,
          value: meta.blurb || "​",
          inline: false,
        };
      }),
    )
    .setFooter({ text: "🔒 標記 = 僅管理員可用" });

  return embed;
}

function buildCategoryEmbed(categoryKey) {
  const { byCategory } = loadCommandIndex();
  const cmds = byCategory.get(categoryKey) || [];
  const meta = CATEGORY_META[categoryKey] || {
    label: categoryKey,
    emoji: "📁",
    blurb: "",
  };

  const embed = new EmbedBuilder()
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setColor(CATEGORY_COLOR)
    .setDescription(meta.blurb || `共 ${cmds.length} 個指令`)
    .setFooter({ text: `${cmds.length} 個指令 ・ 選單可切換其他類別` });

  // Embed 限制：最多 25 個 field、每個 field value 最多 1024 字
  const fields = cmds.slice(0, 25).map((cmd) => ({
    name: `/${cmd.name}${isAdminOnly(cmd) ? " 🔒" : ""}`,
    value: clamp(formatCommandBody(cmd), 1024),
    inline: false,
  }));
  embed.addFields(fields);

  return embed;
}

function buildCommandEmbed(cmd) {
  const meta = CATEGORY_META[cmd.category] || {
    label: cmd.category,
    emoji: "📁",
  };
  const embed = new EmbedBuilder()
    .setTitle(`/${cmd.name}${isAdminOnly(cmd) ? "  🔒" : ""}`)
    .setColor(CATEGORY_COLOR)
    .setDescription(cmd.description || "​")
    .addFields({
      name: "類別",
      value: `${meta.emoji} ${meta.label}`,
      inline: true,
    });

  const opts = cmd.options || [];
  const subs = opts.filter(
    (o) => o.type === ApplicationCommandOptionType.Subcommand,
  );
  const flat = opts.filter(
    (o) =>
      o.type !== ApplicationCommandOptionType.Subcommand &&
      o.type !== ApplicationCommandOptionType.SubcommandGroup,
  );

  if (flat.length) {
    embed.addFields({
      name: "參數",
      value: clamp(flat.map((o) => formatOption(o)).join("\n"), 1024),
      inline: false,
    });
  }

  if (subs.length) {
    embed.addFields({
      name: "子指令",
      value: clamp(subs.map(formatSubcommand).join("\n\n"), 1024),
      inline: false,
    });
  }

  if (isAdminOnly(cmd)) {
    embed.addFields({
      name: "權限",
      value: "🔒 僅限管理員使用",
      inline: false,
    });
  }

  return embed;
}

function buildComponents(currentCategory) {
  const categories = sortedCategories();

  const options = categories.slice(0, 25).map(([key, cmds]) => {
    const meta = CATEGORY_META[key] || { label: key, emoji: "📁", blurb: "" };
    return {
      label: `${meta.label} (${cmds.length})`,
      description: meta.blurb ? clamp(meta.blurb, 100) : undefined,
      value: key,
      emoji: meta.emoji,
      default: key === currentCategory,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("help_category")
    .setPlaceholder("📖 選擇一個類別...")
    .addOptions(options);

  const home = new ButtonBuilder()
    .setCustomId("help_home")
    .setLabel("回首頁")
    .setEmoji("🏠")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentCategory == null);

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(home),
  ];
}

function findCommand(query) {
  const { commands } = loadCommandIndex();
  const normalized = query.trim().replace(/^\//, "").toLowerCase();
  if (!normalized) return null;

  return (
    commands.find((c) => c.name.toLowerCase() === normalized) ||
    commands.find((c) => c.name.toLowerCase().includes(normalized)) ||
    null
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("📚 查看逼逼機器人使用手冊")
    .addStringOption((opt) =>
      opt
        .setName("指令")
        .setDescription("直接跳到特定指令的說明（例如：吃什麼）")
        .setRequired(false),
    ),

  run: async (client, interaction) => {
    try {
      const targetName = interaction.options.getString("指令");

      // 直接查詢特定指令
      if (targetName) {
        const cmd = findCommand(targetName);
        if (!cmd) {
          const { commands } = loadCommandIndex();
          const hint = commands
            .filter((c) =>
              c.name
                .toLowerCase()
                .includes(targetName.trim().toLowerCase().charAt(0) || ""),
            )
            .slice(0, 5)
            .map((c) => `\`/${c.name}\``)
            .join("、");
          return interaction.reply({
            content:
              `❌ 找不到指令 \`/${targetName}\`。\n` +
              (hint
                ? `你是不是要找：${hint}？`
                : "使用 `/help` 看完整指令清單。"),
            ephemeral: true,
          });
        }
        return interaction.reply({
          embeds: [buildCommandEmbed(cmd)],
          ephemeral: true,
        });
      }

      // 瀏覽模式
      await interaction.deferReply({ ephemeral: true });

      let currentCategory = null;
      const message = await interaction.editReply({
        embeds: [buildHomeEmbed()],
        components: buildComponents(currentCategory),
      });

      const collector = message.createMessageComponentCollector({
        time: TIMEOUT_MS,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: "🚫 只有發起者能操作這個選單！",
            ephemeral: true,
          });
        }

        try {
          await i.deferUpdate();

          if (i.customId === "help_home") {
            currentCategory = null;
            await interaction.editReply({
              embeds: [buildHomeEmbed()],
              components: buildComponents(currentCategory),
            });
          } else if (
            i.customId === "help_category" &&
            i.isStringSelectMenu()
          ) {
            currentCategory = i.values[0];
            await interaction.editReply({
              embeds: [buildCategoryEmbed(currentCategory)],
              components: buildComponents(currentCategory),
            });
          }

          collector.resetTimer();
        } catch (err) {
          console.log(`[ERROR] /help 互動處理失敗：${err}`.red);
        }
      });

      collector.on("end", async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch {
          /* 訊息可能已被刪除，忽略 */
        }
      });
    } catch (error) {
      console.log(
        `[ERROR] /help 指令出錯：\n${error}\n${error.stack}`.red,
      );
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ 載入幫助手冊時發生錯誤，請稍後再試。",
          ephemeral: true,
        });
      }
    }
  },
};
