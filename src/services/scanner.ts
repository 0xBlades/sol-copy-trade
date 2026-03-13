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

    // Calculate 30-day range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    // Query: Get top buyers by trade count in last 30 days
    const query = `{
      Solana {
        DEXTrades(
          limit: { count: 100 }
          orderBy: { descending: Block_Time }
          where: {
            Block: { Date: { since: "${since}" } }
          }
        ) {
          Trade {
            Buy {
              Account {
                Address
              }
              AmountInUSD
              Amount
            }
            Sell {
              AmountInUSD
              Amount
            }
            Dex {
              ProtocolName
            }
          }
          Block {
            Time
          }
        }
      }
    }`;

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

    // Check for GraphQL errors
    if (response.data?.errors) {
      console.error("Bitquery GraphQL errors:", JSON.stringify(response.data.errors));
      return cachedWallets || [];
    }

    const trades = response.data?.data?.Solana?.DEXTrades || [];
    console.log(`Bitquery returned ${trades.length} trades.`);

    if (trades.length === 0) {
      console.warn("Bitquery returned no trades.");
      return cachedWallets || [];
    }

    // Aggregate per wallet address
    const walletMap = new Map<string, {
      address: string;
      tradeCount: number;
      totalBought: number;
      totalSold: number;
      dexes: Set<string>;
      lastTradeAt: Date;
      wins: number;
    }>();

    for (const item of trades) {
      const address = item.Trade?.Buy?.Account?.Address || '';
      if (!address || address.length < 30) continue;

      const boughtUsd = parseFloat(item.Trade?.Buy?.AmountInUSD) || 0;
      const soldUsd = parseFloat(item.Trade?.Sell?.AmountInUSD) || 0;
      const dexName = item.Trade?.Dex?.ProtocolName || 'Unknown';
      const tradeTime = new Date(item.Block?.Time || Date.now());
      const isWin = soldUsd > boughtUsd;

      if (walletMap.has(address)) {
        const existing = walletMap.get(address)!;
        existing.tradeCount += 1;
        existing.totalBought += boughtUsd;
        existing.totalSold += soldUsd;
        existing.dexes.add(dexName);
        if (isWin) existing.wins += 1;
        if (tradeTime > existing.lastTradeAt) {
          existing.lastTradeAt = tradeTime;
        }
      } else {
        walletMap.set(address, {
          address,
          tradeCount: 1,
          totalBought: boughtUsd,
          totalSold: soldUsd,
          dexes: new Set([dexName]),
          lastTradeAt: tradeTime,
          wins: isWin ? 1 : 0,
        });
      }
    }

    // Convert to SmartWallet array
    let results: SmartWallet[] = Array.from(walletMap.values())
      .map(w => ({
        address: w.address,
        tradeCount: w.tradeCount,
        winRate: w.tradeCount > 0 ? Math.round((w.wins / w.tradeCount) * 100 * 10) / 10 : 0,
        pnl: Math.round((w.totalSold - w.totalBought) * 100) / 100,
        dexes: Array.from(w.dexes),
        lastTradeAt: w.lastTradeAt,
      }))
      .filter(w => w.pnl > 0 && w.tradeCount >= 2) // Must be profitable, min 2 trades
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5);

    // Fallback: if no profitable wallets, just take top 5 by volume
    if (results.length === 0) {
      console.log("No profitable wallets found. Returning top 5 by trade count...");
      results = Array.from(walletMap.values())
        .map(w => ({
          address: w.address,
          tradeCount: w.tradeCount,
          winRate: w.tradeCount > 0 ? Math.round((w.wins / w.tradeCount) * 100 * 10) / 10 : 0,
          pnl: Math.round((w.totalSold - w.totalBought) * 100) / 100,
          dexes: Array.from(w.dexes),
          lastTradeAt: w.lastTradeAt,
        }))
        .sort((a, b) => b.tradeCount - a.tradeCount)
        .slice(0, 5);
    }

    cachedWallets = results;
    cacheTimestamp = Date.now();
    console.log(`Found ${results.length} smart wallets.`);
    return results;

  } catch (error: any) {
    console.error("Bitquery API Error:", error?.response?.status, error?.response?.data || error.message);
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
