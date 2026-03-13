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

// ===== CACHE: prevent spamming API (cache 5 minutes) =====
let cachedWallets: SmartWallet[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Fetch top trader wallets from Bitquery GraphQL API.
 * Query: Get wallets with most profitable DEX trades on Solana in last 30 days.
 */
export const scanSmartWallets = async (): Promise<SmartWallet[]> => {
  if (!config.BITQUERY_API_KEY) {
    console.warn("BITQUERY_API_KEY is missing. Cannot scan wallets.");
    return [];
  }

  // Return cached data if still fresh
  if (cachedWallets && cachedWallets.length > 0 && (Date.now() - cacheTimestamp < CACHE_DURATION_MS)) {
    console.log("Returning cached smart wallets data.");
    return cachedWallets;
  }

  try {
    console.log("Fetching top traders from Bitquery GraphQL API...");

    // Calculate dates for 30-day range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    const query = `
      {
        Solana {
          DEXTradeByTokens(
            orderBy: { descendingByField: "volumeUsd" }
            limit: { count: 50 }
            where: {
              Block: { Date: { since: "${since}" } }
              Trade: { Side: { Currency: { MintAddress: { not: "" } } } }
            }
          ) {
            Trade {
              Account {
                Owner
              }
              Dex {
                ProtocolName
              }
            }
            volumeUsd: sum(of: Trade_Side_AmountInUSD)
            tradeCount: count
            bought: sum(of: Trade_Side_AmountInUSD, if: { Trade: { Side: { Type: { is: buy } } } })
            sold: sum(of: Trade_Side_AmountInUSD, if: { Trade: { Side: { Type: { is: sell } } } })
            lastTrade: maximum(of: Block_Date)
          }
        }
      }
    `;

    const response = await axios.post(
      BITQUERY_URL,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.BITQUERY_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const trades = response.data?.data?.Solana?.DEXTradeByTokens || [];

    if (trades.length === 0) {
      console.warn("Bitquery returned no trades data.");
      return cachedWallets || [];
    }

    // Aggregate per wallet
    const walletMap = new Map<string, SmartWallet>();

    for (const item of trades) {
      const owner = item.Trade?.Account?.Owner || '';
      if (!owner) continue;

      const dexName = item.Trade?.Dex?.ProtocolName || 'Unknown';
      const bought = parseFloat(item.bought) || 0;
      const sold = parseFloat(item.sold) || 0;
      const pnl = sold - bought; // Simple PNL: what you sold - what you bought
      const count = parseInt(item.tradeCount) || 0;
      const lastTradeDate = new Date(item.lastTrade || Date.now());

      if (walletMap.has(owner)) {
        const existing = walletMap.get(owner)!;
        existing.tradeCount += count;
        existing.pnl += pnl;
        if (!existing.dexes.includes(dexName)) {
          existing.dexes.push(dexName);
        }
        if (lastTradeDate > existing.lastTradeAt) {
          existing.lastTradeAt = lastTradeDate;
        }
      } else {
        walletMap.set(owner, {
          address: owner,
          tradeCount: count,
          winRate: 0, // Will calculate below
          pnl: pnl,
          dexes: [dexName],
          lastTradeAt: lastTradeDate,
        });
      }
    }

    // Calculate winRate estimate and filter
    let results = Array.from(walletMap.values()).map(w => {
      // Estimate winRate: if PNL is positive relative to volume, higher win rate
      const totalVolume = Math.abs(w.pnl) + 1;
      const estimatedWinRate = w.pnl > 0
        ? Math.min(50 + (w.pnl / totalVolume) * 50, 99)
        : Math.max(50 - (Math.abs(w.pnl) / totalVolume) * 50, 1);
      w.winRate = Math.round(estimatedWinRate * 10) / 10;
      return w;
    });

    // Filter: PNL > 0 and tradeCount > 10 (relaxed filter to get results)
    results = results
      .filter(w => w.pnl > 0 && w.tradeCount >= 10)
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5);

    // Fallback: if strict filter returns nothing, just take top 5 by PNL
    if (results.length === 0) {
      console.log("No wallets matched filter. Returning top 5 by PNL...");
      results = Array.from(walletMap.values())
        .sort((a, b) => b.pnl - a.pnl)
        .slice(0, 5);
    }

    cachedWallets = results;
    cacheTimestamp = Date.now();
    console.log(`Found ${results.length} smart wallets.`);
    return results;

  } catch (error: any) {
    console.error("Bitquery API Error:", error?.response?.status, error?.response?.data?.errors || error.message);

    if (error?.response?.status === 429 && cachedWallets) {
      return cachedWallets;
    }

    return cachedWallets || [];
  }
};

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
