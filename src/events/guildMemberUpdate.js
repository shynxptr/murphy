const { reconcileCustomRoleMember } = require("../modules/custom-roles/customRoleSystem");
const { syncLevelRoleForMember } = require("../modules/levels/levelSystem");
const { sendBoosterAnnounce } = require("../modules/community/boosterAnnounce");
const { buildRoleLogEmbed, sendRoleLog } = require("../services/roleLogSystem");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    const member = newMember || oldMember;

    if (!member || member.user?.bot) {
      return;
    }

    // Detect new boost: sebelumnya tidak boost, sekarang boost
    const justBoosted = !oldMember.premiumSince && newMember.premiumSince;
    if (justBoosted) {
      sendBoosterAnnounce(newMember, client).catch((error) => {
        console.error(`[BoosterAnnounce] Failed to send boost announce for ${newMember.id}:`, error);
      });
    }

    // Log perubahan role member (add/remove)
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      // Coba ambil audit log untuk tau siapa yang mengubah role
      let executorTag = "Unknown";
      let executorId = "";

      try {
        const logs = await member.guild.fetchAuditLogs({
          type: 25, // MemberRoleUpdate
          limit: 1
        });
        const entry = logs.entries.first();

        if (entry && entry.target?.id === member.id
          && Date.now() - entry.createdTimestamp < 5000) {
          executorTag = entry.executor?.tag || "Unknown";
          executorId = entry.executor?.id || "";
        }
      } catch {
        // Bot ga punya View Audit Log permission
      }

      const isBotAction = executorId === client.user?.id;
      const actionSource = isBotAction ? "Bot" : executorId ? "User" : "Unknown";

      const fields = [
        { name: "Member", value: `${member} (\`${member.user.tag}\`)`, inline: false },
        { name: "Action By", value: `${executorTag}${isBotAction ? " (Bot)" : ""}`, inline: true },
        { name: "Source", value: actionSource, inline: true },
        { name: "Member ID", value: `\`${member.id}\``, inline: true }
      ];

      if (addedRoles.size > 0) {
        const addedList = addedRoles.map((role) => `<@&${role.id}> (\`${role.name}\`)`).join("\n");
        fields.push({ name: "Added Roles", value: addedList.slice(0, 1024), inline: false });
      }

      if (removedRoles.size > 0) {
        const removedList = removedRoles.map((role) => `<@&${role.id}> (\`${role.name}\`)`).join("\n");
        fields.push({ name: "Removed Roles", value: removedList.slice(0, 1024), inline: false });
      }

      const embed = buildRoleLogEmbed({
        title: "Member Role Updated",
        description: `Perubahan role untuk ${member.user.tag}.`,
        color: "#3b82f6",
        fields,
        footerText: `Member ID: ${member.id}`
      });

      await sendRoleLog(member.guild, "memberRole", embed);
    }

    await reconcileCustomRoleMember(member, client).catch((error) => {
      console.error(`Failed to reconcile custom role access for member ${member.id}:`, error);
    });

    await syncLevelRoleForMember(member, client).catch((error) => {
      console.error(`Failed to reconcile level role for member ${member.id}:`, error);
    });
  }
};
