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

    // Steam 特價推播去重
    const steamDealsCollection = database.collection("SteamDealsPushed");

    // 喜加一 (限免) 推播去重
    const freeGamesCollection = database.collection("FreeGamesPushed");

    // 等級系統 collections
    const userLevelsCollection = database.collection("UserLevels");
    const levelTransactionsCollection = database.collection("LevelTransactions");
    const dailyCheckinCollection = database.collection("DailyCheckin");

    client.database = database;
    client.collection = collection;
    client.gaslightCollection = gaslightCollection;
    client.messageStatsCollection = messageStatsCollection;
    client.voiceStatsCollection = voiceStatsCollection;
    client.channelActivityCollection = channelActivityCollection;
    client.votingProposalsCollection = votingProposalsCollection;
    client.rolePanelsCollection = rolePanelsCollection;
    client.steamDealsCollection = steamDealsCollection;
    client.freeGamesCollection = freeGamesCollection;
    client.userLevelsCollection = userLevelsCollection;
    client.levelTransactionsCollection = levelTransactionsCollection;
    client.dailyCheckinCollection = dailyCheckinCollection;
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
