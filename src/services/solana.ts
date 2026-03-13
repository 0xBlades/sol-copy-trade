import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config';

export const connection = new Connection(config.RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: config.RPC_URL.replace('https', 'wss') // assuming the RPC supports wss mapping from https
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
