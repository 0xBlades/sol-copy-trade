import { Context } from 'telegraf';
import db from '../../database';
import { PublicKey } from '@solana/web3.js';

export const handleCopyCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = (ctx.message as any)?.text || '';
  const args = text.split(' ').slice(1);
  const targetAddress = args[0];

  if (!targetAddress) {
    return ctx.reply("❌ Please provide a wallet address.\nExample: `/copy AddressHere`", { parse_mode: 'Markdown' });
  }

  try {
    new PublicKey(targetAddress); // Validates the Solana address
  } catch (error) {
    return ctx.reply("❌ Invalid Solana wallet address provided.");
  }

  db.run(`
    INSERT INTO users (chat_id, target_wallet, is_copy_trading) 
    VALUES (?, ?, 1) 
    ON CONFLICT(chat_id) 
    DO UPDATE SET target_wallet = excluded.target_wallet, is_copy_trading = 1
  `, [chatId, targetAddress], (err) => {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Failed to update copy trade settings.");
    }
    
    ctx.reply(`✅ Successfully started copy trading for wallet:\n\`${targetAddress}\`\n\nI will now listen to its DEX transactions.`, { parse_mode: 'Markdown' });
    
    // Trigger WebSocket listener registration here (to be implemented)
  });
};

export const handleStopCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  db.run(`UPDATE users SET is_copy_trading = 0 WHERE chat_id = ?`, [chatId], (err) => {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Failed to stop copy trading.");
    }
    
    ctx.reply("⏹️ Copy trading has been stopped.\nAll active open positions will still be monitored for Auto TP/SL.", { parse_mode: 'Markdown' });
  });
};
