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
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

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
    saveData(db);
  }
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
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function groupOnly(handler) {
  return (msg, match) => {
    if (!isGroupChat(msg)) {
      bot.sendMessage(msg.chat.id,
        "🚫 <b>This bot only works in group chats.</b>\n\nPlease add me to a group or supergroup to use my commands.",
        { parse_mode: "HTML" }
      );
      log("Rejected private from " + (msg.from?.username || msg.chat.id));
      return;
    }
    handler(msg, match);
  };
}

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
    log("Bot username: @" + botUsername);
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
        "👋 Hello, <b>" + firstName + "</b>!\n\n🐉 Welcome to <b>WolfMod Bot</b>! 🎉\n\nCommands:\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /paymentmethod\n🛡 /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n🔗 /referral\n📊 /mystats\n🏆 /leaderboard\n❓ /help",
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── /help ─────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id,
      "📖 <b>Command List</b>\n\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /paymentmethod\n🛡 /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n🔗 /referral\n📊 /mystats\n🏆 /leaderboard\n🏠 /start\n\n⚡️ @wolfmodyt",
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
      .sort((a, b) => b.points - a.points);
    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = rank > 0 ? "#" + rank + " / " + allUsers.length : "N/A";

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
      reply_markup: { inline_keyboard: [[{ text: "💎 Get VIP Script", url: "https://t.me/youtubewolfmod/299" }]] }
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
    const senderUsername = msg.from?.username || null;
    const username = argUsername || senderUsername;

    if (!username) {
      bot.sendMessage(chatId,
        "❌ <b>Missing username!</b>\n\nUsage: <code>/getkey USERNAME</code>\nExample: <code>/getkey wolfmodyt</code>\n\n💡 Or set a Telegram username and use <code>/getkey</code> directly.",
        { parse_mode: "HTML" }
      );
      return;
    }

    const loadingMsg = await bot.sendMessage(chatId,
      "⏳ Generating key for <b>@" + username + "</b>...",
      { parse_mode: "HTML" }
    );

    try {
      const { status: resStatus, ok: resOk, text: actualRawText } = await httpsPost(
        "https://wolfmod.xyz/api/genkey",
        JSON.stringify({ username }),
        { "Content-Type": "application/json", "x-wolf-api-key": "WOLF_SUPER_SECRET_123456" }
      );
      log("genkey status=" + resStatus + " body=" + actualRawText.substring(0, 300));

      const isHtml = actualRawText.trimStart().toLowerCase().startsWith("<!doctype") ||
                     actualRawText.trimStart().toLowerCase().startsWith("<html");

      if (!resOk) {
        const errDisplay = isHtml
          ? "Server returned an HTML error page (status " + resStatus + "). The API may be down."
          : actualRawText.substring(0, 150);
        await bot.editMessageText(
          "❌ <b>Failed to generate key.</b>\nError " + resStatus + ": " + errDisplay,
          { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
        );
        return;
      }

      if (isHtml) {
        await bot.editMessageText(
          "❌ <b>Unexpected response from server.</b>\nThe API returned an HTML page instead of data. Please try again later.",
          { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
        );
        return;
      }

      let data;
      try {
        data = JSON.parse(actualRawText);
      } catch {
        const safe = actualRawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await bot.editMessageText(
          "❌ <b>Unexpected response from server:</b>\n<code>" + safe.substring(0, 200) + "</code>",
          { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
        );
        return;
      }

      if (!data.success) {
        await bot.editMessageText(
          "❌ <b>Failed to generate key.</b>\n" + (data.message || "Unknown error."),
          { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
        );
        return;
      }

      const link4m  = data.shortUrls?.link4m  || data.short_url || data.shortUrl || data.url || null;
      const workink = data.shortUrls?.workink || null;
      const message = data.message || "Complete the link to activate your key.";

      const buttons = [];
      if (link4m)  buttons.push([{ text: "🔗 Activate via Link4m",  url: link4m }]);
      if (workink) buttons.push([{ text: "🔗 Activate via Workink", url: workink }]);

      const reply = "✅ <b>Key Generated!</b>\n\n" +
        "👤 Username: <b>@" + username + "</b>\n" +
        "⏳ Expires in: <b>2 hours</b>\n\n" +
        "⚠️ " + message + "\n\n" +
        "👇 <b>Choose a link to activate:</b>\n\n" +
        "<i>🗑️ This message will be deleted in 30 seconds.</i>";

      await bot.editMessageText(reply, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
      });
      log("/getkey success for @" + username);

      setTimeout(async () => {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
      }, 30000);
    } catch (err) {
      const cause = err.cause ? (" | cause: " + err.cause) : "";
      log("/getkey error: " + err.message + cause);
      const userMsg = err.name === "AbortError"
        ? "⏱ Request timed out. The key server may be slow or down."
        : "Could not reach key server.\n<code>" + err.message + "</code>";
      await bot.editMessageText(
        "❌ <b>Network error.</b>\n" + userMsg,
        { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
      );
    }
  }));

  // ─── /tutorial ─────────────────────────────────────────────────────────────
  bot.onText(/\/tutorial/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📖 <b>How To Use Guide</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📖 View Tutorial", url: "https://t.me/c/2770498924/10617" }]] }
    });
  }));

  // ─── /paymentmethod ────────────────────────────────────────────────────────
  bot.onText(/\/paymentmethod/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id,
      "👉 <b>PAYMENT METHODS</b>\n\n☑️ PayPal: contact.wolfmod@gmail.com\n☑️ Binance ID: 1158594960\n☑️ SociaBuzz: <a href=\"https://sociabuzz.com/ldh/tribe\">LINK</a>\n☑️ VCB: 9382382864 | LE DONG HA\n\n☑️ Send by FRIENDS AND FAMILY OPTION!\n\nDM ⚡️ @wolfmodyt ⚡️ to confirm.",
      { parse_mode: "HTML" }
    );
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
    // Handle new members joining
    if (msg.new_chat_members && msg.new_chat_members.length > 0) {
      const chatId = String(msg.chat.id);
      for (const newMember of msg.new_chat_members) {
        if (newMember.is_bot) continue;
        const newUserId = String(newMember.id);
        const joinKey = newUserId + "_" + chatId;

        // Check if this user has a pending referral for this group
        const pending = db.pending[newUserId];
        if (pending && String(pending.chatId) === chatId && !db.joined[joinKey]) {
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

  log("✅ WolfMod Bot started");
  log("   PID     : " + process.pid);
  log("   Host    : " + (process.env.HOSTNAME || process.env.RAILWAY_REPLICA_ID || "unknown"));
  log("   Platform: " + (process.env.RAILWAY_SERVICE_NAME ? "Railway (" + process.env.RAILWAY_SERVICE_NAME + ")" : "Local/Other"));
}

startBot();
