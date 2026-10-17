const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { resolveTextChannel, resolveLogChannel } = require("../../utils/channelResolver");
const {
  addBadWord,
  addWhitelistChannel,
  addWhitelistRole,
  AUTOMOD_LOG_CATEGORIES,
  buildAutomodStatusEmbed,
  removeBadWord,
  removeWhitelistChannel,
  removeWhitelistRole,
  setAutomodLogChannelForCategory,
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
  usage: "automod [status|logchannel|antiinvite|antilink|badwords|addbadword|removebadword|mentionlimit|whitelistchannel|whitelistrole|listbadwords]",
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

    if (action === "logchannel") {
      const categoryInput = args[1]?.toLowerCase();
      const channelInput = args[2];

      if (!categoryInput) {
        const list = AUTOMOD_LOG_CATEGORIES.map(
          (cat) => `- \`${cat.key}\` (Log ${cat.label})`
        ).join("\n");
        await replyError(
          message,
          [
            "Tentukan kategori log dan channel forum.",
            "",
            "Kategori yang tersedia:",
            list,
            "",
            "Contoh: `skautomod logchannel badwords #forum-badwords`",
            "Untuk clear: `skautomod logchannel badwords off`"
          ].join("\n")
        );
        return;
      }

      const category = AUTOMOD_LOG_CATEGORIES.find((cat) => cat.key === categoryInput);

      if (!category) {
        const list = AUTOMOD_LOG_CATEGORIES.map((cat) => `\`${cat.key}\``).join(", ");
        await replyError(
          message,
          `Kategori tidak valid. Pilih salah satu: ${list}.\nContoh: \`skautomod logchannel badwords #forum\``
        );
        return;
      }

      // Clear log channel untuk kategori ini
      if (["off", "disable", "disabled", "none", "clear"].includes(channelInput?.toLowerCase())) {
        setAutomodLogChannelForCategory(message.guild.id, category.key, "");
        await replySuccess(message, `Log channel untuk ${category.label} dimatikan.`);
        return;
      }

      const channel = resolveLogChannel(message, channelInput);

      if (!channel) {
        await replyError(
          message,
          "Channel log tidak valid. Mention forum channel atau jalankan di channel target."
        );
        return;
      }

      // Rekomendasi pakai forum, tapi text channel juga bisa
      if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText) {
        await replyError(
          message,
          "Channel harus berupa Forum channel atau Text channel."
        );
        return;
      }

      setAutomodLogChannelForCategory(message.guild.id, category.key, channel.id);

      const channelTypeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      await replySuccess(
        message,
        `Log ${category.label} diset ke ${channel} (${channelTypeLabel} channel).\nSemua log ${category.label} bakal masuk ke thread yang sama di channel itu.`
      );
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
        "`skautomod logchannel <kategori> [#forum|off]` — kategori: antiinvite, antilink, mentionlimit, badwords",
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
