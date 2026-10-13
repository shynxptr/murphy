const { PermissionFlagsBits } = require("discord.js");
const { sendBoosterAnnounce } = require("../community/boosterAnnounce");

module.exports = {
  name: "testboost",
  aliases: ["testbooster"],
  description: "Preview booster announce untuk member yang disebutkan atau diri sendiri.",
  category: "admin",
  usage: "testboost [@member]",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("Kamu butuh permission Manage Server untuk command ini.");
      return;
    }

    // Resolve target member: mention, atau fallback ke pengirim command
    let targetMember = message.member;

    if (message.mentions.members?.size > 0) {
      targetMember = message.mentions.members.first();
    } else if (args[0]) {
      const fetched = await message.guild.members.fetch(args[0]).catch(() => null);
      if (!fetched) {
        await message.reply("Member tidak ditemukan. Kirim mention atau user ID yang valid.");
        return;
      }
      targetMember = fetched;
    }

    await message.reply(`Mengirim preview booster announce untuk **${targetMember.displayName}**...`);

    const sent = await sendBoosterAnnounce(targetMember, client).catch((error) => {
      console.error("[TestBoost] Error:", error);
      return false;
    });

    if (!sent) {
      await message.reply("Gagal mengirim booster announce. Pastikan channel ID sudah benar.");
      return;
    }
  }
};
