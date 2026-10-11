const {
  buildVerifikasiGirlEmbed,
  buildVerifikasiGirlActionRow
} = require("./ticketSystem");

module.exports = {
  name: "verifikasi",
  description: "Kirim panel instruksi verifikasi girl dengan tombol action.",
  category: "tickets",
  usage: "verifikasi",
  async execute(message, args, client) {
    const topic = message.channel.topic || "";
    const ownerId = topic.match(/^ticket-owner:(\d+)/)?.[1];
    const targetUser = ownerId
      ? (await message.guild.members.fetch(ownerId).catch(() => null))?.user || message.author
      : message.mentions.users.first() || message.author;

    await message.channel.send({
      embeds: [buildVerifikasiGirlEmbed(targetUser)],
      components: [buildVerifikasiGirlActionRow()]
    });
  }
};
