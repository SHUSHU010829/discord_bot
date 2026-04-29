const { REST, Routes } = require("discord.js");
const { serverId } = require("../config");

require("colors");
require("dotenv/config");

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("🔍 取得所有應用指令...");
    const commands = await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, serverId)
    );

    console.log(`📋 找到 ${commands.length} 個指令：`);
    console.log(commands.map((cmd) => `${cmd.id}: ${cmd.name}`).join("\n"));

    // 指定要刪除的指令名稱
    const commandToDelete = "儲存到筆記";

    // 找到該指令的 ID
    const command = commands.find((cmd) => cmd.name === commandToDelete);

    if (command) {
      await rest.delete(
        Routes.applicationGuildCommand(
          process.env.CLIENT_ID,
          serverId,
          command.id
        )
      );
      console.log(`✅ 成功刪除指令：${commandToDelete}`);
    } else {
      console.log(`⚠️ 指令「${commandToDelete}」不存在，無法刪除。`);
    }
  } catch (error) {
    console.error(`❌ 無法刪除指令：${error}`);
  }
})();
