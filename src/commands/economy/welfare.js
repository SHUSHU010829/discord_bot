require("colors");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");

const { welfareSystem } = require("../../config");
const welfareService = require("../../features/welfare/welfareService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("乞討")
    .setDescription("破產時領取救濟金 🪙")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("狀態").setDescription("查看救濟金資格與連續天數")
    ),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!welfareSystem?.enabled) {
        return interaction.editReply("🔧 救濟金系統尚未啟動！");
      }
      if (!client.welfareClaimsCollection || !client.userCoinsCollection) {
        return interaction.editReply("🔧 救濟金系統尚未啟動，請聯絡舒舒！");
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username =
        interaction.member?.displayName || interaction.user.username;

      const sub = interaction.options.getSubcommand(false);

      if (sub === "狀態") {
        return showStatus(client, interaction, userId, guildId);
      }

      // 預設：嘗試領取
      const result = await welfareService.claim(
        client,
        userId,
        guildId,
        interaction.member,
        interaction.user.username
      );

      if (!result.ok) {
        return replyClaimFailure(interaction, result, username);
      }

      const container = new ContainerBuilder()
        .setAccentColor(0xc9302c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🪙 救濟金到手\n**+${result.amount.toLocaleString()}** 💰 ・ 連續 **${result.streak}** 天`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `目前餘額：**${(result.newBalance ?? 0).toLocaleString()}** 🪙\n下次可領：<t:${result.resetEpoch}:R>（<t:${result.resetEpoch}:t>）`
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 救濟金不會無限發給你，記得連續來領才能拿加成（最高 800/日）。`
          )
        );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.log(`[ERROR] /乞討:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 領取失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};

async function showStatus(client, interaction, userId, guildId) {
  const status = await welfareService.getStatus(client, userId, guildId);
  const eligible = status.eligibleByBalance && !status.claimedToday;

  const lines = [
    `## 🪙 救濟金狀態`,
    `目前餘額：**${status.balance.toLocaleString()}** 🪙（門檻 ≤ ${status.threshold}）`,
    `連續天數：**${status.streak}** 天 ・ 歷史最高：${status.longestStreak} 天 ・ 累計領取：${status.totalClaims} 次`,
  ];

  if (status.claimedToday) {
    lines.push(
      `\n✅ 今日已領取，下次可領：<t:${status.resetEpoch}:R>（<t:${status.resetEpoch}:t>）`
    );
  } else if (!status.eligibleByBalance) {
    lines.push(`\n💰 目前金幣超過救濟線，先去玩玩看吧。`);
  } else {
    lines.push(
      `\n✅ **可領取** ${status.nextAmount.toLocaleString()} 🪙（連續第 ${status.nextStreak} 天）`
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(eligible ? 0x4caf50 : 0x9e9e9e)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join("\n"))
    );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

function replyClaimFailure(interaction, result, username) {
  if (result.reason === "above_threshold") {
    return interaction.editReply(
      `💰 目前金幣 **${result.balance.toLocaleString()}** 🪙，超過救濟線 ${result.threshold}，先去玩玩看吧！`
    );
  }
  if (result.reason === "already_claimed") {
    return interaction.editReply(
      `🪙 今天已經領過了！連續 **${result.streak}** 天\n下次可領：<t:${result.resetEpoch}:R>（<t:${result.resetEpoch}:t>）`
    );
  }
  if (result.reason === "race_lost") {
    return interaction.editReply(
      `⏳ 剛剛已經幫你領過了，請稍後用 \`/乞討 狀態\` 確認餘額。`
    );
  }
  if (result.reason === "grant_failed") {
    return interaction.editReply(
      `🔧 系統發放失敗，請稍後再試或聯絡舒舒。`
    );
  }
  return interaction.editReply("🔧 領取失敗，請聯絡舒舒。");
}
