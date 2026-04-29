const { REST, Routes } = require("discord.js");
const { serverId } = require("../config");

require("colors");
require("dotenv/config");

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("🔍 取得應用程式指令...");
    const commands = await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, serverId)
    );

    console.log("📋 已註冊指令：");
    console.log(commands.map((cmd) => `- ${cmd.name}`).join("\n"));
  } catch (error) {
    console.error(`❌ 無法取得指令列表：${error.message}`.red);
  }
})();
