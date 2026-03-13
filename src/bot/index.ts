import { Telegraf } from 'telegraf';
import { config } from '../config';

if (!config.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is required to initialize the bot.");
}

import { Telegraf } from 'telegraf';
import { config } from '../config';
import { handleScanCommand } from './commands/scan';
import { handleStatusCommand } from './commands/status';
import { handleCopyCommand, handleStopCommand } from './commands/copy';
import { handleSettingsCommand } from './commands/settings';
import db from '../database';

if (!config.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is required to initialize the bot.");
}

export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN || 'dummy_token');

// Basic Commands
bot.start((ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId) {
    db.run("INSERT OR IGNORE INTO users (chat_id) VALUES (?)", [chatId]);
  }

  ctx.reply('Welcome to Solana Copy Trade Bot! 🚀\n\n' +
    'Commands:\n' +
    '/scan - Scan for smart wallets\n' +
    '/copy <address> - Start copy trading a wallet\n' +
    '/stop - Stop copy trading\n' +
    '/settings - View or change your settings\n' +
    '/status - View your wallet status and PNL'
  );
});

// Map Commands
bot.command('scan', handleScanCommand);
bot.command('status', handleStatusCommand);
bot.command('copy', handleCopyCommand);
bot.command('stop', handleStopCommand);
bot.command('settings', handleSettingsCommand);
