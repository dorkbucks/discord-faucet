import dotenv from 'dotenv'
dotenv.config()

import { Client, Intents } from 'discord.js'
import { Networks, Server, BASE_FEE, Asset } from 'stellar-sdk'
import Datastore from 'nedb-promises'

import { accountValidator } from './lib/account_validator.js'


const {
  NODE_ENV,
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  CHANNEL_ID_REGISTER,
  CHANNEL_ID_FAUCET,
  FAUCET_ROLE,
  ADMIN_USER_ID,
  ASSET_CODE,
  ASSET_ISSUER,
  DB_NAME
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
const db = Datastore.create(`var/${DB_NAME}.db`)

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

  const user = await db.findOne({ user_id: author.id })
  if (user) {
    return msg.reply(`You are already registered. Are you looking for <#${CHANNEL_ID_FAUCET}>?`)
  }

  const address = await validateAccount(content)
  if (!address.is_valid) {
    const { id, username } = author
    const date = new Date().toISOString()
    console.log(`${date} - ${username} ${id} entered an invalid address: ${content} - ${address.reason}`)
    return msg.reply(`${address.reason}. Please try a different Stellar address`)
  }

  try {
    await db.insert({
      user_id: author.id,
      username: author.username,
      address: address.address
    })
  } catch (e) {
    const date = new Date().toISOString()
    console.error(`${date} - Error saving to the db`)

  try {
    await msg.member.roles.add(FAUCET_ROLE)
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error assigning role`)
    console.error(e)
    return msg.reply(`Something went wrong giving you access to the <#${CHANNEL_ID_FAUCET}>. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  return msg.reply(`Success! You now have access to <#${CHANNEL_ID_FAUCET}>.`)

})

bot.login(DISCORD_TOKEN)
