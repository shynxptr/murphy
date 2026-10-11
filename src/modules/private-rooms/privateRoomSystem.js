const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const {
  deletePrivateRoom,
  findPrivateRoomByOwner,
  getPrivateRoom,
  listPrivateRooms,
  upsertPrivateRoom
} = require("../../services/privateRoomStore");
const { getMemberLevelInfo } = require("../levels/levelSystem");

const PRIVATE_ROOM_ACCESS_LEVEL = 5;
const PRIVATE_ROOM_CREATE_BUTTON_ID = "privateroom:create";
const PRIVATE_ROOM_STATUS_BUTTON_ID = "privateroom:status";
const DEFAULT_PRIVATE_ROOM_SETTINGS = {
  categoryId: "",
  inviteLimit: 3,
  idleHours: 6,
  lifespanHours: 24
};

function getPrivateRoomSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    privateRooms: DEFAULT_PRIVATE_ROOM_SETTINGS
  }).privateRooms;

  return {
    ...DEFAULT_PRIVATE_ROOM_SETTINGS,
    ...(settings || {})
  };
}

function updatePrivateRoomSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const nextSettings = updater({
      ...DEFAULT_PRIVATE_ROOM_SETTINGS,
      ...(current.privateRooms || {})
    });

    return {
      ...current,
      privateRooms: {
        ...DEFAULT_PRIVATE_ROOM_SETTINGS,
        ...(nextSettings || {})
      }
    };
  });
}

function hasPrivateRoomAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function ensurePrivateRoomAccess(guildId, userId, member) {
  if (getMemberLevelInfo(guildId, userId).level >= PRIVATE_ROOM_ACCESS_LEVEL) {
    return { ok: true };
  }

  if (member && hasPrivateRoomAdminPermission(member)) {
    return { ok: true, adminBypass: true };
  }

  return {
    ok: false,
    reason: "Temporary private channel baru terbuka mulai Level 5."
  };
}

function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle("Private Room Error")
    .setDescription(description)
    .setTimestamp();
}

function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function buildPrivateRoomPanelEmbed() {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Eclipse Private Room")
    .setDescription([
      "Private Room adalah channel pribadi sementara untuk member **Level 5 - Eclipse**.",
      "",
      "Fungsi utama:",
      "- Bikin ruang pribadi untuk chat / grind tanpa nyampah di channel umum",
      "- Bisa invite teman tertentu",
      "- Bisa ditutup sendiri kapan saja",
      "",
      "Klik tombol di bawah untuk membuat room atau cek status room kamu."
    ].join("\n"))
    .setFooter({
      text: "Murphy Elite Private Room"
    });
}

function buildPrivateRoomPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PRIVATE_ROOM_CREATE_BUTTON_ID)
        .setLabel("Buat Private Room")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(PRIVATE_ROOM_STATUS_BUTTON_ID)
        .setLabel("Cek Status")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function sanitizeRoomName(input, fallback) {
  const normalized = String(input || fallback || "private-room")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return normalized || fallback || "private-room";
}

function buildRoomChannelName(member, inputName = "") {
  const seed = inputName || member.displayName || member.user.username || "elite-room";
  return `elite-${sanitizeRoomName(seed, "elite-room")}`;
}

function getOptionalStringOption(interaction, optionName) {
  if (!interaction?.options || typeof interaction.options.getString !== "function") {
    return null;
  }

  return interaction.options.getString(optionName);
}

function buildRoomTopic(ownerId) {
  return `private-room-owner:${ownerId}`;
}

function isPrivateRoomChannel(channel) {
  return channel?.type === ChannelType.GuildText
    && channel.topic?.startsWith("private-room-owner:");
}

function buildPermissionOverwrites(guild, ownerId, invitedUserIds = []) {
  const botId = guild.members.me?.id || guild.client.user?.id;

  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    ...(botId ? [{
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }] : []),
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    ...invitedUserIds.map((userId) => ({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis
      ]
    }))
  ];
}

async function resolveConfiguredCategory(guild) {
  const settings = getPrivateRoomSettings(guild.id);

  if (!settings.categoryId) {
    return null;
  }

  const category = guild.channels.cache.get(settings.categoryId)
    || await guild.channels.fetch(settings.categoryId).catch(() => null);

  return category?.type === ChannelType.GuildCategory ? category : null;
}

function formatRelativeHours(hours) {
  return `${new Intl.NumberFormat("id-ID").format(hours)} jam`;
}

function formatTimestamp(value) {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? `<t:${Math.floor(ms / 1000)}:R>` : "-";
}

async function closePrivateRoom(guild, room, reason = "Private room closed") {
  const channel = guild.channels.cache.get(room.channelId)
    || await guild.channels.fetch(room.channelId).catch(() => null);

  if (channel && channel.deletable) {
    await channel.delete(reason).catch(() => null);
  }

  deletePrivateRoom(guild.id, room.channelId);
}

async function createPrivateRoom(interaction) {
  const access = ensurePrivateRoomAccess(interaction.guildId, interaction.user.id, interaction.member);

  if (!access.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(access.reason)],
      ephemeral: true
    });
    return;
  }

  const existing = findPrivateRoomByOwner(interaction.guildId, interaction.user.id);

  if (existing) {
    const existingChannel = interaction.guild.channels.cache.get(existing.channelId)
      || await interaction.guild.channels.fetch(existing.channelId).catch(() => null);

    if (existingChannel) {
      await interaction.reply({
        embeds: [
          buildErrorEmbed(`Kamu masih punya private room aktif di ${existingChannel}. Tutup dulu sebelum bikin yang baru.`)
        ],
        ephemeral: true
      });
      return;
    }

    deletePrivateRoom(interaction.guildId, existing.channelId);
  }

  const settings = getPrivateRoomSettings(interaction.guildId);
  const category = await resolveConfiguredCategory(interaction.guild);
  const channelName = buildRoomChannelName(interaction.member, getOptionalStringOption(interaction, "name"));
  const now = Date.now();
  const expiresAt = new Date(now + (settings.lifespanHours * 60 * 60 * 1000)).toISOString();
  const lastActivityAt = new Date(now).toISOString();
  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    topic: buildRoomTopic(interaction.user.id),
    permissionOverwrites: buildPermissionOverwrites(interaction.guild, interaction.user.id, [])
  };

  if (category?.id) {
    channelOptions.parent = category.id;
  }

  const channel = await interaction.guild.channels.create(channelOptions);

  upsertPrivateRoom(interaction.guildId, channel.id, () => ({
    ownerId: interaction.user.id,
    invitedUserIds: [],
    createdAt: new Date(now).toISOString(),
    expiresAt,
    lastActivityAt
  }));

  await channel.send({
    embeds: [
      buildSuccessEmbed(
        "Elite Private Room",
        [
          `${interaction.user}, private room kamu sudah dibuat.`,
          `Durasi aktif: **${formatRelativeHours(settings.lifespanHours)}**`,
          `Idle cleanup: **${formatRelativeHours(settings.idleHours)}** tanpa aktivitas`,
          "",
          "Gunakan `/privateroom invite`, `/privateroom remove`, `/privateroom status`, atau `/privateroom close` untuk kelola room ini."
        ].join("\n")
      )
    ]
  }).catch(() => null);

  await interaction.reply({
    embeds: [
      buildSuccessEmbed(
        "Private Room Created",
        [
          `Private room kamu berhasil dibuat di ${channel}.`,
          category ? `Kategori: **${category.name}**` : "Kategori belum diatur, jadi room dibuat tanpa category khusus."
        ].join("\n")
      )
    ],
    ephemeral: true
  });
}

async function showPrivateRoomStatus(interaction) {
  const access = ensurePrivateRoomAccess(interaction.guildId, interaction.user.id, interaction.member);

  if (!access.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(access.reason)],
      ephemeral: true
    });
    return;
  }

  const room = findPrivateRoomByOwner(interaction.guildId, interaction.user.id);
  const settings = getPrivateRoomSettings(interaction.guildId);

  if (!room) {
    await interaction.reply({
      embeds: [
        buildSuccessEmbed(
          "Private Room Status",
          [
            "Kamu belum punya private room aktif.",
            `Durasi default room: **${formatRelativeHours(settings.lifespanHours)}**`,
            `Idle cleanup: **${formatRelativeHours(settings.idleHours)}**`
          ].join("\n")
        )
      ],
      ephemeral: true
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(room.channelId)
    || await interaction.guild.channels.fetch(room.channelId).catch(() => null);

  if (!channel) {
    deletePrivateRoom(interaction.guildId, room.channelId);
    await interaction.reply({
      embeds: [buildErrorEmbed("Data room lama dibersihkan karena channel-nya sudah tidak ada.")],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#111214")
        .setTitle("Private Room Status")
        .setDescription(
          [
            `Channel: ${channel}`,
            `Expire: ${formatTimestamp(room.expiresAt)}`,
            `Aktivitas terakhir: ${formatTimestamp(room.lastActivityAt)}`,
            `Invite aktif: **${room.invitedUserIds.length}/${settings.inviteLimit}**`
          ].join("\n")
        )
        .setTimestamp()
    ],
    ephemeral: true
  });
}

async function inviteToPrivateRoom(interaction) {
  const access = ensurePrivateRoomAccess(interaction.guildId, interaction.user.id, interaction.member);

  if (!access.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(access.reason)],
      ephemeral: true
    });
    return;
  }

  const room = findPrivateRoomByOwner(interaction.guildId, interaction.user.id);

  if (!room) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu belum punya private room aktif.")],
      ephemeral: true
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(room.channelId)
    || await interaction.guild.channels.fetch(room.channelId).catch(() => null);
  const targetUser = interaction.options.getUser("member", true);
  const targetMember = interaction.options.getMember("member")
    || await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const settings = getPrivateRoomSettings(interaction.guildId);

  if (!channel) {
    deletePrivateRoom(interaction.guildId, room.channelId);
    await interaction.reply({
      embeds: [buildErrorEmbed("Channel private room kamu sudah tidak ada. Coba buat ulang.")],
      ephemeral: true
    });
    return;
  }

  if (!targetMember || targetMember.user.bot) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Member target tidak valid atau merupakan bot.")],
      ephemeral: true
    });
    return;
  }

  if (targetMember.id === interaction.user.id) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu tidak perlu mengundang dirimu sendiri ke room ini.")],
      ephemeral: true
    });
    return;
  }

  if (room.invitedUserIds.includes(targetMember.id)) {
    await interaction.reply({
      embeds: [buildErrorEmbed(`${targetMember} sudah punya akses ke room kamu.`)],
      ephemeral: true
    });
    return;
  }

  if (room.invitedUserIds.length >= settings.inviteLimit) {
    await interaction.reply({
      embeds: [buildErrorEmbed(`Batas invite room kamu sudah penuh (${settings.inviteLimit} member).`)],
      ephemeral: true
    });
    return;
  }

  const nextInvites = [...room.invitedUserIds, targetMember.id];
  upsertPrivateRoom(interaction.guildId, room.channelId, () => ({
    ...room,
    invitedUserIds: nextInvites,
    lastActivityAt: new Date().toISOString()
  }));

  await channel.permissionOverwrites.edit(targetMember.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
    UseExternalEmojis: true
  }).catch(() => null);

  await interaction.reply({
    embeds: [buildSuccessEmbed("Invite Added", `${targetMember} sekarang bisa masuk ke ${channel}.`)],
    ephemeral: true
  });
}

async function removeFromPrivateRoom(interaction) {
  const access = ensurePrivateRoomAccess(interaction.guildId, interaction.user.id, interaction.member);

  if (!access.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(access.reason)],
      ephemeral: true
    });
    return;
  }

  const room = findPrivateRoomByOwner(interaction.guildId, interaction.user.id);

  if (!room) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu belum punya private room aktif.")],
      ephemeral: true
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(room.channelId)
    || await interaction.guild.channels.fetch(room.channelId).catch(() => null);
  const targetUser = interaction.options.getUser("member", true);

  if (!channel) {
    deletePrivateRoom(interaction.guildId, room.channelId);
    await interaction.reply({
      embeds: [buildErrorEmbed("Channel private room kamu sudah tidak ada. Coba buat ulang.")],
      ephemeral: true
    });
    return;
  }

  if (!room.invitedUserIds.includes(targetUser.id)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Member itu tidak sedang punya akses invite di room kamu.")],
      ephemeral: true
    });
    return;
  }

  const nextInvites = room.invitedUserIds.filter((userId) => userId !== targetUser.id);
  upsertPrivateRoom(interaction.guildId, room.channelId, () => ({
    ...room,
    invitedUserIds: nextInvites,
    lastActivityAt: new Date().toISOString()
  }));

  await channel.permissionOverwrites.delete(targetUser.id).catch(() => null);

  await interaction.reply({
    embeds: [buildSuccessEmbed("Invite Removed", `<@${targetUser.id}> tidak lagi punya akses ke ${channel}.`)],
    ephemeral: true
  });
}

async function closeOwnedPrivateRoom(interaction) {
  const access = ensurePrivateRoomAccess(interaction.guildId, interaction.user.id, interaction.member);

  if (!access.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(access.reason)],
      ephemeral: true
    });
    return;
  }

  const room = findPrivateRoomByOwner(interaction.guildId, interaction.user.id);

  if (!room) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu belum punya private room aktif.")],
      ephemeral: true
    });
    return;
  }

  await closePrivateRoom(interaction.guild, room, `Closed by ${interaction.user.tag}`);
  await interaction.reply({
    embeds: [buildSuccessEmbed("Private Room Closed", "Private room kamu berhasil ditutup.")],
    ephemeral: true
  });
}

function extendOwnedPrivateRoom(guildId, ownerId, hours) {
  const room = findPrivateRoomByOwner(guildId, ownerId);

  if (!room) {
    return {
      ok: false,
      reason: "Kamu belum punya private room aktif untuk diperpanjang."
    };
  }

  const incrementHours = Math.max(1, Number.parseInt(String(hours || 0), 10) || 0);
  const baseTime = Math.max(Date.now(), new Date(room.expiresAt || room.createdAt || Date.now()).getTime());
  const expiresAt = new Date(baseTime + (incrementHours * 60 * 60 * 1000)).toISOString();
  const next = upsertPrivateRoom(guildId, room.channelId, () => ({
    ...room,
    expiresAt,
    lastActivityAt: new Date().toISOString()
  }));

  return {
    ok: true,
    room: next,
    expiresAt
  };
}

async function setPrivateRoomCategory(interaction) {
  const category = interaction.options.getChannel("category", true);

  if (category.type !== ChannelType.GuildCategory) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Target harus berupa category channel.")],
      ephemeral: true
    });
    return;
  }

  updatePrivateRoomSettings(interaction.guildId, (current) => ({
    ...current,
    categoryId: category.id
  }));

  await interaction.reply({
    embeds: [buildSuccessEmbed("Private Room Category Updated", `Kategori private room diset ke **${category.name}**.`)],
    ephemeral: true
  });
}

async function sendPrivateRoomPanel(interaction, targetChannel = null) {
  const channel = targetChannel || interaction.channel;

  if (!channel?.isTextBased?.()) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Channel target panel tidak valid.")],
      ephemeral: true
    });
    return;
  }

  const sent = await channel.send({
    embeds: [buildPrivateRoomPanelEmbed()],
    components: buildPrivateRoomPanelRows()
  });

  await interaction.reply({
    embeds: [
      buildSuccessEmbed(
        "Private Room Panel Sent",
        `Panel private room berhasil dikirim ke ${sent.channel}.`
      )
    ],
    ephemeral: true
  });
}

async function handlePrivateRoomButton(interaction) {
  if (interaction.customId === PRIVATE_ROOM_CREATE_BUTTON_ID) {
    await createPrivateRoom(interaction);
    return true;
  }

  if (interaction.customId === PRIVATE_ROOM_STATUS_BUTTON_ID) {
    await showPrivateRoomStatus(interaction);
    return true;
  }

  return false;
}

async function showPrivateRoomAdminStatus(interaction) {
  const settings = getPrivateRoomSettings(interaction.guildId);
  const activeRooms = listPrivateRooms(interaction.guildId);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#111214")
        .setTitle("Private Room Settings")
        .addFields(
          {
            name: "Kategori",
            value: settings.categoryId ? `<#${settings.categoryId}>` : "Belum diatur",
            inline: false
          },
          {
            name: "Durasi Room",
            value: formatRelativeHours(settings.lifespanHours),
            inline: true
          },
          {
            name: "Idle Cleanup",
            value: formatRelativeHours(settings.idleHours),
            inline: true
          },
          {
            name: "Invite Limit",
            value: String(settings.inviteLimit),
            inline: true
          },
          {
            name: "Room Aktif",
            value: String(activeRooms.length),
            inline: false
          }
        )
        .setTimestamp()
    ],
    ephemeral: true
  });
}

async function touchPrivateRoomActivity(message) {
  if (!message.guild || message.author.bot) {
    return false;
  }

  const room = getPrivateRoom(message.guild.id, message.channel.id);

  if (!room) {
    return false;
  }

  upsertPrivateRoom(message.guild.id, room.channelId, () => ({
    ...room,
    lastActivityAt: new Date().toISOString()
  }));

  return true;
}

async function cleanupPrivateRooms(client) {
  const guilds = [...client.guilds.cache.values()];

  for (const guild of guilds) {
    const settings = getPrivateRoomSettings(guild.id);
    const rooms = listPrivateRooms(guild.id);

    for (const room of rooms) {
      const channel = guild.channels.cache.get(room.channelId)
        || await guild.channels.fetch(room.channelId).catch(() => null);

      if (!channel) {
        deletePrivateRoom(guild.id, room.channelId);
        continue;
      }

      const member = guild.members.cache.get(room.ownerId)
        || await guild.members.fetch(room.ownerId).catch(() => null);

      if (!member || member.user.bot || getMemberLevelInfo(guild.id, room.ownerId).level < PRIVATE_ROOM_ACCESS_LEVEL) {
        await closePrivateRoom(guild, room, "Private room access expired");
        continue;
      }

      const expiresAt = new Date(room.expiresAt).getTime();
      const lastActivityAt = new Date(room.lastActivityAt || room.createdAt).getTime();
      const now = Date.now();
      const expired = Number.isFinite(expiresAt) && expiresAt <= now;
      const idleExpired = Number.isFinite(lastActivityAt)
        && (lastActivityAt + (settings.idleHours * 60 * 60 * 1000)) <= now;

      if (expired || idleExpired) {
        await closePrivateRoom(guild, room, expired ? "Private room lifespan expired" : "Private room idle cleanup");
      }
    }
  }
}

function startPrivateRoomScheduler(client) {
  if (client.privateRoomScheduler) {
    return;
  }

  const run = async () => {
    await cleanupPrivateRooms(client);
  };

  run().catch((error) => {
    console.error("Initial private room cleanup failed:", error);
  });

  client.privateRoomScheduler = setInterval(() => {
    run().catch((error) => {
      console.error("Scheduled private room cleanup failed:", error);
    });
  }, 10 * 60 * 1000);

  if (typeof client.privateRoomScheduler.unref === "function") {
    client.privateRoomScheduler.unref();
  }
}

function handleDeletedPrivateRoom(channel) {
  if (!channel?.guildId || !channel?.id) {
    return;
  }

  if (getPrivateRoom(channel.guildId, channel.id)) {
    deletePrivateRoom(channel.guildId, channel.id);
  }
}

module.exports = {
  PRIVATE_ROOM_ACCESS_LEVEL,
  PRIVATE_ROOM_CREATE_BUTTON_ID,
  PRIVATE_ROOM_STATUS_BUTTON_ID,
  createPrivateRoom,
  ensurePrivateRoomAccess,
  extendOwnedPrivateRoom,
  handlePrivateRoomButton,
  handleDeletedPrivateRoom,
  hasPrivateRoomAdminPermission,
  inviteToPrivateRoom,
  isPrivateRoomChannel,
  removeFromPrivateRoom,
  sendPrivateRoomPanel,
  setPrivateRoomCategory,
  showPrivateRoomAdminStatus,
  showPrivateRoomStatus,
  startPrivateRoomScheduler,
  touchPrivateRoomActivity,
  closeOwnedPrivateRoom
};
