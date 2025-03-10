const { REST, Routes, ApplicationCommandType } = require("discord.js");
const { serverId } = require("./config.json");

require("colors");
require("dotenv/config");

const commands = [
  {
    name: "儲存到筆記",
    type: ApplicationCommandType.Message,
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("正在註冊應用程式指令...".yellow);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, serverId),
      { body: commands }
    );
    console.log("✅ 應用程式指令註冊成功！".green);
  } catch (error) {
    console.error(`[ERROR] 註冊指令失敗：${error.message}`.red);
  }
})();
