const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config");
const { randomUUID } = require("crypto");
const { finalizeProposal } = require("../../features/voting/finalizeProposal");

const PROPOSAL_TYPE_TO_TEMPLATE = {
  create: "game_create",
  archive: "game_archive",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("proposal")
    .setDescription("[ADMIN] 🗳️ Manage game-channel proposal votes (admin only)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start a new game-channel proposal vote")
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("Game name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Proposal type")
            .setRequired(true)
            .addChoices(
              { name: "Create channel", value: "create" },
              { name: "Archive channel", value: "archive" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("⏭️ End an ongoing vote early (admin only)")
        .addStringOption((option) =>
          option
            .setName("message_url")
            .setDescription("URL of the vote message")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("🗑️ Cancel an ongoing vote (admin only)")
        .addStringOption((option) =>
          option
            .setName("message_url")
            .setDescription("URL of the vote message")
            .setRequired(true)
        )
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "start") {
        await handleProposalStart(client, interaction);
      } else if (subcommand === "end") {
        await handleProposalEndCommand(client, interaction);
      } else if (subcommand === "cancel") {
        await handleProposalCancelCommand(client, interaction);
      }
    } catch (error) {
      console.log(`[ERROR] proposal 指令執行時出錯：\n${error}\n${error.stack}`.red);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ 執行指令時發生錯誤！",
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "❌ 執行指令時發生錯誤！",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};

async function handleProposalStart(client, interaction) {
  await interaction.deferReply({ ephemeral: true });

  const gameName = interaction.options.getString("game");
  const proposalType = interaction.options.getString("type");
  const templateKey = PROPOSAL_TYPE_TO_TEMPLATE[proposalType];
  const template = config.voting.templates[templateKey];

  if (!template) {
    return interaction.editReply({
      content: `❌ 找不到對應的投票模板：${templateKey}`,
    });
  }

  const proposerId = interaction.user.id;

  const votingChannelId = config.voting.votingChannelId;
  if (!votingChannelId || votingChannelId === "YOUR_VOTING_CHANNEL_ID") {
    return interaction.editReply({
      content: "❌ 投票頻道尚未設置！請在 config.json 中設置 voting.votingChannelId。",
    });
  }

  const votingChannel = await interaction.guild.channels.fetch(votingChannelId);
  if (!votingChannel) {
    return interaction.editReply({
      content: "❌ 找不到投票頻道！請檢查配置。",
    });
  }

  const proposer = await interaction.guild.members.fetch(proposerId);
  const duration =
    config.voting.voteDurationHours || config.voting.defaultDurationHours || 48;
  const title =
    proposalType === "create"
      ? `新增【${gameName}】專區`
      : `封存【${gameName}】專區`;

  const description =
    `由 ${proposer} 提出\n\n${template.description}`;

  const votingEmbed = new EmbedBuilder()
    .setColor(proposalType === "create" ? "#00ff00" : "#ff9900")
    .setTitle(`${template.emoji} 提案：${title}`)
    .setDescription(description)
    .addFields(
      {
        name: "📋 投票類型",
        value: template.name,
        inline: true,
      },
      {
        name: "⏰ 投票時間",
        value: `${duration} 小時`,
        inline: true,
      },
      {
        name: "📅 截止時間",
        value: `<t:${Math.floor(Date.now() / 1000) + duration * 3600}:R>`,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: `提案人：${proposer.user.tag}` });

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

  const voteMessage = await votingChannel.send({
    embeds: [votingEmbed],
    components: [buttons],
  });

  const voteId = randomUUID();
  const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);

  const votes = {};
  for (const btn of template.buttons) votes[btn.id] = [];

  const proposalData = {
    voteId,
    ticketChannelId: interaction.channel.id,
    proposerId,
    title,
    gameName, // 保留方便查詢
    templateKey,
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

  await interaction.editReply({
    content: `✅ 投票已發起！\n\n🗳️ 投票連結：${voteMessage.url}\n⏰ 投票將在 ${duration} 小時後結束`,
  });

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
}

async function handleProposalEndCommand(client, interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ 只有管理員才能使用此功能！",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const messageUrl = interaction.options.getString("message_url");
  const messageId = extractMessageId(messageUrl);

  if (!messageId) {
    return interaction.editReply({
      content: "❌ 無效的訊息網址！請提供正確的 Discord 訊息連結。",
    });
  }

  const proposal = await client.votingProposalsCollection.findOne({
    messageId,
    status: "VOTING",
  });

  if (!proposal) {
    return interaction.editReply({
      content: "❌ 找不到進行中的投票！請確認訊息網址是否正確，或投票是否已結束。",
    });
  }

  const outcome = await finalizeProposal(client, proposal, {
    reason: "manual_end",
    endedBy: interaction.user.id,
  });

  const title = proposal.title || proposal.gameName || "提案";
  await interaction.editReply({
    content: outcome
      ? `✅ 投票已提早結束！\n**提案：** ${title}\n**結果：** ${outcome.passed ? "✅ 通過" : "❌ 未通過"}`
      : "✅ 投票已提早結束！",
  });
}

async function handleProposalCancelCommand(client, interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ 只有管理員才能使用此功能！",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const messageUrl = interaction.options.getString("message_url");
  const messageId = extractMessageId(messageUrl);

  if (!messageId) {
    return interaction.editReply({
      content: "❌ 無效的訊息網址！請提供正確的 Discord 訊息連結。",
    });
  }

  const proposal = await client.votingProposalsCollection.findOne({
    messageId,
    status: "VOTING",
  });

  if (!proposal) {
    return interaction.editReply({
      content: "❌ 找不到進行中的投票！請確認訊息網址是否正確，或投票是否已結束。",
    });
  }

  await finalizeProposal(client, proposal, {
    reason: "cancelled",
    endedBy: interaction.user.id,
  });

  const title = proposal.title || proposal.gameName || "提案";
  await interaction.editReply({
    content: `✅ 投票已取消！\n**提案：** ${title}`,
  });
}

function extractMessageId(url) {
  try {
    const match = url.match(/\/channels\/\d+\/\d+\/(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}
