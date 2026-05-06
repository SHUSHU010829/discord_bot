// RSS 推播 feed 設定。新增 feed 只需要動這個檔案。
// channelId 可用環境變數覆寫,方便不同部署環境切頻道。

const DEFAULT_CHANNEL_ID = "1174352640210124877";

const RSS_FEEDS = [
  {
    id: "threads_liveking",
    url: "https://discord-news.zeabur.app/threads/liveking_is_life",
    channelId:
      process.env.RSS_THREADS_LIVEKING_CHANNEL_ID || DEFAULT_CHANNEL_ID,
    type: "threads",
  },
  {
    id: "picnob_room_exhibition",
    url: "https://discord-news.zeabur.app/picnob.info/user/room_exhibition",
    channelId:
      process.env.RSS_PICNOB_ROOM_EXHIBITION_CHANNEL_ID || DEFAULT_CHANNEL_ID,
    type: "picnob",
  },
];

module.exports = { RSS_FEEDS };
