import { Context } from 'telegraf';
import { scanSmartWallets, SmartWallet } from '../../services/scanner';

export const handleScanCommand = async (ctx: Context) => {
  try {
    await ctx.reply("🔍 Scanning for the top 5 smartest wallets based on criteria:\n(>30d old, >500 trades, >85% Win Rate, >$50k PNL, >10% Max DD)\n\nPlease wait...");
    
    const wallets = await scanSmartWallets();
    
    if (!wallets || wallets.length === 0) {
      return ctx.reply("❌ No wallets matching criteria found right now. Please try again later.");
    }

    let message = "🏆 **Top 5 Smart Wallets** 🏆\n\n";
    
    wallets.forEach((wallet, index) => {
      message += `${index + 1}. \`${wallet.address}\`\n`;
      message += `   📊 Trades: ${wallet.tradeCount}\n`;
      message += `   📈 Win Rate: ${wallet.winRate}%\n`;
      message += `   💰 PNL: $${wallet.pnl.toLocaleString()}\n`;
      message += `   🔄 DEX: ${wallet.dexes.join(', ')}\n`;
      message += `   👉 /copy ${wallet.address}\n\n`;
    });

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error("Scan error:", error);
    await ctx.reply("❌ An error occurred while scanning wallets.");
  }
};
