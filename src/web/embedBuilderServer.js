const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  appendAuditEntry,
  listAuditEntries
} = require("../services/embedBuilderAuditStore");
const {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  sanitizeTemplateTags,
  updateTemplate
} = require("../services/embedTemplateStore");
const {
  MAX_BUTTONS,
  MAX_EMBEDS,
  MAX_FIELDS,
  fetchBuilderMessage,
  listAvailableTextChannels,
  normalizeBuilderPayload,
  sendBuilderMessage
} = require("../modules/embed-builder/embedBuilderSystem");
const { createExpCard } = require("../modules/levels/expCard");
const { createLevelUpCard } = require("../modules/levels/levelUpCard");
const {
  DEFAULT_EXP_CARD_CONFIG,
  getExpCardConfig,
  normalizeExpCardConfig,
  resetExpCardConfig,
  saveExpCardConfig
} = require("../services/expCardConfigStore");
const {
  DEFAULT_LEVEL_UP_CARD_CONFIG,
  getLevelUpCardConfig,
  normalizeLevelUpCardConfig,
  resetLevelUpCardConfig,
  saveLevelUpCardConfig
} = require("../services/levelUpCardConfigStore");

const SESSION_COOKIE_NAME = "murphy_embed_session";
const sessions = new Map();
const staticAssetCache = new Map();

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...rest] = part.split("=");
        return [name, decodeURIComponent(rest.join("="))];
      })
  );
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...extraHeaders
  });
  response.end(payload);
}

async function readStaticAsset(filePath) {
  if (staticAssetCache.has(filePath)) {
    return staticAssetCache.get(filePath);
  }

  const content = await fs.readFile(filePath, "utf8");
  staticAssetCache.set(filePath, content);
  return content;
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const raw = await readRequestBody(request);

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Body request tidak valid.");
  }
}

function createSession(serverConfig) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + (serverConfig.sessionTtlHours * 60 * 60 * 1000);
  sessions.set(token, { expiresAt });
  return { token, expiresAt };
}

function buildSessionCookie(token, serverConfig) {
  const maxAge = serverConfig.sessionTtlHours * 60 * 60;
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function authenticateRequest(request, serverConfig) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return false;
  }

  const session = sessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }

  session.expiresAt = Date.now() + (serverConfig.sessionTtlHours * 60 * 60 * 1000);
  return true;
}

function requireAuth(request, response, serverConfig) {
  if (authenticateRequest(request, serverConfig)) {
    return true;
  }

  sendJson(response, 401, {
    ok: false,
    error: "Unauthorized"
  });
  return false;
}

function isLocalEditorRequest(request) {
  const remoteAddress = String(
    request.socket?.remoteAddress
    || request.connection?.remoteAddress
    || ""
  ).trim();

  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ].includes(remoteAddress);
}

function requireLocalEditorAccess(request, response) {
  if (isLocalEditorRequest(request)) {
    return true;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Not found"
  });
  return false;
}

function mapTemplatesForResponse() {
  return listTemplates().map((template) => ({
    id: template.id,
    name: template.name,
    tags: template.tags || [],
    payload: normalizeBuilderPayload(template.payload),
    updatedAt: template.updatedAt
  }));
}

function getStaticPaths() {
  const root = path.join(__dirname, "..", "..");

  return {
    html: path.join(root, "tools", "embed-builder.html"),
    css: path.join(root, "tools", "embed-builder.css"),
    js: path.join(root, "tools", "embed-builder.js"),
    expEditorHtml: path.join(root, "tools", "exp-editor.html"),
    expEditorCss: path.join(root, "tools", "exp-editor.css"),
    expEditorJs: path.join(root, "tools", "exp-editor.js"),
    levelUpEditorHtml: path.join(root, "tools", "levelup-editor.html"),
    levelUpEditorCss: path.join(root, "tools", "levelup-editor.css"),
    levelUpEditorJs: path.join(root, "tools", "levelup-editor.js")
  };
}

function buildExpEditorSample(payload = {}) {
  const displayName = String(payload.name || "neoniyann").trim() || "neoniyann";
  const level = Math.max(1, Number.parseInt(String(payload.level || 9), 10) || 9);
  const xp = Math.max(0, Number.parseInt(String(payload.xp || 475), 10) || 475);
  const nextThresholdBase = Math.max(level + 1, Number.parseInt(String(payload.nextThreshold || Math.max(600, xp + 50)), 10) || Math.max(600, xp + 50));
  const currentThreshold = level <= 1 ? 0 : Math.max(0, Math.floor(nextThresholdBase * 0.55));
  const clampedXp = Math.min(nextThresholdBase, Math.max(currentThreshold, xp));
  const remainingXp = Math.max(0, nextThresholdBase - clampedXp);
  const divisor = Math.max(1, nextThresholdBase - currentThreshold);
  const progressRatio = level >= 5 ? 1 : Math.max(0, Math.min(1, (clampedXp - currentThreshold) / divisor));
  const avatarUrl = String(payload.avatarUrl || "").trim() || "https://cdn.discordapp.com/embed/avatars/0.png";

  return {
    member: {
      displayName,
      user: {
        username: displayName.toLowerCase().replace(/\s+/g, ""),
        displayAvatarURL() {
          return avatarUrl;
        }
      }
    },
    levelInfo: {
      level,
      xp: clampedXp,
      currentThreshold,
      nextThreshold: nextThresholdBase,
      remainingXp,
      progressRatio
    }
  };
}

function buildLevelUpEditorSample(payload = {}) {
  const previousLevel = Math.max(0, Number.parseInt(String(payload.previousLevel || 66), 10) || 66);
  const nextLevel = Math.max(previousLevel + 1, Number.parseInt(String(payload.nextLevel || previousLevel + 1), 10) || previousLevel + 1);
  const avatarUrl = String(payload.avatarUrl || "").trim() || "https://cdn.discordapp.com/embed/avatars/0.png";

  return {
    member: {
      displayName: "lilputrxx666",
      user: {
        username: "putrxx",
        displayAvatarURL() {
          return avatarUrl;
        }
      }
    },
    previousLevelInfo: {
      level: previousLevel,
      code: `L${previousLevel}`,
      name: "Noctis"
    },
    nextLevelInfo: {
      level: nextLevel,
      code: `L${nextLevel}`,
      name: "Eclipse"
    }
  };
}

async function handleLogin(request, response, serverConfig) {
  const payload = await readJsonBody(request);
  const password = String(payload.password || "");

  if (!serverConfig.password || password !== serverConfig.password) {
    sendJson(response, 401, {
      ok: false,
      error: "Password salah."
    });
    return;
  }

  const session = createSession(serverConfig);

  sendJson(response, 200, { ok: true }, {
    "Set-Cookie": buildSessionCookie(session.token, serverConfig)
  });
}

async function handleBootstrap(response, client) {
  const channels = await listAvailableTextChannels(client);
  const templates = mapTemplatesForResponse();

  sendJson(response, 200, {
    ok: true,
    channels,
    templates,
    audits: listAuditEntries(12),
    limits: {
      embeds: MAX_EMBEDS,
      fields: MAX_FIELDS,
      buttons: MAX_BUTTONS
    }
  });
}

async function handleTemplateSave(request, response) {
  const payload = await readJsonBody(request);
  const name = String(payload.name || "").trim().slice(0, 80);
  const normalized = normalizeBuilderPayload(payload.payload || {});
  const tags = sanitizeTemplateTags(payload.tags);

  if (!name) {
    sendJson(response, 400, {
      ok: false,
      error: "Nama template wajib diisi."
    });
    return;
  }

  let template = null;

  if (payload.templateId && getTemplate(payload.templateId)) {
    template = updateTemplate(payload.templateId, (current) => ({
      ...current,
      name,
      tags,
      payload: normalized
    }));
  } else {
    template = createTemplate(name, normalized, { tags });
  }

  appendAuditEntry({
    action: payload.templateId ? "template-update" : "template-create",
    templateId: template.id,
    templateName: template.name,
    detail: tags.length ? `Tags: ${tags.join(", ")}` : "No tags"
  });

  sendJson(response, 200, {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      tags: template.tags || [],
      payload: normalizeBuilderPayload(template.payload),
      updatedAt: template.updatedAt
    }
  });
}

async function handleTemplateDuplicate(request, response) {
  const payload = await readJsonBody(request);
  const source = getTemplate(payload.templateId);

  if (!source) {
    sendJson(response, 404, {
      ok: false,
      error: "Template sumber tidak ditemukan."
    });
    return;
  }

  const template = duplicateTemplate(source.id, {
    name: String(payload.name || `${source.name} Copy`).trim().slice(0, 80) || `${source.name} Copy`,
    tags: sanitizeTemplateTags(payload.tags?.length ? payload.tags : source.tags)
  });

  appendAuditEntry({
    action: "template-duplicate",
    templateId: template.id,
    templateName: template.name,
    detail: `From ${source.id}`
  });

  sendJson(response, 200, {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      tags: template.tags || [],
      payload: normalizeBuilderPayload(template.payload),
      updatedAt: template.updatedAt
    }
  });
}

async function handleTemplateDelete(response, templateId) {
  const deleted = deleteTemplate(templateId);

  if (!deleted) {
    sendJson(response, 404, {
      ok: false,
      error: "Template tidak ditemukan."
    });
    return;
  }

  appendAuditEntry({
    action: "template-delete",
    templateId: deleted.id,
    templateName: deleted.name
  });

  sendJson(response, 200, {
    ok: true
  });
}

async function handleChannels(response, client, refresh = false) {
  const channels = await listAvailableTextChannels(client, {
    forceRefresh: refresh
  });

  if (refresh) {
    appendAuditEntry({
      action: "channels-refresh",
      detail: `${channels.length} guild entries`
    });
  }

  sendJson(response, 200, {
    ok: true,
    channels
  });
}

function handleLevelUpEditorBootstrap(response) {
  sendJson(response, 200, {
    ok: true,
    config: getLevelUpCardConfig(),
    defaults: normalizeLevelUpCardConfig(DEFAULT_LEVEL_UP_CARD_CONFIG)
  });
}

function handleExpEditorBootstrap(response) {
  sendJson(response, 200, {
    ok: true,
    config: getExpCardConfig(),
    defaults: normalizeExpCardConfig(DEFAULT_EXP_CARD_CONFIG)
  });
}

async function handleExpEditorPreview(request, response) {
  const payload = await readJsonBody(request);
  const config = normalizeExpCardConfig(payload.config || {});
  const sample = buildExpEditorSample(payload.sample || {});
  const card = await createExpCard(sample.member, sample.levelInfo, config);
  const buffer = Buffer.isBuffer(card.attachment) ? card.attachment : Buffer.from(card.attachment);

  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store"
  });
  response.end(buffer);
}

async function handleExpEditorSave(request, response) {
  const payload = await readJsonBody(request);
  const config = saveExpCardConfig(payload.config || {});

  appendAuditEntry({
    action: "exp-editor-save",
    detail: `${config.width}x${config.height}`
  });

  sendJson(response, 200, {
    ok: true,
    config
  });
}

function handleExpEditorReset(response) {
  const config = resetExpCardConfig();

  appendAuditEntry({
    action: "exp-editor-reset"
  });

  sendJson(response, 200, {
    ok: true,
    config
  });
}

async function handleLevelUpEditorPreview(request, response) {
  const payload = await readJsonBody(request);
  const config = normalizeLevelUpCardConfig(payload.config || {});
  const sample = buildLevelUpEditorSample(payload.sample || {});
  const card = await createLevelUpCard(sample.member, sample.previousLevelInfo, sample.nextLevelInfo, config);
  const buffer = Buffer.isBuffer(card.attachment) ? card.attachment : Buffer.from(card.attachment);

  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store"
  });
  response.end(buffer);
}

async function handleLevelUpEditorSave(request, response) {
  const payload = await readJsonBody(request);
  const config = saveLevelUpCardConfig(payload.config || {});

  appendAuditEntry({
    action: "levelup-editor-save",
    detail: `${config.width}x${config.height}`
  });

  sendJson(response, 200, {
    ok: true,
    config
  });
}

function handleLevelUpEditorReset(response) {
  const config = resetLevelUpCardConfig();

  appendAuditEntry({
    action: "levelup-editor-reset"
  });

  sendJson(response, 200, {
    ok: true,
    config
  });
}

async function handleFetchMessage(request, response, client) {
  const payload = await readJsonBody(request);
  const result = await fetchBuilderMessage(client, payload.payload || payload);

  appendAuditEntry({
    action: "message-fetch",
    channelId: result.channelId,
    messageId: result.messageId,
    detail: result.authorId ? `Author ${result.authorId}` : ""
  });

  sendJson(response, 200, {
    ok: true,
    result
  });
}

async function handleSend(request, response, client) {
  const payload = await readJsonBody(request);
  const result = await sendBuilderMessage(client, payload.payload || payload);

  appendAuditEntry({
    action: result.action === "edit" ? "message-edit" : "message-send",
    channelId: result.channelId,
    messageId: result.messageId
  });

  sendJson(response, 200, {
    ok: true,
    result
  });
}

function startEmbedBuilderServer(client) {
  const serverConfig = client.config.embedBuilder;

  if (!serverConfig?.enabled) {
    return null;
  }

  if (!serverConfig.password) {
    console.warn("Embed Builder disabled because EMBED_BUILDER_PASSWORD is empty.");
    return null;
  }

  if (client.embedBuilderServer) {
    return client.embedBuilderServer;
  }

  const staticPaths = getStaticPaths();

  const server = http.createServer((request, response) => {
    const handler = async () => {
      const url = new URL(request.url, `http://${request.headers.host || `${serverConfig.host}:${serverConfig.port}`}`);

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/embed-builder")) {
        const html = await readStaticAsset(staticPaths.html);
        return sendText(response, 200, html, "text/html; charset=utf-8", {
          "Cache-Control": "no-store"
        });
      }

      if (request.method === "GET" && url.pathname === "/embed-builder.css") {
        const css = await readStaticAsset(staticPaths.css);
        return sendText(response, 200, css, "text/css; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "GET" && url.pathname === "/embed-builder.js") {
        const js = await readStaticAsset(staticPaths.js);
        return sendText(response, 200, js, "application/javascript; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "GET" && url.pathname === "/exp-editor") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const html = await readStaticAsset(staticPaths.expEditorHtml);
        return sendText(response, 200, html, "text/html; charset=utf-8", {
          "Cache-Control": "no-store"
        });
      }

      if (request.method === "GET" && url.pathname === "/exp-editor.css") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const css = await readStaticAsset(staticPaths.expEditorCss);
        return sendText(response, 200, css, "text/css; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "GET" && url.pathname === "/exp-editor.js") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const js = await readStaticAsset(staticPaths.expEditorJs);
        return sendText(response, 200, js, "application/javascript; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "GET" && url.pathname === "/levelup-editor") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const html = await readStaticAsset(staticPaths.levelUpEditorHtml);
        return sendText(response, 200, html, "text/html; charset=utf-8", {
          "Cache-Control": "no-store"
        });
      }

      if (request.method === "GET" && url.pathname === "/levelup-editor.css") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const css = await readStaticAsset(staticPaths.levelUpEditorCss);
        return sendText(response, 200, css, "text/css; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "GET" && url.pathname === "/levelup-editor.js") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        const js = await readStaticAsset(staticPaths.levelUpEditorJs);
        return sendText(response, 200, js, "application/javascript; charset=utf-8", {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/login") {
        return handleLogin(request, response, serverConfig);
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/logout") {
        const cookies = parseCookies(request.headers.cookie || "");
        const token = cookies[SESSION_COOKIE_NAME];

        if (token) {
          sessions.delete(token);
        }

        return sendJson(response, 200, { ok: true }, {
          "Set-Cookie": buildExpiredSessionCookie()
        });
      }

      if (request.method === "GET" && url.pathname === "/api/embed-builder/health") {
        return sendJson(response, 200, {
          ok: true,
          ready: client.isReady?.() || false
        });
      }

      if (!requireAuth(request, response, serverConfig)) {
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/exp-editor/bootstrap") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleExpEditorBootstrap(response);
      }

      if (request.method === "POST" && url.pathname === "/api/exp-editor/preview") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleExpEditorPreview(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/exp-editor/config") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleExpEditorSave(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/exp-editor/reset") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleExpEditorReset(response);
      }

      if (request.method === "GET" && url.pathname === "/api/levelup-editor/bootstrap") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleLevelUpEditorBootstrap(response);
      }

      if (request.method === "POST" && url.pathname === "/api/levelup-editor/preview") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleLevelUpEditorPreview(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/levelup-editor/config") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleLevelUpEditorSave(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/levelup-editor/reset") {
        if (!requireLocalEditorAccess(request, response)) {
          return;
        }

        return handleLevelUpEditorReset(response);
      }

      if (request.method === "GET" && url.pathname === "/api/embed-builder/bootstrap") {
        return handleBootstrap(response, client);
      }

      if (request.method === "GET" && url.pathname === "/api/embed-builder/channels") {
        return handleChannels(response, client, url.searchParams.get("refresh") === "1");
      }

      if (request.method === "GET" && url.pathname === "/api/embed-builder/templates") {
        return sendJson(response, 200, {
          ok: true,
          templates: mapTemplatesForResponse()
        });
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/templates") {
        return handleTemplateSave(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/templates/duplicate") {
        return handleTemplateDuplicate(request, response);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/embed-builder/templates/")) {
        const templateId = url.pathname.slice("/api/embed-builder/templates/".length);
        return handleTemplateDelete(response, templateId);
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/fetch-message") {
        return handleFetchMessage(request, response, client);
      }

      if (request.method === "POST" && url.pathname === "/api/embed-builder/send") {
        return handleSend(request, response, client);
      }

      return sendJson(response, 404, {
        ok: false,
        error: "Not found"
      });
    };

    handler().catch((error) => {
      console.error("Embed builder request failed:", error);
      sendJson(response, 500, {
        ok: false,
        error: error.message || "Internal server error"
      });
    });
  });

  server.listen(serverConfig.port, serverConfig.host, () => {
    console.log(`Embed builder running on http://${serverConfig.host}:${serverConfig.port}/embed-builder`);
  });

  client.embedBuilderServer = server;
  return server;
}

module.exports = {
  startEmbedBuilderServer
};
