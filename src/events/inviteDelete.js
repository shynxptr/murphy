const { handleInviteDelete } = require("../modules/invites/inviteTracker");

module.exports = {
  name: "inviteDelete",
  async execute(invite) {
    try {
      handleInviteDelete(invite);
    } catch (error) {
      console.error(`Failed to handle inviteDelete for ${invite?.code}:`, error);
    }
  }
};
