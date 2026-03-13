import axios from 'axios';
import { 
  Connection, 
  Keypair, 
  VersionedTransaction 
} from '@solana/web3.js';
import { connection } from './solana';

const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFeeBps: number;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot: number;
  timeTaken: number;
}

export const getQuote = async (
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports for SOL or smallest unit for tokens
  slippageBps: number = 50 // 0.5%
): Promise<any> => {
  try {
    const { data } = await axios.get(`${JUPITER_API_BASE}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps,
      }
    });
    return data;
  } catch (error: any) {
    console.error("Jupiter Quote Error:", error.response?.data || error.message);
    throw error;
  }
};

export const getSwapTransaction = async (
  quoteResponse: any,
  userPublicKey: string,
  wrapAndUnwrapSol: boolean = true
): Promise<string> => {
  try {
    const { data } = await axios.post(`${JUPITER_API_BASE}/swap`, {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol,
    });
    return data.swapTransaction;
  } catch (error: any) {
    console.error("Jupiter Swap Transaction Error:", error.response?.data || error.message);
    throw error;
  }
};

export const executeSwap = async (
  wallet: Keypair,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 100 // Default 1% for memecoins
): Promise<string> => {
  try {
    console.log(`Getting quote for swap: ${amount} lamports from ${inputMint} to ${outputMint}`);
    const quote = await getQuote(inputMint, outputMint, amount, slippageBps);
    
    console.log("Building swap transaction...");
    const swapTransactionBase64 = await getSwapTransaction(quote, wallet.publicKey.toBase58());
    
    const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    console.log("Signing transaction...");
    transaction.sign([wallet]);
    
    console.log("Sending transaction...");
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2
    });
    
    console.log(`Transaction sent: https://solscan.io/tx/${txid}`);
    
    // Confirm transaction
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid
    }, 'confirmed');
    
    return txid;
  } catch (error: any) {
    console.error("Execute Swap Failed:", error.message);
    throw error;
  }
};

/**
 * Fetch current price of a token in USDC/SOL via Jupiter Price API
 */
export const getPrice = async (tokenMint: string): Promise<number> => {
    try {
        const { data } = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenMint}`);
        return data.data[tokenMint]?.price || 0;
    } catch (e) {
        console.error("Price fetch error:", e);
        return 0;
    }
};
