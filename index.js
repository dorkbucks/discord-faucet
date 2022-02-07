const dotenv = require('dotenv')
dotenv.config()

const { Client, Intents } = require('discord.js')

const { Networks, Server, BASE_FEE, Asset, Keypair } = require('stellar-sdk')
const Datastore = require('nedb-promises')
const { add, compareAsc, formatDistance } = require('date-fns')

const { validateAccount } = require('./lib/validate_account.js')
const { sendPayment } = require('./lib/send_payment.js')
const { shortenAccountID } = require('./lib/shorten_account_id.js')
const { random } = require('./lib/random.js')


const {
  NODE_ENV,
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  CHANNEL_ID_REGISTER,
  CHANNEL_ID_FAUCET,
  FAUCET_ROLE_ID,
  FAUCET_CMD,
  ADMIN_USER_ID,
  ASSET_CODE,
  ASSET_ISSUER,
  AMOUNT_MIN,
  AMOUNT_MAX,
  MAX_TXN_FEE,
  FAUCET_ACCOUNT_SECRETKEY
} = process.env

const asset = new Asset(ASSET_CODE, ASSET_ISSUER)
const testnet = NODE_ENV === 'development'
const NETWORK = testnet ? 'TESTNET' : 'PUBLIC'
const HORIZON_URL = `https://horizon${testnet ? '-testnet' : ''}.stellar.org`
const stellarConfig = {
  server: new Server(HORIZON_URL),
  txnOpts: {
    fee: MAX_TXN_FEE,
    networkPassphrase: Networks[NETWORK]
  }
}

const faucetAccount = Keypair.fromSecret(FAUCET_ACCOUNT_SECRETKEY)
const send = sendPayment.bind(null, stellarConfig, asset, faucetAccount)
const validate = validateAccount.bind(null, stellarConfig.server, asset)
const usersDB = Datastore.create(`var/users.db`)

const pendingClaims = new Map()

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

  if (user?.address === content) {
    return (await reply).edit(`:x: That address is already registered to another user.`)
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
      address: address.address,
      next_claim: null
    })
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error saving to the db`)
    console.error(e)
    return (await reply).edit(`:x: Something went wrong. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  try {
    await msg.member.roles.add(FAUCET_ROLE_ID)
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error assigning role`)
    console.error(e)
    return (await reply).edit(`:x: Something went wrong giving you access to the <#${CHANNEL_ID_FAUCET}>. WTF <@${ADMIN_USER_ID}>? Fix it you dork!`)
  }

  const faucetChannel = bot.channels.cache.get(CHANNEL_ID_FAUCET)
  faucetChannel.send(`:white_check_mark: <@${author.id}> Welcome to the ${asset.code} faucet. You may claim every 24 hours by typing **${FAUCET_CMD}**.`)
  return (await reply).edit(`:white_check_mark: Success! You now have access to <#${CHANNEL_ID_FAUCET}>.`)
}

async function claim (msg) {
  const { author, content } = msg
  const cmd = content.toLowerCase().trim()

  if (cmd !== FAUCET_CMD) return

  let reply = msg.reply(`<a:loading:914121630060515338> Welcome back ${author.username}! Checking if you can claim.`)

  const user = await usersDB.findOne({ user_id: author.id })

  if (!user) {
    const date = new Date().toISOString()
    console.warn(`${date} - ${author.username} is not in the DB but has access to the faucet.`)
    return (await reply).edit(`:x: I couldn't find you in the database. <@${ADMIN_USER_ID}>, halp!`)
  }

  const nextClaim = user.next_claim
  const now = new Date()
  // `next_claim` is set to null upon registration. This is the user's first time
  // claiming so allow it, check dates otherwise.
  const canClaim = nextClaim ? compareAsc(now, nextClaim) > -1 : true

  if (!canClaim) {
    const _now = add(now, { hours: 23, minutes: 53 })
    const when = formatDistance(nextClaim, now, { addSuffix: true })
    return (await reply).edit(`:x: Try again ${when}`)
  }

  const { address } = user
  const validation = await validate(address)
  if (!validation.is_valid) {
    const date = new Date().toISOString()
    console.warn(`${date} - ${author.username}'s' Stellar address is now invalid - ${validation.reason}`)
    return (await reply).edit(`:x: Your address is now invalid: ${validation.reason}. <@${ADMIN_USER_ID}>, halp!`)
  }

  const to = Keypair.fromPublicKey(address)
  const amount = random(parseInt(AMOUNT_MIN), parseInt(AMOUNT_MAX))
  const shortAddress = shortenAccountID(address)
  reply = await reply
  reply.edit(`<a:loading:914121630060515338> Sending ${amount} ${asset.code} to ${shortAddress}.`)
  const faucetClaim = await send(to, amount)

  if (!faucetClaim.success) {
    console.error(`${now.toISOString()} - Error sending payment. ${faucetClaim.reason}`)
    console.error(faucetClaim.errorData)
    return reply.edit(`:x: Something went wrong. You should be able to try again immediately.`)
  }

  reply.edit(`:white_check_mark: Sent ${amount} ${asset.code} to ${shortAddress}! You may claim again in 24 hours.`)

  try {
    return await usersDB.update({ user_id: author.id }, {
      $set: { next_claim: add(now, { hours: 24 }) }
    })
  } catch (e) {
    console.error(`${new Date().toISOString()} - Error updating db`)
    console.error(e)
  }
}

bot.once('ready', () => console.log(`Faucet bot logged in as ${DISCORD_CLIENT_ID}`))
bot.on('messageCreate', async (msg) => {
  const { channelId, author } = msg
  if (author.id === DISCORD_CLIENT_ID) return
  if (channelId === CHANNEL_ID_REGISTER) return register(msg)
  if (channelId === CHANNEL_ID_FAUCET) {
    if (pendingClaims.get(author.id)) return
    pendingClaims.set(author.id, true)
    await claim(msg)
    pendingClaims.delete(author.id)
  }
})
bot.login(DISCORD_TOKEN)
