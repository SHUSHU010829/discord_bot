module.exports = async (client, message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message contains threads.net or threads.com links
  const threadsRegex = /(https?:\/\/)?(www\.)?(threads\.(net|com))([^\s]*)/gi;

  if (threadsRegex.test(message.content)) {
    // Suppress embeds from the original message
    await message.suppressEmbeds(true);

    // Extract threads links and convert to fixthreads.net
    const threadsLinks = [];
    let match;
    const regex = new RegExp(threadsRegex.source, threadsRegex.flags);

    while ((match = regex.exec(message.content)) !== null) {
      const [fullMatch, protocol, www, domain, tld, path] = match;
      // Default to https if no protocol specified
      const finalProtocol = protocol || "https://";
      // Remove query parameters (everything after ?)
      const cleanPath = path ? path.split("?")[0] : "";
      const fixthreadsLink = `${finalProtocol}fixthreads.net${cleanPath}`;
      threadsLinks.push(fixthreadsLink);
    }

    // Create reply with arrow links
    const replyContent = threadsLinks.map((link) => `[⇩](${link})`).join(" ");

    // Reply with the arrow links
    await message.reply({
      content: replyContent,
      allowedMentions: { repliedUser: false },
    });
  }
};
