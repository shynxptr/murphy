const { buildRoleLogEmbed, sendRoleLog } = require("../services/roleLogSystem");

module.exports = {
  name: "roleDelete",
  async execute(role, client) {
    if (!role.guild) {
      return;
    }

    let deleterTag = "Unknown";
    let deleterId = "";

    try {
      const logs = await role.guild.fetchAuditLogs({
        type: 32, // RoleDelete
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === role.id
        && Date.now() - entry.createdTimestamp < 5000) {
        deleterTag = entry.executor?.tag || "Unknown";
        deleterId = entry.executor?.id || "";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const isBotAction = deleterId === client.user?.id;
    const actionSource = isBotAction ? "Bot" : deleterId ? "User" : "Unknown";

    const embed = buildRoleLogEmbed({
      title: "Role Deleted",
      description: `Role telah dihapus: \`${role.name}\`.`,
      color: "#ef4444",
      fields: [
        { name: "Role Name", value: `\`${role.name}\``, inline: false },
        { name: "Deleted By", value: `${deleterTag}${isBotAction ? " (Bot)" : ""}`, inline: true },
        { name: "Source", value: actionSource, inline: true },
        { name: "Role ID", value: `\`${role.id}\``, inline: true },
        { name: "Color", value: `\`${role.hexColor}\``, inline: true }
      ],
      footerText: `Role ID: ${role.id}`
    });

    await sendRoleLog(role.guild, "roleDelete", embed);
  }
};
