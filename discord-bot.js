const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

// ─── Data persistence ─────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "discord-data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    log("discord-data.json load error: " + e.message);
  }
  return { points: {}, joined: {} };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    log("discord-data.json save error: " + e.message);
  }
}

const db = loadData();

function getUser(userId, name) {
  if (!db.points[userId]) {
    db.points[userId] = { points: 0, name: name || "Unknown" };
    saveData(db);
  }
  return db.points[userId];
}

function addPoint(referrerId, referrerName) {
  const user = getUser(referrerId, referrerName);
  user.points += 1;
  saveData(db);
  return user.points;
}

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.once("ready", () => {
  log("✅ Discord Bot logged in as " + client.user.tag);
});

// ─── Message handler ──────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) {
    return message.reply("🚫 **This bot only works in servers.**\nPlease add me to a Discord server to use my commands.");
  }

  const content = message.content.trim();
  if (!content.startsWith("!")) return;

  const args = content.slice(1).split(/\s+/);
  const cmd = args[0].toLowerCase();

  const userId = message.author.id;
  const userName = message.author.username;
  const channelId = message.channel.id;

  // ── !start / !help ──────────────────────────────────────────────────────────
  if (cmd === "start" || cmd === "help") {
    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("👋 Welcome to WolfMod Bot!")
      .setDescription("🐉 **WolfMod Dragon City Bot**\n\nAvailable commands:")
      .addFields(
        { name: "📜 !scriptfreedragoncity", value: "Get the free Dragon City script", inline: false },
        { name: "💎 !scriptvipdragoncity", value: "Get the VIP Dragon City script", inline: false },
        { name: "🔑 !getfreekey", value: "Get a free activation key", inline: false },
        { name: "🗝 !getkey USERNAME", value: "Generate a key for a username", inline: false },
        { name: "📖 !tutorial", value: "How to use guide", inline: false },
        { name: "💳 !paymentmethod", value: "View payment methods", inline: false },
        { name: "🛡 !gameguardian", value: "Download GameGuardian", inline: false },
        { name: "📱 !vphonegaga", value: "Download VPhoneGaga", inline: false },
        { name: "💻 !bluestack", value: "Download BlueStack", inline: false },
        { name: "🔗 !referral", value: "Get your referral link & stats", inline: false },
        { name: "📊 !mystats", value: "View your referral stats", inline: false },
        { name: "🏆 !leaderboard", value: "View top referrers", inline: false },
      )
      .setFooter({ text: "⚡ @wolfmodyt" });
    return message.reply({ embeds: [embed] });
  }

  // ── !scriptfreedragoncity ───────────────────────────────────────────────────
  if (cmd === "scriptfreedragoncity") {
    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("📜 Free Dragon City Script")
      .setDescription("Click the button below to get the free script:");
    const channelUrl = "https://discord.com/channels/" + message.guild.id + "/1503691698918653962";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📜 Get Free Script").setStyle(ButtonStyle.Link).setURL(channelUrl)
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !scriptvipdragoncity ────────────────────────────────────────────────────
  if (cmd === "scriptvipdragoncity") {
    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("💎 VIP Dragon City Script")
      .setDescription("Click the button below to get the VIP script:");
    const channelUrl = "https://discord.com/channels/" + message.guild.id + "/1503691650306936852";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("💎 Get VIP Script").setStyle(ButtonStyle.Link).setURL(channelUrl)
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !getfreekey ─────────────────────────────────────────────────────────────
  if (cmd === "getfreekey") {
    const embed = new EmbedBuilder()
      .setColor(0xfdcb6e)
      .setTitle("🔑 Get Free Key")
      .setDescription("Click the button below to get your free key:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🔑 Get Free Key").setStyle(ButtonStyle.Link).setURL("https://www.wolfmod.xyz/get-free-key")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !getkey [USERNAME] ──────────────────────────────────────────────────────
  if (cmd === "getkey") {
    const username = args[1]?.replace(/^@/, "") || userName;

    const loadingMsg = await message.reply("⏳ Generating key for **@" + username + "**...");

    try {
      const res = await fetch("https://wolfmod.xyz/api/genkey", {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "application/json",
          "x-wolf-api-key": "WOLF_SUPER_SECRET_123456"
        },
        body: JSON.stringify({ username })
      });

      const rawText = await res.text();
      log("genkey status=" + res.status + " body=" + rawText.substring(0, 300));

      const isHtml = rawText.trimStart().toLowerCase().startsWith("<!doctype") ||
                     rawText.trimStart().toLowerCase().startsWith("<html");

      if (!res.ok || isHtml) {
        return loadingMsg.edit("❌ **Failed to generate key.**\n" + (isHtml ? "Server returned an unexpected response." : "Error " + res.status));
      }

      let data;
      try { data = JSON.parse(rawText); } catch {
        return loadingMsg.edit("❌ **Unexpected response from server.**");
      }

      if (!data.success) {
        return loadingMsg.edit("❌ **Failed to generate key.**\n" + (data.message || "Unknown error."));
      }

      const link4m  = data.shortUrls?.link4m  || data.short_url || data.shortUrl || data.url || null;
      const workink = data.shortUrls?.workink || null;
      const msgText = data.message || "Complete the link to activate your key.";

      const embed = new EmbedBuilder()
        .setColor(0x00b894)
        .setTitle("✅ Key Generated!")
        .addFields(
          { name: "👤 Username", value: "@" + username, inline: true },
          { name: "⚠️ Note", value: msgText, inline: false }
        )
        .setDescription("👇 **Choose a link to activate:**");

      const row = new ActionRowBuilder();
      if (link4m)  row.addComponents(new ButtonBuilder().setLabel("🔗 Activate via Link4m").setStyle(ButtonStyle.Link).setURL(link4m));
      if (workink) row.addComponents(new ButtonBuilder().setLabel("🔗 Activate via Workink").setStyle(ButtonStyle.Link).setURL(workink));

      await loadingMsg.edit({ content: "", embeds: [embed], components: row.components.length > 0 ? [row] : [] });
      log("!getkey success for @" + username);
    } catch (err) {
      log("!getkey error: " + err.message);
      await loadingMsg.edit("❌ **Network error.**\nCould not reach key server.\n`" + err.message + "`");
    }
    return;
  }

  // ── !tutorial ───────────────────────────────────────────────────────────────
  if (cmd === "tutorial") {
    const embed = new EmbedBuilder()
      .setColor(0x74b9ff)
      .setTitle("📖 How To Use Guide")
      .setDescription("Click the button below to view the tutorial:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📖 View Tutorial").setStyle(ButtonStyle.Link).setURL("https://t.me/c/2770498924/10617")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !paymentmethod ──────────────────────────────────────────────────────────
  if (cmd === "paymentmethod") {
    const embed = new EmbedBuilder()
      .setColor(0x55efc4)
      .setTitle("💳 Payment Methods")
      .addFields(
        { name: "💵 PayPal", value: "contact.wolfmod@gmail.com", inline: false },
        { name: "🔶 Binance ID", value: "1158594960", inline: false },
        { name: "🛒 SociaBuzz", value: "[LINK](https://sociabuzz.com/ldh/tribe)", inline: false },
        { name: "🏦 VCB", value: "9382382864 | LE DONG HA", inline: false },
      )
      .setDescription("☑️ Send via **FRIENDS AND FAMILY OPTION**!\n\nDM ⚡ @wolfmodyt to confirm.");
    return message.reply({ embeds: [embed] });
  }

  // ── !gameguardian ───────────────────────────────────────────────────────────
  if (cmd === "gameguardian") {
    const embed = new EmbedBuilder()
      .setColor(0xe17055)
      .setTitle("🛡 GameGuardian by WolfMod")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🛡 Download GameGuardian").setStyle(ButtonStyle.Link).setURL("https://www.mediafire.com/file/gb22k0yerlunq19/[GG_V101.1]+BY+WOLFMOD.zip/file")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !vphonegaga ─────────────────────────────────────────────────────────────
  if (cmd === "vphonegaga") {
    const embed = new EmbedBuilder()
      .setColor(0xa29bfe)
      .setTitle("📱 VPhoneGaga Fix Rom")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📱 Download VPhoneGaga").setStyle(ButtonStyle.Link).setURL("https://www.mediafire.com/file/vgnkp09ib3nij0f/Vphonegaga_Fix_Rom.apk")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !bluestack ──────────────────────────────────────────────────────────────
  if (cmd === "bluestack") {
    const embed = new EmbedBuilder()
      .setColor(0x0984e3)
      .setTitle("💻 BlueStack")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("💻 Download BlueStack").setStyle(ButtonStyle.Link).setURL("https://mega.nz/file/Wd0yQD6a#Df68i0BypTiQ7Spgk5jXx4j_ly-tm0dGnvMY_weVms8")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ── !referral ───────────────────────────────────────────────────────────────
  if (cmd === "referral") {
    const user = getUser(userId, userName);
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points }))
      .sort((a, b) => b.points - a.points);
    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = rank > 0 ? "#" + rank + " / " + allUsers.length : "N/A";

    const referralLink = "https://discord.com/channels/" + message.guild.id + "/" + channelId + " — ask @" + userName + " for an invite!";

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("🔗 Referral Program")
      .addFields(
        { name: "👤 User", value: "@" + userName, inline: true },
        { name: "⭐ Points", value: String(user.points), inline: true },
        { name: "🏆 Rank", value: rankText, inline: true },
      )
      .setDescription(
        "**How it works:**\n" +
        "1️⃣ Share your referral code below\n" +
        "2️⃣ New member joins this server & mentions your code\n" +
        "3️⃣ Run `!confirmref @YourName` — they get you **+1 point**!\n\n" +
        "🔗 **Your referral code:** `ref_" + userId + "`\n\n" +
        "💡 Tell new members to type `!joinref ref_" + userId + "` when they arrive!"
      )
      .setFooter({ text: "Use !leaderboard to see top referrers" });
    return message.reply({ embeds: [embed] });
  }

  // ── !joinref <code> ─────────────────────────────────────────────────────────
  if (cmd === "joinref") {
    const code = args[1];
    if (!code || !code.startsWith("ref_")) {
      return message.reply("❌ **Invalid code!**\nUsage: `!joinref ref_USERID`\nExample: `!joinref ref_123456789`");
    }

    const referrerId = code.replace("ref_", "");
    if (referrerId === userId) {
      return message.reply("😅 **You cannot refer yourself!**");
    }

    const joinKey = userId + "_" + message.guild.id;
    if (db.joined[joinKey]) {
      return message.reply("ℹ️ **You have already been counted for a referral in this server.**");
    }

    if (!db.points[referrerId]) {
      return message.reply("❌ **Referral code not found.** The user may not have used this bot yet.");
    }

    const referrerData = db.points[referrerId];
    const newPoints = addPoint(referrerId, referrerData.name);
    db.joined[joinKey] = true;
    saveData(db);

    getUser(userId, userName);

    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("🎉 Referral Successful!")
      .setDescription(
        "**@" + userName + "** joined via referral!\n\n" +
        "⭐ **" + referrerData.name + "** earned **+1 point**! (Total: " + newPoints + ")"
      );

    message.reply({ embeds: [embed] });

    // Notify referrer
    try {
      const referrerUser = await client.users.fetch(referrerId);
      await referrerUser.send(
        "🎉 **+1 referral point!**\n\n**@" + userName + "** joined using your code.\n⭐ Your total points: **" + newPoints + "**"
      );
    } catch {}

    log("Referral awarded: referrer=" + referrerId + " newMember=" + userId + " points=" + newPoints);
    return;
  }

  // ── !mystats ────────────────────────────────────────────────────────────────
  if (cmd === "mystats") {
    const user = getUser(userId, userName);
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = user.points > 0 && rank > 0 ? "#" + rank + " / " + allUsers.length : "Not ranked yet";

    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("📊 Your Stats")
      .addFields(
        { name: "👤 User", value: "@" + userName, inline: true },
        { name: "⭐ Points", value: String(user.points), inline: true },
        { name: "🏆 Rank", value: rankText, inline: true },
      )
      .setFooter({ text: "Use !referral to get your invite code!" });
    return message.reply({ embeds: [embed] });
  }

  // ── !leaderboard ────────────────────────────────────────────────────────────
  if (cmd === "leaderboard") {
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points, name: u.name }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    if (allUsers.length === 0) {
      return message.reply("📊 **Leaderboard**\n\n🚫 No referral points yet!\n\nUse `!referral` to get your code and start inviting friends.");
    }

    const medals = ["🥇", "🥈", "🥉"];
    const top10 = allUsers.slice(0, 10);
    let desc = "";
    top10.forEach((u, i) => {
      const medal = medals[i] || "🔹";
      const isYou = u.id === userId ? " ← you" : "";
      desc += medal + " **" + (i + 1) + ".** " + u.name + " — **" + u.points + " pts**" + isYou + "\n";
    });

    const requesterRank = allUsers.findIndex(u => u.id === userId);
    if (requesterRank >= 10) {
      const ru = allUsers[requesterRank];
      desc += "\n・・・\n🔸 **" + (requesterRank + 1) + ".** " + ru.name + " — **" + ru.points + " pts** ← you";
    }

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("🏆 Referral Leaderboard")
      .setDescription(desc)
      .setFooter({ text: "Use !referral to get your invite code!" });
    return message.reply({ embeds: [embed] });
  }
});

// ─── Error handling ───────────────────────────────────────────────────────────
client.on("error", (err) => {
  log("❌ Discord client error: " + err.message);
});

process.on("unhandledRejection", (err) => {
  log("❌ Unhandled rejection: " + (err?.message || err));
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(token).then(() => {
  log("🔌 Discord bot connecting...");
}).catch((err) => {
  log("❌ Failed to login: " + err.message);
  process.exit(1);
});
