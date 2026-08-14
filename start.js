const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const SEPAY_SECRET_KEY = process.env.SEPAY_SECRET_KEY || "";

function verifySepaySignature(rawBody, signatureHeader) {
  if (!SEPAY_SECRET_KEY || !signatureHeader) return true;
  try {
    const expectedSignature = crypto
      .createHmac("sha256", SEPAY_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expectedSignature.trim().toLowerCase())
    );
  } catch (e) {
    return false;
  }
}

// 1. Tạo Web Server (Health Check & SePay Webhook)
http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/sepay-webhook") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const sepaySignature = req.headers["x-sepay-signature"] || req.headers["x-signature"] || "";

      if (SEPAY_SECRET_KEY && !verifySepaySignature(body, sepaySignature)) {
        console.error("[SePay] ❌ Invalid HMAC signature!");
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
      }

      try {
        const data = JSON.parse(body);
        const content = data.content || "";
        const amount = parseFloat(data.transferAmount || 0);

        console.log(`[SePay Webhook] Received: ${content} | Amount: ${amount} VNĐ`);

        const match = content.match(/(?:FBNAP|NAP)(\d+)/i);
        if (match) {
          const userId = match[1];
          const creditsToAdd = Math.floor((amount / 30000) * 100);

          console.log(`[SePay] Valid top-up for User ID ${userId}: +${creditsToAdd} credits`);
          // Trigger notification or balance update logic here if needed
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("[SePay] JSON parsing error:", err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Health Check Endpoint for Railway
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WolfMod Bot is online and running!\n");
}).listen(PORT, () => {
  console.log(`[System] Web & SePay Webhook Server listening on port ${PORT}`);
});

try {
  console.log("=== Initializing WolfMod Multi-Bot ===");
  require("./index.js"); // Telegram Bot
  console.log("[System] Telegram logic loaded.");
  
  require("./discord-bot.js"); // Discord Bot
  console.log("[System] Discord logic loaded.");
} catch (err) {
  console.error("[System] Startup error:", err);
  process.exit(1);
}
