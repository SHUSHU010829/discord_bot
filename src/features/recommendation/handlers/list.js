require("colors");

const {
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

const {
  TYPE_DISPLAY,
  TYPE_LABEL,
} = require("../../../constants/recommendationCategories");

const ITEMS_PER_PAGE = 5;
const PAGINATION_TIMEOUT = 5 * 60 * 1000;
const ACCENT_COLOR = 0xff8c69;

function formatEntry(doc, index) {
  const head = `**${index}. ${doc.name || "(未命名)"}**`;
  const meta = [];
  meta.push(`${TYPE_DISPLAY[doc.type] || "📌 其他"}`);
  if (doc.cuisine) meta.push(`🍴 ${doc.cuisine}`);
  if (doc.area) meta.push(`📍 ${doc.area}`);

  const lines = [head, meta.join("　|　")];
  if (doc.summary) lines.push(`> ${doc.summary}`);
  const links = [];
  if (Array.isArray(doc.mapUrls) && doc.mapUrls[0]) {
    links.push(`[🗺️ Google 地圖](${doc.mapUrls[0]})`);
  }
  if (doc.messageUrl) links.push(`[💬 原始訊息](${doc.messageUrl})`);
  if (links.length > 0) lines.push(links.join("　"));
  return lines.join("\n");
}

function buildPage(docs, page, totalPages, headerTitle) {
  const start = page * ITEMS_PER_PAGE;
  const slice = docs.slice(start, start + ITEMS_PER_PAGE);
  const body =
    slice.length === 0
      ? "（無資料）"
      : slice.map((d, i) => formatEntry(d, start + i + 1)).join("\n\n");

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerTitle))
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

  if (totalPages > 1) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 第 ${page + 1} / ${totalPages} 頁　共 ${docs.length} 筆`,
        ),
      );
  } else {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# 共 ${docs.length} 筆`),
      );
  }
  return container;
}

function buttons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rec_first")
      .setLabel("⏮️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("rec_prev")
      .setLabel("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("rec_page")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("rec_next")
      .setLabel("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages - 1),
    new ButtonBuilder()
      .setCustomId("rec_last")
      .setLabel("⏭️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages - 1),
  );
}

async function run(client, interaction) {
  const collection = client.recommendationsCollection;
  if (!collection) {
    await interaction.reply({
      content: "🔧 推薦資料庫尚未就緒，請稍後再試。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const type = interaction.options.getString("類別");
  const area = interaction.options.getString("地區");

  await interaction.deferReply();

  const query = { guildId: interaction.guild.id };
  if (type) query.type = type;
  if (area) query.area = { $regex: area, $options: "i" };

  try {
    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    if (docs.length === 0) {
      const note = type
        ? `目前沒有「${TYPE_LABEL[type] || type}」類別的推薦${area ? `（地區：${area}）` : ""}。`
        : `目前還沒有任何推薦${area ? `（地區：${area}）` : ""}。`;
      await interaction.editReply(note);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(docs.length / ITEMS_PER_PAGE));
    let page = 0;
    const headerBits = ["## 📒 推薦清單"];
    if (type) headerBits.push(`類別：${TYPE_DISPLAY[type] || type}`);
    if (area) headerBits.push(`地區：${area}`);
    const headerTitle = headerBits.join("　|　");

    const payload = {
      components: [
        buildPage(docs, page, totalPages, headerTitle),
        ...(totalPages > 1 ? [buttons(page, totalPages)] : []),
      ],
      flags: MessageFlags.IsComponentsV2,
    };
    const message = await interaction.editReply(payload);

    if (totalPages <= 1) return;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: PAGINATION_TIMEOUT,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: "這不是你的清單！請自行使用 /推薦清單 查看。",
          flags: MessageFlags.Ephemeral,
        });
      }
      switch (btn.customId) {
        case "rec_first":
          page = 0;
          break;
        case "rec_prev":
          page = Math.max(0, page - 1);
          break;
        case "rec_next":
          page = Math.min(totalPages - 1, page + 1);
          break;
        case "rec_last":
          page = totalPages - 1;
          break;
      }
      await btn.update({
        components: [
          buildPage(docs, page, totalPages, headerTitle),
          buttons(page, totalPages),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on("end", () => {
      interaction
        .editReply({
          components: [buildPage(docs, page, totalPages, headerTitle)],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    });
  } catch (error) {
    console.log(`[ERROR] 推薦清單失敗：\n${error}`.red);
    await interaction.editReply("🔧 查詢推薦清單失敗，請稍後再試。").catch(() => {});
  }
}

module.exports = { run };
