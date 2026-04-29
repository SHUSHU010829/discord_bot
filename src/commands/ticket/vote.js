const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config.json");
const { randomUUID } = require("crypto");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("🗳️ 發起投票提案")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("建立新的投票")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("選擇投票模板")
            .setRequired(true)
            .addChoices(
              { name: "🎮 遊戲頻道新增", value: "game_create" },
              { name: "📦 遊戲頻道封存", value: "game_archive" },
              { name: "🎉 活動提案", value: "event" },
              { name: "📜 規則修改", value: "rule_change" },
              { name: "💡 一般提案", value: "general" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("投票標題（例如：遊戲名稱、活動名稱、規則描述）")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("投票詳細說明（可選）")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("投票時長（小時，預設 24 小時）")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("指定投票頻道（可選，預設使用設定的投票頻道）")
            .setRequired(false)
        )
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "create") {
        await handleVoteCreate(client, interaction);
      }
    } catch (error) {
      console.log(`[ERROR] vote 指令執行時出錯：\n${error}\n${error.stack}`.red);
      await interaction.reply({
        content: "❌ 執行指令時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};

async function handleVoteCreate(client, interaction) {
  try {
    const templateKey = interaction.options.getString("template");
    const title = interaction.options.getString("title");
    const customDescription = interaction.options.getString("description");
    const duration = interaction.options.getInteger("duration") || config.voting.defaultDurationHours;
    const customChannel = interaction.options.getChannel("channel");

    // 獲取模板配置
    const template = config.voting.templates[templateKey];
    if (!template) {
      return interaction.reply({
        content: "❌ 找不到指定的投票模板！",
        ephemeral: true,
      });
    }

    // 確定投票頻道
    let votingChannel;
    if (customChannel) {
      votingChannel = customChannel;
    } else {
      const votingChannelId = config.voting.votingChannelId;
      if (!votingChannelId || votingChannelId === "YOUR_VOTING_CHANNEL_ID") {
        return interaction.reply({
          content: "❌ 投票頻道尚未設置！請在 config.json 中設置 voting.votingChannelId 或使用 channel 參數指定頻道。",
          ephemeral: true,
        });
      }
      votingChannel = await interaction.guild.channels.fetch(votingChannelId);
    }

    if (!votingChannel) {
      return interaction.reply({
        content: "❌ 找不到投票頻道！請檢查配置。",
        ephemeral: true,
      });
    }

    // 檢查是否在 Ticket 頻道中（可選綁定）
    const isTicketChannel = interaction.channel.name.startsWith("ticket-");
    let ticketChannelId = null;
    let proposerId = interaction.user.id;

    if (isTicketChannel) {
      ticketChannelId = interaction.channel.id;
      // 嘗試從 Ticket topic 獲取創建者
      const ticketCreatorMatch = interaction.channel.topic?.match(/票務創建者：(\d+)/);
      if (ticketCreatorMatch) {
        proposerId = ticketCreatorMatch[1];
      }
    }

    await interaction.deferReply({ ephemeral: true });

    // 建立投票 Embed
    const proposer = await interaction.guild.members.fetch(proposerId);
    const embedColor = getTemplateColor(templateKey);

    let description = customDescription || template.description;
    description = `由 ${proposer} 提出\n\n${description}`;

    const votingEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${template.emoji} 提案：${title}`)
      .setDescription(description)
      .addFields(
        {
          name: "📋 投票類型",
          value: template.name,
          inline: true
        },
        {
          name: "⏰ 投票時間",
          value: `${duration} 小時`,
          inline: true
        },
        {
          name: "📅 截止時間",
          value: `<t:${Math.floor(Date.now() / 1000) + (duration * 3600)}:R>`,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ text: `提案人：${proposer.user.tag}` });

    // 建立按鈕
    const buttons = new ActionRowBuilder();
    for (const btn of template.buttons) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_${templateKey}_${btn.id}`)
          .setLabel(btn.label)
          .setEmoji(btn.emoji)
          .setStyle(ButtonStyle[btn.style])
      );
    }

    // 發送投票訊息
    const voteMessage = await votingChannel.send({
      embeds: [votingEmbed],
      components: [buttons],
    });

    // 生成唯一 ID
    const voteId = randomUUID();

    // 儲存投票資料到資料庫
    const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);

    // 初始化投票計數物件
    const votes = {};
    for (const btn of template.buttons) {
      votes[btn.id] = [];
    }

    const proposalData = {
      voteId,
      ticketChannelId,
      proposerId,
      title,
      templateKey,
      customDescription,
      status: "VOTING",
      messageId: voteMessage.id,
      channelId: votingChannel.id,
      guildId: interaction.guild.id,
      votes,
      createdAt: new Date(),
      expiresAt,
      duration,
    };

    await client.votingProposalsCollection.insertOne(proposalData);

    // 回覆成功
    let replyContent = `✅ 投票已發起！\n\n🗳️ 投票連結：${voteMessage.url}\n⏰ 投票將在 ${duration} 小時後結束`;

    await interaction.editReply({
      content: replyContent,
    });

    // 如果在 Ticket 頻道，發送通知
    if (isTicketChannel) {
      const ticketEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("📢 投票已發起")
        .setDescription(
          `${proposer}，您的提案已進入投票階段！\n\n` +
          `**提案標題：** ${title}\n` +
          `**投票類型：** ${template.name}\n\n` +
          `[點擊此處前往投票](${voteMessage.url})`
        )
        .setTimestamp();

      await interaction.channel.send({ embeds: [ticketEmbed] });
    }

  } catch (error) {
    console.log(`[ERROR] 發起投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

function getTemplateColor(templateKey) {
  const colors = {
    game_create: "#00ff00",
    game_archive: "#ff9900",
    event: "#9b59b6",
    rule_change: "#3498db",
    general: "#95a5a6"
  };
  return colors[templateKey] || "#0099ff";
}
