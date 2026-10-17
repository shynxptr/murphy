const { ChannelType } = require("discord.js");

function resolveTextChannel(message, value) {
  if (!value) {
    return message.channel?.isTextBased() && !message.channel.isDMBased() ? message.channel : null;
  }

  const normalized = value.replace(/[<#>]/g, "");
  const channel = message.guild.channels.cache.get(normalized);

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return null;
  }

  return channel;
}

function resolveVoiceChannel(message, value) {
  if (!value) {
    return message.member?.voice?.channel?.type === ChannelType.GuildVoice
      ? message.member.voice.channel
      : null;
  }

  const normalized = value.replace(/[<#>]/g, "");
  const channel = message.guild.channels.cache.get(normalized);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return null;
  }

  return channel;
}

function resolveCategoryChannel(message, value) {
  if (!value) {
    return message.channel.parent?.type === ChannelType.GuildCategory ? message.channel.parent : null;
  }

  const normalized = value.replace(/[<#>]/g, "");
  const channel = message.guild.channels.cache.get(normalized);

  if (!channel || channel.type !== ChannelType.GuildCategory) {
    return null;
  }

  return channel;
}

function resolveLogChannel(message, value) {
  if (!value) {
    const ch = message.channel;
    if (ch && (ch.isTextBased() || ch.type === ChannelType.GuildForum) && !ch.isDMBased()) {
      return ch;
    }
    return null;
  }

  const normalized = value.replace(/[<#>]/g, "");
  const channel = message.guild.channels.cache.get(normalized);

  if (!channel || channel.isDMBased()) {
    return null;
  }

  if (channel.isTextBased() || channel.type === ChannelType.GuildForum) {
    return channel;
  }

  return null;
}

module.exports = {
  resolveCategoryChannel,
  resolveLogChannel,
  resolveTextChannel,
  resolveVoiceChannel
};
