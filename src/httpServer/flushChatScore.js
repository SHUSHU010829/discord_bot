require("colors");
const { randomInt } = require("../utils/levelMath");
const grantXp = require("../features/leveling/grantXp");
const { twitchSync, levelSystem } = require("../config");

function rollSessionXp(messageCount) {
  const min = levelSystem?.message?.minXp ?? 15;
  const max = levelSystem?.message?.maxXp ?? 25;
  const cap = twitchSync?.perSessionXpCap ?? 1000;
  let total = 0;
  for (let i = 0; i < messageCount; i += 1) {
    total += randomInt(min, max);
    if (total >= cap) return cap;
  }
  return total;
}

async function buildSubMemberIndex(client) {
  if (!twitchSync?.guildId) return null;
  const guild = client.guilds.cache.get(twitchSync.guildId)
    || (await client.guilds.fetch(twitchSync.guildId).catch(() => null));
  if (!guild) {
    console.log(`[TWITCH-FLUSH] guild ${twitchSync.guildId} not found`.yellow);
    return null;
  }

  const tierIds = Object.values(twitchSync.tierRoleIds || {}).filter(Boolean);
  if (tierIds.length === 0) return new Map();

  const members = await guild.members.fetch().catch((e) => {
    console.log(`[TWITCH-FLUSH] members.fetch failed: ${e}`.red);
    return null;
  });
  if (!members) return null;

  const index = new Map();
  for (const member of members.values()) {
    const hasTier = tierIds.some((id) => member.roles.cache.has(id));
    if (!hasTier) continue;
    const username = (member.user?.username || "").toLowerCase();
    if (!username) continue;
    if (!index.has(username)) index.set(username, member);
  }
  return index;
}

module.exports = function createFlushChatScoreHandler(client) {
  return async function handleFlushChatScore(req, res) {
    if (!twitchSync?.enabled) {
      return res.status(503).json({ error: "twitch sync disabled" });
    }

    const expectedSecret = process.env.DISCORD_BOT_SCORE_SECRET;
    if (!expectedSecret) {
      console.log(`[TWITCH-FLUSH] DISCORD_BOT_SCORE_SECRET not configured`.red);
      return res.status(500).json({ error: "secret not configured" });
    }

    const auth = req.headers.authorization || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!provided || provided !== expectedSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid payload" });
    }
    const { sessionId, channel, channelId, scores } = body;
    if (typeof sessionId !== "number" || !Number.isFinite(sessionId)) {
      return res.status(400).json({ error: "missing sessionId" });
    }
    if (!Array.isArray(scores)) {
      return res.status(400).json({ error: "missing scores" });
    }

    const flushes = client.twitchScoreFlushesCollection;
    if (!flushes) {
      return res.status(503).json({ error: "db not ready" });
    }

    // Idempotency check.
    const existing = await flushes.findOne({ sessionId }).catch(() => null);
    if (existing) {
      return res.status(200).json({
        ok: true,
        sessionId,
        idempotent: true,
        appliedUserCount: existing.appliedUserCount ?? 0,
      });
    }

    const subIndex = await buildSubMemberIndex(client);
    if (!subIndex) {
      return res.status(503).json({ error: "guild not ready" });
    }

    const guildId = twitchSync.guildId;
    let applied = 0;
    let skipped = 0;
    const skippedLogins = [];

    for (const score of scores) {
      const login = String(score?.twitchLogin || "").toLowerCase();
      const count = Number(score?.count) || 0;
      if (!login || count <= 0) continue;

      const member = subIndex.get(login);
      if (!member) {
        skipped += 1;
        if (skippedLogins.length < 20) skippedLogins.push(login);
        continue;
      }

      const xp = rollSessionXp(count);
      if (xp <= 0) continue;

      try {
        await grantXp(client, {
          userId: member.user.id,
          guildId,
          username: member.user.username,
          avatarHash: member.user.avatar,
          amount: xp,
          source: "twitch_chat",
          counterField: "xpFromTwitchChat",
          incrementMessages: false,
          meta: {
            sessionId,
            twitchLogin: login,
            twitchDisplayName: score?.twitchDisplayName || login,
            twitchChannel: channel,
            twitchChannelId: channelId,
            messageCount: count,
          },
          member,
        });
        applied += 1;
      } catch (err) {
        console.log(`[TWITCH-FLUSH] grantXp failed for ${login}: ${err}`.red);
      }
    }

    try {
      await flushes.insertOne({
        sessionId,
        channel: channel || null,
        channelId: channelId || null,
        appliedUserCount: applied,
        skippedUserCount: skipped,
        totalScoreCount: scores.length,
        flushedAt: new Date(),
      });
    } catch (err) {
      // Race: another request inserted while we were processing.
      if (!(err && err.code === 11000)) {
        console.log(`[TWITCH-FLUSH] insert flush record failed: ${err}`.red);
      }
    }

    console.log(
      `[TWITCH-FLUSH] session=${sessionId} applied=${applied} skipped=${skipped} total=${scores.length}`.cyan
    );

    return res.status(200).json({
      ok: true,
      sessionId,
      applied,
      skipped,
      total: scores.length,
      sampleSkippedLogins: skippedLogins,
    });
  };
};
