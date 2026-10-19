const { buildRoleLogEmbed, sendRoleLog } = require("../services/roleLogSystem");

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    if (!role.guild) {
      return;
    }

    let creatorTag = "Unknown";
    let creatorId = "";

    try {
      const logs = await role.guild.fetchAuditLogs({
        type: 30, // RoleCreate
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === role.id
        && Date.now() - entry.createdTimestamp < 5000) {
        creatorTag = entry.executor?.tag || "Unknown";
        creatorId = entry.executor?.id || "";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const isBotAction = creatorId === client.user?.id;
    const actionSource = isBotAction ? "Bot" : creatorId ? "User" : "Unknown";

    const embed = buildRoleLogEmbed({
      title: "Role Created",
      description: `Role baru telah dibuat: ${role} (\`${role.name}\`).`,
      color: "#10b981",
      fields: [
        { name: "Role", value: `${role} (\`${role.name}\`)`, inline: false },
        { name: "Created By", value: `${creatorTag}${isBotAction ? " (Bot)" : ""}`, inline: true },
        { name: "Source", value: actionSource, inline: true },
        { name: "Role ID", value: `\`${role.id}\``, inline: true },
        { name: "Color", value: `\`${role.hexColor}\``, inline: true },
        { name: "Position", value: `\`${role.position}\``, inline: true },
        { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true }
      ],
      footerText: `Role ID: ${role.id}`
    });

    await sendRoleLog(role.guild, "roleCreate", embed);
  }
};
