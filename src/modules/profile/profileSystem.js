const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getProfileEntry, upsertProfileEntry } = require("../../services/profileStore");
const { listChatEntries, listDonators, listVoiceTotals, listVoicePairsForUser, getDonator } = require("../../services/leaderboardStore");
const { listPairs } = require("../../services/streakStore");
const { getCustomRoleRecord, getDonorGrant } = require("../../services/customRoleStore");
const { LEVEL_META, getMemberLevelInfo } = require("../levels/levelSystem");

const PROFILE_ACCESS_LEVEL = 3;
const PROFILE_SONG_LIMITS = {
  3: 2,
  4: 4,
  5: 6
};
const PROFILE_BIO_MAX_LENGTH = 140;

const PROFILE_THEMES = [
  {
    key: "midnight",
    label: "Midnight",
    minLevel: 3,
    backgroundAsset: "profile-obscura-bg.png",
    palette: {
      accent: "#77e7d8",
      accentSoft: "rgba(119, 231, 216, 0.18)",
      baseStart: "#09131f",
      baseEnd: "#04070b",
      glow: "rgba(68, 211, 194, 0.22)",
      panel: "rgba(9, 18, 28, 0.74)",
      panelStrong: "rgba(6, 13, 22, 0.86)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#f7fafc",
      textSecondary: "#c8d2dc",
      textMuted: "#8fa2b6"
    }
  },
  {
    key: "sunset",
    label: "Sunset",
    minLevel: 4,
    backgroundAsset: "profile-noctis-bg.png",
    backgroundOpacity: 1,
    vignetteOpacity: 0.06,
    shellFill: "rgba(11, 14, 20, 0.58)",
    palette: {
      accent: "#8fb7ff",
      accentSoft: "rgba(143, 183, 255, 0.18)",
      baseStart: "#0d1117",
      baseEnd: "#05070b",
      glow: "rgba(143, 183, 255, 0.18)",
      panel: "rgba(20, 26, 34, 0.54)",
      panelStrong: "rgba(13, 17, 24, 0.68)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#edf3fb",
      textSecondary: "#c4cfdd",
      textMuted: "#8794a6"
    }
  },
  {
    key: "tide",
    label: "Tidal Mint",
    minLevel: 4,
    kicker: "CORE CURRENT",
    palette: {
      accent: "#73f0c7",
      accentSoft: "rgba(115, 240, 199, 0.18)",
      baseStart: "#08211f",
      baseEnd: "#030709",
      glow: "rgba(90, 220, 196, 0.22)",
      panel: "rgba(7, 23, 23, 0.72)",
      panelStrong: "rgba(4, 15, 16, 0.86)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#effff9",
      textSecondary: "#cff8ec",
      textMuted: "#8ab8aa"
    }
  },
  {
    key: "crimson",
    label: "Crimson Crown",
    minLevel: 5,
    backgroundAsset: "profile-eclipse-bg.png",
    palette: {
      accent: "#ff6f88",
      accentSoft: "rgba(255, 111, 136, 0.2)",
      baseStart: "#290814",
      baseEnd: "#060507",
      glow: "rgba(255, 111, 136, 0.24)",
      panel: "rgba(31, 8, 16, 0.74)",
      panelStrong: "rgba(18, 6, 10, 0.88)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#fff6f8",
      textSecondary: "#ffd2da",
      textMuted: "#d1a1aa"
    }
  },
  {
    key: "gold",
    label: "Gold Ember",
    minLevel: 5,
    backgroundAsset: "profile-eclipse-bg.png",
    palette: {
      accent: "#ffd166",
      accentSoft: "rgba(255, 209, 102, 0.18)",
      baseStart: "#28190a",
      baseEnd: "#080707",
      glow: "rgba(255, 209, 102, 0.22)",
      panel: "rgba(33, 21, 10, 0.74)",
      panelStrong: "rgba(20, 13, 8, 0.88)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#fffaf0",
      textSecondary: "#f8e5b5",
      textMuted: "#ccb37f"
    }
  }
];

const PROFILE_TITLES = [
  { key: "regular", label: "Obscura Signal", minLevel: 3 },
  { key: "nightowl", label: "Night Owl", minLevel: 3 },
  { key: "locallegend", label: "Local Legend", minLevel: 3 },
  { key: "core", label: "Noctis Member", minLevel: 4 },
  { key: "innercircle", label: "Inner Circle", minLevel: 4 },
  { key: "signalkeeper", label: "Signal Keeper", minLevel: 4 },
  { key: "elite", label: "Eclipse Aura", minLevel: 5 },
  { key: "starlit", label: "Starlit One", minLevel: 5 },
  { key: "untouchable", label: "Untouchable", minLevel: 5 }
];

const SHOP_PROFILE_THEMES = [
  {
    key: "velvet",
    label: "Velvet Signal",
    minLevel: 4,
    shopOnly: true,
    kicker: "SHOP VELVET",
    palette: {
      accent: "#d8a4ff",
      accentSoft: "rgba(216, 164, 255, 0.18)",
      baseStart: "#16091f",
      baseEnd: "#050509",
      glow: "rgba(216, 164, 255, 0.22)",
      panel: "rgba(23, 10, 30, 0.74)",
      panelStrong: "rgba(14, 8, 20, 0.88)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#faf6ff",
      textSecondary: "#ead7fb",
      textMuted: "#bea9d2"
    }
  },
  {
    key: "frostline",
    label: "Frostline",
    minLevel: 4,
    shopOnly: true,
    kicker: "SHOP FROSTLINE",
    palette: {
      accent: "#8fe9ff",
      accentSoft: "rgba(143, 233, 255, 0.18)",
      baseStart: "#07141d",
      baseEnd: "#030608",
      glow: "rgba(143, 233, 255, 0.22)",
      panel: "rgba(7, 18, 24, 0.74)",
      panelStrong: "rgba(4, 12, 16, 0.88)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#f4fdff",
      textSecondary: "#d4f4fb",
      textMuted: "#95b8c4"
    }
  },
  {
    key: "royal-noir",
    label: "Royal Noir",
    minLevel: 5,
    shopOnly: true,
    kicker: "ELITE ROYAL NOIR",
    palette: {
      accent: "#7f5cff",
      accentSoft: "rgba(127, 92, 255, 0.18)",
      baseStart: "#120a25",
      baseEnd: "#040406",
      glow: "rgba(127, 92, 255, 0.24)",
      panel: "rgba(17, 10, 33, 0.76)",
      panelStrong: "rgba(10, 7, 20, 0.9)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#f8f6ff",
      textSecondary: "#dbd4ff",
      textMuted: "#a6a0cf"
    }
  },
  {
    key: "solar-flare",
    label: "Solar Flare",
    minLevel: 5,
    shopOnly: true,
    kicker: "ELITE SOLAR FLARE",
    palette: {
      accent: "#ff9f43",
      accentSoft: "rgba(255, 159, 67, 0.18)",
      baseStart: "#271003",
      baseEnd: "#060505",
      glow: "rgba(255, 159, 67, 0.24)",
      panel: "rgba(29, 12, 5, 0.76)",
      panelStrong: "rgba(17, 8, 6, 0.9)",
      line: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#fff8f1",
      textSecondary: "#ffe2c7",
      textMuted: "#d1ab84"
    }
  }
];

const SHOP_PROFILE_TITLES = [
  { key: "coin-runner", label: "Coin Runner", minLevel: 4, shopOnly: true },
  { key: "after-hours", label: "After Hours", minLevel: 4, shopOnly: true },
  { key: "crown-signal", label: "Crown Signal", minLevel: 5, shopOnly: true },
  { key: "velvet-royalty", label: "Velvet Royalty", minLevel: 5, shopOnly: true }
];

function getAllProfileThemes() {
  return [...PROFILE_THEMES, ...SHOP_PROFILE_THEMES];
}

function getAllProfileTitles() {
  return [...PROFILE_TITLES, ...SHOP_PROFILE_TITLES];
}

function normalizeUnlockedKeys(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeShortText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeFavoriteSongs(values) {
  return [...new Set((values || [])
    .map((value) => normalizeShortText(value, 60))
    .filter(Boolean))];
}

function getFavoriteSongLimit(level) {
  if (level >= 5) {
    return PROFILE_SONG_LIMITS[5];
  }

  if (level >= 4) {
    return PROFILE_SONG_LIMITS[4];
  }

  return PROFILE_SONG_LIMITS[3];
}

function getThemeByKey(themeKey) {
  return getAllProfileThemes().find((theme) => theme.key === themeKey) || null;
}

function getTitleByKey(titleKey) {
  return getAllProfileTitles().find((title) => title.key === titleKey) || null;
}

function getUnlockedProfileThemes(level, entry = null) {
  const purchased = new Set(normalizeUnlockedKeys(entry?.unlockedThemeKeys));

  return getAllProfileThemes().filter((theme) => {
    if (theme.shopOnly) {
      return purchased.has(theme.key);
    }

    return level >= theme.minLevel;
  });
}

function getUnlockedProfileTitles(level, entry = null) {
  const purchased = new Set(normalizeUnlockedKeys(entry?.unlockedTitleKeys));

  return getAllProfileTitles().filter((title) => {
    if (title.shopOnly) {
      return purchased.has(title.key);
    }

    return level >= title.minLevel;
  });
}

function getDefaultTheme(level) {
  const eligibleThemes = PROFILE_THEMES.filter((theme) => level >= theme.minLevel);

  if (!eligibleThemes.length) {
    return PROFILE_THEMES[0];
  }

  const highestMinLevel = Math.max(...eligibleThemes.map((theme) => theme.minLevel));
  return eligibleThemes.find((theme) => theme.minLevel === highestMinLevel) || eligibleThemes[0];
}

function getDefaultTitle(level) {
  const eligibleTitles = PROFILE_TITLES.filter((title) => level >= title.minLevel);

  if (eligibleTitles.length) {
    const highestMinLevel = Math.max(...eligibleTitles.map((title) => title.minLevel));
    return eligibleTitles.find((title) => title.minLevel === highestMinLevel) || eligibleTitles[0];
  }

  return {
    key: `level-${level}`,
    label: `${LEVEL_META[level]?.name || "Murphy Member"}`
  };
}

function getProfileVariant(level) {
  if (level >= 5) {
    return "premium";
  }

  if (level >= 4) {
    return "advanced";
  }

  return "basic";
}

function getProfileSongSummary(level, entry = null) {
  const limit = getFavoriteSongLimit(level);
  return normalizeFavoriteSongs(entry?.favoriteSongs).slice(0, limit);
}

function updateProfileBio(guildId, userId, bio) {
  const normalizedBio = normalizeShortText(bio, PROFILE_BIO_MAX_LENGTH);
  const next = upsertProfileEntry(guildId, userId, {
    bio: normalizedBio,
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    bio: next.bio || ""
  };
}

function addProfileFavoriteSong(guildId, userId, level, song) {
  const normalizedSong = normalizeShortText(song, 60);

  if (!normalizedSong) {
    return {
      ok: false,
      reason: "Masukkan judul lagu yang valid."
    };
  }

  const entry = getProfileEntry(guildId, userId) || {};
  const currentSongs = getProfileSongSummary(level, entry);

  if (currentSongs.includes(normalizedSong)) {
    return {
      ok: false,
      reason: "Lagu itu sudah ada di daftar favorit kamu."
    };
  }

  const limit = getFavoriteSongLimit(level);

  if (currentSongs.length >= limit) {
    return {
      ok: false,
      reason: `Tier kamu saat ini cuma bisa menyimpan ${limit} lagu favorit.`
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    favoriteSongs: [...currentSongs, normalizedSong],
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    songs: normalizeFavoriteSongs(next.favoriteSongs).slice(0, limit)
  };
}

function removeProfileFavoriteSong(guildId, userId, level, target) {
  const entry = getProfileEntry(guildId, userId) || {};
  const currentSongs = getProfileSongSummary(level, entry);

  if (!currentSongs.length) {
    return {
      ok: false,
      reason: "Daftar lagu favorit kamu masih kosong."
    };
  }

  const maybeIndex = Number.parseInt(String(target || "").trim(), 10);
  const nextSongs = Number.isInteger(maybeIndex) && maybeIndex > 0
    ? currentSongs.filter((_, index) => index !== (maybeIndex - 1))
    : currentSongs.filter((song) => song.toLowerCase() !== String(target || "").trim().toLowerCase());

  if (nextSongs.length === currentSongs.length) {
    return {
      ok: false,
      reason: "Lagu target tidak ditemukan. Pakai nomor urut atau judul yang persis."
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    favoriteSongs: nextSongs,
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    songs: normalizeFavoriteSongs(next.favoriteSongs).slice(0, getFavoriteSongLimit(level))
  };
}

function clearProfileFavoriteSongs(guildId, userId) {
  upsertProfileEntry(guildId, userId, {
    favoriteSongs: [],
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true
  };
}

function canUseProfileFeature(guildId, userId) {
  return getMemberLevelInfo(guildId, userId).level >= PROFILE_ACCESS_LEVEL;
}

function hasProfileAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function ensureProfileAccess(guildId, userId, member) {
  if (canUseProfileFeature(guildId, userId)) {
    return { ok: true };
  }

  if (member && hasProfileAdminPermission(member)) {
    return { ok: true, adminBypass: true };
  }

  return {
    ok: false,
    reason: "Profile card baru terbuka mulai Level 3."
  };
}

function getEffectiveProfileSettings(guildId, userId, level) {
  const entry = getProfileEntry(guildId, userId) || {};
  const unlockedThemes = getUnlockedProfileThemes(level, entry);
  const unlockedTitles = getUnlockedProfileTitles(level, entry);
  const theme = unlockedThemes.find((item) => item.key === entry.themeKey) || getDefaultTheme(level);
  const title = unlockedTitles.find((item) => item.key === entry.titleKey) || getDefaultTitle(level);

  return {
    theme,
    title,
    entry
  };
}

function updateProfileTheme(guildId, userId, level, themeKey) {
  const theme = getThemeByKey(themeKey);
  const entry = getProfileEntry(guildId, userId) || {};

  if (!theme) {
    return {
      ok: false,
      reason: "Theme profile tidak ditemukan."
    };
  }

  if (!getUnlockedProfileThemes(level, entry).some((item) => item.key === theme.key)) {
    return {
      ok: false,
      reason: theme.shopOnly
        ? `Theme **${theme.label}** harus dibeli dulu di shop.`
        : `Theme **${theme.label}** baru terbuka di Level ${theme.minLevel}.`
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    themeKey: theme.key,
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    theme,
    entry: next
  };
}

function updateProfileTitle(guildId, userId, level, titleKey) {
  const title = getTitleByKey(titleKey);
  const entry = getProfileEntry(guildId, userId) || {};

  if (!title) {
    return {
      ok: false,
      reason: "Title profile tidak ditemukan."
    };
  }

  if (!getUnlockedProfileTitles(level, entry).some((item) => item.key === title.key)) {
    return {
      ok: false,
      reason: title.shopOnly
        ? `Title **${title.label}** harus dibeli dulu di shop.`
        : `Title **${title.label}** baru terbuka di Level ${title.minLevel}.`
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    titleKey: title.key,
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    title,
    entry: next
  };
}

function formatDurationShort(totalMs) {
  const ms = Math.max(0, totalMs || 0);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function computeRank(entries, userId, valueGetter) {
  const sorted = [...entries].sort((left, right) => valueGetter(right) - valueGetter(left));
  const rank = sorted.findIndex((entry) => entry.userId === userId) + 1;

  return rank > 0 ? rank : 0;
}

function getChatMetrics(guildId, userId) {
  const entries = listChatEntries(guildId);
  const current = entries.find((entry) => entry.userId === userId) || null;
  return {
    totalMessages: current?.totalMessages || 0,
    chatRank: current ? computeRank(entries, userId, (entry) => entry.totalMessages || 0) : 0
  };
}

function getVoiceMetrics(guildId, userId) {
  const now = Date.now();
  const entries = listVoiceTotals(guildId).map((entry) => ({
    ...entry,
    effectiveTotalMs: Math.max(0, entry.totalMs || 0) + (entry.activeSession?.startedAt
      ? Math.max(0, now - new Date(entry.activeSession.startedAt).getTime())
      : 0)
  }));
  const current = entries.find((entry) => entry.userId === userId) || null;

  return {
    voiceTotalMs: current?.effectiveTotalMs || 0,
    voiceRank: current ? computeRank(entries, userId, (entry) => entry.effectiveTotalMs || 0) : 0
  };
}

async function getTopFriendMetrics(guild, userId) {
  const now = Date.now();
  const entries = listVoicePairsForUser(guild.id, userId)
    .map((entry) => {
      const otherUserId = Array.isArray(entry.userIds)
        ? entry.userIds.find((item) => item !== userId) || ""
        : "";

      return {
        ...entry,
        otherUserId,
        effectiveTotalMs: Math.max(0, entry.totalMs || 0) + (entry.activeSession?.startedAt
          ? Math.max(0, now - new Date(entry.activeSession.startedAt).getTime())
          : 0)
      };
    })
    .filter((entry) => entry.otherUserId)
    .sort((left, right) => right.effectiveTotalMs - left.effectiveTotalMs)
    .slice(0, 5);

  const resolved = await Promise.all(entries.map(async (entry) => {
    const member = guild.members.cache.get(entry.otherUserId) || await guild.members.fetch(entry.otherUserId).catch(() => null);
    const displayName = member?.displayName || member?.user?.globalName || member?.user?.username || "Unknown";

    return {
      userId: entry.otherUserId,
      displayName,
      totalMs: entry.effectiveTotalMs
    };
  }));

  return resolved;
}

function getDonationMetrics(guildId, userId) {
  const list = listDonators(guildId);
  const current = getDonator(guildId, userId);

  return {
    donationAmount: current?.amount || 0,
    donationRank: current ? computeRank(list, userId, (entry) => entry.amount || 0) : 0
  };
}

async function getStreakMetrics(guild, userId) {
  const pairs = listPairs((entry) =>
    entry.guildId === guild.id
    && Array.isArray(entry.userIds)
    && entry.userIds.includes(userId)
    && entry.acceptedAt
  );
  const bestStreak = pairs.reduce((max, pair) => Math.max(max, pair.bestStreak || 0), 0);
  const currentTopStreak = pairs.reduce((max, pair) => Math.max(max, pair.currentStreak || 0), 0);
  const topPartners = await Promise.all(
    [...pairs]
      .sort((left, right) => {
        if ((right.currentStreak || 0) !== (left.currentStreak || 0)) {
          return (right.currentStreak || 0) - (left.currentStreak || 0);
        }

        return (right.bestStreak || 0) - (left.bestStreak || 0);
      })
      .slice(0, 5)
      .map(async (pair) => {
        const partnerId = pair.userIds.find((entryUserId) => entryUserId !== userId) || "";
        const partnerMember = partnerId
          ? guild.members.cache.get(partnerId) || await guild.members.fetch(partnerId).catch(() => null)
          : null;

        return {
          userId: partnerId,
          displayName: partnerMember?.displayName || partnerMember?.user?.globalName || partnerMember?.user?.username || "Unknown",
          currentStreak: pair.currentStreak || 0,
          bestStreak: pair.bestStreak || 0
        };
      })
  );

  return {
    streakPairs: pairs.length,
    bestStreak,
    currentTopStreak,
    streakPartners: topPartners
  };
}

function buildProfileBadges(member, levelInfo, metrics) {
  const badges = [
    {
      key: "level",
      label: `${levelInfo.code} ${levelInfo.name}`,
      tone: "accent"
    }
  ];

  if (member.premiumSinceTimestamp) {
    badges.push({ key: "booster", label: "Booster", tone: "special" });
  }

  if (metrics.hasDonorGrant || metrics.donationAmount > 0) {
    badges.push({ key: "donatur", label: "Donatur", tone: "warm" });
  }

  if (metrics.hasCustomRole) {
    badges.push({ key: "custom-role", label: "Custom Role", tone: "cool" });
  }

  if (metrics.bestStreak >= 30) {
    badges.push({ key: "streak", label: `Streak ${metrics.bestStreak}`, tone: "highlight" });
  }

  return badges;
}

function buildProfileCatalogEmbed(levelInfo) {
  const entry = getProfileEntry(levelInfo.guildId, levelInfo.userId) || {};
  const unlockedThemes = getUnlockedProfileThemes(levelInfo.level, entry);
  const unlockedTitles = getUnlockedProfileTitles(levelInfo.level, entry);
  const lockedThemes = getAllProfileThemes().filter((theme) => !unlockedThemes.some((item) => item.key === theme.key));
  const lockedTitles = getAllProfileTitles().filter((title) => !unlockedTitles.some((item) => item.key === title.key));

  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Profile Unlock Catalog")
    .setDescription(`Tier kamu saat ini: **${levelInfo.code} ${levelInfo.name}**`)
    .addFields(
      {
        name: "Theme Terbuka",
        value: unlockedThemes.map((theme) => `- ${theme.label}`).join("\n") || "-",
        inline: true
      },
      {
        name: "Title Terbuka",
        value: unlockedTitles.map((title) => `- ${title.label}`).join("\n") || "-",
        inline: true
      },
      {
        name: "Masih Terkunci",
        value: [
          lockedThemes.length
            ? `Theme: ${lockedThemes.map((theme) => `${theme.label} (${theme.shopOnly ? `Shop L${theme.minLevel}` : `L${theme.minLevel}`})`).join(", ")}`
            : "Theme: -",
          lockedTitles.length
            ? `Title: ${lockedTitles.map((title) => `${title.label} (${title.shopOnly ? `Shop L${title.minLevel}` : `L${title.minLevel}`})`).join(", ")}`
            : "Title: -",
          `Slot lagu favorit: ${getFavoriteSongLimit(levelInfo.level)}`,
          `Bio profile: sampai ${PROFILE_BIO_MAX_LENGTH} karakter`
        ].join("\n"),
        inline: false
      }
    )
    .setTimestamp();
}

function unlockProfileThemePurchase(guildId, userId, themeKey) {
  const theme = getThemeByKey(themeKey);

  if (!theme?.shopOnly) {
    return {
      ok: false,
      reason: "Theme itu bukan item shop profile."
    };
  }

  const entry = getProfileEntry(guildId, userId) || {};
  const unlockedThemeKeys = normalizeUnlockedKeys(entry.unlockedThemeKeys);

  if (unlockedThemeKeys.includes(theme.key)) {
    return {
      ok: false,
      reason: `Theme **${theme.label}** sudah pernah kamu buka.`
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    unlockedThemeKeys: [...unlockedThemeKeys, theme.key],
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    theme,
    entry: next
  };
}

function unlockProfileTitlePurchase(guildId, userId, titleKey) {
  const title = getTitleByKey(titleKey);

  if (!title?.shopOnly) {
    return {
      ok: false,
      reason: "Title itu bukan item shop profile."
    };
  }

  const entry = getProfileEntry(guildId, userId) || {};
  const unlockedTitleKeys = normalizeUnlockedKeys(entry.unlockedTitleKeys);

  if (unlockedTitleKeys.includes(title.key)) {
    return {
      ok: false,
      reason: `Title **${title.label}** sudah pernah kamu buka.`
    };
  }

  const next = upsertProfileEntry(guildId, userId, {
    unlockedTitleKeys: [...unlockedTitleKeys, title.key],
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    title,
    entry: next
  };
}

async function buildProfileSnapshot(guild, member) {
  const levelInfo = getMemberLevelInfo(guild.id, member.id);
  const settings = getEffectiveProfileSettings(guild.id, member.id, levelInfo.level);
  const chatMetrics = getChatMetrics(guild.id, member.id);
  const voiceMetrics = getVoiceMetrics(guild.id, member.id);
  const topFriends = await getTopFriendMetrics(guild, member.id);
  const donationMetrics = getDonationMetrics(guild.id, member.id);
  const streakMetrics = await getStreakMetrics(guild, member.id);
  const donorGrant = getDonorGrant(guild.id, member.id);
  const customRoleRecord = getCustomRoleRecord(guild.id, member.id);
  const joinedAtLabel = member.joinedAt
    ? new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(member.joinedAt)
    : "-";

  const metrics = {
    ...chatMetrics,
    ...voiceMetrics,
    ...donationMetrics,
    ...streakMetrics,
    joinedAtLabel,
    topFriends,
    favoriteSongs: getProfileSongSummary(levelInfo.level, settings.entry),
    bio: normalizeShortText(settings.entry?.bio, PROFILE_BIO_MAX_LENGTH),
    favoriteSongLimit: getFavoriteSongLimit(levelInfo.level),
    hasDonorGrant: Boolean(donorGrant?.expiresAt && new Date(donorGrant.expiresAt).getTime() > Date.now()),
    hasCustomRole: Boolean(customRoleRecord?.roleId)
  };

  return {
    guild,
    member,
    levelInfo,
    variant: getProfileVariant(levelInfo.level),
    theme: settings.theme,
    title: settings.title,
    profileEntry: settings.entry,
    metrics,
    badges: buildProfileBadges(member, levelInfo, metrics)
  };
}

module.exports = {
  PROFILE_ACCESS_LEVEL,
  PROFILE_THEMES,
  PROFILE_TITLES,
  SHOP_PROFILE_THEMES,
  SHOP_PROFILE_TITLES,
  PROFILE_BIO_MAX_LENGTH,
  buildProfileCatalogEmbed,
  buildProfileSnapshot,
  canUseProfileFeature,
  ensureProfileAccess,
  formatDurationShort,
  getFavoriteSongLimit,
  getDefaultTheme,
  getDefaultTitle,
  getEffectiveProfileSettings,
  getProfileVariant,
  getThemeByKey,
  getTitleByKey,
  getAllProfileThemes,
  getAllProfileTitles,
  getUnlockedProfileThemes,
  getUnlockedProfileTitles,
  hasProfileAdminPermission,
  addProfileFavoriteSong,
  clearProfileFavoriteSongs,
  removeProfileFavoriteSong,
  unlockProfileThemePurchase,
  unlockProfileTitlePurchase,
  updateProfileBio,
  updateProfileTheme,
  updateProfileTitle
};
