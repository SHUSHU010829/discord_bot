require("dotenv/config");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const eventHandlers = require("./handlers/eventHandler.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

eventHandlers(client);

client.login(process.env.BOT_TOKEN);
