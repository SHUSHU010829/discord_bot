require("colors");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");

const { spin } = require("../../features/casino/slot/slotMachine");
const { SYMBOL_BY_ID } = require("../../features/casino/slot/paytable");
const generateSlotCard = require("../../utils/generateSlotCard");

const PREVIEW_CHOICES = [
  { name: "JACKPOT (七七七)", value: "jackpot" },
  { name: "三連線 (三星)", value: "triple" },
  { name: "兩個櫻桃", value: "double_cherry" },
  { name: "兩個一樣", value: "double" },
  { name: "沒中", value: "none" },
];

function buildPreviewReels(kind) {
  const sym = (id) => ({ id, emoji: SYMBOL_BY_ID[id].emoji });
  switch (kind) {
    case "jackpot":
      return { reels: [sym("seven"), sym("seven"), sym("seven")], matchType: "jackpot", matchedSymbol: "seven", multiplier: 500 };
    case "triple":
      return { reels: [sym("star"), sym("star"), sym("star")], matchType: "triple", matchedSymbol: "star", multiplier: 80 };
    case "double_cherry":
      return { reels: [sym("cherry"), sym("cherry"), sym("lemon")], matchType: "double_cherry", matchedSymbol: "cherry", multiplier: 1.5 };
    case "double":
      return { reels: [sym("bell"), sym("watermelon"), sym("bell")], matchType: "double", matchedSymbol: "bell", multiplier: 0.5 };
    default:
      return { reels: [sym("cherry"), sym("lemon"), sym("watermelon")], matchType: "none", matchedSymbol: null, multiplier: 0 };
  }
}

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName("slottest")
    .setDescription("[DEV ONLY] 吃角子老虎測試工具")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("spin")
        .setDescription("跑一次抽獎，回傳純 JSON（不扣錢、不出圖）")
        .addIntegerOption((opt) =>
          opt
            .setName("bet")
            .setDescription("下注金額（僅用於計算 payout）")
            .setMinValue(1)
            .setMaxValue(10000)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("預覽指定狀態的圖卡（不寫 DB）")
        .addStringOption((opt) =>
          opt
            .setName("kind")
            .setDescription("狀態")
            .setRequired(true)
            .addChoices(...PREVIEW_CHOICES)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("bet")
            .setDescription("下注金額")
            .setMinValue(1)
            .setMaxValue(10000)
            .setRequired(false)
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === "spin") return runSpin(interaction);
    if (sub === "preview") return runPreview(interaction);
  },
};

async function runSpin(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const bet = interaction.options.getInteger("bet");
    const result = spin({ bet });
    const json = JSON.stringify(result, null, 2);
    await interaction.editReply(`\`\`\`json\n${json}\n\`\`\``);
  } catch (error) {
    console.log(`[ERROR] /slottest spin:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 spin 失敗，看 console").catch(() => {});
  }
}

async function runPreview(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const kind = interaction.options.getString("kind");
    const bet = interaction.options.getInteger("bet") ?? 100;
    const preview = buildPreviewReels(kind);
    const payout = Math.floor(bet * preview.multiplier);

    const buf = await generateSlotCard({
      userId: interaction.user.id,
      username: interaction.member?.displayName || interaction.user.username,
      reels: preview.reels,
      matchType: preview.matchType,
      matchedSymbol: preview.matchedSymbol,
      bet,
      payout,
      multiplier: preview.multiplier,
      balance: 9999,
    });

    const attachment = new AttachmentBuilder(buf, {
      name: `slot-preview-${kind}.png`,
    });

    await interaction.editReply({
      content: `🧪 預覽 \`${kind}\`（bet=${bet}, payout=${payout}）`,
      files: [attachment],
    });
  } catch (error) {
    console.log(`[ERROR] /slottest preview:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 preview 失敗，看 console").catch(() => {});
  }
}
