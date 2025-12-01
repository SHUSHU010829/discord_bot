require("colors");
const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");
const config = require("../../config.json");

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;

    // 處理票務按鈕
    if (interaction.customId === "create_ticket") {
      await handleTicketCreation(interaction);
      return;
    }

    // 處理身份組按鈕
    const role = interaction.guild.roles.cache.get(interaction.customId);
    if (!role) {
      return interaction.reply({
        content: "無法找到該身份組！",
        ephemeral: true,
      });
    }

    const hasRole = interaction.member.roles.cache.has(role.id);
    if (hasRole) {
      await interaction.member.roles.remove(role);
      return interaction.reply({
        content: `已經移除了身份組：${role.name}`,
        ephemeral: true,
      });
    } else {
      await interaction.member.roles.add(role);
      return interaction.reply({
        content: `已經成功給予身份組：${role.name}`,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.log(`[ERROR] 處理互動時出錯：\n${error}`.red);
  }
};

async function handleTicketCreation(interaction) {
  try {
    // 檢查用戶是否已經有票務
    const existingTicket = interaction.guild.channels.cache.find(
      (channel) =>
        channel.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        channel.type === ChannelType.GuildText
    );

    if (existingTicket) {
      return interaction.reply({
        content: config.ticket.alreadyHasTicket,
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: config.ticket.ticketCreating,
      ephemeral: true,
    });

    // 創建票務頻道
    const ticketChannel = await interaction.guild.channels.create({
      name: config.ticket.ticketNameFormat.replace(
        "{username}",
        interaction.user.username.toLowerCase()
      ),
      type: ChannelType.GuildText,
      parent: config.ticket.categoryId || null,
      topic: `票務創建者：${interaction.user.id}`,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    // 如果有支援團隊身份組，添加權限
    if (config.ticket.supportRoleId && config.ticket.supportRoleId !== "YOUR_SUPPORT_ROLE_ID") {
      await ticketChannel.permissionOverwrites.create(
        config.ticket.supportRoleId,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }
      );
    }

    // 發送歡迎訊息
    const welcomeEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎫 票務已創建")
      .setDescription(
        config.ticket.welcomeMessage.replace("{user}", interaction.user.toString())
      )
      .setTimestamp();

    await ticketChannel.send({
      content: `${interaction.user}`,
      embeds: [welcomeEmbed],
    });

    await interaction.editReply({
      content: config.ticket.ticketCreated.replace(
        "{channel}",
        ticketChannel.toString()
      ),
      ephemeral: true,
    });
  } catch (error) {
    console.log(`[ERROR] 創建票務時出錯：\n${error}`.red);
    await interaction.editReply({
      content: "❌ 創建票務時發生錯誤！請聯絡管理員。",
      ephemeral: true,
    });
  }
}
