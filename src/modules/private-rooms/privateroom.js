const { ChannelType } = require("discord.js");
const {
  closeOwnedPrivateRoom,
  createPrivateRoom,
  sendPrivateRoomPanel,
  hasPrivateRoomAdminPermission,
  inviteToPrivateRoom,
  removeFromPrivateRoom,
  setPrivateRoomCategory,
  showPrivateRoomAdminStatus,
  showPrivateRoomStatus
} = require("./privateRoomSystem");
const { resolveGuildMember } = require("../../utils/memberResolver");
const { resolveCategoryChannel } = require("../../utils/channelResolver");

function createCommandInteraction(message, args = []) {
  return {
    guildId: message.guild.id,
    guild: message.guild,
    user: message.author,
    member: message.member,
    channel: message.channel,
    options: {
      getString(name) {
        if (name === "name") {
          return args.join(" ").trim() || null;
        }

        return null;
      },
      getUser(name) {
        if (name !== "member") {
          return null;
        }

        return message.mentions.users.first() || null;
      },
      getMember(name) {
        if (name !== "member") {
          return null;
        }

        return message.mentions.members.first() || null;
      },
      getChannel(name) {
        if (name !== "category") {
          return null;
        }

        return resolveCategoryChannel(message, args[0]);
      }
    },
    async reply(payload) {
      if (typeof payload === "string") {
        return message.reply(payload);
      }

      const { ephemeral, ...safePayload } = payload || {};
      return message.reply(safePayload);
    }
  };
}

module.exports = {
  name: "privateroom",
  aliases: ["proom", "elitechannel"],
  category: "levels",
  description: "Kelola temporary private room untuk member elite.",
  usage: "privateroom <create|status|invite|remove|close|sendpanel|setcategory|adminstatus>",
  async execute(message, args) {
    const action = (args[0] || "status").toLowerCase();

    if (action === "setcategory" || action === "adminstatus" || action === "sendpanel") {
      if (!hasPrivateRoomAdminPermission(message.member)) {
        await message.reply("Kamu butuh permission Manage Server atau Manage Channels untuk mengatur private room.");
        return;
      }

      if (action === "setcategory") {
        const category = resolveCategoryChannel(message, args[1] || args[0]);

        if (!category || category.type !== ChannelType.GuildCategory) {
          await message.reply("Target harus berupa category channel.");
          return;
        }

        await setPrivateRoomCategory(createCommandInteraction(message, [args[1] || args[0]]));
        return;
      }

      if (action === "sendpanel") {
        const targetChannel = message.mentions.channels.first() || message.channel;
        await sendPrivateRoomPanel(createCommandInteraction(message), targetChannel);
        return;
      }

      await showPrivateRoomAdminStatus(createCommandInteraction(message));
      return;
    }

    if (action === "create") {
      await createPrivateRoom(createCommandInteraction(message, args.slice(1)));
      return;
    }

    if (action === "status") {
      await showPrivateRoomStatus(createCommandInteraction(message));
      return;
    }

    if (action === "invite") {
      const targetMember = await resolveGuildMember(message.guild, args[1] || args[0]);

      if (!targetMember || targetMember.user.bot) {
        await message.reply("Member target tidak valid atau merupakan bot.");
        return;
      }

      const interaction = createCommandInteraction(message);
      interaction.options.getUser = () => targetMember.user;
      interaction.options.getMember = () => targetMember;
      await inviteToPrivateRoom(interaction);
      return;
    }

    if (action === "remove") {
      const targetMember = await resolveGuildMember(message.guild, args[1] || args[0]);

      if (!targetMember || targetMember.user.bot) {
        await message.reply("Member target tidak valid atau merupakan bot.");
        return;
      }

      const interaction = createCommandInteraction(message);
      interaction.options.getUser = () => targetMember.user;
      interaction.options.getMember = () => targetMember;
      await removeFromPrivateRoom(interaction);
      return;
    }

    if (action === "close") {
      await closeOwnedPrivateRoom(createCommandInteraction(message));
      return;
    }

    await message.reply("Gunakan `f privateroom create`, `status`, `invite @user`, `remove @user`, `close`, `sendpanel [#channel]`, `setcategory #category`, atau `adminstatus`.");
  }
};
