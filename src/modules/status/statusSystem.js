const {
  listChatByChannel,
  listVoiceByChannel,
  listVoiceTotals,
  listChatEntries,
  getVoiceSession
} = require("../../services/leaderboardStore");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getPastDateKeys(daysAgo) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < daysAgo; i += 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function sumDailyBuckets(daily, days) {
  const keys = getPastDateKeys(days);
  return keys.reduce((sum, key) => sum + (daily?.[key] || 0), 0);
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatDurationLong(totalMs) {
  const ms = Math.max(0, totalMs || 0);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} menit`;
  }

  return `${hours} jam, ${minutes} menit`;
}

function getEffectiveVoiceTotalMs(guildId, userId) {
  const totals = listVoiceTotals(guildId);
  const entry = totals.find((item) => item.userId === userId);
  let totalMs = entry?.totalMs || 0;

  const session = getVoiceSession(guildId, userId);
  if (session?.startedAt) {
    totalMs += Math.max(0, Date.now() - new Date(session.startedAt).getTime());
  }

  return totalMs;
}

function buildStatusSnapshot(guild, member) {
  const guildId = guild.id;
  const userId = member.id;

  const chatByChannel = listChatByChannel(guildId, userId);
  const voiceByChannel = listVoiceByChannel(guildId, userId);

  const totalMessages = chatByChannel.reduce((sum, entry) => sum + (entry.totalMessages || 0), 0);
  const messages24h = chatByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 1), 0);
  const messages7d = chatByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 7), 0);
  const messages30d = chatByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 30), 0);

  const voiceTotalMs = getEffectiveVoiceTotalMs(guildId, userId);
  const voice24h = voiceByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 1), 0);
  const voice7d = voiceByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 7), 0);
  const voice30d = voiceByChannel.reduce((sum, entry) => sum + sumDailyBuckets(entry.daily, 30), 0);

  const topTextChannels = chatByChannel
    .sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0))
    .slice(0, 5)
    .map((entry) => ({
      channelId: entry.channelId,
      name: guild.channels.cache.get(entry.channelId)?.name || "Unknown",
      messages: entry.totalMessages || 0
    }));

  const topVoiceChannels = voiceByChannel
    .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0))
    .slice(0, 5)
    .map((entry) => ({
      channelId: entry.channelId,
      name: guild.channels.cache.get(entry.channelId)?.name || "Unknown",
      totalMs: entry.totalMs || 0
    }));

  const allChat = listChatEntries(guildId);
  const allVoice = listVoiceTotals(guildId);

  const chatRank = allChat
    .sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0))
    .findIndex((entry) => entry.userId === userId) + 1;

  const voiceRank = allVoice
    .sort((a, b) => {
      const aMs = (a.totalMs || 0) + (a.activeSession?.startedAt
        ? Date.now() - new Date(a.activeSession.startedAt).getTime()
        : 0);
      const bMs = (b.totalMs || 0) + (b.activeSession?.startedAt
        ? Date.now() - new Date(b.activeSession.startedAt).getTime()
        : 0);
      return bMs - aMs;
    })
    .findIndex((entry) => entry.userId === userId) + 1;

  return {
    member,
    userInfo: {
      nickname: member.displayName || member.user.username,
      username: member.user.username,
      userId: member.id,
      avatarUrl: member.user.displayAvatarURL({ extension: "png", forceStatic: true, size: 512 }),
      createdAtLabel: formatDateLong(member.user.createdAt),
      joinedAtLabel: formatDateLong(member.joinedAt || new Date())
    },
    messages: {
      total: totalMessages,
      hours24: messages24h,
      days7: messages7d,
      days30: messages30d,
      rank: chatRank > 0 ? chatRank : null
    },
    voice: {
      totalMs: voiceTotalMs,
      hours24: voice24h,
      days7: voice7d,
      days30: voice30d,
      rank: voiceRank > 0 ? voiceRank : null
    },
    topTextChannels,
    topVoiceChannels
  };
}

module.exports = {
  buildStatusSnapshot,
  formatDurationLong
};
