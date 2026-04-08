const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
require("colors");

// 角色面板數據文件路徑
const PANELS_FILE = path.join(__dirname, "../../data/role-panels.json");

// 確保數據文件存在
function ensureDataFile() {
  const dataDir = path.dirname(PANELS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(PANELS_FILE)) {
    const defaultData = {
      roles: [],
      panels: {},
      targetChannelId: "",
    };
    fs.writeFileSync(PANELS_FILE, JSON.stringify(defaultData, null, 2));
  }
}

// 讀取面板數據
function loadPanels() {
  ensureDataFile();
  const data = fs.readFileSync(PANELS_FILE, "utf8");
  return JSON.parse(data);
}

// 保存面板數據
function savePanels(data) {
  ensureDataFile();
  fs.writeFileSync(PANELS_FILE, JSON.stringify(data, null, 2));
}

// 面板是靜態按鈕：按下後 bot 會即時讀取 role-panels.json 並回傳個人化選單。
// 所以新增 / 移除遊戲時不需要編輯這則訊息。
function createPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle("🎮 遊戲身份組領取")
    .setDescription(
      [
        "點擊下方按鈕開啟你的個人化遊戲身份組選單。",
        "",
        "✨ **選單會自動勾選你目前擁有的身份組**，你只需要調整想新增 / 移除的項目即可。",
        "未變更的身份組會保留，**不會因為新增遊戲而需要重選**。",
      ].join("\n"),
    );

  const button = new ButtonBuilder()
    .setCustomId("role_panel_open")
    .setLabel("領取 / 管理遊戲身份組")
    .setEmoji("🎮")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, row };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-roles")
    .setDescription("🎮 遊戲身份組選單管理")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send")
        .setDescription("在固定頻道發送角色選單（管理員）"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("新增遊戲到選單（管理員）")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("遊戲名稱（全大寫）")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("對應的身份組")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("顯示的 emoji（選填）")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("從選單移除遊戲（管理員）")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("要移除的遊戲名稱")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("列出所有已設定的遊戲角色"),
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [], // 移除全局管理員限制，改為在各子命令內檢查
  botPermissions: [PermissionFlagsBits.ManageRoles],

  run: async (client, interaction) => {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "send":
          await handleSend(client, interaction);
          break;
        case "add":
          await handleAdd(client, interaction);
          break;
        case "remove":
          await handleRemove(client, interaction);
          break;
        case "list":
          await handleList(client, interaction);
          break;
      }
    } catch (error) {
      console.log(`[ERROR] 執行 setup-roles 指令時出錯：\n${error}`.red);

      // 只在還沒回覆時才回覆錯誤訊息
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ 執行指令時發生錯誤！",
          flags: 64, // MessageFlags.Ephemeral
        });
      }
    }
  },
};

async function handleSend(client, interaction) {
  // 檢查管理員權限
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ 此功能僅限管理員使用！",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  const data = loadPanels();

  if (!data.targetChannelId) {
    return interaction.reply({
      content:
        "❌ 未設定目標頻道 ID！請在 role-panels.json 中設定 targetChannelId。",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  if (data.roles.length === 0) {
    return interaction.reply({
      content:
        "❌ 尚未設定任何遊戲角色！請先使用 `/setup-roles add` 新增遊戲。",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  try {
    const channel = await client.channels.fetch(data.targetChannelId);
    if (!channel) {
      return interaction.reply({
        content: "❌ 找不到目標頻道！請確認頻道 ID 正確。",
        flags: 64, // MessageFlags.Ephemeral
      });
    }

    // 刪除舊的面板訊息（包含舊版多頁選單）
    const oldMessageIds = Object.keys(data.panels || {});
    await Promise.all(
      oldMessageIds.map(async (oldMessageId) => {
        try {
          const oldMessage = await channel.messages.fetch(oldMessageId);
          await oldMessage.delete();
        } catch (error) {
          console.log(
            `[WARNING] 無法刪除舊面板訊息 ${oldMessageId}：${error.message}`
              .yellow,
          );
        }
      }),
    );
    data.panels = {};

    const { embed, row } = createPanelMessage();
    const message = await channel.send({
      embeds: [embed],
      components: [row],
    });

    data.panels[message.id] = true;
    savePanels(data);

    await interaction.reply({
      content: `✅ 已在 <#${data.targetChannelId}> 發送遊戲身份組面板！`,
      flags: 64, // MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(`[ERROR] 發送角色選單時出錯：${error}`.red);

    // 如果還沒回覆，則回覆錯誤訊息
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ 發送角色選單時發生錯誤！請檢查 bot 權限和頻道設定。",
        flags: 64, // MessageFlags.Ephemeral
      });
    }
  }
}

async function handleAdd(client, interaction) {
  // 檢查管理員權限
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ 此功能僅限管理員使用！",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  const name = interaction.options.getString("name").toUpperCase();
  const role = interaction.options.getRole("role");
  const emoji = interaction.options.getString("emoji");

  const data = loadPanels();

  // 檢查是否已存在
  const exists = data.roles.find(
    (r) => r.name === name || r.roleId === role.id,
  );
  if (exists) {
    return interaction.reply({
      content: "❌ 此遊戲或身份組已存在於選單中！",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  // 新增角色
  const newRole = {
    name,
    roleId: role.id,
  };
  if (emoji) {
    newRole.emoji = emoji;
  }
  data.roles.push(newRole);

  savePanels(data);

  const emojiText = emoji ? `${emoji} ` : "";
  await interaction.reply({
    content: `✅ 已新增遊戲：${emojiText}${name} (${role})！\n下次使用者點擊面板按鈕時會看到此選項。`,
    flags: 64, // MessageFlags.Ephemeral
  });
}

async function handleRemove(client, interaction) {
  // 檢查管理員權限
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ 此功能僅限管理員使用！",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  const name = interaction.options.getString("name").toUpperCase();
  const data = loadPanels();

  const index = data.roles.findIndex((r) => r.name === name);
  if (index === -1) {
    return interaction.reply({
      content: "❌ 找不到此遊戲！",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  const removed = data.roles.splice(index, 1)[0];
  savePanels(data);

  const emojiText = removed.emoji ? `${removed.emoji} ` : "";
  await interaction.reply({
    content: `✅ 已移除遊戲：${emojiText}${removed.name}！\n下次使用者點擊面板按鈕時即看不到此選項。`,
    flags: 64, // MessageFlags.Ephemeral
  });
}

async function handleList(client, interaction) {
  const data = loadPanels();

  if (data.roles.length === 0) {
    return interaction.reply({
      content: "❌ 目前沒有任何遊戲角色設定。",
      flags: 64, // MessageFlags.Ephemeral
    });
  }

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle("🎮 已設定的遊戲角色")
    .setDescription(
      data.roles
        .map((role, index) => {
          const emojiText = role.emoji ? `${role.emoji} ` : "";
          return `**${index + 1}.** ${emojiText}${role.name} - <@&${role.roleId}>`;
        })
        .join("\n"),
    )
    .setFooter({ text: `共 ${data.roles.length} 個遊戲` })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: 64, // MessageFlags.Ephemeral
  });
}
