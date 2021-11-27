import dotenv from 'dotenv'
dotenv.config()

import { Client, Intents } from 'discord.js'
import { Networks, Server, BASE_FEE, Asset, Keypair } from 'stellar-sdk'
import Datastore from 'nedb-promises'

import { accountValidator } from './lib/account_validator.js'
import { sendPayment } from './lib/send_payment.js'


const {
  NODE_ENV,
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  CHANNEL_ID_REGISTER,
  CHANNEL_ID_FAUCET,
  FAUCET_ROLE,
  FAUCET_CMD,
  ADMIN_USER_ID,
  ASSET_CODE,
  ASSET_ISSUER,
  FAUCET_ACCOUNT_SECRETKEY
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

const faucetAccount = Keypair.fromSecret(FAUCET_ACCOUNT_SECRETKEY)
const send = sendPayment.bind(null, server, networkPassphrase, asset, faucetAccount)
const validateAccount = accountValidator(server, asset)
const usersDB = Datastore.create(`var/users.db`)

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

async function register (msg) {
  const { author, content } = msg
  const user = await usersDB.findOne({ user_id: author.id })
  if (user) {
    return msg.reply(`You are already registered. Are you looking for <#${CHANNEL_ID_FAUCET}>?`)
  }

  const address = await validateAccount(content)
  if (!address.is_valid) {
    const { id, username } = author
    const date = new Date().toISOString()
    console.log(`${date} - ${username} ${id} entered an invalid address: ${content} - ${address.reason}`)
    return msg.reply(`${address.reason}. Please try a different Stellar address.`)
  }

  try {
    await usersDB.insert({
      user_id: author.id,
      username: author.username,
      address: address.address
    })
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error saving to the db`)
    console.error(e)
    return msg.reply(`Something went wrong. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  try {
    await msg.member.roles.add(FAUCET_ROLE)
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error assigning role`)
    console.error(e)
    return msg.reply(`Something went wrong giving you access to the <#${CHANNEL_ID_FAUCET}>. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  const faucetChannel = bot.channels.cache.get(CHANNEL_ID_FAUCET)
  faucetChannel.send(`<@${author.id}> Welcome to the ${asset.code} faucet. You may claim every 24 hours by typing "${FAUCET_CMD}".`)
  return msg.reply(`Success! You now have access to <#${CHANNEL_ID_FAUCET}>.`)
}

async function claim (msg) {
  const { author, content } = msg
  const cmd = content.toLowerCase().trim()

  if (cmd !== FAUCET_CMD) return

  const { address } = await usersDB.findOne({ user_id: author.id })
  const to = Keypair.fromPublicKey(address)
  const amount = 1000
  const faucetClaim = await send(to, amount)

  msg.reply(`${amount} ${asset.code} sent! You may claim again in 24 hours.`)
}

bot.once('ready', () => console.log(`Faucet bot logged in as ${DISCORD_CLIENT_ID}`))
bot.on('messageCreate', async (msg) => {
  const { channelId, content, author } = msg
  if (author.id === DISCORD_CLIENT_ID) return
  if (channelId === CHANNEL_ID_REGISTER) return register(msg)
  if (channelId === CHANNEL_ID_FAUCET) return claim(msg)
})
bot.login(DISCORD_TOKEN)
