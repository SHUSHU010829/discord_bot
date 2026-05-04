require("colors");

const { serverId } = require("../../config");
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

      // 動態載入飲料店選項到 /food drink 子指令
      if (commandName === "food") {
        if (!client.collection) {
          console.log(`[WARNING] Database not connected yet when registering /food`.yellow);
        } else {
          try {
            const beverageStores = await client.collection.distinct("beverageStore", {
              category: "beverage",
            });

            console.log(`[INFO] Loaded ${beverageStores.length} beverage stores from database`.cyan);

            if (commandOptions && commandOptions.length > 0) {
              const drinkSubcommand = commandOptions.find(
                (opt) => opt.name === "drink"
              );
              const beverageStoreOption = drinkSubcommand?.options?.find(
                (opt) => opt.name === "飲料店"
              );
              if (beverageStoreOption) {
                beverageStoreOption.choices = beverageStores
                  .slice(0, 25)
                  .map((store) => ({ name: store, value: store }));
                console.log(`[INFO] Set ${beverageStoreOption.choices.length} choices for /food drink 飲料店`.green);
              } else {
                console.log(`[WARNING] Could not find /food drink 飲料店 option`.yellow);
              }
            }
          } catch (error) {
            console.log(`[WARNING] Failed to load beverage stores for /food drink: ${error}`.yellow);
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
    if (error?.rawError) {
      console.log(
        `[ERROR] Discord API rawError:\n${JSON.stringify(error.rawError, null, 2)}`.red
      );
    }
    if (error?.requestBody) {
      console.log(
        `[ERROR] Request body json (truncated 4000):\n${JSON.stringify(error.requestBody.json).slice(0, 4000)}`.red
      );
    }
  }
};
