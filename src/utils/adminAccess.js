const {
  PermissionFlagsBits,
  PermissionsBitField
} = require("discord.js");
const {
  addAdminUser,
  clearAdminUsers,
  getAdminAccessSettings,
  removeAdminUser
} = require("../services/adminAccessStore");

const ELEVATED_ADMIN_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers
]);

let cachedBotOwnerId = null;
let botOwnerResolved = false;

async function resolveBotOwnerId(client) {
  const configured = String(client?.config?.botOwnerId || "").trim();

  if (configured) {
    cachedBotOwnerId = configured;
    botOwnerResolved = true;
    return configured;
  }

  if (botOwnerResolved) {
    return cachedBotOwnerId;
  }

  try {
    const application = client.application?.owner
      ? client.application
      : await client.application?.fetch();
    const owner = application?.owner;

    let resolved = "";

    if (owner) {
      if (owner.id) {
        resolved = owner.id;
      } else if (owner.ownerId) {
        resolved = owner.ownerId;
      } else {
        const firstTeamMember = owner.members?.first?.() || null;
        resolved = firstTeamMember?.id || "";
      }
    }

    cachedBotOwnerId = resolved;
    botOwnerResolved = true;
    return resolved;
  } catch {
    cachedBotOwnerId = "";
    botOwnerResolved = true;
    return "";
  }
}

async function isBotOwner(userId, client) {
  if (!userId || !client) {
    return false;
  }

  return String(userId) === await resolveBotOwnerId(client);
}

function isConfiguredGuildAdmin(guildId, userId) {
  if (!guildId || !userId) {
    return false;
  }

  return getAdminAccessSettings(guildId).adminUserIds.includes(String(userId));
}

async function hasConfiguredAdminAccess(member, client) {
  if (!member?.guild?.id || !member?.id) {
    return false;
  }

  if (await isBotOwner(member.id, client)) {
    return true;
  }

  if (member.id === member.guild.ownerId || member.permissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  return isConfiguredGuildAdmin(member.guild.id, member.id);
}

async function buildAdminAccessState(member, client) {
  const botOwner = await isBotOwner(member?.id, client);
  const isGuildOwner = Boolean(member?.guild && member.id === member.guild.ownerId);
  const isGuildAdmin = Boolean(member?.permissions && typeof member.permissions.has === "function" && member.permissions.has(PermissionFlagsBits.Administrator));
  const configuredAdmin = Boolean(member?.guild?.id && member?.id && isConfiguredGuildAdmin(member.guild.id, member.id));

  return {
    botOwner,
    configuredAdmin,
    isGuildOwner,
    isGuildAdmin,
    hasAccess: botOwner || configuredAdmin || isGuildOwner || isGuildAdmin
  };
}

function isProtectedPrefixedCommand(command) {
  return Boolean(command?.botOwnerOnly || command?.adminOnly || command?.category === "admin");
}

function isProtectedSlashCommand(command) {
  return Boolean(command?.botOwnerOnly || command?.adminOnly || command?.data?.default_member_permissions || command?.slashData?.default_member_permissions);
}

async function withScopedAdminAccess(member, client, executor, prebuiltAccess) {
  if (!member?.permissions || typeof member.permissions.has !== "function") {
    return executor();
  }

  const access = prebuiltAccess || await buildAdminAccessState(member, client);

  if (!access.hasAccess) {
    return executor();
  }

  const originalHas = member.permissions.has.bind(member.permissions);
  member.permissions.has = (permission, checkAdmin = true) => {
    if (originalHas(permission, checkAdmin)) {
      return true;
    }

    try {
      const resolved = PermissionsBitField.resolve(permission);
      return (resolved & ELEVATED_ADMIN_PERMISSIONS.bitfield) !== 0n;
    } catch {
      return false;
    }
  };

  try {
    return await executor();
  } finally {
    member.permissions.has = originalHas;
  }
}

function buildAdminAccessEmbedLines(settings) {
  const adminMentions = settings.adminUserIds.length
    ? settings.adminUserIds.map((userId) => `- <@${userId}>`).join("\n")
    : "- Belum ada admin yang diset";

  return [
    `Total admin server: **${settings.adminUserIds.length}**`,
    "",
    adminMentions
  ].join("\n");
}

module.exports = {
  addAdminUser,
  buildAdminAccessEmbedLines,
  buildAdminAccessState,
  clearAdminUsers,
  getAdminAccessSettings,
  hasConfiguredAdminAccess,
  isBotOwner,
  isConfiguredGuildAdmin,
  isProtectedPrefixedCommand,
  isProtectedSlashCommand,
  removeAdminUser,
  resolveBotOwnerId,
  withScopedAdminAccess
};
