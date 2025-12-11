require("colors");

const { serverId } = require("../../config.json");
const commandComparing = require("../../utils/commandComparing");
const getApplicationCommands = require("../../utils/getApplicationCommands");
const getLocalCommands = require("../../utils/getLocalCommands");

module.exports = async (client) => {
  try {
    const [localCommands, applicationCommands] = await Promise.all([
      getLocalCommands(),
      getApplicationCommands(client, serverId),
    ]);

    for (const localCommand of localCommands) {
      const { data, deleted } = localCommand;
      let {
        name: commandName,
        description: commandDescription,
        options: commandOptions,
      } = data;

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

      const existingCommand = applicationCommands.cache.find(
        (command) => command.name === commandName
      );

      if (deleted) {
        if (existingCommand) {
          await applicationCommands.delete(existingCommand.id);
          console.log(
            `[COMMAND REGISTRY] Application command ${commandName} has been deleted`
              .red
          );
        } else {
          console.log(
            `[COMMAND REGISTRY] Application command ${commandName} has been skipped, since property "deleted" is set.`
              .grey
          );
        }
      } else if (existingCommand) {
        // 強制更新 "/喝什麼" 指令以確保 choices 正確設置
        const needsUpdate = commandComparing(existingCommand, localCommand) ||
          (commandName === "喝什麼" && commandOptions?.[0]?.choices?.length > 0);

        if (needsUpdate) {
          console.log(
            `[COMMAND REGISTRY] Command ${commandName} has changes, updating...`.yellow
          );
          if (commandName === "喝什麼") {
            console.log(`[COMMAND REGISTRY] Forcing update for /喝什麼 with ${commandOptions?.[0]?.choices?.length || 0} beverage store choices`.cyan);
          }
          await applicationCommands.edit(existingCommand.id, {
            name: commandName,
            description: commandDescription,
            options: commandOptions,
          });
          console.log(
            `[COMMAND REGISTRY] Application command ${commandName} has been edited`
              .yellow
          );
        } else {
          console.log(
            `[COMMAND REGISTRY] Command ${commandName} is up to date`.grey
          );
        }
      } else {
        await applicationCommands.create({
          name: commandName,
          description: commandDescription,
          options: commandOptions,
        });
        console.log(
          `[COMMAND REGISTRY] Application command ${commandName} has been registered.`
            .green
        );
      }
    }
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the command registry:\n${error}`.red
    );
  }
};
