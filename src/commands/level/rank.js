require("colors");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");

const { getLevelProgress } = require("../../utils/levelMath");
const { getTier } = require("../../utils/levelTier");

const PAGE_SIZE = 10;
const PAGINATION_TIMEOUT = 5 * 60 * 1000;

function buildButtons(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("first")
      .setLabel("⏮️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("page_info")
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1),
    new ButtonBuilder()
      .setCustomId("last")
      .setLabel("⏭️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
}

function renderRow(doc, globalIndex) {
  const prog = getLevelProgress(doc.totalXp);
  const tier = getTier(prog.level);
  const medals = ["🥇", "🥈", "🥉"];
  const medal = medals[globalIndex] || `**${globalIndex + 1}.**`;
  return `${medal} <@${doc.userId}> ・ ${tier.emoji} **Lv.${prog.level}** ・ ${doc.totalXp.toLocaleString()} XP`;
}

function buildContainer({
  guildName,
  pageDocs,
  currentPage,
  totalPages,
  total,
  myRank,
  myDoc,
  withControls = true,
}) {
  const container = new ContainerBuilder()
    .setAccentColor(0xffd700)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🏆 ${guildName} 等級排行榜`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
    );

  if (pageDocs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("（這頁沒有資料）")
    );
  } else {
    const offset = currentPage * PAGE_SIZE;
    const lines = pageDocs.map((d, i) => renderRow(d, offset + i));

    // 第一頁前 3 名分區塊顯示
    if (currentPage === 0 && pageDocs.length > 3) {
      const top3 = lines.slice(0, 3).join("\n");
      const rest = lines.slice(3).join("\n");
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(top3)
      );
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(rest)
        );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lines.join("\n"))
      );
    }
  }

  if (myRank && myDoc) {
    const myProg = getLevelProgress(myDoc.totalXp);
    const myTier = getTier(myProg.level);
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**你的排名**：#${myRank} ・ ${myTier.emoji} Lv.${myProg.level} ・ ${myDoc.totalXp.toLocaleString()} XP`
        )
      );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 第 ${currentPage + 1} / ${totalPages} 頁 ・ 共 ${total} 人 ・ 用 \`/等級卡\` 看詳細卡片`
      )
    );

  if (totalPages > 1 && withControls) {
    container.addActionRowComponents(buildButtons(currentPage, totalPages));
  }

  return container;
}

async function fetchPage(client, guildId, page) {
  return client.userLevelsCollection
    .find({ guildId })
    .sort({ totalXp: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("等級排行榜")
    .setDescription("查看伺服器等級排行榜 🏆")
    .setDMPermission(false),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!client.userLevelsCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動");
      }

      const total = await client.userLevelsCollection.countDocuments({
        guildId: interaction.guildId,
      });

      if (total === 0) {
        return interaction.editReply("📊 還沒有人累積等級資料～");
      }

      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      const myDoc = await client.userLevelsCollection.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      let myRank = null;
      if (myDoc) {
        myRank =
          (await client.userLevelsCollection.countDocuments({
            guildId: interaction.guildId,
            totalXp: { $gt: myDoc.totalXp },
          })) + 1;
      }

      let currentPage = 0;
      let pageDocs = await fetchPage(client, interaction.guildId, currentPage);

      const message = await interaction.editReply({
        components: [
          buildContainer({
            guildName: interaction.guild.name,
            pageDocs,
            currentPage,
            totalPages,
            total,
            myRank,
            myDoc,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      if (totalPages <= 1) return;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATION_TIMEOUT,
      });

      collector.on("collect", async (btn) => {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({
            content: "這不是你的排行榜！",
            ephemeral: true,
          });
        }

        switch (btn.customId) {
          case "first":
            currentPage = 0;
            break;
          case "prev":
            currentPage = Math.max(0, currentPage - 1);
            break;
          case "next":
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;
          case "last":
            currentPage = totalPages - 1;
            break;
        }

        pageDocs = await fetchPage(client, interaction.guildId, currentPage);

        await btn.update({
          components: [
            buildContainer({
              guildName: interaction.guild.name,
              pageDocs,
              currentPage,
              totalPages,
              total,
              myRank,
              myDoc,
            }),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      });

      collector.on("end", () => {
        interaction
          .editReply({
            components: [
              buildContainer({
                guildName: interaction.guild.name,
                pageDocs,
                currentPage,
                totalPages,
                total,
                myRank,
                myDoc,
                withControls: false,
              }),
            ],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      });
    } catch (error) {
      console.log(`[ERROR] /等級排行榜:\n${error}\n${error.stack}`.red);
      await interaction.editReply("🔧 排行榜載入失敗！").catch(() => {});
    }
  },
};
