const { ChannelType, EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./guildConfigService");

const TICKET_LOG_THREAD_NAME = "Ticket Log";

function getTicketLogSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    ticketLog: {
      channelId: ""
    }
  });

  return settings.ticketLog || { channelId: "" };
}

function setTicketLogChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    ticketLog: {
      ...(current.ticketLog || {}),
      channelId
    }
  }));
}

async function sendTicketLogToForum(guild, forumChannel, embed) {
  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === TICKET_LOG_THREAD_NAME && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === TICKET_LOG_THREAD_NAME
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Ticket log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  await forumChannel.threads.create({
    name: TICKET_LOG_THREAD_NAME,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

async function sendTicketLog(guild, embed) {
  const settings = getTicketLogSettings(guild.id);
  const channelId = settings.channelId;

  if (!channelId) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return;
  }

  if (channel.type === ChannelType.GuildForum) {
    await sendTicketLogToForum(guild, channel, embed);
    return;
  }

  if (channel.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

function buildTicketLogEmbed({ title, description, color = "#111827", fields = [], footerText = "" }) {
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
  buildTicketLogEmbed,
  getTicketLogSettings,
  sendTicketLog,
  setTicketLogChannel
};
