// MongoDB-backed voice session store. Survives bot restarts so users already
// in voice keep their original joinedAt and continue earning XP minute-by-minute.

require("colors");

function key(userId, guildId) {
  return `${userId}-${guildId}`;
}

async function upsert(client, { userId, guildId, channelId, joinedAt, username }) {
  if (!client.voiceSessionsCollection) return;
  try {
    await client.voiceSessionsCollection.updateOne(
      { userId, guildId },
      {
        $set: {
          channelId,
          username,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId,
          guildId,
          joinedAt: joinedAt || Date.now(),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.log(`[ERROR] voiceSessionStore upsert: ${e}`.red);
  }
}

async function remove(client, userId, guildId) {
  if (!client.voiceSessionsCollection) return;
  try {
    await client.voiceSessionsCollection.deleteOne({ userId, guildId });
  } catch (e) {
    console.log(`[ERROR] voiceSessionStore remove: ${e}`.red);
  }
}

async function get(client, userId, guildId) {
  if (!client.voiceSessionsCollection) return null;
  try {
    return await client.voiceSessionsCollection.findOne({ userId, guildId });
  } catch (e) {
    console.log(`[ERROR] voiceSessionStore get: ${e}`.red);
    return null;
  }
}

async function findAll(client) {
  if (!client.voiceSessionsCollection) return [];
  try {
    return await client.voiceSessionsCollection.find({}).toArray();
  } catch (e) {
    console.log(`[ERROR] voiceSessionStore findAll: ${e}`.red);
    return [];
  }
}

module.exports = { key, upsert, remove, get, findAll };
