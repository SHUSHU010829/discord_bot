require('colors');
const crypto = require('crypto');
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { coinSystem, casino } = require('../../config');
const grantCoins = require('../../features/economy/grantCoins');
const { BET_TYPES } = require('../../features/casino/roulette/numbers');
const { totalWagered } = require('../../features/casino/roulette/engine');

function getCfg() {
  return casino?.roulette || {};
}

function unitAmount(remaining) {
  return Math.floor(remaining / 3);
}

/** 外圍及操作按鈕列 */
function buildBettingRows(gameId, remainingBudget) {
  const unitDisabled = unitAmount(remainingBudget) <= 0;
  const budgetEmpty = remainingBudget <= 0;

  const unitBtn = (type, label, style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`rl_outside_${type}_${gameId}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(unitDisabled);

  const row1 = new ActionRowBuilder().addComponents(
    unitBtn('red',   '🔴 紅色', ButtonStyle.Danger),
    unitBtn('black', '⚫ 黑色'),
    unitBtn('odd',   '奇數'),
    unitBtn('even',  '偶數'),
    unitBtn('low',   '1–18'),
  );
  const row2 = new ActionRowBuilder().addComponents(
    unitBtn('high',   '19–36'),
    unitBtn('dozen1', '第一打'),
    unitBtn('dozen2', '第二打'),
    unitBtn('dozen3', '第三打'),
  );
  const row3 = new ActionRowBuilder().addComponents(
    unitBtn('col1', '第一列'),
    unitBtn('col2', '第二列'),
    unitBtn('col3', '第三列'),
    new ButtonBuilder()
      .setCustomId(`rl_inside_${gameId}`)
      .setLabel('🎯 內圍押注')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(budgetEmpty),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rl_confirm_${gameId}`)
      .setLabel('✅ 確認下注')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rl_cancel_${gameId}`)
      .setLabel('❌ 取消')
      .setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3, row4];
}

function buildStatusContent(game) {
  const wagered = totalWagered(game.bets);
  const remaining = game.totalBudget - wagered;
  const unit = unitAmount(remaining);

  const betLines = game.bets.length === 0
    ? '（尚未押注）'
    : game.bets.map(b => {
        const def = BET_TYPES[b.type];
        return `・${def?.label ?? b.type} — **${b.amount.toLocaleString()}** credits (x${def?.payout ?? '?'})`;
      }).join('\n');

  return (
    `🎰 **歐式輪盤**\n` +
    `籌碼：**${game.totalBudget.toLocaleString()}** ・ 已押：**${wagered.toLocaleString()}** ・ 剩餘：**${remaining.toLocaleString()}**\n` +
    `每次外圍押法下注單位：**${unit.toLocaleString()}**\n\n` +
    `**目前押注：**\n${betLines}\n\n` +
    `-# 90 秒內確認，逾時自動退款`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('輪盤')
    .setDescription('歐式輪盤，多押法組合 🎰')
    .setDMPermission(false)
    .addIntegerOption(opt =>
      opt.setName('金額')
        .setDescription('投入籌碼總額（勾選梭哈時可省略）')
        .setRequired(false)
        .setMinValue(getCfg().minBetPerSlot ?? 30)
    )
    .addBooleanOption(opt =>
      opt.setName('梭哈')
        .setDescription('一次押上目前全部餘額')
        .setRequired(false)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!coinSystem?.enabled) return interaction.editReply('🔧 金幣系統未啟動');
      if (!client.rouletteGamesCollection) return interaction.editReply('🔧 輪盤系統未啟動，請聯絡舒舒！');

      const cfg = getCfg();
      if (cfg.enabled === false) return interaction.editReply('🔧 輪盤暫時關閉中！');

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const budgetInput = interaction.options.getInteger('金額');
      const allIn = interaction.options.getBoolean('梭哈') === true;
      const minBudget = cfg.minBetPerSlot ?? 30;
      const timeoutSec = cfg.bettingTimeoutSeconds ?? 90;
      const username = interaction.member?.displayName || interaction.user.username;

      if (!allIn && (!Number.isInteger(budgetInput) || budgetInput < minBudget)) {
        return interaction.editReply(
          `投入籌碼總額至少需 ${minBudget.toLocaleString()} credits（或勾選梭哈）。`
        );
      }

      // 同時只能有一局 betting 中
      const existing = await client.rouletteGamesCollection.findOne({
        userId, guildId, status: 'betting',
      });
      if (existing) {
        return interaction.editReply('🎰 你還有一局輪盤在押注中！先完成或取消再開新局。');
      }

      // 餘額檢查
      const userDoc = await client.userCoinsCollection.findOne({ userId, guildId });
      const balance = userDoc?.totalCoins || 0;
      const totalBudget = allIn ? balance : budgetInput;
      if (allIn && balance < minBudget) {
        return interaction.editReply(
          `💰 餘額不足以梭哈！目前 **${balance.toLocaleString()}** credits，至少需 ${minBudget.toLocaleString()}。`
        );
      }
      if (balance < totalBudget) {
        return interaction.editReply(
          `💰 餘額不足！目前 **${balance.toLocaleString()}** credits，需要 **${totalBudget.toLocaleString()}**。`
        );
      }

      // 先扣款
      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -totalBudget,
        source: 'bet',
        member: interaction.member,
        meta: { game: 'roulette' },
      });
      if (!betResult) return interaction.editReply('🔧 扣款失敗，請稍後再試。');

      const gameId = crypto.randomUUID();
      const now = new Date();

      const game = {
        gameId,
        userId,
        guildId,
        username,
        status: 'betting',
        totalBudget,
        bets: [],
        result: null,
        totalPayout: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + timeoutSec * 1000),
      };

      await client.rouletteGamesCollection.insertOne(game);

      const rows = buildBettingRows(gameId, totalBudget);
      await interaction.editReply({
        content: buildStatusContent(game),
        components: rows,
      });
    } catch (err) {
      console.log(`[ERROR] /輪盤:\n${err}\n${err.stack}`.red);
      await interaction.editReply('🔧 輪盤開局失敗，請呼叫舒舒！').catch(() => {});
    }
  },

  // 供 handleRouletteButton.js 使用
  buildBettingRows,
  buildStatusContent,
  unitAmount,
};
