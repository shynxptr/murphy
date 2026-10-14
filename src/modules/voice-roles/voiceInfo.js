const { PermissionFlagsBits } = require("discord.js");
const {
  replyWithTemporaryMessage,
  getVoiceRoleSettings,
  getVoiceHours
} = require("../voice-roles/voiceAutoRoleSystem");

module.exports = {
  name: "voiceinfo",
  description: "Lihat total jam voice kamu dan tier auto-role yang aktif.",
  aliases: ["vinfo", "voiceroleinfo"],
  category: "general",
  usage: "voiceinfo [@user]",
  async execute(message, args, client) {
    const targetId = (args[0] || "").replace(/[<@!>]/g, "") || message.author.id;
    const member = await message.guild.members.fetch(targetId).catch(() => null);

    if (!member) {
      await replyWithTemporaryMessage(message, "User tidak ditemukan di server ini.");
      return;
    }

    const settings = getVoiceRoleSettings(message.guild.id, client);
    const hours = getVoiceHours(message.guild.id, member.id);

    const lines = [
      `**User:** ${member.user.tag}`,
      `**Total voice time:** ${hours.toFixed(1)} jam`
    ];

    if (settings.enabled && settings.tiers.length) {
      const tiers = [...settings.tiers].sort((a, b) => a.thresholdHours - b.thresholdHours);
      const currentTier = tiers.filter((t) => hours >= t.thresholdHours).pop() || null;

      lines.push("", "**Voice Auto-Role** (aktif):");

      for (const tier of tiers) {
        const has = member.roles.cache.has(tier.roleId);
        const marker = tier.roleId === currentTier?.roleId ? "  ← current" : (has ? "  ✓" : "");
        lines.push(`• ${tier.thresholdHours} jam — <@&${tier.roleId}>${marker}`);
      }

      if (!currentTier) {
        lines.push("", `_Belum mencapai tier apapun. Tier pertama di ${tiers[0].thresholdHours} jam._`);
      }
    } else {
      lines.push("", "_Voice auto-role belum diaktifkan._");
    }

    await replyWithTemporaryMessage(message, {
      embeds: [{
        color: 0x5865f2,
        title: "Voice Time Info",
        description: lines.join("\n")
      }]
    }, 15);
  }
};
