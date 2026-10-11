const AUTOSAVE_KEY = "murphy_embed_builder_autosave_v2";
const AUTOSAVE_DELAY = 450;
const REQUEST_TIMEOUT_MS = 15000;
const RECENT_TARGETS_KEY = "murphy_embed_builder_recent_targets_v1";

const state = {
  channels: [],
  templates: [],
  audits: [],
  limits: {
    fields: 25,
    buttons: 5,
    embeds: 10
  },
  embeds: [],
  buttons: [],
  focusedElement: null,
  currentTemplateId: "",
  activeEmbedIndex: 0,
  autosaveTimer: null,
  lastAutosaveAt: "",
  previewFrame: null,
  templateFilter: "",
  previewMode: "desktop",
  recentTargets: []
};

const elements = {
  loginOverlay: document.getElementById("loginOverlay"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  passwordInput: document.getElementById("passwordInput"),
  logoutButton: document.getElementById("logoutButton"),
  sendButton: document.getElementById("sendButton"),
  channelSelect: document.getElementById("channelSelect"),
  refreshChannelsButton: document.getElementById("refreshChannelsButton"),
  messageActionSelect: document.getElementById("messageActionSelect"),
  messageTargetInput: document.getElementById("messageTargetInput"),
  messageTargetHint: document.getElementById("messageTargetHint"),
  messageTargetBadge: document.getElementById("messageTargetBadge"),
  fetchMessageButton: document.getElementById("fetchMessageButton"),
  cloneMessageToTemplateButton: document.getElementById("cloneMessageToTemplateButton"),
  recentTargets: document.getElementById("recentTargets"),
  clearRecentTargetsButton: document.getElementById("clearRecentTargetsButton"),
  templateSelect: document.getElementById("templateSelect"),
  templateSearchInput: document.getElementById("templateSearchInput"),
  loadTemplateButton: document.getElementById("loadTemplateButton"),
  duplicateTemplateButton: document.getElementById("duplicateTemplateButton"),
  deleteTemplateButton: document.getElementById("deleteTemplateButton"),
  saveTemplateButton: document.getElementById("saveTemplateButton"),
  templateNameInput: document.getElementById("templateNameInput"),
  templateTagsInput: document.getElementById("templateTagsInput"),
  templateMeta: document.getElementById("templateMeta"),
  statusText: document.getElementById("statusText"),
  formatTargetLabel: document.getElementById("formatTargetLabel"),
  autosaveBadge: document.getElementById("autosaveBadge"),
  embedCountBadge: document.getElementById("embedCountBadge"),
  messageContent: document.getElementById("messageContent"),
  embedTabs: document.getElementById("embedTabs"),
  addEmbedButton: document.getElementById("addEmbedButton"),
  duplicateEmbedButton: document.getElementById("duplicateEmbedButton"),
  moveEmbedUpButton: document.getElementById("moveEmbedUpButton"),
  moveEmbedDownButton: document.getElementById("moveEmbedDownButton"),
  removeEmbedButton: document.getElementById("removeEmbedButton"),
  activeEmbedLabel: document.getElementById("activeEmbedLabel"),
  embedTitle: document.getElementById("embedTitle"),
  embedColor: document.getElementById("embedColor"),
  embedDescription: document.getElementById("embedDescription"),
  authorName: document.getElementById("authorName"),
  authorIconUrl: document.getElementById("authorIconUrl"),
  authorUrl: document.getElementById("authorUrl"),
  thumbnailUrl: document.getElementById("thumbnailUrl"),
  imageUrl: document.getElementById("imageUrl"),
  footerText: document.getElementById("footerText"),
  footerIconUrl: document.getElementById("footerIconUrl"),
  timestampMode: document.getElementById("timestampMode"),
  timestampCustomInput: document.getElementById("timestampCustomInput"),
  fieldsContainer: document.getElementById("fieldsContainer"),
  buttonsContainer: document.getElementById("buttonsContainer"),
  addFieldButton: document.getElementById("addFieldButton"),
  addButtonButton: document.getElementById("addButtonButton"),
  jsonPayload: document.getElementById("jsonPayload"),
  exportJsonButton: document.getElementById("exportJsonButton"),
  exportDiscordJsonButton: document.getElementById("exportDiscordJsonButton"),
  importJsonButton: document.getElementById("importJsonButton"),
  clearJsonButton: document.getElementById("clearJsonButton"),
  validationList: document.getElementById("validationList"),
  rawPayloadPreview: document.getElementById("rawPayloadPreview"),
  auditList: document.getElementById("auditList"),
  previewCard: document.getElementById("previewCard"),
  previewModeSelect: document.getElementById("previewModeSelect"),
  previewRoot: document.getElementById("previewRoot")
};

function createEmptyEmbed() {
  return {
    title: "",
    description: "",
    color: "#111214",
    authorName: "",
    authorIconUrl: "",
    authorUrl: "",
    thumbnailUrl: "",
    imageUrl: "",
    footerText: "",
    footerIconUrl: "",
    timestampMode: "off",
    timestampValue: "",
    fields: []
  };
}

function ensureEmbedState() {
  if (!state.embeds.length) {
    state.embeds = [createEmptyEmbed()];
  }

  if (state.activeEmbedIndex < 0) {
    state.activeEmbedIndex = 0;
  }

  if (state.activeEmbedIndex >= state.embeds.length) {
    state.activeEmbedIndex = state.embeds.length - 1;
  }
}

function getActiveEmbed() {
  ensureEmbedState();
  return state.embeds[state.activeEmbedIndex];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeUrl(value) {
  return isValidHttpUrl(value) ? value : "";
}

function sanitizeString(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeColor(value) {
  const raw = String(value || "").trim();

  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw;
  }

  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw}`;
  }

  return "#111214";
}

function colorNumberToHex(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, "0")}`;
}

function normalizeMessageTargetInput(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return {
      raw: "",
      messageId: "",
      channelId: "",
      isValid: false,
      source: "empty"
    };
  }

  if (/^\d{15,25}$/.test(raw)) {
    return {
      raw,
      messageId: raw,
      channelId: "",
      isValid: true,
      source: "id"
    };
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const isDiscordHost = hostname === "discord.com"
      || hostname.endsWith(".discord.com")
      || hostname === "discordapp.com"
      || hostname.endsWith(".discordapp.com");
    const parts = url.pathname.split("/").filter(Boolean);

    if (isDiscordHost && parts[0] === "channels" && parts.length >= 4) {
      const channelId = /^\d{15,25}$/.test(parts[2]) ? parts[2] : "";
      const messageId = /^\d{15,25}$/.test(parts[3]) ? parts[3] : "";

      if (messageId) {
        return {
          raw,
          messageId,
          channelId,
          isValid: true,
          source: "url"
        };
      }
    }
  } catch {}

  return {
    raw,
    messageId: "",
    channelId: "",
    isValid: false,
    source: "invalid"
  };
}

function schedulePreviewRender() {
  if (state.previewFrame) {
    return;
  }

  state.previewFrame = window.requestAnimationFrame(() => {
    state.previewFrame = null;
    renderPreview();
  });
}

function flushPreviewRender() {
  if (state.previewFrame) {
    window.cancelAnimationFrame(state.previewFrame);
    state.previewFrame = null;
  }

  renderPreview();
}

function setStatus(message, tone = "muted") {
  elements.statusText.textContent = message || "";
  elements.statusText.className = "status-text";

  if (tone === "success" || tone === "error") {
    elements.statusText.classList.add(tone);
  }
}

function setFocusedElement(element) {
  state.focusedElement = element || null;
  elements.formatTargetLabel.textContent = state.focusedElement
    ? `Fokus: ${state.focusedElement.dataset.formatTarget || "Textarea"}`
    : "Fokus: belum ada textarea aktif";
}

function bindFocusTracking(root = document) {
  root.querySelectorAll("textarea[data-format-target]").forEach((element) => {
    element.addEventListener("focus", () => setFocusedElement(element));
    element.addEventListener("click", () => setFocusedElement(element));
  });
}

function normalizeField(field) {
  return {
    name: sanitizeString(field?.name, 256),
    value: sanitizeString(field?.value, 1024),
    inline: Boolean(field?.inline)
  };
}

function normalizeButton(button) {
  return {
    label: sanitizeString(button?.label, 80),
    url: sanitizeString(button?.url, 1000)
  };
}

function normalizeTimestampState(rawEmbed = {}) {
  const mode = String(rawEmbed.timestampMode || "").trim().toLowerCase();
  const rawValue = String(rawEmbed.timestampValue ?? rawEmbed.timestamp ?? "").trim();
  const value = rawValue ? new Date(rawValue) : null;
  const isoValue = value && !Number.isNaN(value.getTime()) ? value.toISOString() : "";

  if (mode === "custom" && isoValue) {
    return {
      timestampMode: "custom",
      timestampValue: isoValue
    };
  }

  if (mode === "now") {
    return {
      timestampMode: "now",
      timestampValue: ""
    };
  }

  if (typeof rawEmbed.timestamp === "string" && isoValue) {
    return {
      timestampMode: "custom",
      timestampValue: isoValue
    };
  }

  if (rawEmbed.timestamp === true) {
    return {
      timestampMode: "now",
      timestampValue: ""
    };
  }

  return {
    timestampMode: "off",
    timestampValue: ""
  };
}

function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeTemplateTagsInput(value) {
  const seen = new Set();

  return String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    })
    .slice(0, 12);
}

function formatTemplateTags(tags) {
  return Array.isArray(tags) && tags.length ? tags.join(", ") : "";
}

function normalizeEmbed(rawEmbed = {}) {
  const author = rawEmbed.author || {};
  const footer = rawEmbed.footer || {};
  const fields = Array.isArray(rawEmbed.fields)
    ? rawEmbed.fields.map(normalizeField).filter((field) => field.name && field.value).slice(0, state.limits.fields)
    : [];
  const timestamp = normalizeTimestampState(rawEmbed);

  return {
    title: sanitizeString(rawEmbed.title, 256),
    description: sanitizeString(rawEmbed.description, 4000),
    color: normalizeColor(rawEmbed.color ?? colorNumberToHex(rawEmbed.color)),
    authorName: sanitizeString(rawEmbed.authorName ?? author.name, 256),
    authorIconUrl: sanitizeString(rawEmbed.authorIconUrl ?? author.icon_url ?? author.iconURL, 1000),
    authorUrl: sanitizeString(rawEmbed.authorUrl ?? author.url, 1000),
    thumbnailUrl: sanitizeString(rawEmbed.thumbnailUrl ?? rawEmbed.thumbnail?.url, 1000),
    imageUrl: sanitizeString(rawEmbed.imageUrl ?? rawEmbed.image?.url, 1000),
    footerText: sanitizeString(rawEmbed.footerText ?? footer.text, 2048),
    footerIconUrl: sanitizeString(rawEmbed.footerIconUrl ?? footer.icon_url ?? footer.iconURL, 1000),
    timestampMode: timestamp.timestampMode,
    timestampValue: timestamp.timestampValue,
    fields
  };
}

function extractButtonsFromDiscordComponents(components) {
  if (!Array.isArray(components)) {
    return [];
  }

  return components
    .flatMap((row) => Array.isArray(row?.components) ? row.components : [])
    .filter((component) => Number(component?.type) === 2 && Number(component?.style) === 5 && isValidHttpUrl(component?.url))
    .map((component) => ({
      label: sanitizeString(component.label || "Open Link", 80),
      url: sanitizeString(component.url, 1000)
    }))
    .slice(0, state.limits.buttons);
}

function normalizeImportedPayload(rawPayload = {}) {
  const embeds = Array.isArray(rawPayload.embeds)
    ? rawPayload.embeds
    : rawPayload.embed
      ? [rawPayload.embed]
      : [];
  const parsedTarget = normalizeMessageTargetInput(
    rawPayload.targetMessageId
    || rawPayload.messageId
    || rawPayload.targetMessageUrl
    || rawPayload.messageLink
    || rawPayload.jumpUrl
  );

  const normalizedEmbeds = embeds.length
    ? embeds.map(normalizeEmbed).slice(0, state.limits.embeds)
    : [createEmptyEmbed()];

  const buttons = Array.isArray(rawPayload.buttons)
    ? rawPayload.buttons
      .map(normalizeButton)
      .filter((button) => button.label && isValidHttpUrl(button.url))
      .slice(0, state.limits.buttons)
    : extractButtonsFromDiscordComponents(rawPayload.components);

  return {
    channelId: sanitizeString(rawPayload.channelId || parsedTarget.channelId, 32),
    messageContent: sanitizeString(rawPayload.messageContent ?? rawPayload.content, 2000),
    targetMode: rawPayload.targetMode === "edit" || parsedTarget.messageId ? "edit" : "send",
    targetMessageId: parsedTarget.messageId,
    tags: Array.isArray(rawPayload.tags) ? rawPayload.tags : normalizeTemplateTagsInput(rawPayload.tags),
    embeds: normalizedEmbeds,
    buttons
  };
}

function getCurrentPayload(options = {}) {
  ensureEmbedState();
  const includeTarget = options.includeTarget !== false;
  const target = normalizeMessageTargetInput(elements.messageTargetInput.value);

  const payload = {
    channelId: elements.channelSelect.value || "",
    messageContent: sanitizeString(elements.messageContent.value, 2000),
    embeds: state.embeds.map(normalizeEmbed),
    buttons: state.buttons
      .map(normalizeButton)
      .filter((button) => button.label && isValidHttpUrl(button.url))
      .slice(0, state.limits.buttons)
  };

  if (includeTarget) {
    payload.targetMode = elements.messageActionSelect.value === "edit" ? "edit" : "send";
    payload.targetMessageId = target.messageId;
  }

  return payload;
}

function buildDiscordExportPayload(rawPayload = getCurrentPayload()) {
  const payload = normalizeImportedPayload(rawPayload);
  const embeds = payload.embeds
    .filter(hasEmbedContent)
    .map((embed) => {
      const discordEmbed = {
        color: Number.parseInt(normalizeColor(embed.color).slice(1), 16)
      };

      if (embed.title) {
        discordEmbed.title = embed.title;
      }

      if (embed.description) {
        discordEmbed.description = embed.description;
      }

      if (embed.authorName) {
        discordEmbed.author = {
          name: embed.authorName
        };

        if (isValidHttpUrl(embed.authorIconUrl)) {
          discordEmbed.author.icon_url = embed.authorIconUrl;
        }

        if (isValidHttpUrl(embed.authorUrl)) {
          discordEmbed.author.url = embed.authorUrl;
        }
      }

      if (isValidHttpUrl(embed.thumbnailUrl)) {
        discordEmbed.thumbnail = {
          url: embed.thumbnailUrl
        };
      }

      if (isValidHttpUrl(embed.imageUrl)) {
        discordEmbed.image = {
          url: embed.imageUrl
        };
      }

      if (embed.footerText) {
        discordEmbed.footer = {
          text: embed.footerText
        };

        if (isValidHttpUrl(embed.footerIconUrl)) {
          discordEmbed.footer.icon_url = embed.footerIconUrl;
        }
      }

      if (embed.fields.length) {
        discordEmbed.fields = embed.fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: Boolean(field.inline)
        }));
      }

      if (embed.timestampMode === "custom" && embed.timestampValue) {
        discordEmbed.timestamp = embed.timestampValue;
      } else if (embed.timestampMode === "now") {
        discordEmbed.timestamp = new Date().toISOString();
      }

      return discordEmbed;
    });

  const discordPayload = {};

  if (payload.messageContent) {
    discordPayload.content = payload.messageContent;
  }

  if (embeds.length) {
    discordPayload.embeds = embeds;
  }

  if (payload.buttons.length) {
    discordPayload.components = [
      {
        type: 1,
        components: payload.buttons.map((button) => ({
          type: 2,
          style: 5,
          label: button.label,
          url: button.url
        }))
      }
    ];
  }

  return discordPayload;
}

function setMessageTargetBadge(label, tone = "") {
  elements.messageTargetBadge.textContent = label;
  elements.messageTargetBadge.className = "info-chip";

  if (tone) {
    elements.messageTargetBadge.classList.add(tone);
  }
}

function setAutosaveBadge(label, tone = "") {
  elements.autosaveBadge.textContent = label;
  elements.autosaveBadge.className = "info-chip";

  if (tone) {
    elements.autosaveBadge.classList.add(tone);
  }
}

function updateEmbedCountBadge() {
  const count = state.embeds.length;
  const label = count === 1 ? "1 embed aktif" : `${count} embed aktif`;
  elements.embedCountBadge.textContent = label;
}

function updateTemplateActionState() {
  const hasSelectedTemplate = Boolean(state.currentTemplateId);
  elements.deleteTemplateButton.disabled = !hasSelectedTemplate;
  elements.duplicateTemplateButton.disabled = !hasSelectedTemplate;
  elements.saveTemplateButton.textContent = hasSelectedTemplate ? "Update Template" : "Save Template";
}

function getFilteredTemplates() {
  const query = state.templateFilter.trim().toLowerCase();

  if (!query) {
    return state.templates;
  }

  return state.templates.filter((template) => {
    const haystack = [template.name, ...(template.tags || [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function getChannelLabel(channelId) {
  for (const guildEntry of state.channels) {
    for (const channel of guildEntry.channels) {
      if (channel.id === channelId) {
        return `${guildEntry.guildName} / #${channel.name}`;
      }
    }
  }

  return channelId ? `Channel ${channelId}` : "Channel belum dipilih";
}

function updateTemplateMeta() {
  const selected = state.templates.find((template) => template.id === state.currentTemplateId);

  if (!selected) {
    elements.templateMeta.textContent = "";
    return;
  }

  const tags = selected.tags?.length ? `Tags: ${selected.tags.join(", ")}` : "Tags: none";
  const updatedAt = selected.updatedAt
    ? `Updated ${new Date(selected.updatedAt).toLocaleString("id-ID")}`
    : "";
  elements.templateMeta.textContent = [tags, updatedAt].filter(Boolean).join(" · ");
}

function loadRecentTargets() {
  try {
    const raw = localStorage.getItem(RECENT_TARGETS_KEY);
    state.recentTargets = raw ? JSON.parse(raw) : [];
  } catch {
    state.recentTargets = [];
  }
}

function saveRecentTargets() {
  localStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(state.recentTargets));
}

function addRecentTarget(entry) {
  const nextEntry = {
    mode: entry.mode || "send",
    channelId: entry.channelId || "",
    messageId: entry.messageId || "",
    label: entry.label || "",
    at: new Date().toISOString()
  };
  const dedupeKey = `${nextEntry.mode}:${nextEntry.channelId}:${nextEntry.messageId}`;

  state.recentTargets = [
    nextEntry,
    ...state.recentTargets.filter((item) => `${item.mode}:${item.channelId}:${item.messageId}` !== dedupeKey)
  ].slice(0, 10);

  saveRecentTargets();
  renderRecentTargets();
}

function renderRecentTargets() {
  elements.recentTargets.innerHTML = "";

  if (!state.recentTargets.length) {
    const empty = document.createElement("p");
    empty.className = "muted builder-empty";
    empty.textContent = "Belum ada target terbaru.";
    elements.recentTargets.appendChild(empty);
    return;
  }

  state.recentTargets.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "recent-target-card";

    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.label || (entry.mode === "edit" ? "Recent edit target" : "Recent send target");
    const meta = document.createElement("div");
    meta.className = "recent-target-meta";
    meta.innerHTML = `
      <span>${escapeHtml(getChannelLabel(entry.channelId))}</span>
      ${entry.messageId ? `<span>Message ${escapeHtml(entry.messageId)}</span>` : ""}
      <span>${new Date(entry.at).toLocaleString("id-ID")}</span>
    `;
    content.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "recent-target-actions";

    const applyButton = createActionButton("Apply", () => {
      elements.channelSelect.value = entry.channelId || elements.channelSelect.value;
      elements.messageActionSelect.value = entry.mode === "edit" ? "edit" : "send";
      elements.messageTargetInput.value = entry.messageId || "";
      syncMessageTargetState();
      updateSendActionState();
      scheduleAutosave();
    });
    actions.appendChild(applyButton);

    const removeButton = createActionButton("Forget", () => {
      state.recentTargets = state.recentTargets.filter((item) => item.at !== entry.at);
      saveRecentTargets();
      renderRecentTargets();
    }, "danger");
    actions.appendChild(removeButton);

    card.append(content, actions);
    elements.recentTargets.appendChild(card);
  });
}

function setAudits(entries) {
  state.audits = Array.isArray(entries) ? entries : [];
  renderAuditList();
}

function prependAuditEntry(entry) {
  state.audits = [entry, ...state.audits].slice(0, 12);
  renderAuditList();
}

function renderAuditList() {
  elements.auditList.innerHTML = "";

  if (!state.audits.length) {
    const empty = document.createElement("p");
    empty.className = "muted builder-empty";
    empty.textContent = "Belum ada audit log.";
    elements.auditList.appendChild(empty);
    return;
  }

  state.audits.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "audit-item";
    item.innerHTML = `
      <strong>${escapeHtml(entry.action || "unknown")}</strong>
      <div>${escapeHtml(entry.detail || "No detail")}</div>
      <div class="audit-meta">
        ${entry.channelId ? `<span>Channel ${escapeHtml(entry.channelId)}</span>` : ""}
        ${entry.messageId ? `<span>Message ${escapeHtml(entry.messageId)}</span>` : ""}
        <span>${escapeHtml(new Date(entry.at || Date.now()).toLocaleString("id-ID"))}</span>
      </div>
    `;
    elements.auditList.appendChild(item);
  });
}

function setPreviewMode(mode) {
  state.previewMode = ["desktop", "mobile", "compact"].includes(mode) ? mode : "desktop";
  elements.previewModeSelect.value = state.previewMode;
  elements.previewCard.className = `preview-card mode-${state.previewMode}`;
}

function buildValidationMessages(payload) {
  const messages = [];

  if (!payload.messageContent && !payload.embeds.some(hasEmbedContent)) {
    messages.push({
      tone: "warning",
      title: "Pesan kosong",
      detail: "Tambahkan content atau isi embed sebelum mengirim."
    });
  }

  if (payload.targetMode === "edit" && !payload.targetMessageId) {
    messages.push({
      tone: "warning",
      title: "Target edit belum valid",
      detail: "Mode edit butuh message link atau message ID."
    });
  }

  payload.embeds.forEach((embed, index) => {
    if (!embed.title && !embed.description && !embed.fields.length && !embed.imageUrl && !embed.thumbnailUrl && embed.timestampMode === "off") {
      messages.push({
        tone: "warning",
        title: `Embed ${index + 1} kosong`,
        detail: "Embed ini belum punya konten yang akan tampil di Discord."
      });
    }

    if (embed.fields.length >= state.limits.fields) {
      messages.push({
        tone: "warning",
        title: `Embed ${index + 1} penuh`,
        detail: `Jumlah field sudah menyentuh batas ${state.limits.fields}.`
      });
    }

    if (embed.timestampMode === "custom" && !embed.timestampValue) {
      messages.push({
        tone: "warning",
        title: `Timestamp embed ${index + 1} belum valid`,
        detail: "Isi custom timestamp dengan tanggal yang valid."
      });
    }
  });

  payload.buttons.forEach((button, index) => {
    if (!isValidHttpUrl(button.url)) {
      messages.push({
        tone: "warning",
        title: `Button ${index + 1} URL belum valid`,
        detail: "Gunakan URL http:// atau https://."
      });
    }
  });

  if (!messages.length) {
    messages.push({
      tone: "success",
      title: "Siap dikirim",
      detail: "Tidak ada warning utama pada payload saat ini."
    });
  }

  return messages;
}

function renderValidation(payload = getCurrentPayload()) {
  elements.validationList.innerHTML = "";

  buildValidationMessages(payload).forEach((message) => {
    const item = document.createElement("div");
    item.className = `diagnostic-item ${message.tone}`.trim();
    item.innerHTML = `
      <strong>${escapeHtml(message.title)}</strong>
      <div>${escapeHtml(message.detail)}</div>
    `;
    elements.validationList.appendChild(item);
  });
}

function renderRawPayload(payload = getCurrentPayload()) {
  elements.rawPayloadPreview.textContent = JSON.stringify(buildDiscordExportPayload(payload), null, 2);
}

function updateSendActionState() {
  if (elements.sendButton.dataset.busy !== "true") {
    elements.sendButton.textContent = elements.messageActionSelect.value === "edit"
      ? "Update Message"
      : "Send to Discord";
  }

  elements.messageTargetInput.disabled = elements.messageActionSelect.value !== "edit";
  elements.fetchMessageButton.disabled = elements.messageActionSelect.value !== "edit";
  elements.cloneMessageToTemplateButton.disabled = elements.messageActionSelect.value !== "edit";
}

function syncMessageTargetState(options = {}) {
  const applyChannelFromLink = Boolean(options.applyChannelFromLink);
  const action = elements.messageActionSelect.value === "edit" ? "edit" : "send";
  const target = normalizeMessageTargetInput(elements.messageTargetInput.value);

  updateSendActionState();

  if (action !== "edit") {
    setMessageTargetBadge("Mode kirim baru");
    elements.messageTargetHint.textContent = "Kosongkan target kalau hanya ingin kirim pesan baru ke channel yang dipilih.";
    return target;
  }

  if (!target.raw) {
    setMessageTargetBadge("Mode edit aktif");
    elements.messageTargetHint.textContent = "Tempel jump URL Discord atau message ID. Jika pakai link, channel akan ikut terbaca otomatis.";
    return target;
  }

  if (!target.isValid) {
    setMessageTargetBadge("Target tidak valid", "error");
    elements.messageTargetHint.textContent = "Format target belum valid. Gunakan jump URL Discord atau message ID angka.";
    return target;
  }

  if (target.channelId && applyChannelFromLink) {
    const knownChannelIds = state.channels.flatMap((entry) => entry.channels.map((channel) => channel.id));

    if (knownChannelIds.includes(target.channelId)) {
      elements.channelSelect.value = target.channelId;
    }
  }

  setMessageTargetBadge(target.source === "url" ? "Link pesan valid" : "Message ID valid", "success");
  elements.messageTargetHint.textContent = target.channelId
    ? "Target valid. Channel dari link sudah dicocokkan bila tersedia di daftar."
    : "Target valid. Pastikan channel yang dipilih sama dengan channel asal message tersebut.";
  return target;
}

async function withButtonBusy(button, busyLabel, callback) {
  if (button?.dataset.busy === "true") {
    return null;
  }

  const originalLabel = button?.textContent || "";

  if (button) {
    button.dataset.busy = "true";
    button.disabled = true;
    button.textContent = busyLabel;
  }

  try {
    return await callback();
  } finally {
    if (button) {
      delete button.dataset.busy;
      button.textContent = originalLabel;
      button.disabled = false;
      updateTemplateActionState();
      updateSendActionState();
    }
  }
}

function saveAutosave() {
  const snapshot = {
    payload: getCurrentPayload(),
    activeEmbedIndex: state.activeEmbedIndex,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
  state.lastAutosaveAt = snapshot.savedAt;
  setAutosaveBadge(`Autosave ${new Date(snapshot.savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`, "success");
}

function scheduleAutosave() {
  if (state.autosaveTimer) {
    window.clearTimeout(state.autosaveTimer);
  }

  state.autosaveTimer = window.setTimeout(() => {
    saveAutosave();
    state.autosaveTimer = null;
  }, AUTOSAVE_DELAY);
}

function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
  state.lastAutosaveAt = "";
  setAutosaveBadge("Draft kosong");
}

function restoreAutosave() {
  const raw = localStorage.getItem(AUTOSAVE_KEY);

  if (!raw) {
    setAutosaveBadge("Draft kosong");
    return false;
  }

  try {
    const snapshot = JSON.parse(raw);
    const payload = normalizeImportedPayload(snapshot.payload || {});
    applyPayloadToEditor(payload, snapshot.activeEmbedIndex || 0);
    state.lastAutosaveAt = snapshot.savedAt || "";
    setAutosaveBadge(
      snapshot.savedAt
        ? `Dipulihkan ${new Date(snapshot.savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
        : "Draft dipulihkan",
      "success"
    );
    return true;
  } catch {
    setAutosaveBadge("Draft rusak");
    return false;
  }
}

function renderChannelOptions() {
  const currentValue = elements.channelSelect.value;
  elements.channelSelect.innerHTML = "";

  if (!state.channels.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Tidak ada channel tersedia";
    elements.channelSelect.appendChild(option);
    return;
  }

  state.channels.forEach((guildEntry) => {
    const group = document.createElement("optgroup");
    group.label = guildEntry.guildName;

    guildEntry.channels.forEach((channel) => {
      const option = document.createElement("option");
      option.value = channel.id;
      option.textContent = `#${channel.name}`;
      group.appendChild(option);
    });

    elements.channelSelect.appendChild(group);
  });

  const flattened = state.channels.flatMap((entry) => entry.channels);
  elements.channelSelect.value = flattened.some((channel) => channel.id === currentValue)
    ? currentValue
    : flattened[0]?.id || "";
}

function renderTemplateOptions() {
  const currentValue = state.currentTemplateId || elements.templateSelect.value;
  const filteredTemplates = getFilteredTemplates();
  elements.templateSelect.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Draft baru";
  elements.templateSelect.appendChild(emptyOption);

  filteredTemplates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.tags?.length
      ? `${template.name} [${template.tags.join(", ")}]`
      : template.name;
    elements.templateSelect.appendChild(option);
  });

  elements.templateSelect.value = filteredTemplates.some((template) => template.id === currentValue)
    ? currentValue
    : "";
  updateTemplateActionState();
  updateTemplateMeta();
}

function createActionButton(label, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost-button mini-label-button ${extraClass}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= items.length) {
    return;
  }

  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
}

function renderEmbedTabs() {
  ensureEmbedState();
  elements.embedTabs.innerHTML = "";

  state.embeds.forEach((embed, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `embed-tab ${index === state.activeEmbedIndex ? "active" : ""} ${embed.title || embed.description ? "filled" : ""}`.trim();
    button.addEventListener("click", () => {
      state.activeEmbedIndex = index;
      syncActiveEmbedToForm();
      renderEmbedTabs();
      renderFields();
      renderPreview();
      scheduleAutosave();
    });

    const title = embed.title || embed.description || `Embed ${index + 1}`;
    const main = document.createElement("span");
    main.className = "embed-tab-title";
    main.textContent = title.slice(0, 32);
    button.appendChild(main);

    const meta = document.createElement("span");
    meta.className = "embed-tab-meta";
    meta.textContent = `#${index + 1}`;
    button.appendChild(meta);

    elements.embedTabs.appendChild(button);
  });

  updateEmbedCountBadge();
}

function syncActiveEmbedToForm() {
  const embed = getActiveEmbed();

  elements.embedTitle.value = embed.title;
  elements.embedColor.value = normalizeColor(embed.color);
  elements.embedDescription.value = embed.description;
  elements.authorName.value = embed.authorName;
  elements.authorIconUrl.value = embed.authorIconUrl;
  elements.authorUrl.value = embed.authorUrl;
  elements.thumbnailUrl.value = embed.thumbnailUrl;
  elements.imageUrl.value = embed.imageUrl;
  elements.footerText.value = embed.footerText;
  elements.footerIconUrl.value = embed.footerIconUrl;
  elements.timestampMode.value = embed.timestampMode || "off";
  elements.timestampCustomInput.value = toDatetimeLocalValue(embed.timestampValue);
  elements.timestampCustomInput.disabled = elements.timestampMode.value !== "custom";
  elements.activeEmbedLabel.textContent = `Editing Embed ${state.activeEmbedIndex + 1}`;

  elements.moveEmbedUpButton.disabled = state.activeEmbedIndex === 0;
  elements.moveEmbedDownButton.disabled = state.activeEmbedIndex >= state.embeds.length - 1;
  elements.removeEmbedButton.disabled = state.embeds.length <= 1;
  elements.duplicateEmbedButton.disabled = state.embeds.length >= state.limits.embeds;
  elements.addEmbedButton.disabled = state.embeds.length >= state.limits.embeds;
}

function createBuilderItemHeader(title, index, total, onMoveUp, onMoveDown, onRemove) {
  const header = document.createElement("div");
  header.className = "builder-item-header";

  const titleEl = document.createElement("strong");
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const actions = document.createElement("div");
  actions.className = "builder-item-actions";

  const upButton = createActionButton("Up", onMoveUp);
  upButton.disabled = index === 0;
  actions.appendChild(upButton);

  const downButton = createActionButton("Down", onMoveDown);
  downButton.disabled = index >= total - 1;
  actions.appendChild(downButton);

  const removeButton = createActionButton("Delete", onRemove, "danger");
  actions.appendChild(removeButton);

  header.appendChild(actions);
  return header;
}

function renderFields() {
  const embed = getActiveEmbed();
  elements.fieldsContainer.innerHTML = "";

  if (!embed.fields.length) {
    const empty = document.createElement("p");
    empty.className = "muted builder-empty";
    empty.textContent = "Belum ada field di embed aktif ini.";
    elements.fieldsContainer.appendChild(empty);
    return;
  }

  embed.fields.forEach((field, index) => {
    const item = document.createElement("div");
    item.className = "builder-item";

    item.appendChild(createBuilderItemHeader(
      `Field ${index + 1}`,
      index,
      embed.fields.length,
      () => {
        moveArrayItem(embed.fields, index, index - 1);
        renderFields();
        renderPreview();
        scheduleAutosave();
      },
      () => {
        moveArrayItem(embed.fields, index, index + 1);
        renderFields();
        renderPreview();
        scheduleAutosave();
      },
      () => {
        embed.fields.splice(index, 1);
        renderFields();
        renderPreview();
        scheduleAutosave();
      }
    ));

    const grid = document.createElement("div");
    grid.className = "double-grid";

    const nameWrap = document.createElement("label");
    nameWrap.className = "stack";
    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Field Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 256;
    nameInput.value = field.name || "";
    nameInput.addEventListener("input", () => {
      field.name = nameInput.value;
      renderEmbedTabs();
      schedulePreviewRender();
      scheduleAutosave();
    });
    nameWrap.append(nameLabel, nameInput);

    const inlineWrap = document.createElement("label");
    inlineWrap.className = "inline-check";
    const inlineInput = document.createElement("input");
    inlineInput.type = "checkbox";
    inlineInput.checked = Boolean(field.inline);
    inlineInput.addEventListener("change", () => {
      field.inline = inlineInput.checked;
      schedulePreviewRender();
      scheduleAutosave();
    });
    const inlineLabel = document.createElement("span");
    inlineLabel.textContent = "Inline";
    inlineWrap.append(inlineInput, inlineLabel);

    const valueWrap = document.createElement("label");
    valueWrap.className = "stack full";
    const valueLabel = document.createElement("span");
    valueLabel.textContent = "Field Value";
    const valueInput = document.createElement("textarea");
    valueInput.rows = 4;
    valueInput.value = field.value || "";
    valueInput.dataset.formatTarget = `Field ${index + 1} Value`;
    valueInput.addEventListener("input", () => {
      field.value = valueInput.value;
      schedulePreviewRender();
      scheduleAutosave();
    });
    valueWrap.append(valueLabel, valueInput);

    grid.append(nameWrap, inlineWrap, valueWrap);
    item.appendChild(grid);
    elements.fieldsContainer.appendChild(item);
  });

  bindFocusTracking(elements.fieldsContainer);
}

function renderButtons() {
  elements.buttonsContainer.innerHTML = "";

  if (!state.buttons.length) {
    const empty = document.createElement("p");
    empty.className = "muted builder-empty";
    empty.textContent = "Belum ada link button.";
    elements.buttonsContainer.appendChild(empty);
    return;
  }

  state.buttons.forEach((button, index) => {
    const item = document.createElement("div");
    item.className = "builder-item";

    item.appendChild(createBuilderItemHeader(
      `Link Button ${index + 1}`,
      index,
      state.buttons.length,
      () => {
        moveArrayItem(state.buttons, index, index - 1);
        renderButtons();
        renderPreview();
        scheduleAutosave();
      },
      () => {
        moveArrayItem(state.buttons, index, index + 1);
        renderButtons();
        renderPreview();
        scheduleAutosave();
      },
      () => {
        state.buttons.splice(index, 1);
        renderButtons();
        renderPreview();
        scheduleAutosave();
      }
    ));

    const grid = document.createElement("div");
    grid.className = "double-grid";

    const labelWrap = document.createElement("label");
    labelWrap.className = "stack";
    const labelText = document.createElement("span");
    labelText.textContent = "Button Label";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.maxLength = 80;
    labelInput.value = button.label || "";
    labelInput.addEventListener("input", () => {
      button.label = labelInput.value;
      schedulePreviewRender();
      scheduleAutosave();
    });
    labelWrap.append(labelText, labelInput);

    const urlWrap = document.createElement("label");
    urlWrap.className = "stack";
    const urlText = document.createElement("span");
    urlText.textContent = "URL";
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.placeholder = "https://...";
    urlInput.value = button.url || "";
    urlInput.addEventListener("input", () => {
      button.url = urlInput.value;
      schedulePreviewRender();
      scheduleAutosave();
    });
    urlWrap.append(urlText, urlInput);

    grid.append(labelWrap, urlWrap);
    item.appendChild(grid);
    elements.buttonsContainer.appendChild(item);
  });
}

function addEmbed() {
  if (state.embeds.length >= state.limits.embeds) {
    setStatus(`Maksimal ${state.limits.embeds} embed per pesan.`, "error");
    return;
  }

  state.embeds.push(createEmptyEmbed());
  state.activeEmbedIndex = state.embeds.length - 1;
  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderFields();
  renderPreview();
  scheduleAutosave();
}

function duplicateActiveEmbed() {
  if (state.embeds.length >= state.limits.embeds) {
    setStatus(`Maksimal ${state.limits.embeds} embed per pesan.`, "error");
    return;
  }

  const embed = getActiveEmbed();
  const clone = JSON.parse(JSON.stringify(embed));
  state.embeds.splice(state.activeEmbedIndex + 1, 0, clone);
  state.activeEmbedIndex += 1;
  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderFields();
  renderPreview();
  scheduleAutosave();
}

function moveActiveEmbed(direction) {
  const nextIndex = state.activeEmbedIndex + direction;

  if (nextIndex < 0 || nextIndex >= state.embeds.length) {
    return;
  }

  moveArrayItem(state.embeds, state.activeEmbedIndex, nextIndex);
  state.activeEmbedIndex = nextIndex;
  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderPreview();
  scheduleAutosave();
}

function removeActiveEmbed() {
  if (state.embeds.length <= 1) {
    const embed = getActiveEmbed();
    Object.assign(embed, createEmptyEmbed());
  } else {
    state.embeds.splice(state.activeEmbedIndex, 1);
    state.activeEmbedIndex = Math.max(0, state.activeEmbedIndex - 1);
  }

  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderFields();
  renderPreview();
  scheduleAutosave();
}

function addField() {
  const embed = getActiveEmbed();

  if (embed.fields.length >= state.limits.fields) {
    setStatus(`Maksimal ${state.limits.fields} field per embed.`, "error");
    return;
  }

  embed.fields.push({
    name: "",
    value: "",
    inline: false
  });

  renderFields();
  renderPreview();
  scheduleAutosave();
}

function addButton() {
  if (state.buttons.length >= state.limits.buttons) {
    setStatus(`Maksimal ${state.limits.buttons} link button per pesan.`, "error");
    return;
  }

  state.buttons.push({
    label: "",
    url: ""
  });

  renderButtons();
  renderPreview();
  scheduleAutosave();
}

function syncFormToActiveEmbed() {
  const embed = getActiveEmbed();

  embed.title = elements.embedTitle.value;
  embed.color = normalizeColor(elements.embedColor.value);
  embed.description = elements.embedDescription.value;
  embed.authorName = elements.authorName.value;
  embed.authorIconUrl = elements.authorIconUrl.value;
  embed.authorUrl = elements.authorUrl.value;
  embed.thumbnailUrl = elements.thumbnailUrl.value;
  embed.imageUrl = elements.imageUrl.value;
  embed.footerText = elements.footerText.value;
  embed.footerIconUrl = elements.footerIconUrl.value;
  embed.timestampMode = elements.timestampMode.value;
  embed.timestampValue = elements.timestampMode.value === "custom"
    ? normalizeTimestampState({
      timestampMode: "custom",
      timestampValue: elements.timestampCustomInput.value
    }).timestampValue
    : "";
  elements.timestampCustomInput.disabled = elements.timestampMode.value !== "custom";

  renderEmbedTabs();
  schedulePreviewRender();
  scheduleAutosave();
}

function applyPayloadToEditor(payload = {}, activeIndex = 0) {
  const normalized = normalizeImportedPayload(payload);

  elements.channelSelect.value = normalized.channelId || elements.channelSelect.value;
  elements.messageActionSelect.value = normalized.targetMode;
  elements.messageTargetInput.value = normalized.targetMessageId || "";
  elements.templateTagsInput.value = formatTemplateTags(normalized.tags);
  elements.messageContent.value = normalized.messageContent || "";
  state.buttons = normalized.buttons;
  state.embeds = normalized.embeds.length ? normalized.embeds : [createEmptyEmbed()];
  state.activeEmbedIndex = Math.min(Math.max(0, activeIndex), state.embeds.length - 1);

  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderFields();
  renderButtons();
  renderPreview();
  syncMessageTargetState();
}

function applyFormatWrapper(element, prefix, suffix, placeholder = "text") {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? element.value.length;
  const selected = element.value.slice(start, end) || placeholder;
  const nextValue = `${element.value.slice(0, start)}${prefix}${selected}${suffix}${element.value.slice(end)}`;

  element.value = nextValue;
  element.focus();
  element.selectionStart = start + prefix.length;
  element.selectionEnd = start + prefix.length + selected.length;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function transformSelectedLines(element, lineFormatter) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  const value = element.value;
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextNewLine = value.indexOf("\n", end);
  const blockEnd = nextNewLine === -1 ? value.length : nextNewLine;
  const selectedBlock = value.slice(blockStart, blockEnd);
  const transformed = selectedBlock
    .split("\n")
    .map((line, index) => lineFormatter(line, index))
    .join("\n");

  element.value = `${value.slice(0, blockStart)}${transformed}${value.slice(blockEnd)}`;
  element.focus();
  element.selectionStart = blockStart;
  element.selectionEnd = blockStart + transformed.length;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyToolbarAction(action) {
  const element = state.focusedElement;

  if (!element) {
    setStatus("Pilih textarea dulu sebelum pakai formatting toolbar.", "error");
    return;
  }

  if (action === "bold") {
    applyFormatWrapper(element, "**", "**", "bold text");
    return;
  }

  if (action === "italic") {
    applyFormatWrapper(element, "*", "*", "italic text");
    return;
  }

  if (action === "underline") {
    applyFormatWrapper(element, "__", "__", "underlined text");
    return;
  }

  if (action === "strike") {
    applyFormatWrapper(element, "~~", "~~", "strikethrough text");
    return;
  }

  if (action === "spoiler") {
    applyFormatWrapper(element, "||", "||", "spoiler text");
    return;
  }

  if (action === "code") {
    applyFormatWrapper(element, "`", "`", "inline code");
    return;
  }

  if (action === "codeblock") {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const selected = element.value.slice(start, end) || "code block";
    const block = "```\n" + selected + "\n```";
    element.value = `${element.value.slice(0, start)}${block}${element.value.slice(end)}`;
    element.focus();
    element.selectionStart = start + 4;
    element.selectionEnd = start + 4 + selected.length;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  if (action === "quote") {
    transformSelectedLines(element, (line) => line.startsWith("> ") ? line : `> ${line || "quoted text"}`);
    return;
  }

  if (action === "bullet") {
    transformSelectedLines(element, (line) => line.startsWith("- ") ? line : `- ${line || "list item"}`);
    return;
  }

  if (action === "number") {
    transformSelectedLines(element, (line, index) => `${index + 1}. ${line.replace(/^\d+\.\s*/, "") || "list item"}`);
    return;
  }

  if (action === "user-mention") {
    applyFormatWrapper(element, "", "", "<@123456789012345678>");
    return;
  }

  if (action === "role-mention") {
    applyFormatWrapper(element, "", "", "<@&123456789012345678>");
    return;
  }

  if (action === "channel-mention") {
    applyFormatWrapper(element, "", "", "<#123456789012345678>");
    return;
  }

  if (action === "masked-link") {
    applyFormatWrapper(element, "[", "](https://example.com)", "judul-link");
    return;
  }

  if (action === "timestamp") {
    applyFormatWrapper(element, "", "", `<t:${Math.floor(Date.now() / 1000)}:F>`);
  }
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  const maskedLinks = [];

  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const token = `@@MASKED_LINK_${maskedLinks.length}@@`;
    maskedLinks.push(`<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`);
    return token;
  });

  html = html.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>');
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([\s\S]+?)__/g, "<u>$1</u>");
  html = html.replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  maskedLinks.forEach((link, index) => {
    html = html.replace(`@@MASKED_LINK_${index}@@`, link);
  });

  return html;
}

function renderMarkdown(text) {
  const raw = String(text || "");

  if (!raw.trim()) {
    return "";
  }

  const codeBlocks = [];
  let working = raw.replace(/```([\s\S]*?)```/g, (_, code) => {
    const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return token;
  });

  const lines = working.split("\n");
  const htmlChunks = [];
  let listType = null;

  function closeList() {
    if (listType) {
      htmlChunks.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }
  }

  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (listType !== "ul") {
        closeList();
        htmlChunks.push("<ul>");
        listType = "ul";
      }

      htmlChunks.push(`<li>${renderInlineMarkdown(line.replace(/^\s*-\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        closeList();
        htmlChunks.push("<ol>");
        listType = "ol";
      }

      htmlChunks.push(`<li>${renderInlineMarkdown(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeList();

    if (/^\s*>\s?/.test(line)) {
      htmlChunks.push(`<blockquote>${renderInlineMarkdown(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }

    if (!line.trim()) {
      htmlChunks.push("<br>");
      continue;
    }

    htmlChunks.push(`<div>${renderInlineMarkdown(line)}</div>`);
  }

  closeList();

  let html = htmlChunks.join("");
  codeBlocks.forEach((block, index) => {
    html = html.replace(`@@CODEBLOCK_${index}@@`, block);
  });

  return html;
}

function hasEmbedContent(embed) {
  return Boolean(
    embed.title
    || embed.description
    || embed.authorName
    || embed.footerText
    || safeUrl(embed.thumbnailUrl)
    || safeUrl(embed.imageUrl)
    || embed.fields.length
    || embed.timestampMode === "now"
    || embed.timestampMode === "custom"
  );
}

function renderPreview() {
  const payload = getCurrentPayload();
  const messageContent = payload.messageContent
    ? `<div class="discord-content markdown">${renderMarkdown(payload.messageContent)}</div>`
    : "";

  const embedsHtml = payload.embeds
    .filter(hasEmbedContent)
    .map((embed) => {
      const authorIcon = safeUrl(embed.authorIconUrl);
      const thumbnail = safeUrl(embed.thumbnailUrl);
      const image = safeUrl(embed.imageUrl);
      const footerIcon = safeUrl(embed.footerIconUrl);

      const authorBlock = embed.authorName
        ? `
          <div class="embed-author embed-author-row">
            ${authorIcon ? `<img class="mini-icon" src="${escapeHtml(authorIcon)}" alt="">` : ""}
            ${embed.authorUrl
              ? `<a href="${escapeHtml(embed.authorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(embed.authorName)}</a>`
              : `<span>${escapeHtml(embed.authorName)}</span>`}
          </div>
        `
        : "";

      const titleBlock = embed.title
        ? `<div class="embed-title markdown">${renderMarkdown(embed.title)}</div>`
        : "";

      const descriptionBlock = embed.description
        ? `<div class="embed-description markdown">${renderMarkdown(embed.description)}</div>`
        : "";

      const fieldsBlock = embed.fields.length
        ? `
          <div class="embed-fields">
            ${embed.fields.map((field) => `
              <div class="embed-field ${field.inline ? "" : "full-width"}">
                <div class="embed-field-name markdown">${renderMarkdown(field.name)}</div>
                <div class="markdown">${renderMarkdown(field.value)}</div>
              </div>
            `).join("")}
          </div>
        `
        : "";

      const footerParts = [];

      if (embed.footerText) {
        footerParts.push(`
          <div class="embed-footer embed-footer-row">
            ${footerIcon ? `<img class="mini-icon" src="${escapeHtml(footerIcon)}" alt="">` : ""}
            <span>${escapeHtml(embed.footerText)}</span>
          </div>
        `);
      }

      if (embed.timestampMode === "custom" && embed.timestampValue) {
        footerParts.push(`<div class="embed-footer">${new Date(embed.timestampValue).toLocaleString("id-ID")}</div>`);
      } else if (embed.timestampMode === "now") {
        footerParts.push(`<div class="embed-footer">${new Date().toLocaleString("id-ID")}</div>`);
      }

      return `
        <div class="discord-embed" style="border-left-color: ${escapeHtml(normalizeColor(embed.color))}">
          ${authorBlock}
          <div class="embed-header">
            <div class="embed-main">
              ${titleBlock}
              ${descriptionBlock}
            </div>
            ${thumbnail ? `<img class="embed-thumbnail" src="${escapeHtml(thumbnail)}" alt="">` : ""}
          </div>
          ${fieldsBlock}
          ${image ? `<img class="embed-image" src="${escapeHtml(image)}" alt="">` : ""}
          ${footerParts.join("")}
        </div>
      `;
    })
    .join("");

  const buttonsHtml = payload.buttons.length
    ? `
      <div class="button-preview-row">
        ${payload.buttons.map((button) => `
          <a class="button-preview" href="${escapeHtml(button.url)}" target="_blank" rel="noreferrer">
            ${escapeHtml(button.label)}
          </a>
        `).join("")}
      </div>
    `
    : "";

  const emptyState = !messageContent && !embedsHtml
    ? '<div class="preview-empty">Mulai isi content atau embed untuk melihat preview Discord di sini.</div>'
    : "";

  elements.previewRoot.innerHTML = `
    <div class="discord-message">
      <div class="discord-avatar"></div>
      <div>
        <div class="discord-author">
          Murphy
          <span class="discord-meta">Today at ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        ${messageContent}
        ${embedsHtml}
        ${buttonsHtml}
        ${emptyState}
      </div>
    </div>
  `;

  renderValidation(payload);
  renderRawPayload(payload);
}

async function request(path, options = {}) {
  const {
    headers = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response = null;

  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timeout. Coba lagi.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: "Respons server tidak valid." };
  }

  if (response.status === 401) {
    elements.loginOverlay.classList.remove("hidden");
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data?.error || "Request gagal.");
  }

  return data;
}

async function refreshChannels(options = {}) {
  const data = await request(`/api/embed-builder/channels?refresh=${options.force ? "1" : "0"}`, {
    method: "GET",
    headers: {}
  });

  state.channels = data.channels || [];
  renderChannelOptions();
  syncMessageTargetState({
    applyChannelFromLink: true
  });
  return data.channels || [];
}

async function fetchTargetMessage(options = {}) {
  const target = syncMessageTargetState({
    applyChannelFromLink: true
  });

  if (!target.isValid) {
    throw new Error("Message link atau ID target belum valid.");
  }

  const data = await request("/api/embed-builder/fetch-message", {
    method: "POST",
    body: JSON.stringify({
      channelId: elements.channelSelect.value || target.channelId,
      targetMode: "edit",
      targetMessageId: target.messageId
    })
  });

  applyPayloadToEditor(data.result.payload, 0);
  elements.messageActionSelect.value = "edit";
  elements.messageTargetInput.value = data.result.messageId;
  state.currentTemplateId = "";
  elements.templateSelect.value = "";
  elements.templateNameInput.value = "";
  elements.templateTagsInput.value = "";
  updateTemplateActionState();
  updateTemplateMeta();
  syncMessageTargetState({
    applyChannelFromLink: true
  });

  addRecentTarget({
    mode: "edit",
    channelId: data.result.channelId,
    messageId: data.result.messageId,
    label: options.cloneToTemplate ? "Cloned message target" : "Fetched message target"
  });

  prependAuditEntry({
    at: new Date().toISOString(),
    action: options.cloneToTemplate ? "message-clone" : "message-fetch",
    channelId: data.result.channelId,
    messageId: data.result.messageId,
    detail: options.cloneToTemplate ? "Loaded into editor for template cloning" : "Loaded message into editor"
  });

  if (options.cloneToTemplate) {
    const suggestedName = `message-${data.result.messageId.slice(-6)}`;
    elements.templateNameInput.value = suggestedName;
    elements.templateTagsInput.value = "cloned, imported";
    setStatus(`Pesan dimuat dan siap disimpan sebagai template "${suggestedName}".`, "success");
  } else {
    setStatus(`Pesan ${data.result.messageId} berhasil dimuat ke editor.`, "success");
  }

  return data.result;
}

function resetDraft() {
  state.currentTemplateId = "";
  elements.templateSelect.value = "";
  elements.templateNameInput.value = "";
  elements.templateTagsInput.value = "";
  elements.messageActionSelect.value = "send";
  elements.messageTargetInput.value = "";
  state.buttons = [];
  state.embeds = [createEmptyEmbed()];
  state.activeEmbedIndex = 0;
  elements.messageContent.value = "";
  elements.jsonPayload.value = "";
  syncActiveEmbedToForm();
  renderEmbedTabs();
  renderFields();
  renderButtons();
  renderPreview();
  updateTemplateActionState();
  updateTemplateMeta();
  syncMessageTargetState();
  clearAutosave();
}

function loadTemplate(templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);

  if (!template) {
    resetDraft();
    setStatus("Draft baru dibuka.");
    return;
  }

  state.currentTemplateId = template.id;
  elements.templateNameInput.value = template.name;
  applyPayloadToEditor(template.payload, 0);
  elements.templateTagsInput.value = formatTemplateTags(template.tags);
  scheduleAutosave();
  setStatus(`Template "${template.name}" dimuat.`, "success");
}

async function bootstrap() {
  const data = await request("/api/embed-builder/bootstrap", {
    method: "GET",
    headers: {}
  });

  state.channels = data.channels || [];
  state.templates = data.templates || [];
  setAudits(data.audits || []);
  state.limits = {
    ...state.limits,
    ...data.limits
  };

  renderChannelOptions();
  renderTemplateOptions();

  if (!restoreAutosave()) {
    resetDraft();
  }

  elements.loginOverlay.classList.add("hidden");
  elements.passwordInput.value = "";
  elements.loginError.textContent = "";
}

function bindCommonInput(element, callback) {
  element.addEventListener("input", callback);
  element.addEventListener("change", callback);
}

async function initialize() {
  elements.channelSelect.addEventListener("change", () => {
    schedulePreviewRender();
    scheduleAutosave();
  });

  elements.refreshChannelsButton.addEventListener("click", async () => {
    await withButtonBusy(elements.refreshChannelsButton, "Refreshing...", async () => {
      try {
        await refreshChannels({
          force: true
        });
        prependAuditEntry({
          at: new Date().toISOString(),
          action: "channels-refresh",
          detail: "Channel list refreshed from server"
        });
        setStatus("Daftar channel berhasil direfresh.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.messageActionSelect.addEventListener("change", () => {
    syncMessageTargetState();
    scheduleAutosave();
  });

  bindCommonInput(elements.messageTargetInput, () => {
    syncMessageTargetState({
      applyChannelFromLink: true
    });
    scheduleAutosave();
  });

  bindCommonInput(elements.messageContent, () => {
    schedulePreviewRender();
    scheduleAutosave();
  });

  bindCommonInput(elements.embedTitle, syncFormToActiveEmbed);
  bindCommonInput(elements.embedColor, syncFormToActiveEmbed);
  bindCommonInput(elements.embedDescription, syncFormToActiveEmbed);
  bindCommonInput(elements.authorName, syncFormToActiveEmbed);
  bindCommonInput(elements.authorIconUrl, syncFormToActiveEmbed);
  bindCommonInput(elements.authorUrl, syncFormToActiveEmbed);
  bindCommonInput(elements.thumbnailUrl, syncFormToActiveEmbed);
  bindCommonInput(elements.imageUrl, syncFormToActiveEmbed);
  bindCommonInput(elements.footerText, syncFormToActiveEmbed);
  bindCommonInput(elements.footerIconUrl, syncFormToActiveEmbed);
  bindCommonInput(elements.timestampMode, syncFormToActiveEmbed);
  bindCommonInput(elements.timestampCustomInput, syncFormToActiveEmbed);

  elements.fetchMessageButton.addEventListener("click", async () => {
    await withButtonBusy(elements.fetchMessageButton, "Fetching...", async () => {
      try {
        await fetchTargetMessage();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.cloneMessageToTemplateButton.addEventListener("click", async () => {
    await withButtonBusy(elements.cloneMessageToTemplateButton, "Cloning...", async () => {
      try {
        await fetchTargetMessage({
          cloneToTemplate: true
        });
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.clearRecentTargetsButton.addEventListener("click", () => {
    state.recentTargets = [];
    saveRecentTargets();
    renderRecentTargets();
    setStatus("Recent targets dibersihkan.");
  });

  bindCommonInput(elements.templateSearchInput, () => {
    state.templateFilter = elements.templateSearchInput.value;
    renderTemplateOptions();
  });

  elements.previewModeSelect.addEventListener("change", () => {
    setPreviewMode(elements.previewModeSelect.value);
    schedulePreviewRender();
  });

  document.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("click", () => applyToolbarAction(button.dataset.format));
  });

  elements.addEmbedButton.addEventListener("click", addEmbed);
  elements.duplicateEmbedButton.addEventListener("click", duplicateActiveEmbed);
  elements.moveEmbedUpButton.addEventListener("click", () => moveActiveEmbed(-1));
  elements.moveEmbedDownButton.addEventListener("click", () => moveActiveEmbed(1));
  elements.removeEmbedButton.addEventListener("click", removeActiveEmbed);
  elements.addFieldButton.addEventListener("click", addField);
  elements.addButtonButton.addEventListener("click", addButton);

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    await withButtonBusy(elements.loginForm.querySelector("button[type='submit']"), "Masuk...", async () => {
      try {
        elements.loginError.textContent = "";
        await request("/api/embed-builder/login", {
          method: "POST",
          body: JSON.stringify({
            password: elements.passwordInput.value
          })
        });
        await bootstrap();
        setStatus("Embed builder siap dipakai.", "success");
      } catch (error) {
        elements.loginError.textContent = error.message || "Login gagal.";
      }
    });
  });

  elements.logoutButton.addEventListener("click", async () => {
    try {
      await request("/api/embed-builder/logout", {
        method: "POST"
      });
    } catch {}

    elements.loginOverlay.classList.remove("hidden");
    setStatus("Session ditutup.");
  });

  elements.templateSelect.addEventListener("change", () => {
    state.currentTemplateId = elements.templateSelect.value;
    updateTemplateActionState();
    updateTemplateMeta();
  });

  elements.loadTemplateButton.addEventListener("click", () => {
    loadTemplate(elements.templateSelect.value);
  });

  elements.deleteTemplateButton.addEventListener("click", async () => {
    if (!state.currentTemplateId) {
      setStatus("Pilih template dulu sebelum menghapus.", "error");
      return;
    }

    const selectedId = state.currentTemplateId;
    const selectedTemplate = state.templates.find((entry) => entry.id === selectedId);

    if (!window.confirm(`Hapus template "${selectedTemplate?.name || selectedId}"?`)) {
      return;
    }

    await withButtonBusy(elements.deleteTemplateButton, "Deleting...", async () => {
      try {
        await request(`/api/embed-builder/templates/${selectedId}`, {
          method: "DELETE",
          headers: {}
        });

        state.templates = state.templates.filter((template) => template.id !== selectedId);
        renderTemplateOptions();
        resetDraft();
        prependAuditEntry({
          at: new Date().toISOString(),
          action: "template-delete",
          templateId: selectedId,
          templateName: selectedTemplate?.name || ""
        });
        setStatus("Template dihapus.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.duplicateTemplateButton.addEventListener("click", async () => {
    if (!state.currentTemplateId) {
      setStatus("Pilih template dulu sebelum duplicate.", "error");
      return;
    }

    const selectedTemplate = state.templates.find((entry) => entry.id === state.currentTemplateId);

    await withButtonBusy(elements.duplicateTemplateButton, "Duplicating...", async () => {
      try {
        const data = await request("/api/embed-builder/templates/duplicate", {
          method: "POST",
          body: JSON.stringify({
            templateId: state.currentTemplateId,
            name: `${selectedTemplate?.name || "Template"} Copy`,
            tags: selectedTemplate?.tags || normalizeTemplateTagsInput(elements.templateTagsInput.value)
          })
        });

        state.templates.push(data.template);
        state.templates.sort((left, right) => left.name.localeCompare(right.name));
        state.currentTemplateId = data.template.id;
        renderTemplateOptions();
        elements.templateSelect.value = data.template.id;
        elements.templateNameInput.value = data.template.name;
        elements.templateTagsInput.value = formatTemplateTags(data.template.tags);
        updateTemplateActionState();
        updateTemplateMeta();
        prependAuditEntry({
          at: new Date().toISOString(),
          action: "template-duplicate",
          templateId: data.template.id,
          templateName: data.template.name
        });
        setStatus(`Template "${data.template.name}" berhasil diduplikasi.`, "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.saveTemplateButton.addEventListener("click", async () => {
    const name = elements.templateNameInput.value.trim();
    const tags = normalizeTemplateTagsInput(elements.templateTagsInput.value);
    const isUpdate = Boolean(state.currentTemplateId);

    if (!name) {
      setStatus("Isi nama template dulu sebelum menyimpan.", "error");
      return;
    }

    await withButtonBusy(elements.saveTemplateButton, "Saving...", async () => {
      try {
        const data = await request("/api/embed-builder/templates", {
          method: "POST",
          body: JSON.stringify({
            templateId: state.currentTemplateId || "",
            name,
            tags,
            payload: getCurrentPayload({
              includeTarget: false
            })
          })
        });

        const existingIndex = state.templates.findIndex((template) => template.id === data.template.id);

        if (existingIndex >= 0) {
          state.templates[existingIndex] = data.template;
        } else {
          state.templates.push(data.template);
        }

        state.templates.sort((left, right) => left.name.localeCompare(right.name));
        state.currentTemplateId = data.template.id;
        renderTemplateOptions();
        elements.templateSelect.value = data.template.id;
        elements.templateNameInput.value = data.template.name;
        elements.templateTagsInput.value = formatTemplateTags(data.template.tags);
        updateTemplateActionState();
        updateTemplateMeta();
        prependAuditEntry({
          at: new Date().toISOString(),
          action: isUpdate ? "template-update" : "template-create",
          templateId: data.template.id,
          templateName: data.template.name,
          detail: data.template.tags?.length ? `Tags: ${data.template.tags.join(", ")}` : "No tags"
        });
        setStatus(`Template "${data.template.name}" tersimpan.`, "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  elements.exportJsonButton.addEventListener("click", () => {
    elements.jsonPayload.value = JSON.stringify(getCurrentPayload(), null, 2);
    setStatus("JSON builder berhasil diexport.", "success");
  });

  elements.exportDiscordJsonButton.addEventListener("click", () => {
    elements.jsonPayload.value = JSON.stringify(buildDiscordExportPayload(), null, 2);
    setStatus("JSON Discord-style berhasil diexport.", "success");
  });

  elements.importJsonButton.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(elements.jsonPayload.value || "{}");
      applyPayloadToEditor(parsed, 0);
      scheduleAutosave();
      setStatus("JSON berhasil diimport ke editor. Format builder dan Discord-style sama-sama didukung.", "success");
    } catch (error) {
      setStatus(`Import JSON gagal: ${error.message}`, "error");
    }
  });

  elements.clearJsonButton.addEventListener("click", () => {
    elements.jsonPayload.value = "";
    setStatus("Kotak JSON dibersihkan.");
  });

  elements.sendButton.addEventListener("click", async () => {
    await withButtonBusy(elements.sendButton, "Sending...", async () => {
      try {
        const currentPayload = getCurrentPayload();
        const currentAction = currentPayload.targetMode === "edit" ? "edit" : "send";

        if (currentAction === "edit" && !currentPayload.targetMessageId) {
          setStatus("Mode edit butuh message link atau message ID yang valid.", "error");
          return;
        }

        setStatus(currentAction === "edit" ? "Mengupdate pesan di Discord..." : "Mengirim pesan ke Discord...");
        const data = await request("/api/embed-builder/send", {
          method: "POST",
          body: JSON.stringify(currentPayload)
        });

        const actionLabel = data.result.action === "edit" ? "Pesan berhasil diupdate" : "Pesan berhasil dikirim";
        addRecentTarget({
          mode: data.result.action === "edit" ? "edit" : "send",
          channelId: data.result.channelId,
          messageId: data.result.messageId,
          label: `${actionLabel} (${getChannelLabel(data.result.channelId)})`
        });
        prependAuditEntry({
          at: new Date().toISOString(),
          action: data.result.action === "edit" ? "message-edit" : "message-send",
          channelId: data.result.channelId,
          messageId: data.result.messageId
        });
        setStatus(`${actionLabel}. Message ID: ${data.result.messageId}`, "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  loadRecentTargets();
  renderRecentTargets();
  setPreviewMode(state.previewMode);
  bindFocusTracking();
  resetDraft();
  flushPreviewRender();

  try {
    await bootstrap();
  } catch {
    elements.loginOverlay.classList.remove("hidden");
    setStatus("Masuk dulu untuk membuka embed builder.");
  }
}

initialize();
