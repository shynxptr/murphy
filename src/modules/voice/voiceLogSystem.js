const { EmbedBuilder } = require("discord.js");

const VOICE_COLORS = {
  join: "#3B82F6",
  leave: "#F59E0B"
};

const VOICE_LOG_TIMEOUT_MS = 60 * 1000; // 1 menit

function buildVoiceEmbed(member, action, channelName) {
  const unix = Math.floor(Date.now() / 1000);
  const title = action === "join" ? "Join Voice" : "Leave Voice";
  const verb = action === "join" ? "bergabung ke" : "keluar dari";

  return new EmbedBuilder()
    .setColor(VOICE_COLORS[action])
    .setTitle(title)
    .setDescription(`${member} ${verb} **${channelName}**\n<t:${unix}:f>`);
}

async function sendVoiceLog(channel, embed) {
  if (!channel?.isTextBased?.() || !channel.messages) {
    return;
  }

  const sentMessage = await channel.send({
    embeds: [embed]
  }).catch(() => null);

  if (sentMessage) {
    const timer = setTimeout(() => {
      sentMessage.delete().catch(() => null);
    }, VOICE_LOG_TIMEOUT_MS);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }
}

async function handleVoiceLog(oldState, newState) {
  const member = newState.member || oldState.member;

  if (!member || member.user?.bot) {
    return;
  }

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  if (oldChannel?.id === newChannel?.id) {
    return;
  }

  if (!oldChannel && newChannel) {
    await sendVoiceLog(newChannel, buildVoiceEmbed(member, "join", newChannel.name));
    return;
  }

  if (oldChannel && !newChannel) {
    await sendVoiceLog(oldChannel, buildVoiceEmbed(member, "leave", oldChannel.name));
    return;
  }

  if (oldChannel && newChannel) {
    await sendVoiceLog(oldChannel, buildVoiceEmbed(member, "leave", oldChannel.name));
    await sendVoiceLog(newChannel, buildVoiceEmbed(member, "join", newChannel.name));
  }
}

module.exports = {
  handleVoiceLog
};
