const { SlashCommandBuilder } = require("discord.js");
const { buildInviteLeaderboardEmbed } = require("./inviteTracker");

module.exports = {
  name: "invitelb",
  aliases: ["inviteleaderboard", "finvitelb", "finviteleaderboard"],
  category: "general",
  description: "Lihat papan peringkat invite server.",
  usage: "invitelb",
  slashData: new SlashCommandBuilder()
    .setName("invitelb")
    .setDescription("Lihat papan peringkat (leaderboard) invite server"),

  async execute(message) {
    const embed = buildInviteLeaderboardEmbed(message.guild);
    return message.reply({ embeds: [embed] });
  },

  async executeSlash(interaction) {
    const embed = buildInviteLeaderboardEmbed(interaction.guild);
    return interaction.reply({ embeds: [embed] });
  }
};
