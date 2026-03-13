import dotenv from 'dotenv';
dotenv.config();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || '',
  RPC_URL: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY || '',
  BITQUERY_API_KEY: process.env.BITQUERY_API_KEY || '',
  DB_PATH: process.env.DB_PATH || './database.sqlite',
};

// Validations
if (!config.TELEGRAM_BOT_TOKEN) {
  console.warn("WARNING: TELEGRAM_BOT_TOKEN is missing. The bot will not start.");
}
if (!config.WALLET_PRIVATE_KEY) {
  console.warn("WARNING: WALLET_PRIVATE_KEY is missing. Executing trades will fail.");
}
