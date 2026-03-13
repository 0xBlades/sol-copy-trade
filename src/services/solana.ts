import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config';

// Safely build RPC URL - handle cases where env var might be empty or malformed
const rpcUrl = config.RPC_URL && config.RPC_URL.startsWith('http') 
  ? config.RPC_URL 
  : 'https://api.mainnet-beta.solana.com';

console.log(`Using RPC URL: ${rpcUrl.substring(0, 40)}...`);

// Build WebSocket URL from HTTP URL
const buildWsUrl = (httpUrl: string): string | undefined => {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return undefined;
  }
};

export const connection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  wsEndpoint: buildWsUrl(rpcUrl),
});

let walletKeypair: Keypair | null = null;

try {
  if (config.WALLET_PRIVATE_KEY) {
    walletKeypair = Keypair.fromSecretKey(bs58.decode(config.WALLET_PRIVATE_KEY));
    console.log(`Wallet loaded. Public Key: ${walletKeypair.publicKey.toBase58()}`);
  }
} catch (error) {
  console.error("Failed to decode WALLET_PRIVATE_KEY. Make sure it is base58 format.");
}

export const getWallet = () => walletKeypair;

export const getBalance = async (pubkey: PublicKey): Promise<number> => {
  const balance = await connection.getBalance(pubkey);
  return balance / 1e9; // Convert lamports to SOL
};
