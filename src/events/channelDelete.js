const { ChannelType } = require("discord.js");
const { handleDeletedPrivateRoom } = require("../modules/private-rooms/privateRoomSystem");
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
  name: "channelDelete",
  async execute(channel, client) {
    handleDeletedPrivateRoom(channel);

    if (!channel.guild) {
      return;
    }

    let deleterTag = "Unknown";

    try {
      const logs = await channel.guild.fetchAuditLogs({
        type: 12, // ChannelDelete
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === channel.id
        && Date.now() - entry.createdTimestamp < 5000) {
        deleterTag = entry.executor?.tag || "Unknown";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const typeLabel = CHANNEL_TYPE_LABELS[channel.type] || "Unknown";

    const embed = buildModLogEmbed({
      title: "Channel Deleted",
      description: `\`#${channel.name}\` (tipe: ${typeLabel}) telah dihapus.`,
      color: 0xef4444,
      fields: [
        { name: "Channel Name", value: `\`#${channel.name}\``, inline: false },
        { name: "Type", value: typeLabel, inline: true },
        { name: "Deleted By", value: deleterTag, inline: true },
        { name: "Channel ID", value: `\`${channel.id}\``, inline: true }
      ],
      footerText: `Guild ID: ${channel.guild.id}`
    });

    await sendModLog(channel.guild, "channel", embed);
  }
};

