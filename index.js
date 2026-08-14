const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const http = require("http");

function httpsPost(urlStr, body, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const url = new URL(urlStr);
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    const lib = url.protocol === "https:" ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: { ...headers, "Content-Length": bodyBuf.length }
    };
    const req = lib.request(options, (res2) => {
      if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
        res2.resume();
        const loc = res2.headers.location;
        const absLoc = loc.startsWith("http") ? loc : url.protocol + "//" + url.hostname + loc;
        console.log("[httpsPost] redirect " + res2.statusCode + " → " + absLoc);
        return resolve(httpsPost(absLoc, bodyBuf, headers, redirects + 1));
      }
      let data = "";
      res2.on("data", chunk => { data += chunk; });
      res2.on("end", () => resolve({ status: res2.statusCode, ok: res2.statusCode >= 200 && res2.statusCode < 300, text: data }));
    });
    req.setTimeout(15000, () => { req.destroy(new Error("Request timeout")); });
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}
const fs = require("fs");
const path = require("path");

const token = process.env.TELEGRAM_BOT_TOKEN;
const WOLF_API_KEY = process.env.WOLF_API_KEY || "";
const LINK4M_TOKEN = process.env.LINK4M_TOKEN || "668ba4df9db6371e5c26ddb2";
const WORKINK_API_KEY = process.env.WORKINK_API_KEY || "";
const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://www.wolfmodkk.xyz";

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

// ─── License Key & Link Shortener Helpers ─────────────────────────────────────
const crypto = require("crypto");
function generateLicenseKey(username) {
  const safeUsername = (username || "USER").replace(/[|\s]/g, "");
  const randomPart = crypto.randomBytes(8).toString("hex").toUpperCase();
  return safeUsername ? `${safeUsername}|${randomPart}` : randomPart;
}

async function generateLink4mUrl(targetUrl) {
  if (!LINK4M_TOKEN) return null;
  try {
    const apiUrl = `https://link4m.co/api-shorten/v2?api=${LINK4M_TOKEN}&url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      return data.shortenedUrl || data.shortened_url || data.short_url || data.url || null;
    }
  } catch (e) {
    log("[Link4m] Error: " + e.message);
  }
  return null;
}

async function generateWorkinkUrl(targetUrl) {
  if (!WORKINK_API_KEY) return null;
  try {
    const res = await fetch("https://dashboard.work.ink/_api/v1/link", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WORKINK_API_KEY },
      body: JSON.stringify({ destination: targetUrl, title: "WolfMod Key Activation" })
    });
    if (res.ok) {
      const data = await res.json();
      return data.link || data.url || null;
    }
  } catch (e) {
    log("[Workink] Error: " + e.message);
  }
  return null;
}

// ─── Data persistence ────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    log("data.json load error: " + e.message);
  }
  return { points: {}, pending: {}, joined: {} };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    log("data.json save error: " + e.message);
  }
}

const db = loadData();

function getUser(userId, name, username) {
  if (!db.points[userId]) {
    db.points[userId] = { points: 0, name: name || "Unknown", username: username || "" };
  } else {
    if (name) db.points[userId].name = name;
    if (username) db.points[userId].username = username;
  }
  saveData(db);
  return db.points[userId];
}

function addPoint(referrerId, referrerName, referrerUsername) {
  const user = getUser(referrerId, referrerName, referrerUsername);
  user.points += 1;
  saveData(db);
  return user.points;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isGroupChat(msg) {
  return msg.chat.type === "group" || msg.chat.type === "supergroup" || msg.chat.type === "channel";
}

function groupOnly(handler) {
  return (msg, match) => {
    // Cho phép phản hồi cả tin nhắn riêng (Private) lẫn nhóm (Group)
    handler(msg, match);
  };
}

// Danh sách từ khóa cấm (mại dâm, nhạy cảm...)
const BANNED_KEYWORDS = ["mại dâm", "gái gọi", "đi khách", "pga", "pgb", "sex", "clip nóng", "cave", "phò", "đứng đường"];

let bot;
let botUsername = "";

async function startBot() {
  // Force-clear any existing polling/webhook session before starting
  // This prevents 409 conflicts from stale deployments
  log("🔄 Clearing existing Telegram sessions...");
  try {
    const https = require("https");
    await new Promise((resolve) => {
      https.get(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          log("✅ Session cleared, starting polling...");
          resolve();
        });
      }).on("error", (e) => {
        log("⚠️  Could not clear session: " + e.message);
        resolve();
      });
    });
  } catch (e) {
    log("⚠️  Could not clear session: " + e.message);
  }

  // Small delay to let Telegram register the session reset
  await new Promise(r => setTimeout(r, 3000));

  bot = new TelegramBot(token, {
    polling: {
      interval: 2000,
      autoStart: true,
      params: { timeout: 10, allowed_updates: ["message", "chat_member"] }
    }
  });

  // Fetch bot username for referral links
  bot.getMe().then((me) => {
    botUsername = me.username;
    log("✨ Telegram Bot authenticated as: @" + botUsername);
    log("🆔 Bot ID: " + me.id);
  }).catch((e) => log("getMe error: " + e.message));

  // ─── /start (private + group) ──────────────────────────────────────────────
  // Handles referral deep links in private: /start ref_{referrerId}_{chatId}
  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const param = match?.[1]?.trim() || "";

    // Private message with referral param
    if (!isGroupChat(msg) && param.startsWith("ref_")) {
      const parts = param.split("_");
      // format: ref_{referrerId}_{chatId}
      const referrerId = parts[1];
      const chatId = parts[2];
      const newUserId = String(msg.from?.id);

      if (!referrerId || !chatId) {
        bot.sendMessage(msg.chat.id,
          "🚫 <b>Invalid referral link.</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      if (newUserId === referrerId) {
        bot.sendMessage(msg.chat.id,
          "😅 <b>You cannot refer yourself!</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      const joinKey = newUserId + "_" + chatId;
      if (db.joined[joinKey]) {
        bot.sendMessage(msg.chat.id,
          "ℹ️ <b>You have already been counted for a referral in this group.</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      // Store pending referral
      db.pending[newUserId] = { referrerId, chatId };
      saveData(db);

      bot.sendMessage(msg.chat.id,
        "👋 <b>Referral link accepted!</b>\n\n" +
        "✅ Step 1: Join the channel & group below\n" +
        "✅ Step 2: Go back to the group and send any message\n" +
        "🎁 Your friend will receive <b>+1 point</b> right after!",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join WOLF Team", url: "https://t.me/youtubewolfmod" }],
              [{ text: "👥 Join WOLF Team Chat", url: "https://t.me/+n-tXTX8vVvQ3OTk1" }]
            ]
          }
        }
      );
      log("Pending referral stored: new=" + newUserId + " ref=" + referrerId + " chat=" + chatId);
      return;
    }

    // Normal group /start
    if (isGroupChat(msg)) {
      const chatId = msg.chat.id;
      const firstName = msg.from?.first_name ?? "there";
      bot.sendMessage(chatId,
        "👋 Hello, <b>" + firstName + "</b>!\n\n🐉 Welcome to <b>WolfMod Bot</b>! 🎉\n\nCommands:\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /buyvip\n /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n🔗 /referral\n📊 /mystats\n🏆 /leaderboard\n❓ /help",
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── /help ─────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id,
      "📖 <b>Command List</b>\n\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /buyvip\n /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n🔗 /referral\n📊 /mystats\n🏆 /leaderboard\n🏠 /start\n\n⚡️ @wolfmodyt",
      { parse_mode: "HTML" }
    );
  }));

  // ─── Required channels for /referral ─────────────────────────────────────
  const REQUIRED_CHANNELS = [
    { id: -1002070376940,      url: "https://t.me/youtubewolfmod",          label: "📢 WOLF Team" },
    { id: -1002770498924,      url: "https://t.me/+n-tXTX8vVvQ3OTk1",      label: "👥 WOLF Team Chat" }
  ];

  async function checkMembership(userId) {
    const results = await Promise.all(
      REQUIRED_CHANNELS.map(async (ch) => {
        try {
          const member = await bot.getChatMember(ch.id, userId);
          const ok = ["creator", "administrator", "member", "restricted"].includes(member.status);
          log("checkMembership " + userId + " in " + ch.id + ": status=" + member.status + " ok=" + ok);
          return { ...ch, joined: ok };
        } catch (e) {
          log("checkMembership ERROR " + userId + " in " + ch.id + ": " + e.message + " (Bot must be admin in private groups/channels)");
          return { ...ch, joined: false };
        }
      })
    );
    return results;
  }

  // ─── /referral ─────────────────────────────────────────────────────────────
  bot.onText(/\/referral/, groupOnly(async (msg) => {
    const userId = String(msg.from?.id);
    const name = msg.from?.first_name || "Unknown";
    const username = msg.from?.username || "";
    const chatId = msg.chat.id;

    if (!botUsername) {
      bot.sendMessage(chatId,
        "⏳ Bot is still starting up, please try again in a moment.",
        { parse_mode: "HTML" }
      );
      return;
    }

    // Check required channel membership
    const membership = await checkMembership(userId);
    const notJoined = membership.filter(ch => !ch.joined);

    if (notJoined.length > 0) {
      const joinButtons = notJoined.map(ch => [{ text: ch.label, url: ch.url }]);
      await bot.sendMessage(chatId,
        "🚫 <b>You must join the following channels before using /referral:</b>\n\n" +
        notJoined.map(ch => "• " + ch.label).join("\n") +
        "\n\n✅ After joining, send <code>/referral</code> again to continue.",
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: joinButtons }
        }
      );
      log("/referral blocked for " + userId + " - missing: " + notJoined.map(c => c.id).join(", "));
      return;
    }

    const user = getUser(userId, name, username);

    // Calculate rank among all users with points
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);
    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = rank > 0 ? "#" + rank + " / " + allUsers.length : "Chưa có hạng";

    const referralLink = "https://t.me/" + botUsername + "?start=ref_" + userId + "_" + chatId;
    const displayName = username ? "@" + username : name;

    bot.sendMessage(chatId,
      "🔗 <b>Referral Program</b>\n\n" +
      "👤 User: <b>" + displayName + "</b>\n" +
      "⭐ Points: <b>" + user.points + "</b>\n" +
      "🏆 Rank: <b>" + rankText + "</b>\n\n" +
      "📢 <b>How it works:</b>\n" +
      "1️⃣ Share your link below\n" +
      "2️⃣ Friend clicks link → messages bot\n" +
      "3️⃣ Friend joins this group → you get <b>+1 point</b>!\n\n" +
      "🔗 <b>Your referral link:</b>\n<code>" + referralLink + "</code>\n\n" +
      "💡 Tap the link to copy, then share it!",
      { parse_mode: "HTML" }
    );
    log("/referral for " + userId + " points=" + user.points + " rank=" + rankText);
  }));

  // ─── /mystats ──────────────────────────────────────────────────────────────
  bot.onText(/\/mystats/, groupOnly((msg) => {
    const userId = String(msg.from?.id);
    const name = msg.from?.first_name || "Unknown";
    const username = msg.from?.username || "";
    const chatId = msg.chat.id;

    const user = getUser(userId, name, username);
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = user.points > 0 && rank > 0 ? "#" + rank + " / " + allUsers.length : "Not ranked yet";
    const displayName = username ? "@" + username : name;

    bot.sendMessage(chatId,
      "📊 <b>Your Stats</b>\n\n" +
      "👤 User: <b>" + displayName + "</b>\n" +
      "⭐ Referral points: <b>" + user.points + "</b>\n" +
      "🏆 Rank: <b>" + rankText + "</b>\n\n" +
      "💡 Use /referral to get your invite link!",
      { parse_mode: "HTML" }
    );
    log("/mystats for " + userId + " points=" + user.points + " rank=" + rankText);
  }));

  // ─── /leaderboard ──────────────────────────────────────────────────────────
  bot.onText(/\/leaderboard/, groupOnly((msg) => {
    const requesterId = String(msg.from?.id);
    const chatId = msg.chat.id;

    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points, name: u.name, username: u.username }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    if (allUsers.length === 0) {
      bot.sendMessage(chatId,
        "📊 <b>Leaderboard</b>\n\n🚫 No referral points yet!\n\nUse /referral to get your link and start inviting friends.",
        { parse_mode: "HTML" }
      );
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const top10 = allUsers.slice(0, 10);

    let text = "🏆 <b>Referral Leaderboard</b>\n\n";
    top10.forEach((u, i) => {
      const medal = medals[i] || "🔹";
      const display = u.username ? "@" + u.username : u.name;
      const isRequester = u.id === requesterId ? " ← you" : "";
      text += medal + " <b>" + (i + 1) + ".</b> " + display + " — <b>" + u.points + " pts</b>" + isRequester + "\n";
    });

    // Show requester's rank if not in top 10
    const requesterRank = allUsers.findIndex(u => u.id === requesterId);
    if (requesterRank >= 10) {
      const ru = allUsers[requesterRank];
      const display = ru.username ? "@" + ru.username : ru.name;
      text += "\n・・・\n🔸 <b>" + (requesterRank + 1) + ".</b> " + display + " — <b>" + ru.points + " pts</b> ← you";
    }

    text += "\n\n💡 Use /referral to get your invite link!";

    bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    log("/leaderboard requested by " + requesterId);
  }));

  // ─── /scriptfreedragoncity ─────────────────────────────────────────────────
  bot.onText(/\/scriptfreedragoncity/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📜 <b>Free Dragon City Script</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📜 Get Free Script", url: "https://t.me/youtubewolfmod/311" }]] }
    });
  }));

  // ─── /scriptvipdragoncity ──────────────────────────────────────────────────
  bot.onText(/\/scriptvipdragoncity/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "💎 <b>VIP Dragon City Script</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💎 Get VIP Script", url: "https://t.me/youtubewolfmod/381" }]] }
    });
  }));

  // ─── /getfreekey ───────────────────────────────────────────────────────────
  bot.onText(/\/getfreekey/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "🔑 <b>Get Free Key</b>\n\n🌐 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔑 Get Free Key", url: "https://www.wolfmod.xyz/get-free-key" }]] }
    });
  }));

  // ─── /getkey ───────────────────────────────────────────────────────────────
  bot.onText(/\/getkey(?:\s+(.+))?/, groupOnly(async (msg, match) => {
    const chatId = msg.chat.id;
    const argUsername = match?.[1]?.trim().replace(/^@/, "") || null;
    const senderUsername = msg.from?.username || msg.from?.first_name || null;
    const username = argUsername || senderUsername || "User";

    const loadingMsg = await bot.sendMessage(chatId,
      "⏳ Generating verification link for <b>" + username + "</b>...",
      { parse_mode: "HTML" }
    );

    try {
      let link4mUrl = null;
      let workinkUrl = null;

      // Trường hợp 1: Có WOLF_API_KEY -> Gọi API /genkey của Web
      if (WOLF_API_KEY) {
        try {
          const { ok: resOk, text: rawText } = await httpsPost(
            `${WEB_BASE_URL}/api/genkey`,
            JSON.stringify({ username }),
            { "Content-Type": "application/json", "x-wolf-api-key": WOLF_API_KEY }
          );
          if (resOk) {
            const data = JSON.parse(rawText);
            if (data.success && data.encodedLinks) {
              const decoded = JSON.parse(Buffer.from(data.encodedLinks, "base64").toString("utf8"));
              link4mUrl = decoded.link4m || null;
              workinkUrl = decoded.workink || null;
            }
          }
        } catch (e) {
          log("[getkey] API genkey call failed, switching to local shortener: " + e.message);
        }
      }

      // Trường hợp 2: Nếu chưa có link từ API -> Tạo link kích hoạt local và rút gọn qua Link4m / Workink
      if (!link4mUrl && !workinkUrl) {
        const activationToken = crypto.randomBytes(5).toString("hex").toUpperCase().substring(0, 9);
        const activationUrl = `${WEB_BASE_URL}/activate/${activationToken}?user=${encodeURIComponent(username)}`;

        [link4mUrl, workinkUrl] = await Promise.all([
          generateLink4mUrl(activationUrl),
          generateWorkinkUrl(activationUrl)
        ]);

        // Nếu cả 2 dịch vụ rút gọn đều chưa cấu hình token, trả về link kích hoạt trực tiếp
        if (!link4mUrl && !workinkUrl) {
          link4mUrl = activationUrl;
        }
      }

      const buttons = [];
      if (link4mUrl)  buttons.push([{ text: "🔗 Kích hoạt qua Link4m",  url: link4mUrl }]);
      if (workinkUrl) buttons.push([{ text: "🔗 Kích hoạt qua Workink", url: workinkUrl }]);

      const reply = "✅ <b>Tạo Link Nhận Key Thành Công!</b>\n\n" +
        "👤 Username: <b>" + username + "</b>\n" +
        "⏳ Thời hạn: <b>2 giờ</b>\n\n" +
        "👉 <i>Vui lòng chọn 1 trong các link bên dưới, hoàn tất vượt link để nhận Key:</i>";

      await bot.editMessageText(reply, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
      log("/getkey shortlink success for " + username);

      setTimeout(async () => {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
      }, 60000);
    } catch (err) {
      log("/getkey error: " + err.message);
      await bot.editMessageText("❌ <b>Có lỗi xảy ra khi tạo link key.</b>", {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML"
      });
    }
  }));

  // ─── /tutorial ─────────────────────────────────────────────────────────────
  bot.onText(/\/tutorial/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📖 <b>How To Use Guide</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📖 View Tutorial", url: "https://t.me/c/2770498924/10617" }]] }
    });
  }));

  // ─── /buyvip ───────────────────────────────────────────────────────────────
  bot.onText(/\/buyvip/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "💳 <b>Buy VIP Key</b>\n\n🌐 Click the button below to purchase a VIP Key:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💳 Buy VIP Key", url: "https://www.wolfmod.xyz/buy-vip-key" }]] }
    });
  }));

  // ─── /gameguardian ─────────────────────────────────────────────────────────
  bot.onText(/\/gameguardian/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "🛡 <b>GameGuardian by WolfMod</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🛡 Download GameGuardian", url: "https://www.mediafire.com/file/gb22k0yerlunq19/[GG_V101.1]+BY+WOLFMOD.zip/file" }]] }
    });
  }));

  // ─── /vphonegaga ───────────────────────────────────────────────────────────
  bot.onText(/\/vphonegaga/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📱 <b>VPhoneGaga Fix Rom</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📱 Download VPhoneGaga", url: "https://www.mediafire.com/file/vgnkp09ib3nij0f/Vphonegaga_Fix_Rom.apk" }]] }
    });
  }));

  // ─── /bluestack ────────────────────────────────────────────────────────────
  bot.onText(/\/bluestack/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "💻 <b>BlueStack</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💻 Download BlueStack", url: "https://mega.nz/file/Wd0yQD6a#Df68i0BypTiQ7Spgk5jXx4j_ly-tm0dGnvMY_weVms8" }]] }
    });
  }));

  // ─── New member joined group → award referral point ───────────────────────
  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id);

    // 1. Chống share bot khác (Inline Bot)
    if (msg.via_bot && isGroupChat(msg)) {
      log(`[Security] Deleted message via inline bot: @${msg.via_bot.username} from user ${userId}`);
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      bot.sendMessage(chatId, `🚫 <b>@${msg.from?.username || userId}</b>, vui lòng không chia sẻ bot khác vào nhóm!`, { parse_mode: "HTML" })
         .then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 10000));
      return;
    }

    // 2. Chống từ khóa mại dâm / nhạy cảm
    if (msg.text && isGroupChat(msg)) {
      const textLower = msg.text.toLowerCase();
      const hasBannedWord = BANNED_KEYWORDS.some(word => textLower.includes(word));

      if (hasBannedWord) {
        log(`[Security] Banned word detected from ${userId}: ${msg.text}`);
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.sendMessage(chatId, `🚫 <b>@${msg.from?.username || userId}</b>, tin nhắn của bạn chứa từ ngữ bị cấm và đã bị xóa.`, { parse_mode: "HTML" })
           .then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 10000));
        return;
      }
    }

    // Handle new members joining
    if (msg.new_chat_members && msg.new_chat_members.length > 0) {
      const sChatId = String(msg.chat.id);
      for (const newMember of msg.new_chat_members) {
        if (newMember.is_bot) continue;
        const newUserId = String(newMember.id);
        const joinKey = newUserId + "_" + chatId;

        // Check if this user has a pending referral for this group
        const pending = db.pending[newUserId];
        if (pending && String(pending.chatId) === sChatId && !db.joined[joinKey]) {
          const referrerId = pending.referrerId;
          const referrerData = db.points[referrerId] || {};
          const newPoints = addPoint(referrerId, referrerData.name, referrerData.username);

          // Mark as joined so it can't be counted twice
          db.joined[joinKey] = true;
          delete db.pending[newUserId];
          saveData(db);

          const referrerName = referrerData.name || "someone";
          bot.sendMessage(msg.chat.id,
            "🎉 <b>" + (newMember.first_name || "A new member") + "</b> joined via referral!\n\n" +
            "⭐ <b>" + referrerName + "</b> earned <b>+1 point</b>! (Total: " + newPoints + ")",
            { parse_mode: "HTML" }
          );

          // Also notify the referrer privately if possible
          bot.sendMessage(referrerId,
            "🎉 <b>+1 referral point!</b>\n\n" +
            "<b>" + (newMember.first_name || "Someone") + "</b> joined the group using your link.\n" +
            "⭐ Your total points: <b>" + newPoints + "</b>",
            { parse_mode: "HTML" }
          ).catch(() => {});

          log("Referral awarded: referrer=" + referrerId + " newMember=" + newUserId + " points=" + newPoints);
        }
      }
      return;
    }

    // Check if a pending referred user sent their first message in the group
    // (fallback: some Telegram clients don't trigger new_chat_members properly)
    if (isGroupChat(msg) && msg.from && !msg.text?.startsWith("/")) {
      const senderId = String(msg.from.id);
      const chatId = String(msg.chat.id);
      const joinKey = senderId + "_" + chatId;
      const pending = db.pending[senderId];

      if (pending && String(pending.chatId) === chatId && !db.joined[joinKey]) {
        const referrerId = pending.referrerId;
        const referrerData = db.points[referrerId] || {};
        const newPoints = addPoint(referrerId, referrerData.name, referrerData.username);

        db.joined[joinKey] = true;
        delete db.pending[senderId];
        saveData(db);

        const referrerName = referrerData.name || "someone";
        bot.sendMessage(msg.chat.id,
          "🎉 <b>" + (msg.from.first_name || "A new member") + "</b> joined via referral!\n\n" +
          "⭐ <b>" + referrerName + "</b> earned <b>+1 point</b>! (Total: " + newPoints + ")",
          { parse_mode: "HTML" }
        );

        bot.sendMessage(referrerId,
          "🎉 <b>+1 referral point!</b>\n\n" +
          "<b>" + (msg.from.first_name || "Someone") + "</b> joined the group using your link.\n" +
          "⭐ Your total points: <b>" + newPoints + "</b>",
          { parse_mode: "HTML" }
        ).catch(() => {});

        log("Referral awarded (first-message): referrer=" + referrerId + " newMember=" + senderId + " points=" + newPoints);
        return;
      }
    }

    // Reject non-command private messages
    if (!msg.text?.startsWith("/") && !isGroupChat(msg)) {
      bot.sendMessage(msg.chat.id,
        "🚫 <b>This bot only works in group chats.</b>\n\nPlease add me to a group or supergroup to use my commands.",
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── Polling error handler ─────────────────────────────────────────────────
  bot.on("polling_error", (err) => {
    if (err.code === "ETELEGRAM" && err.message.includes("409")) {
      log("⚠️  409 CONFLICT — Another bot instance is already running with this token!");
      log("    PID: " + process.pid + " | Host: " + (process.env.HOSTNAME || process.env.RAILWAY_REPLICA_ID || "unknown"));
      log("    Stopping this instance and exiting so the platform can restart cleanly...");
      bot.stopPolling().finally(() => process.exit(1));
    } else {
      log("❌ Polling error [" + (err.code || "NO_CODE") + "]: " + err.message);
    }
  });

  log("🚀 WolfMod Bot Service is now Online");
  log("   PID     : " + process.pid);
  log("   Host    : " + (process.env.HOSTNAME || process.env.RAILWAY_REPLICA_ID || "unknown"));
  log("   Platform: " + (process.env.RAILWAY_SERVICE_NAME ? "Railway (" + process.env.RAILWAY_SERVICE_NAME + ")" : "Local/Other"));
}

startBot();
