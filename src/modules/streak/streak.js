const { handleStreakCommand, replyWithTemporaryMessage } = require("./streakSystem");

function extractMentionId(value) {
  const match = value?.match(/^<@!?(\d+)>$/);
  return match ? match[1] : null;
}

module.exports = {
  name: "streak",
  description: "Mulai atau lanjutkan streak dengan mention partner.",
  category: "streak",
  usage: "streak @user",
  async execute(message, args, client) {
    const targetId = extractMentionId(args[0]);

    if (!targetId) {
      await replyWithTemporaryMessage(
        message,
        "Format penggunaan: `fstreak @user` atau `streak @user` di channel streak.",
        client
      );
      return;
    }

    return handleStreakCommand(message, client, targetId);
  }
};
