const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const { buildInviteEmbed, getInviterMetrics } = require("./inviteTracker");

function extractUserId(mention) {
  if (!mention) return null;
  const match = mention.match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(mention)) return mention;
  return null;
}

module.exports = {
  name: "invites",
  aliases: ["invite", "inv", "finv", "finvite"],
  category: "general",
  description: "Cek statistik invite dan capaian target harian.",
  usage: "invites [@user]",
  slashData: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Lihat statistik invite dan target harian kamu atau member lain")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member yang ingin dicek statistiknya (kosongkan untuk diri sendiri)")
        .setRequired(false)
    ),

  async execute(message, args, client) {
    let targetUser = message.author;

    if (args[0]) {
      const extractedId = extractUserId(args[0]);
      if (extractedId) {
        try {
          targetUser = await client.users.fetch(extractedId);
        } catch {
          // Keep as author if fetch fails
        }
      }
    }

    const isSelf = targetUser.id === message.author.id;
    const metrics = getInviterMetrics(message.guild.id, targetUser.id);
    const embed = buildInviteEmbed(targetUser, metrics, isSelf);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`invite_refresh:${targetUser.id}`)
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary)
    );

    return message.reply({
      embeds: [embed],
      components: [row]
    });
  },

  async executeSlash(interaction, client) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const isSelf = targetUser.id === interaction.user.id;
    const metrics = getInviterMetrics(interaction.guild.id, targetUser.id);
    const embed = buildInviteEmbed(targetUser, metrics, isSelf);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`invite_refresh:${targetUser.id}`)
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};
