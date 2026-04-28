require("colors");

const getLocalCommands = require("../../utils/getLocalCommands");

module.exports = async (client, interaction) => {
  if (!interaction.isAutocomplete()) return;

  const localCommands = getLocalCommands();
  const commandObject = localCommands.find(
    (cmd) => cmd.data.name === interaction.commandName
  );

  if (!commandObject?.autocomplete) return;

  try {
    await commandObject.autocomplete(client, interaction);
  } catch (err) {
    console.log(
      `[ERROR] Autocomplete error in ${interaction.commandName}:\n${err}`.red
    );
  }
};
