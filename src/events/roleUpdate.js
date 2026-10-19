const { buildRoleLogEmbed, sendRoleLog } = require("../services/roleLogSystem");

module.exports = {
  name: "roleUpdate",
  async execute(oldRole, newRole, client) {
    if (!newRole.guild) {
      return;
    }

    const changes = [];
    const fields = [];

    // Cek perubahan nama
    if (oldRole.name !== newRole.name) {
      changes.push("Name");
      fields.push({
        name: "Name Change",
        value: `\`${oldRole.name}\` → \`${newRole.name}\``,
        inline: false
      });
    }

    // Cek perubahan warna
    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push("Color");
      fields.push({
        name: "Color Change",
        value: `\`${oldRole.hexColor}\` → \`${newRole.hexColor}\``,
        inline: false
      });
    }

    // Cek perubahan icon
    if (oldRole.icon !== newRole.icon) {
      changes.push("Icon");
      fields.push({
        name: "Icon Change",
        value: `${oldRole.icon ? "Has icon" : "No icon"} → ${newRole.icon ? "Has icon" : "No icon"}`,
        inline: false
      });
    }

    // Cek perubahan unicode emoji
    if (oldRole.unicodeEmoji !== newRole.unicodeEmoji) {
      changes.push("Emoji");
      fields.push({
        name: "Emoji Change",
        value: `\`${oldRole.unicodeEmoji || "none"}\` → \`${newRole.unicodeEmoji || "none"}\``,
        inline: false
      });
    }

    // Cek perubahan mentionable
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push("Mentionable");
      fields.push({
        name: "Mentionable",
        value: `${oldRole.mentionable ? "Yes" : "No"} → ${newRole.mentionable ? "Yes" : "No"}`,
        inline: false
      });
    }

    // Cek perubahan hoist
    if (oldRole.hoist !== newRole.hoist) {
      changes.push("Hoist");
      fields.push({
        name: "Displayed Separately (Hoist)",
        value: `${oldRole.hoist ? "Yes" : "No"} → ${newRole.hoist ? "Yes" : "No"}`,
        inline: false
      });
    }

    // Cek perubahan permissions
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.push("Permissions");
      const oldPerms = oldRole.permissions.toArray();
      const newPerms = newRole.permissions.toArray();
      const addedPerms = newPerms.filter((p) => !oldPerms.includes(p));
      const removedPerms = oldPerms.filter((p) => !newPerms.includes(p));

      const permLines = [];
      if (addedPerms.length) {
        permLines.push(`Added: ${addedPerms.join(", ")}`);
      }
      if (removedPerms.length) {
        permLines.push(`Removed: ${removedPerms.join(", ")}`);
      }

      fields.push({
        name: "Permission Changes",
        value: permLines.join("\n").slice(0, 1024) || "Changed",
        inline: false
      });
    }

    // Cek perubahan position
    if (oldRole.position !== newRole.position) {
      changes.push("Position");
      fields.push({
        name: "Position Change",
        value: `\`${oldRole.position}\` → \`${newRole.position}\``,
        inline: false
      });
    }

    if (changes.length === 0) {
      return;
    }

    let updaterTag = "Unknown";
    let updaterId = "";

    try {
      const logs = await newRole.guild.fetchAuditLogs({
        type: 31, // RoleUpdate
        limit: 1
      });
      const entry = logs.entries.first();

      if (entry && entry.target?.id === newRole.id
        && Date.now() - entry.createdTimestamp < 5000) {
        updaterTag = entry.executor?.tag || "Unknown";
        updaterId = entry.executor?.id || "";
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    const isBotAction = updaterId === client.user?.id;
    const actionSource = isBotAction ? "Bot" : updaterId ? "User" : "Unknown";

    fields.unshift(
      { name: "Role", value: `${newRole} (\`${newRole.name}\`)`, inline: false },
      { name: "Updated By", value: `${updaterTag}${isBotAction ? " (Bot)" : ""}`, inline: true },
      { name: "Source", value: actionSource, inline: true },
      { name: "Changes", value: changes.join(", "), inline: true }
    );

    const embed = buildRoleLogEmbed({
      title: "Role Updated",
      description: `Role \`${newRole.name}\` telah diubah.`,
      color: "#f59e0b",
      fields,
      footerText: `Role ID: ${newRole.id}`
    });

    await sendRoleLog(newRole.guild, "roleUpdate", embed);
  }
};
