const BADGE_CATEGORIES = {
  level: "🏆 等級成就",
  streak: "🔥 連勝成就",
  message: "💬 訊息成就",
  voice: "🎤 語音成就",
  social: "🤝 社交成就",
  special: "✨ 特殊成就",
};

/**
 * 每個徽章：
 *   id          唯一鍵（DB 存這個，不可變更）
 *   category    BADGE_CATEGORIES key
 *   name        顯示名
 *   emoji       顯示 emoji
 *   description 解鎖條件文案
 *   check       (doc) => boolean，doc 是 UserLevels 文件
 */
const BADGES = [
  // === 等級 ===
  { id: "level_5",   category: "level", name: "新星",      emoji: "⭐", description: "達到 Lv.5",
    check: (doc) => (doc.level || 0) >= 5 },
  { id: "level_10",  category: "level", name: "白銀勳章",  emoji: "🥈", description: "達到 Lv.10",
    check: (doc) => (doc.level || 0) >= 10 },
  { id: "level_25",  category: "level", name: "黃金勳章",  emoji: "🥇", description: "達到 Lv.25",
    check: (doc) => (doc.level || 0) >= 25 },
  { id: "level_50",  category: "level", name: "白金勳章",  emoji: "💎", description: "達到 Lv.50",
    check: (doc) => (doc.level || 0) >= 50 },
  { id: "level_100", category: "level", name: "傳說王者",  emoji: "👑", description: "達到 Lv.100",
    check: (doc) => (doc.level || 0) >= 100 },

  // === 連勝 ===
  { id: "streak_3",   category: "streak", name: "三日連登",  emoji: "🌱", description: "連續簽到 3 天",
    check: (doc) => (doc.longestStreak || 0) >= 3 },
  { id: "streak_7",   category: "streak", name: "週末戰士",  emoji: "🔥", description: "連續簽到 7 天",
    check: (doc) => (doc.longestStreak || 0) >= 7 },
  { id: "streak_30",  category: "streak", name: "全勤之月",  emoji: "🏅", description: "連續簽到 30 天",
    check: (doc) => (doc.longestStreak || 0) >= 30 },
  { id: "streak_100", category: "streak", name: "百日不墜",  emoji: "💯", description: "連續簽到 100 天",
    check: (doc) => (doc.longestStreak || 0) >= 100 },

  // === 訊息 ===
  { id: "msg_100",   category: "message", name: "話匣子",    emoji: "💬", description: "累積 100 則訊息",
    check: (doc) => (doc.totalMessages || 0) >= 100 },
  { id: "msg_1000",  category: "message", name: "話癆",      emoji: "📣", description: "累積 1,000 則訊息",
    check: (doc) => (doc.totalMessages || 0) >= 1000 },
  { id: "msg_10000", category: "message", name: "嘴砲大師",  emoji: "🎙️", description: "累積 10,000 則訊息",
    check: (doc) => (doc.totalMessages || 0) >= 10000 },

  // === 語音 ===
  { id: "voice_1h",   category: "voice", name: "初登麥",    emoji: "🎤", description: "累積語音 1 小時",
    check: (doc) => (doc.totalVoiceMinutes || 0) >= 60 },
  { id: "voice_10h",  category: "voice", name: "麥霸",      emoji: "🗣️", description: "累積語音 10 小時",
    check: (doc) => (doc.totalVoiceMinutes || 0) >= 600 },
  { id: "voice_100h", category: "voice", name: "聲音之王",  emoji: "👑", description: "累積語音 100 小時",
    check: (doc) => (doc.totalVoiceMinutes || 0) >= 6000 },

  // === 社交（被加 reaction，需 Phase 7 反應 XP 才會累積）===
  { id: "react_10",  category: "social", name: "受歡迎", emoji: "❤️", description: "被加 10 個反應",
    check: (doc) => (doc.totalReactionsReceived || 0) >= 10 },
  { id: "react_100", category: "social", name: "人氣王", emoji: "🌟", description: "被加 100 個反應",
    check: (doc) => (doc.totalReactionsReceived || 0) >= 100 },
];

const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

module.exports = { BADGES, BADGE_CATEGORIES, BADGE_BY_ID };
