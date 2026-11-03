const { buildMsgDeleteLogEmbed, sendMsgDeleteLog } = require("../services/messageDeleteLogSystem");

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    if (!message.guild) {
      return;
    }

    // Skip jika pesan dari bot sendiri (bot message yang dihapus tidak perlu log).
    if (message.author?.id === client.user?.id) {
      return;
    }

    // Catatan: pesan yang sudah dihapus tidak bisa di-fetch dari Discord API (10008 Unknown Message).
    // Jika message.partial bernilai true, tetap lanjutkan logging dengan informasi yang tersedia.

    // Cari audit log untuk siapa yang hapus.
    let executorTag = "Unknown";
    let executorId = "";
    let isBotAction = false;

    try {
      const logs = await message.guild.fetchAuditLogs({
        type: 72, // MessageDelete
        limit: 1
      });
      const entry = logs.entries.first();
      const isRecent = entry && Date.now() - entry.createdTimestamp < 5000;
      const matchesTarget = message.author?.id
        ? entry?.target?.id === message.author.id
        : (!entry?.extra?.channel?.id || entry.extra.channel.id === message.channel?.id);

      if (isRecent && matchesTarget) {
        executorTag = entry.executor?.tag || "Unknown";
        executorId = entry.executor?.id || "";
        isBotAction = executorId === client.user?.id;
      }
    } catch {
      // Bot ga punya View Audit Log permission
    }

    // Skip jika pesan dihapus oleh bot sendiri (misal automod badword).
    if (isBotAction) {
      return;
    }

    const fields = [];

    if (message.author) {
      fields.push({
        name: "Author",
        value: `<@${message.author.id}> (\`${message.author.tag}\`)`,
        inline: true
      });
    } else {
      fields.push({
        name: "Author",
        value: "Unknown (pesan lama / tidak ada di cache)",
        inline: true
      });
    }

    fields.push(
      { name: "Deleted By", value: executorTag, inline: true }
    );

    if (message.attachments && message.attachments.size > 0) {
      const attachmentList = [...message.attachments.values()]
        .map((a) => `${a.name} ([link](${a.url}))`)
        .join("\n");
      fields.push({ name: "Attachments", value: attachmentList.slice(0, 1024), inline: false });
    }

    const embed = buildMsgDeleteLogEmbed({
      author: message.author,
      content: message.content,
      channel: message.channel,
      messageId: message.id,
      deletedAt: new Date(),
      fields
    });

    await sendMsgDeleteLog(message.guild, embed);
  }
};
