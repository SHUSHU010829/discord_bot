module.exports = async (client, message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message contains threads.net or threads.com links
  const threadsRegex = /(https?:\/\/)?(www\.)?(threads\.(net|com))([^\s]*)/gi;

  if (threadsRegex.test(message.content)) {
    // Suppress embeds from the original message
    await message.suppressEmbeds(true);

    // Replace threads.net/threads.com with fixthreads.net and remove query parameters
    const modifiedContent = message.content.replace(
      threadsRegex,
      (match, protocol, www, domain, tld, path) => {
        // Default to https if no protocol specified
        const finalProtocol = protocol || "https://";

        // Remove query parameters (everything after ?)
        const cleanPath = path ? path.split("?")[0] : "";

        return `${finalProtocol}fixthreads.net${cleanPath}`;
      }
    );

    // Reply with the modified version
    await message.reply({
      content: `${modifiedContent}`,
      allowedMentions: { repliedUser: false },
    });
  }
};
