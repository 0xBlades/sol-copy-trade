import { Telegraf } from 'telegraf';
import { config } from '../config';
import { handleScanCommand } from './commands/scan';
import { handleStatusCommand } from './commands/status';
import { handleCopyCommand, handleStopCommand } from './commands/copy';
import { handleSettingsCommand } from './commands/settings';
import { handleTpCommand, handleSlCommand, handleCloseAllCommand } from './commands/manual';
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

  ctx.reply(
    '🚀 *Welcome to Solana Copy Trade Bot!*\n\n' +
    '📋 *Commands:*\n' +
    '/scan - Scan smart wallets\n' +
    '/copy `<address>` - Start copy trading\n' +
    '/stop - Stop copy trading\n' +
    '/settings - Configure TP/SL/Margin\n' +
    '/status - Wallet status & PNL\n\n' +
    '📊 *Manual TP/SL:*\n' +
    '/tp - Manual Take Profit\n' +
    '/sl - Manual Stop Loss\n' +
    '/closeall - Close semua posisi',
    { parse_mode: 'Markdown' }
  );
});

// Map Commands
bot.command('scan', handleScanCommand);
bot.command('status', handleStatusCommand);
bot.command('copy', handleCopyCommand);
bot.command('stop', handleStopCommand);
bot.command('settings', handleSettingsCommand);
bot.command('tp', handleTpCommand);
bot.command('sl', handleSlCommand);
bot.command('closeall', handleCloseAllCommand);
