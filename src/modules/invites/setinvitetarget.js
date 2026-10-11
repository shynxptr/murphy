const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  getInviteSettings,
  setUserTarget,
  updateInviteSettings
} = require("../../services/inviteStore");
const { hasConfiguredAdminAccess } = require("../../utils/adminAccess");

function extractUserId(mention) {
  if (!mention) return null;
  const match = mention.match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(mention)) return mention;
  return null;
}

function checkAdmin(member, client) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return hasConfiguredAdminAccess(member, client);
}

module.exports = {
  name: "setinvitetarget",
  aliases: ["settargeinvite", "settargetinvites", "fsetinvitetarget"],
  category: "admin",
  description: "Atur target harian invite untuk server atau per-admin/staff.",
  usage: "setinvitetarget <jumlah> [@user]",
  slashData: new SlashCommandBuilder()
    .setName("setinvitetarget")
    .setDescription("Atur target harian invite server atau untuk admin tertentu")
    .addIntegerOption((option) =>
      option
        .setName("target")
        .setDescription("Jumlah target invite harian (misal 5 atau 10)")
        .setMinValue(1)
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Admin/staff tertentu yang ingin diset targetnya (kosongkan untuk default server)")
        .setRequired(false)
    ),

  async execute(message, args, client) {
    if (!checkAdmin(message.member, client)) {
      return message.reply("Kamu butuh akses Admin atau Manage Server untuk command ini.");
    }

    if (!args[0]) {
      const current = getInviteSettings(message.guild.id);
      return message.reply(
        `Target harian invite server saat ini: **${current.dailyTarget} invites/hari**.\n` +
        `Format penggunaan:\n` +
        `• \`fsetinvitetarget 5\` (untuk seluruh staff/admin)\n` +
        `• \`fsetinvitetarget 10 @user\` (khusus user tersebut)\n` +
        `• \`fsetinvitetarget reset @user\` (reset ke default server)`
      );
    }

    // Check reset case
    if (args[0].toLowerCase() === "reset" && args[1]) {
      const targetUserId = extractUserId(args[1]);
      if (!targetUserId) {
        return message.reply("Mention user target tidak valid.");
      }

      setUserTarget(message.guild.id, targetUserId, 0);
      return message.reply(`Target harian untuk <@${targetUserId}> berhasil di-reset ke default server.`);
    }

    const targetNum = Number.parseInt(args[0], 10);
    if (!Number.isInteger(targetNum) || targetNum <= 0) {
      return message.reply("Jumlah target harus berupa angka bulat positif (misal: 5, 10).");
    }

    const targetUserId = args[1] ? extractUserId(args[1]) : null;

    if (targetUserId) {
      setUserTarget(message.guild.id, targetUserId, targetNum);
      const embed = new EmbedBuilder()
        .setColor("#22c55e")
        .setTitle("🎯 Target Invite Berhasil Diperbarui")
        .setDescription(
          `Target harian untuk <@${targetUserId}> telah diset menjadi **${targetNum} invites / hari**.`
        )
        .setFooter({ text: "Murphy Invite Tracker" });

      return message.reply({ embeds: [embed] });
    }

    // Set server-wide daily target
    updateInviteSettings(message.guild.id, { dailyTarget: targetNum });
    const embed = new EmbedBuilder()
      .setColor("#22c55e")
      .setTitle("🎯 Target Invite Server Diperbarui")
      .setDescription(
        `Target harian invite default server telah diset menjadi **${targetNum} invites / hari** untuk seluruh staff.`
      )
      .setFooter({ text: "Murphy Invite Tracker" });

    return message.reply({ embeds: [embed] });
  },

  async executeSlash(interaction, client) {
    if (!checkAdmin(interaction.member, client)) {
      return interaction.reply({
        content: "Kamu butuh akses Admin atau Manage Server untuk command ini.",
        ephemeral: true
      });
    }

    const targetNum = interaction.options.getInteger("target", true);
    const targetUser = interaction.options.getUser("user");

    if (targetUser) {
      setUserTarget(interaction.guildId, targetUser.id, targetNum);
      const embed = new EmbedBuilder()
        .setColor("#22c55e")
        .setTitle("🎯 Target Invite Berhasil Diperbarui")
        .setDescription(
          `Target harian untuk <@${targetUser.id}> telah diset menjadi **${targetNum} invites / hari**.`
        )
        .setFooter({ text: "Murphy Invite Tracker" });

      return interaction.reply({ embeds: [embed] });
    }

    updateInviteSettings(interaction.guildId, { dailyTarget: targetNum });
    const embed = new EmbedBuilder()
      .setColor("#22c55e")
      .setTitle("🎯 Target Invite Server Diperbarui")
      .setDescription(
        `Target harian invite default server telah diset menjadi **${targetNum} invites / hari** untuk seluruh staff.`
      )
      .setFooter({ text: "Murphy Invite Tracker" });

    return interaction.reply({ embeds: [embed] });
  }
};
