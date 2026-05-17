const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, SlashCommandBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

const log = (msg) => console.log("[" + new Date().toISOString() + "] " + msg);

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
  if (!db.points[userId]) { db.points[userId] = { points: 0, name: name || "Unknown" }; saveData(db); }
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
  new SlashCommandBuilder().setName("help").setDescription("Xem toàn bộ lệnh của bot"),
  new SlashCommandBuilder().setName("scriptfreedragoncity").setDescription("Nhận script Dragon City miễn phí"),
  new SlashCommandBuilder().setName("scriptvipdragoncity").setDescription("Nhận script VIP Dragon City"),
  new SlashCommandBuilder().setName("getfreekey").setDescription("Nhận key kích hoạt miễn phí"),
  new SlashCommandBuilder()
    .setName("getkey")
    .setDescription("Tạo key kích hoạt theo username")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Username cần tạo key").setRequired(false)
    ),
  new SlashCommandBuilder().setName("tutorial").setDescription("Hướng dẫn sử dụng"),
  new SlashCommandBuilder().setName("paymentmethod").setDescription("Xem các phương thức thanh toán"),
  new SlashCommandBuilder().setName("gameguardian").setDescription("Tải GameGuardian by WolfMod"),
  new SlashCommandBuilder().setName("vphonegaga").setDescription("Tải VPhoneGaga Fix Rom"),
  new SlashCommandBuilder().setName("bluestack").setDescription("Tải BlueStack"),
  new SlashCommandBuilder().setName("referral").setDescription("Xem link referral và điểm của bạn"),
  new SlashCommandBuilder()
    .setName("joinref")
    .setDescription("Xác nhận bạn được giới thiệu vào server")
    .addStringOption(opt =>
      opt.setName("code").setDescription("Mã referral (ref_USERID)").setRequired(true)
    ),
  new SlashCommandBuilder().setName("mystats").setDescription("Xem thống kê referral của bạn"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Xem bảng xếp hạng referral"),
].map(cmd => cmd.toJSON());

// ─── Register slash commands globally ────────────────────────────────────────
async function registerCommands(clientId) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    log("Đang đăng ký " + commands.length + " slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    log("✅ Đăng ký slash commands thành công!");
  } catch (err) {
    log("❌ Lỗi đăng ký slash commands: " + err.message);
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

client.once("clientReady", async (c) => {
  log("✅ Discord Bot logged in as " + c.user.tag);
  await registerCommands(c.user.id);
});

// ─── Slash command handler ────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, guild } = interaction;
  const userId = user.id;
  const userName = user.username;

  if (!guild) {
    return interaction.reply({ content: "🚫 **Bot chỉ hoạt động trong server.**", ephemeral: true });
  }

  // /help ─────────────────────────────────────────────────────────────────────
  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("👋 Welcome to WolfMod Bot!")
      .setDescription("🐉 **WolfMod Dragon City Bot**\n\nDanh sách lệnh có sẵn:")
      .addFields(
        { name: "📜 /scriptfreedragoncity", value: "Nhận script Dragon City miễn phí", inline: false },
        { name: "💎 /scriptvipdragoncity", value: "Nhận script VIP Dragon City", inline: false },
        { name: "🔑 /getfreekey", value: "Nhận key kích hoạt miễn phí", inline: false },
        { name: "🗝 /getkey [username]", value: "Tạo key theo username", inline: false },
        { name: "📖 /tutorial", value: "Hướng dẫn sử dụng", inline: false },
        { name: "💳 /paymentmethod", value: "Xem phương thức thanh toán", inline: false },
        { name: "🛡 /gameguardian", value: "Tải GameGuardian", inline: false },
        { name: "📱 /vphonegaga", value: "Tải VPhoneGaga", inline: false },
        { name: "💻 /bluestack", value: "Tải BlueStack", inline: false },
        { name: "🔗 /referral", value: "Xem link & điểm referral", inline: false },
        { name: "📊 /mystats", value: "Xem thống kê cá nhân", inline: false },
        { name: "🏆 /leaderboard", value: "Bảng xếp hạng referral", inline: false },
      )
      .setFooter({ text: "⚡ @wolfmodyt" });
    return interaction.reply({ embeds: [embed] });
  }

  // /scriptfreedragoncity ─────────────────────────────────────────────────────
  if (commandName === "scriptfreedragoncity") {
    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("📜 Free Dragon City Script")
      .setDescription("Nhấn nút bên dưới để nhận script miễn phí:");
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
      .setDescription("Nhấn nút bên dưới để nhận script VIP:");
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
      .setDescription("Nhấn nút bên dưới để nhận key miễn phí:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🔑 Get Free Key").setStyle(ButtonStyle.Link).setURL("https://www.wolfmod.xyz/get-free-key")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /getkey ───────────────────────────────────────────────────────────────────
  if (commandName === "getkey") {
    const username = interaction.options.getString("username") || userName;

    await interaction.deferReply();

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
        return interaction.editReply("❌ **Không thể tạo key.**\n" + (isHtml ? "Server trả về phản hồi không hợp lệ." : "Lỗi " + res.status));
      }

      let data;
      try { data = JSON.parse(rawText); } catch {
        return interaction.editReply("❌ **Phản hồi không hợp lệ từ server.**");
      }

      if (!data.success) {
        return interaction.editReply("❌ **Không thể tạo key.**\n" + (data.message || "Unknown error."));
      }

      const link4m  = data.shortUrls?.link4m || data.short_url || data.shortUrl || data.url || null;
      const workink = data.shortUrls?.workink || null;
      const msgText = data.message || "Complete the link to activate your key.";

      const embed = new EmbedBuilder()
        .setColor(0x00b894)
        .setTitle("✅ Key đã được tạo!")
        .addFields(
          { name: "👤 Username", value: "@" + username, inline: true },
          { name: "⚠️ Lưu ý", value: msgText, inline: false }
        )
        .setDescription("👇 **Chọn link để kích hoạt:**");

      const row = new ActionRowBuilder();
      if (link4m)  row.addComponents(new ButtonBuilder().setLabel("🔗 Activate via Link4m").setStyle(ButtonStyle.Link).setURL(link4m));
      if (workink) row.addComponents(new ButtonBuilder().setLabel("🔗 Activate via Workink").setStyle(ButtonStyle.Link).setURL(workink));

      await interaction.editReply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
      log("/getkey success for @" + username);
    } catch (err) {
      log("/getkey error: " + err.message);
      await interaction.editReply("❌ **Lỗi mạng.**\nKhông thể kết nối server.\n`" + err.message + "`");
    }
    return;
  }

  // /tutorial ─────────────────────────────────────────────────────────────────
  if (commandName === "tutorial") {
    const embed = new EmbedBuilder()
      .setColor(0x74b9ff)
      .setTitle("📖 Hướng Dẫn Sử Dụng")
      .setDescription("Nhấn nút bên dưới để xem hướng dẫn:");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📖 View Tutorial").setStyle(ButtonStyle.Link).setURL("https://t.me/c/2770498924/10617")
    );
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // /paymentmethod ────────────────────────────────────────────────────────────
  if (commandName === "paymentmethod") {
    const embed = new EmbedBuilder()
      .setColor(0x55efc4)
      .setTitle("💳 Phương Thức Thanh Toán")
      .addFields(
        { name: "💵 PayPal", value: "contact.wolfmod@gmail.com", inline: false },
        { name: "🔶 Binance ID", value: "1158594960", inline: false },
        { name: "🛒 SociaBuzz", value: "[LINK](https://sociabuzz.com/ldh/tribe)", inline: false },
        { name: "🏦 VCB", value: "9382382864 | LE DONG HA", inline: false },
      )
      .setDescription("☑️ Gửi qua **FRIENDS AND FAMILY OPTION**!\n\nDM ⚡ @wolfmodyt để xác nhận.");
    return interaction.reply({ embeds: [embed] });
  }

  // /gameguardian ─────────────────────────────────────────────────────────────
  if (commandName === "gameguardian") {
    const embed = new EmbedBuilder()
      .setColor(0xe17055)
      .setTitle("🛡 GameGuardian by WolfMod")
      .setDescription("Nhấn nút bên dưới để tải:");
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
      .setDescription("Nhấn nút bên dưới để tải:");
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
      .setDescription("Nhấn nút bên dưới để tải:");
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
      .sort((a, b) => b.points - a.points);
    const rank = allUsers.findIndex(u => u.id === userId) + 1;
    const rankText = rank > 0 ? "#" + rank + " / " + allUsers.length : "N/A";

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("🔗 Chương Trình Referral")
      .addFields(
        { name: "👤 User", value: "@" + userName, inline: true },
        { name: "⭐ Điểm", value: String(user.points), inline: true },
        { name: "🏆 Xếp hạng", value: rankText, inline: true },
      )
      .setDescription(
        "**Cách hoạt động:**\n" +
        "1️⃣ Chia sẻ mã referral của bạn\n" +
        "2️⃣ Thành viên mới vào server & dùng `/joinref` với mã của bạn\n" +
        "3️⃣ Bạn nhận được **+1 điểm**!\n\n" +
        "🔗 **Mã referral của bạn:** `ref_" + userId + "`\n\n" +
        "💡 Bảo thành viên mới gõ `/joinref ref_" + userId + "`"
      )
      .setFooter({ text: "Dùng /leaderboard để xem bảng xếp hạng" });
    return interaction.reply({ embeds: [embed] });
  }

  // /joinref ──────────────────────────────────────────────────────────────────
  if (commandName === "joinref") {
    const code = interaction.options.getString("code");
    if (!code.startsWith("ref_")) {
      return interaction.reply({ content: "❌ **Mã không hợp lệ!**\nVí dụ: `ref_123456789`", ephemeral: true });
    }

    const referrerId = code.replace("ref_", "");
    if (referrerId === userId) {
      return interaction.reply({ content: "😅 **Bạn không thể tự refer chính mình!**", ephemeral: true });
    }

    const joinKey = userId + "_" + guild.id;
    if (db.joined[joinKey]) {
      return interaction.reply({ content: "ℹ️ **Bạn đã được tính referral trong server này rồi.**", ephemeral: true });
    }

    if (!db.points[referrerId]) {
      return interaction.reply({ content: "❌ **Mã referral không tìm thấy.** Người dùng có thể chưa dùng bot này.", ephemeral: true });
    }

    const referrerData = db.points[referrerId];
    const newPoints = addPoint(referrerId, referrerData.name);
    db.joined[joinKey] = true;
    saveData(db);

    getUser(userId, userName);

    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("🎉 Referral Thành Công!")
      .setDescription(
        "**@" + userName + "** đã tham gia qua referral!\n\n" +
        "⭐ **" + referrerData.name + "** nhận được **+1 điểm**! (Tổng: " + newPoints + ")"
      );

    await interaction.reply({ embeds: [embed] });

    try {
      const referrerUser = await client.users.fetch(referrerId);
      await referrerUser.send(
        "🎉 **+1 điểm referral!**\n\n**@" + userName + "** đã tham gia server bằng mã của bạn.\n⭐ Tổng điểm: **" + newPoints + "**"
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
    const rankText = user.points > 0 && rank > 0 ? "#" + rank + " / " + allUsers.length : "Chưa có hạng";

    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("📊 Thống Kê Của Bạn")
      .addFields(
        { name: "👤 User", value: "@" + userName, inline: true },
        { name: "⭐ Điểm referral", value: String(user.points), inline: true },
        { name: "🏆 Xếp hạng", value: rankText, inline: true },
      )
      .setFooter({ text: "Dùng /referral để lấy mã mời!" });
    return interaction.reply({ embeds: [embed] });
  }

  // /leaderboard ──────────────────────────────────────────────────────────────
  if (commandName === "leaderboard") {
    const allUsers = Object.entries(db.points)
      .map(([id, u]) => ({ id, points: u.points, name: u.name }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points);

    if (allUsers.length === 0) {
      return interaction.reply("📊 **Bảng Xếp Hạng**\n\n🚫 Chưa có điểm referral nào!\n\nDùng `/referral` để lấy mã mời.");
    }

    const medals = ["🥇", "🥈", "🥉"];
    const top10 = allUsers.slice(0, 10);
    let desc = "";
    top10.forEach((u, i) => {
      const medal = medals[i] || "🔹";
      const isYou = u.id === userId ? " ← bạn" : "";
      desc += medal + " **" + (i + 1) + ".** " + u.name + " — **" + u.points + " điểm**" + isYou + "\n";
    });

    const requesterRank = allUsers.findIndex(u => u.id === userId);
    if (requesterRank >= 10) {
      const ru = allUsers[requesterRank];
      desc += "\n・・・\n🔸 **" + (requesterRank + 1) + ".** " + ru.name + " — **" + ru.points + " điểm** ← bạn";
    }

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("🏆 Bảng Xếp Hạng Referral")
      .setDescription(desc)
      .setFooter({ text: "Dùng /referral để lấy mã mời!" });
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
