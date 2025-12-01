require("dotenv/config");
const { Client, GatewayIntentBits } = require("discord.js");

const eventHandlers = require("./handlers/eventHandler.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

eventHandlers(client);

client.login(process.env.BOT_TOKEN);
