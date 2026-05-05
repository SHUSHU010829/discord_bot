require("colors");
const { SlashCommandBuilder } = require("discord.js");

const {
  findActiveGameInChannel,
  joinTable,
  leaveDuringWaiting,
  startNextHand,
  closeTable,
  refreshTableMessage,
  persistEngineState,
  applyPlayerAction,
  announceHandStart,
  postThreadAnnouncement,
} = require("../../features/casino/poker/service");
const grantCoins = require("../../features/economy/grantCoins");
const engine = require("../../features/casino/poker/engine");
const { renderEphemeralHand } = require("../../features/casino/poker/renderer");

// 抑制未使用警告
void grantCoins;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("撲克")
    .setDescription("德州撲克牌桌操作 🃏")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("加入").setDescription("加入此執行緒的牌桌（買進）")
    )
    .addSubcommand((sub) =>
      sub.setName("離開").setDescription("離開牌桌（等候中可退錢；牌局中等同棄牌並結算後離桌）")
    )
    .addSubcommand((sub) =>
      sub.setName("開始").setDescription("（開桌者）開下一局")
    )
    .addSubcommand((sub) =>
      sub.setName("狀態").setDescription("查看你的手牌（私訊只給你）")
    )
    .addSubcommand((sub) =>
      sub.setName("棄牌").setDescription("棄牌（fold）— 也可按桌面按鈕")
    )
    .addSubcommand((sub) =>
      sub.setName("過牌").setDescription("過牌（check）— 本輪沒人下注時")
    )
    .addSubcommand((sub) =>
      sub.setName("跟注").setDescription("跟注（call）— 補到 currentBet")
    )
    .addSubcommand((sub) =>
      sub
        .setName("加注")
        .setDescription("加注（raise to）— 把本輪總額拉到輸入金額")
        .addIntegerOption((opt) =>
          opt
            .setName("總額")
            .setDescription("要把本輪總下注拉到多少（不是再加多少）")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("全下").setDescription("All-In — 推光剩下的籌碼")
    )
    .toJSON(),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "加入") {
        await interaction.deferReply({ ephemeral: true });
        const r = await joinTable(client, interaction);
        if (r.error) return interaction.editReply(r.error);
        const username =
          interaction.member?.displayName || interaction.user.username;
        await postThreadAnnouncement(
          client,
          r.doc,
          `🪑 **${username}** 入座了（${r.doc.players.length}/${r.doc.maxPlayers} 人）`,
          []
        );
        return interaction.editReply(
          `🪑 已入座，已扣進桌費 **${r.doc.buyIn.toLocaleString()}** credits。`
        );
      }

      if (sub === "狀態") {
        const doc = await findActiveGameInChannel(client, interaction.channelId);
        if (!doc) return interaction.reply({ content: "🃏 這裡沒有撲克桌。", ephemeral: true });
        return interaction.reply(renderEphemeralHand(doc, interaction.user.id));
      }

      if (sub === "離開") {
        await interaction.deferReply({ ephemeral: true });
        const doc = await findActiveGameInChannel(client, interaction.channelId);
        if (!doc) return interaction.editReply("🃏 這裡沒有撲克桌。");
        const userId = interaction.user.id;
        const me = doc.players.find((p) => p.userId === userId);
        if (!me) return interaction.editReply("你不在這張桌上。");

        if (doc.status === "waiting") {
          const r = await leaveDuringWaiting(client, doc, userId);
          if (r.error) return interaction.editReply(r.error);
          if (r.closed) {
            await closeTable(client, doc, { reason: "creator_left" });
            return interaction.editReply("👋 已退回進桌費，牌桌已解散。");
          }
          await refreshTableMessage(client, r.doc);
          return interaction.editReply(
            `👋 已退回進桌費 **${doc.buyIn.toLocaleString()}** credits。`
          );
        }

        if (doc.status === "settled") {
          // 標記 leaving，下一局會被帶走
          await client.pokerGamesCollection.updateOne(
            { _id: doc._id, "players.userId": userId },
            { $set: { "players.$.leaving": true, updatedAt: new Date() } }
          );
          return interaction.editReply("👋 已標記離桌，下一局開始時會結算退錢。或開桌者按解散即時退款。");
        }

        if (doc.status === "playing") {
          if (me.folded) {
            // 已棄牌：標記 leaving 等本局結束後退錢
            await client.pokerGamesCollection.updateOne(
              { _id: doc._id, "players.userId": userId },
              { $set: { "players.$.leaving": true, updatedAt: new Date() } }
            );
            return interaction.editReply("👋 已標記離桌，本局結束後結算退錢。");
          }
          // 強制 fold + 標記 leaving
          const idx = doc.players.findIndex((p) => p.userId === userId);
          if (doc.toActIdx === idx) {
            const result = engine.applyAction(doc, idx, "fold");
            if (!result.error) {
              await persistEngineState(client, doc, result.state);
            }
          } else {
            // 非自己回合：直接標 folded（敵手仍可繼續）
            await client.pokerGamesCollection.updateOne(
              { _id: doc._id, "players.userId": userId },
              {
                $set: {
                  "players.$.folded": true,
                  "players.$.hasActed": true,
                  "players.$.leaving": true,
                  updatedAt: new Date(),
                },
              }
            );
          }
          const refreshed = await client.pokerGamesCollection.findOne({ _id: doc._id });
          await refreshTableMessage(client, refreshed);
          return interaction.editReply("👋 你已棄牌離桌，籌碼將在本局結算後退回。");
        }

        return interaction.editReply("此狀態無法離桌。");
      }

      if (["棄牌", "過牌", "跟注", "加注", "全下"].includes(sub)) {
        await interaction.deferReply({ ephemeral: true });
        const doc = await findActiveGameInChannel(client, interaction.channelId);
        if (!doc) return interaction.editReply("🃏 這裡沒有撲克桌。");
        if (doc.status !== "playing") {
          return interaction.editReply("🃏 牌局尚未開打。");
        }
        const idx = doc.players.findIndex((p) => p.userId === interaction.user.id);
        if (idx < 0) return interaction.editReply("你不在這張桌上。");
        if (doc.toActIdx !== idx) return interaction.editReply("🕒 還沒輪到你。");

        const me = doc.players[idx];
        const toCall = Math.max(0, (doc.currentBet || 0) - (me.bet || 0));
        let action;
        let opts = {};
        if (sub === "棄牌") action = "fold";
        else if (sub === "過牌") {
          if (toCall > 0) {
            return interaction.editReply(
              `🚫 現在無法過牌，需跟注 ${toCall.toLocaleString()}（用 \`/撲克 跟注\` 或 \`/撲克 棄牌\`）。`
            );
          }
          action = "check";
        } else if (sub === "跟注") {
          if (toCall === 0) {
            return interaction.editReply(
              "🚫 本輪沒人下注，不需要跟，使用 `/撲克 過牌`。"
            );
          }
          action = "call";
        } else if (sub === "加注") {
          const raiseTo = interaction.options.getInteger("總額");
          const minRaiseTo = Math.max(
            (doc.currentBet || 0) + (doc.minRaise || doc.bigBlind),
            doc.bigBlind
          );
          const maxRaiseTo = me.bet + me.chips;
          if (raiseTo < minRaiseTo || raiseTo > maxRaiseTo) {
            return interaction.editReply(
              `🚫 加注總額需介於 **${minRaiseTo.toLocaleString()}–${maxRaiseTo.toLocaleString()}** 之間（你目前已下 ${me.bet.toLocaleString()}，剩 ${me.chips.toLocaleString()}）。`
            );
          }
          action = "raise";
          opts = { raiseTo };
        } else if (sub === "全下") {
          action = "allin";
        }

        const r = await applyPlayerAction(client, doc, interaction.user.id, action, opts);
        if (r.error) return interaction.editReply(`❌ ${r.error}`);
        const updated = await client.pokerGamesCollection.findOne({ _id: doc._id });
        await refreshTableMessage(client, updated);
        return interaction.editReply(`✅ 已執行：${sub}`);
      }

      if (sub === "開始") {
        await interaction.deferReply({ ephemeral: true });
        const doc = await findActiveGameInChannel(client, interaction.channelId);
        if (!doc) return interaction.editReply("🃏 這裡沒有撲克桌。");
        if (doc.creatorId !== interaction.user.id) {
          return interaction.editReply("🚫 只有開桌者能開局。");
        }
        if (!(doc.status === "waiting" || doc.status === "settled")) {
          return interaction.editReply("現在不能開新局。");
        }
        if (doc.status === "waiting" && doc.players.length < doc.minPlayers) {
          return interaction.editReply(
            `🚫 人數不足，至少需 ${doc.minPlayers} 人，目前 ${doc.players.length} 人。`
          );
        }

        if (doc.status === "waiting") {
          const next = engine.startHand(doc);
          await persistEngineState(client, doc, next);
        } else {
          const r = await startNextHand(client, doc);
          if (r.closed) {
            await closeTable(client, doc, { reason: "underpopulated" });
            return interaction.editReply("人數不足，牌桌已解散。");
          }
        }
        const refreshed = await client.pokerGamesCollection.findOne({ _id: doc._id });
        await refreshTableMessage(client, refreshed);
        await announceHandStart(client, refreshed);
        return interaction.editReply(`🃏 第 ${refreshed.handNumber} 局開始！`);
      }
    } catch (err) {
      console.log(`[ERROR] /撲克 ${sub}:\n${err}\n${err.stack}`.red);
      const msg = "🔧 撲克指令執行失敗，請呼叫舒舒！";
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      } catch (_) {
        /* noop */
      }
    }
  },
};
