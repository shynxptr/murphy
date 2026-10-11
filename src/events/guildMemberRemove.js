const { handleGuildMemberRemove } = require("../modules/invites/inviteTracker");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    try {
      handleGuildMemberRemove(member);
    } catch (error) {
      console.error(`Failed to handle member leave invite tracking for ${member?.id}:`, error);
    }
  }
};
