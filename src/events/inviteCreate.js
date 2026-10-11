const { handleInviteCreate } = require("../modules/invites/inviteTracker");

module.exports = {
  name: "inviteCreate",
  async execute(invite) {
    try {
      handleInviteCreate(invite);
    } catch (error) {
      console.error(`Failed to handle inviteCreate for ${invite?.code}:`, error);
    }
  }
};
