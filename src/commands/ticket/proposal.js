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
    .setName("proposal")
    .setDescription("🗳️ 管理遊戲頻道提案投票")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("發起新遊戲頻道提案投票")
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("遊戲名稱")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("提案類型")
            .setRequired(true)
            .addChoices(
              { name: "新增頻道 (Create)", value: "create" },
              { name: "封存頻道 (Archive)", value: "archive" }
            )
        )
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "start") {
        await handleProposalStart(client, interaction);
      }
    } catch (error) {
      console.log(`[ERROR] proposal 指令執行時出錯：\n${error}\n${error.stack}`.red);
      await interaction.reply({
        content: "❌ 執行指令時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};

async function handleProposalStart(client, interaction) {
  try {
    // 檢查是否在票務頻道中
    if (!interaction.channel.name.startsWith("ticket-")) {
      return interaction.reply({
        content: "❌ 此指令只能在票務頻道中使用！",
        ephemeral: true,
      });
    }

    const gameName = interaction.options.getString("game");
    const proposalType = interaction.options.getString("type");

    // 從票務頻道的 topic 中獲取提案人 ID
    const ticketCreatorMatch = interaction.channel.topic?.match(/票務創建者：(\d+)/);
    if (!ticketCreatorMatch) {
      return interaction.reply({
        content: "❌ 無法識別票務創建者！",
        ephemeral: true,
      });
    }
    const proposerId = ticketCreatorMatch[1];

    // 檢查投票頻道是否已設置
    const votingChannelId = config.voting.votingChannelId;
    if (!votingChannelId || votingChannelId === "YOUR_VOTING_CHANNEL_ID") {
      return interaction.reply({
        content: "❌ 投票頻道尚未設置！請在 config.json 中設置 voting.votingChannelId。",
        ephemeral: true,
      });
    }

    const votingChannel = await interaction.guild.channels.fetch(votingChannelId);
    if (!votingChannel) {
      return interaction.reply({
        content: "❌ 找不到投票頻道！請檢查配置。",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // 建立投票 Embed
    const proposer = await interaction.guild.members.fetch(proposerId);
    const embedColor = proposalType === "create" ? "#00ff00" : "#ff9900";
    const embedTitle = proposalType === "create"
      ? `📊 提案：新增【${gameName}】專區`
      : `📊 提案：封存【${gameName}】專區`;

    let description = `由 ${proposer} 提出\n\n`;

    if (proposalType === "create") {
      description += "為了確保新頻道能維持活躍，我們需要統計「實際玩家」數量。\n請根據您的實際情況點擊下方按鈕：";
    } else {
      description += "如果您仍在遊玩此遊戲，請點擊下方按鈕反對封存。\n如果沒有足夠的活躍玩家，此頻道將被封存。";
    }

    const votingEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(description)
      .addFields(
        {
          name: "⏰ 投票時間",
          value: `${config.voting.voteDurationHours} 小時`,
          inline: true
        },
        {
          name: "📅 截止時間",
          value: `<t:${Math.floor(Date.now() / 1000) + (config.voting.voteDurationHours * 3600)}:R>`,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ text: `提案人：${proposer.user.tag}` });

    // 建立按鈕
    const buttons = new ActionRowBuilder();

    if (proposalType === "create") {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId("vote_player")
          .setLabel("我會玩")
          .setEmoji("🔥")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("vote_support")
          .setLabel("純支持")
          .setEmoji("👍")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("vote_no_interest")
          .setLabel("沒興趣")
          .setEmoji("😶")
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId("vote_still_playing")
          .setLabel("我還在玩")
          .setEmoji("✋")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("vote_archive_ok")
          .setLabel("同意封存")
          .setEmoji("📦")
          .setStyle(ButtonStyle.Secondary)
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
    const expiresAt = new Date(Date.now() + config.voting.voteDurationHours * 60 * 60 * 1000);

    const proposalData = {
      voteId,
      ticketChannelId: interaction.channel.id,
      proposerId,
      gameName,
      proposalType,
      status: "VOTING",
      messageId: voteMessage.id,
      channelId: votingChannel.id,
      guildId: interaction.guild.id,
      votes: proposalType === "create"
        ? { players: [], supporters: [], noInterest: [] }
        : { stillPlaying: [], archiveOk: [] },
      createdAt: new Date(),
      expiresAt,
    };

    await client.votingProposalsCollection.insertOne(proposalData);

    // 在票務頻道回覆
    await interaction.editReply({
      content: `✅ 投票已發起！\n\n🗳️ 投票連結：${voteMessage.url}\n⏰ 投票將在 ${config.voting.voteDurationHours} 小時後結束`,
    });

    // 在票務頻道發送通知
    const ticketEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("📢 投票已發起")
      .setDescription(
        `${proposer}，您的提案已進入投票階段！\n\n` +
        `**遊戲名稱：** ${gameName}\n` +
        `**提案類型：** ${proposalType === "create" ? "新增頻道" : "封存頻道"}\n\n` +
        `[點擊此處前往投票](${voteMessage.url})`
      )
      .setTimestamp();

    await interaction.channel.send({ embeds: [ticketEmbed] });

  } catch (error) {
    console.log(`[ERROR] 發起投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}
