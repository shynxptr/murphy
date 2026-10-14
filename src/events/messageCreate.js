const { parsePrefixedCommand } = require("../utils/commandContext");
const {
  buildAdminAccessState,
  isProtectedPrefixedCommand,
  withScopedAdminAccess
} = require("../utils/adminAccess");
const { buildBotPermissionAccessState } = require("../utils/botPermissions");
const { handleAutomodMessage } = require("../modules/automod/automodSystem");
const { handleCountingMessage } = require("../modules/counting/countingSystem");
const {
  handleBlockedGeneralChannelCommand,
  trackChatMessage
} = require("../modules/leaderboards/leaderboardSystem");
const { handleStreakMessage } = require("../modules/streak/streakSystem");
const { handleStickyMessage } = require("../modules/sticky/stickySystem");
const { handleCustomRoleTicketMessage } = require("../modules/custom-roles/customRoleSystem");
const {
  clearAfkFromMessage,
  isAfkCommandContext,
  notifyMentionedAfkUsers,
  parseQuestionAfkCommand
} = require("../modules/afk/afkSystem");
const { awardTrackedChatCoins } = require("../modules/shop/shopSystem");
const { touchPrivateRoomActivity } = require("../modules/private-rooms/privateRoomSystem");
const { awardTrackedChatXp } = require("../modules/levels/levelSystem");
const { handleAutoThreadMessage } = require("../modules/autothread/autoThreadSystem");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (!message.guild) {
      return;
    }

    if (message.author.bot) {
      await handleStickyMessage(message, client);
      return;
    }

    // Track chat message untuk SEMUA pesan non-bot (bukan hanya satu channel).
    // Dilakukan di awal supaya tidak ter-bypass oleh early-return handler lain.
    const trackedChat = await trackChatMessage(message, client);
    if (trackedChat) {
      await awardTrackedChatCoins(message, client);
      await awardTrackedChatXp(message, client);
    }

    const questionAfkContext = parseQuestionAfkCommand(message.content);

    if (questionAfkContext) {
      const afkCommand = client.commandIndex.get("afk");

      if (afkCommand) {
        try {
          await afkCommand.execute(message, questionAfkContext.args, client);
        } catch (error) {
          console.error('Failed to execute AFK shortcut command "?afk":', error);
          await message.reply("Terjadi error saat mengaktifkan status AFK.");
        }
      }

      await handleStickyMessage(message, client);
      return;
    }

    const customRoleMessageHandled = await handleCustomRoleTicketMessage(message, client);

    if (customRoleMessageHandled) {
      return;
    }

    const automodHandled = await handleAutomodMessage(message);

    if (automodHandled) {
      return;
    }

    const context = parsePrefixedCommand(message.content, client.config.prefix);

    const blockedCommand = await handleBlockedGeneralChannelCommand(message, client, context);

    if (blockedCommand) {
      return;
    }

    const streakHandled = await handleStreakMessage(message, client, {
      hasPrefixedCommand: Boolean(context)
    });

    if (streakHandled) {
      return;
    }

    if (!isAfkCommandContext(context)) {
      await clearAfkFromMessage(message);
    }

    if (!context) {
      await notifyMentionedAfkUsers(message);
      await touchPrivateRoomActivity(message, client);
      await handleAutoThreadMessage(message, client);
      await handleCountingMessage(message, client);
      await handleStickyMessage(message, client);
      return;
    }

    const command = client.commandIndex.get(context.commandName);

    if (!command) {
      await handleStickyMessage(message, client);
      return;
    }

    try {
      if (command.botOwnerOnly) {
        const access = await buildAdminAccessState(message.member, client);

        if (!access.botOwner) {
          await message.reply("Command ini hanya bisa dipakai oleh bot owner.");
          return;
        }
      } else if (command.requiredAccess) {
        const access = await buildBotPermissionAccessState(message.member, command.requiredAccess, client);

        if (!access.hasAccess) {
          await message.reply(`Kamu tidak punya akses bot \`${access.accessName}\` untuk memakai command ini.`);
          return;
        }
      } else if (isProtectedPrefixedCommand(command)) {
        const access = await buildAdminAccessState(message.member, client);

        if (!access.hasAccess) {
          await message.reply("Command admin ini hanya bisa dipakai oleh admin yang sudah diset bot owner.");
          return;
        }
      }

      await withScopedAdminAccess(message.member, client, async () => {
        await command.execute(message, context.args, client);
      });
    } catch (error) {
      console.error(`Failed to execute command "${context.commandName}":`, error);
      await message.reply("Terjadi error saat menjalankan command.");
    }

    await handleStickyMessage(message, client);
  }
};
