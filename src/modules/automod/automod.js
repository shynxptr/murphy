const { PermissionFlagsBits } = require("discord.js");
const { resolveTextChannel } = require("../../utils/channelResolver");
const {
  addBadWord,
  addWhitelistChannel,
  addWhitelistRole,
  buildAutomodStatusEmbed,
  removeBadWord,
  removeWhitelistChannel,
  removeWhitelistRole,
  setAutomodRuleEnabled,
  setMentionLimit
} = require("./automodSystem");

function buildReply(color, title, description) {
  return {
    embeds: [
      {
        color,
        title,
        description,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

async function replyError(message, description) {
  await message.reply(buildReply(0xef4444, "Automod Error", description));
}

async function replySuccess(message, description) {
  await message.reply(buildReply(0x10b981, "Automod Updated", description));
}

function parseToggle(value) {
  const normalized = value?.toLowerCase();

  if (["on", "enable", "enabled"].includes(normalized)) {
    return true;
  }

  if (["off", "disable", "disabled"].includes(normalized)) {
    return false;
  }

  return null;
}

function resolveRole(message, input) {
  const roleId = input?.replace(/[<@&>]/g, "") || "";
  return roleId ? message.guild.roles.cache.get(roleId) || null : null;
}

module.exports = {
  name: "automod",
  description: "Kelola Automod Lite dengan state default off.",
  aliases: ["am"],
  category: "automod",
  usage: "automod [status|antiinvite|antilink|badwords|addbadword|removebadword|mentionlimit|whitelistchannel|whitelistrole|listbadwords]",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(message, "Kamu butuh permission Manage Server untuk command ini.");
      return;
    }

    const action = args[0]?.toLowerCase() || "status";

    if (action === "status") {
      await message.reply({
        embeds: [buildAutomodStatusEmbed(message.guild)]
      });
      return;
    }

    if (action === "antiinvite" || action === "invite") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod antiinvite on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "antiInvite", enabled);
      await replySuccess(message, `Anti Invite diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "antilink" || action === "link") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod antilink on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "antiLink", enabled);
      await replySuccess(message, `Anti Link diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "badwords") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod badwords on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "badWords", enabled);
      await replySuccess(message, `Filter bad words diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "mentionlimit") {
      const value = args[1]?.toLowerCase();

      if (!value) {
        await replyError(message, "Masukkan angka batas mention atau `off`.\nContoh: `skautomod mentionlimit 4`");
        return;
      }

      if (["off", "disable", "disabled"].includes(value)) {
        setMentionLimit(message.guild.id, 0);
        await replySuccess(message, "Mention limit dimatikan.");
        return;
      }

      const parsedLimit = Number.parseInt(value, 10);

      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 25) {
        await replyError(message, "Mention limit harus berupa angka 1-25 atau `off`.");
        return;
      }

      setMentionLimit(message.guild.id, parsedLimit);
      await replySuccess(message, `Mention limit diatur ke \`${parsedLimit}\`.`);
      return;
    }

    if (action === "addbadword") {
      const word = args.slice(1).join(" ").trim();

      if (!word) {
        await replyError(message, "Masukkan kata atau frasa yang ingin diblokir.\nContoh: `skautomod addbadword kata kasar`");
        return;
      }

      const result = addBadWord(message.guild.id, word);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(message, `Bad word \`${word}\` berhasil ditambahkan.`);
      return;
    }

    if (action === "removebadword") {
      const word = args.slice(1).join(" ").trim();

      if (!word) {
        await replyError(message, "Masukkan kata atau frasa yang ingin dihapus.\nContoh: `skautomod removebadword kata kasar`");
        return;
      }

      const result = removeBadWord(message.guild.id, word);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(message, `Bad word \`${word}\` berhasil dihapus.`);
      return;
    }

    if (action === "listbadwords") {
      const statusEmbed = buildAutomodStatusEmbed(message.guild);
      const fields = statusEmbed.data.fields?.filter((entry) => entry.name.startsWith("Bad Word List")) || [];
      const combined = fields.map((entry) => entry.value).join(", ");

      await message.reply(combined || "`none`");
      return;
    }


    if (action === "whitelistchannel") {
      const mode = args[1]?.toLowerCase();
      const channel = resolveTextChannel(message, args[2]);

      if (!["add", "remove"].includes(mode)) {
        await replyError(
          message,
          "Gunakan `add` atau `remove`.\nContoh: `skautomod whitelistchannel add #partnership`"
        );
        return;
      }

      if (!channel) {
        await replyError(message, "Channel target tidak valid. Mention text channel atau jalankan di channel target.");
        return;
      }

      const result = mode === "add"
        ? addWhitelistChannel(message.guild.id, channel.id)
        : removeWhitelistChannel(message.guild.id, channel.id);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(
        message,
        `Channel ${channel} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    if (action === "whitelistrole") {
      const mode = args[1]?.toLowerCase();
      const role = resolveRole(message, args[2]);

      if (!["add", "remove"].includes(mode)) {
        await replyError(
          message,
          "Gunakan `add` atau `remove`.\nContoh: `skautomod whitelistrole add @Moderator`"
        );
        return;
      }

      if (!role) {
        await replyError(message, "Role target tidak valid. Mention role yang ingin diatur.");
        return;
      }

      const result = mode === "add"
        ? addWhitelistRole(message.guild.id, role.id)
        : removeWhitelistRole(message.guild.id, role.id);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(
        message,
        `Role ${role} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    await replyError(
      message,
      [
        "Subcommand automod tidak dikenali.",
        "Gunakan salah satu ini:",
        "`skautomod status`",
        "`skautomod antiinvite on|off`",
        "`skautomod antilink on|off`",
        "`skautomod badwords on|off`",
        "`skautomod addbadword <kata>`",
        "`skautomod removebadword <kata>`",
        "`skautomod listbadwords`",
        "`skautomod mentionlimit <angka|off>`",
        "`skautomod whitelistchannel add|remove [#channel]`",
        "`skautomod whitelistrole add|remove <@role>`"
      ].join("\n")
    );
  }
};
