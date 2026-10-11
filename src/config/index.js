const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(__dirname, "..", "..", ".env")
});

const embedBuilderPassword = process.env.EMBED_BUILDER_PASSWORD || "";

const config = {
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.PREFIX || "f",
  botOwnerId: process.env.BOT_OWNER_ID || "",
  botName: process.env.BOT_NAME || "Murphy",
  welcome: {
    channelId: process.env.WELCOME_CHANNEL_ID || "",
    publicChannelId: process.env.PUBLIC_CHAT_CHANNEL_ID || "",
    accentColor: process.env.WELCOME_ACCENT_COLOR || "#111111",
    rulesChannelId: process.env.RULES_CHANNEL_ID || "",
    introChannelId: process.env.INTRO_CHANNEL_ID || ""
  },
  tickets: {
    categoryId: process.env.TICKET_CATEGORY_ID || "",
    partnershipCategoryId: process.env.PARTNERSHIP_TICKET_CATEGORY_ID || "",
    logChannelId: process.env.TICKET_LOG_CHANNEL_ID || "",
    feedbackChannelId: process.env.TICKET_FEEDBACK_CHANNEL_ID || "",
    pingRoleIdsByType: {},
    supportRoleId: process.env.TICKET_SUPPORT_ROLE_ID || "",
    panelChannelId: process.env.TICKET_PANEL_CHANNEL_ID || "",
    partnershipPanelChannelId: process.env.PARTNERSHIP_TICKET_PANEL_CHANNEL_ID || "",
    commandListChannelId: process.env.TICKET_COMMAND_LIST_CHANNEL_ID || "",
    partnershipEnabled: process.env.PARTNERSHIP_TICKET_ENABLED !== "false",
    panelAccentColor: process.env.TICKET_PANEL_ACCENT_COLOR || "#111111"
  },
  confessions: {
    channelId: process.env.CONFESSION_CHANNEL_ID || "",
    logChannelId: process.env.CONFESSION_LOG_CHANNEL_ID || "",
    panelChannelId: process.env.CONFESSION_PANEL_CHANNEL_ID || "",
    accentColor: process.env.CONFESSION_ACCENT_COLOR || "#111111"
  },
  counting: {
    channelId: process.env.COUNTING_CHANNEL_ID || "",
    startNumber: Number.parseInt(process.env.COUNTING_START_NUMBER || "1", 10)
  },
  streak: {
    channelId: process.env.STREAK_CHANNEL_ID || "",
    botChannelId: process.env.STREAK_BOT_CHANNEL_ID || process.env.STREAK_CHANNEL_ID || "",
    notificationChannelId: process.env.STREAK_NOTIFICATION_CHANNEL_ID || "",
    rewardRoleId: process.env.STREAK_REWARD_ROLE_ID || "1483797982720561292",
    topChannelId: process.env.STREAK_TOP_CHANNEL_ID || "",
    temporaryResponseSeconds: Number.parseInt(process.env.STREAK_TEMP_RESPONSE_SECONDS || "90", 10),
    timezone: process.env.STREAK_TIMEZONE || "Asia/Jakarta"
  },
  leaderboards: {
    channelId: process.env.LEADERBOARD_CHANNEL_ID || "",
    chatChannelId: process.env.CHAT_TRACKER_CHANNEL_ID || "1482505425973936180",
    temporaryResponseSeconds: Number.parseInt(process.env.LEADERBOARD_TEMP_RESPONSE_SECONDS || "90", 10)
  },
  tempVoice: {
    creatorChannelId: process.env.TEMP_VOICE_CREATOR_CHANNEL_ID || "",
    panelChannelId: process.env.TEMP_VOICE_PANEL_CHANNEL_ID || "",
    categoryId: process.env.TEMP_VOICE_CATEGORY_ID || "",
    anchorChannelId: process.env.TEMP_VOICE_ANCHOR_CHANNEL_ID || "1483842795704680549",
    temporaryResponseSeconds: Number.parseInt(process.env.TEMP_VOICE_TEMP_RESPONSE_SECONDS || "90", 10)
  },
  embedBuilder: {
    enabled: process.env.EMBED_BUILDER_ENABLED
      ? process.env.EMBED_BUILDER_ENABLED !== "false"
      : Boolean(embedBuilderPassword),
    host: process.env.EMBED_BUILDER_HOST || "0.0.0.0",
    port: Number.parseInt(process.env.EMBED_BUILDER_PORT || "3218", 10),
    password: embedBuilderPassword,
    sessionTtlHours: Number.parseInt(process.env.EMBED_BUILDER_SESSION_TTL_HOURS || "12", 10)
  },
  nameRequests: {
    panelChannelId: process.env.NAME_REQUEST_PANEL_CHANNEL_ID || "",
    reviewChannelId: process.env.NAME_REQUEST_REVIEW_CHANNEL_ID || "",
    logChannelId: process.env.NAME_REQUEST_LOG_CHANNEL_ID || "",
    protectedRoleIds: process.env.NAME_REQUEST_PROTECTED_ROLE_IDS
      ? process.env.NAME_REQUEST_PROTECTED_ROLE_IDS.split(",").map((item) => item.trim()).filter(Boolean)
      : [],
    accentColor: process.env.NAME_REQUEST_ACCENT_COLOR || "#111111"
  },
  staffRecruitment: {
    panelChannelId: process.env.STAFF_RECRUITMENT_PANEL_CHANNEL_ID || "",
    reviewChannelId: process.env.STAFF_RECRUITMENT_REVIEW_CHANNEL_ID || "",
    accentColor: process.env.STAFF_RECRUITMENT_ACCENT_COLOR || "#111111"
  }
};

function validateConfig() {
  if (!config.token) {
    throw new Error("DISCORD_TOKEN is missing. Add it to your .env file.");
  }
}

module.exports = {
  config,
  validateConfig
};
