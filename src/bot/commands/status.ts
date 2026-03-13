import { Context } from 'telegraf';
import db from '../../database';
import { PublicKey } from '@solana/web3.js';
import { getBalance, getWallet } from '../../services/solana';

export const handleStatusCommand = async (ctx: Context) => {
  try {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Fetch user settings from db
    db.get('SELECT * FROM users WHERE chat_id = ?', [chatId], async (err, row: any) => {
      if (err) {
        return ctx.reply("❌ Failed to fetch user data.");
      }

      let settingsInfo = "Settings not initialized. Reply with /settings to configure.";
      let isCopying = false;
      let target = "-";

      if (row) {
        settingsInfo = `
⚙️ **Settings:**
Margin per entry: ${row.margin_per_entry} SOL
Auto TP: ${row.auto_tp_percent}%
Auto SL: ${row.auto_sl_percent}%`;
        isCopying = !!row.is_copy_trading;
        target = row.target_wallet || "-";
      }

      // Fetch Bot Wallet Info
      const wallet = getWallet();
      let walletAddress = "Not Configured";
      let balance = 0;

      if (wallet) {
          walletAddress = wallet.publicKey.toBase58();
          try {
              balance = await getBalance(wallet.publicKey);
          } catch (e) {
              console.error("Failed to read balance", e);
          }
      }

      const statusMessage = `
🏦 **Wallet Status**
Address: \`${walletAddress}\`
Balance: **${balance} SOL**

${settingsInfo}

📡 **Copy Trade Status:**
Active: ${isCopying ? "🟢 YES" : "🔴 NO"}
Target Wallet: \`${target}\`
`;
      
      await ctx.replyWithMarkdown(statusMessage);
    });
  } catch (error) {
    console.error("Status error:", error);
    await ctx.reply("❌ An error occurred while fetching status.");
  }
};
