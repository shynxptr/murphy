const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const {
  deleteRoom,
  findRoomByOwner,
  getRoom,
  listRooms,
  upsertRoom
} = require("../../services/tempVoiceStore");

const DEFAULT_TEMP_VOICE_SETTINGS = {
  creatorChannelId: "",
  panelChannelId: "",
  categoryId: "",
  anchorChannelId: "1483842795704680549",
  temporaryResponseSeconds: 90
};

const TEMP_VOICE_PANEL_IMAGE_PATH = path.join(__dirname, "..", "..", "..", "assets", "temp-voice", "panel.png");
const TEMP_VOICE_PANEL_IMAGE_NAME = "murphy-temp-voice-panel.png";
const tempVoicePanelRefreshes = new Map();

const TEMP_VOICE_BUTTON_PREFIX = "tv";
const TEMP_VOICE_MODAL_PREFIX = "tv-modal";
const TEMP_VOICE_SELECT_PREFIX = "tv-select";
const TEMP_VOICE_TEXT_INPUT_ID = "tv_text_value";
const TEMP_VOICE_USER_INPUT_ID = "tv_user_value";

const TEMP_VOICE_MEMBER_ACTIONS = new Set([
  "trust",
  "untrust",
  "invite",
  "kick",
  "block",
  "unblock",
  "transfer"
]);

const TEMP_VOICE_CUSTOM_EMOJIS = {
  name: "tv_name",
  limit: "tv_limit",
  privacy: "tv_privacy",
  waiting: "tv_waiting",
  chat: "tv_chat",
  trust: "tv_trust",
  untrust: "tv_untrust",
  invite: "tv_invite",
  kick: "tv_kick",
  region: "tv_region",
  block: "tv_block",
  unblock: "tv_unblock",
  claim: "tv_claim",
  transfer: "tv_transfer",
  delete: "tv_delete"
};

const TEMP_VOICE_FALLBACK_EMOJIS = {
  name: "✏️",
  limit: "👥",
  privacy: "🛡️",
  waiting: "🕰️",
  chat: "💬",
  trust: "➕",
  untrust: "➖",
  invite: "📞",
  kick: "🚪",
  region: "🌐",
  block: "⛔",
  unblock: "♻️",
  claim: "👑",
  transfer: "🔁",
  delete: "🗑️"
};

const REGION_OPTIONS = [
  { label: "Automatic", value: "auto", description: "Biarkan Discord memilih region terbaik." },
  { label: "Singapore", value: "singapore", description: "Cocok untuk Asia Tenggara." },
  { label: "Japan", value: "japan", description: "Region Tokyo/Jepang." },
  { label: "India", value: "india", description: "Region India." },
  { label: "Rotterdam", value: "rotterdam", description: "Region Eropa Barat." },
  { label: "US Central", value: "us-central", description: "Region US Central." }
];

function getTempVoiceSettings(guildId, client) {
  const settings = getGuildSettings(guildId, {
    tempVoice: client?.config?.tempVoice || DEFAULT_TEMP_VOICE_SETTINGS
  }).tempVoice;

  return {
    ...DEFAULT_TEMP_VOICE_SETTINGS,
    ...settings
  };
}

function updateTempVoiceSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const currentSettings = {
      ...DEFAULT_TEMP_VOICE_SETTINGS,
      ...(current.tempVoice || {})
    };
    const nextSettings = updater(currentSettings);

    return {
      ...current,
      tempVoice: {
        ...DEFAULT_TEMP_VOICE_SETTINGS,
        ...nextSettings
      }
    };
  });
}

function setTempVoiceCreatorChannel(guildId, channelId) {
  return updateTempVoiceSettings(guildId, (current) => ({
    ...current,
    creatorChannelId: channelId
  }));
}

function setTempVoicePanelChannel(guildId, channelId) {
  return updateTempVoiceSettings(guildId, (current) => ({
    ...current,
    panelChannelId: channelId
  }));
}

function setTempVoiceCategory(guildId, categoryId) {
  return updateTempVoiceSettings(guildId, (current) => ({
    ...current,
    categoryId
  }));
}

function setTempVoiceAnchorChannel(guildId, channelId) {
  return updateTempVoiceSettings(guildId, (current) => ({
    ...current,
    anchorChannelId: channelId
  }));
}

function getTemporaryResponseSeconds(settings) {
  const value = Number.parseInt(String(settings.temporaryResponseSeconds || DEFAULT_TEMP_VOICE_SETTINGS.temporaryResponseSeconds), 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TEMP_VOICE_SETTINGS.temporaryResponseSeconds;
}

async function replyWithTemporaryMessage(message, payload, client, secondsOverride) {
  const settings = getTempVoiceSettings(message.guild.id, client);
  const seconds = secondsOverride || getTemporaryResponseSeconds(settings);
  const replyPayload = typeof payload === "string" ? { content: payload } : payload;
  const sentMessage = await message.reply(replyPayload).catch(() => null);

  if (sentMessage) {
    setTimeout(() => {
      sentMessage.delete().catch(() => null);
    }, seconds * 1000);
  }

  return sentMessage;
}

async function sendShortLivedChannelMessage(channel, payload, seconds = 30) {
  if (!channel?.isTextBased?.() || !channel.send) {
    return null;
  }

  const sentMessage = await channel.send(typeof payload === "string" ? { content: payload } : payload).catch(() => null);

  if (sentMessage) {
    setTimeout(() => {
      sentMessage.delete().catch(() => null);
    }, seconds * 1000);
  }

  return sentMessage;
}

function normalizeIdList(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

function extractId(value) {
  return value ? value.replace(/[<@!#&>]/g, "").trim() : "";
}

function sanitizeDisplayName(value, fallback = "guest") {
  return (value || fallback).replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

function buildDefaultRoomName(member) {
  const baseName = sanitizeDisplayName(member.displayName || member.user.globalName || member.user.username);
  return `✦ ${baseName}'s Channel`;
}

function slugifyChannelName(value, fallback = "voice-room") {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (slug || fallback).slice(0, 90);
}

function buildChatChannelName(voiceChannelName) {
  return `chat-${slugifyChannelName(voiceChannelName, "temp-room")}`;
}

function isTempVoiceRoomManagedBy(member, room) {
  return Boolean(member)
    && (
      member.id === room.ownerId
      || member.permissions.has(PermissionFlagsBits.Administrator)
      || member.permissions.has(PermissionFlagsBits.ManageChannels)
    );
}

function canClaimTempVoiceRoom(member, voiceChannel, room) {
  if (!member || member.user.bot || member.id === room.ownerId) {
    return false;
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return true;
  }

  if (member.voice.channelId !== room.channelId) {
    return false;
  }

  return !voiceChannel?.members?.has(room.ownerId);
}

function createOverwrite(id, options = {}) {
  return {
    id,
    allow: options.allow || [],
    deny: options.deny || []
  };
}

function buildVoicePermissionOverwrites(guild, room) {
  const overwrites = [
    createOverwrite(guild.roles.everyone.id, room.isPrivate
      ? {
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
      }
      : room.waitingRoomEnabled
        ? {
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.Connect]
        }
        : {
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
        }
    ),
    createOverwrite(room.ownerId, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    })
  ];

  if (guild.members.me) {
    overwrites.push(createOverwrite(guild.members.me.id, {
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.MoveMembers
      ]
    }));
  }

  for (const userId of normalizeIdList(room.blockedUserIds)) {
    if (userId === room.ownerId) {
      continue;
    }

    overwrites.push(createOverwrite(userId, {
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
    }));
  }

  for (const userId of normalizeIdList([...room.trustedUserIds, ...room.invitedUserIds])) {
    if (userId === room.ownerId || room.blockedUserIds.includes(userId)) {
      continue;
    }

    overwrites.push(createOverwrite(userId, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    }));
  }

  return overwrites;
}

function buildTextPermissionOverwrites(guild, room) {
  const everyoneOverwrite = room.isPrivate || room.waitingRoomEnabled
    ? createOverwrite(guild.roles.everyone.id, {
      deny: [PermissionFlagsBits.ViewChannel]
    })
    : createOverwrite(guild.roles.everyone.id, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });

  const overwrites = [
    everyoneOverwrite,
    createOverwrite(room.ownerId, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    })
  ];

  if (guild.members.me) {
    overwrites.push(createOverwrite(guild.members.me.id, {
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles
      ]
    }));
  }

  for (const userId of normalizeIdList(room.blockedUserIds)) {
    if (userId === room.ownerId) {
      continue;
    }

    overwrites.push(createOverwrite(userId, {
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    }));
  }

  for (const userId of normalizeIdList([...room.trustedUserIds, ...room.invitedUserIds])) {
    if (userId === room.ownerId || room.blockedUserIds.includes(userId)) {
      continue;
    }

    overwrites.push(createOverwrite(userId, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    }));
  }

  return overwrites;
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) {
    return null;
  }

  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function resolvePanelChannel(guild, settings) {
  const channel = await resolveGuildChannel(guild, settings.panelChannelId);
  return channel?.isTextBased?.() && channel.messages ? channel : null;
}

async function resolveAnchorChannel(guild, settings) {
  return settings.anchorChannelId ? resolveGuildChannel(guild, settings.anchorChannelId) : null;
}

async function placeChannelAboveAnchor(guild, voiceChannel, anchorChannel) {
  if (!voiceChannel || !anchorChannel || voiceChannel.parentId !== anchorChannel.parentId) {
    return false;
  }

  const siblingChannels = [...guild.channels.cache.values()]
    .filter((channel) =>
      channel.parentId === anchorChannel.parentId
      && channel.type === anchorChannel.type
    )
    .sort((left, right) => left.rawPosition - right.rawPosition);

  const availablePositions = siblingChannels
    .map((channel) => channel.rawPosition)
    .sort((left, right) => left - right);

  const reordered = [];
  let inserted = false;

  for (const channel of siblingChannels) {
    if (channel.id === voiceChannel.id) {
      continue;
    }

    if (channel.id === anchorChannel.id && !inserted) {
      reordered.push(voiceChannel);
      inserted = true;
    }

    reordered.push(channel);
  }

  if (!inserted) {
    reordered.push(voiceChannel);
  }

  if (typeof guild.channels?.setPositions === "function") {
    const updates = reordered.map((channel, index) => ({
      channel: channel.id,
      position: availablePositions[index] ?? channel.rawPosition
    }));

    await guild.channels.setPositions(updates).catch(() => null);
    return true;
  }

  if (typeof voiceChannel.setPosition === "function") {
    await voiceChannel.setPosition(anchorChannel.rawPosition).catch(() => null);
    return true;
  }

  return false;
}

async function resolveManagedRoom(guild, room) {
  const voiceChannel = await resolveGuildChannel(guild, room.channelId);
  const textChannel = room.textChannelId ? await resolveGuildChannel(guild, room.textChannelId) : null;
  return { voiceChannel, textChannel };
}

function getGuildIconUrl(guild) {
  return guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 256
  }) || null;
}

function resolveCustomEmoji(guild, key) {
  const emojiName = TEMP_VOICE_CUSTOM_EMOJIS[key];
  const fallback = TEMP_VOICE_FALLBACK_EMOJIS[key];

  if (!emojiName) {
    return fallback;
  }

  const emoji = guild.emojis.cache.find((entry) => entry.name === emojiName)
    || guild.client.emojis?.cache?.find((entry) => entry.name === emojiName);

  if (!emoji) {
    return fallback;
  }

  return {
    id: emoji.id,
    name: emoji.name,
    animated: emoji.animated
  };
}

function describePrivacy(room) {
  return room.isPrivate ? "`Private`" : "`Public`";
}

function describeWaitingRoom(room) {
  return room.waitingRoomEnabled ? "`On`" : "`Off`";
}

function describeLimit(room) {
  return room.userLimit > 0 ? `**${room.userLimit}**` : "`Unlimited`";
}

function describeRegion(room) {
  if (!room.region) {
    return "`Automatic`";
  }

  const option = REGION_OPTIONS.find((entry) => entry.value === room.region);
  return option ? `\`${option.label}\`` : `\`${room.region}\``;
}

function buildTempVoicePanelEmbed(guild, room, voiceChannel, textChannel) {
  const embed = new EmbedBuilder()
    .setColor("#ec4899")
    .setTitle("TempVoice Room Interface")
    .setDescription([
      "This interface is linked to your active temporary voice room.",
      "Use the icon buttons below to control your personal room.",
      "",
      `Owner: <@${room.ownerId}> • Room: ${voiceChannel ? `${voiceChannel}` : "`Room deleted`"}`,
      `Limit: ${describeLimit(room)} • Privacy: ${describePrivacy(room)} • Waiting: ${describeWaitingRoom(room)}`,
      `Chat: ${textChannel ? `${textChannel}` : "`Off`"} • Region: ${describeRegion(room)}`,
      `Trusted: **${normalizeIdList(room.trustedUserIds).length}** • Blocked: **${normalizeIdList(room.blockedUserIds).length}**`
    ].join("\n"))
    .setFooter({
      text: "Press the buttons below to use the interface",
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();

  if (fs.existsSync(TEMP_VOICE_PANEL_IMAGE_PATH)) {
    embed.setImage(`attachment://${TEMP_VOICE_PANEL_IMAGE_NAME}`);
  }

  return embed;
}

function buildUniversalTempVoiceEmbed(guild, settings) {
  const creatorMention = settings.creatorChannelId ? `<#${settings.creatorChannelId}>` : "`creator channel belum diset`";
  const panelMention = settings.panelChannelId ? `<#${settings.panelChannelId}>` : "`panel channel belum diset`";
  const anchorMention = settings.anchorChannelId ? `<#${settings.anchorChannelId}>` : "`anchor channel belum diset`";
  const embed = new EmbedBuilder()
    .setColor("#ec4899")
    .setTitle("TempVoice Interface")
    .setDescription([
      "This interface can be used to manage temporary voice channels.",
      "Join the creator voice channel to create your own temporary voice room.",
      "",
      `Creator Channel: ${creatorMention}`,
      `Control Panel Channel: ${panelMention}`,
      `Anchor Channel: ${anchorMention}`,
      "",
      "Saat room berhasil dibuat, bot akan otomatis mengirim interface kontrol aktif langsung ke chat voice room tersebut."
    ].join("\n"))
    .setFooter({
      text: "Murphy | Temp Voice universal interface",
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();

  if (fs.existsSync(TEMP_VOICE_PANEL_IMAGE_PATH)) {
    embed.setImage(`attachment://${TEMP_VOICE_PANEL_IMAGE_NAME}`);
  }

  return embed;
}

function createPanelAttachment() {
  if (!fs.existsSync(TEMP_VOICE_PANEL_IMAGE_PATH)) {
    return null;
  }

  return new AttachmentBuilder(TEMP_VOICE_PANEL_IMAGE_PATH).setName(TEMP_VOICE_PANEL_IMAGE_NAME);
}

function createIconButton(guild, key, roomId, style = ButtonStyle.Secondary, options = {}) {
  return new ButtonBuilder()
    .setCustomId(`${TEMP_VOICE_BUTTON_PREFIX}:${key}:${roomId}`)
    .setStyle(style)
    .setEmoji(resolveCustomEmoji(guild, key))
    .setDisabled(Boolean(options.disabled));
}

function buildTempVoicePanelComponents(guild, room, voiceChannel, textChannel) {
  const ownerPresent = voiceChannel?.members?.has(room.ownerId);

  return [
    new ActionRowBuilder().addComponents(
      createIconButton(guild, "name", room.channelId),
      createIconButton(guild, "limit", room.channelId),
      createIconButton(guild, "privacy", room.channelId, room.isPrivate ? ButtonStyle.Danger : ButtonStyle.Success),
      createIconButton(guild, "waiting", room.channelId, room.waitingRoomEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
      createIconButton(guild, "chat", room.channelId, textChannel ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      createIconButton(guild, "trust", room.channelId),
      createIconButton(guild, "untrust", room.channelId),
      createIconButton(guild, "invite", room.channelId),
      createIconButton(guild, "kick", room.channelId, ButtonStyle.Danger),
      createIconButton(guild, "region", room.channelId)
    ),
    new ActionRowBuilder().addComponents(
      createIconButton(guild, "block", room.channelId, ButtonStyle.Danger),
      createIconButton(guild, "unblock", room.channelId),
      createIconButton(guild, "claim", room.channelId, ButtonStyle.Success, { disabled: ownerPresent }),
      createIconButton(guild, "transfer", room.channelId, ButtonStyle.Primary),
      createIconButton(guild, "delete", room.channelId, ButtonStyle.Danger)
    )
  ];
}

async function upsertTempVoicePanel(guild, client, room) {
  const refreshKey = `${guild.id}:${room.channelId}`;

  if (tempVoicePanelRefreshes.has(refreshKey)) {
    return tempVoicePanelRefreshes.get(refreshKey);
  }

  const refreshPromise = (async () => {
    const settings = getTempVoiceSettings(guild.id, client);
    const latestRoom = getRoom(guild.id, room.channelId) || room;
    const { voiceChannel, textChannel } = await resolveManagedRoom(guild, latestRoom);

    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      return null;
    }

    const panelChannel = voiceChannel?.isTextBased?.() && voiceChannel.messages
      ? voiceChannel
      : await resolvePanelChannel(guild, settings);

    if (!panelChannel) {
      return null;
    }

    const payload = {
      embeds: [buildTempVoicePanelEmbed(guild, latestRoom, voiceChannel, textChannel)],
      components: buildTempVoicePanelComponents(guild, latestRoom, voiceChannel, textChannel)
    };
    const attachment = createPanelAttachment();

    if (attachment) {
      payload.files = [attachment];
    }

    let panelMessage = null;

    if (latestRoom.panelMessageId && latestRoom.panelChannelId) {
      const previousChannel = await resolveGuildChannel(guild, latestRoom.panelChannelId);
      panelMessage = previousChannel?.messages
        ? await previousChannel.messages.fetch(latestRoom.panelMessageId).catch(() => null)
        : null;
    }

    if (panelMessage && panelMessage.channelId === panelChannel.id) {
      await panelMessage.edit(payload).catch(() => null);
    } else {
      panelMessage = await panelChannel.send(payload).catch(() => null);
    }

    if (!panelMessage) {
      return null;
    }

    return upsertRoom(guild.id, latestRoom.channelId, (current) => ({
      ...current,
      panelChannelId: panelChannel.id,
      panelMessageId: panelMessage.id
    }));
  })().finally(() => {
    tempVoicePanelRefreshes.delete(refreshKey);
  });

  tempVoicePanelRefreshes.set(refreshKey, refreshPromise);
  return refreshPromise;
}

async function sendUniversalTempVoiceInterface(channel, client) {
  if (!channel?.guild || !channel?.isTextBased?.() || !channel.send) {
    return null;
  }

  const settings = getTempVoiceSettings(channel.guild.id, client);
  const payload = {
    embeds: [buildUniversalTempVoiceEmbed(channel.guild, settings)]
  };
  const attachment = createPanelAttachment();

  if (attachment) {
    payload.files = [attachment];
  }

  return channel.send(payload).catch(() => null);
}

async function deleteTempVoicePanel(guild, room) {
  if (!room.panelChannelId || !room.panelMessageId) {
    return;
  }

  const panelChannel = await resolveGuildChannel(guild, room.panelChannelId);

  if (!panelChannel?.messages) {
    return;
  }

  const panelMessage = await panelChannel.messages.fetch(room.panelMessageId).catch(() => null);
  await panelMessage?.delete().catch(() => null);
}

async function applyTempVoiceChannelState(guild, room) {
  const { voiceChannel, textChannel } = await resolveManagedRoom(guild, room);

  if (voiceChannel?.type === ChannelType.GuildVoice) {
    await voiceChannel.edit({
      userLimit: room.userLimit > 0 ? room.userLimit : 0,
      rtcRegion: room.region || null,
      permissionOverwrites: buildVoicePermissionOverwrites(guild, room)
    }).catch(() => null);
  }

  if (textChannel?.type === ChannelType.GuildText) {
    await textChannel.edit({
      name: buildChatChannelName(voiceChannel?.name || "temp-room"),
      permissionOverwrites: buildTextPermissionOverwrites(guild, room)
    }).catch(() => null);
  }

  return { voiceChannel, textChannel };
}

async function createCompanionTextChannel(guild, room, client) {
  const settings = getTempVoiceSettings(guild.id, client);
  const voiceChannel = await resolveGuildChannel(guild, room.channelId);

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    return null;
  }

  const parentId = voiceChannel.parentId || settings.categoryId || null;
  const textChannel = await guild.channels.create({
    name: buildChatChannelName(voiceChannel.name),
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    permissionOverwrites: buildTextPermissionOverwrites(guild, room)
  }).catch(() => null);

  if (!textChannel) {
    return null;
  }

  return upsertRoom(guild.id, room.channelId, (current) => ({
    ...current,
    textChannelId: textChannel.id
  }));
}

async function deleteCompanionTextChannel(guild, room) {
  if (!room.textChannelId) {
    return room;
  }

  const textChannel = await resolveGuildChannel(guild, room.textChannelId);
  await textChannel?.delete("Temp Voice chat disabled").catch(() => null);

  return upsertRoom(guild.id, room.channelId, (current) => ({
    ...current,
    textChannelId: ""
  }));
}

async function cleanupStaleRoom(guild, room) {
  const { voiceChannel, textChannel } = await resolveManagedRoom(guild, room);

  if (!voiceChannel) {
    if (textChannel?.deletable) {
      await textChannel.delete("Cleaning stale Temp Voice text channel").catch(() => null);
    }

    await deleteTempVoicePanel(guild, room);
    deleteRoom(guild.id, room.channelId);
    return null;
  }

  if (room.textChannelId && !textChannel) {
    return upsertRoom(guild.id, room.channelId, (current) => ({
      ...current,
      textChannelId: ""
    }));
  }

  return room;
}

async function removeTempVoiceRoom(guild, room, reason = "Temp Voice room removed") {
  await deleteTempVoicePanel(guild, room);

  if (room.textChannelId) {
    const textChannel = await resolveGuildChannel(guild, room.textChannelId);
    await textChannel?.delete(reason).catch(() => null);
  }

  const voiceChannel = await resolveGuildChannel(guild, room.channelId);
  await voiceChannel?.delete(reason).catch(() => null);

  deleteRoom(guild.id, room.channelId);
  return true;
}

async function syncTempVoiceRoomsForGuild(guild, client) {
  const rooms = listRooms(guild.id);

  for (const room of rooms) {
    const cleanedRoom = await cleanupStaleRoom(guild, room);

    if (!cleanedRoom) {
      continue;
    }

    const { voiceChannel } = await resolveManagedRoom(guild, cleanedRoom);

    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      continue;
    }

    if (voiceChannel.members.size === 0) {
      await removeTempVoiceRoom(guild, cleanedRoom, "Empty Temp Voice room cleanup").catch(() => null);
      continue;
    }

    await applyTempVoiceChannelState(guild, cleanedRoom).catch(() => null);
    await upsertTempVoicePanel(guild, client, cleanedRoom).catch(() => null);
  }
}

async function bootstrapTempVoiceRooms(client) {
  const guilds = [...client.guilds.cache.values()];

  await Promise.allSettled(guilds.map(async (guild) => {
    try {
      await syncTempVoiceRoomsForGuild(guild, client);
    } catch (error) {
      console.error(`Failed to bootstrap temp voice for guild ${guild.id}:`, error);
    }
  }));
}

async function createTempVoiceRoomForMember(member, client) {
  const settings = getTempVoiceSettings(member.guild.id, client);

  if (!settings.creatorChannelId) {
    return null;
  }

  const creatorChannel = await resolveGuildChannel(member.guild, settings.creatorChannelId);

  if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) {
    return null;
  }

  const anchorChannel = await resolveAnchorChannel(member.guild, settings);

  const existingRoom = findRoomByOwner(member.guild.id, member.id);

  if (existingRoom) {
    const existingChannel = await resolveGuildChannel(member.guild, existingRoom.channelId);

    if (existingChannel?.type === ChannelType.GuildVoice) {
      await member.voice.setChannel(existingChannel).catch(() => null);
      await upsertTempVoicePanel(member.guild, client, existingRoom).catch(() => null);
      return existingRoom;
    }

    deleteRoom(member.guild.id, existingRoom.channelId);
  }

  const parentId = anchorChannel?.parentId || settings.categoryId || creatorChannel.parentId || null;
  const roomName = buildDefaultRoomName(member);
  const initialRoom = {
    guildId: member.guild.id,
    channelId: "",
    ownerId: member.id,
    creatorChannelId: creatorChannel.id,
    panelChannelId: settings.panelChannelId || "",
    panelMessageId: "",
    textChannelId: "",
    trustedUserIds: [],
    invitedUserIds: [],
    blockedUserIds: [],
    isPrivate: false,
    waitingRoomEnabled: false,
    userLimit: 0,
    region: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const voiceChannel = await member.guild.channels.create({
    name: roomName,
    type: ChannelType.GuildVoice,
    parent: parentId || undefined,
    permissionOverwrites: buildVoicePermissionOverwrites(member.guild, {
      ...initialRoom,
      channelId: "pending"
    })
  }).catch(() => null);

  if (!voiceChannel) {
    return null;
  }

  const room = upsertRoom(member.guild.id, voiceChannel.id, () => ({
    ...initialRoom,
    channelId: voiceChannel.id
  }));

  await placeChannelAboveAnchor(member.guild, voiceChannel, anchorChannel);

  await member.voice.setChannel(voiceChannel).catch(() => null);
  await upsertTempVoicePanel(member.guild, client, room).catch(() => null);

  return room;
}

async function maybeDeleteEmptyTempRoom(guild, client, channelId) {
  const room = getRoom(guild.id, channelId);

  if (!room) {
    return false;
  }

  const voiceChannel = await resolveGuildChannel(guild, channelId);

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice || voiceChannel.members.size === 0) {
    await removeTempVoiceRoom(guild, room, "Temp Voice room is empty").catch(() => null);
    return true;
  }

  await upsertTempVoicePanel(guild, client, room).catch(() => null);
  return false;
}

async function handleTempVoiceStateUpdate(oldState, newState, client) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;

  if (!guild || !member || member.user.bot) {
    return false;
  }

  const settings = getTempVoiceSettings(guild.id, client);
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const oldRoom = oldChannelId ? getRoom(guild.id, oldChannelId) : null;
  const newRoom = newChannelId ? getRoom(guild.id, newChannelId) : null;

  if (settings.creatorChannelId && newChannelId === settings.creatorChannelId) {
    await createTempVoiceRoomForMember(member, client).catch((error) => {
      console.error(`Failed to create Temp Voice room for ${member.id}:`, error);
    });
  }

  if (oldRoom) {
    await maybeDeleteEmptyTempRoom(guild, client, oldChannelId).catch(() => null);
  }

  if (newRoom) {
    await upsertTempVoicePanel(guild, client, newRoom).catch(() => null);
  }

  return Boolean((settings.creatorChannelId && newChannelId === settings.creatorChannelId) || oldRoom || newRoom);
}

function buildTextValueModal(roomId, action, title, label, placeholder, maxLength = 90) {
  return new ModalBuilder()
    .setCustomId(`${TEMP_VOICE_MODAL_PREFIX}:${action}:${roomId}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(TEMP_VOICE_TEXT_INPUT_ID)
          .setLabel(label)
          .setPlaceholder(placeholder)
          .setRequired(true)
          .setMaxLength(maxLength)
          .setStyle(TextInputStyle.Short)
      )
    );
}

function buildUserValueModal(roomId, action, title, label) {
  return new ModalBuilder()
    .setCustomId(`${TEMP_VOICE_MODAL_PREFIX}:${action}:${roomId}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(TEMP_VOICE_USER_INPUT_ID)
          .setLabel(label)
          .setPlaceholder("Mention user atau masukkan ID user")
          .setRequired(true)
          .setMaxLength(40)
          .setStyle(TextInputStyle.Short)
      )
    );
}

async function resolveRoomForInteraction(interaction, roomId) {
  const room = getRoom(interaction.guildId, roomId);

  if (!room) {
    return { ok: false, reason: "Temp Voice room ini sudah tidak aktif." };
  }

  const voiceChannel = await resolveGuildChannel(interaction.guild, room.channelId);

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    deleteRoom(interaction.guildId, room.channelId);
    return { ok: false, reason: "Voice room ini sudah tidak ditemukan." };
  }

  return { ok: true, room, voiceChannel };
}

async function resolveTargetMemberFromInput(guild, value) {
  const memberId = extractId(value);

  if (!memberId) {
    return null;
  }

  return guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
}

async function refreshRoomStateAndPanel(guild, client, room) {
  const normalizedRoom = await cleanupStaleRoom(guild, room);

  if (!normalizedRoom) {
    return room;
  }

  await applyTempVoiceChannelState(guild, normalizedRoom).catch(() => null);
  return upsertTempVoicePanel(guild, client, normalizedRoom).catch(() => normalizedRoom);
}

function respondEphemeral(interaction, content) {
  return interaction.reply({
    content,
    ephemeral: true
  }).catch(() => null);
}

function buildDeleteConfirmationComponents(guild, roomId) {
  return [
    new ActionRowBuilder().addComponents(
      createIconButton(guild, "delete", roomId, ButtonStyle.Danger)
        .setCustomId(`${TEMP_VOICE_BUTTON_PREFIX}:deleteconfirm:${roomId}`),
      new ButtonBuilder()
        .setCustomId(`${TEMP_VOICE_BUTTON_PREFIX}:deletecancel:${roomId}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("↩️")
    )
  ];
}

async function handlePrivacyToggle(interaction, client, room) {
  const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
    ...current,
    isPrivate: !current.isPrivate
  }));

  await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
  await respondEphemeral(interaction, updatedRoom.isPrivate
    ? "Privacy room diaktifkan. Room sekarang private."
    : "Privacy room dimatikan. Room sekarang public.");
}

async function handleWaitingToggle(interaction, client, room) {
  const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
    ...current,
    waitingRoomEnabled: !current.waitingRoomEnabled
  }));

  await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
  await respondEphemeral(interaction, updatedRoom.waitingRoomEnabled
    ? "Waiting Room diaktifkan. Member umum harus di-trust/invite dulu untuk masuk."
    : "Waiting Room dimatikan.");
}

async function handleChatToggle(interaction, client, room) {
  const updatedRoom = room.textChannelId
    ? await deleteCompanionTextChannel(interaction.guild, room)
    : await createCompanionTextChannel(interaction.guild, room, client) || room;

  await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
  await respondEphemeral(interaction, updatedRoom.textChannelId
    ? "Chat room pendamping berhasil dibuat."
    : "Chat room pendamping berhasil dihapus.");
}

async function handleClaim(interaction, client, room, voiceChannel) {
  if (!canClaimTempVoiceRoom(interaction.member, voiceChannel, room)) {
    await respondEphemeral(interaction, "Kamu belum bisa claim room ini. Pastikan owner sudah tidak ada di room.");
    return;
  }

  const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
    ...current,
    ownerId: interaction.user.id,
    trustedUserIds: normalizeIdList(current.trustedUserIds.filter((userId) => userId !== interaction.user.id)),
    blockedUserIds: normalizeIdList(current.blockedUserIds.filter((userId) => userId !== interaction.user.id)),
    invitedUserIds: normalizeIdList(current.invitedUserIds.filter((userId) => userId !== interaction.user.id))
  }));

  await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
  await respondEphemeral(interaction, `Room berhasil di-claim. Kamu sekarang owner dari ${voiceChannel}.`);
}

async function handleRoomMemberAction(interaction, client, action, room, voiceChannel, targetMember) {
  if (!targetMember || targetMember.user.bot) {
    await respondEphemeral(interaction, "User target tidak valid untuk aksi Temp Voice ini.");
    return true;
  }

  if (targetMember.id === room.ownerId && action !== "transfer") {
    await respondEphemeral(interaction, "Owner room tidak bisa dijadikan target untuk aksi ini.");
    return true;
  }

  if ((action === "kick" || action === "transfer") && targetMember.voice.channelId !== room.channelId) {
    await respondEphemeral(interaction, "User target harus sedang ada di room ini.");
    return true;
  }

  const updateAndRefresh = async (updater, successMessage) => {
    const updatedRoom = upsertRoom(interaction.guildId, room.channelId, updater);
    await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
    await respondEphemeral(interaction, successMessage(targetMember));
    return true;
  };

  if (action === "trust") {
    return updateAndRefresh((current) => ({
      ...current,
      trustedUserIds: normalizeIdList([...current.trustedUserIds, targetMember.id]),
      blockedUserIds: normalizeIdList(current.blockedUserIds.filter((userId) => userId !== targetMember.id)),
      invitedUserIds: normalizeIdList(current.invitedUserIds.filter((userId) => userId !== targetMember.id))
    }), (member) => `${member} sekarang masuk trusted access untuk ${voiceChannel}.`);
  }

  if (action === "untrust") {
    return updateAndRefresh((current) => ({
      ...current,
      trustedUserIds: normalizeIdList(current.trustedUserIds.filter((userId) => userId !== targetMember.id)),
      invitedUserIds: normalizeIdList(current.invitedUserIds.filter((userId) => userId !== targetMember.id))
    }), (member) => `${member} sudah dihapus dari trusted access.`);
  }

  if (action === "invite") {
    const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
      ...current,
      invitedUserIds: normalizeIdList([...current.invitedUserIds, targetMember.id]),
      blockedUserIds: normalizeIdList(current.blockedUserIds.filter((userId) => userId !== targetMember.id))
    }));

    await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
    await sendShortLivedChannelMessage(interaction.channel, `${targetMember}, kamu diundang ke ${voiceChannel} oleh ${interaction.user}.`, 30);
    await respondEphemeral(interaction, `Invite untuk ${targetMember} berhasil dikirim.`);
    return true;
  }

  if (action === "kick") {
    await targetMember.voice.setChannel(null, `Kicked from Temp Voice by ${interaction.user.tag}`).catch(() => null);
    await respondEphemeral(interaction, `${targetMember} berhasil dikeluarkan dari ${voiceChannel}.`);
    return true;
  }

  if (action === "block") {
    const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
      ...current,
      blockedUserIds: normalizeIdList([...current.blockedUserIds, targetMember.id]),
      trustedUserIds: normalizeIdList(current.trustedUserIds.filter((userId) => userId !== targetMember.id)),
      invitedUserIds: normalizeIdList(current.invitedUserIds.filter((userId) => userId !== targetMember.id))
    }));

    await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);

    if (targetMember.voice.channelId === room.channelId) {
      await targetMember.voice.setChannel(null, `Blocked from Temp Voice by ${interaction.user.tag}`).catch(() => null);
    }

    await respondEphemeral(interaction, `${targetMember} berhasil diblok dari room ini.`);
    return true;
  }

  if (action === "unblock") {
    return updateAndRefresh((current) => ({
      ...current,
      blockedUserIds: normalizeIdList(current.blockedUserIds.filter((userId) => userId !== targetMember.id))
    }), (member) => `${member} sudah di-unblock dari room ini.`);
  }

  if (action === "transfer") {
    return updateAndRefresh((current) => ({
      ...current,
      ownerId: targetMember.id,
      trustedUserIds: normalizeIdList([...current.trustedUserIds, current.ownerId].filter((userId) => userId !== targetMember.id)),
      blockedUserIds: normalizeIdList(current.blockedUserIds.filter((userId) => userId !== targetMember.id)),
      invitedUserIds: normalizeIdList(current.invitedUserIds.filter((userId) => userId !== targetMember.id))
    }), (member) => `Ownership room berhasil dipindahkan ke ${member}.`);
  }

  return false;
}

async function handleRegionPicker(interaction, room) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${TEMP_VOICE_SELECT_PREFIX}:region:${room.channelId}`)
    .setPlaceholder("Pilih voice region")
    .addOptions(REGION_OPTIONS);

  await interaction.reply({
    content: "Pilih region untuk Temp Voice ini.",
    components: [new ActionRowBuilder().addComponents(selectMenu)],
    ephemeral: true
  }).catch(() => null);
}

async function handleTempVoiceButton(interaction, client) {
  if (!interaction.customId.startsWith(`${TEMP_VOICE_BUTTON_PREFIX}:`)) {
    return false;
  }

  const [, action, roomId] = interaction.customId.split(":");

  if (action === "deletecancel") {
    await interaction.update({
      content: "Hapus room dibatalkan.",
      embeds: [],
      components: []
    }).catch(() => null);
    return true;
  }

  const resolved = await resolveRoomForInteraction(interaction, roomId);

  if (!resolved.ok) {
    await respondEphemeral(interaction, resolved.reason);
    return true;
  }

  const { room, voiceChannel } = resolved;

  if (action === "claim") {
    await handleClaim(interaction, client, room, voiceChannel);
    return true;
  }

  if (!isTempVoiceRoomManagedBy(interaction.member, room)) {
    await respondEphemeral(interaction, "Hanya owner room atau admin yang bisa memakai kontrol ini.");
    return true;
  }

  if (action === "deleteconfirm") {
    await removeTempVoiceRoom(interaction.guild, room, "Temp Voice room deleted by owner");
    await interaction.update({
      content: "Temp Voice room berhasil dihapus.",
      embeds: [],
      components: []
    }).catch(() => null);
    return true;
  }

  if (action === "name") {
    await interaction.showModal(buildTextValueModal(room.channelId, action, "Rename Temp Voice", "Nama room baru", "Masukkan nama baru untuk voice room", 80));
    return true;
  }

  if (action === "limit") {
    await interaction.showModal(buildTextValueModal(room.channelId, action, "Set Limit Temp Voice", "Limit user (0-99)", "Masukkan 0 untuk unlimited", 2));
    return true;
  }

  if (TEMP_VOICE_MEMBER_ACTIONS.has(action)) {
    const titles = {
      trust: "Trust User",
      untrust: "Untrust User",
      invite: "Invite User",
      kick: "Kick User",
      block: "Block User",
      unblock: "Unblock User",
      transfer: "Transfer Owner"
    };

    await interaction.showModal(buildUserValueModal(room.channelId, action, titles[action], "Masukkan mention atau ID user"));
    return true;
  }

  if (action === "privacy") {
    await handlePrivacyToggle(interaction, client, room);
    return true;
  }

  if (action === "waiting") {
    await handleWaitingToggle(interaction, client, room);
    return true;
  }

  if (action === "chat") {
    await handleChatToggle(interaction, client, room);
    return true;
  }

  if (action === "region") {
    await handleRegionPicker(interaction, room);
    return true;
  }

  if (action === "delete") {
    await interaction.reply({
      content: `Yakin mau menghapus ${voiceChannel}?`,
      components: buildDeleteConfirmationComponents(interaction.guild, room.channelId),
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  return false;
}

async function handleTempVoiceModalSubmit(interaction, client) {
  if (!interaction.customId.startsWith(`${TEMP_VOICE_MODAL_PREFIX}:`)) {
    return false;
  }

  const [, action, roomId] = interaction.customId.split(":");
  const resolved = await resolveRoomForInteraction(interaction, roomId);

  if (!resolved.ok) {
    await respondEphemeral(interaction, resolved.reason);
    return true;
  }

  const { room, voiceChannel } = resolved;

  if (!isTempVoiceRoomManagedBy(interaction.member, room)) {
    await respondEphemeral(interaction, "Hanya owner room atau admin yang bisa memakai kontrol ini.");
    return true;
  }

  if (action === "name") {
    const newName = sanitizeDisplayName(interaction.fields.getTextInputValue(TEMP_VOICE_TEXT_INPUT_ID), "Temp Room");
    await voiceChannel.setName(newName).catch(() => null);
    await applyTempVoiceChannelState(interaction.guild, room);
    await upsertTempVoicePanel(interaction.guild, client, room);

    await interaction.reply({
      content: `Nama room berhasil diubah menjadi **${newName}**.`,
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (action === "limit") {
    const rawLimit = interaction.fields.getTextInputValue(TEMP_VOICE_TEXT_INPUT_ID).trim();
    const limit = Number.parseInt(rawLimit, 10);

    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await respondEphemeral(interaction, "Limit harus berupa angka antara 0 sampai 99.");
      return true;
    }

    const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
      ...current,
      userLimit: limit
    }));

    await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);
    await respondEphemeral(interaction, limit === 0 ? "Limit room diubah ke unlimited." : `Limit room diubah ke ${limit} user.`);
    return true;
  }

  if (TEMP_VOICE_MEMBER_ACTIONS.has(action)) {
    const rawValue = interaction.fields.getTextInputValue(TEMP_VOICE_USER_INPUT_ID);
    const targetMember = await resolveTargetMemberFromInput(interaction.guild, rawValue);
    await handleRoomMemberAction(interaction, client, action, room, voiceChannel, targetMember);
    return true;
  }

  return false;
}

async function handleTempVoiceSelectMenu(interaction, client) {
  if (!interaction.customId.startsWith(`${TEMP_VOICE_SELECT_PREFIX}:`)) {
    return false;
  }

  const [, action, roomId] = interaction.customId.split(":");

  if (action !== "region") {
    return false;
  }

  const resolved = await resolveRoomForInteraction(interaction, roomId);

  if (!resolved.ok) {
    await respondEphemeral(interaction, resolved.reason);
    return true;
  }

  const { room } = resolved;

  if (!isTempVoiceRoomManagedBy(interaction.member, room)) {
    await respondEphemeral(interaction, "Hanya owner room atau admin yang bisa memakai kontrol ini.");
    return true;
  }

  const selectedRegion = interaction.values[0] === "auto" ? "" : interaction.values[0];
  const updatedRoom = upsertRoom(interaction.guildId, room.channelId, (current) => ({
    ...current,
    region: selectedRegion
  }));

  await refreshRoomStateAndPanel(interaction.guild, client, updatedRoom);

  const selectedLabel = REGION_OPTIONS.find((entry) => entry.value === interaction.values[0])?.label || "Automatic";
  await interaction.update({
    content: `Voice region berhasil diubah ke **${selectedLabel}**.`,
    components: []
  }).catch(() => null);
  return true;
}

module.exports = {
  DEFAULT_TEMP_VOICE_SETTINGS,
  bootstrapTempVoiceRooms,
  getTempVoiceSettings,
  handleTempVoiceButton,
  handleTempVoiceModalSubmit,
  handleTempVoiceSelectMenu,
  handleTempVoiceStateUpdate,
  replyWithTemporaryMessage,
  sendUniversalTempVoiceInterface,
  setTempVoiceAnchorChannel,
  setTempVoiceCategory,
  setTempVoiceCreatorChannel,
  setTempVoicePanelChannel,
  syncTempVoiceRoomsForGuild
};
