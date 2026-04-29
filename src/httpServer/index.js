require("colors");
const express = require("express");
const createFlushChatScoreHandler = require("./flushChatScore");

module.exports = function startHttpServer(client) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, ready: client.isReady() });
  });

  app.post("/api/twitch-chat-score", createFlushChatScoreHandler(client));

  app.use((err, _req, res, _next) => {
    console.log(`[HTTP] unhandled error: ${err}`.red);
    res.status(500).json({ error: "internal" });
  });

  const port = Number(process.env.PORT) || 8080;
  const server = app.listen(port, () => {
    console.log(`[HTTP] listening on port ${port}`.cyan);
  });

  server.on("error", (err) => {
    console.log(`[HTTP] server error: ${err}`.red);
  });

  return server;
};
