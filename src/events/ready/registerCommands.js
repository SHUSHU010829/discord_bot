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
      if (commandName === "喝什麼" && client.collection) {
        try {
          const beverageStores = await client.collection.distinct("beverageStore", {
            category: "beverage",
          });

          // 更新選項的 choices（最多 25 個，Discord 限制）
          if (commandOptions && commandOptions.length > 0) {
            const beverageStoreOption = commandOptions.find(opt => opt.name === "飲料店");
            if (beverageStoreOption) {
              beverageStoreOption.choices = beverageStores
                .slice(0, 25)
                .map(store => ({ name: store, value: store }));
            }
          }
        } catch (error) {
          console.log(`[WARNING] Failed to load beverage stores for /喝什麼: ${error}`.yellow);
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
        if (commandComparing(existingCommand, localCommand)) {
          await applicationCommands.edit(existingCommand.id, {
            name: commandName,
            description: commandDescription,
            options: commandOptions,
          });
          console.log(
            `[COMMAND REGISTRY] Application command ${commandName} has been edited`
              .yellow
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
