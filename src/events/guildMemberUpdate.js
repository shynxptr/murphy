const { reconcileCustomRoleMember } = require("../modules/custom-roles/customRoleSystem");
const { syncLevelRoleForMember } = require("../modules/levels/levelSystem");
const { sendBoosterAnnounce } = require("../modules/community/boosterAnnounce");

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

    await reconcileCustomRoleMember(member, client).catch((error) => {
      console.error(`Failed to reconcile custom role access for member ${member.id}:`, error);
    });

    await syncLevelRoleForMember(member, client).catch((error) => {
      console.error(`Failed to reconcile level role for member ${member.id}:`, error);
    });
  }
};
