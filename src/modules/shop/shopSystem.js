const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { addCoins, getEconomyEntry, spendCoins, updateEconomyEntry } = require("../../services/economyStore");
const { getVoiceSession, listVoiceSessions } = require("../../services/leaderboardStore");
const {
  SHOP_PROFILE_THEMES,
  SHOP_PROFILE_TITLES,
  buildProfileSnapshot,
  unlockProfileThemePurchase,
  unlockProfileTitlePurchase
} = require("../profile/profileSystem");
const {
  clearDirectRenameCooldown,
  getDirectRenameAccess,
  getMemberLevelInfo
} = require("../levels/levelSystem");
const { grantShopCustomRoleAccess, reconcileCustomRoleMember } = require("../custom-roles/customRoleSystem");
const { extendOwnedPrivateRoom } = require("../private-rooms/privateRoomSystem");
const { findPrivateRoomByOwner } = require("../../services/privateRoomStore");

const SHOP_ACCESS_LEVEL = 4;
const GAZECOIN_NAME = "Gazecoin";
const GAZECOIN_SHORT = "GZC";
const GAZECOIN_EMOJI_ID = "1484304051423285308";
const GAZECOIN_TIMEZONE = "Asia/Jakarta";
const ENABLE_GAZECOIN_DM_SUMMARY = false;
const CHAT_COIN_DAILY_CAP = 100;
const CHAT_COIN_REWARD = 1;
const REPEATED_CHAT_WINDOW_MS = 10 * 60 * 1000;
const VOICE_COIN_INTERVAL_MS = 10 * 60 * 1000;
const VOICE_COIN_REWARD = 5;
const SHOP_SCHEDULER_INTERVAL_MS = 60 * 1000;

const SHOP_ITEMS = [
  {
    key: "rename-reset",
    label: "Rename Reset",
    minLevel: 4,
    cost: 420,
    category: "utility",
    description: "Reset cooldown fast rename biar bisa pakai lagi lebih cepat."
  },
  {
    key: "custom-role-pass",
    label: "Custom Role Pass 30 Hari",
    minLevel: 5,
    cost: 1850,
    category: "premium",
    description: "Buka akses custom role sementara selama 30 hari lewat shop."
  },
  {
    key: "private-room-extend",
    label: "Extend Private Room +12 Jam",
    minLevel: 5,
    cost: 480,
    category: "premium",
    description: "Tambah durasi active private room kamu selama 12 jam."
  },
  ...SHOP_PROFILE_THEMES.map((theme) => ({
    key: `theme:${theme.key}`,
    label: `Theme ${theme.label}`,
    minLevel: theme.minLevel,
    cost: theme.minLevel >= 5 ? 650 : 360,
    category: "theme",
    unlockKey: theme.key,
    description: `Unlock theme profile shop-only ${theme.label}.`
  })),
  ...SHOP_PROFILE_TITLES.map((title) => ({
    key: `title:${title.key}`,
    label: `Title ${title.label}`,
    minLevel: title.minLevel,
    cost: title.minLevel >= 5 ? 520 : 280,
    category: "title",
    unlockKey: title.key,
    description: `Unlock title profile shop-only ${title.label}.`
  }))
];

function formatCoins(value) {
  return `${new Intl.NumberFormat("id-ID").format(Math.max(0, value || 0))} ${GAZECOIN_NAME}`;
}

async function getGazecoinDisplay(client) {
  if (!client) {
    return GAZECOIN_SHORT;
  }

  if (client?.gazecoinEmojiDisplay) {
    return client.gazecoinEmojiDisplay;
  }

  try {
    const application = client?.application?.partial
      ? await client.application.fetch()
      : client?.application;
    const emoji = application?.emojis?.cache?.get(GAZECOIN_EMOJI_ID)
      || await application?.emojis?.fetch?.(GAZECOIN_EMOJI_ID).catch(() => null);

    client.gazecoinEmojiDisplay = emoji?.toString() || GAZECOIN_SHORT;
    return client.gazecoinEmojiDisplay;
  } catch {
    return GAZECOIN_SHORT;
  }
}

function hasShopAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function canUseShop(guildId, userId) {
  return getMemberLevelInfo(guildId, userId).level >= SHOP_ACCESS_LEVEL;
}

function ensureShopAccess(guildId, userId, member) {
  if (canUseShop(guildId, userId)) {
    return { ok: true };
  }

  if (member && hasShopAdminPermission(member)) {
    return { ok: true, adminBypass: true };
  }

  return {
    ok: false,
    reason: `Shop dan ${GAZECOIN_NAME} baru terbuka mulai Level 4.`
  };
}

function getEconomySummary(guildId, userId) {
  const entry = getEconomyEntry(guildId, userId) || null;
  const todayKey = getDateKey();

  return {
    balance: entry?.balance || 0,
    totalEarned: entry?.totalEarned || 0,
    totalSpent: entry?.totalSpent || 0,
    chatDailyDate: entry?.chatDailyDate || "",
    chatDailyCount: entry?.chatDailyDate === todayKey ? (entry?.chatDailyCount || 0) : 0,
    lastChatFingerprint: entry?.lastChatFingerprint || "",
    lastChatMessageAt: entry?.lastChatMessageAt || "",
    lastChatCoinAt: entry?.lastChatCoinAt || "",
    lastVoiceCoinAt: entry?.lastVoiceCoinAt || "",
    lastVoiceProgressAt: entry?.lastVoiceProgressAt || "",
    voiceSessionStartedAt: entry?.voiceSessionStartedAt || "",
    voiceSessionEarned: entry?.voiceSessionEarned || 0,
    voiceEligibilityState: entry?.voiceEligibilityState || "idle"
  };
}

function getShopItemByKey(itemKey) {
  return SHOP_ITEMS.find((item) => item.key === itemKey) || null;
}

function isProfileUnlockOwned(snapshot, item) {
  if (item.category === "theme") {
    return snapshot.profileEntry?.unlockedThemeKeys?.includes(item.unlockKey);
  }

  if (item.category === "title") {
    return snapshot.profileEntry?.unlockedTitleKeys?.includes(item.unlockKey);
  }

  return false;
}

function buildShopBalanceEmbed(targetMember, levelInfo, summary, gazecoinDisplay = GAZECOIN_SHORT) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(`${gazecoinDisplay} Shop Balance`)
    .setDescription(
      [
        `User: ${targetMember}`,
        `Tier: **${levelInfo.code} ${levelInfo.name}**`,
        `Saldo: **${formatCoins(summary.balance)}**`
      ].join("\n")
    )
    .addFields(
      {
        name: `Total ${GAZECOIN_NAME}`,
        value: formatCoins(summary.totalEarned),
        inline: true
      },
      {
        name: "Total Spent",
        value: formatCoins(summary.totalSpent),
        inline: true
      },
      {
        name: "Shop Status",
        value: levelInfo.level >= SHOP_ACCESS_LEVEL ? "Terbuka" : "Terkunci sampai Level 4",
        inline: true
      },
      {
        name: "Chat Hari Ini",
        value: `${summary.chatDailyCount}/${CHAT_COIN_DAILY_CAP} ${GAZECOIN_SHORT}`,
        inline: true
      }
    )
    .setTimestamp();
}

function buildShopCatalogEmbed(snapshot, gazecoinDisplay = GAZECOIN_SHORT) {
  const available = SHOP_ITEMS.filter((item) => snapshot.levelInfo.level >= item.minLevel);
  const locked = SHOP_ITEMS.filter((item) => snapshot.levelInfo.level < item.minLevel);

  const formatItemLine = (item) => {
    const owned = isProfileUnlockOwned(snapshot, item);
    return `- \`${item.key}\` • ${item.label} • ${formatCoins(item.cost)}${owned ? " • owned" : ""}`;
  };

  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(`${gazecoinDisplay} Murphy Shop`)
    .setDescription(
      [
        `Tier kamu: **${snapshot.levelInfo.code} ${snapshot.levelInfo.name}**`,
        `Saldo saat ini: **${formatCoins(getEconomySummary(snapshot.guild.id, snapshot.member.id).balance)}**`,
        "",
        `Item utility dan cosmetic profile di bawah bisa dibeli dengan ${GAZECOIN_NAME}.`
      ].join("\n")
    )
    .addFields(
      {
        name: "Tersedia",
        value: available.map(formatItemLine).join("\n") || "-",
        inline: false
      },
      {
        name: "Terkunci",
        value: locked.map((item) => `- \`${item.key}\` • ${item.label} • buka di Level ${item.minLevel}`).join("\n") || "-",
        inline: false
      }
    )
    .setFooter({
      text: "Gunakan /shop buy item:<kode-item>"
    })
    .setTimestamp();
}

function getChatRewardForLevel(level) {
  return level >= SHOP_ACCESS_LEVEL ? CHAT_COIN_REWARD : 0;
}

function getVoiceRewardForLevel(level) {
  return level >= SHOP_ACCESS_LEVEL ? VOICE_COIN_REWARD : 0;
}

function getDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GAZECOIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeChatFingerprint(message) {
  const content = String(message.content || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (content) {
    return content;
  }

  if (message.attachments.size) {
    const attachmentNames = [...message.attachments.values()]
      .map((attachment) => String(attachment.name || attachment.contentType || "attachment").toLowerCase())
      .sort();
    return `attachment:${attachmentNames.join("|")}`;
  }

  return "";
}

function formatDurationShort(totalMs) {
  const ms = Math.max(0, totalMs || 0);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} menit`;
  }

  return `${hours} jam ${minutes} menit`;
}

function isEligibleVoiceState(state) {
  const channel = state?.channel;

  if (!channel) {
    return false;
  }

  const activeHumans = channel.members.filter((voiceMember) => !voiceMember.user.bot).size;

  return activeHumans >= 2
    && !state.selfMute
    && !state.serverMute
    && !state.selfDeaf
    && !state.serverDeaf;
}

async function awardTrackedChatCoins(message) {
  const levelInfo = getMemberLevelInfo(message.guild.id, message.author.id);

  if (levelInfo.level < SHOP_ACCESS_LEVEL) {
    return false;
  }

  const fingerprint = normalizeChatFingerprint(message);

  if (!fingerprint) {
    return false;
  }

  const entry = getEconomyEntry(message.guild.id, message.author.id);
  const todayKey = getDateKey();
  const dailyCount = entry?.chatDailyDate === todayKey ? (entry?.chatDailyCount || 0) : 0;

  if (dailyCount >= CHAT_COIN_DAILY_CAP) {
    return false;
  }

  const lastMessageAt = entry?.lastChatMessageAt ? new Date(entry.lastChatMessageAt).getTime() : 0;
  if (
    entry?.lastChatFingerprint
    && entry.lastChatFingerprint === fingerprint
    && lastMessageAt
    && (Date.now() - lastMessageAt) < REPEATED_CHAT_WINDOW_MS
  ) {
    return false;
  }

  const reward = getChatRewardForLevel(levelInfo.level);

  if (!reward) {
    return false;
  }

  addCoins(message.guild.id, message.author.id, reward, {
    chatDailyDate: todayKey,
    chatDailyCount: dailyCount + reward,
    lastChatFingerprint: fingerprint,
    lastChatMessageAt: new Date().toISOString(),
    lastChatCoinAt: new Date().toISOString()
  });

  return true;
}

async function processVoiceCoinAwards(client) {
  const guilds = [...client.guilds.cache.values()];

  for (const guild of guilds) {
    const sessions = listVoiceSessions(guild.id);

    for (const session of sessions) {
      const member = guild.members.cache.get(session.userId)
        || await guild.members.fetch(session.userId).catch(() => null);

      if (!member || member.user.bot) {
        continue;
      }

      const channel = member.voice?.channel;

      if (!channel || channel.id !== session.channelId) {
        continue;
      }

      const activeHumans = channel.members.filter((voiceMember) => !voiceMember.user.bot).size;
      const voiceState = member.voice;
      const ineligibleForVoiceReward = activeHumans < 2
        || voiceState.selfMute
        || voiceState.serverMute
        || voiceState.selfDeaf
        || voiceState.serverDeaf;

      if (ineligibleForVoiceReward) {
        if ((getEconomyEntry(guild.id, member.id)?.voiceEligibilityState || "idle") !== "paused") {
          updateEconomyEntry(guild.id, member.id, (current) => ({
            ...current,
            voiceEligibilityState: "paused",
            lastVoiceProgressAt: new Date().toISOString()
          }));
        }
        continue;
      }

      const levelInfo = getMemberLevelInfo(guild.id, member.id);

      if (levelInfo.level < SHOP_ACCESS_LEVEL) {
        continue;
      }

      const entry = getEconomyEntry(guild.id, member.id) || null;
      const eligibilityState = entry?.voiceEligibilityState || "idle";
      const progressAnchor = entry?.lastVoiceProgressAt
        ? new Date(entry.lastVoiceProgressAt).getTime()
        : 0;
      const baselineTime = eligibilityState === "eligible" && progressAnchor
        ? progressAnchor
        : eligibilityState === "paused"
          ? Date.now()
          : new Date(session.startedAt).getTime();

      if (eligibilityState !== "eligible") {
        updateEconomyEntry(guild.id, member.id, (current) => ({
          ...current,
          voiceEligibilityState: "eligible",
          voiceSessionStartedAt: current.voiceSessionStartedAt || new Date().toISOString(),
          voiceSessionEarned: current.voiceSessionEarned || 0,
          lastVoiceProgressAt: new Date(baselineTime).toISOString()
        }));
        continue;
      }

      const elapsedMs = Date.now() - baselineTime;
      const intervals = Math.floor(elapsedMs / VOICE_COIN_INTERVAL_MS);

      if (intervals <= 0) {
        continue;
      }

      const reward = intervals * getVoiceRewardForLevel(levelInfo.level);

      if (!reward) {
        continue;
      }

      const nextProgressAt = new Date(baselineTime + (intervals * VOICE_COIN_INTERVAL_MS)).toISOString();
      addCoins(guild.id, member.id, reward, {
        lastVoiceCoinAt: new Date().toISOString(),
        lastVoiceProgressAt: nextProgressAt,
        voiceSessionStartedAt: entry?.voiceSessionStartedAt || new Date().toISOString(),
        voiceSessionEarned: (entry?.voiceSessionEarned || 0) + reward,
        voiceEligibilityState: "eligible"
      });
    }
  }
}

async function settleVoiceGazecoinFromState(state, client) {
  const member = state?.member;

  if (!member || member.user?.bot || !isEligibleVoiceState(state)) {
    return false;
  }

  const levelInfo = getMemberLevelInfo(member.guild.id, member.id);

  if (levelInfo.level < SHOP_ACCESS_LEVEL) {
    return false;
  }

  const entry = getEconomyEntry(member.guild.id, member.id) || null;
  const session = getVoiceSession(member.guild.id, member.id);

  if (!session && !entry?.voiceSessionStartedAt) {
    return false;
  }

  const baselineTime = entry?.lastVoiceProgressAt
    ? new Date(entry.lastVoiceProgressAt).getTime()
    : new Date(session?.startedAt || entry.voiceSessionStartedAt).getTime();
  const elapsedMs = Date.now() - baselineTime;
  const intervals = Math.floor(elapsedMs / VOICE_COIN_INTERVAL_MS);

  if (intervals <= 0) {
    return false;
  }

  const reward = intervals * getVoiceRewardForLevel(levelInfo.level);

  if (!reward) {
    return false;
  }

  const nextProgressAt = new Date(baselineTime + (intervals * VOICE_COIN_INTERVAL_MS)).toISOString();
  addCoins(member.guild.id, member.id, reward, {
    lastVoiceCoinAt: new Date().toISOString(),
    lastVoiceProgressAt: nextProgressAt,
    voiceSessionStartedAt: entry?.voiceSessionStartedAt || session?.startedAt || new Date().toISOString(),
    voiceSessionEarned: (entry?.voiceSessionEarned || 0) + reward,
    voiceEligibilityState: "eligible"
  });

  return true;
}

async function sendVoiceGazecoinSummary(member, client) {
  if (!ENABLE_GAZECOIN_DM_SUMMARY) {
    return false;
  }

  const entry = getEconomyEntry(member.guild.id, member.id);

  if (!entry?.voiceSessionEarned || !entry.voiceSessionStartedAt) {
    return false;
  }

  const gazecoin = await getGazecoinDisplay(client);
  const startedAt = new Date(entry.voiceSessionStartedAt).getTime();
  const durationLabel = formatDurationShort(Date.now() - startedAt);
  const embed = new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Murphy Voice Summary")
    .setDescription(
      [
        `${gazecoin} Kamu mengumpulkan **${entry.voiceSessionEarned} ${GAZECOIN_NAME}** dari sesi voice terakhir.`,
        `Durasi sesi: **${durationLabel}**`,
        `Saldo sekarang: **${formatCoins(entry.balance || 0)}**`
      ].join("\n")
    )
    .setFooter({
      text: "Notifikasi ini hanya dikirim ke kamu"
    })
    .setTimestamp();

  await member.user.send({
    embeds: [embed]
  }).catch(() => null);

  return true;
}

async function handleVoiceStateGazecoin(oldState, newState, client) {
  const member = newState.member || oldState.member;

  if (!member || member.user?.bot) {
    return;
  }

  const oldChannelId = oldState.channelId || "";
  const newChannelId = newState.channelId || "";
  const oldEligible = isEligibleVoiceState(oldState);
  const newEligible = isEligibleVoiceState(newState);

  if (oldChannelId && (oldChannelId !== newChannelId || (oldEligible && !newEligible))) {
    await settleVoiceGazecoinFromState(oldState, client);
  }

  if (!oldChannelId && newChannelId) {
    updateEconomyEntry(member.guild.id, member.id, (current) => ({
      ...current,
      voiceSessionStartedAt: new Date().toISOString(),
      voiceSessionEarned: 0,
      lastVoiceProgressAt: "",
      voiceEligibilityState: "idle"
    }));
    return;
  }

  if (oldChannelId && !newChannelId) {
    const latestEntry = getEconomyEntry(member.guild.id, member.id);

    if (latestEntry?.voiceSessionEarned) {
      await sendVoiceGazecoinSummary(member, client);
    }

    updateEconomyEntry(member.guild.id, member.id, (current) => ({
      ...current,
      lastVoiceProgressAt: "",
      voiceSessionStartedAt: "",
      voiceSessionEarned: 0,
      voiceEligibilityState: "idle"
    }));
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    updateEconomyEntry(member.guild.id, member.id, (current) => ({
      ...current,
      lastVoiceProgressAt: "",
      voiceEligibilityState: "idle"
    }));
  }
}

function startShopEconomyScheduler(client) {
  if (client.shopEconomyScheduler) {
    return;
  }

  const run = async () => {
    await processVoiceCoinAwards(client);
  };

  run().catch((error) => {
    console.error("Initial shop economy sync failed:", error);
  });

  client.shopEconomyScheduler = setInterval(() => {
    run().catch((error) => {
      console.error("Scheduled shop economy sync failed:", error);
    });
  }, SHOP_SCHEDULER_INTERVAL_MS);

  if (typeof client.shopEconomyScheduler.unref === "function") {
    client.shopEconomyScheduler.unref();
  }
}

function grantCoinsToMember(guildId, userId, amount) {
  const increment = Math.max(0, Number.parseInt(String(amount || 0), 10) || 0);

  if (!increment) {
    return {
      ok: false,
      reason: `Jumlah ${GAZECOIN_NAME} harus lebih besar dari 0.`
    };
  }

  const entry = addCoins(guildId, userId, increment);
  return {
    ok: true,
    entry
  };
}

async function redeemShopItem(guild, member, itemKey) {
  const levelInfo = getMemberLevelInfo(guild.id, member.id);
  const item = getShopItemByKey(itemKey);
  const gazecoin = await getGazecoinDisplay(guild.client);

  if (!item) {
    return {
      ok: false,
      reason: "Item shop tidak ditemukan."
    };
  }

  if (levelInfo.level < item.minLevel) {
    return {
      ok: false,
      reason: `Item **${item.label}** baru bisa dibeli mulai Level ${item.minLevel}.`
    };
  }

  if (item.category === "utility") {
    const renameAccess = getDirectRenameAccess(guild.id, member.id);

    if (!renameAccess.renameEnabled) {
      return {
        ok: false,
        reason: "Fast rename belum terbuka di level kamu."
      };
    }

    if (renameAccess.cooldownMs <= 0) {
      return {
        ok: false,
        reason: "Cooldown rename kamu sedang tidak aktif, jadi item ini belum diperlukan."
      };
    }
  }

  if (item.category === "theme") {
    const preview = await buildProfileSnapshot(guild, member);

    if (preview.profileEntry?.unlockedThemeKeys?.includes(item.unlockKey)) {
      return {
        ok: false,
        reason: "Theme itu sudah pernah kamu beli."
      };
    }
  }

  if (item.category === "title") {
    const preview = await buildProfileSnapshot(guild, member);

    if (preview.profileEntry?.unlockedTitleKeys?.includes(item.unlockKey)) {
      return {
        ok: false,
        reason: "Title itu sudah pernah kamu beli."
      };
    }
  }

  if (item.key === "private-room-extend" && !findPrivateRoomByOwner(guild.id, member.id)) {
    return {
      ok: false,
      reason: "Kamu belum punya private room aktif untuk diperpanjang."
    };
  }

  const payment = spendCoins(guild.id, member.id, item.cost);

  if (!payment.ok) {
    return {
      ok: false,
      reason: `${GAZECOIN_NAME} kamu belum cukup. Butuh **${formatCoins(item.cost)}** untuk item ini.`
    };
  }

  if (item.category === "utility") {
    clearDirectRenameCooldown(guild.id, member.id);

    return {
      ok: true,
      item,
      message: `${gazecoin} Cooldown fast rename kamu berhasil di-reset. Sisa saldo: **${formatCoins(payment.entry.balance)}**.`
    };
  }

  if (item.category === "theme") {
    const result = unlockProfileThemePurchase(guild.id, member.id, item.unlockKey);

    if (!result.ok) {
      updateEconomyEntry(guild.id, member.id, (current) => ({
        balance: (current.balance || 0) + item.cost,
        totalSpent: Math.max(0, (current.totalSpent || 0) - item.cost)
      }));
      return result;
    }

    return {
      ok: true,
      item,
      message: `${gazecoin} Theme **${result.theme.label}** berhasil dibuka. Sisa saldo: **${formatCoins(payment.entry.balance)}**.`
    };
  }

  if (item.category === "title") {
    const result = unlockProfileTitlePurchase(guild.id, member.id, item.unlockKey);

    if (!result.ok) {
      updateEconomyEntry(guild.id, member.id, (current) => ({
        balance: (current.balance || 0) + item.cost,
        totalSpent: Math.max(0, (current.totalSpent || 0) - item.cost)
      }));
      return result;
    }

    return {
      ok: true,
      item,
      message: `${gazecoin} Title **${result.title.label}** berhasil dibuka. Sisa saldo: **${formatCoins(payment.entry.balance)}**.`
    };
  }

  if (item.key === "custom-role-pass") {
    const { expiresAt } = grantShopCustomRoleAccess(guild.id, member.id, 30, "shop");
    await reconcileCustomRoleMember(member, guild.client).catch(() => null);

    return {
      ok: true,
      item,
      message: `${gazecoin} Custom role pass aktif sampai <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>. Sisa saldo: **${formatCoins(payment.entry.balance)}**.`
    };
  }

  if (item.key === "private-room-extend") {
    const extension = extendOwnedPrivateRoom(guild.id, member.id, 12);

    if (!extension.ok) {
      updateEconomyEntry(guild.id, member.id, (current) => ({
        balance: (current.balance || 0) + item.cost,
        totalSpent: Math.max(0, (current.totalSpent || 0) - item.cost)
      }));

      return extension;
    }

    return {
      ok: true,
      item,
      message: `${gazecoin} Private room kamu diperpanjang 12 jam. Expire baru: <t:${Math.floor(new Date(extension.expiresAt).getTime() / 1000)}:F>. Sisa saldo: **${formatCoins(payment.entry.balance)}**.`
    };
  }

  return {
    ok: false,
    reason: "Item shop belum punya efek yang valid."
  };
}

module.exports = {
  GAZECOIN_NAME,
  GAZECOIN_SHORT,
  SHOP_ACCESS_LEVEL,
  SHOP_ITEMS,
  awardTrackedChatCoins,
  buildShopBalanceEmbed,
  buildShopCatalogEmbed,
  canUseShop,
  ensureShopAccess,
  formatCoins,
  getEconomySummary,
  getGazecoinDisplay,
  handleVoiceStateGazecoin,
  getShopItemByKey,
  grantCoinsToMember,
  hasShopAdminPermission,
  processVoiceCoinAwards,
  redeemShopItem,
  startShopEconomyScheduler
};
