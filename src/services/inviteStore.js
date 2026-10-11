const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "invites.json");

const HISTORY_RETENTION_MS = 40 * 24 * 60 * 60 * 1000; // 40 days

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
      dataFile,
      `${JSON.stringify({ guilds: {} }, null, 2)}\n`,
      "utf8"
    );
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      guilds: parsed.guilds || {}
    };
  } catch (error) {
    console.error("Failed to read invite store:", error);
    return {
      guilds: {}
    };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function ensureGuildData(store, guildId) {
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = {
      settings: {
        dailyTarget: 5,
        targetRoleId: "1558778004425932890", // default staff role
        userTargets: {}
      },
      members: {},
      inviters: {}
    };
  }

  const guildData = store.guilds[guildId];
  if (!guildData.settings) {
    guildData.settings = {
      dailyTarget: 5,
      targetRoleId: "1558778004425932890",
      userTargets: {}
    };
  }
  if (!guildData.settings.userTargets) {
    guildData.settings.userTargets = {};
  }
  if (!guildData.members) {
    guildData.members = {};
  }
  if (!guildData.inviters) {
    guildData.inviters = {};
  }

  return guildData;
}

function getInviteSettings(guildId) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  return {
    dailyTarget: Number(guildData.settings.dailyTarget) || 5,
    targetRoleId: guildData.settings.targetRoleId || "1558778004425932890",
    userTargets: guildData.settings.userTargets || {}
  };
}

function updateInviteSettings(guildId, updates) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  guildData.settings = {
    ...guildData.settings,
    ...updates,
    userTargets: {
      ...guildData.settings.userTargets,
      ...(updates.userTargets || {})
    }
  };

  writeStore(store);
  return guildData.settings;
}

function setUserTarget(guildId, userId, target) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  if (target === null || target === undefined || target <= 0) {
    delete guildData.settings.userTargets[userId];
  } else {
    guildData.settings.userTargets[userId] = Number(target);
  }

  writeStore(store);
  return guildData.settings;
}

function getInviterRecord(guildId, userId) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  return guildData.inviters[userId] || {
    regular: 0,
    fake: 0,
    leaves: 0,
    codes: {},
    history: []
  };
}

function getAllInviters(guildId) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  return guildData.inviters;
}

function getMemberRecord(guildId, memberId) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);

  return guildData.members[memberId] || null;
}

function recordJoin(guildId, { memberId, inviterId, code, isFake, joinedAt }) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);
  const now = joinedAt || Date.now();

  // Save member record
  guildData.members[memberId] = {
    inviterId,
    code,
    joinedAt: now,
    isFake: Boolean(isFake)
  };

  if (!inviterId || inviterId === "UNKNOWN" || inviterId === "VANITY") {
    writeStore(store);
    return;
  }

  // Update inviter stats
  if (!guildData.inviters[inviterId]) {
    guildData.inviters[inviterId] = {
      regular: 0,
      fake: 0,
      leaves: 0,
      codes: {},
      history: []
    };
  }

  const inviter = guildData.inviters[inviterId];
  if (!inviter.codes) inviter.codes = {};
  if (!Array.isArray(inviter.history)) inviter.history = [];

  if (isFake) {
    inviter.fake = (inviter.fake || 0) + 1;
  } else {
    inviter.regular = (inviter.regular || 0) + 1;
  }

  if (code) {
    inviter.codes[code] = (inviter.codes[code] || 0) + 1;
  }

  inviter.history.push({
    type: "join",
    memberId,
    code,
    isFake: Boolean(isFake),
    timestamp: now
  });

  // Prune history older than HISTORY_RETENTION_MS
  const cutoff = now - HISTORY_RETENTION_MS;
  inviter.history = inviter.history.filter((h) => h.timestamp >= cutoff);

  writeStore(store);
}

function recordLeave(guildId, memberId) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);
  const now = Date.now();

  const memberRecord = guildData.members[memberId];
  if (!memberRecord || !memberRecord.inviterId) {
    return null;
  }

  const { inviterId, code } = memberRecord;
  if (!inviterId || inviterId === "UNKNOWN" || inviterId === "VANITY") {
    return null;
  }

  const inviter = guildData.inviters[inviterId];
  if (!inviter) {
    return null;
  }

  inviter.leaves = (inviter.leaves || 0) + 1;
  if (!Array.isArray(inviter.history)) {
    inviter.history = [];
  }

  inviter.history.push({
    type: "leave",
    memberId,
    code,
    timestamp: now
  });

  // Prune history
  const cutoff = now - HISTORY_RETENTION_MS;
  inviter.history = inviter.history.filter((h) => h.timestamp >= cutoff);

  writeStore(store);
  return memberRecord;
}

function seedBaselineInvites(guildId, baselineList) {
  const store = readStore();
  const guildData = ensureGuildData(store, guildId);
  let changed = false;

  for (const item of baselineList) {
    const { inviterId, code, uses } = item;
    if (!inviterId || !code || uses <= 0) continue;

    if (!guildData.inviters[inviterId]) {
      guildData.inviters[inviterId] = {
        regular: 0,
        fake: 0,
        leaves: 0,
        codes: {},
        history: []
      };
    }

    const inviter = guildData.inviters[inviterId];
    if (!inviter.codes) inviter.codes = {};

    const currentCodeUses = inviter.codes[code] || 0;
    if (uses > currentCodeUses) {
      const diff = uses - currentCodeUses;
      inviter.codes[code] = uses;
      inviter.regular = (inviter.regular || 0) + diff;
      changed = true;
    }
  }

  if (changed) {
    writeStore(store);
  }
}

module.exports = {
  getAllInviters,
  getInviteSettings,
  getInviterRecord,
  getMemberRecord,
  recordJoin,
  recordLeave,
  seedBaselineInvites,
  setUserTarget,
  updateInviteSettings
};
