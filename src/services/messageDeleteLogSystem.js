const { ChannelType, EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./guildConfigService");

const MSG_DELETE_LOG_THREAD_NAME = "Message Delete Log";

function getMsgDeleteLogSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    msgDeleteLog: {
      channelId: ""
    }
  });

  return settings.msgDeleteLog || { channelId: "" };
}

function setMsgDeleteLogChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    msgDeleteLog: {
      ...(current.msgDeleteLog || {}),
      channelId
    }
  }));
}

async function sendMsgDeleteLogToForum(guild, forumChannel, embed) {
  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === MSG_DELETE_LOG_THREAD_NAME && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === MSG_DELETE_LOG_THREAD_NAME
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Message delete log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  await forumChannel.threads.create({
    name: MSG_DELETE_LOG_THREAD_NAME,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

async function sendMsgDeleteLog(guild, embed) {
  const settings = getMsgDeleteLogSettings(guild.id);
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
    await sendMsgDeleteLogToForum(guild, channel, embed);
    return;
  }

  if (channel.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

function buildMsgDeleteLogEmbed({ author, content, channel, deletedAt, fields = [] }) {
  const embed = new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle("Message Deleted")
    .setTimestamp();

  if (author) {
    embed.setDescription(
      `Pesan dari **${author.tag}** (\`${author.id}\`) di ${channel} dihapus.`
    );
  } else {
    embed.setDescription(`Sebuah pesan di ${channel} dihapus.`);
  }

  embed.addFields(
    { name: "Channel", value: `${channel} (\`${channel.id}\`)`, inline: false },
    { name: "Deleted At", value: `<t:${Math.floor(deletedAt.getTime() / 1000)}:F>`, inline: false }
  );

  if (content) {
    embed.addFields({ name: "Content", value: content.slice(0, 1024) || "(empty)", inline: false });
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  if (author) {
    embed.setFooter({ text: `User ID: ${author.id}` });
  }

  return embed;
}

module.exports = {
  buildMsgDeleteLogEmbed,
  getMsgDeleteLogSettings,
  sendMsgDeleteLog,
  setMsgDeleteLogChannel
};
