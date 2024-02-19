require("colors");

const { readdirSync } = require("fs");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const {footerText} = require("../../messageConfig.json");
const buttonPaginator = require("../../utils/buttonPagination");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("逼逼機器人份內工作！"),

  run: async (client, interaction) => {
    try {
        const commandFolders = readdirSync('./src/commands');
        const helpEmbeds = [];

        for (const folder of commandFolders) {
            const commandFiles = readdirSync(`./src/commands/${folder}`).filter(file => file.endsWith('.js'));

            const categoryEmbed = new EmbedBuilder()
            .setTitle(folder)
            .setFooter({
                text: `${footerText}`,
            })
            .setTimestamp()
            .setThumbnail(client.user.displayAvatarURL())

            const subcommands = [];

            for (const file of commandFiles) {
                const command = require(`./../${folder}/${file}`);
                
                if(command.deleted) {
                    continue;
                }

                const description = `${command.data.description || "No description provided."}`;

                if(command.data.type === "SUB_COMMAND" || command.data.type === "SUB_COMMAND_GROUP") {
                    subcommands.push(command);           
                } else {
                    categoryEmbed.addFields([
                      {
                        name: `/${command.data.name}`,
                        value: description,
                      },
                    ]);
                }
            }

            if(subcommands.length > 0) {
                categoryEmbed.addFields([
                  {
                    name: "Subcommands",
                    value: subcommands
                      .map((subcommand) => `/${subcommand.data.name}`)
                      .join("\n"),
                  },
                ]);
            }

            helpEmbeds.push(categoryEmbed);
        }

        await buttonPaginator(interaction, helpEmbeds);
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the command ask:\n${error}`.red
      );
    }
  },
};
