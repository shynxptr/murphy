const { PermissionFlagsBits } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const { listVoiceTotals, getVoiceSession } = require("../../services/leaderboardStore");

const HOUR_MS = 60 * 60 * 1000;

const DEFAULT_VOICE_ROLE_TIERS = [];

const DEFAULT_VOICE_ROLE_SETTINGS = {
  enabled: false,
  tiers: []
};

function getVoiceRoleSettings(guildId, client) {
  const settings = getGuildSettings(guildId, {
    voiceRoles: client?.config?.voiceRoles || DEFAULT_VOICE_ROLE_SETTINGS
  });

  return {
    ...DEFAULT_VOICE_ROLE_SETTINGS,
    ...(settings.voiceRoles || {})
  };
}

function canAssignRole(guild, role) {
  return Boolean(role)
    && !role.managed
    && guild.members.me
    && guild.members.me.roles.highest.comparePositionTo(role) > 0;
}

async function replyWithTemporaryMessage(message, payload, seconds = 10) {
  const replyPayload = typeof payload === "string" ? { content: payload } : payload;
  const sentMessage = await message.reply(replyPayload).catch(() => null);

  if (sentMessage) {
    setTimeout(() => {
      sentMessage.delete().catch(() => null);
    }, seconds * 1000);
  }

  return sentMessage;
}

function getVoiceHours(guildId, userId) {
  const totals = listVoiceTotals(guildId);

  const entry = totals.find((item) => item.userId === userId);
  let totalMs = entry?.totalMs || 0;

  // Tambah waktu dari active session yang sedang berlangsung
  const session = getVoiceSession(guildId, userId);
  if (session?.startedAt) {
    const liveMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
    totalMs += liveMs;
  }

  return totalMs / HOUR_MS;
}

function resolveTierForHours(hours, tiers) {
  const sorted = [...tiers].sort((a, b) => b.thresholdHours - a.thresholdHours);

  return sorted.find((tier) => hours >= tier.thresholdHours) || null;
}

async function syncVoiceAutoRoleForMember(member, client) {
  if (!member || member.user?.bot) {
    return { ok: false, changed: false };
  }

  const settings = getVoiceRoleSettings(member.guild.id, client);

  if (!settings.enabled || !settings.tiers.length) {
    return { ok: true, changed: false };
  }

  const hours = getVoiceHours(member.guild.id, member.id);
  const tier = resolveTierForHours(hours, settings.tiers);

  const allRoleIds = settings.tiers.map((t) => t.roleId).filter(Boolean);
  const rolesToRemove = allRoleIds.filter((roleId) => {
    if (!member.roles.cache.has(roleId)) {
      return false;
    }
    return !tier || roleId !== tier.roleId;
  });

  let changed = false;

  for (const roleId of rolesToRemove) {
    const role = member.guild.roles.cache.get(roleId);
    if (role && canAssignRole(member.guild, role)) {
      await member.roles.remove(role, "Voice auto-role tier downgrade").catch(() => null);
      changed = true;
    }
  }

  if (tier && tier.roleId) {
    const roleToAdd = member.guild.roles.cache.get(tier.roleId);

    if (roleToAdd && !member.roles.cache.has(roleToAdd.id) && canAssignRole(member.guild, roleToAdd)) {
      await member.roles.add(roleToAdd, `Voice auto-role: ${tier.label} (${tier.thresholdHours}h)`).catch(() => null);
      changed = true;
    }
  }

  return { ok: true, changed };
}

async function syncVoiceAutoRolesForGuild(guild, client, targetUserId) {
  const settings = getVoiceRoleSettings(guild.id, client);

  if (!settings.enabled || !settings.tiers.length) {
    return { checked: 0, changed: 0 };
  }

  let checked = 0;
  let changed = 0;

  const members = targetUserId
    ? [await guild.members.fetch(targetUserId).catch(() => null)].filter(Boolean)
    : [...(await guild.members.fetch().catch(() => null)).values()];

  for (const member of members) {
    if (member.user?.bot) {
      continue;
    }

    checked++;
    const result = await syncVoiceAutoRoleForMember(member, client);
    if (result.changed) {
      changed++;
    }
  }

  return { checked, changed };
}

async function syncAllVoiceAutoRoles(client) {
  const guilds = [...client.guilds.cache.values()];

  await Promise.allSettled(guilds.map(async (guild) => {
    try {
      await syncVoiceAutoRolesForGuild(guild, client);
    } catch (error) {
      console.error(`Failed to sync voice auto-roles for guild ${guild.id}:`, error);
    }
  }));
}

async function handleVoiceAutoRoleState(oldState, newState, client) {
  if (newState.member?.user?.bot) {
    return;
  }

  // Sync saat user join voice (bukan disconnect)
  if (!oldState.channelId && newState.channelId) {
    await syncVoiceAutoRoleForMember(newState.member, client).catch(() => null);
  }
}

function startVoiceAutoRoleScheduler(client) {
  if (client.voiceAutoRoleScheduler) {
    return;
  }

  const runSync = async () => {
    await syncAllVoiceAutoRoles(client);
  };

  runSync().catch((error) => {
    console.error("Initial voice auto-role sync failed:", error);
  });

  client.voiceAutoRoleScheduler = setInterval(() => {
    runSync().catch((error) => {
      console.error("Scheduled voice auto-role sync failed:", error);
    });
  }, 10 * 60 * 1000);

  if (typeof client.voiceAutoRoleScheduler.unref === "function") {
    client.voiceAutoRoleScheduler.unref();
  }
}

module.exports = {
  DEFAULT_VOICE_ROLE_SETTINGS,
  replyWithTemporaryMessage,
  canAssignRole,
  getVoiceRoleSettings,
  getVoiceHours,
  resolveTierForHours,
  syncVoiceAutoRoleForMember,
  syncVoiceAutoRolesForGuild,
  syncAllVoiceAutoRoles,
  handleVoiceAutoRoleState,
  startVoiceAutoRoleScheduler
};
