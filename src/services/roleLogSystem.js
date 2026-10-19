const { ChannelType, EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../services/guildConfigService");

// Kategori log role yang didukung.
// key → dipakai sebagai property di settings.roleLog.channels
// label → dipakai untuk nama thread di forum + embed title.
const ROLE_LOG_CATEGORIES = [
  { key: "memberRole", label: "Member Role Changes" },
  { key: "roleCreate", label: "Role Created" },
  { key: "roleDelete", label: "Role Deleted" },
  { key: "roleUpdate", label: "Role Updated" }
];

const ROLE_LOG_DEFAULTS = ROLE_LOG_CATEGORIES.reduce((acc, cat) => {
  acc[cat.key] = "";
  return acc;
}, {});

function getRoleLogSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    roleLog: {
      channels: ROLE_LOG_DEFAULTS
    }
  });

  return settings.roleLog || { channels: ROLE_LOG_DEFAULTS };
}

function setRoleLogChannelForCategory(guildId, categoryKey, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    roleLog: {
      ...(current.roleLog || {}),
      channels: {
        ...ROLE_LOG_DEFAULTS,
        ...(current.roleLog?.channels || {}),
        [categoryKey]: channelId
      }
    }
  }));
}

function buildLogThreadName(categoryLabel) {
  return `[${categoryLabel}] — Role Log`;
}

async function sendRoleLogToForum(guild, forumChannel, categoryLabel, embed) {
  const threadName = buildLogThreadName(categoryLabel);

  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === threadName && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === threadName
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Role log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  await forumChannel.threads.create({
    name: threadName,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

async function sendRoleLog(guild, categoryKey, embed) {
  const settings = getRoleLogSettings(guild.id);
  const channelId = settings.channels?.[categoryKey];

  if (!channelId) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return;
  }

  const category = ROLE_LOG_CATEGORIES.find((cat) => cat.key === categoryKey);

  if (!category) {
    return;
  }

  if (channel.type === ChannelType.GuildForum) {
    await sendRoleLogToForum(guild, channel, category.label, embed);
    return;
  }

  if (channel.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

function buildRoleLogEmbed({ title, description, color = "#111827", fields = [], footerText = "" }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  return embed;
}

module.exports = {
  ROLE_LOG_CATEGORIES,
  buildRoleLogEmbed,
  getRoleLogSettings,
  sendRoleLog,
  setRoleLogChannelForCategory
};
