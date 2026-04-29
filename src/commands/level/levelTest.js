require("colors");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");

const grantXp = require("../../features/leveling/grantXp");
const generateLevelUpCard = require("../../utils/generateLevelUpCard");
const { getLevelProgress } = require("../../utils/levelMath");

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName("等級測試")
    .setDescription("[DEV] 等級系統測試工具")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("給xp")
        .setDescription("給自己或他人加 XP（會觸發升級流程）")
        .addIntegerOption((opt) =>
          opt
            .setName("數量")
            .setDescription("要加的 XP")
            .setMinValue(1)
            .setMaxValue(100000)
            .setRequired(true)
        )
        .addUserOption((opt) =>
          opt
            .setName("用戶")
            .setDescription("不填預設給自己")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("升級卡")
        .setDescription("純預覽升級卡（不寫 DB、不公告）")
        .addIntegerOption((opt) =>
          opt
            .setName("升級前")
            .setDescription("升級前等級")
            .setMinValue(0)
            .setMaxValue(998)
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("升級後")
            .setDescription("升級後等級")
            .setMinValue(1)
            .setMaxValue(999)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("重置等級")
        .setDescription("把自己或他人的 XP / 等級歸零（保留簽到、徽章）")
        .addUserOption((opt) =>
          opt
            .setName("用戶")
            .setDescription("不填預設重置自己")
            .setRequired(false)
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === "給xp") return grantXpCmd(client, interaction);
    if (sub === "升級卡") return previewCard(client, interaction);
    if (sub === "重置等級") return resetLevel(client, interaction);
  },
};

async function grantXpCmd(client, interaction) {
  await interaction.deferReply();
  try {
    const target = interaction.options.getUser("用戶") || interaction.user;
    const amount = interaction.options.getInteger("數量");
    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    const result = await grantXp(client, {
      userId: target.id,
      guildId: interaction.guildId,
      username: target.username,
      avatarHash: target.avatar,
      amount,
      source: "admin",
      counterField: "xpFromAdmin",
      member,
      channel: interaction.channel,
    });

    if (!result) {
      return interaction.editReply("🔧 給 XP 失敗");
    }

    await interaction.editReply(
      `✅ 已給 ${target.username} **+${amount} XP**\n` +
        `Lv.${result.before} → **Lv.${result.after}**`
    );
  } catch (error) {
    console.log(`[ERROR] /等級測試 給xp:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 給 XP 失敗，看 console").catch(() => {});
  }
}

async function previewCard(client, interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const beforeLevel = interaction.options.getInteger("升級前");
    const afterLevel = interaction.options.getInteger("升級後");

    if (afterLevel <= beforeLevel) {
      return interaction.editReply("升級後等級必須大於升級前");
    }

    const buf = await generateLevelUpCard({
      username: interaction.member?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL({
        extension: "png",
        size: 256,
      }),
      beforeLevel,
      afterLevel,
      totalXp: 9999,
    });

    const attachment = new AttachmentBuilder(buf, {
      name: `levelup-preview.png`,
    });

    const container = new ContainerBuilder()
      .setAccentColor(0xc9302c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🧪 升級卡預覽\nLv.${beforeLevel} → Lv.${afterLevel}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://levelup-preview.png`)
            .setDescription("Level up preview")
        )
      );

    await interaction.editReply({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.log(`[ERROR] /等級測試 升級卡:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 預覽失敗，看 console").catch(() => {});
  }
}

async function resetLevel(client, interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const target = interaction.options.getUser("用戶") || interaction.user;

    const before = await client.userLevelsCollection.findOne({
      userId: target.id,
      guildId: interaction.guildId,
    });
    if (!before) {
      return interaction.editReply(`${target.username} 沒有等級資料`);
    }

    await client.userLevelsCollection.updateOne(
      { _id: before._id },
      {
        $set: {
          totalXp: 0,
          level: 0,
          xpFromMessage: 0,
          xpFromVoice: 0,
          xpFromDaily: 0,
          xpFromReaction: 0,
          xpFromAdmin: 0,
          totalMessages: 0,
          totalVoiceMinutes: 0,
          totalReactionsReceived: 0,
          updatedAt: new Date(),
        },
      }
    );

    await interaction.editReply(
      `🔄 已重置 ${target.username} 的 XP 與來源計數\n` +
        `Lv.${getLevelProgress(before.totalXp).level} → Lv.0\n` +
        `（簽到、徽章、稱號、streak 不動）`
    );
  } catch (error) {
    console.log(`[ERROR] /等級測試 重置等級:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 重置失敗，看 console").catch(() => {});
  }
}
