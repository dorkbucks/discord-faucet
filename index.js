import dotenv from 'dotenv'
dotenv.config()

import { Client, Intents } from 'discord.js'
import { Asset } from 'stellar-sdk'

const {
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  CHANNEL_ID_REGISTER,
} = process.env

const bot = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
})

bot.once('ready', () => console.log(`Faucet bot logged in as ${DISCORD_CLIENT_ID}`))

bot.on('messageCreate', async (msg) => {
  const { channelId, content, author } = msg
  if (channelId !== CHANNEL_ID_REGISTER || author.id === DISCORD_CLIENT_ID) {
    return
  }
  msg.reply('pong')
})

bot.login(DISCORD_TOKEN)
