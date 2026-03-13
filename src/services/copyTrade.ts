import { connection, getWallet } from './solana';
import { PublicKey } from '@solana/web3.js';
import db from '../database';
import { bot } from '../bot';
import { executeSwap } from './jupiter';

const subscriptionIds: Record<string, number> = {};
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export const startCopyTradeDaemon = () => {
  console.log("Starting Copy Trade Daemon...");

  setInterval(() => {
    db.all('SELECT * FROM users WHERE is_copy_trading = 1 AND target_wallet IS NOT NULL', [], (err, rows: any[]) => {
      if (err) return console.error("Daemon DB Error:", err);
      
      const activeTargets = new Set(rows.map(r => r.target_wallet));
      
      rows.forEach(row => {
        const target = row.target_wallet;
        if (!subscriptionIds[target]) {
           subscribeToWallet(target, row);
        }
      });

      Object.keys(subscriptionIds).forEach(target => {
        if (!activeTargets.has(target)) {
          connection.removeOnLogsListener(subscriptionIds[target]);
          delete subscriptionIds[target];
          console.log(`Unsubscribed from ${target}`);
        }
      });
    });
  }, 10000);
};

const subscribeToWallet = (targetAddress: string, user: any) => {
  try {
    const pubkey = new PublicKey(targetAddress);
    console.log(`Subscribing to target wallet: ${targetAddress}`);
    
    // Listen for all transactions involving this wallet
    const subId = connection.onLogs(pubkey, async (logs, ctx) => {
      const logString = logs.logs.join(' ');
      
      // Filter for swap-related instructions (Jupiter, Raydium, Pump.fun)
      if (
        logString.includes('Program log: Instruction: Swap') || 
        logString.includes('Program log: Instruction: Route') ||
        logString.includes('Program log: Instruction: Buy') ||
        logString.includes('Program log: Instruction: Sell')
      ) {
          console.log(`Detected potential trade on ${targetAddress}! Signature: ${logs.signature}`);
          processTradeTransaction(logs.signature, targetAddress, user);
      }
    }, 'confirmed');

    subscriptionIds[targetAddress] = subId;
  } catch (e) {
    console.error(`Failed to subscribe to ${targetAddress}`, e);
  }
};

const processTradeTransaction = async (signature: string, targetAddress: string, user: any) => {
    try {
        // Fetch detailed transaction data
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx || !tx.meta || !tx.meta.postTokenBalances || !tx.meta.preTokenBalances) return;

        // Analytics: Look for token balances that increased for the target wallet
        // while SOL balance decreased (Buy order)
        const postBalances = tx.meta.postTokenBalances;
        const preBalances = tx.meta.preTokenBalances;

        // Find which token address the target wallet received
        const targetPostBalances = postBalances.filter(b => b.owner === targetAddress);
        const targetPreBalances = preBalances.filter(b => b.owner === targetAddress);

        let boughtTokenMint: string | null = null;
        
        for (const post of targetPostBalances) {
            const pre = targetPreBalances.find(p => p.mint === post.mint);
            const postAmt = post.uiTokenAmount.uiAmount || 0;
            const preAmt = pre ? (pre.uiTokenAmount.uiAmount || 0) : 0;

            if (postAmt > preAmt) {
                // Ignore SOL/WSOL and USDC/USDT for memecoin detection
                const mint = post.mint;
                if (mint !== SOL_MINT && !mint.includes('EPjFWfv5QsND44qcM71Lp3rtW51YZvJCubz65HPVuvS') && !mint.includes('Es9vMFrzaDCSTMdUiAn976ojf9VipLXxE5Fi2v59nM7')) {
                    boughtTokenMint = mint;
                    break;
                }
            }
        }

        if (boughtTokenMint) {
            console.log(`Target wallet ${targetAddress} bought token: ${boughtTokenMint}`);
            executeCopyBuy(boughtTokenMint, signature, user);
        }

    } catch (e) {
        console.error("Error processing transaction:", e);
    }
};

const executeCopyBuy = async (tokenMintAddress: string, targetSignature: string, user: any) => {
    const myWallet = getWallet();
    if (!myWallet) {
        bot.telegram.sendMessage(user.chat_id, "⚠️ Copy trade detected, but your wallet private key is not configured.");
        return;
    }

    try {
        // 0.01 SOL = 10,000,000 lamports
        const amountInSOL = user.margin_per_entry || 0.01;
        const amountInLamports = Math.floor(amountInSOL * 1e9);

        bot.telegram.sendMessage(user.chat_id, `🎯 **Target Bought New Token!**\nToken: \`${tokenMintAddress}\`\nExecuting Copy Trade (${amountInSOL} SOL)...`, { parse_mode: 'Markdown' });

        // Execute swap SOL -> Token via Jupiter
        const txid = await executeSwap(
            myWallet,
            SOL_MINT,
            tokenMintAddress,
            amountInLamports
        );

        // Fetch price after swap to save entry price
        const entryPrice = 0; // In a real app, calculate from tx or use price API
        
        // Save to DB
        db.run(`
          INSERT INTO trades (chat_id, token_address, entry_price, entry_amount_sol, tx_signature, status) 
          VALUES (?, ?, ?, ?, ?, 'OPEN')
        `, [user.chat_id, tokenMintAddress, entryPrice, amountInSOL, txid]);

        bot.telegram.sendMessage(user.chat_id, `✅ **Copy Trade Success!**\nTX: [View on Solscan](https://solscan.io/tx/${txid})`, { parse_mode: 'Markdown', disable_web_page_preview: true });

    } catch (e: any) {
        console.error("Execute Copy Buy Failed", e);
        bot.telegram.sendMessage(user.chat_id, `❌ **Copy Trade Failed**\nError: ${e.message}`);
    }
};
