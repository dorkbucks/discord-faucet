import dotenv from 'dotenv'
dotenv.config()

import { Client, Intents } from 'discord.js'
import { Networks, Server, BASE_FEE, Asset, Keypair } from 'stellar-sdk'
import Datastore from 'nedb-promises'
import { add, compareAsc, formatDistance } from 'date-fns'

import { validateAccount } from './lib/validate_account.js'
import { sendPayment } from './lib/send_payment.js'
import { shortenAccountID } from './lib/shorten_account_id.js'
import { random } from './lib/random.js'


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
  AMOUNT_MIN,
  AMOUNT_MAX,
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
const validate = validateAccount.bind(null, server, asset)
const usersDB = Datastore.create(`var/users.db`)
const claimsDB = Datastore.create(`var/claims.db`)

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

  let reply = msg.reply(`<a:loading:914121630060515338> Welcome ${author.username}! Checking your account.`)

  const user = await usersDB.findOne({ user_id: author.id })
  if (user) {
    return (await reply).edit(`:x: You are already registered. Are you looking for <#${CHANNEL_ID_FAUCET}>?`)
  }

  const address = await validate(content)
  if (!address.is_valid) {
    const { id, username } = author
    const date = new Date().toISOString()
    console.log(`${date} - ${username} ${id} entered an invalid address: ${content} - ${address.reason}`)
    return (await reply).edit(`:x: ${address.reason}. Please try a different Stellar address.`)
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
    return (await reply).edit(`:x: Something went wrong. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  try {
    await msg.member.roles.add(FAUCET_ROLE)
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error assigning role`)
    console.error(e)
    return (await reply).edit(`:x: Something went wrong giving you access to the <#${CHANNEL_ID_FAUCET}>. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  const faucetChannel = bot.channels.cache.get(CHANNEL_ID_FAUCET)
  faucetChannel.send(`:white_check_mark: <@${author.id}> Welcome to the ${asset.code} faucet. You may claim every 24 hours by typing "${FAUCET_CMD}".`)
  return (await reply).edit(`:white_check_mark: Success! You now have access to <#${CHANNEL_ID_FAUCET}>.`)
}

async function claim (msg) {
  const { author, content } = msg
  const cmd = content.toLowerCase().trim()

  if (cmd !== FAUCET_CMD) return

  let reply = msg.reply(`<a:loading:914121630060515338> Welcome back ${author.username}! Checking if you can claim.`)

  const lastClaim = await claimsDB.findOne({ user_id: author.id }).sort({ date: -1 })
  const now = new Date()
  // DB returns null (falsey) if no record is found. This is probably the user's
  // first time claiming so allow it.
  const canClaim = lastClaim ? compareAsc(now, lastClaim.next_claim) > -1 : true

  if (!canClaim) {
    const nextClaim = formatDistance(lastClaim.next_claim, now, { addSuffix: true })
    return (await reply).edit(`:x: Try again ${nextClaim}`)
  }

  const { address } = await usersDB.findOne({ user_id: author.id })

  const validation = await validate(content)
  if (!validation.is_valid) {
    const date = new Date().toISOString()
    console.warn(`${date} - ${author.username}'s' Stellar address is now invalid - ${validation.reason}`)
    return (await reply).edit(`:x: Your address is now invalid: ${validation.reason}. <@${ADMIN_USER_ID}>, halp!`)
  }

  const to = Keypair.fromPublicKey(address)
  const amount = random(AMOUNT_MIN, AMOUNT_MAX)
  const shortAddress = shortenAccountID(address)
  reply = await reply
  reply.edit(`<a:loading:914121630060515338> Sending ${amount} ${asset.code} to ${shortAddress}.`)
  const faucetClaim = await send(to, amount)

  if (!faucetClaim.success) {
    console.error(`${now.toISOString()} - Error sending payment. ${faucetClaim.message}`)
    console.error(faucetClaim.errorData)
    return reply.edit(`:x: Something went wrong. You should be able to try again immediately.`)
  }

  reply.edit(`:white_check_mark: Sent ${amount} ${asset.code} to ${shortAddress}! You may claim again in 24 hours.`)

  try {
    await claimsDB.insert({
      user_id: author.id,
      claimed_on: now,
      next_claim: add(now, { hours: 24 })
    })
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error saving to the claims db`)
    console.error(e)
  }
}

bot.once('ready', () => console.log(`Faucet bot logged in as ${DISCORD_CLIENT_ID}`))
bot.on('messageCreate', async (msg) => {
  const { channelId, content, author } = msg
  if (author.id === DISCORD_CLIENT_ID) return
  if (channelId === CHANNEL_ID_REGISTER) return register(msg)
  if (channelId === CHANNEL_ID_FAUCET) return claim(msg)
})
bot.login(DISCORD_TOKEN)
