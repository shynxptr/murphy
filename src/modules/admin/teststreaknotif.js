const { PermissionFlagsBits } = require("discord.js");
const {
  replyWithTemporaryMessage,
  resolveMemberFromId,
  sendStreakNotificationToChannel
} = require("../streak/streakSystem");

function extractMentionId(value) {
  return value?.replace(/[<@!>]/g, "") || "";
}

module.exports = {
  name: "teststreaknotif",
  description: "Kirim notifikasi streak test ke channel streak.",
  aliases: ["teststreaknotification", "streaknotiftest"],
  category: "admin",
  usage: "teststreaknotif @user1 @user2 [value]",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyWithTemporaryMessage(message, "Kamu butuh permission Manage Server untuk command ini.", client);
      return;
    }

    const userAId = extractMentionId(args[0]);
    const userBId = extractMentionId(args[1]);
    const streakValue = Number.parseInt(args[2] || "1", 10);

    if (!userAId || !userBId || userAId === userBId) {
      await replyWithTemporaryMessage(message, "Masukkan dua mention user yang valid dan berbeda.", client);
      return;
    }

    if (!Number.isInteger(streakValue) || streakValue < 1) {
      await replyWithTemporaryMessage(message, "Nilai streak test harus angka bulat minimal 1.", client);
      return;
    }

    const [memberA, memberB] = await Promise.all([
      resolveMemberFromId(message.guild, userAId),
      resolveMemberFromId(message.guild, userBId)
    ]);

    if (!memberA || !memberB) {
      await replyWithTemporaryMessage(message, "Salah satu member tidak ditemukan di server.", client);
      return;
    }

    await sendStreakNotificationToChannel(message.channel, {
      userIds: [userAId, userBId],
      currentStreak: streakValue
    }, client);

    await replyWithTemporaryMessage(
      message,
      `Notifikasi streak test untuk ${memberA} x ${memberB} dikirim.`,
      client
    );
  }
};
