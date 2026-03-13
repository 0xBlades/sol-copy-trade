import axios from 'axios';
import { config } from '../config';

const BITQUERY_URL = 'https://streaming.bitquery.io/graphql';

export interface SmartWallet {
  address: string;
  tradeCount: number;
  winRate: number;
  pnl: number;
  dexes: string[];
  lastTradeAt: Date;
}

// ===== CACHE (5 minutes) =====
let cachedWallets: SmartWallet[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

const bitqueryHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${config.BITQUERY_API_KEY}`,
});

/**
 * Fetch top smart wallets using Bitquery GraphQL (all queries verified).
 */
export const scanSmartWallets = async (): Promise<SmartWallet[]> => {
  if (!config.BITQUERY_API_KEY) {
    console.warn("BITQUERY_API_KEY is missing.");
    return [];
  }

  if (cachedWallets && cachedWallets.length > 0 && (Date.now() - cacheTimestamp < CACHE_DURATION_MS)) {
    console.log("Returning cached smart wallets.");
    return cachedWallets;
  }

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log("Step 1: Fetching top wallets by trade count...");

    // ── STEP 1: Get top 20 wallets by trade count on memecoin DEXes ──
    const memecoinDexes = `["pump", "pump_amm", "pumpamm", "pump_fun", "raydium", "raydium_amm", "raydiumamm"]`;
    const topQuery = `{
      Solana {
        DEXTrades(
          orderBy: { descendingByField: "tradeCount" }
          limit: { count: 30 }
          where: { 
            Block: { Date: { since: "${since}" } } 
            Trade: { Dex: { ProtocolName: { in: ${memecoinDexes} } } }
          }
        ) {
          Trade {
            Buy { Account { Address } }
            Dex { ProtocolName }
          }
          tradeCount: count
        }
      }
    }`;

    const topRes = await axios.post(BITQUERY_URL, { query: topQuery }, {
      headers: bitqueryHeaders(), timeout: 30000,
    });

    if (topRes.data?.errors) {
      console.error("Step 1 errors:", JSON.stringify(topRes.data.errors));
      return cachedWallets || [];
    }

    const topWallets = topRes.data?.data?.Solana?.DEXTrades || [];
    console.log(`Got ${topWallets.length} wallets. Filtering 500+ trades...`);

    // Filter wallets with 500+ trades
    const candidates = topWallets
      .filter((w: any) => parseInt(w.tradeCount) >= 500)
      .slice(0, 10); // Max 10 to check PNL for

    if (candidates.length === 0) {
      console.warn("No wallets with 500+ trades found.");
      return cachedWallets || [];
    }

    console.log(`Step 2: Getting PNL for ${candidates.length} wallets...`);

    // ── STEP 2: Get PNL + last trade for each wallet ──
    const results: SmartWallet[] = [];

    for (const item of candidates) {
      const address = item.Trade?.Buy?.Account?.Address || '';
      const tradeCount = parseInt(item.tradeCount) || 0;
      const dexName = item.Trade?.Dex?.ProtocolName || 'Unknown';
      if (!address || address.length < 30) continue;

      try {
        // Query PNL (sum of bought vs sold) on memecoin DEXes
        const pnlQuery = `{
          Solana {
            DEXTrades(
              where: {
                Block: { Date: { since: "${since}" } }
                Trade: { 
                  Buy: { Account: { Address: { is: "${address}" } } }
                  Dex: { ProtocolName: { in: ${memecoinDexes} } }
                }
              }
            ) {
              tradeCount: count
              totalBought: sum(of: Trade_Buy_AmountInUSD)
              totalSold: sum(of: Trade_Sell_AmountInUSD)
            }
          }
        }`;

        const pnlRes = await axios.post(BITQUERY_URL, { query: pnlQuery }, {
          headers: bitqueryHeaders(), timeout: 20000,
        });

        const pnlData = pnlRes.data?.data?.Solana?.DEXTrades?.[0];
        const totalBought = parseFloat(pnlData?.totalBought) || 0;
        const totalSold = parseFloat(pnlData?.totalSold) || 0;
        const pnl = Math.round((totalSold - totalBought) * 100) / 100;
        const walletTradeCount = parseInt(pnlData?.tradeCount) || tradeCount;

        // Query last trade time on memecoin DEXes
        const lastTradeQuery = `{
          Solana {
            DEXTrades(
              limit: { count: 1 }
              orderBy: { descending: Block_Time }
              where: { 
                Trade: { 
                  Buy: { Account: { Address: { is: "${address}" } } }
                  Dex: { ProtocolName: { in: ${memecoinDexes} } }
                } 
              }
            ) {
              Block { Time }
            }
          }
        }`;

        const ltRes = await axios.post(BITQUERY_URL, { query: lastTradeQuery }, {
          headers: bitqueryHeaders(), timeout: 15000,
        });

        const lastTradeTime = ltRes.data?.data?.Solana?.DEXTrades?.[0]?.Block?.Time;
        const lastTradeAt = lastTradeTime ? new Date(lastTradeTime) : new Date();

        // Estimate win rate based on profit ratio
        const winRate = totalBought > 0
          ? Math.min(Math.round((totalSold / totalBought) * 100 * 10) / 10, 99.9)
          : 0;

        results.push({
          address,
          tradeCount: walletTradeCount,
          winRate,
          pnl,
          dexes: [dexName],
          lastTradeAt,
        });

        await delay(400); // Rate limit protection
      } catch (e: any) {
        if (e?.response?.status === 429) {
          console.warn("Rate limited. Stopping PNL lookups.");
          break;
        }
        console.error(`PNL query failed for ${address}:`, e.message);
      }
    }

    // Sort by PNL descending, take top 5
    results.sort((a, b) => b.pnl - a.pnl);
    cachedWallets = results.slice(0, 5);
    cacheTimestamp = Date.now();
    console.log(`Returning ${cachedWallets.length} smart wallets.`);
    return cachedWallets;

  } catch (error: any) {
    console.error("Scan error:", error?.response?.status, error?.response?.data || error.message);
    return cachedWallets || [];
  }
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Format time difference to human-readable string
 */
export const formatTimeAgo = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec} detik lalu`;
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return `${diffDay} hari lalu`;
};
