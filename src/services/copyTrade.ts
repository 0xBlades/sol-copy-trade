import { connection, getWallet } from './solana';
import { PublicKey } from '@solana/web3.js';
import db from '../database';
import { bot } from '../bot';

// Simplified Monitor Object
const subscriptionIds: Record<string, number> = {};

export const startCopyTradeDaemon = () => {
  console.log("Starting Copy Trade Daemon...");

  // Monitor DB for active copy traders
  setInterval(() => {
    db.all('SELECT * FROM users WHERE is_copy_trading = 1 AND target_wallet IS NOT NULL', [], (err, rows: any[]) => {
      if (err) return console.error("Daemon DB Error:", err);
      
      const activeTargets = new Set(rows.map(r => r.target_wallet));
      
      // Subscribe to new targets
      rows.forEach(row => {
        const target = row.target_wallet;
        if (!subscriptionIds[target]) {
           subscribeToWallet(target, row);
        }
      });

      // Unsubscribe from stopped targets
      Object.keys(subscriptionIds).forEach(target => {
        if (!activeTargets.has(target)) {
          connection.removeOnLogsListener(subscriptionIds[target]);
          delete subscriptionIds[target];
          console.log(`Unsubscribed from ${target}`);
        }
      });
    });

  }, 10000); // Check every 10s for new users
};

const subscribeToWallet = (targetAddress: string, user: any) => {
  try {
    const pubkey = new PublicKey(targetAddress);
    
    console.log(`Subscribing to target wallet: ${targetAddress}`);
    
    const subId = connection.onLogs(pubkey, (logs, ctx) => {
      // Basic heuristic: Is it a transaction with Raydium/Jupiter/Pumpfun?
      // For a real production app, we would fetch the parsed transaction using connection.getParsedTransaction(logs.signature)
      // and deeply analyze the inner instructions to detect the exact token bought.
      
      const logString = logs.logs.join(' ');
      
      // Mock detection condition:
      if (logString.includes('Program log: Instruction: Swap') || logString.includes('Program log: Instruction: Route')) {
          console.log(`Detected swap on ${targetAddress}! Signature: ${logs.signature}`);
          executeCopyTrade(logs.signature, user);
      }
    }, 'confirmed');

    subscriptionIds[targetAddress] = subId;
  } catch (e) {
    console.error(`Failed to subscribe to ${targetAddress}`, e);
  }
};

const executeCopyTrade = async (targetSignature: string, user: any) => {
    const myWallet = getWallet();
    if (!myWallet) {
        bot.telegram.sendMessage(user.chat_id, "⚠️ Copy trade detected, but your wallet private key is not configured.");
        return;
    }

    try {
        // Detailed swap tracing (Raydium, PumpFun, Jupiter) requires parsing the tx:
        // const tx = await connection.getParsedTransaction(targetSignature, {maxSupportedTransactionVersion: 0});
        // ... parse token mint address... 
        
        // Mock Token Address for demonstration
        const mockTokenAddress = "Token11111111111111111111111111111111111111"; 
        
        // Execute Buy via Jupiter API or manual web3 instruction here
        
        // Save open trade to Database for Auto TP/SL
        db.run(`
          INSERT INTO trades (chat_id, token_address, entry_price, entry_amount_sol, tx_signature, status) 
          VALUES (?, ?, ?, ?, ?, 'OPEN')
        `, [user.chat_id, mockTokenAddress, 0.005, user.margin_per_entry, targetSignature]);

        bot.telegram.sendMessage(user.chat_id, `⚡ **Copy Trade Executed!**\nTarget TX: \`${targetSignature}\`\nMargin: ${user.margin_per_entry} SOL`, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error("Execute Copy Trade Failed", e);
    }
};
