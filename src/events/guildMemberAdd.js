const { sendPublicWelcomeMessage, sendWelcomeMessage } = require("../modules/community/welcome");
const { ensureMemberLevelRecord, syncLevelRoleForMember } = require("../modules/levels/levelSystem");
const { handleGuildMemberAdd } = require("../modules/invites/inviteTracker");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    await handleGuildMemberAdd(member, client).catch((error) => {
      console.error(`Failed to track invite for member ${member.id}:`, error);
    });
    ensureMemberLevelRecord(member.guild.id, member.id, client);
    await syncLevelRoleForMember(member, client).catch((error) => {
      console.error(`Failed to sync level role for new member ${member.id}:`, error);
    });
    await sendWelcomeMessage(member, client);
    await sendPublicWelcomeMessage(member, client);
  }
};
