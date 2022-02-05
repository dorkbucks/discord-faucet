# Requirements

## node v17.x.x
This is only tested on node v17.x.x.

## Your own Discord bot
See instructions below.


# Installation
## Clone this repository
`git clone`

## Install dependencies
`npm install`

## Start the bot
`npm start`

_NOTE: Read the set up instructions below before starting the bot._


# Set Up & Configuration


## Create the bot & set up your server

[Create your faucet bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) with the _Manage Roles_, _Read Messages_, and _Send Messages_ permissions and invite it to your server.

On your server, you need to create the following:

- **Faucet role**
This role is for limiting access to the faucet channel to registered members.

- **Registration channel**
This is where your members will enter their Stellar addresses to register for the faucet. Addresses will be validated to ensure they can receive your token. If the address passes validation, the member will be given the `FAUCET_ROLE` you define.

- **Faucet channel**
When creating this channel, make sure to only give access to members with the `FAUCET_ROLE`. Any text entered here that isn't the `FAUCET_CMD` (case-insensitive) will be ignore by the bot.

You can name the role and channels whatever you want.

## Create the faucet Stellar account
**DO NOT USE YOUR DISTRIBUTOR ACCOUNT.** I suggest creating a dedicated account just for the faucet and top it up as needed. The way this bot is currently set up requires a secret key as an environment variable. If that secret key leaks, better to limit the damage to just the faucet account.

## Configure the bot with environment variables
You can use a .env file if that's easier (see the [`.env.sample`](.env.sample) file) but be careful with this file as it contains your faucet account's secret key.

- `ASSET_CODE`

The token's asset code

- `ASSET_ISSUER`

The issuer account's public key

- `FAUCET_ACCOUNT_SECRETKEY`

The faucet account's secret key

- `MAX_TXN_FEE`

The [maximum fee (in stroops)](https://developers.stellar.org/docs/glossary/fees/) you're willing to spend per transaction

- `AMOUNT_MIN`

The minimum amount per claim

- `AMOUNT_MAX`

The maximum amount per claim

- `FAUCET_CMD`

The case-insensitive command to trigger a faucet claim

- `FAUCET_ROLE_ID`

The ID of the faucet role

- `CHANNEL_ID_REGISTER`

The ID of the registration channel

- `CHANNEL_ID_FAUCET`

The ID of the faucet channel

- `DISCORD_GUILD_ID`

The ID of the server

- `ADMIN_USER_ID`

The ID of the admin/user that will get pinged for any errors

- `DISCORD_CLIENT_ID`

The bot's `APPLICATION ID`

- `DISCORD_TOKEN`

The bot's token
