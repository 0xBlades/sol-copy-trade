import db from '../database';
import { bot } from '../bot';

export const startMonitorDaemon = () => {
    console.log("Starting Auto TP/SL Monitor...");

    setInterval(() => {
        // Fetch all open trades
        db.all(`SELECT * FROM trades WHERE status = 'OPEN'`, [], async (err, openTrades: any[]) => {
            if (err) return console.error("Monitor DB Error:", err);
            
            for (const trade of openTrades) {
                // Fetch the user's TP/SL settings
                db.get(`SELECT auto_tp_percent, auto_sl_percent FROM users WHERE chat_id = ?`, [trade.chat_id], async (err, user: any) => {
                    if (err || !user) return;

                    // 1. Fetch current price of trade.token_address via Birdeye or Dexscreener API
                    // const currentPrice = await fetchPrice(trade.token_address);
                    
                    // Mocking price simulation logic:
                    const mockCurrentPrice = trade.entry_price * (1 + (Math.random() * 0.4 - 0.2)); 
                    
                    const pnlPercent = ((mockCurrentPrice - trade.entry_price) / trade.entry_price) * 100;

                    if (pnlPercent >= user.auto_tp_percent) {
                        // Trigger Sell
                        executeSell(trade, 'CLOSED_TP', pnlPercent);
                    } else if (pnlPercent <= -user.auto_sl_percent) {
                        // Trigger Sell
                        executeSell(trade, 'CLOSED_SL', pnlPercent);
                    }
                });
            }
        });
    }, 15000); // Check every 15s
};

const executeSell = (trade: any, reason: string, pnlPercent: number) => {
    console.log(`Closing trade ${trade.id} due to ${reason}`);
    
    // Perform Solana transaction using @solana/web3.js (e.g., Jupiter Swap API to sell into SOL)

    db.run(`UPDATE trades SET status = ? WHERE id = ?`, [reason, trade.id], () => {
        let emoji = reason === 'CLOSED_TP' ? '🟢 Take Profit' : '🔴 Stop Loss';
        bot.telegram.sendMessage(trade.chat_id, `${emoji} Hit!\nToken: \`${trade.token_address}\`\nPNL: ${pnlPercent.toFixed(2)}%`, { parse_mode: 'Markdown' });
    });
};
