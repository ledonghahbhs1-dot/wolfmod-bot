const http = require("http");

// 1. Tạo Web Server (Health Check)
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WolfMod Bot is online and running!\n");
}).listen(PORT, () => {
  console.log(`[System] Health check server listening on port ${PORT}`);
});

try {
  console.log("=== Initializing WolfMod Multi-Bot ===");
  
  // Chạy trực tiếp logic của các bot trong cùng một tiến trình để tiết kiệm tài nguyên
  require("./index.js"); // Telegram Bot
  console.log("[System] Telegram logic loaded.");
  
  require("./discord-bot.js"); // Discord Bot
  console.log("[System] Discord logic loaded.");
} catch (err) {
  console.error("[System] Startup error:", err);
  process.exit(1); // Thoát nếu có lỗi nghiêm trọng để Railway có thể restart
}
