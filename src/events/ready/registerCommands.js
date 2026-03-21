require("colors");

const { serverId } = require("../../config.json");
const commandComparing = require("../../utils/commandComparing");
const getApplicationCommands = require("../../utils/getApplicationCommands");
const getLocalCommands = require("../../utils/getLocalCommands");

module.exports = async (client) => {
  try {
    console.log("🔄 [COMMAND REGISTRY] Starting command registration...".cyan);
    const localCommands = await getLocalCommands();
    const applicationCommands = await getApplicationCommands(client, serverId);

    // 準備要註冊的指令數據
    const commandsToRegister = [];

    for (const localCommand of localCommands) {
      const { data, deleted } = localCommand;
      let {
        name: commandName,
        description: commandDescription,
        options: commandOptions,
      } = data;

      // 跳過已標記為刪除的指令
      if (deleted) {
        console.log(
          `[COMMAND REGISTRY] Skipping ${commandName} (marked as deleted)`.grey
        );
        continue;
      }

      // 動態載入飲料店選項
      if (commandName === "喝什麼") {
        if (!client.collection) {
          console.log(`[WARNING] Database not connected yet when registering /喝什麼`.yellow);
        } else {
          try {
            const beverageStores = await client.collection.distinct("beverageStore", {
              category: "beverage",
            });

            console.log(`[INFO] Loaded ${beverageStores.length} beverage stores from database`.cyan);

            // 更新選項的 choices（最多 25 個，Discord 限制）
            if (commandOptions && commandOptions.length > 0) {
              const beverageStoreOption = commandOptions.find(opt => opt.name === "飲料店");
              if (beverageStoreOption) {
                beverageStoreOption.choices = beverageStores
                  .slice(0, 25)
                  .map(store => ({ name: store, value: store }));
                console.log(`[INFO] Set ${beverageStoreOption.choices.length} choices for /喝什麼 command`.green);
              } else {
                console.log(`[WARNING] Could not find "飲料店" option in /喝什麼 command`.yellow);
              }
            }
          } catch (error) {
            console.log(`[WARNING] Failed to load beverage stores for /喝什麼: ${error}`.yellow);
          }
        }
      }

      commandsToRegister.push({
        name: commandName,
        description: commandDescription,
        options: commandOptions,
      });
    }

    // 使用批量覆蓋 API - Discord 會自動處理差異（新增/更新/刪除）
    await applicationCommands.set(commandsToRegister);
    console.log(
      `✅ [COMMAND REGISTRY] Successfully registered ${commandsToRegister.length} commands (bulk update)`.green
    );

    commandsToRegister.forEach(cmd => {
      console.log(`   ✓ ${cmd.name}`.grey);
    });
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the command registry:\n${error}`.red
    );
  }
};
