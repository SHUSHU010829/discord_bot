const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");

const grantCoins = require('../../features/economy/grantCoins');
const { BET_TYPES, validateInsideBet, isOutside } = require('../../features/casino/roulette/numbers');
const generateRouletteGif = require('../../utils/generateRouletteGif');
const { spinWheel, settle, totalWagered } = require('../../features/casino/roulette/engine');
const { buildBettingRows, buildStatusContent } = require('../../commands/casino/roulette');
const logger = require('../../utils/logger');
const { trackError, trackSuccess } = require('../../utils/errorTracker');
const { consume } = require('../../utils/rateLimiter');

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function resultEmoji(n) {
  if (n === 0) return '🟢';
  return RED_SET.has(n) ? '🔴' : '⚫';
}

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    const id = interaction.customId;
    if (!id?.startsWith('rl_')) return;
    if (!client.rouletteGamesCollection) return;

    // 解析 customId：
    // rl_outside_<betType>_<gameId>
    // rl_inside_<gameId>
    // rl_confirm_<gameId>
    // rl_cancel_<gameId>
    // rl_modal_straight_<gameId>  (Modal submit)
    const parts = id.split('_');
    const action = parts[1]; // outside / inside / confirm / cancel / modal

    // UUID 不含底線，所以 parts 最後一個一定是 gameId
    const gameId = parts[parts.length - 1];

    // 速率限制：擋連點。Modal submit 不限流（互動本身已是後續事件）
    if (interaction.isButton()) {
      const rl = consume(interaction.user.id, 'btn:roulette', {
        windowMs: 1000,
        max: 1,
      });
      if (!rl.allowed) {
        try {
          await interaction.reply({
            content: `⏳ 點太快了，等 ${Math.ceil(rl.retryAfterMs / 1000)} 秒。`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (_) { /* noop */ }
        return;
      }
    }

    const game = await client.rouletteGamesCollection.findOne({ gameId });
    if (!game) {
      return interaction.reply({ content: '🎰 找不到這局，可能已逾時。', flags: MessageFlags.Ephemeral });
    }
    if (game.userId !== interaction.user.id) {
      return interaction.reply({ content: '🚫 這不是你的局！', flags: MessageFlags.Ephemeral });
    }
    if (game.status !== 'betting') {
      return interaction.reply({ content: '🎰 這局已結束或逾時。', flags: MessageFlags.Ephemeral });
    }

    // ── 外圍按鈕 ───────────────────────────────────────────
    if (action === 'outside' && interaction.isButton()) {
      // rl_outside_<betType>_<gameId> → betType = parts[2]（可能是 red/black/col1/dozen1 等）
      const betType = `outside_${parts[2]}`;
      const def = BET_TYPES[betType];
      if (!def) return interaction.reply({ content: '❌ 未知押法', flags: MessageFlags.Ephemeral });

      const wagered = totalWagered(game.bets);
      const remaining = game.totalBudget - wagered;
      const amount = Math.floor(remaining / 3);

      if (amount <= 0) {
        return interaction.reply({ content: '💰 籌碼不足，無法繼續外圍押注。', flags: MessageFlags.Ephemeral });
      }

      const newBet = { type: betType, amount, numbers: def.numbers };
      await client.rouletteGamesCollection.updateOne(
        { _id: game._id, status: 'betting' },
        { $push: { bets: newBet }, $set: { updatedAt: new Date() } }
      );

      const updatedGame = { ...game, bets: [...game.bets, newBet] };
      const newRemaining = remaining - amount;

      await interaction.update({
        content: buildStatusContent(updatedGame),
        components: buildBettingRows(gameId, newRemaining),
      });
      return;
    }

    // ── 內圍：開 Modal ──────────────────────────────────────
    if (action === 'inside' && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(`rl_modal_straight_${gameId}`)
        .setTitle('內圍押注');

      const typeInput = new TextInputBuilder()
        .setCustomId('bet_type')
        .setLabel('押法（straight/split/street/corner/line/basket）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例：straight')
        .setRequired(true);

      const numsInput = new TextInputBuilder()
        .setCustomId('bet_nums')
        .setLabel('號碼（街押/角押/雙街填起始號）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例：17  或  1,2  或  1')
        .setRequired(true);

      const amountInput = new TextInputBuilder()
        .setCustomId('bet_amount')
        .setLabel('下注金額')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例：100')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(numsInput),
        new ActionRowBuilder().addComponents(amountInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // ── Modal Submit ────────────────────────────────────────
    if (action === 'modal' && interaction.isModalSubmit()) {
      const betType = interaction.fields.getTextInputValue('bet_type').trim().toLowerCase();
      const rawNums = interaction.fields.getTextInputValue('bet_nums');
      const rawAmount = interaction.fields.getTextInputValue('bet_amount');
      const amount = parseInt(rawAmount, 10);

      const def = BET_TYPES[betType];
      if (!def || isOutside(betType)) {
        return interaction.reply({ content: `❌ 無效押法「${betType}」`, flags: MessageFlags.Ephemeral });
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        return interaction.reply({ content: '❌ 金額格式錯誤，請填正整數', flags: MessageFlags.Ephemeral });
      }

      const wagered = totalWagered(game.bets);
      const remaining = game.totalBudget - wagered;
      if (amount > remaining) {
        return interaction.reply({
          content: `❌ 剩餘籌碼不足（剩 **${remaining.toLocaleString()}**，下注 **${amount.toLocaleString()}**）`,
          flags: MessageFlags.Ephemeral,
        });
      }

      let numbers;
      if (betType === 'basket') {
        numbers = BET_TYPES.basket.numbers;
      } else {
        const v = validateInsideBet(betType, rawNums);
        if (!v.ok) return interaction.reply({ content: `❌ ${v.error}`, flags: MessageFlags.Ephemeral });
        numbers = v.numbers;
      }

      const newBet = { type: betType, amount, numbers };
      await client.rouletteGamesCollection.updateOne(
        { _id: game._id, status: 'betting' },
        { $push: { bets: newBet }, $set: { updatedAt: new Date() } }
      );

      await interaction.reply({
        content: `✅ 已加入 **${def.label}** ${amount.toLocaleString()} credits（號碼：${numbers.join(', ')}）`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ── 確認下注 → Spin ─────────────────────────────────────
    if (action === 'confirm' && interaction.isButton()) {
      if (game.bets.length === 0) {
        return interaction.reply({ content: '❌ 還沒有任何押注！', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferUpdate();

      const result = spinWheel();
      const settlement = settle(game.bets, result);
      const wagered = totalWagered(game.bets);
      const refund = game.totalBudget - wagered; // 未押完的籌碼退回

      // 派彩 + 退回未押金額
      const payoutTotal = settlement.totalPayout + refund;
      let balanceAfter = (await client.userCoinsCollection.findOne(
        { userId: game.userId, guildId: game.guildId }
      ))?.totalCoins ?? 0;

      if (payoutTotal > 0) {
        const pr = await grantCoins(client, {
          userId: game.userId,
          guildId: game.guildId,
          username: game.username,
          amount: payoutTotal,
          source: 'payout',
          meta: {
            game: 'roulette',
            gameId,
            result,
            betCount: game.bets.length,
            totalWin: settlement.totalWin,
          },
        });
        balanceAfter = pr?.doc?.totalCoins ?? balanceAfter + payoutTotal;
      }

      // 用 status 條件防 race（cron 同時掃不會雙退）
      await client.rouletteGamesCollection.updateOne(
        { _id: game._id, status: 'betting' },
        {
          $set: {
            status: 'settled',
            result,
            totalPayout: payoutTotal,
            totalWin: settlement.totalWin,
            updatedAt: new Date(),
          },
        }
      );

      const winLines = settlement.betResults
        .map(b => {
          const def = BET_TYPES[b.type];
          return b.won
            ? `✅ ${def?.label ?? b.type} +${b.winAmount.toLocaleString()}`
            : `❌ ${def?.label ?? b.type}`;
        })
        .join('\n');

      const netResult = settlement.totalWin - wagered;
      const netStr = netResult >= 0
        ? `+${netResult.toLocaleString()}`
        : netResult.toLocaleString();

      const textContent =
        `🎰 **開出：${result}** ${resultEmoji(result)}\n\n` +
        `${winLines}\n\n` +
        `淨利：**${netStr}** credits　` +
        (refund > 0 ? `退回未押：**${refund.toLocaleString()}**　` : '') +
        `餘額：**${balanceAfter.toLocaleString()}**`;

      // 生成 GIF（失敗不影響派彩，降級為純文字）
      let gifAttachment = null;
      try {
        const gifBuf = await generateRouletteGif({
          result,
          bets: game.bets,
          settlement,
          username: game.username,
          totalBudget: game.totalBudget,
          balanceAfter,
        });
        gifAttachment = new AttachmentBuilder(gifBuf, { name: 'roulette.gif' });
      } catch (gifErr) {
        logger.warn(
          { source: "roulette-gif", err: gifErr.message },
          "輪盤 GIF 生成失敗,降級為純文字"
        );
        trackError("roulette-gif", gifErr);
      }

      await interaction.editReply({
        content: textContent,
        files: gifAttachment ? [gifAttachment] : [],
        components: [],
      });
      return;
    }

    // ── 取消 ────────────────────────────────────────────────
    if (action === 'cancel' && interaction.isButton()) {
      await interaction.deferUpdate();

      // 用 status 條件防 race（cron 同時掃不會雙退）
      const updated = await client.rouletteGamesCollection.findOneAndUpdate(
        { _id: game._id, status: 'betting' },
        { $set: { status: 'cancelled', updatedAt: new Date() } }
      );
      if (!updated) {
        // 已被 cron 搶先取消
        await interaction.editReply({ content: '🎰 已取消，籌碼全額退回。', components: [] });
        return;
      }

      await grantCoins(client, {
        userId: game.userId,
        guildId: game.guildId,
        username: game.username,
        amount: game.totalBudget,
        source: 'payout',
        meta: { game: 'roulette', gameId, reason: 'cancelled' },
      });

      await interaction.editReply({ content: '🎰 已取消，籌碼全額退回。', components: [] });
    }
    trackSuccess("roulette-button");
  } catch (err) {
    logger.error(
      { source: "roulette-button", userId: interaction.user?.id, customId: interaction.customId, err: err.message, stack: err.stack },
      "輪盤按鈕處理失敗"
    );
    trackError("roulette-button", err, { userId: interaction.user?.id, customId: interaction.customId });
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '🔧 輪盤按鈕處理失敗，請呼叫舒舒！', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: '🔧 輪盤按鈕處理失敗，請呼叫舒舒！', flags: MessageFlags.Ephemeral });
      }
    } catch (_) { /* noop */ }
  }
};
