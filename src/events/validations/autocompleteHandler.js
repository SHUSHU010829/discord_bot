require("colors");

const getLocalCommands = require("../../utils/getLocalCommands");

module.exports = async (client, interaction) => {
  if (!interaction.isAutocomplete()) return;

  const localCommands = getLocalCommands();

  try {
    const commandObject = localCommands.find(
      (cmd) => cmd.data.name === interaction.commandName
    );

    if (!commandObject) return;

    // 如果指令有 autocomplete 處理函數，執行它
    if (commandObject.autocomplete) {
      await commandObject.autocomplete(client, interaction);
    }
  } catch (err) {
    console.log(`[ERROR] An error occurred in autocomplete handler: ${err}`.red);
  }
};
