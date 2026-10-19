const { buildModLogEmbed, sendModLog } = require("../modules/moderation/modLogSystem");

module.exports = {
  name: "guildBanAdd",
  async execute(ban, client) {
    // Coba ambil audit log untuk tau siapa moderator yang ban
    let moderatorTag = "Unknown";
    let reason = "No reason provided";

    try {
      const logs = await ban.guild.fetchAuditLogs({
        type: 22, // MemberBanAdd
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
      title: "Member Banned",
      description: `${ban.user} (\`${ban.user.tag}\`) telah di-ban dari server.`,
      color: 0xef4444,
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
