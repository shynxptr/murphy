const { ChannelType } = require("discord.js");
const { buildModLogEmbed, sendModLog } = require("../modules/moderation/modLogSystem");

const CHANNEL_TYPE_LABELS = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildCategory]: "Category",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.GuildStageVoice]: "Stage Voice",
  [ChannelType.GuildDirectory]: "Directory"
};

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    if (!channel.guild) {
      return;
    }

    let creatorTag = "Unknown";

    try {
      const logs = await channel.guild.fetchAuditLogs({
        type: 10, // ChannelCreate
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === channel.id
        && Date.now() - entry.createdTimestamp < 5000) {
        creatorTag = entry.executor?.tag || "Unknown";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const typeLabel = CHANNEL_TYPE_LABELS[channel.type] || "Unknown";

    const embed = buildModLogEmbed({
      title: "Channel Created",
      description: `${channel} (\`${channel.name}\`) telah dibuat.`,
      color: 0x10b981,
      fields: [
        { name: "Channel", value: `${channel}`, inline: false },
        { name: "Type", value: typeLabel, inline: true },
        { name: "Creator", value: creatorTag, inline: true },
        { name: "Channel ID", value: `\`${channel.id}\``, inline: true }
      ],
      footerText: `Guild ID: ${channel.guild.id}`
    });

    await sendModLog(channel.guild, "channel", embed);
  }
};
