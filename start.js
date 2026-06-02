const { spawn } = require("child_process");
const http = require("http");

// Tạo một HTTP server cơ bản để giữ ứng dụng hoạt động và phản hồi như một "website"
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WolfMod Bot is online and running!\n");
}).listen(PORT, () => {
  console.log(`[Web] Health check server listening on port ${PORT}`);
});

function startProcess(name, script) {
  const proc = spawn("node", [script], { stdio: "inherit" });

  proc.on("close", (code) => {
    console.log(`[${name}] exited with code ${code}, restarting in 5s...`);
    setTimeout(() => startProcess(name, script), 5000);
  });

  proc.on("error", (err) => {
    console.error(`[${name}] error: ${err.message}`);
  });

  console.log(`[${name}] started (PID: ${proc.pid})`);
  return proc;
}

console.log("=== Starting all bots ===");
startProcess("Telegram", "index.js");
startProcess("Discord", "discord-bot.js");
