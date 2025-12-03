require("colors");

const { MongoClient } = require("mongodb");

module.exports = async (client) => {
  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);
  try {
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

    client.database = database;
    client.collection = collection;
    client.gaslightCollection = gaslightCollection;
    client.messageStatsCollection = messageStatsCollection;
    client.voiceStatsCollection = voiceStatsCollection;
    client.channelActivityCollection = channelActivityCollection;
    client.votingProposalsCollection = votingProposalsCollection;
    console.log(`[DATA] Successfully connected to MongoDB!`.cyan);
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the command ask:\n${error}`.red
    );
  }
};
