import dotenv from 'dotenv'
dotenv.config()

import { Client, Intents } from 'discord.js'
import { Networks, Server, BASE_FEE, Asset } from 'stellar-sdk'

import { accountValidator } from './lib/account_validator.js'


const {
  NODE_ENV,
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  CHANNEL_ID_REGISTER,
  ASSET_CODE,
  ASSET_ISSUER
} = process.env

const asset = new Asset(ASSET_CODE, ASSET_ISSUER)
const testnet = NODE_ENV === 'development'
const NETWORK = testnet ? 'TESTNET' : 'PUBLIC'
const networkPassphrase = Networks[NETWORK]
const HORIZON_URL = `https://horizon${testnet ? '-testnet' : ''}.stellar.org`
const TX_URL = `https://stellar.expert/explorer/${testnet ? 'testnet' : 'public'}/tx`
const server = new Server(HORIZON_URL)
const txnOpts = {
  fee: BASE_FEE,
  networkPassphrase,
}
const validateAccount = accountValidator(server, asset)
const bot = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
  presence: {
    activities: [{
      name: 'you 👀',
      type: 'WATCHING'
    }]
  }
})

bot.once('ready', () => console.log(`Faucet bot logged in as ${DISCORD_CLIENT_ID}`))

bot.on('messageCreate', async (msg) => {
  const { channelId, content, author } = msg
  if (channelId !== CHANNEL_ID_REGISTER || author.id === DISCORD_CLIENT_ID) {
    return
  }

  const address = await validateAccount(content)

  if (!address.is_valid) {
    const { id, username } = author
    const date = new Date().toISOString()
    console.log(`${date} - ${username} ${id} entered an invalid address: ${content} - ${address.reason}`)
    return msg.reply(`${address.reason}. Please try a different Stellar address`)
  }
})

bot.login(DISCORD_TOKEN)
