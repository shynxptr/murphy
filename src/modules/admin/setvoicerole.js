const { PermissionFlagsBits } = require("discord.js");
const {
  replyWithTemporaryMessage,
  getVoiceRoleSettings
} = require("../voice-roles/voiceAutoRoleSystem");

function extractRoleId(value) {
  return value?.replace(/[<@&>]/g, "") || "";
}

module.exports = {
  name: "setvoicerole",
  description: "Atur tier role auto-voice. Contoh: fsetvoicerole add 10 @Role | list | remove @Role | clear",
  aliases: ["setvoiceauto", "voiceautoconfig"],
  category: "admin",
  usage: "setvoicerole <add <hours> @Role | remove @Role | list | clear>",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyWithTemporaryMessage(message, "Kamu butuh permission Manage Server untuk command ini.");
      return;
    }

    const subcommand = (args[0] || "").toLowerCase();

    if (!subcommand) {
      await replyWithTemporaryMessage(message,
        "Penggunaan:\n" +
        "`fsetvoicerole add <jam> @Role` — tambah/edit tier (threshold dalam jam)\n" +
        "`fsetvoicerole remove @Role` — hapus tier berdasarkan role\n" +
        "`fsetvoicerole list` — lihat semua tier\n" +
        "`fsetvoicerole clear` — hapus semua tier\n" +
        "`fsetvoicerole enable` — aktifkan auto-role\n" +
        "`fsetvoicerole disable` — nonaktifkan auto-role"
      );
      return;
    }

    const { updateGuildSettings } = require("../../services/guildConfigService");

    if (subcommand === "list") {
      const settings = getVoiceRoleSettings(message.guild.id, client);

      if (!settings.tiers.length) {
        await replyWithTemporaryMessage(message, "Belum ada tier voice auto-role yang diatur.");
        return;
      }

      const lines = settings.tiers
        .sort((a, b) => a.thresholdHours - b.thresholdHours)
        .map((tier, i) => `**${i + 1}.** ${tier.thresholdHours} jam — <@&${tier.roleId}> (${tier.label})`);

      await replyWithTemporaryMessage(message, {
        embeds: [{
          color: 0x5865f2,
          title: "Voice Auto-Role Tiers",
          description: lines.join("\n"),
          footer: { text: `Status: ${settings.enabled ? "Aktif" : "Nonaktif"}` }
        }]
      }, 15);
      return;
    }

    if (subcommand === "clear") {
      updateGuildSettings(message.guild.id, (current) => ({
        ...current,
        voiceRoles: {
          ...(current.voiceRoles || {}),
          tiers: []
        }
      }));
      await replyWithTemporaryMessage(message, "Semua tier voice auto-role dihapus.");
      return;
    }

    if (subcommand === "enable") {
      updateGuildSettings(message.guild.id, (current) => ({
        ...current,
        voiceRoles: {
          ...(current.voiceRoles || {}),
          enabled: true
        }
      }));
      await replyWithTemporaryMessage(message, "Voice auto-role **diaktifkan**. Role akan di-sync saat user disconnect voice dan setiap 10 menit.");
      return;
    }

    if (subcommand === "disable") {
      updateGuildSettings(message.guild.id, (current) => ({
        ...current,
        voiceRoles: {
          ...(current.voiceRoles || {}),
          enabled: false
        }
      }));
      await replyWithTemporaryMessage(message, "Voice auto-role **dinonaktifkan**.");
      return;
    }

    if (subcommand === "add") {
      const hours = Number.parseFloat(args[1]);
      const roleId = extractRoleId(args[2]);

      if (!Number.isFinite(hours) || hours < 0) {
        await replyWithTemporaryMessage(message, "Threshold jam harus angka positif. Contoh: `fsetvoicerole add 10 @Role`");
        return;
      }

      if (!roleId || !message.guild.roles.cache.has(roleId)) {
        await replyWithTemporaryMessage(message, "Role tidak valid. Mention role yang valid. Contoh: `fsetvoicerole add 10 @Role`");
        return;
      }

      const role = message.guild.roles.cache.get(roleId);
      const label = role.name;

      updateGuildSettings(message.guild.id, (current) => {
        const existing = (current.voiceRoles?.tiers) || [];
        const filtered = existing.filter((tier) => tier.roleId !== roleId);
        const updated = [...filtered, { thresholdHours: hours, roleId, label }]
          .sort((a, b) => a.thresholdHours - b.thresholdHours);

        return {
          ...current,
          voiceRoles: {
            ...(current.voiceRoles || {}),
            tiers: updated
          }
        };
      });

      await replyWithTemporaryMessage(message, `Tier voice auto-role ditambah/edit: **${hours} jam** → ${role} (${label}).`);
      return;
    }

    if (subcommand === "remove") {
      const roleId = extractRoleId(args[1]);

      if (!roleId) {
        await replyWithTemporaryMessage(message, "Mention role yang ingin dihapus. Contoh: `fsetvoicerole remove @Role`");
        return;
      }

      updateGuildSettings(message.guild.id, (current) => {
        const existing = (current.voiceRoles?.tiers) || [];
        const updated = existing.filter((tier) => tier.roleId !== roleId);

        return {
          ...current,
          voiceRoles: {
            ...(current.voiceRoles || {}),
            tiers: updated
          }
        };
      });

      await replyWithTemporaryMessage(message, `Tier dengan role <@&${roleId}> dihapus dari voice auto-role.`);
      return;
    }

    await replyWithTemporaryMessage(message, "Subcommand tidak dikenal. Lihat: `fsetvoicerole` (tanpa argumen) untuk bantuan.");
  }
};
