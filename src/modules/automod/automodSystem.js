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

function getAutomodSettings(guildId) {
  return getGuildSettings(guildId, {
    automod: {
      logChannelId: "",
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
    logChannelId: channelId
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

async function sendAutomodLog(guild, settings, embed) {
  if (!settings.logChannelId) {
    return;
  }

  const logChannel = guild.channels.cache.get(settings.logChannelId)
    || await guild.channels.fetch(settings.logChannelId).catch(() => null);

  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    return;
  }

  await logChannel.send({
    embeds: [embed]
  }).catch(() => null);
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
    sendAutomodLog(message.guild, settings, buildAutomodLogEmbed(message, violation))
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
        name: "Routing",
        value: [
          `Log Channel: ${settings.logChannelId ? `<#${settings.logChannelId}>` : "`none`"}`,
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
  buildAutomodStatusEmbed,
  getAutomodSettings,
  handleAutomodMessage,
  removeBadWord,
  removeWhitelistChannel,
  removeWhitelistRole,
  setAutomodLogChannel,
  setAutomodRuleEnabled,
  setMentionLimit
};
