const { spawn } = require("child_process");

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
