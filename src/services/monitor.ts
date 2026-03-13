import db from '../database';
import { bot } from '../bot';
import { getPrice, executeSwap } from './jupiter';
import { getWallet } from './solana';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export const startMonitorDaemon = () => {
    console.log("Starting Auto TP/SL Monitor...");

    setInterval(() => {
        // Fetch all open trades
        db.all(`SELECT * FROM trades WHERE status = 'OPEN'`, [], async (err, openTrades: any[]) => {
            if (err) return console.error("Monitor DB Error:", err);
            
            for (const trade of openTrades) {
                try {
                    // Fetch current price of the token
                    const currentPrice = await getPrice(trade.token_address);
                    if (currentPrice === 0) continue; // Skip if price unknown

                    // Fetch user settings
                    db.get(`SELECT auto_tp_percent, auto_sl_percent FROM users WHERE chat_id = ?`, [trade.chat_id], async (err, user: any) => {
                        if (err || !user) return;

                        // Calculate PNL based on entry price
                        // Note: In entry, we should save the price. 
                        // If 0 (mocked before), we'll skip for safety or use current as entry for first time.
                        const entryPrice = trade.entry_price || currentPrice;
                        const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

                        console.log(`Checking trade ${trade.id} (${trade.token_address.substring(0,6)}): PNL ${pnlPercent.toFixed(2)}%`);

                        if (pnlPercent >= user.auto_tp_percent) {
                            executeRealSell(trade, 'CLOSED_TP', pnlPercent);
                        } else if (pnlPercent <= -user.auto_sl_percent) {
                            executeRealSell(trade, 'CLOSED_SL', pnlPercent);
                        }
                    });
                } catch (e) {
                    console.error(`Error monitoring trade ${trade.id}:`, e);
                }
            }
        });
    }, 30000); // Check every 30s to stay within rate limits
};

const executeRealSell = async (trade: any, reason: string, pnlPercent: number) => {
    const myWallet = getWallet();
    if (!myWallet) return;

    try {
        console.log(`⚡ TRIGERRED SELL: ${reason} for token ${trade.token_address}`);
        
        // In a real memecoin bot, we'd fetch the exact balance of the token
        // to sell 100% of it. For this implementation, we'll try to swap 
        // back to SOL.
        
        // We'll use a high slippage for selling memecoins (2-5%)
        const txid = await executeSwap(
            myWallet,
            trade.token_address,
            SOL_MINT,
            1, // Small amount for demo, in production it would be full balance
            200 // 2% slippage
        );

        db.run(`UPDATE trades SET status = ? WHERE id = ?`, [reason, trade.id], () => {
            let emoji = reason === 'CLOSED_TP' ? '🟢 Take Profit' : '🔴 Stop Loss';
            bot.telegram.sendMessage(trade.chat_id, 
                `${emoji} Hit!\n` +
                `Token: \`${trade.token_address}\`\n` +
                `PNL: ${pnlPercent.toFixed(2)}%\n` +
                `TX: [View on Solscan](https://solscan.io/tx/${txid})`, 
                { parse_mode: 'Markdown', disable_web_page_preview: true }
            );
        });

    } catch (e: any) {
        console.error(`Failed to execute auto sell for trade ${trade.id}:`, e.message);
    }
};
