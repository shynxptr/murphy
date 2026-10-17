const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");

const INVITE_REGEX = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+\b/i;
const LINK_REGEX = /\b(?:(?:https?:\/\/)|(?:www\.))[^\s<]+/i;
const AUTOMOD_NOTICE_TTL_MS = 8000;
const STAFF_EXEMPT_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers
];

// Mapping kategori pelanggaran ke key di settings.logChannels.
// Harus sinkron dengan detectAutomodViolation output ruleLabel.
const AUTOMOD_LOG_CATEGORIES = [
  { key: "antiInvite", label: "Anti Invite" },
  { key: "antiLink", label: "Anti Link" },
  { key: "mentionLimit", label: "Mention Limit" },
  { key: "badWords", label: "Bad Words" }
];

// Nama thread yang dibuat/dicari di forum untuk tiap kategori.
// Format: "[Kategori] — Automod Log" biar unik dan mudah dicari.
function buildLogThreadName(categoryLabel) {
  return `[${categoryLabel}] — Automod Log`;
}

function getAutomodSettings(guildId) {
  return getGuildSettings(guildId, {
    automod: {
      logChannels: {
        antiInvite: "",
        antiLink: "",
        mentionLimit: "",
        badWords: ""
      },
      whitelistChannelIds: [],
      whitelistRoleIds: [],
      antiInvite: {
        enabled: false
      },
      antiLink: {
        enabled: false
      },
      mentionLimit: 0,
      badWords: {
        enabled: false,
        words: []
      }
    }
  }).automod;
}

function updateAutomodSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const currentSettings = getAutomodSettings(guildId);

    return {
      ...current,
      automod: updater(currentSettings, current.automod || {})
    };
  }).automod;
}

function setAutomodLogChannel(guildId, channelId) {
  return updateAutomodSettings(guildId, (current) => ({
    ...current,
    logChannels: {
      ...(current.logChannels || {}),
      // Legacy support: set ke semua kategori kalau dipanggil tanpa kategori
      antiInvite: channelId,
      antiLink: channelId,
      mentionLimit: channelId,
      badWords: channelId
    }
  }));
}

function setAutomodLogChannelForCategory(guildId, categoryKey, channelId) {
  return updateAutomodSettings(guildId, (current) => ({
    ...current,
    logChannels: {
      ...(current.logChannels || {}),
      [categoryKey]: channelId
    }
  }));
}

function setAutomodRuleEnabled(guildId, ruleKey, enabled) {
  return updateAutomodSettings(guildId, (current) => ({
    ...current,
    [ruleKey]: {
      ...(current[ruleKey] || {}),
      enabled
    }
  }));
}

function setMentionLimit(guildId, limit) {
  return updateAutomodSettings(guildId, (current) => ({
    ...current,
    mentionLimit: limit
  }));
}

function normalizeTerm(value) {
  return value?.toLowerCase().trim().replace(/\s+/g, " ") || "";
}

function addBadWord(guildId, word) {
  const normalizedWord = normalizeTerm(word);

  if (!normalizedWord) {
    return {
      ok: false,
      reason: "Kata yang ingin ditambahkan tidak valid."
    };
  }

  const settings = getAutomodSettings(guildId);

  if (settings.badWords.words.includes(normalizedWord)) {
    return {
      ok: false,
      reason: "Kata itu sudah ada di daftar bad words."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      badWords: {
        ...(current.badWords || {}),
        words: [...(current.badWords?.words || []), normalizedWord].sort((left, right) => left.localeCompare(right))
      }
    }))
  };
}

function removeBadWord(guildId, word) {
  const normalizedWord = normalizeTerm(word);
  const settings = getAutomodSettings(guildId);

  if (!settings.badWords.words.includes(normalizedWord)) {
    return {
      ok: false,
      reason: "Kata itu tidak ada di daftar bad words."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      badWords: {
        ...(current.badWords || {}),
        words: (current.badWords?.words || []).filter((entry) => entry !== normalizedWord)
      }
    }))
  };
}

function addWhitelistChannel(guildId, channelId) {
  const settings = getAutomodSettings(guildId);

  if (settings.whitelistChannelIds.includes(channelId)) {
    return {
      ok: false,
      reason: "Channel itu sudah ada di whitelist automod."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      whitelistChannelIds: [...(current.whitelistChannelIds || []), channelId]
    }))
  };
}

function removeWhitelistChannel(guildId, channelId) {
  const settings = getAutomodSettings(guildId);

  if (!settings.whitelistChannelIds.includes(channelId)) {
    return {
      ok: false,
      reason: "Channel itu tidak ada di whitelist automod."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      whitelistChannelIds: (current.whitelistChannelIds || []).filter((entry) => entry !== channelId)
    }))
  };
}

function addWhitelistRole(guildId, roleId) {
  const settings = getAutomodSettings(guildId);

  if (settings.whitelistRoleIds.includes(roleId)) {
    return {
      ok: false,
      reason: "Role itu sudah ada di whitelist automod."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      whitelistRoleIds: [...(current.whitelistRoleIds || []), roleId]
    }))
  };
}

function removeWhitelistRole(guildId, roleId) {
  const settings = getAutomodSettings(guildId);

  if (!settings.whitelistRoleIds.includes(roleId)) {
    return {
      ok: false,
      reason: "Role itu tidak ada di whitelist automod."
    };
  }

  return {
    ok: true,
    settings: updateAutomodSettings(guildId, (current) => ({
      ...current,
      whitelistRoleIds: (current.whitelistRoleIds || []).filter((entry) => entry !== roleId)
    }))
  };
}

function hasStaffExemptPermission(member) {
  return STAFF_EXEMPT_PERMISSIONS.some((permission) => member.permissions.has(permission));
}

function countMentions(message) {
  return message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatchedBadWord(content, words) {
  const normalizedContent = normalizeTerm(content);

  for (const word of words) {
    const normalizedWord = normalizeTerm(word);

    if (!normalizedWord) {
      continue;
    }

    if (normalizedWord.includes(" ")) {
      if (normalizedContent.includes(normalizedWord)) {
        return normalizedWord;
      }

      continue;
    }

    const regex = new RegExp(`(^|\\W)${escapeRegex(normalizedWord)}(?=$|\\W)`, "i");

    if (regex.test(content)) {
      return normalizedWord;
    }
  }

  return null;
}

function detectAutomodViolation(message, settings) {
  const content = message.content || "";

  if (settings.antiInvite.enabled) {
    const inviteMatch = content.match(INVITE_REGEX);

    if (inviteMatch) {
      return {
        ruleKey: "antiInvite",
        ruleLabel: "Anti Invite",
        reason: "Link undangan Discord tidak diizinkan di channel ini.",
        details: inviteMatch[0]
      };
    }
  }

  if (settings.antiLink.enabled) {
    const linkMatch = content.match(LINK_REGEX);

    if (linkMatch) {
      return {
        ruleKey: "antiLink",
        ruleLabel: "Anti Link",
        reason: "Link tidak diizinkan di channel ini.",
        details: linkMatch[0]
      };
    }
  }

  if (settings.mentionLimit > 0) {
    const mentionCount = countMentions(message);

    if (mentionCount > settings.mentionLimit) {
      return {
        ruleKey: "mentionLimit",
        ruleLabel: "Mention Limit",
        reason: `Pesan melebihi batas mention server (${settings.mentionLimit}).`,
        details: `${mentionCount} mention`
      };
    }
  }

  if (settings.badWords.enabled && settings.badWords.words.length) {
    const matchedWord = findMatchedBadWord(content, settings.badWords.words);

    if (matchedWord) {
      return {
        ruleKey: "badWords",
        ruleLabel: "Bad Words",
        reason: "Pesan mengandung kata yang diblokir automod.",
        details: matchedWord
      };
    }
  }

  return null;
}

function isAutomodExempt(message, settings) {
  if (!message.member) {
    return true;
  }

  if (hasStaffExemptPermission(message.member)) {
    return true;
  }

  if (settings.whitelistChannelIds.includes(message.channelId)) {
    return true;
  }

  return message.member.roles.cache.some((role) => settings.whitelistRoleIds.includes(role.id));
}

function truncateText(value, maxLength = 600) {
  if (!value) {
    return "`-`";
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3).trimEnd()}...`
    : value;
}

async function sendTemporaryNotice(message, reason) {
  const notice = await message.channel.send({
    content: `${message.author}, pesan kamu dihapus oleh automod.\nAlasan: ${reason}`
  }).catch(() => null);

  if (!notice) {
    return;
  }

  setTimeout(() => {
    notice.delete().catch(() => null);
  }, AUTOMOD_NOTICE_TTL_MS);
}

function buildAutomodLogEmbed(message, violation) {
  return new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle(`Automod Triggered: ${violation.ruleLabel}`)
    .addFields(
      {
        name: "User",
        value: `${message.author} (\`${message.author.tag}\`)`,
        inline: false
      },
      {
        name: "Channel",
        value: `${message.channel}`,
        inline: true
      },
      {
        name: "Match",
        value: `\`${truncateText(violation.details, 120)}\``,
        inline: true
      },
      {
        name: "Message",
        value: truncateText(message.content, 1000),
        inline: false
      }
    )
    .setFooter({
      text: `Guild ID: ${message.guild.id} | User ID: ${message.author.id}`
    })
    .setTimestamp();
}

// Kirim log ke thread yang sudah ada di forum. Kalau belum ada, buat thread baru
// dengan nama yang fix per kategori (mis. "[Anti Invite] — Automod Log").
// Semua log kategori yang sama bakal balas ke thread yang sama.
async function sendAutomodLogToForum(guild, forumChannel, categoryLabel, embed) {
  const threadName = buildLogThreadName(categoryLabel);

  // Cari thread yang sudah ada di forum dengan nama yang matching.
  // archived threads bisa di-unarchive, jadi kita fetch dulu.
  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === threadName && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  // Cek archived threads juga
  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === threadName
  );

  if (archivedMatch) {
    // Unarchive dulu kalau perlu, baru kirim
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Automod log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  // Belum ada thread untuk kategori ini → buat thread baru
  await forumChannel.threads.create({
    name: threadName,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

async function sendAutomodLog(guild, settings, embed, violation) {
  // Kalau violation ga punya ruleKey (kasus legacy/manual), skip
  if (!violation?.ruleKey) {
    return;
  }

  const logChannelId = settings.logChannels?.[violation.ruleKey];

  // Hanya pakai logChannels baru. Kalau ga diset, log ga dikirim.
  if (!logChannelId) {
    return;
  }

  const logChannel = guild.channels.cache.get(logChannelId)
    || await guild.channels.fetch(logChannelId).catch(() => null);

  if (!logChannel) {
    return;
  }

  // Forum channel: kirim ke thread per kategori
  if (logChannel.type === ChannelType.GuildForum) {
    await sendAutomodLogToForum(guild, logChannel, violation.ruleLabel, embed);
    return;
  }

  // Text channel fallback: kirim embed langsung (kalau admin set text channel)
  if (logChannel.type === ChannelType.GuildText) {
    await logChannel.send({ embeds: [embed] }).catch(() => null);
  }
}

function hasActiveAutomodRules(settings) {
  return Boolean(
    settings.antiInvite.enabled
    || settings.antiLink.enabled
    || settings.mentionLimit > 0
    || (settings.badWords.enabled && settings.badWords.words.length)
  );
}

async function handleAutomodMessage(message) {
  const settings = getAutomodSettings(message.guild.id);

  if (!hasActiveAutomodRules(settings)) {
    return false;
  }

  if (isAutomodExempt(message, settings)) {
    return false;
  }

  const violation = detectAutomodViolation(message, settings);

  if (!violation) {
    return false;
  }

  const deleted = await message.delete().then(() => true).catch(() => false);

  if (!deleted) {
    return false;
  }

  await Promise.allSettled([
    sendTemporaryNotice(message, violation.reason),
    sendAutomodLog(message.guild, settings, buildAutomodLogEmbed(message, violation), violation)
  ]);

  return true;
}

function formatToggle(enabled) {
  return enabled ? "`on`" : "`off`";
}

function buildAutomodStatusEmbed(guild) {
  const settings = getAutomodSettings(guild.id);
  const whitelistChannels = settings.whitelistChannelIds.length
    ? settings.whitelistChannelIds.map((channelId) => `<#${channelId}>`).join(", ")
    : "`none`";
  const whitelistRoles = settings.whitelistRoleIds.length
    ? settings.whitelistRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
    : "`none`";

  const FIELD_LIMIT = 1024;

  function buildBadWordFields(words) {
    if (!words.length) {
      return [{ name: "Bad Word List", value: "`none`", inline: false }];
    }

    const fields = [];
    let current = "";
    let fieldIndex = 0;

    for (const word of words) {
      const formatted = `\`${word}\``;
      const separator = current ? ", " : "";
      const next = current + separator + formatted;

      if (next.length > FIELD_LIMIT) {
        if (current) {
          fields.push({
            name: fieldIndex === 0 ? `Bad Word List (${words.length})` : "Bad Word List (cont.)",
            value: current,
            inline: false
          });
          fieldIndex++;
        }

        current = formatted;
      } else {
        current = next;
      }
    }

    if (current) {
      fields.push({
        name: fieldIndex === 0 ? `Bad Word List (${words.length})` : "Bad Word List (cont.)",
        value: current,
        inline: false
      });
    }

    return fields;
  }

  const embed = new EmbedBuilder()
    .setColor("#111827")
    .setTitle("Automod Lite Status")
    .setDescription("Semua rule disiapkan dulu dalam keadaan off, lalu bisa dinyalakan kapan saja.")
    .addFields(
      {
        name: "Rules",
        value: [
          `Anti Invite: ${formatToggle(settings.antiInvite.enabled)}`,
          `Anti Link: ${formatToggle(settings.antiLink.enabled)}`,
          `Bad Words: ${formatToggle(settings.badWords.enabled)}`,
          `Mention Limit: ${settings.mentionLimit > 0 ? `\`${settings.mentionLimit}\`` : "`off`"}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Log Channels (Forum per Kategori)",
        value: AUTOMOD_LOG_CATEGORIES.map((cat) => {
          const channelId = settings.logChannels?.[cat.key];
          return `${cat.label}: ${channelId ? `<#${channelId}>` : "`none`"}`;
        }).join("\n"),
        inline: true
      },
      {
        name: "Routing",
        value: [
          `Whitelisted Channels: ${whitelistChannels}`,
          `Whitelisted Roles: ${whitelistRoles}`
        ].join("\n"),
        inline: true
      },
      ...buildBadWordFields(settings.badWords.words)
    )
    .setFooter({
      text: `${guild.name} automod configuration`
    })
    .setTimestamp();

  return embed;
}


module.exports = {
  addBadWord,
  addWhitelistChannel,
  addWhitelistRole,
  AUTOMOD_LOG_CATEGORIES,
  buildAutomodStatusEmbed,
  getAutomodSettings,
  handleAutomodMessage,
  removeBadWord,
  removeWhitelistChannel,
  removeWhitelistRole,
  setAutomodLogChannel,
  setAutomodLogChannelForCategory,
  setAutomodRuleEnabled,
  setMentionLimit
};
