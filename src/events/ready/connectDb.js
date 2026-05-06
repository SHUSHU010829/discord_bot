require("colors");

const { MongoClient } = require("mongodb");

module.exports = async (client) => {
  // 檢查環境變數
  if (!process.env.MONGO_PASSWORD) {
    console.log(`[ERROR] MONGO_PASSWORD environment variable is not set!`.red);
    console.log(`[ERROR] Please create a .env file with MONGO_PASSWORD variable`.red);
    console.log(`[WARNING] Database features will be disabled until this is fixed`.yellow);
    return;
  }

  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);

  try {
    console.log(`[DATA] Connecting to MongoDB...`.cyan);
    await mongoClient.connect();

    const dbName = "MorningBot";
    const database = mongoClient.db(dbName);
    const collection = database.collection("FoodList");
    const gaslightCollection = database.collection("GaslightPost");

    // Statbot collections
    const messageStatsCollection = database.collection("MessageStats");
    const voiceStatsCollection = database.collection("VoiceStats");
    const channelActivityCollection = database.collection("ChannelActivity");

    // Voting system collection
    const votingProposalsCollection = database.collection("VotingProposals");

    // Role panels collection (遊戲身份組面板設定)
    const rolePanelsCollection = database.collection("RolePanels");

    // Suggestion panels collection (建議系統面板設定 + 排程刪除)
    const suggestionPanelsCollection = database.collection("SuggestionPanels");

    // Steam 特價推播去重
    const steamDealsCollection = database.collection("SteamDealsPushed");

    // 喜加一 (限免) 推播去重
    const freeGamesCollection = database.collection("FreeGamesPushed");

    // 等級系統 collections
    const userLevelsCollection = database.collection("UserLevels");
    const levelTransactionsCollection = database.collection("LevelTransactions");
    const dailyCheckinCollection = database.collection("DailyCheckin");
    const levelRolesCollection = database.collection("LevelRoles");
    const voiceSessionsCollection = database.collection("VoiceSessions");

    // 金幣系統 collections
    const userCoinsCollection = database.collection("UserCoins");
    const coinTransactionsCollection = database.collection("CoinTransactions");

    // 21 點對局狀態（in-flight + 結算後保留一段時間）
    const blackjackGamesCollection = database.collection("BlackjackGames");

    // HI-LO 對局狀態
    const hiloGamesCollection = database.collection("HiloGames");

    // 輪盤對局狀態
    const rouletteGamesCollection = database.collection("RouletteGames");

    // 德州撲克牌桌狀態（多人，channel-scoped）
    const pokerGamesCollection = database.collection("PokerGames");

    // 商店系統 collections
    const userInventoryCollection = database.collection("UserInventory");
    const shopTransactionsCollection = database.collection("ShopTransactions");
    const shopRoleCacheCollection = database.collection("ShopRoleCache");

    // Twitch chat 同步去重
    const twitchScoreFlushesCollection = database.collection("TwitchScoreFlushes");

    // Twitch 開台通知狀態 (login → 上次通知過的 streamId)
    const twitchLiveStateCollection = database.collection("TwitchLiveState");

    // 樂透系統 collections
    const lotteryDrawsCollection = database.collection("LotteryDraws");
    const lotteryTicketsCollection = database.collection("LotteryTickets");
    const lotterySubscriptionsCollection = database.collection("LotterySubscriptions");
    const lotteryWheelsCollection = database.collection("LotteryWheels");

    // 拉霸 jackpot 累積彩池（每 guild 一筆）
    const jackpotPoolCollection = database.collection("JackpotPool");

    // 玩家轉帳每日額度（記每日轉出總額）
    const coinTransfersCollection = database.collection("CoinTransfers");

    // 定期存款
    const coinDepositsCollection = database.collection("CoinDeposits");

    // 救濟金領取紀錄（連續天數、最後領取日期）
    const welfareClaimsCollection = database.collection("WelfareClaims");

    // 任務進度（每日/每週任務的進度與領取狀態）
    const questProgressCollection = database.collection("QuestProgress");

    // 經濟健康快照（每日聚合，用於通膨追蹤）
    const economySnapshotsCollection = database.collection("EconomySnapshots");

    client.database = database;
    client.collection = collection;
    client.gaslightCollection = gaslightCollection;
    client.messageStatsCollection = messageStatsCollection;
    client.voiceStatsCollection = voiceStatsCollection;
    client.channelActivityCollection = channelActivityCollection;
    client.votingProposalsCollection = votingProposalsCollection;
    client.rolePanelsCollection = rolePanelsCollection;
    client.suggestionPanelsCollection = suggestionPanelsCollection;
    client.steamDealsCollection = steamDealsCollection;
    client.freeGamesCollection = freeGamesCollection;
    client.userLevelsCollection = userLevelsCollection;
    client.levelTransactionsCollection = levelTransactionsCollection;
    client.dailyCheckinCollection = dailyCheckinCollection;
    client.levelRolesCollection = levelRolesCollection;
    client.voiceSessionsCollection = voiceSessionsCollection;
    client.userCoinsCollection = userCoinsCollection;
    client.coinTransactionsCollection = coinTransactionsCollection;
    client.blackjackGamesCollection = blackjackGamesCollection;
    client.hiloGamesCollection = hiloGamesCollection;
    client.rouletteGamesCollection = rouletteGamesCollection;
    client.pokerGamesCollection = pokerGamesCollection;
    client.twitchScoreFlushesCollection = twitchScoreFlushesCollection;
    client.twitchLiveStateCollection = twitchLiveStateCollection;
    client.userInventoryCollection = userInventoryCollection;
    client.shopTransactionsCollection = shopTransactionsCollection;
    client.shopRoleCacheCollection = shopRoleCacheCollection;
    client.lotteryDrawsCollection = lotteryDrawsCollection;
    client.lotteryTicketsCollection = lotteryTicketsCollection;
    client.lotterySubscriptionsCollection = lotterySubscriptionsCollection;
    client.lotteryWheelsCollection = lotteryWheelsCollection;
    client.jackpotPoolCollection = jackpotPoolCollection;
    client.coinTransfersCollection = coinTransfersCollection;
    client.coinDepositsCollection = coinDepositsCollection;
    client.welfareClaimsCollection = welfareClaimsCollection;
    client.questProgressCollection = questProgressCollection;
    client.economySnapshotsCollection = economySnapshotsCollection;
    await economySnapshotsCollection
      .createIndex({ guildId: 1, date: 1 }, { unique: true })
      .catch((e) =>
        console.log(`[WARN] EconomySnapshots index 建立失敗：${e.message}`.yellow),
      );
    console.log(`[DATA] Successfully connected to MongoDB!`.cyan);

    // 自動修補沒有 category / drawCount 的舊資料（idempotent，沒事就不動）
    try {
      const missingCategory = await collection.updateMany(
        { $or: [{ category: { $exists: false } }, { category: null }] },
        { $set: { category: "lunch" } }
      );
      const missingDrawCount = await collection.updateMany(
        { drawCount: { $exists: false } },
        { $set: { drawCount: 0 } }
      );
      if (missingCategory.modifiedCount > 0 || missingDrawCount.modifiedCount > 0) {
        console.log(
          `[DATA] 自動修補舊資料：補 category ${missingCategory.modifiedCount} 筆（預設 lunch）、補 drawCount ${missingDrawCount.modifiedCount} 筆`.cyan
        );
      }
    } catch (migrateError) {
      console.log(
        `[WARNING] 修補舊資料失敗：${migrateError.message}`.yellow
      );
    }

    // 建立 FoodList 索引（防止同名同類別重複，加速排行榜排序）
    try {
      await collection.createIndex(
        { name: 1, category: 1, beverageStore: 1 },
        { unique: true, name: "uniq_food_identity" }
      );
      await collection.createIndex(
        { drawCount: -1 },
        { name: "drawCount_desc" }
      );
    } catch (indexError) {
      console.log(
        `[WARNING] Failed to create FoodList index (可能有重複資料需要先清理):\n${indexError.message}`.yellow
      );
    }

    // 等級系統索引
    try {
      await userLevelsCollection.createIndex(
        { userId: 1, guildId: 1 },
        { unique: true, name: "uniq_user_guild" }
      );
      await userLevelsCollection.createIndex(
        { guildId: 1, totalXp: -1 },
        { name: "guild_xp_desc" }
      );
      await userLevelsCollection.createIndex(
        { guildId: 1, level: -1, totalXp: -1 },
        { name: "guild_level_desc" }
      );

      await levelTransactionsCollection.createIndex(
        { userId: 1, guildId: 1, createdAt: -1 },
        { name: "user_guild_time" }
      );
      await levelTransactionsCollection.createIndex(
        { guildId: 1, date: 1 },
        { name: "guild_date" }
      );
      await levelTransactionsCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60, name: "ttl_90d" }
      );

      await dailyCheckinCollection.createIndex(
        { userId: 1, guildId: 1, date: 1 },
        { unique: true, name: "uniq_user_guild_date" }
      );
      await dailyCheckinCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60, name: "ttl_90d" }
      );

      await levelRolesCollection.createIndex(
        { guildId: 1, level: 1 },
        { unique: true, name: "uniq_guild_level" }
      );

      await voiceSessionsCollection.createIndex(
        { userId: 1, guildId: 1 },
        { unique: true, name: "uniq_voice_user_guild" }
      );

      await twitchScoreFlushesCollection.createIndex(
        { sessionId: 1 },
        { unique: true, name: "uniq_twitch_session" }
      );

      // 金幣系統索引
      await userCoinsCollection.createIndex(
        { userId: 1, guildId: 1 },
        { unique: true, name: "uniq_coin_user_guild" }
      );

      await coinTransactionsCollection.createIndex(
        { userId: 1, guildId: 1, createdAt: -1 },
        { name: "coin_user_guild_time" }
      );
      await coinTransactionsCollection.createIndex(
        { userId: 1, guildId: 1, source: 1, date: 1 },
        { name: "coin_user_guild_source_date" }
      );
      await coinTransactionsCollection.createIndex(
        { guildId: 1, date: 1 },
        { name: "coin_guild_date" }
      );
      await coinTransactionsCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60, name: "coin_ttl_90d" }
      );

      // 21 點對局索引：每位玩家同 guild 同時只能有一局 playing，靠 status 過濾不上 unique
      await blackjackGamesCollection.createIndex(
        { gameId: 1 },
        { unique: true, name: "uniq_bj_gameId" }
      );
      await blackjackGamesCollection.createIndex(
        { userId: 1, guildId: 1, status: 1 },
        { name: "bj_user_guild_status" }
      );
      // 用 cron 自己掃 abandoned 局退錢 → 結算後 30 天再清，避免 TTL 提前刪掉還沒退款的 doc
      await blackjackGamesCollection.createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: 30 * 24 * 60 * 60, name: "bj_ttl_30d" }
      );

      // HI-LO 對局索引：邏輯與 21 點相同，每位玩家同 guild 同時只能有一局 playing
      await hiloGamesCollection.createIndex(
        { gameId: 1 },
        { unique: true, name: "uniq_hl_gameId" }
      );
      await hiloGamesCollection.createIndex(
        { userId: 1, guildId: 1, status: 1 },
        { name: "hl_user_guild_status" }
      );
      await hiloGamesCollection.createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: 30 * 24 * 60 * 60, name: "hl_ttl_30d" }
      );

      // 輪盤對局索引：邏輯與 21 點相同，每位玩家同 guild 同時只能有一局 betting
      await rouletteGamesCollection.createIndex(
        { gameId: 1 },
        { unique: true, name: "uniq_roulette_gameId" }
      );
      await rouletteGamesCollection.createIndex(
        { userId: 1, guildId: 1, status: 1 },
        { name: "roulette_user_guild_status" }
      );
      await rouletteGamesCollection.createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: 30 * 24 * 60 * 60, name: "roulette_ttl_30d" }
      );

      // 德州撲克牌桌索引：channel-scoped，同頻道同時只能有一桌等候/進行
      await pokerGamesCollection.createIndex(
        { gameId: 1 },
        { unique: true, name: "uniq_poker_gameId" }
      );
      await pokerGamesCollection.createIndex(
        { channelId: 1, status: 1 },
        { name: "poker_channel_status" }
      );
      await pokerGamesCollection.createIndex(
        { "players.userId": 1, status: 1 },
        { name: "poker_player_status" }
      );
      await pokerGamesCollection.createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: 30 * 24 * 60 * 60, name: "poker_ttl_30d" }
      );

      // 商店：背包索引（同人同 guild 同 itemId 可有多筆，因為到期時間/裝備狀態不同）
      await userInventoryCollection.createIndex(
        { userId: 1, guildId: 1 },
        { name: "inv_user_guild" }
      );
      await userInventoryCollection.createIndex(
        { userId: 1, guildId: 1, itemId: 1 },
        { name: "inv_user_guild_item" }
      );
      await userInventoryCollection.createIndex(
        { guildId: 1, expiresAt: 1 },
        { name: "inv_guild_expiry" }
      );

      // 商店：交易紀錄
      await shopTransactionsCollection.createIndex(
        { userId: 1, guildId: 1, createdAt: -1 },
        { name: "shop_tx_user_guild_time" }
      );
      await shopTransactionsCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 180 * 24 * 60 * 60, name: "shop_tx_ttl_180d" }
      );

      // 商店：身份組快取（每 guild 每色一筆，避免重複建立）
      await shopRoleCacheCollection.createIndex(
        { guildId: 1, hex: 1 },
        { unique: true, name: "uniq_role_cache_guild_hex" }
      );

      // 樂透系統索引(歷史是核心資產,不設 TTL)
      await lotteryDrawsCollection.createIndex(
        { drawId: 1 },
        { unique: true, name: "uniq_lottery_drawId" }
      );
      await lotteryDrawsCollection.createIndex(
        { lotteryType: 1, status: 1 },
        { name: "lottery_type_status" }
      );
      await lotteryDrawsCollection.createIndex(
        { "scheduledReminders.fireAt": 1, "scheduledReminders.fired": 1 },
        { name: "lottery_reminders" }
      );

      await lotteryTicketsCollection.createIndex(
        { drawId: 1, matched: -1 },
        { name: "lottery_tickets_draw_matched" }
      );
      await lotteryTicketsCollection.createIndex(
        { userId: 1, guildId: 1, createdAt: -1 },
        { name: "lottery_tickets_user" }
      );
      await lotteryTicketsCollection.createIndex(
        { subscriptionId: 1 },
        { name: "lottery_tickets_subscription" }
      );
      await lotteryTicketsCollection.createIndex(
        { wheelingId: 1 },
        { name: "lottery_tickets_wheel" }
      );
      await lotteryTicketsCollection.createIndex(
        { ticketId: 1 },
        { unique: true, name: "uniq_lottery_ticketId" }
      );

      await lotterySubscriptionsCollection.createIndex(
        { status: 1, nextDrawId: 1 },
        { name: "lottery_subs_status_next" }
      );
      await lotterySubscriptionsCollection.createIndex(
        { userId: 1, guildId: 1, status: 1 },
        { name: "lottery_subs_user_status" }
      );
      await lotterySubscriptionsCollection.createIndex(
        { subscriptionId: 1 },
        { unique: true, name: "uniq_lottery_subscriptionId" }
      );

      await lotteryWheelsCollection.createIndex(
        { userId: 1, guildId: 1, createdAt: -1 },
        { name: "lottery_wheels_user" }
      );
      await lotteryWheelsCollection.createIndex(
        { wheelingId: 1 },
        { unique: true, name: "uniq_lottery_wheelingId" }
      );

      // 救濟金領取紀錄
      await welfareClaimsCollection.createIndex(
        { userId: 1, guildId: 1 },
        { unique: true, name: "uniq_welfare_user_guild" }
      );

      // 任務進度：(user, guild, quest, period) 唯一
      await questProgressCollection.createIndex(
        { userId: 1, guildId: 1, questId: 1, period: 1 },
        { unique: true, name: "uniq_quest_user_guild_quest_period" }
      );
      await questProgressCollection.createIndex(
        { guildId: 1, period: 1, questId: 1 },
        { name: "quest_guild_period_quest" }
      );
      await questProgressCollection.createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60, name: "quest_ttl_90d" }
      );
    } catch (indexError) {
      console.log(
        `[WARNING] Failed to create LevelSystem indexes:\n${indexError.message}`.yellow
      );
    }

    // 確認有多少飲料店資料
    const beverageStoreCount = await collection.distinct("beverageStore", {
      category: "beverage",
    });
    console.log(`[DATA] Found ${beverageStoreCount.length} beverage stores in database`.cyan);
  } catch (error) {
    console.log(
      `[ERROR] Failed to connect to MongoDB:\n${error}`.red
    );
    console.log(
      `[WARNING] Database features will be disabled. Please check your MONGO_PASSWORD and network connection`.yellow
    );
  }
};
