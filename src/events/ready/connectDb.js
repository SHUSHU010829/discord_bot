require("colors");

const connectToMongoDB = require("../../utils/connectMongo");

module.exports = (client) => {
  connectToMongoDB(client);
};
