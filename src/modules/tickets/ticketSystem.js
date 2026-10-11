const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const { getGuildSettings } = require("../../services/guildConfigService");
const { getEffectiveGuildSettings } = require("../../utils/guildSettings");
const { getTicketPriorityFlair } = require("../levels/levelSystem");

const CLOSE_TICKET_BUTTON_ID = "ticket:close";
const TICKET_TYPE_PREFIX = "ticket:type:";

const VERIF_STAFF_ROLE_ID = "1558778004425932890";
const VERIF_GIRL_ROLE_ID = "1558511957500497920";
const VERIF_UNVERIFIED_ROLE_ID = "1558510979380412446";

const VERIF_CLAIM_BUTTON_ID = "ticket:verif:claim";
const VERIF_APPROVE_BUTTON_ID = "ticket:verif:approve";

const TICKET_TYPES = [
  { key: "verifikasi-girl", label: "Verifikasi Girl", emoji: "\uD83D\uDC97", style: ButtonStyle.Secondary, panel: "main" },
  { key: "minta-role", label: "Minta Role", emoji: "\uD83C\uDFAD", style: ButtonStyle.Secondary, panel: "main" },
  { key: "hapus-role", label: "Hapus Role", emoji: "\uD83E\uDDF9", style: ButtonStyle.Secondary, panel: "main" },
  { key: "laporan", label: "Laporan", emoji: "\uD83D\uDEA8", style: ButtonStyle.Secondary, panel: "main" },
  { key: "pasang-iklan", label: "Pasang Iklan", emoji: "\uD83D\uDCE2", style: ButtonStyle.Secondary, panel: "main" },
  { key: "media-partner", label: "Media Partner", emoji: "\uD83D\uDCE1", style: ButtonStyle.Secondary, panel: "main" },
  { key: "custom-role", label: "Custom Role", emoji: "\u2728", style: ButtonStyle.Secondary, panel: "custom-role" },
  { key: "partnership", label: "Partnership", emoji: "\uD83E\uDD1D", style: ButtonStyle.Secondary, panel: "partnership" }
];

function getTicketTypeChoices() {
  return TICKET_TYPES.map((type) => ({
    name: type.label,
    value: type.key
  }));
}

function getTicketType(customIdOrKey) {
  const key = customIdOrKey.startsWith(TICKET_TYPE_PREFIX)
    ? customIdOrKey.slice(TICKET_TYPE_PREFIX.length)
    : customIdOrKey;

  return TICKET_TYPES.find((type) => type.key === key) || null;
}

function buildTicketPanel(client, guildId) {
  const { tickets } = getEffectiveGuildSettings(guildId, client);
  const mainTypes = TICKET_TYPES.filter((type) => type.panel === "main");
  const panelLines = [
    "Gunakan loket ini kalau kamu butuh bantuan dari tim Murphy.",
    "",
    "**Loket tersedia untuk:**",
    "- 💖 Verifikasi Girl",
    "- 🎭 Minta Role",
    "- 🧹 Hapus Role",
    "- 🚨 Laporan",
    "- 📢 Pasang Iklan",
    "- 📡 Media Partner",
    "",
    "**SOP Pengambilan Tiket:**",
    "- 🕐 Jam aktif loket: `09.00 WIB - 02.00 WIB`",
    "- 🧾 Pilih kategori tiket sesuai kebutuhanmu",
    "- 👩 Verifikasi Girl hanya akan diproses oleh admin perempuan",
    "- 🚫 Dilarang membuat laporan palsu, manipulatif, atau tidak sesuai fakta",
    "- 🔔 Dilarang mention atau tag role tanpa izin",
    "- ⏳ Dilarang membuka tiket berulang sebelum `2x24 jam`",
    "- 🗑️ Tiket akan ditutup otomatis setelah `6 jam` tanpa respon",
    "",
    "- ⚠️ Pelanggaran SOP dapat menyebabkan tiket ditolak atau langsung ditutup",
    "",
    "Klik tombol di bawah untuk membuka tiket."
  ];

  const embed = new EmbedBuilder()
    .setColor(tickets.panelAccentColor)
    .setTitle("OPEN TIKET")
    .setDescription(panelLines.join("\n"));

  const components = [
    new ActionRowBuilder().addComponents(
      ...mainTypes.slice(0, 3).map((type) =>
        new ButtonBuilder()
          .setCustomId(`${TICKET_TYPE_PREFIX}${type.key}`)
          .setLabel(type.label)
          .setEmoji(type.emoji)
          .setStyle(type.style)
      )
    ),
    new ActionRowBuilder().addComponents(
      ...mainTypes.slice(3).map((type) =>
        new ButtonBuilder()
          .setCustomId(`${TICKET_TYPE_PREFIX}${type.key}`)
          .setLabel(type.label)
          .setEmoji(type.emoji)
          .setStyle(type.style)
      )
    )
  ];

  return {
    embeds: [embed],
    components
  };
}

function buildPartnershipTicketPanel(client, guildId) {
  const { tickets } = getEffectiveGuildSettings(guildId, client);
  const partnershipType = getTicketType("partnership");
  const partnershipOpen = tickets.partnershipEnabled !== false;
  const statusLabel = partnershipOpen ? "PARTNERSHIP OPEN" : "PARTNERSHIP CLOSED";
  const statusLine = partnershipOpen
    ? "◈ Status: **OPEN**"
    : "◈ Status: **CLOSED**";

  const embed = new EmbedBuilder()
    .setColor(tickets.panelAccentColor)
    .setTitle(statusLabel)
    .setDescription(
      [
        "Halo, welcome to Murphy.",
        partnershipOpen
          ? "Gerbang partnership kami terbuka untuk komunitas yang ingin tumbuh bersama dalam kerja sama yang sehat dan saling menguntungkan."
          : "Saat ini partnership sedang ditutup sementara. Silakan pantau panel ini sampai loket dibuka kembali.",
        "",
        statusLine,
        "",
        "◈ Benefit Partnership",
        "▸ Promosi server di channel partnership Murphy",
        "▸ Relasi dengan komunitas aktif dan berkembang",
        "▸ Dukungan kerja sama timbal balik untuk memperluas jangkauan komunitas",
        "",
        "◈ Syarat Partnership",
        "▸ Minimal 500 member aktif",
        "▸ Member tidak termasuk bot",
        "▸ Wajib siap untuk promosi timbal balik",
        "▸ Tidak mengandung konten yang melanggar ToS Discord",
        "▸ Tidak mengandung unsur NSFW",
        "",
        "◈ Ketentuan Tambahan",
        "▸ Mohon informasikan kepada staff jika server mengalami perubahan penting",
        "▸ Jangan keluar dari server tanpa alasan dan konfirmasi yang jelas",
        "▸ Partnership dapat dilepas jika ketentuan dilanggar",
        "▸ Perwakilan server diharapkan aktif selama masa kerja sama",
        "",
        partnershipOpen
          ? "Tekan tombol di bawah untuk membuka Ticket Partnership."
          : "Tombol akan aktif kembali ketika partnership dibuka."
      ].join("\n")
    );

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_TYPE_PREFIX}${partnershipType.key}`)
        .setLabel(partnershipOpen ? "Ticket Here" : "Coming Soon")
        .setEmoji(partnershipType.emoji)
        .setStyle(partnershipOpen ? partnershipType.style : ButtonStyle.Secondary)
        .setDisabled(!partnershipOpen)
    )
  ];

  return {
    embeds: [embed],
    components
  };
}

function buildTicketCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_TICKET_BUTTON_ID)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

function getIndonesianDateString() {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta"
  }).format(new Date());
}

function buildVerifikasiGirlEmbed(user) {
  const formattedDate = getIndonesianDateString();

  return new EmbedBuilder()
    .setColor("#f472b6")
    .setTitle(`🌸 Tiket Verifikasi - ${user.username}`)
    .setDescription(
      [
        `Halo ${user}! Silakan kirimkan Voice Note (VN) langsung dari fitur Discord untuk verifikasi.`,
        "",
        "Wajib sebutkan ini di VN:",
        `> "Halo, aku ${user.username}/(nama panggilan), hari ini ${formattedDate}, mau verif role female."`,
        "",
        "Staff akan segera mengecek tiketmu. Mohon bersabar ya!"
      ].join("\n")
    );
}

function buildVerifikasiGirlActionRow(options = {}) {
  const isClaimed = Boolean(options.claimedBy);
  const isApproved = Boolean(options.approved);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIF_CLAIM_BUTTON_ID)
      .setLabel(isClaimed ? (options.claimedName ? `Claimed by ${options.claimedName}` : "Claimed") : "Claim Ticket")
      .setEmoji("🧠")
      .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(isClaimed),
    new ButtonBuilder()
      .setCustomId(VERIF_APPROVE_BUTTON_ID)
      .setLabel("Approved")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isApproved),
    new ButtonBuilder()
      .setCustomId(CLOSE_TICKET_BUTTON_ID)
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );
}

function isVerifStaffMember(member, client) {
  const settings = getEffectiveGuildSettings(member.guild.id, client);
  const staffRoleId = settings.tickets?.verifStaffRoleId || VERIF_STAFF_ROLE_ID;

  return member.roles.cache.has(staffRoleId)
    || (settings.tickets?.supportRoleId && member.roles.cache.has(settings.tickets.supportRoleId))
    || member.permissions.has(PermissionFlagsBits.ManageChannels)
    || member.permissions.has(PermissionFlagsBits.Administrator);
}

function buildTicketOpenedEmbed(user, supportRoleId, ticketType, ticketFlair = "") {
  const supportLine = supportRoleId ? `<@&${supportRoleId}>` : "Tim support belum diatur.";

  return new EmbedBuilder()
    .setColor("#1f1f1f")
    .setTitle(`Tiket Dibuka: ${ticketType.label}`)
    .setDescription(
      [
        `${user}, tiketmu sudah dibuka.`,
        ticketFlair ? `Priority Flair: **${ticketFlair}**` : null,
        `Jenis tiket: **${ticketType.label}**`,
        `Support: ${supportLine}`,
        "",
        "Jelaskan kebutuhanmu dengan jelas agar tim bisa bantu lebih cepat.",
        "Template detail akan dikirim lewat command `fsupport`."
      ].filter(Boolean).join("\n")
    );
}

function getTicketPingRoleIds(guildId, ticketTypeKey, client) {
  const settings = getEffectiveGuildSettings(guildId, client);
  const roleIds = settings.tickets?.pingRoleIdsByType?.[ticketTypeKey];

  if (!Array.isArray(roleIds)) {
    return [];
  }

  return [...new Set(roleIds.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean))];
}

async function findExistingTicketChannel(guild, userId) {
  return guild.channels.cache.find((channel) =>
    channel.type === ChannelType.GuildText && channel.topic?.startsWith(`ticket-owner:${userId}|`)
  ) || null;
}

async function createTicketChannel(interaction, client, ticketTypeKey, options = {}) {
  const { tickets } = getEffectiveGuildSettings(interaction.guildId, client);
  const ticketType = getTicketType(ticketTypeKey);
  const guildSettings = getGuildSettings(interaction.guildId, {
    customRoles: {
      ticketCategoryId: ""
    }
  });
  const customRoleCategoryId = guildSettings.customRoles?.ticketCategoryId || "";
  const categoryIdOverride = String(options.categoryIdOverride || "").trim();

  const targetCategoryId = categoryIdOverride
    || (ticketType?.key === "partnership"
    ? tickets.partnershipCategoryId
    : ticketType?.key === "custom-role" && customRoleCategoryId
      ? customRoleCategoryId
      : tickets.categoryId);

  if (!targetCategoryId) {
    return {
      ok: false,
      reason: ticketType?.key === "partnership"
        ? "Kategori partnership belum diatur. Gunakan `fsetpartnershipcategory` dulu."
        : "Kategori tiket belum diatur. Gunakan `fsetticketcategory` dulu."
    };
  }

  const existingTicket = await findExistingTicketChannel(interaction.guild, interaction.user.id);

  if (existingTicket) {
    return {
      ok: false,
      reason: `Kamu sudah punya tiket terbuka di ${existingTicket}.`
    };
  }

  if (!ticketType) {
    return {
      ok: false,
      reason: "Jenis tiket tidak valid."
    };
  }

  if (ticketType.key === "partnership" && tickets.partnershipEnabled === false) {
    return {
      ok: false,
      reason: "Ticket partnership sedang ditutup sementara. Silakan coba lagi nanti."
    };
  }

  const isVerifikasiGirl = ticketType.key === "verifikasi-girl";
  const verifStaffRoleId = tickets.verifStaffRoleId || VERIF_STAFF_ROLE_ID;
  const ticketPingRoleIds = getTicketPingRoleIds(interaction.guildId, ticketType.key, client);
  const accessRoleIds = [...new Set([
    ...(tickets.supportRoleId ? [tickets.supportRoleId] : []),
    ...(isVerifikasiGirl ? [verifStaffRoleId] : []),
    ...ticketPingRoleIds
  ])];

  const ticketChannel = await interaction.guild.channels.create({
    name: `ticket-${ticketType.key}-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32),
    type: ChannelType.GuildText,
    parent: targetCategoryId,
    topic: `ticket-owner:${interaction.user.id}|type:${ticketType.key}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      ...accessRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }))
    ]
  });

  const ticketFlair = getTicketPriorityFlair(interaction.guildId, interaction.user.id);
  const mentionRoleIds = [...new Set([
    ...(tickets.supportRoleId ? [tickets.supportRoleId] : []),
    ...(isVerifikasiGirl ? [verifStaffRoleId] : []),
    ...ticketPingRoleIds
  ])];
  const mentionContent = mentionRoleIds.length
    ? mentionRoleIds.map((roleId) => `<@&${roleId}>`).join(" ")
    : undefined;

  if (isVerifikasiGirl) {
    await ticketChannel.send({
      content: mentionContent,
      allowedMentions: {
        roles: mentionRoleIds
      },
      embeds: [buildVerifikasiGirlEmbed(interaction.user)],
      components: [buildVerifikasiGirlActionRow()]
    });
  } else {
    await ticketChannel.send({
      content: mentionContent,
      allowedMentions: {
        roles: mentionRoleIds
      },
      embeds: [buildTicketOpenedEmbed(interaction.user, tickets.supportRoleId, ticketType, ticketFlair)],
      components: [buildTicketCloseRow()]
    });
  }

  return {
    ok: true,
    channel: ticketChannel
  };
}

async function closeTicketChannel(interaction, client) {
  const { tickets } = getEffectiveGuildSettings(interaction.guildId, client);
  const ownerTag = interaction.channel.topic?.match(/^ticket-owner:(\d+)/)?.[1];
  const ticketTypeKey = interaction.channel.topic?.match(/\|type:([^|]+)/)?.[1] || "";
  const ticketPingRoleIds = ticketTypeKey ? getTicketPingRoleIds(interaction.guildId, ticketTypeKey, client) : [];
  const hasTicketPingAccess = ticketPingRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
  const verifStaffRoleId = tickets.verifStaffRoleId || VERIF_STAFF_ROLE_ID;
  const hasVerifStaffAccess = ticketTypeKey === "verifikasi-girl" && interaction.member.roles.cache.has(verifStaffRoleId);

  if (!ownerTag) {
    return {
      ok: false,
      reason: "Channel ini bukan ticket yang valid."
    };
  }

  if (
    interaction.user.id !== ownerTag &&
    !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
    !hasTicketPingAccess &&
    !hasVerifStaffAccess &&
    (!tickets.supportRoleId || !interaction.member.roles.cache.has(tickets.supportRoleId))
  ) {
    return {
      ok: false,
      reason: "Kamu tidak punya izin untuk menutup ticket ini."
    };
  }

  const logChannel = tickets.logChannelId
    ? await interaction.guild.channels.fetch(tickets.logChannelId).catch(() => null)
    : null;

  if (logChannel && logChannel.type === ChannelType.GuildText) {
    await logChannel.send(`Ticket closed: ${interaction.channel.name} by ${interaction.user}.`);
  }

  await interaction.channel.delete("Ticket closed");

  return { ok: true };
}

async function handleTicketClaimButton(interaction, client) {
  if (!isVerifStaffMember(interaction.member, client)) {
    await interaction.reply({
      content: "Kamu tidak memiliki izin staff untuk meng-claim tiket ini.",
      ephemeral: true
    });
    return;
  }

  const topic = interaction.channel.topic || "";
  const ownerId = topic.match(/^ticket-owner:(\d+)/)?.[1];

  if (ownerId && interaction.user.id === ownerId) {
    await interaction.reply({
      content: "Kamu tidak bisa meng-claim tiket milikmu sendiri.",
      ephemeral: true
    });
    return;
  }

  const claimedId = topic.match(/\|claimed:(\d+)/)?.[1];
  if (claimedId) {
    await interaction.reply({
      content: `Tiket ini sudah di-claim oleh <@${claimedId}>.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const updatedTopic = `${topic}|claimed:${interaction.user.id}`;
  await interaction.channel.setTopic(updatedTopic).catch(() => null);

  const existingApproved = topic.includes("|approved:true");
  const updatedRow = buildVerifikasiGirlActionRow({
    claimedBy: interaction.user.id,
    claimedName: interaction.member.displayName || interaction.user.username,
    approved: existingApproved
  });

  if (interaction.message) {
    await interaction.message.edit({
      components: [updatedRow]
    }).catch(() => null);
  }

  await interaction.channel.send({
    content: `🧠 Tiket ini telah di-claim oleh ${interaction.user}.`
  });
}

async function handleTicketApproveButton(interaction, client) {
  if (!isVerifStaffMember(interaction.member, client)) {
    await interaction.reply({
      content: "Kamu tidak memiliki izin staff untuk menyetujui verifikasi ini.",
      ephemeral: true
    });
    return;
  }

  const topic = interaction.channel.topic || "";
  const ownerId = topic.match(/^ticket-owner:(\d+)/)?.[1];

  if (!ownerId) {
    await interaction.reply({
      content: "Owner tiket tidak ditemukan.",
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id === ownerId) {
    await interaction.reply({
      content: "Kamu tidak bisa meng-approve tiket milikmu sendiri.",
      ephemeral: true
    });
    return;
  }

  if (topic.includes("|approved:true")) {
    await interaction.reply({
      content: "Tiket verifikasi ini sudah di-approve sebelumnya.",
      ephemeral: true
    });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(ownerId).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "Member tiket tidak ditemukan di server.",
      ephemeral: true
    });
    return;
  }

  const settings = getEffectiveGuildSettings(interaction.guildId, client);
  const girlRoleId = settings.tickets?.verifGirlRoleId || VERIF_GIRL_ROLE_ID;
  const unverifiedRoleId = settings.tickets?.verifUnverifiedRoleId || VERIF_UNVERIFIED_ROLE_ID;

  const girlRole = interaction.guild.roles.cache.get(girlRoleId);

  if (!girlRole) {
    await interaction.reply({
      content: `Role Girl (<@&${girlRoleId}>) tidak ditemukan di server. Hubungi admin.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  try {
    await targetMember.roles.add(girlRole);
  } catch (error) {
    console.error("Failed to add girl role:", error);
    await interaction.followUp({
      content: "Gagal memberikan role Girl. Pastikan posisi role bot berada di atas role Girl pada Server Settings.",
      ephemeral: true
    }).catch(() => null);
    return;
  }

  let unverifiedRemoved = false;
  if (targetMember.roles.cache.has(unverifiedRoleId)) {
    try {
      await targetMember.roles.remove(unverifiedRoleId);
      unverifiedRemoved = true;
    } catch (error) {
      console.warn("Failed to remove unverified role:", error);
    }
  }

  const updatedTopic = `${topic}|approved:true`;
  await interaction.channel.setTopic(updatedTopic).catch(() => null);

  const claimedId = topic.match(/\|claimed:(\d+)/)?.[1];
  const claimedMember = claimedId ? await interaction.guild.members.fetch(claimedId).catch(() => null) : null;
  const updatedRow = buildVerifikasiGirlActionRow({
    claimedBy: claimedId,
    claimedName: claimedMember?.displayName || claimedMember?.user?.username || "",
    approved: true
  });

  if (interaction.message) {
    await interaction.message.edit({
      components: [updatedRow]
    }).catch(() => null);
  }

  const unverifiedText = unverifiedRemoved
    ? ` dan role <@&${unverifiedRoleId}> telah dicabut`
    : "";

  const successEmbed = new EmbedBuilder()
    .setColor("#22c55e")
    .setTitle("✅ Verifikasi Berhasil!")
    .setDescription(
      [
        `Selamat ${targetMember}, kamu telah diverifikasi sebagai girl! 🎉`,
        "",
        `Role <@&${girlRoleId}> telah diberikan${unverifiedText} oleh ${interaction.user}.`,
        "",
        "Silakan nikmati fasilitas dan channel khusus di server Murphy! 💕"
      ].join("\n")
    )
    .setTimestamp();

  await interaction.channel.send({
    content: `${targetMember}`,
    embeds: [successEmbed]
  });
}

module.exports = {
  CLOSE_TICKET_BUTTON_ID,
  TICKET_TYPE_PREFIX,
  VERIF_CLAIM_BUTTON_ID,
  VERIF_APPROVE_BUTTON_ID,
  VERIF_STAFF_ROLE_ID,
  VERIF_GIRL_ROLE_ID,
  VERIF_UNVERIFIED_ROLE_ID,
  buildPartnershipTicketPanel,
  buildTicketPanel,
  buildVerifikasiGirlEmbed,
  buildVerifikasiGirlActionRow,
  getTicketPingRoleIds,
  getTicketTypeChoices,
  getTicketType,
  createTicketChannel,
  closeTicketChannel,
  handleTicketClaimButton,
  handleTicketApproveButton
};
