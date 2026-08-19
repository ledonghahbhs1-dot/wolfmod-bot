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
    const chunks = [];
    req.on("data", chunk => { chunks.push(chunk); });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
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

        const match = content.match(/TELE\s*(\d{3,15})/i);
        if (match) {
          const userId = match[1];
          const creditsToAdd = Math.floor((amount / 30000) * 100);

          console.log(`[SePay] Valid top-up for User ID ${userId}: +${creditsToAdd} credits (Code: TELE${userId})`);
          
          try {
            const indexModule = require("./index.js");
            if (indexModule && typeof indexModule.addCreditsAndNotify === "function") {
              indexModule.addCreditsAndNotify(userId, creditsToAdd, amount);
            }
          } catch (e) {
            console.error("[SePay] Error notifying user:", e.message);
          }
        }

        // --- FORWARD WEBHOOK TO FB_REPORT_WM ---
        const fbReportUrl = process.env.FB_REPORT_WEBHOOK_URL || "https://fbreportwm-production.up.railway.app/sepay-webhook";
        console.log(`[SePay] Forwarding webhook to FB_REPORT_WM at ${fbReportUrl}...`);
        fetch(fbReportUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sepay-signature": sepaySignature || "",
            "x-signature": req.headers["x-signature"] || ""
          },
          body: body
        })
        .then(async (resp) => {
          console.log(`[Forward FB_REPORT_WM] Status: ${resp.status}`);
        })
        .catch(err => {
          console.error(`[Forward FB_REPORT_WM] Error: ${err.message}`);
          // Fallback if port is needed (Railway usually maps port to 80/443 for internal if exposed, or specific port)
          if (err.message.includes("ECONNREFUSED") && !fbReportUrl.match(/:\d+/)) {
             console.log("[Forward FB_REPORT_WM] Trying fallback port 5000...");
             fetch("http://fbreportwm.railway.internal:5000/sepay-webhook", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-sepay-signature": sepaySignature || "" },
                body: body
             }).catch(e => console.error("[Forward FB_REPORT_WM] Fallback error:", e.message));
          }
        });
        // ------------------------------------------------

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
