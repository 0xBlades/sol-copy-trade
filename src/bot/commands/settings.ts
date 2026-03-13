import { Context } from 'telegraf';
import db from '../../database';

export const handleSettingsCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = (ctx.message as any)?.text || '';
  const args = text.split(' ').slice(1);

  if (args.length === 0) {
    return ctx.reply("⚙️ **Settings Help**\n\nUse this command to configure your copy trading:\n\n" +
      "`/settings margin 0.1` - Set entry size to 0.1 SOL\n" +
      "`/settings tp 100` - Set Auto Take Profit at +100%\n" +
      "`/settings sl 50` - Set Auto Stop Loss at -50%", { parse_mode: 'Markdown' });
  }

  const key = args[0].toLowerCase();
  const value = parseFloat(args[1]);

  if (isNaN(value)) {
    return ctx.reply("❌ Invalid value provided.");
  }

  let dbField = "";
  let successMsg = "";

  if (key === 'margin') {
    dbField = 'margin_per_entry';
    successMsg = `Margin per entry updated to ${value} SOL.`;
  } else if (key === 'tp') {
    dbField = 'auto_tp_percent';
    successMsg = `Auto TP updated to +${value}%.`;
  } else if (key === 'sl') {
    dbField = 'auto_sl_percent';
    successMsg = `Auto SL updated to -${value}%.`;
  } else {
    return ctx.reply("❌ Unknown setting key. Valid keys: margin, tp, sl.");
  }

  db.run(`
    INSERT INTO users (chat_id, ${dbField}) 
    VALUES (?, ?) 
    ON CONFLICT(chat_id) 
    DO UPDATE SET ${dbField} = excluded.${dbField}
  `, [chatId, value], (err) => {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Failed to update settings.");
    }
    ctx.reply(`✅ ${successMsg}`);
  });
};
