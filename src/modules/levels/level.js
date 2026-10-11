const {
  buildLevelRoleStatusEmbed,
  buildLevelStatusEmbed,
  clampLevel,
  getMemberLevelInfo,
  hasLevelAdminPermission,
  setLevelAnnounceChannel,
  setLevelCadence,
  setLevelMinimumChatLength,
  setLevelRole,
  setLevelThreshold,
  setLevelXpReward,
  sendLevelUpTestNotification,
  syncLevelRolesForGuild,
  syncManualLevelForMember
} = require("./levelSystem");
const { createLevelGuidePayload } = require("./levelGuide");
const { resolveGuildMember } = require("../../utils/memberResolver");

function extractRoleId(value) {
  return String(value || "").replace(/[<@&>]/g, "").trim();
}

function extractChannelId(value) {
  return String(value || "").replace(/[<#>]/g, "").trim();
}

async function resolveGuildRole(guild, value) {
  const roleId = extractRoleId(value);

  if (!roleId) {
    return null;
  }

  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

async function resolveGuildChannel(guild, value) {
  const channelId = extractChannelId(value);

  if (!channelId) {
    return null;
  }

  return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

module.exports = {
  name: "level",
  aliases: ["tier"],
  category: "levels",
  description: "Lihat dan atur progression level Murphy.",
  usage: "level <guide|status|set|role|roles|sync|announce|threshold|reward|cadence|minlength|testup>",
  async execute(message, args, client) {
    const action = (args[0] || "status").toLowerCase();

    if (action === "guide" || action === "info") {
      await message.reply(await createLevelGuidePayload());
      return;
    }

    if (action === "status") {
      const targetMember = args[1]
        ? await resolveGuildMember(message.guild, args[1])
        : message.member;

      if (!targetMember || targetMember.user.bot) {
        await message.reply("Member target tidak valid atau merupakan bot.");
        return;
      }

      await message.reply({
        embeds: [buildLevelStatusEmbed(message.guild, targetMember, getMemberLevelInfo(message.guild.id, targetMember.id, client))]
      });
      return;
    }

    if (action === "roles") {
      if (!hasLevelAdminPermission(message.member)) {
        await message.reply("Kamu butuh permission Manage Server untuk melihat pengaturan level.");
        return;
      }

      await message.reply({
        embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
      });
      return;
    }

    if (!hasLevelAdminPermission(message.member)) {
      await message.reply("Kamu butuh permission Manage Server untuk mengatur progression level.");
      return;
    }

    if (action === "set") {
      const targetMember = await resolveGuildMember(message.guild, args[1]);

      if (!targetMember || targetMember.user.bot) {
        await message.reply("Member target tidak valid atau merupakan bot.");
        return;
      }

      const nextLevel = clampLevel(args[2]);
      await syncManualLevelForMember(targetMember, nextLevel, client, {
        source: "manual"
      });

      await message.reply({
        embeds: [buildLevelStatusEmbed(message.guild, targetMember, getMemberLevelInfo(message.guild.id, targetMember.id, client))]
      });
      return;
    }

    if (action === "role") {
      const targetLevel = clampLevel(args[1]);
      const rawRole = String(args[2] || "").trim();

      if (!rawRole) {
        await message.reply("Gunakan `f level role <1-5> <@role|clear>`.");
        return;
      }

      if (["clear", "reset", "off", "none"].includes(rawRole.toLowerCase())) {
        setLevelRole(message.guild.id, targetLevel, "");
      } else {
        const role = await resolveGuildRole(message.guild, rawRole);

        if (!role) {
          await message.reply("Role target tidak valid.");
          return;
        }

        setLevelRole(message.guild.id, targetLevel, role.id);
      }

      await message.reply({
        embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
      });
      return;
    }

    if (action === "sync") {
      const targetMember = args[1] ? await resolveGuildMember(message.guild, args[1]) : null;
      const synced = await syncLevelRolesForGuild(message.guild, client, targetMember?.id || "");

      await message.reply(targetMember
        ? `Role level untuk ${targetMember} berhasil disinkronkan.`
        : `Sinkronisasi role level selesai untuk ${synced} member.`);
      return;
    }

    if (action === "announce") {
      const rawChannel = String(args[1] || "").trim();

      if (!rawChannel || ["clear", "reset", "off", "auto"].includes(rawChannel.toLowerCase())) {
        setLevelAnnounceChannel(message.guild.id, "");
        await message.reply("Channel notifikasi level up direset ke mode auto.");
        return;
      }

      const channel = await resolveGuildChannel(message.guild, rawChannel);

      if (!channel?.isTextBased?.()) {
        await message.reply("Channel target tidak valid.");
        return;
      }

      setLevelAnnounceChannel(message.guild.id, channel.id);
      await message.reply(`Channel notifikasi level up diset ke ${channel}.`);
      return;
    }

    if (action === "threshold") {
      const targetLevel = clampLevel(args[1]);
      const xp = Number.parseInt(args[2], 10);
      const result = setLevelThreshold(message.guild.id, targetLevel, xp, client);

      await message.reply(result.ok
        ? {
          embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
        }
        : result.reason);
      return;
    }

    if (action === "reward") {
      const source = String(args[1] || "").trim().toLowerCase();
      const amount = Number.parseInt(args[2], 10);
      const result = setLevelXpReward(message.guild.id, source, amount);

      await message.reply(result.ok
        ? {
          embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
        }
        : result.reason);
      return;
    }

    if (action === "cadence") {
      const target = String(args[1] || "").trim().toLowerCase();
      const minutes = Number.parseInt(args[2], 10);
      const result = setLevelCadence(message.guild.id, target, minutes);

      await message.reply(result.ok
        ? {
          embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
        }
        : result.reason);
      return;
    }

    if (action === "minlength") {
      const value = Number.parseInt(args[1], 10);
      setLevelMinimumChatLength(message.guild.id, value);

      await message.reply({
        embeds: [buildLevelRoleStatusEmbed(message.guild.id, client)]
      });
      return;
    }

    if (action === "testup") {
      const targetMember = await resolveGuildMember(message.guild, args[1]);
      const targetLevel = clampLevel(args[2]);

      if (!targetMember || targetMember.user.bot) {
        await message.reply("Member target tidak valid atau merupakan bot.");
        return;
      }

      if (targetLevel <= 1) {
        await message.reply("Gunakan level target 2 sampai 5 untuk preview level-up.");
        return;
      }

      const sent = await sendLevelUpTestNotification(
        message.guild,
        targetMember,
        targetLevel,
        client,
        message.channel.id
      );

      await message.reply(sent
        ? `Preview level-up untuk ${targetMember} berhasil dikirim ke channel ini.`
        : "Gagal mengirim preview level-up. Cek permission bot di channel ini.");
      return;
    }

    await message.reply([
      "Gunakan salah satu ini:",
      "`f level guide`",
      "`f level status [@member]`",
      "`f level set @member <1-5>`",
      "`f level role <1-5> <@role|clear>`",
      "`f level roles`",
      "`f level sync [@member]`",
      "`f level announce <#channel|auto>`",
      "`f level threshold <2-5> <xp>`",
      "`f level reward <chat|voice|streak> <xp>`",
      "`f level cadence <chat|voice> <menit>`",
      "`f level minlength <karakter>`",
      "`f level testup @member <2-5>`"
    ].join("\n"));
  }
};
