const { syncSlashCommands } = require("../loaders/slashCommandLoader");
const {
  bootstrapVoiceSessions,
  startLeaderboardScheduler
} = require("../modules/leaderboards/leaderboardSystem");
const { refreshAllMusicBoards } = require("../modules/music/musicBoardSystem");
const { startStreakTopBoardScheduler } = require("../modules/streak/streakSystem");
const { bootstrapTempVoiceRooms } = require("../modules/temp-voice/tempVoiceSystem");
const { startCustomRoleScheduler } = require("../modules/custom-roles/customRoleSystem");
const { startShopEconomyScheduler } = require("../modules/shop/shopSystem");
const { startPrivateRoomScheduler } = require("../modules/private-rooms/privateRoomSystem");
const { reconcileLevelState, startLevelProgressionScheduler } = require("../modules/levels/levelSystem");
const { initInviteTracker } = require("../modules/invites/inviteTracker");
const { startVoiceAutoRoleScheduler } = require("../modules/voice-roles/voiceAutoRoleSystem");
const { startStaffDutyScheduler } = require("../modules/staff-duty/scheduler");

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`${client.user.tag} (${client.config.botName || "Murphy"}) is online with prefix "${client.config.prefix}"`);

    const targetBotName = client.config.botName || "Murphy";
    if (client.user.username !== targetBotName) {
      try {
        await client.user.setUsername(targetBotName);
        console.log(`Bot username updated to "${targetBotName}" on Discord.`);
      } catch (err) {
        console.warn(`Could not set bot username to "${targetBotName}" via API: ${err.message}`);
      }
    }

    try {
      const result = await syncSlashCommands(client);

      if (result.commandCount > 0) {
        console.log(
          `Synced ${result.commandCount} slash command(s) to ${result.syncedGuilds}/${result.attemptedGuilds} guild(s).`
        );

        if (!result.attemptedGuilds) {
          console.warn("No guilds were available for slash command sync.");
        }

        if (result.failedGuilds.length) {
          for (const failure of result.failedGuilds) {
            console.warn(
              `Failed to sync slash commands for guild ${failure.name} (${failure.id}): ${failure.reason}`
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to sync slash commands:", error);
    }

    await bootstrapVoiceSessions(client).catch((error) => {
      console.error("Failed to bootstrap voice sessions:", error);
    });

    await bootstrapTempVoiceRooms(client).catch((error) => {
      console.error("Failed to bootstrap temp voice rooms:", error);
    });

    await reconcileLevelState(client).catch((error) => {
      console.error("Failed to reconcile level state:", error);
    });

    startStreakTopBoardScheduler(client);
    startLeaderboardScheduler(client);
    startCustomRoleScheduler(client);
    startShopEconomyScheduler(client);
    startPrivateRoomScheduler(client);
    startLevelProgressionScheduler(client);
    startVoiceAutoRoleScheduler(client);
  startStaffDutyScheduler(client);
    await refreshAllMusicBoards(client).catch((error) => {
      console.error("Failed to refresh music boards:", error);
    });
    await initInviteTracker(client).catch((error) => {
      console.error("Failed to initialize invite tracker:", error);
    });
  }
};
