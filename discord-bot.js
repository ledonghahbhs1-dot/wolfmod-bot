const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, SlashCommandBuilder
} = require("discord.js");
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

const token = process.env.DISCORD_TOKEN;
const WOLF_API_KEY = process.env.WOLF_API_KEY || "";
if (!token) throw new Error("DISCORD_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

// ─── License Key Generator ───────────────────────────────────────────────────
const crypto = require("crypto");
function generateLicenseKey(username) {
  const safeUsername = (username || "USER").replace(/[|\s]/g, "");
  const randomPart = crypto.randomBytes(8).toString("hex").toUpperCase();
  return safeUsername ? `${safeUsername}|${randomPart}` : randomPart;
}

// ─── Whitelist channel IDs (bot chỉ hoạt động trong các kênh này) ─────────────
const ALLOWED_CHANNEL_IDS = (process.env.ALLOWED_CHANNEL_IDS || "1503691818649518091, 1505863692825264218").split(",").map(s => s.trim());

// ─── Anti-spam: cooldown per user (giây) ─────────────────────────────────────
const COOLDOWN_SECONDS = 5;
const cooldowns = new Map();

// ─── Data persistence ─────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "discord-data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) { log("data load error: " + e.message); }
  return { points: {}, joined: {} };
}

function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { log("data save error: " + e.message); }
}

const db = loadData();

function getUser(userId, name) {
  if (!db.points[userId]) {
    db.points[userId] = { points: 0, name: name || "Unknown" };
  } else if (name) {
    db.points[userId].name = name;
  }
  saveData(db);
  return db.points[userId];
}

function addPoint(referrerId, referrerName) {
  const user = getUser(referrerId, referrerName);
  user.points += 1;
  saveData(db);
  return user.points;
}

// ─── Slash command definitions ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("View all available bot commands"),
  new SlashCommandBuilder().setName("scriptfreedragoncity").setDescription("Get the free Dragon City script"),
  new SlashCommandBuilder().setName("scriptvipdragoncity").setDescription("Get the VIP Dragon City script"),
  new SlashCommandBuilder().setName("getfreekey").setDescription("Get a free activation key"),
  new SlashCommandBuilder()
    .setName("getkey")
    .setDescription("Generate an activation key for a username")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Username to generate key for").setRequired(false)
    ),
  new SlashCommandBuilder().setName("tutorial").setDescription("How to use guide"),
  new SlashCommandBuilder().setName("buyvip").setDescription("Buy a VIP Key"),
  new SlashCommandBuilder().setName("gameguardian").setDescription("Download GameGuardian by WolfMod"),
  new SlashCommandBuilder().setName("vphonegaga").setDescription("Download VPhoneGaga Fix Rom"),
  new SlashCommandBuilder().setName("bluestack").setDescription("Download BlueStack"),
  new SlashCommandBuilder().setName("referral").setDescription("Get your referral link and stats"),
  new SlashCommandBuilder()
    .setName("joinref")
    .setDescription("Confirm you were referred to this server")
    .addStringOption(opt =>
      opt.setName("code").setDescription("Referral code (ref_USERID)").setRequired(true)
    ),
  new SlashCommandBuilder().setName("mystats").setDescription("View your referral stats"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("View the referral leaderboard"),
].map(cmd => cmd.toJSON());

// ─── Register slash commands globally ────────────────────────────────────────
async function registerCommands(clientId) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    log("Registering " + commands.length + " slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    log("✅ Slash commands registered successfully!");
  } catch (err) {
    log("❌ Failed to register slash commands: " + err.message);
  }
}

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember],
});

client.once("ready", async (c) => {
  log("✅ Discord Bot logged in as " + c.user.tag);
  await registerCommands(c.user.id);
});

// ─── Slash command handler ────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, guild } = interaction;
  const userId = user.id;
  const userName = user.username;

  // ─── Whitelist channel check (đã cho phép hoạt động ở mọi kênh và DM) ───────
  /*
  if (!ALLOWED_CHANNEL_IDS.includes(interaction.channelId)) {
    return interaction.reply({
      content: "🚫 **Bot không hoạt động trong kênh này.**\nVui lòng dùng bot trong kênh được chỉ định.",
      ephemeral: true
    });
  }
  */

  // ─── Anti-spam cooldown check ─────────────────────────────────────────────
  const now = Date.now();
  const lastUsed = cooldowns.get(userId) || 0;
  const remaining = COOLDOWN_SECONDS * 1000 - (now - lastUsed);
  if (remaining > 0) {
    return interaction.reply({
      content: `⏱ **Chậm thôi!** Vui lòng chờ **${Math.ceil(remaining / 1000)} giây** trước khi dùng lệnh tiếp theo.`,
      ephemeral: true
    });
  }
  cooldowns.set(userId, now);

  // ─── Referral System Restriction ─────────────────────────────────────────
  const referralCommands = ["referral", "joinref", "mystats", "leaderboard"];
  if (referralCommands.includes(commandName) && interaction.guildId !== "1503688021877456906") {
    return interaction.reply({
      content: "🚫 **Lệnh này chỉ khả dụng trong máy chủ chỉ định của WolfMod.**",
      ephemeral: true
    });
  }

  // /help ─────────────────────────────────────────────────────────────────────
  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("👋 Welcome to WolfMod Bot!")
      .setDescription("🐉 **WolfMod Dragon City Bot**\n\nAvailable commands:")
      .addFields(
        { name: "📜 /scriptfreedragoncity", value: "Get the free Dragon City script", inline: false },
        { name: "💎 /scriptvipdragoncity", value: "Get the VIP Dragon City script", inline: false },
        { name: "🔑 /getfreekey", value: "Get a free activation key", inline: false },
        { name: "🗝 /getkey [username]", value: "Generate a key for a username", inline: false },
        { name: "📖 /tutorial", value: "How to use guide", inline: false },
    { name: "💳 /buyvip", value: "Buy a VIP Key", inline: false },
        { name: "🛡 /gameguardian", value: "Download GameGuardian", inline: false },
        { name: "📱 /vphonegaga", value: "Download VPhoneGaga", inline: false },
        { name: "💻 /bluestack", value: "Download BlueStack", inline: false },
        { name: "🔗 /referral", value: "Get your referral code & stats", inline: false },
        { name: "📊 /mystats", value: "View your referral stats", inline: false },
        { name: "🏆 /leaderboard", value: "View the referral leaderboard", inline: false },
      )
      .setFooter({ text: "⚡ @wolfmodyt" });
    return interaction.reply({ embeds: [embed] });
  }

  // /scriptfreedragoncity ─────────────────────────────────────────────────────
  if (commandName === "scriptfreedragoncity") {
    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("📜 Free Dragon City Script")
      .setDescription("Click the button below to get the free script:");
    const channelUrl = "https://discord.com/channels/" + guild.id + "/1503691698918653962";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📜 Get Free Script").setStyle(ButtonStyle.Link).setURL(channelUrl)
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /scriptvipdragoncity ──────────────────────────────────────────────────────
  if (commandName === "scriptvipdragoncity") {
    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("💎 VIP Dragon City Script")
      .setDescription("Click the button below to get the VIP script:");
    const channelUrl = "https://discord.com/channels/" + guild.id + "/1503691650306936852";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("💎 Get VIP Script").setStyle(ButtonStyle.Link).setURL(channelUrl)
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /getfreekey ───────────────────────────────────────────────────────────────
  if (commandName === "getfreekey") {
    const embed = new EmbedBuilder()
      .setColor(0xfdcb6e)
      .setTitle("🔑 Get Free Key")
      .setDescription("Click the button below to get your free key:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🔑 Get Free Key").setStyle(ButtonStyle.Link).setURL("https://www.wolfmod.xyz/get-free-key")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /getkey ───────────────────────────────────────────────────────────────────
  if (commandName === "getkey") {
    const inputUser = interaction.options.getString("username");
    const username = inputUser || interaction.member?.displayName || interaction.user.globalName || interaction.user.username || "User";
    const licenseKey = generateLicenseKey(username);

    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("✅ Key Generated Successfully!")
      .addFields(
        { name: "👤 Username", value: username, inline: true },
        { name: "🔑 License Key", value: "`" + licenseKey + "`", inline: false }
      )
      .setFooter({ text: "🗑️ This message will be deleted in 60 seconds." });

    await interaction.reply({ embeds: [embed] });
    log("/getkey success for " + username + ": " + licenseKey);

    setTimeout(async () => {
      try { await interaction.deleteReply(); } catch {}
    }, 60000);
    return;
  }

  // /tutorial ─────────────────────────────────────────────────────────────────
  if (commandName === "tutorial") {
    const embed = new EmbedBuilder()
      .setColor(0x74b9ff)
      .setTitle("📖 How To Use Guide")
      .setDescription("Click the button below to view the tutorial:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📖 View Tutorial").setStyle(ButtonStyle.Link).setURL("https://t.me/c/2770498924/10617")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /buyvip ───────────────────────────────────────────────────────────────────
  if (commandName === "buyvip") {
    const embed = new EmbedBuilder()
      .setColor(0x55efc4)
      .setTitle("💳 Buy VIP Key")
      .setDescription("Click the button below to purchase a VIP Key:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("💳 Buy VIP Key").setStyle(ButtonStyle.Link).setURL("https://www.wolfmod.xyz/buy-vip-key")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /gameguardian ─────────────────────────────────────────────────────────────
  if (commandName === "gameguardian") {
    const embed = new EmbedBuilder()
      .setColor(0xe17055)
      .setTitle("🛡 GameGuardian by WolfMod")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🛡 Download GameGuardian").setStyle(ButtonStyle.Link).setURL("https://www.mediafire.com/file/gb22k0yerlunq19/[GG_V101.1]+BY+WOLFMOD.zip/file")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /vphonegaga ───────────────────────────────────────────────────────────────
  if (commandName === "vphonegaga") {
    const embed = new EmbedBuilder()
      .setColor(0xa29bfe)
      .setTitle("📱 VPhoneGaga Fix Rom")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📱 Download VPhoneGaga").setStyle(ButtonStyle.Link).setURL("https://www.mediafire.com/file/vgnkp09ib3nij0f/Vphonegaga_Fix_Rom.apk")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /bluestack ────────────────────────────────────────────────────────────────
  if (commandName === "bluestack") {
    const embed = new EmbedBuilder()
      .setColor(0x0984e3)
      .setTitle("💻 BlueStack")
      .setDescription("Click the button below to download:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("💻 Download BlueStack").setStyle(ButtonStyle.Link).setURL("https://mega.nz/file/Wd0yQD6a#Df68i0BypTiQ7Spgk5jXx4j_ly-tm0dGnvMY_weVms8")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /referral ─────────────────────────────────────────────────────────────────
  if (commandName === "referral") {
    const user = getUser(userId, userName);
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);
    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = rank > 0 ? "#" + rank + " / " + allUsers.length : "Chưa có hạng";

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
        "2️⃣ A new member joins the server & uses `/joinref` with your code\n" +
        "3️⃣ You earn **+1 point**!\n\n" +
        "🔗 **Your referral code:** `ref_" + userId + "`\n\n" +
        "💡 Tell new members to type `/joinref ref_" + userId + "`"
      )
      .setFooter({ text: "Use /leaderboard to see the top referrers" });
    return interaction.reply({ embeds: [embed] });
  }

  // /joinref ──────────────────────────────────────────────────────────────────
  if (commandName === "joinref") {
    const code = interaction.options.getString("code");
    if (!code.startsWith("ref_")) {
      return interaction.reply({ content: "❌ **Invalid code!**\nExample: `ref_123456789`", ephemeral: true });
    }

    const referrerId = code.replace("ref_", "");
    if (referrerId === userId) {
      return interaction.reply({ content: "😅 **You cannot refer yourself!**", ephemeral: true });
    }

    const joinKey = userId + "_" + guild.id;
    if (db.joined[joinKey]) {
      return interaction.reply({ content: "ℹ️ **You have already been counted for a referral in this server.**", ephemeral: true });
    }

    if (!db.points[referrerId]) {
      return interaction.reply({ content: "❌ **Referral code not found.** The user may not have used this bot yet.", ephemeral: true });
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

    await interaction.reply({ embeds: [embed] });

    try {
      const referrerUser = await client.users.fetch(referrerId);
      await referrerUser.send(
        "🎉 **+1 referral point!**\n\n**@" + userName + "** joined the server using your code.\n⭐ Your total points: **" + newPoints + "**"
      );
    } catch {}

    log("Referral awarded: referrer=" + referrerId + " newMember=" + userId + " points=" + newPoints);
    return;
  }

  // /mystats ──────────────────────────────────────────────────────────────────
  if (commandName === "mystats") {
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
        { name: "⭐ Referral Points", value: String(user.points), inline: true },
        { name: "🏆 Rank", value: rankText, inline: true },
      )
      .setFooter({ text: "Use /referral to get your invite code!" });
    return interaction.reply({ embeds: [embed] });
  }

  // /leaderboard ──────────────────────────────────────────────────────────────
  if (commandName === "leaderboard") {
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points, name: u.name }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    if (allUsers.length === 0) {
      return interaction.reply("📊 **Leaderboard**\n\n🚫 No referral points yet!\n\nUse `/referral` to get your code and start inviting friends.");
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
      .setFooter({ text: "Use /referral to get your invite code!" });
    return interaction.reply({ embeds: [embed] });
  }
});

// ─── Error handling ───────────────────────────────────────────────────────────
client.on("error", (err) => log("❌ Discord client error: " + err.message));
process.on("unhandledRejection", (err) => log("❌ Unhandled rejection: " + (err?.message || err)));

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(token).catch((err) => {
  log("❌ Failed to login: " + err.message);
  process.exit(1);
});
