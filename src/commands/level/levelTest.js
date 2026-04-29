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
    .setName("leveltest")
    .setDescription("[DEV ONLY] 等級系統測試工具")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("givexp")
        .setDescription("給自己或他人加 XP（會觸發升級流程）")
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("要加的 XP")
            .setMinValue(1)
            .setMaxValue(100000)
            .setRequired(true)
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("不填預設給自己")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("levelupcard")
        .setDescription("純預覽升級卡（不寫 DB、不公告）")
        .addIntegerOption((opt) =>
          opt
            .setName("from")
            .setDescription("升級前等級")
            .setMinValue(0)
            .setMaxValue(998)
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("to")
            .setDescription("升級後等級")
            .setMinValue(1)
            .setMaxValue(999)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("把自己或他人的 XP / 等級歸零（保留簽到、徽章）")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("不填預設重置自己")
            .setRequired(false)
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === "givexp") return grantXpCmd(client, interaction);
    if (sub === "levelupcard") return previewCard(client, interaction);
    if (sub === "reset") return resetLevel(client, interaction);
  },
};

async function grantXpCmd(client, interaction) {
  await interaction.deferReply();
  try {
    const target = interaction.options.getUser("user") || interaction.user;
    const amount = interaction.options.getInteger("amount");
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
    console.log(`[ERROR] /leveltest givexp:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 給 XP 失敗，看 console").catch(() => {});
  }
}

async function previewCard(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const beforeLevel = interaction.options.getInteger("from");
    const afterLevel = interaction.options.getInteger("to");

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
    console.log(`[ERROR] /leveltest levelupcard:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 預覽失敗，看 console").catch(() => {});
  }
}

async function resetLevel(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const target = interaction.options.getUser("user") || interaction.user;

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
    console.log(`[ERROR] /leveltest reset:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 重置失敗，看 console").catch(() => {});
  }
}
