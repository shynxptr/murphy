const { handleVoiceStateTracking } = require("../modules/leaderboards/leaderboardSystem");
const { handleMusicBoardVoiceState } = require("../modules/music/musicBoardSystem");
const { handleVoiceStateGazecoin } = require("../modules/shop/shopSystem");
const { handleTempVoiceStateUpdate } = require("../modules/temp-voice/tempVoiceSystem");
const { handleVoiceLog } = require("../modules/voice/voiceLogSystem");
const { handleVoiceAutoRoleState } = require("../modules/voice-roles/voiceAutoRoleSystem");
const { buildModLogEmbed, sendModLog } = require("../modules/moderation/modLogSystem");

// Log voice move + join/leave ke forum kategori voiceMove / voiceState.
async function handleModLogVoiceState(oldState, newState, client) {
  const member = newState.member || oldState.member;

  if (!member || !newState.guild) {
    return;
  }

  const oldChannel = oldState.channelId
    ? newState.guild.channels.cache.get(oldState.channelId)
    : null;
  const newChannel = newState.channelId
    ? newState.guild.channels.cache.get(newState.channelId)
    : null;

  // Join voice
  if (!oldChannel && newChannel) {
    const embed = buildModLogEmbed({
      title: "Voice Join",
      description: `${member.user} (\`${member.user.tag}\`) join voice channel ${newChannel}.`,
      color: 0x3b82f6,
      fields: [
        { name: "User", value: `${member.user} (\`${member.user.tag}\`)`, inline: false },
        { name: "Channel", value: `${newChannel}`, inline: true },
        { name: "Channel ID", value: `\`${newChannel.id}\``, inline: true }
      ],
      footerText: `User ID: ${member.id}`
    });

    await sendModLog(newState.guild, "voiceState", embed);
    return;
  }

  // Leave voice
  if (oldChannel && !newChannel) {
    const embed = buildModLogEmbed({
      title: "Voice Leave",
      description: `${member.user} (\`${member.user.tag}\`) leave voice channel ${oldChannel}.`,
      color: 0xf59e0b,
      fields: [
        { name: "User", value: `${member.user} (\`${member.user.tag}\`)`, inline: false },
        { name: "Channel", value: `${oldChannel}`, inline: true },
        { name: "Channel ID", value: `\`${oldChannel.id}\``, inline: true }
      ],
      footerText: `User ID: ${member.id}`
    });

    await sendModLog(newState.guild, "voiceState", embed);
    return;
  }

  // Move between channels
  if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    const embed = buildModLogEmbed({
      title: "Voice Move",
      description: `${member.user} (\`${member.user.tag}\`) dipindahkan dari ${oldChannel} ke ${newChannel}.`,
      color: 0x8b5cf6,
      fields: [
        { name: "User", value: `${member.user} (\`${member.user.tag}\`)`, inline: false },
        { name: "From", value: `${oldChannel}`, inline: true },
        { name: "To", value: `${newChannel}`, inline: true },
        { name: "User ID", value: `\`${member.id}\``, inline: false }
      ],
      footerText: `Guild ID: ${newState.guild.id}`
    });

    await sendModLog(newState.guild, "voiceMove", embed);
    return;
  }
}

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    await handleTempVoiceStateUpdate(oldState, newState, client);
    await handleVoiceStateGazecoin(oldState, newState, client);
    await handleVoiceStateTracking(oldState, newState);
    await handleMusicBoardVoiceState(oldState, newState);
    await handleVoiceLog(oldState, newState, client);
    await handleVoiceAutoRoleState(oldState, newState, client);
    await handleModLogVoiceState(oldState, newState, client);
  }
};
