const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { config } = require("../config");

function createBotClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  client.commands = new Collection();
  client.commandIndex = new Collection();
  client.slashCommands = new Collection();
  client.config = config;

  return client;
}

module.exports = {
  createBotClient
};
