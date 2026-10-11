const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const {
  deletePair,
  getPair,
  listPairs,
  upsertPair
} = require("../../services/streakStore");
const { createStreakNotificationCard } = require("./streakCard");
const { createStreakInfoCard } = require("./streakInfoCard");
const { createStreakTopBoardCard } = require("./streakTopBoardCard");
const { awardStreakXp } = require("../levels/levelSystem");
const streakTopBoardRefreshes = new Map();
const PENDING_STREAK_EMOJI = "❓";

const STREAK_TIERS = [
  { key: "ember", min: 1, max: 6, emojiId: "1483769703536001104", assetFile: "ember.png", label: "Ember" },
  { key: "blaze", min: 7, max: 24, emojiId: "1483769754517897327", assetFile: "blaze.png", label: "Blaze" },
  { key: "flare", min: 25, max: 49, emojiId: "1483769803650109511", assetFile: "flare.png", label: "Flare" },
  { key: "goldfire", min: 50, max: 99, emojiId: "1483769898680193095", assetFile: "goldfire.png", label: "Goldfire" },
  { key: "bluefire", min: 100, max: 149, emojiId: "1483769934399012894", assetFile: "bluefire.png", label: "Bluefire" },
  { key: "sapphire", min: 150, max: 249, emojiId: "1483769985284313098", assetFile: "sapphire.png", label: "Sapphire" },
  { key: "soulfire", min: 250, max: 364, emojiId: "1483770037243220110", assetFile: "soulfire.png", label: "Soulfire" },
  { key: "eternal", min: 365, max: 499, emojiId: "1483770088644415619", assetFile: "eternal.png", label: "Eternal" },
  { key: "mythic", min: 500, max: Number.POSITIVE_INFINITY, emojiId: "1483770151412305922", assetFile: "mythic.png", label: "Mythic" }
];

const DEFAULT_STREAK_SETTINGS = {
  channelId: "",
  botChannelId: "",
  notificationChannelId: "",
  rewardRoleId: "1483797982720561292",
  topChannelId: "",
  topMessageId: "",
  topLastUpdatedDate: "",
  topLastUpdatedHour: "",
  temporaryResponseSeconds: 90,
  timezone: "Asia/Jakarta"
};
const TIER_COLORS = {
  ember: "#f97316",
  blaze: "#fb923c",
  flare: "#f43f5e",
  goldfire: "#f59e0b",
  bluefire: "#38bdf8",
  sapphire: "#2563eb",
  soulfire: "#7c3aed",
  eternal: "#a855f7",
  mythic: "#ec4899"
};
const GENERAL_STREAK_LINES = [
  "udah bareng {count} streak nonstop! Kalian luar biasa!",
  "{count} hari nyala terus, jangan padam ya!",
  "streak {count} hari sudah jalan, pertahankan terus!",
  "udah {count} hari bareng, lanjut terus ya!",
  "{count} hari nonstop itu keren banget, jaga apinya!"
];
const MILESTONE_STREAK_LINES = {
  1: [
    "streak kalian baru mulai hari pertama, jaga terus nyalanya.",
    "hari pertama sudah nyala, lanjutkan terus sampai panjang."
  ],
  7: [
    "7 hari nyala bareng, minggu pertama lewat dengan manis.",
    "sudah 7 hari, minggu pertama kalian aman. lanjut terus."
  ],
  30: [
    "30 hari nyala itu spesial, pertahankan terus ya.",
    "sudah 30 hari bersama, streak ini makin serius."
  ],
  50: [
    "50 hari streak bukan angka kecil, kalian hebat.",
    "streak 50 hari sudah tercapai, jangan kasih padam."
  ],
  100: [
    "100 hari nyala, ini sudah level serius.",
    "100 hari bareng, api kalian sudah masuk tier tinggi."
  ],
  365: [
    "365 hari nyala, ini satu tahun yang luar biasa.",
    "satu tahun streak sudah lewat, pertahankan terus apinya."
  ],
  500: [
    "500 hari nyala, ini sudah masuk level legendaris.",
    "500 hari bersama, streak kalian sudah jadi legenda."
  ]
};

function getStreakSettings(guildId, client) {
  const settings = getGuildSettings(guildId, {
    streak: client?.config?.streak || DEFAULT_STREAK_SETTINGS
  }).streak;

  return {
    ...DEFAULT_STREAK_SETTINGS,
    ...settings,
    botChannelId: settings.botChannelId || settings.channelId || DEFAULT_STREAK_SETTINGS.botChannelId,
    channelId: settings.channelId || settings.botChannelId || DEFAULT_STREAK_SETTINGS.channelId
  };
}

function setStreakChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    streak: {
      ...DEFAULT_STREAK_SETTINGS,
      ...(current.streak || {}),
      channelId,
      botChannelId: channelId
    }
  }));
}

function setStreakBotChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    streak: {
      ...DEFAULT_STREAK_SETTINGS,
      ...(current.streak || {}),
      channelId,
      botChannelId: channelId
    }
  }));
}

function setStreakNotificationChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    streak: {
      ...DEFAULT_STREAK_SETTINGS,
      ...(current.streak || {}),
      notificationChannelId: channelId
    }
  }));
}

function setStreakTopChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    streak: {
      ...DEFAULT_STREAK_SETTINGS,
      ...(current.streak || {}),
      topChannelId: channelId,
      topMessageId: "",
      topLastUpdatedDate: "",
      topLastUpdatedHour: ""
    }
  }));
}

function updateStreakTopBoardState(guildId, patch) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    streak: {
      ...DEFAULT_STREAK_SETTINGS,
      ...(current.streak || {}),
      ...patch
    }
  }));
}

function getStreakCommandChannelId(settings) {
  return settings.botChannelId || settings.channelId || "";
}

function getStreakNotificationChannelId(settings) {
  return settings.notificationChannelId || "";
}

function getStreakTopChannelId(settings) {
  return settings.topChannelId || "";
}

function getTemporaryResponseSeconds(settings) {
  const value = Number.parseInt(String(settings.temporaryResponseSeconds || DEFAULT_STREAK_SETTINGS.temporaryResponseSeconds), 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_STREAK_SETTINGS.temporaryResponseSeconds;
}

async function replyWithTemporaryMessage(message, payload, client, secondsOverride) {
  const settings = getStreakSettings(message.guild.id, client);
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

function parseRawStreakCommand(content) {
  const match = content.trim().match(/^streak\s+<@!?(\d+)>\s*$/i);
  return match ? match[1] : null;
}

function parseRawInfoStreakCommand(content) {
  const match = content.trim().match(/^infostreak(?:\s+<@!?(\d+)>)?(?:\s+(\d+))?\s*$/i);

  if (!match) {
    return null;
  }

  return {
    targetId: match[1] || null,
    page: match[2] ? Number.parseInt(match[2], 10) : 1
  };
}

function formatDateKey(date, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTodayDateKey(timezone) {
  return formatDateKey(new Date(), timezone);
}

function formatHourKey(date, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}-${values.hour || "00"}`;
}

function getTodayHourKey(timezone) {
  return formatHourKey(new Date(), timezone);
}

function shiftDateKey(dateKey, days) {
  const anchor = new Date(`${dateKey}T00:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function getStreakTier(streakCount) {
  return STREAK_TIERS.find((tier) => streakCount >= tier.min && streakCount <= tier.max) || STREAK_TIERS[0];
}

async function ensureClientApplication(client) {
  if (!client?.application) {
    return null;
  }

  if (!client.application.partial) {
    return client.application;
  }

  return client.application.fetch().catch(() => client.application);
}

async function fetchApplicationTierEmojis(client) {
  const application = await ensureClientApplication(client);

  if (!application?.emojis) {
    return new Map();
  }

  return application.emojis.fetch().catch(() => application.emojis.cache);
}

function getTierEmojiDisplay(emojiCollection, tier) {
  if (!tier?.emojiId) {
    return "🔥";
  }

  return emojiCollection.get(tier.emojiId)?.toString() || "🔥";
}

function normalizePage(value, fallback = 1) {
  const page = Number.parseInt(String(value || fallback), 10);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function truncateLabel(value, maxLength = 20) {
  if (!value) {
    return "Unknown User";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatStatusLine(pair, timezone) {
  const today = getTodayDateKey(timezone);
  const completedToday = pair.lastCompletedDate === today;

  return [
    `Streak sekarang: **${pair.currentStreak || 0}**`,
    `Best streak: **${pair.bestStreak || 0}**`,
    `Tier: **${getStreakTier(Math.max(pair.currentStreak, 1)).label}**`,
    `Status hari ini: ${completedToday ? "`selesai`" : "`belum complete`"}`
  ].join("\n");
}

function getTierColor(tier) {
  return TIER_COLORS[tier?.key] || "#f97316";
}

function createSeededIndex(seed, length) {
  if (!length) {
    return 0;
  }

  let value = 0;

  for (const character of seed) {
    value = ((value * 31) + character.charCodeAt(0)) >>> 0;
  }

  return value % length;
}

function pickStreakLine(pair, dateKey) {
  const streakCount = Math.max(pair.currentStreak || 1, 1);
  const pool = MILESTONE_STREAK_LINES[streakCount] || GENERAL_STREAK_LINES;
  const template = pool[createSeededIndex(`${pair.userIds.join(":")}:${dateKey}:${streakCount}`, pool.length)];
  return template.replace("{count}", String(streakCount));
}

function getGuildIconUrl(guild) {
  return guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 256
  }) || null;
}

function formatNotificationMeta(timezone) {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit"
  }).format(now);

  return `Today at ${formatted}`;
}

function buildStreakNotificationEmbed(channel, pair, attachmentName, timezone) {
  const embed = new EmbedBuilder()
    .setColor("#f97316")
    .setFooter({
      text: `🔥 Total Streak: ${pair.currentStreak} • ${formatNotificationMeta(timezone)}`,
      iconURL: getGuildIconUrl(channel.guild) || undefined
    });

  if (attachmentName) {
    embed.setImage(`attachment://${attachmentName}`);
  }

  return embed;
}

function buildStreakBoardCardEmbed(guild, targetMember, data, attachmentName) {
  const embed = new EmbedBuilder()
    .setColor("#38bdf8")
    .setAuthor({
      name: "Murphy Streak Board",
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTitle(`Streak Board - ${targetMember.user.username}`)
    .setDescription(`Ringkasan partner streak milik ${targetMember}.`)
    .setFooter({
      text: `Murphy • Halaman ${data.page}/${data.totalPages} • Total partner: ${data.totalPartners}`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();

  if (attachmentName) {
    embed.setImage(`attachment://${attachmentName}`);
  }

  return embed;
}

function buildStreakTopBoardEmbed(guild, data, attachmentName) {
  const embed = new EmbedBuilder()
    .setColor("#f97316")
    .setAuthor({
      name: "Murphy Top Streak",
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setFooter({
      text: `Murphy | Total pair: ${data.totalPairs}`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();

  if (attachmentName) {
    embed.setImage(`attachment://${attachmentName}`);
  }

  return embed;
}

async function buildStreakInfoFallbackEmbed(guild, client, targetMember, requestedPage = 1) {
  const data = await buildStreakInfoData(guild, client, targetMember, requestedPage);
  const emojiCollection = await fetchApplicationTierEmojis(client);

  if (!data.totalPartners) {
    return new EmbedBuilder()
      .setColor("#38bdf8")
      .setAuthor({
        name: "Murphy Streak Board",
        iconURL: getGuildIconUrl(guild) || undefined
      })
      .setTitle(`Streak Info - ${targetMember.user.username}`)
      .setDescription("Belum ada partner streak yang aktif untuk user ini.")
      .setFooter({
        text: "Murphy • Halaman 1/1 • Total partner: 0",
        iconURL: getGuildIconUrl(guild) || undefined
      })
      .setTimestamp();
  }

  const lines = data.entries.map((entry) => {
    const tierEmoji = getTierEmojiDisplay(emojiCollection, entry.tier);
    const statusLabel = entry.completedToday ? "✅ Nyala Hari Ini" : "❌ Belum Nyala 😴";
    return `#${entry.rank} ${entry.partnerName} - ${entry.currentStreak} ${tierEmoji} (${entry.bestStreak}) - ${statusLabel}`;
  });

  return new EmbedBuilder()
    .setColor("#38bdf8")
    .setAuthor({
      name: "Murphy Streak Board",
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTitle(`Streak Info - ${targetMember.user.username}`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `Murphy • Halaman ${data.page}/${data.totalPages} • Total partner: ${data.totalPartners}`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();
}

async function resolveMemberFromId(guild, memberId) {
  return guild.members.cache.get(memberId) || guild.members.fetch(memberId).catch(() => null);
}

async function assignStreakRewardRole(guild, client, userIds) {
  const settings = getStreakSettings(guild.id, client);
  const rewardRoleId = settings.rewardRoleId;

  if (!rewardRoleId) {
    return false;
  }

  const role = guild.roles.cache.get(rewardRoleId) || await guild.roles.fetch(rewardRoleId).catch(() => null);

  if (!role) {
    return false;
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (!botMember || role.position >= botMember.roles.highest.position) {
    return false;
  }

  const members = await Promise.all(userIds.map((userId) => resolveMemberFromId(guild, userId)));

  await Promise.allSettled(members.filter(Boolean).map(async (member) => {
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, "Granted after streak pair activation");
    }
  }));

  return true;
}

function buildAcceptedPair(guildId, userAId, userBId, dateKey, pendingInvite, acceptedMessageId) {
  return upsertPair(guildId, userAId, userBId, (current) => ({
    ...current,
    acceptedAt: current.acceptedAt || new Date().toISOString(),
    currentStreak: 1,
    bestStreak: Math.max(current.bestStreak || 0, 1),
    lastCompletedDate: dateKey,
    pendingInvite: null,
    dailyState: {
      dateKey,
      participants: {
        [pendingInvite.requesterId]: {
          source: "invite",
          messageId: pendingInvite.messageId,
          at: pendingInvite.createdAt
        },
        [pendingInvite.targetId]: {
          source: "accept",
          messageId: acceptedMessageId,
          at: new Date().toISOString()
        }
      },
      completedAt: new Date().toISOString(),
      completionMessageId: acceptedMessageId
    }
  }));
}

async function resolveTierEmoji(guild, pair) {
  const tier = getStreakTier(Math.max(pair.currentStreak, 1));
  const application = await ensureClientApplication(guild?.client);

  if (!application?.emojis || !tier.emojiId) {
    return null;
  }

  return application.emojis.cache.get(tier.emojiId)
    || await application.emojis.fetch(tier.emojiId).catch(() => null);
}

async function fetchPendingInviteMessage(guild, pendingInvite) {
  if (!pendingInvite?.channelId || !pendingInvite?.messageId) {
    return null;
  }

  const channel = guild.channels.cache.get(pendingInvite.channelId)
    || await guild.channels.fetch(pendingInvite.channelId).catch(() => null);

  if (!channel?.messages) {
    return null;
  }

  return channel.messages.fetch(pendingInvite.messageId).catch(() => null);
}

async function addPendingInviteReaction(message) {
  await message.react(PENDING_STREAK_EMOJI).catch(() => null);
}

async function clearPendingInviteReaction(message, client) {
  if (!message || !client?.user) {
    return;
  }

  const reaction = message.reactions.cache.find((entry) => entry.emoji.name === PENDING_STREAK_EMOJI);

  if (!reaction) {
    return;
  }

  await reaction.users.remove(client.user.id).catch(() => null);
}

async function reactMessagesWithTierEmoji(messages, pair) {
  const uniqueMessages = [...new Set(messages.filter(Boolean))];

  if (!uniqueMessages.length) {
    return;
  }

  const guildEmoji = await resolveTierEmoji(uniqueMessages[0].guild, pair);

  if (!guildEmoji) {
    console.warn(
      `Streak tier emoji not found for tier "${getStreakTier(Math.max(pair.currentStreak, 1)).key}" (${pair.currentStreak}).`
    );
    return;
  }

  const emojiIdentifier = guildEmoji.identifier || guildEmoji.toString();

  await Promise.allSettled(uniqueMessages.map(async (message) => {
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const permissions = me ? message.channel.permissionsFor(me) : null;

    if (!permissions?.has(PermissionFlagsBits.AddReactions)) {
      console.warn(`Missing AddReactions permission for streak reaction in channel ${message.channel.id}.`);
      return null;
    }

    if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
      console.warn(`Missing ReadMessageHistory permission for streak reaction in channel ${message.channel.id}.`);
      return null;
    }

    if (!permissions.has(PermissionFlagsBits.UseExternalEmojis)) {
      console.warn(`Missing UseExternalEmojis permission for streak reaction in channel ${message.channel.id}.`);
      return null;
    }

    return message.react(emojiIdentifier).catch((error) => {
      console.error(
        `Failed to react with streak tier emoji ${emojiIdentifier} on message ${message.id}:`,
        error
      );
      return null;
    });
  }));
}

async function sendStreakNotificationToChannel(channel, pair) {
  const settings = getStreakSettings(channel.guild.id, {
    config: {
      streak: DEFAULT_STREAK_SETTINGS
    }
  });
  const notificationChannelId = getStreakNotificationChannelId(settings);
  const destinationChannel = notificationChannelId
    ? await channel.guild.channels.fetch(notificationChannelId).catch(() => channel)
    : channel;

  const [leftMember, rightMember] = await Promise.all([
    resolveMemberFromId(destinationChannel.guild, pair.userIds[0]),
    resolveMemberFromId(destinationChannel.guild, pair.userIds[1])
  ]);

  if (!leftMember || !rightMember) {
    return;
  }

  const tier = getStreakTier(Math.max(pair.currentStreak, 1));
  const card = await createStreakNotificationCard({
    leftUser: leftMember.user,
    rightUser: rightMember.user,
    streakCount: pair.currentStreak,
    tier
  }).catch((error) => {
    console.error("Failed to render streak notification card:", error);
    return null;
  });

  const dateKey = getTodayDateKey(settings.timezone);
  const content = `🔥 ${leftMember} & ${rightMember}, ${pickStreakLine(pair, dateKey)}`;
  const embed = buildStreakNotificationEmbed(
    destinationChannel,
    pair,
    card?.name,
    settings.timezone
  );
  const payload = card
    ? { content, embeds: [embed], files: [card] }
    : { content, embeds: [embed] };

  await destinationChannel.send(payload).catch(() => null);
}

async function sendStreakNotification(message, pair) {
  return sendStreakNotificationToChannel(message.channel, pair);
}

async function buildStreakInfoData(guild, client, targetMember, requestedPage = 1) {
  const settings = getStreakSettings(guild.id, client);
  const todayDateKey = getTodayDateKey(settings.timezone);
  const allPairs = listPairs((pair) =>
    pair.guildId === guild.id
    && isActivatedPair(pair)
    && pair.userIds.includes(targetMember.id)
  ).sort((left, right) => {
    if ((right.currentStreak || 0) !== (left.currentStreak || 0)) {
      return (right.currentStreak || 0) - (left.currentStreak || 0);
    }

    if ((right.bestStreak || 0) !== (left.bestStreak || 0)) {
      return (right.bestStreak || 0) - (left.bestStreak || 0);
    }

    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });

  const perPage = 7;
  const totalPages = Math.max(1, Math.ceil(allPairs.length / perPage));
  const page = Math.min(normalizePage(requestedPage, 1), totalPages);
  const pagePairs = allPairs.slice((page - 1) * perPage, page * perPage);

  const entries = await Promise.all(pagePairs.map(async (pair, index) => {
    const partnerId = pair.userIds.find((userId) => userId !== targetMember.id);
    const partnerMember = partnerId ? await resolveMemberFromId(guild, partnerId) : null;
    const partnerName = truncateLabel(partnerMember?.user?.username || partnerMember?.displayName || `User ${partnerId}`);
    const partnerHandle = partnerMember
      ? `@${truncateLabel(partnerMember.user.username, 18)}`
      : `@${truncateLabel(`user_${partnerId}`, 18)}`;

    return {
      rank: ((page - 1) * perPage) + index + 1,
      partnerUser: partnerMember?.user || {
        id: partnerId || "0",
        username: partnerName,
        displayAvatarURL() {
          return "";
        }
      },
      partnerName,
      partnerHandle,
      currentStreak: pair.currentStreak || 0,
      bestStreak: pair.bestStreak || 0,
      tier: getStreakTier(Math.max(pair.currentStreak || 1, 1)),
      completedToday: pair.lastCompletedDate === todayDateKey
    };
  }));

  return {
    targetMember,
    entries,
    page,
    totalPages,
    totalPartners: allPairs.length,
    timezone: settings.timezone
  };
}

async function buildStreakTopBoardData(guild, client) {
  const settings = getStreakSettings(guild.id, client);
  const todayDateKey = getTodayDateKey(settings.timezone);
  const allPairs = listPairs((pair) =>
    pair.guildId === guild.id
    && isActivatedPair(pair)
  ).sort((left, right) => {
    if ((right.currentStreak || 0) !== (left.currentStreak || 0)) {
      return (right.currentStreak || 0) - (left.currentStreak || 0);
    }

    if ((right.bestStreak || 0) !== (left.bestStreak || 0)) {
      return (right.bestStreak || 0) - (left.bestStreak || 0);
    }

    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });
  const topPairs = allPairs.slice(0, 10);

  const entries = await Promise.all(topPairs.map(async (pair, index) => {
    const [leftMember, rightMember] = await Promise.all([
      resolveMemberFromId(guild, pair.userIds[0]),
      resolveMemberFromId(guild, pair.userIds[1])
    ]);

    const leftUser = leftMember?.user || {
      id: pair.userIds[0],
      username: `User ${pair.userIds[0]}`,
      globalName: "",
      displayAvatarURL() {
        return "";
      }
    };
    const rightUser = rightMember?.user || {
      id: pair.userIds[1],
      username: `User ${pair.userIds[1]}`,
      globalName: "",
      displayAvatarURL() {
        return "";
      }
    };

    return {
      rank: index + 1,
      pair,
      leftUser,
      rightUser,
      leftName: truncateLabel(leftMember?.displayName || leftUser.globalName || leftUser.username, 16),
      rightName: truncateLabel(rightMember?.displayName || rightUser.globalName || rightUser.username, 16),
      leftHandle: truncateLabel(leftUser.username, 16),
      rightHandle: truncateLabel(rightUser.username, 16),
      currentStreak: pair.currentStreak || 0,
      bestStreak: pair.bestStreak || 0,
      tier: getStreakTier(Math.max(pair.currentStreak || 1, 1)),
      completedToday: pair.lastCompletedDate === todayDateKey
    };
  }));

  return {
    guild,
    entries,
    timezone: settings.timezone,
    totalPairs: allPairs.length
  };
}

async function buildStreakInfoEmbed(guild, client, targetMember, requestedPage = 1) {
  const data = await buildStreakInfoData(guild, client, targetMember, requestedPage);
  const todayDateKey = getTodayDateKey(data.timezone);
  const emojiCollection = await fetchApplicationTierEmojis(client);

  if (!data.totalPartners) {
    return new EmbedBuilder()
      .setColor("#38bdf8")
      .setTitle(`Streak Info - ${targetMember.user.username}`)
      .setDescription("Belum ada partner streak yang aktif untuk user ini.")
      .setFooter({
        text: "Halaman 1/1 · Total partner: 0"
      })
      .setTimestamp();
  }

  const lines = data.entries.map((entry) => {
    const tier = entry.tier;
    const tierEmoji = getTierEmojiDisplay(emojiCollection, tier);
    const statusLabel = entry.completedToday && data.page && todayDateKey ? "✅ Nyala Hari Ini" : "❌ Belum Nyala 😴";

    return `#${entry.rank} ${entry.partnerName} - ${entry.currentStreak} ${tierEmoji} (${entry.bestStreak}) - ${statusLabel}`;
  });

  return new EmbedBuilder()
    .setColor("#38bdf8")
    .setTitle(`Streak Info - ${targetMember.user.username}`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `Halaman ${data.page}/${data.totalPages} · Total partner: ${data.totalPartners}`
    })
    .setTimestamp();
}

async function sendStreakInfo(message, client, options = {}) {
  const settings = getStreakSettings(message.guild.id, client);
  const commandChannelId = getStreakCommandChannelId(settings);

  if (commandChannelId && message.channel.id !== commandChannelId) {
    await replyWithTemporaryMessage(
      message,
      `Gunakan \`infostreak\` di <#${commandChannelId}>.`,
      client
    );
    return true;
  }

  const targetId = options.targetId || message.author.id;
  const targetMember = await resolveMemberFromId(message.guild, targetId);

  if (!targetMember) {
    await replyWithTemporaryMessage(message, "User streak yang diminta tidak ditemukan di server ini.", client);
    return true;
  }

  const data = await buildStreakInfoData(message.guild, client, targetMember, options.page || 1);
  const card = await createStreakInfoCard(data).catch((error) => {
    console.error("Failed to render streak info card:", error);
    return null;
  });

  if (card) {
    await replyWithTemporaryMessage(message, {
      embeds: [buildStreakBoardCardEmbed(message.guild, targetMember, data, card.name)],
      files: [card]
    }, client);
    return true;
  }

  const embed = await buildStreakInfoFallbackEmbed(message.guild, client, targetMember, options.page || 1);

  await replyWithTemporaryMessage(message, {
    embeds: [embed]
  }, client);

  return true;
}

async function refreshStreakTopBoardForGuild(guild, client, options = {}) {
  if (streakTopBoardRefreshes.has(guild.id)) {
    return streakTopBoardRefreshes.get(guild.id);
  }

  const refreshPromise = (async () => {
    const settings = getStreakSettings(guild.id, client);
    const topChannelId = getStreakTopChannelId(settings);

    if (!topChannelId) {
      return false;
    }

    const todayHourKey = getTodayHourKey(settings.timezone);
    const force = Boolean(options.force);

    const channel = guild.channels.cache.get(topChannelId) || await guild.channels.fetch(topChannelId).catch(() => null);

    if (!channel?.isTextBased?.() || !channel.messages) {
      return false;
    }

    let boardMessage = null;

    if (settings.topMessageId) {
      boardMessage = await channel.messages.fetch(settings.topMessageId).catch(() => null);
    }

    if (!force && boardMessage && settings.topLastUpdatedHour === todayHourKey) {
      return false;
    }

    const data = await buildStreakTopBoardData(guild, client);
    const card = await createStreakTopBoardCard(data).catch((error) => {
      console.error(`Failed to render streak top board for guild ${guild.id}:`, error);
      return null;
    });

    const payload = {
      embeds: [buildStreakTopBoardEmbed(guild, data, card?.name)]
    };

    if (card) {
      payload.files = [card];
    }

    if (boardMessage) {
      await boardMessage.edit(payload).catch(() => null);
    } else {
      boardMessage = await channel.send(payload).catch(() => null);
    }

    if (!boardMessage) {
      return false;
    }

    updateStreakTopBoardState(guild.id, {
      topMessageId: boardMessage.id,
      topLastUpdatedDate: todayHourKey.slice(0, 10),
      topLastUpdatedHour: todayHourKey
    });

    return true;
  })().finally(() => {
    streakTopBoardRefreshes.delete(guild.id);
  });

  streakTopBoardRefreshes.set(guild.id, refreshPromise);
  return refreshPromise;
}

async function refreshAllStreakTopBoards(client, options = {}) {
  const guilds = [...client.guilds.cache.values()];

  await Promise.allSettled(guilds.map(async (guild) => {
    try {
      await refreshStreakTopBoardForGuild(guild, client, options);
    } catch (error) {
      console.error(`Failed to refresh streak top board for guild ${guild.id}:`, error);
    }
  }));
}

function startStreakTopBoardScheduler(client) {
  if (client.streakTopBoardScheduler) {
    return;
  }

  const runRefresh = async () => {
    await refreshAllStreakTopBoards(client);
  };

  runRefresh().catch((error) => {
    console.error("Initial streak top board refresh failed:", error);
  });

  client.streakTopBoardScheduler = setInterval(() => {
    runRefresh().catch((error) => {
      console.error("Scheduled streak top board refresh failed:", error);
    });
  }, 60 * 60 * 1000);

  if (typeof client.streakTopBoardScheduler.unref === "function") {
    client.streakTopBoardScheduler.unref();
  }
}

function getMentionTargetId(message) {
  if (message.mentions.users.size !== 1) {
    return null;
  }

  return message.mentions.users.first()?.id || null;
}

async function getReplyTargetId(message) {
  if (!message.reference?.messageId) {
    return null;
  }

  const referencedMessage = await message.fetchReference().catch(() => null);

  if (!referencedMessage || referencedMessage.author.bot) {
    return null;
  }

  return referencedMessage.author.id;
}

function isActivatedPair(pair) {
  return Boolean(pair?.acceptedAt);
}

function ensureCurrentDayState(pair, dateKey) {
  if (!pair.dailyState || pair.dailyState.dateKey !== dateKey) {
    return {
      dateKey,
      participants: {},
      completedAt: "",
      completionMessageId: ""
    };
  }

  return {
    ...pair.dailyState,
    participants: {
      ...(pair.dailyState.participants || {})
    }
  };
}

function recordDailyInteraction(pair, actorId, source, messageId, dateKey) {
  const dailyState = ensureCurrentDayState(pair, dateKey);

  dailyState.participants[actorId] = {
    source,
    messageId,
    at: new Date().toISOString()
  };

  return dailyState;
}

function finalizeDailyCompletion(pair, dateKey, completionMessageId, dailyState) {
  const previousDateKey = shiftDateKey(dateKey, -1);
  const nextStreak = pair.lastCompletedDate === previousDateKey
    ? (pair.currentStreak || 0) + 1
    : 1;

  return {
    ...pair,
    currentStreak: nextStreak,
    bestStreak: Math.max(pair.bestStreak || 0, nextStreak),
    lastCompletedDate: dateKey,
    dailyState: {
      ...dailyState,
      completedAt: new Date().toISOString(),
      completionMessageId
    }
  };
}

async function completePairStreak(message, pair, options = {}) {
  const additionalMessages = options.additionalMessages || [];

  await Promise.allSettled([
    reactMessagesWithTierEmoji([message, ...additionalMessages], pair),
    sendStreakNotification(message, pair)
  ]);
}

async function handleActivePairInteraction(message, client, settings, pair, partnerId, source) {
  const dateKey = getTodayDateKey(settings.timezone);
  const dailyState = recordDailyInteraction(
    pair,
    message.author.id,
    source,
    message.id,
    dateKey
  );
  const alreadyCompletedToday = Boolean(dailyState.completedAt) || pair.lastCompletedDate === dateKey;

  if (alreadyCompletedToday) {
    upsertPair(message.guild.id, pair.userIds[0], pair.userIds[1], (current) => ({
      ...current,
      dailyState
    }));

    await replyWithTemporaryMessage(message, "Streak hari ini selesai.", client);
    return true;
  }

  const partnerInteracted = Boolean(dailyState.participants[partnerId]);
  const actorAlreadyRecorded = Boolean(dailyState.participants[message.author.id]);

  if (!actorAlreadyRecorded || !partnerInteracted) {
    upsertPair(message.guild.id, pair.userIds[0], pair.userIds[1], (current) => ({
      ...current,
      dailyState
    }));
    return false;
  }

  const completedPair = upsertPair(message.guild.id, pair.userIds[0], pair.userIds[1], (current) =>
    finalizeDailyCompletion(current, dateKey, message.id, dailyState)
  );

  await completePairStreak(message, completedPair);
  await awardStreakXp(message.guild, completedPair.userIds, client, message.channel.id);
  await replyWithTemporaryMessage(message, "Streak hari ini selesai.", client);
  return true;
}

async function handlePendingAcceptance(message, client, settings, pendingTargetId) {
  const mentionTargetId = getMentionTargetId(message);
  const replyTargetId = await getReplyTargetId(message);
  const relevantPairs = listPairs((pair) =>
    pair.guildId === message.guild.id
    && pair.pendingInvite
    && pair.pendingInvite.targetId === message.author.id
    && pair.pendingInvite.channelId === message.channel.id
  );

  const pendingPair = relevantPairs.find((pair) => {
    const pending = pair.pendingInvite;

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      return false;
    }

    return pending.requesterId === pendingTargetId
      || pending.requesterId === mentionTargetId
      || pending.requesterId === replyTargetId;
  });

  if (!pendingPair) {
    return false;
  }

  const pending = pendingPair.pendingInvite;
  const dateKey = getTodayDateKey(settings.timezone);
  const inviteMessage = await fetchPendingInviteMessage(message.guild, pending);
  const acceptedPair = buildAcceptedPair(
    message.guild.id,
    pending.requesterId,
    pending.targetId,
    dateKey,
    pending,
    message.id
  );

  await clearPendingInviteReaction(inviteMessage, client);
  await assignStreakRewardRole(message.guild, client, acceptedPair.userIds);

  await completePairStreak(message, acceptedPair, {
    additionalMessages: [inviteMessage]
  });
  await awardStreakXp(message.guild, acceptedPair.userIds, client, message.channel.id);
  return true;
}

async function handleStreakCommand(message, client, targetId) {
  const settings = getStreakSettings(message.guild.id, client);
  const commandChannelId = getStreakCommandChannelId(settings);

  if (!commandChannelId) {
    await replyWithTemporaryMessage(
      message,
      "Channel streak belum diset oleh admin. Jalankan `fsetstreakchannel [#channel]` terlebih dahulu.",
      client
    );
    return true;
  }

  if (message.channel.id !== commandChannelId) {
    await replyWithTemporaryMessage(
      message,
      `Command streak hanya aktif di channel <#${commandChannelId}>.`,
      client
    );
    return true;
  }

  if (message.author.id === targetId) {
    await replyWithTemporaryMessage(message, "Kamu tidak bisa membuat streak dengan dirimu sendiri.", client);
    return true;
  }

  const targetMember = await resolveMemberFromId(message.guild, targetId);

  if (!targetMember || targetMember.user.bot) {
    await replyWithTemporaryMessage(message, "Target streak tidak valid.", client);
    return true;
  }

  if (await handlePendingAcceptance(message, client, settings, targetId)) {
    return true;
  }

  const existingPair = getPair(message.guild.id, message.author.id, targetId);

  if (existingPair?.pendingInvite) {
    const expiresAt = new Date(existingPair.pendingInvite.expiresAt).getTime();

    if (expiresAt > Date.now()) {
      const previousPendingMessage = await fetchPendingInviteMessage(message.guild, existingPair.pendingInvite);

      if (previousPendingMessage?.id !== message.id) {
        await clearPendingInviteReaction(previousPendingMessage, client);
      }

      upsertPair(message.guild.id, message.author.id, targetId, (current) => ({
        ...current,
        pendingInvite: {
          ...(current.pendingInvite || {}),
          requesterId: message.author.id,
          targetId,
          channelId: message.channel.id,
          messageId: message.id,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
        }
      }));

      await addPendingInviteReaction(message);
      return true;
    }
  }

  if (existingPair && isActivatedPair(existingPair)) {
    return handleActivePairInteraction(
      message,
      client,
      settings,
      existingPair,
      targetId,
      "command"
    );
  }

  const pendingInvite = {
    requesterId: message.author.id,
    targetId,
    channelId: message.channel.id,
    messageId: message.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
  };

  upsertPair(message.guild.id, message.author.id, targetId, (current) => ({
    ...current,
    pendingInvite
  }));

  await addPendingInviteReaction(message);

  return true;
}

async function findActivePairForInteraction(message, partnerId) {
  const pair = getPair(message.guild.id, message.author.id, partnerId);

  if (!pair || !isActivatedPair(pair)) {
    return null;
  }

  return pair;
}

async function handleDailyInteraction(message, client) {
  const settings = getStreakSettings(message.guild.id, client);

  if (!settings.channelId || message.channel.id !== settings.channelId) {
    return false;
  }

  const replyTargetId = await getReplyTargetId(message);
  const mentionTargetId = getMentionTargetId(message);
  const partnerId = replyTargetId || mentionTargetId;

  if (!partnerId || partnerId === message.author.id) {
    return false;
  }

  const pair = await findActivePairForInteraction(message, partnerId);

  if (!pair) {
    return false;
  }

  return handleActivePairInteraction(
    message,
    client,
    settings,
    pair,
    partnerId,
    replyTargetId ? "reply" : "mention"
  );
}

async function handleStreakMessage(message, client, options = {}) {
  const settings = getStreakSettings(message.guild.id, client);
  const commandChannelId = getStreakCommandChannelId(settings);

  if (options.hasPrefixedCommand) {
    return false;
  }

  const rawTargetId = parseRawStreakCommand(message.content);
  const rawInfoRequest = parseRawInfoStreakCommand(message.content);

  if (rawTargetId) {
    return handleStreakCommand(message, client, rawTargetId);
  }

  if (rawInfoRequest) {
    return sendStreakInfo(message, client, rawInfoRequest);
  }

  if (message.content.trim().toLowerCase() === "streak") {
    if (!commandChannelId) {
      await replyWithTemporaryMessage(
        message,
        "Channel streak belum diset oleh admin. Jalankan `fsetstreakchannel [#channel]` terlebih dahulu.",
        client
      );
      return true;
    }
    if (message.channel.id === commandChannelId) {
      await replyWithTemporaryMessage(
        message,
        "Format penggunaan: `streak @user` atau `fstreak @user`.",
        client
      );
      return true;
    }
  }

  if (!commandChannelId || message.channel.id !== commandChannelId) {
    return false;
  }

  if (await handlePendingAcceptance(message, client, settings)) {
    return true;
  }

  return handleDailyInteraction(message, client);
}

function resolveStreakTierFromValue(value) {
  return getStreakTier(value);
}

function setStreakValue(guildId, userAId, userBId, streakValue, timezone) {
  const dateKey = getTodayDateKey(timezone || DEFAULT_STREAK_SETTINGS.timezone);

  return upsertPair(guildId, userAId, userBId, (current) => ({
    ...current,
    acceptedAt: current.acceptedAt || new Date().toISOString(),
    currentStreak: streakValue,
    bestStreak: Math.max(current.bestStreak || 0, streakValue),
    lastCompletedDate: dateKey,
    pendingInvite: null,
    dailyState: {
      dateKey,
      participants: {
        [userAId]: {
          source: "admin",
          messageId: "",
          at: new Date().toISOString()
        },
        [userBId]: {
          source: "admin",
          messageId: "",
          at: new Date().toISOString()
        }
      },
      completedAt: new Date().toISOString(),
      completionMessageId: ""
    }
  }));
}

function resetStreakValue(guildId, userAId, userBId) {
  return deletePair(guildId, userAId, userBId);
}

module.exports = {
  DEFAULT_STREAK_SETTINGS,
  assignStreakRewardRole,
  formatStatusLine,
  getStreakSettings,
  getStreakTier,
  handleStreakCommand,
  handleStreakMessage,
  refreshStreakTopBoardForGuild,
  replyWithTemporaryMessage,
  resetStreakValue,
  resolveMemberFromId,
  resolveStreakTierFromValue,
  sendStreakNotification,
  sendStreakNotificationToChannel,
  sendStreakInfo,
  setStreakBotChannel,
  setStreakChannel,
  setStreakNotificationChannel,
  setStreakTopChannel,
  setStreakValue,
  startStreakTopBoardScheduler
};
