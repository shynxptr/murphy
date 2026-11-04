const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  deleteFeed,
  getGuildFeed,
  getGuildFeeds,
  upsertFeed
} = require("../../services/socialAlertStore");
const {
  ensureDiscordBridgeWebhook,
  fetchTikTokLatestPosts,
  fetchTikTokLiveStatus,
  normalizeUsername,
  sendTestSocialAlert
} = require("./socialAlertSystem");

const slashData = new SlashCommandBuilder()
  .setName("sosmed")
  .setDescription("Kelola notifikasi otomatis TikTok & Instagram Murphy Official")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add-tiktok")
      .setDescription("Hubungkan akun TikTok untuk notifikasi video baru & LIVE otomatis")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Username TikTok (contoh: murphyoffcial atau @murphyoffcial)")
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel Discord tujuan pengiriman notifikasi")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("Role yang akan di-mention saat ada post/LIVE baru (opsional)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("nama_tampilan")
          .setDescription("Nama tampilan akun di embed (default: Murphy Official)")
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("pantau_live")
          .setDescription("Aktifkan notifikasi saat akun sedang LIVE di TikTok? (default: Ya)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("pesan_custom")
          .setDescription("Pesan tambahan pada pengumuman (gunakan {role}, {author}, {url})")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("set-instagram")
      .setDescription("Siapkan koneksi Instagram (via Make.com / IFTTT) dengan Embed & Tombol Bot")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Username Instagram (contoh: murphy.official)")
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel Discord tujuan pengiriman notifikasi Instagram")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("Role yang akan di-mention saat ada post/Reels baru (opsional)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("nama_tampilan")
          .setDescription("Nama tampilan akun di embed (default: Murphy Official)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("pesan_custom")
          .setDescription("Pesan tambahan pada pengumuman (gunakan {role}, {author}, {url})")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Lihat daftar akun TikTok & Instagram yang terhubung di server ini")
  )
  .addSubcommand((sub) =>
    sub
      .setName("test")
      .setDescription("Kirim pesan simulasi/tes notifikasi sosmed ke channel tujuan")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("ID koneksi sosmed (lihat melalui /sosmed list)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("tipe")
          .setDescription("Jenis notifikasi yang ingin dites")
          .addChoices(
            { name: "Postingan / Video Baru", value: "post" },
            { name: "TikTok LIVE Stream", value: "live" }
          )
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Hapus koneksi notifikasi akun TikTok / Instagram")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("ID koneksi sosmed (lihat melalui /sosmed list)")
          .setRequired(true)
      )
  );

async function handleAddTikTok(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawUsername = interaction.options.getString("username", true);
  const username = normalizeUsername(rawUsername);
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role");
  const displayName = interaction.options.getString("nama_tampilan") || "Murphy Official";
  const watchLive = interaction.options.getBoolean("pantau_live") ?? true;
  const customMessage = interaction.options.getString("pesan_custom") || "";

  if (!username) {
    await interaction.editReply({
      content: "❌ Username TikTok tidak valid."
    });
    return;
  }

  let initialVideo = null;
  let initialAuthor = null;
  let liveInfo = null;

  try {
    const postResult = await fetchTikTokLatestPosts(username);
    if (postResult.ok && postResult.latestVideo) {
      initialVideo = postResult.latestVideo;
      initialAuthor = postResult.author || null;
    }
  } catch {
    // Tetap simpan meskipun gagal fetch awal
  }

  if (watchLive) {
    try {
      liveInfo = await fetchTikTokLiveStatus(username);
    } catch {
      // Abaikan error pengecekan awal live
    }
  }

  const saved = upsertFeed(interaction.guildId, {
    platform: "tiktok",
    username,
    displayName: initialAuthor?.displayName || displayName,
    avatarUrl: initialAuthor?.avatarUrl || "",
    channelId: channel.id,
    roleId: role?.id || "",
    customMessage: customMessage || "",
    watchLive,
    enabled: true,
    lastPostId: initialVideo?.id || "",
    lastPostUrl: initialVideo?.url || "",
    lastPostAt: initialVideo?.createdAt || "",
    isLive: Boolean(liveInfo?.isLive),
    lastLiveRoomId: liveInfo?.roomId || ""
  });

  const embed = new EmbedBuilder()
    .setColor(0x00f2fe)
    .setTitle("✅ Notifikasi TikTok Berhasil Diaktifkan")
    .setDescription(
      `Bot sekarang memantau akun TikTok **@${saved.username}** setiap **3 menit** secara otomatis.`
    )
    .addFields(
      { name: "ID Koneksi", value: `\`#${saved.id}\``, inline: true },
      { name: "Username", value: `[@${saved.username}](https://www.tiktok.com/@${saved.username})`, inline: true },
      { name: "Channel Tujuan", value: `<#${saved.channelId}>`, inline: true },
      { name: "Mention Role", value: saved.roleId ? `<@&${saved.roleId}>` : "`Tidak ada`", inline: true },
      { name: "Pantau LIVE", value: saved.watchLive ? "`Aktif 🔴`" : "`Nonaktif`", inline: true },
      {
        name: "Status Sinkronisasi Awal",
        value: initialVideo
          ? `Terhubung! Video terakhir terdeteksi (\`${initialVideo.id}\`). Video baru berikutnya akan langsung diumumkan.`
          : "Tersimpan! Saat ini belum ada video publik yang terbaca atau akun masih baru.",
        inline: false
      }
    )
    .setFooter({ text: `Gunakan /sosmed test id:${saved.id} untuk mencoba tampilan notifikasi sekarang.` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleSetInstagram(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawUsername = interaction.options.getString("username", true);
  const username = normalizeUsername(rawUsername);
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role");
  const displayName = interaction.options.getString("nama_tampilan") || "Murphy Official";
  const customMessage = interaction.options.getString("pesan_custom") || "";

  if (!username) {
    await interaction.editReply({
      content: "❌ Username Instagram tidak valid."
    });
    return;
  }

  let saved = upsertFeed(interaction.guildId, {
    platform: "instagram",
    username,
    displayName,
    channelId: channel.id,
    roleId: role?.id || "",
    customMessage: customMessage || "",
    watchLive: false,
    enabled: true
  });

  const webhook = await ensureDiscordBridgeWebhook(channel, saved);
  if (webhook) {
    saved = getGuildFeed(interaction.guildId, saved.id) || saved;
  }

  const webhookUrlInfo = saved.webhookUrl
    ? `\`\`\`\n${saved.webhookUrl}\n\`\`\``
    : "⚠️ *Bot tidak memiliki izin `Manage Webhooks` di channel tersebut. Berikan izin `Manage Webhooks` lalu jalankan ulang command ini untuk mendapatkan Discord Bridge URL.*";

  const makePayloadTemplate = JSON.stringify(
    {
      content: `[MURPHY_IG] ${JSON.stringify({
        token: saved.secretToken,
        permalink: "{{1.permalink}}",
        caption: "{{1.caption}}",
        media_url: "{{1.media_url}}",
        thumbnail_url: "{{1.thumbnail_url}}",
        media_type: "{{1.media_type}}",
        username: saved.username
      })}`
    },
    null,
    2
  );

  const embed = new EmbedBuilder()
    .setColor(0xe1306c)
    .setTitle("📸 Koneksi Instagram Siap Digunakan!")
    .setDescription(
      `Akun Instagram **[@${saved.username}](https://www.instagram.com/${saved.username}/)** terdaftar dengan ID \`#${saved.id}\`.\n\n` +
      "Karena Meta membatasi akses tanpa login, hubungkan akun **Instagram Resmi** kamu di **Make.com** atau **IFTTT** (Gratis & Aman) ke salah satu jalur di bawah ini. Saat Make/IFTTT mengirim data, **Bot Murphy akan otomatis mengubahnya menjadi Embed keren lengkap dengan Tombol Link & Mention Role!**"
    )
    .addFields(
      {
        name: "Channel & Role Mention",
        value: `Channel: <#${saved.channelId}> | Role: ${saved.roleId ? `<@&${saved.roleId}>` : "`Tidak ada`"}`,
        inline: false
      },
      {
        name: "🔗 Opsi 1: Discord Channel Bridge URL (Rekomendasi — Tanpa Perlu Buka Port)",
        value:
          "Tempel URL Webhook ini pada modul **HTTP Request (POST)** atau **Discord Webhook** di Make.com / IFTTT:\n" +
          webhookUrlInfo,
        inline: false
      },
      {
        name: "📦 Body JSON untuk Make.com / IFTTT (Method: POST, Content-Type: application/json)",
        value:
          "Jika memakai **Opsi 1 (Discord Bridge URL)**, gunakan Body JSON ini:\n" +
          `\`\`\`json\n${makePayloadTemplate}\n\`\`\`\n` +
          "*Tips: Jika di Make.com kamu memakai modul **Discord -> Send a Message**, cukup isi kolom **Content** dengan:*\n" +
          `\`[MURPHY_IG] {"token":"${saved.secretToken}","permalink":"{{1.permalink}}","caption":"{{1.caption}}","media_url":"{{1.media_url}}","media_type":"{{1.media_type}}"}\``,
        inline: false
      },
      {
        name: "🌐 Opsi 2: Direct Endpoint Bot (Jika Web Server Bot Publik)",
        value:
          `Endpoint: \`POST /api/webhooks/social?token=${saved.secretToken}\`\n` +
          "Body JSON langsung berisi `permalink`, `caption`, `media_url`, `thumbnail_url`, `media_type`.",
        inline: false
      }
    )
    .setFooter({ text: `Coba tampilannya sekarang dengan /sosmed test id:${saved.id}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleListFeeds(interaction) {
  const feeds = getGuildFeeds(interaction.guildId);

  if (!feeds.length) {
    await interaction.reply({
      content: "📭 Belum ada akun sosial media yang terhubung di server ini. Gunakan `/sosmed add-tiktok` atau `/sosmed set-instagram` untuk memulai.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const lines = feeds.map((feed) => {
    const icon = feed.platform === "tiktok" ? "🎵 **TikTok**" : "📸 **Instagram**";
    const profileUrl = feed.platform === "tiktok"
      ? `https://www.tiktok.com/@${feed.username}`
      : `https://www.instagram.com/${feed.username}/`;
    const roleInfo = feed.roleId ? `<@&${feed.roleId}>` : "`Tanpa Mention`";
    const liveBadge = feed.platform === "tiktok"
      ? ` • LIVE Alert: ${feed.watchLive ? (feed.isLive ? "`🔴 SEDANG LIVE`" : "`Aktif`") : "`Mati`"}`
      : "";

    return (
      `**ID \`#${feed.id}\`** — ${icon} [@${feed.username}](${profileUrl})\n` +
      `┗ Channel: <#${feed.channelId}> • Mention: ${roleInfo}${liveBadge}`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(0x111214)
    .setTitle("📡 Daftar Notifikasi Sosial Media")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: "Gunakan /sosmed test id:<ID> untuk tes, atau /sosmed remove id:<ID> untuk menghapus." });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleTestFeed(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const id = interaction.options.getString("id", true).replace(/^#/, "").trim();
  const type = interaction.options.getString("tipe") || "post";
  const feed = getGuildFeed(interaction.guildId, id);

  if (!feed) {
    await interaction.editReply({
      content: `❌ Koneksi sosmed dengan ID \`#${id}\` tidak ditemukan. Cek daftar ID di \`/sosmed list\`.`
    });
    return;
  }

  const result = await sendTestSocialAlert(interaction.client, feed, type);
  if (!result.ok) {
    await interaction.editReply({
      content: `❌ Gagal mengirim tes notifikasi: ${result.reason}`
    });
    return;
  }

  await interaction.editReply({
    content: `✅ Notifikasi tes (**${feed.platform.toUpperCase()} - ${type.toUpperCase()}**) untuk **@${feed.username}** berhasil dikirim ke <#${feed.channelId}>!`
  });
}

async function handleRemoveFeed(interaction) {
  const id = interaction.options.getString("id", true).replace(/^#/, "").trim();
  const existing = getGuildFeed(interaction.guildId, id);

  if (!existing) {
    await interaction.reply({
      content: `❌ Koneksi sosmed dengan ID \`#${id}\` tidak ditemukan. Cek daftar ID di \`/sosmed list\`.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  deleteFeed(interaction.guildId, id);

  await interaction.reply({
    content: `🗑️ Koneksi **${existing.platform.toUpperCase()} (@${existing.username})** dengan ID \`#${existing.id}\` berhasil dihapus.`,
    flags: MessageFlags.Ephemeral
  });
}

async function executeSlash(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Command ini hanya bisa digunakan di dalam server.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "add-tiktok") {
    await handleAddTikTok(interaction);
    return;
  }

  if (subcommand === "set-instagram") {
    await handleSetInstagram(interaction);
    return;
  }

  if (subcommand === "list") {
    await handleListFeeds(interaction);
    return;
  }

  if (subcommand === "test") {
    await handleTestFeed(interaction);
    return;
  }

  if (subcommand === "remove") {
    await handleRemoveFeed(interaction);
  }
}

module.exports = {
  slashData,
  executeSlash
};
