const fs = require("node:fs");
const path = require("node:path");

const lockDirectory = path.join(__dirname, "..", "..", "data");
const lockFile = path.join(lockDirectory, ".bot-runtime.lock");

function ensureLockDirectory() {
  if (!fs.existsSync(lockDirectory)) {
    fs.mkdirSync(lockDirectory, { recursive: true });
  }
}

function canPingProcess(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPayload() {
  try {
    return JSON.parse(fs.readFileSync(lockFile, "utf8"));
  } catch {
    return null;
  }
}

function writeLockPayload() {
  const payload = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    cwd: process.cwd()
  };

  fs.writeFileSync(lockFile, JSON.stringify(payload, null, 2), {
    flag: "wx"
  });
}

function releaseLock() {
  try {
    const payload = readLockPayload();

    if (payload?.pid && payload.pid !== process.pid) {
      return;
    }

    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  } catch {
    // Ignore cleanup failures during shutdown.
  }
}

function acquireSingleInstanceLock() {
  ensureLockDirectory();

  try {
    writeLockPayload();
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    const payload = readLockPayload();

    if (payload?.pid && canPingProcess(payload.pid)) {
      throw new Error(`Another Murphy instance is already running with PID ${payload.pid}.`);
    }

    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Ignore stale lock cleanup failure and retry once below.
    }

    writeLockPayload();
  }

  let released = false;
  const safeRelease = () => {
    if (released) {
      return;
    }

    released = true;
    releaseLock();
  };

  process.on("exit", safeRelease);
  process.on("SIGINT", () => {
    safeRelease();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    safeRelease();
    process.exit(0);
  });

  return safeRelease;
}

module.exports = {
  acquireSingleInstanceLock
};
