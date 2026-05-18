# WolfMod Telegram & Discord Bot

## Project Overview
Node.js bot project running both a Telegram bot and a Discord bot for WolfMod Dragon City.

- **Telegram bot**: `index.js` — uses polling mode, token via `TELEGRAM_BOT_TOKEN`
- **Discord bot**: `discord-bot.js` — slash commands, token via `DISCORD_TOKEN`
- **Entry point**: `start.js` — spawns both bots, auto-restarts on crash
- **Deployed on**: Railway (24/7, independent of Replit)

## User Preferences
- After every code fix, automatically push to GitHub using `GITHUB_PERSONAL_ACCESS_TOKEN` without waiting for user to ask.
  Command: `git push https://$GITHUB_PERSONAL_ACCESS_TOKEN@github.com/ledonghahbhs1-dot/wolfmod-bot.git main`
