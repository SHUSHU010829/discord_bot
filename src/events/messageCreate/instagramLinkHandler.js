module.exports = async (client, message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message contains instagram.com links
  const instagramRegex = /(https?:\/\/)?(www\.)?(instagram\.com)([^\s]*)/gi;

  if (instagramRegex.test(message.content)) {
    // Suppress embeds from the original message
    await message.suppressEmbeds(true);

    // Extract instagram links and convert to instagramez.com
    const instagramLinks = [];
    let match;
    const regex = new RegExp(instagramRegex.source, instagramRegex.flags);

    while ((match = regex.exec(message.content)) !== null) {
      const [fullMatch, protocol, www, domain, path] = match;
      // Default to https if no protocol specified
      const finalProtocol = protocol || "https://";
      // Remove query parameters (everything after ?)
      const cleanPath = path ? path.split("?")[0] : "";
      const instagramezLink = `${finalProtocol}instagramez.com${cleanPath}`;
      instagramLinks.push(instagramezLink);
    }

    // Create reply with arrow links
    const replyContent = instagramLinks.map((link) => `[⇩](${link})`).join(" ");

    // Reply with the arrow links
    await message.reply({
      content: replyContent,
      allowedMentions: { repliedUser: false },
    });
  }
};
