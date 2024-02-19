require("colors");

const { MongoClient } = require("mongodb");

module.exports = async (client) =>{
    const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
    const mongoClient = new MongoClient(uri);
    try {
        await mongoClient.connect();
        const dbName = "MorningBot";
        const collectionName = "FoodList";
        const database = mongoClient.db(dbName);
        const collection = database.collection(collectionName);

        client.database = database;
        client.collection = collection;
        console.log(`[DATA] Successfully connected to MongoDB!`.cyan);
    } catch (error) {
        console.log(
          `[ERROR] An error occurred inside the command ask:\n${error}`.red
        );
    }
}
