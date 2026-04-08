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

    client.database = database;
    client.collection = collection;
    client.gaslightCollection = gaslightCollection;
    client.messageStatsCollection = messageStatsCollection;
    client.voiceStatsCollection = voiceStatsCollection;
    client.channelActivityCollection = channelActivityCollection;
    client.votingProposalsCollection = votingProposalsCollection;
    client.rolePanelsCollection = rolePanelsCollection;
    console.log(`[DATA] Successfully connected to MongoDB!`.cyan);

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
