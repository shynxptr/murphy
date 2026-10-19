const { buildModLogEmbed, sendModLog } = require("../modules/moderation/modLogSystem");

module.exports = {
  name: "guildBanRemove",
  async execute(ban, client) {
    let moderatorTag = "Unknown";
    let reason = "No reason provided";

    try {
      const logs = await ban.guild.fetchAuditLogs({
        type: 23, // MemberBanRemove
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === ban.user.id
        && Date.now() - entry.createdTimestamp < 5000) {
        moderatorTag = entry.executor?.tag || "Unknown";
        reason = entry.reason || "No reason provided";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const embed = buildModLogEmbed({
      title: "Member Unbanned",
      description: `${ban.user} (\`${ban.user.tag}\`) telah di-unban dari server.`,
      color: 0x22c55e,
      fields: [
        { name: "User", value: `${ban.user} (\`${ban.user.tag}\`)`, inline: false },
        { name: "Moderator", value: moderatorTag, inline: true },
        { name: "Reason", value: reason, inline: true }
      ],
      footerText: `User ID: ${ban.user.id}`
    });

    await sendModLog(ban.guild, "ban", embed);
  }
};
