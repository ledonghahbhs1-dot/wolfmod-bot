const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

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

function startBot() {
  bot = new TelegramBot(token, {
    polling: { interval: 2000, autoStart: true, params: { timeout: 10 } }
  });

  bot.onText(/\/start/, groupOnly((msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name ?? "there";
    bot.sendMessage(chatId,
      "👋 Hello, <b>" + firstName + "</b>!\n\n🐉 Welcome to <b>WolfMod Bot</b>! 🎉\n\nCommands:\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /paymentmethod\n🛡 /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n❓ /help",
      { parse_mode: "HTML" }
    );
  }));

  bot.onText(/\/help/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id,
      "📖 <b>Command List</b>\n\n📜 /scriptfreedragoncity\n💎 /scriptvipdragoncity\n🔑 /getfreekey\n🗝 /getkey USERNAME\n📖 /tutorial\n💳 /paymentmethod\n🛡 /gameguardian\n📱 /vphonegaga\n💻 /bluestack\n🏠 /start\n\n⚡️ @wolfmodyt",
      { parse_mode: "HTML" }
    );
  }));

  bot.onText(/\/scriptfreedragoncity/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📜 <b>Free Dragon City Script</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📜 Get Free Script", url: "https://t.me/youtubewolfmod/311" }]] }
    });
  }));

  bot.onText(/\/scriptvipdragoncity/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "💎 <b>VIP Dragon City Script</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💎 Get VIP Script", url: "https://t.me/youtubewolfmod/299" }]] }
    });
  }));

  bot.onText(/\/getfreekey/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "🔑 <b>Get Free Key</b>\n\n🌐 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔑 Get Free Key", url: "https://www.wolfmod.xyz/get-free-key" }]] }
    });
  }));

  bot.onText(/\/getkey(?:\s+(.+))?/, groupOnly(async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match?.[1]?.trim().replace(/^@/, "") || null;

    if (!username) {
      bot.sendMessage(chatId,
        "❌ <b>Missing username!</b>\n\nUsage: <code>/getkey USERNAME</code>\nExample: <code>/getkey wolfmodyt</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const loadingMsg = await bot.sendMessage(chatId,
      "⏳ Generating key for <b>@" + username + "</b>...",
      { parse_mode: "HTML" }
    );

    try {
      const res = await fetch("https://wolfmod.xyz/api/genkey", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wolf-api-key": "WOLF_SUPER_SECRET_123456"
        },
        body: JSON.stringify({ username })
      });

      if (!res.ok) {
        const errText = await res.text();
        log("genkey error " + res.status + ": " + errText.substring(0, 200));
        await bot.editMessageText(
          "❌ <b>Failed to generate key.</b>\nError " + res.status + ". Try again later.",
          { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
        );
        return;
      }

      const data = await res.json();
      const key = data.key || data.license_key || "N/A";
      const shortUrl = data.short_url || data.shortUrl || data.url || "N/A";

      await bot.editMessageText(
        "✅ <b>Key Generated!</b>\n\n👤 Username: <b>@" + username + "</b>\n🗝 Key: <code>" + key + "</code>\n🔗 Link: " + shortUrl + "\n\n⚠️ Key is <b>pending activation</b>. Click the link to activate.",
        { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
      );
      log("/getkey success for @" + username);
    } catch (err) {
      log("/getkey error: " + err.message);
      await bot.editMessageText(
        "❌ <b>Network error.</b>\nCould not reach key server.\n<code>" + err.message + "</code>",
        { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
      );
    }
  }));

  bot.onText(/\/tutorial/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📖 <b>How To Use Guide</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📖 View Tutorial", url: "https://t.me/c/2770498924/10617" }]] }
    });
  }));

  bot.onText(/\/paymentmethod/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id,
      "👉 <b>PAYMENT METHODS</b>\n\n☑️ PayPal: contact.wolfmod@gmail.com\n☑️ Binance ID: 1158594960\n☑️ SociaBuzz: <a href=\"https://sociabuzz.com/ldh/tribe\">LINK</a>\n☑️ VCB: 9382382864 | LE DONG HA\n\n☑️ Send by FRIENDS AND FAMILY OPTION!\n\nDM ⚡️ @wolfmodyt ⚡️ to confirm.",
      { parse_mode: "HTML" }
    );
  }));

  bot.onText(/\/gameguardian/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "🛡 <b>GameGuardian by WolfMod</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🛡 Download GameGuardian", url: "https://www.mediafire.com/file/gb22k0yerlunq19/[GG_V101.1]+BY+WOLFMOD.zip/file" }]] }
    });
  }));

  bot.onText(/\/vphonegaga/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "📱 <b>VPhoneGaga Fix Rom</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📱 Download VPhoneGaga", url: "https://www.mediafire.com/file/vgnkp09ib3nij0f/Vphonegaga_Fix_Rom.apk" }]] }
    });
  }));

  bot.onText(/\/bluestack/, groupOnly((msg) => {
    bot.sendMessage(msg.chat.id, "💻 <b>BlueStack</b>\n\n🔗 Click the button below:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "💻 Download BlueStack", url: "https://mega.nz/file/Wd0yQD6a#Df68i0BypTiQ7Spgk5jXx4j_ly-tm0dGnvMY_weVms8" }]] }
    });
  }));

  bot.on("message", (msg) => {
    if ((msg.text ?? "").startsWith("/")) return;
    if (!isGroupChat(msg)) {
      bot.sendMessage(msg.chat.id,
        "🚫 <b>This bot only works in group chats.</b>\n\nPlease add me to a group or supergroup to use my commands.",
        { parse_mode: "HTML" }
      );
    }
  });

  bot.on("polling_error", (err) => {
    if (err.code === "ETELEGRAM" && err.message.includes("409")) {
      log("409 conflict. Waiting 15s...");
      bot.stopPolling();
      setTimeout(() => { log("Restarting..."); bot.startPolling(); }, 15000);
    } else {
      log("Polling error: " + err.message);
    }
  });

  log("✅ WolfMod Bot started (group-only + /getkey)");
}

startBot();
