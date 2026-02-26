module.exports = async (client, message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message contains threads.net or threads.com links
  const threadsRegex = /(https?:\/\/)?(www\.)?(threads\.(net|com))([^\s]*)/gi;

  if (threadsRegex.test(message.content)) {
    // Extract threads links and convert to vxthreads.net
    const threadsLinks = [];
    let match;
    const regex = new RegExp(threadsRegex.source, threadsRegex.flags);

    while ((match = regex.exec(message.content)) !== null) {
      const [fullMatch, protocol, www, domain, tld, path] = match;
      // Default to https if no protocol specified
      const finalProtocol = protocol || "https://";
      // Remove query parameters (everything after ?)
      const cleanPath = path ? path.split("?")[0] : "";
      const fixthreadsLink = `${finalProtocol}vxthreads.net${cleanPath}`;
      threadsLinks.push(fixthreadsLink);
    }

    // Create reply with arrow links
    const replyContent = threadsLinks.map((link) => `[⇩](${link})`).join(" ");

    // Reply with the arrow links
    const replyMessage = await message.reply({
      content: replyContent,
      allowedMentions: { repliedUser: false },
    });

    // Wait for Discord to generate embeds (3 seconds)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Fetch the reply message to check if embeds were generated
      const fetchedReply = await replyMessage.fetch();

      // If vxthreads link successfully generated embeds, suppress the original message embeds
      if (fetchedReply.embeds && fetchedReply.embeds.length > 0) {
        await message.suppressEmbeds(true);
      } else {
        // If no embeds were generated, delete the fixthreads message as it's not useful
        await replyMessage.delete();
      }
    } catch (error) {
      console.error("Error checking vxthreads embed:", error);
      // On error, keep both messages to be safe
    }
  }
};
