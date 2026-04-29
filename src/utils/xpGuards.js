const MIN_CHAR_DEFAULT = 3;

const isMessageXpEligible = (message, config) => {
  if (message.author.bot) return false;
  if (!message.guild) return false;
  if (message.system) return false;

  const content = (message.content || "").trim();
  const minChars = config.minCharacters ?? MIN_CHAR_DEFAULT;
  if (content.length < minChars) return false;

  const stripped = content.replace(/[\p{Emoji}\s\p{P}]/gu, "");
  if (stripped.length < minChars) return false;

  if (/^[!?/.][\w]*$/.test(content) && content.length < 6) return false;

  if (config.blacklistChannelIds?.includes(message.channelId)) return false;

  if (
    config.whitelistChannelIds?.length > 0 &&
    !config.whitelistChannelIds.includes(message.channelId)
  ) {
    return false;
  }

  return true;
};

const isVoiceXpEligible = (member, channel, config) => {
  if (!member || !channel) return false;
  if (member.user.bot) return false;
  if (config.blacklistChannelIds?.includes(channel.id)) return false;
  if (config.afkChannelIds?.includes(channel.id)) return false;
  if (config.ignoreAfkChannel && channel.guild.afkChannelId === channel.id) return false;

  const humanCount = channel.members.filter((m) => !m.user.bot).size;
  if (humanCount < (config.minPeopleInChannel ?? 2)) return false;

  if (config.ignoreMutedDeafened) {
    const vs = member.voice;
    if (vs.selfMute || vs.selfDeaf || vs.serverMute || vs.serverDeaf) return false;
  }

  return true;
};

const recentMessages = new Map();

const similarity = (a, b) => {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const bigrams = (s) => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.length === 0 || bb.length === 0) return 0;
  const setB = new Map();
  bb.forEach((g) => setB.set(g, (setB.get(g) || 0) + 1));
  let inter = 0;
  for (const g of ba) {
    if (setB.get(g) > 0) {
      inter += 1;
      setB.set(g, setB.get(g) - 1);
    }
  }
  return (2 * inter) / (ba.length + bb.length);
};

const isMessageRepetitive = (userId, content) => {
  const list = recentMessages.get(userId) || [];
  for (const prev of list) {
    if (similarity(prev, content) > 0.8) return true;
  }
  list.unshift(content);
  if (list.length > 3) list.pop();
  recentMessages.set(userId, list);
  return false;
};

module.exports = { isMessageXpEligible, isVoiceXpEligible, isMessageRepetitive };
