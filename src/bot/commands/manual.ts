import { Context } from 'telegraf';
import db from '../../database';

export const handleTpCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = (ctx.message as any)?.text || '';
  const args = text.split(' ').slice(1);
  const tradeId = args[0];

  if (!tradeId) {
    // Show all open trades to pick from
    db.all(`SELECT * FROM trades WHERE chat_id = ? AND status = 'OPEN'`, [chatId], (err, trades: any[]) => {
      if (err || !trades || trades.length === 0) {
        return ctx.reply("📭 Tidak ada posisi OPEN saat ini.");
      }

      let msg = "📋 **Posisi OPEN saat ini:**\n\n";
      trades.forEach((t) => {
        msg += `🔹 ID: \`${t.id}\`\n`;
        msg += `   Token: \`${t.token_address}\`\n`;
        msg += `   Entry: ${t.entry_amount_sol} SOL\n\n`;
      });
      msg += "Untuk manual Take Profit, ketik:\n`/tp <ID>`\n\nContoh: `/tp 1`";
      ctx.replyWithMarkdown(msg);
    });
    return;
  }

  // Close the specific trade as manual TP
  db.run(`UPDATE trades SET status = 'CLOSED_MANUAL_TP' WHERE id = ? AND chat_id = ? AND status = 'OPEN'`, [tradeId, chatId], function (err) {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Gagal menutup posisi.");
    }
    if (this.changes === 0) {
      return ctx.reply("❌ Trade ID tidak ditemukan atau sudah tertutup.");
    }
    ctx.reply(`🟢 **Manual Take Profit** berhasil!\nTrade ID \`${tradeId}\` telah ditutup.`, { parse_mode: 'Markdown' });
  });
};

export const handleSlCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = (ctx.message as any)?.text || '';
  const args = text.split(' ').slice(1);
  const tradeId = args[0];

  if (!tradeId) {
    // Show all open trades to pick from
    db.all(`SELECT * FROM trades WHERE chat_id = ? AND status = 'OPEN'`, [chatId], (err, trades: any[]) => {
      if (err || !trades || trades.length === 0) {
        return ctx.reply("📭 Tidak ada posisi OPEN saat ini.");
      }

      let msg = "📋 **Posisi OPEN saat ini:**\n\n";
      trades.forEach((t) => {
        msg += `🔹 ID: \`${t.id}\`\n`;
        msg += `   Token: \`${t.token_address}\`\n`;
        msg += `   Entry: ${t.entry_amount_sol} SOL\n\n`;
      });
      msg += "Untuk manual Stop Loss, ketik:\n`/sl <ID>`\n\nContoh: `/sl 1`";
      ctx.replyWithMarkdown(msg);
    });
    return;
  }

  // Close the specific trade as manual SL
  db.run(`UPDATE trades SET status = 'CLOSED_MANUAL_SL' WHERE id = ? AND chat_id = ? AND status = 'OPEN'`, [tradeId, chatId], function (err) {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Gagal menutup posisi.");
    }
    if (this.changes === 0) {
      return ctx.reply("❌ Trade ID tidak ditemukan atau sudah tertutup.");
    }
    ctx.reply(`🔴 **Manual Stop Loss** berhasil!\nTrade ID \`${tradeId}\` telah ditutup.`, { parse_mode: 'Markdown' });
  });
};

export const handleCloseAllCommand = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  db.run(`UPDATE trades SET status = 'CLOSED_MANUAL' WHERE chat_id = ? AND status = 'OPEN'`, [chatId], function (err) {
    if (err) {
      console.error(err);
      return ctx.reply("❌ Gagal menutup semua posisi.");
    }
    if (this.changes === 0) {
      return ctx.reply("📭 Tidak ada posisi OPEN untuk ditutup.");
    }
    ctx.reply(`⚡ **Semua posisi ditutup!**\n${this.changes} trade berhasil di-close secara manual.`, { parse_mode: 'Markdown' });
  });
};
