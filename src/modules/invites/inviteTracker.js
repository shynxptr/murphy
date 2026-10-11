const { EmbedBuilder } = require("discord.js");
const {
  getAllInviters,
  getInviteSettings,
  getInviterRecord,
  recordJoin,
  recordLeave,
  seedBaselineInvites
} = require("../../services/inviteStore");

// In-memory cache for fast invite comparison
// Map<guildId, Map<code, uses>>
const guildInviteCache = new Map();
// Map<guildId, number>
const guildVanityCache = new Map();

/**
 * Returns midnight timestamp (00:00:00) of current day in WIB (UTC+7).
 */
function getStartOfTodayWIB() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibDate = new Date(utcMs + 7 * 3600000);
  wibDate.setHours(0, 0, 0, 0);
  return wibDate.getTime() - 7 * 3600000;
}

function getWibDateString() {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium"
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString("id-ID");
  }
}

function renderProgressBar(current, target, length = 10) {
  if (target <= 0) {
    return `[${"█".repeat(length)}]`;
  }
  const ratio = Math.min(1, Math.max(0, current / target));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/**
 * Initialize invite cache on startup.
 */
async function initInviteTracker(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      if (invites) {
        const cacheMap = new Map();
        const baselines = [];

        for (const [code, invite] of invites) {
          cacheMap.set(code, invite.uses || 0);
          if (invite.inviter && invite.uses > 0) {
            baselines.push({
              inviterId: invite.inviter.id,
              code,
              uses: invite.uses
            });
          }
        }

        guildInviteCache.set(guildId, cacheMap);

        if (baselines.length > 0) {
          seedBaselineInvites(guildId, baselines);
        }
      }

      if (guild.features.includes("VANITY_URL")) {
        const vanity = await guild.fetchVanityData().catch(() => null);
        if (vanity && typeof vanity.uses === "number") {
          guildVanityCache.set(guildId, vanity.uses);
        }
      }
    } catch (error) {
      console.warn(`[InviteTracker] Could not fetch invites for guild ${guild.name} (${guildId}):`, error.message);
    }
  }
}

/**
 * Sync invite creation.
 */
function handleInviteCreate(invite) {
  if (!invite.guild) return;
  const guildId = invite.guild.id;
  let cacheMap = guildInviteCache.get(guildId);
  if (!cacheMap) {
    cacheMap = new Map();
    guildInviteCache.set(guildId, cacheMap);
  }
  cacheMap.set(invite.code, invite.uses || 0);
}

/**
 * Sync invite deletion.
 */
function handleInviteDelete(invite) {
  if (!invite.guild) return;
  const cacheMap = guildInviteCache.get(invite.guild.id);
  if (cacheMap) {
    cacheMap.delete(invite.code);
  }
}

/**
 * Handle new member joining.
 */
async function handleGuildMemberAdd(member, client) {
  const guild = member.guild;
  if (!guild) return;

  const cachedInvites = guildInviteCache.get(guild.id) || new Map();
  let usedInvite = null;

  try {
    const currentInvites = await guild.invites.fetch().catch(() => null);
    if (currentInvites) {
      for (const [code, invite] of currentInvites) {
        const prevUses = cachedInvites.get(code) ?? 0;
        if (invite.uses > prevUses) {
          usedInvite = invite;
          break;
        }
      }

      // Refresh cache
      const freshMap = new Map();
      for (const [code, invite] of currentInvites) {
        freshMap.set(code, invite.uses || 0);
      }
      guildInviteCache.set(guild.id, freshMap);
    }
  } catch (error) {
    console.warn(`[InviteTracker] Error fetching invites on member join: ${error.message}`);
  }

  let isVanity = false;
  if (!usedInvite && guild.features.includes("VANITY_URL")) {
    try {
      const vanity = await guild.fetchVanityData().catch(() => null);
      const prevVanity = guildVanityCache.get(guild.id) || 0;
      if (vanity && typeof vanity.uses === "number" && vanity.uses > prevVanity) {
        guildVanityCache.set(guild.id, vanity.uses);
        isVanity = true;
      }
    } catch {
      // Ignore vanity fetch errors
    }
  }

  // Fake account detection: account created within past 72 hours
  const isFake = (Date.now() - member.user.createdTimestamp) < 3 * 24 * 60 * 60 * 1000;

  if (usedInvite && usedInvite.inviter) {
    recordJoin(guild.id, {
      memberId: member.id,
      inviterId: usedInvite.inviter.id,
      code: usedInvite.code,
      isFake,
      joinedAt: Date.now()
    });
  } else if (isVanity) {
    recordJoin(guild.id, {
      memberId: member.id,
      inviterId: "VANITY",
      code: "VANITY",
      isFake,
      joinedAt: Date.now()
    });
  } else {
    recordJoin(guild.id, {
      memberId: member.id,
      inviterId: "UNKNOWN",
      code: "UNKNOWN",
      isFake,
      joinedAt: Date.now()
    });
  }
}

/**
 * Handle member leaving.
 */
function handleGuildMemberRemove(member) {
  if (!member.guild) return;
  recordLeave(member.guild.id, member.id);
}

/**
 * Calculate full invite metrics for a user.
 */
function getInviterMetrics(guildId, userId) {
  const inviter = getInviterRecord(guildId, userId);
  const settings = getInviteSettings(guildId);
  const now = Date.now();

  const regular = inviter.regular || 0;
  const fake = inviter.fake || 0;
  const leaves = inviter.leaves || 0;
  const netTotal = Math.max(0, regular - leaves);

  const history = Array.isArray(inviter.history) ? inviter.history : [];

  // Top codes all-time
  const codesMap = inviter.codes || {};
  const topCodes = Object.entries(codesMap)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 0)
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  // Helper for window calculation
  const calculateWindow = (durationMs) => {
    const cutoff = now - durationMs;
    const windowJoins = history.filter((h) => h.type === "join" && h.timestamp >= cutoff);
    const codeCounts = {};

    for (const item of windowJoins) {
      if (item.code) {
        codeCounts[item.code] = (codeCounts[item.code] || 0) + 1;
      }
    }

    const sortedCodes = Object.entries(codeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    return {
      total: windowJoins.length,
      topCodes: sortedCodes.slice(0, 5)
    };
  };

  const h24 = calculateWindow(24 * 60 * 60 * 1000);
  const d7 = calculateWindow(7 * 24 * 60 * 60 * 1000);
  const d30 = calculateWindow(30 * 24 * 60 * 60 * 1000);

  // Target Harian (Today WIB)
  const todayCutoff = getStartOfTodayWIB();
  const todayJoins = history.filter(
    (h) => h.type === "join" && h.timestamp >= todayCutoff && !h.isFake
  ).length;

  const target = settings.userTargets[userId] || settings.dailyTarget || 5;
  const percent = target > 0 ? Math.min(100, Math.round((todayJoins / target) * 100)) : 100;
  const progressBar = renderProgressBar(todayJoins, target, 10);
  const isTargetAchieved = todayJoins >= target;

  return {
    userId,
    regular,
    fake,
    leaves,
    netTotal,
    topCodes,
    h24,
    d7,
    d30,
    todayJoins,
    target,
    percent,
    progressBar,
    isTargetAchieved
  };
}

/**
 * Format code breakdown lines for an embed section.
 */
function formatCodeBreakdown(codeList) {
  if (!codeList || codeList.length === 0) {
    return "`Belum ada aktivitas`";
  }
  return codeList
    .map((item, index) => `**${index + 1}.** \`${item.code}\`: **${item.count}** invites`)
    .join("\n");
}

/**
 * Build Discord Embed matching Statora's layout + Daily Target section.
 */
function buildInviteEmbed(targetUser, metrics, isSelf = false) {
  const embed = new EmbedBuilder()
    .setColor("#22c55e")
    .setAuthor({
      name: targetUser.username,
      iconURL: targetUser.displayAvatarURL({ dynamic: true, size: 256 })
    })
    .setDescription(
      isSelf
        ? `You have **${metrics.netTotal}** total Invites! (**${metrics.regular}** regular, **${metrics.fake}** fake, **-${metrics.leaves}** leaves)`
        : `<@${targetUser.id}> has **${metrics.netTotal}** total Invites! (**${metrics.regular}** regular, **${metrics.fake}** fake, **-${metrics.leaves}** leaves)`
    );

  // 🎯 Target Harian Section
  const targetStatus = metrics.isTargetAchieved
    ? "✅ **Target Hari Ini Tercapai!** 🎉"
    : `⏳ Belum tercapai (kurang **${metrics.target - metrics.todayJoins}** invite lagi)`;

  embed.addFields({
    name: "🎯 Target Harian (Hari Ini)",
    value: [
      `Target: **${metrics.target}** invites | Tercapai: **${metrics.todayJoins}** invites`,
      `${metrics.progressBar} **${metrics.percent}%**`,
      `Status: ${targetStatus}`
    ].join("\n"),
    inline: false
  });

  // Top Codes (All Time)
  const topCodesContent = metrics.topCodes.length > 0
    ? metrics.topCodes.map((item, idx) => `**${idx + 1}.** \`${item.code}\`: **${item.count}** invites`).join("\n")
    : "`Belum ada kode invite yang dipakai`";

  embed.addFields({
    name: "Top Codes",
    value: topCodesContent,
    inline: false
  });

  // 24 Hours
  const h24Content = [
    `Total: **${metrics.h24.total} invites**`,
    formatCodeBreakdown(metrics.h24.topCodes)
  ].join("\n");

  embed.addFields({
    name: "24 Hours",
    value: h24Content,
    inline: true
  });

  // 7 Days
  const d7Content = [
    `Total: **${metrics.d7.total} invites**`,
    formatCodeBreakdown(metrics.d7.topCodes)
  ].join("\n");

  embed.addFields({
    name: "7 Days",
    value: d7Content,
    inline: true
  });

  // 30 Days
  const d30Content = [
    `Total: **${metrics.d30.total} invites**`,
    formatCodeBreakdown(metrics.d30.topCodes)
  ].join("\n");

  embed.addFields({
    name: "30 Days",
    value: d30Content,
    inline: true
  });

  embed.setFooter({
    text: `Murphy Invite Tracker • Tanggal: ${getWibDateString()} (WIB) • Reset 00:00 WIB`
  });
  embed.setTimestamp();

  return embed;
}

/**
 * Build tracking embed for all admins / staff daily targets.
 */
async function buildAdminTargetsEmbed(guild) {
  const settings = getInviteSettings(guild.id);
  const targetRoleId = settings.targetRoleId;
  const userTargets = settings.userTargets || {};

  // Fetch role members
  let staffMembers = [];
  if (targetRoleId && guild.roles.cache.has(targetRoleId)) {
    const role = guild.roles.cache.get(targetRoleId);
    staffMembers = Array.from(role.members.values());
  }

  // Include any extra users that have specific targets set
  const allTargetUserIds = new Set(staffMembers.map((m) => m.id));
  for (const userId of Object.keys(userTargets)) {
    allTargetUserIds.add(userId);
  }

  if (allTargetUserIds.size === 0) {
    const embed = new EmbedBuilder()
      .setColor("#f59e0b")
      .setTitle("📋 Tracking Target Harian Staff & Admin")
      .setDescription(
        `Belum ada staff atau admin yang terdaftar.\n` +
        `• Role Staff default: <@&${targetRoleId || "belum diset"}>\n` +
        `• Gunakan \`fsetinvitetarget <jumlah> [@user]\` untuk mengatur target individu atau global.`
      );
    return embed;
  }

  const memberMetricsList = [];

  for (const userId of allTargetUserIds) {
    let member = guild.members.cache.get(userId);
    if (!member) {
      try {
        member = await guild.members.fetch(userId).catch(() => null);
      } catch {
        member = null;
      }
    }

    const metrics = getInviterMetrics(guild.id, userId);
    memberMetricsList.push({
      userId,
      member,
      metrics
    });
  }

  // Sort by completion percent descending, then todayJoins descending
  memberMetricsList.sort((a, b) => {
    if (b.metrics.percent !== a.metrics.percent) {
      return b.metrics.percent - a.metrics.percent;
    }
    return b.metrics.todayJoins - a.metrics.todayJoins;
  });

  const lines = memberMetricsList.map((entry, index) => {
    const { userId, member, metrics } = entry;
    const name = member ? member.displayName : `<@${userId}>`;
    const tag = metrics.isTargetAchieved ? "✅ **Tercapai**" : `⏳ **Kurang ${metrics.target - metrics.todayJoins}**`;

    return [
      `**${index + 1}. ${name}** (<@${userId}>)`,
      `   Target: **${metrics.todayJoins}/${metrics.target}** invites | ${metrics.progressBar} **${metrics.percent}%** • ${tag}`
    ].join("\n");
  });

  const totalAchieved = memberMetricsList.filter((m) => m.metrics.isTargetAchieved).length;

  const embed = new EmbedBuilder()
    .setColor("#22c55e")
    .setTitle("📋 Tracking Target Harian Staff & Admin")
    .setDescription(
      `Tanggal: **${getWibDateString()} (WIB)**\n` +
      `Target Default: **${settings.dailyTarget} invites/hari**\n` +
      `Staff Tercapai: **${totalAchieved} / ${memberMetricsList.length}** staff\n\n` +
      lines.join("\n\n")
    )
    .setFooter({
      text: "Murphy Invite Tracker • Reset setiap 00:00 WIB"
    })
    .setTimestamp();

  return embed;
}

/**
 * Build Invite Leaderboard embed.
 */
function buildInviteLeaderboardEmbed(guild) {
  const inviters = getAllInviters(guild.id);
  const settings = getInviteSettings(guild.id);

  const list = Object.entries(inviters).map(([userId, data]) => {
    const regular = data.regular || 0;
    const leaves = data.leaves || 0;
    const fake = data.fake || 0;
    const net = Math.max(0, regular - leaves);
    return { userId, regular, leaves, fake, net };
  });

  list.sort((a, b) => b.net - a.net);

  const top10 = list.slice(0, 10);

  if (top10.length === 0) {
    return new EmbedBuilder()
      .setColor("#22c55e")
      .setTitle("🏆 Papan Peringkat Invite Server")
      .setDescription("Belum ada data invite yang tercatat di server ini.");
  }

  const lines = top10.map((entry, idx) => {
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `**#${idx + 1}**`;
    return `${medal} <@${entry.userId}>: **${entry.net}** total invites (${entry.regular} regular, ${entry.fake} fake, -${entry.leaves} leaves)`;
  });

  return new EmbedBuilder()
    .setColor("#22c55e")
    .setTitle(`🏆 Top Inviters — ${guild.name}`)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: `Target harian server: ${settings.dailyTarget} invites/hari • Murphy Invite Tracker`
    })
    .setTimestamp();
}

module.exports = {
  buildAdminTargetsEmbed,
  buildInviteEmbed,
  buildInviteLeaderboardEmbed,
  getInviterMetrics,
  getStartOfTodayWIB,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleInviteCreate,
  handleInviteDelete,
  initInviteTracker
};
