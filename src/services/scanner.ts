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
 * Fetch top trader wallets from Bitquery GraphQL API (aggregated per wallet).
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
    console.log("Fetching top traders from Bitquery (aggregated)...");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    // Step 1: Get top wallets by trade count (aggregated), minimum 500 trades
    const topWalletsQuery = `{
      Solana {
        DEXTrades(
          orderBy: { descendingByField: "tradeCount" }
          limit: { count: 20 }
          where: {
            Block: { Date: { since: "${since}" } }
          }
        ) {
          Trade {
            Buy {
              Account {
                Address
              }
            }
            Dex {
              ProtocolName
            }
          }
          tradeCount: count
        }
      }
    }`;

    const walletsRes = await axios.post(
      BITQUERY_URL,
      { query: topWalletsQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.BITQUERY_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    if (walletsRes.data?.errors) {
      console.error("Bitquery errors:", JSON.stringify(walletsRes.data.errors));
      return cachedWallets || [];
    }

    const topWallets = walletsRes.data?.data?.Solana?.DEXTrades || [];
    console.log(`Found ${topWallets.length} top wallets by trade count.`);

    if (topWallets.length === 0) return cachedWallets || [];

    // Filter: tradeCount > 500
    const filtered = topWallets.filter((w: any) => parseInt(w.tradeCount) >= 500);
    console.log(`${filtered.length} wallets with 500+ trades.`);

    if (filtered.length === 0) {
      console.log("No wallets with 500+ trades. Showing top wallets instead...");
    }

    const walletsToUse = filtered.length > 0 ? filtered : topWallets;

    // Step 2: For each wallet, get PNL details
    const results: SmartWallet[] = [];

    for (const item of walletsToUse.slice(0, 10)) {
      const address = item.Trade?.Buy?.Account?.Address || '';
      const tradeCount = parseInt(item.tradeCount) || 0;
      const dexName = item.Trade?.Dex?.ProtocolName || 'Unknown';

      if (!address || address.length < 30) continue;

      // Get PNL for this wallet
      try {
        const pnlData = await getWalletPNL(address, since);

        const wallet: SmartWallet = {
          address,
          tradeCount,
          winRate: pnlData.winRate,
          pnl: pnlData.pnl,
          dexes: [dexName],
          lastTradeAt: pnlData.lastTrade,
        };

        // Apply criteria filters
        if (
          wallet.tradeCount >= 500 &&
          wallet.pnl >= 50000 &&
          wallet.winRate >= 85
        ) {
          results.push(wallet);
        }

        // Small delay to avoid rate limits
        await delay(300);
      } catch (e: any) {
        if (e?.response?.status === 429) {
          console.warn("Rate limited during PNL fetch. Stopping.");
          break;
        }
      }

      if (results.length >= 5) break;
    }

    // Fallback: if strict criteria returns < 5, relax the filter
    if (results.length < 5) {
      console.log(`Only ${results.length} wallets matched strict criteria. Adding top wallets by trade count...`);
      for (const item of walletsToUse) {
        const address = item.Trade?.Buy?.Account?.Address || '';
        const tradeCount = parseInt(item.tradeCount) || 0;
        const dexName = item.Trade?.Dex?.ProtocolName || 'Unknown';

        if (!address || results.find(r => r.address === address)) continue;

        results.push({
          address,
          tradeCount,
          winRate: 0,
          pnl: 0,
          dexes: [dexName],
          lastTradeAt: new Date(),
        });

        if (results.length >= 5) break;
      }
    }

    // Sort by PNL desc
    results.sort((a, b) => b.pnl - a.pnl);

    cachedWallets = results.slice(0, 5);
    cacheTimestamp = Date.now();
    console.log(`Returning ${cachedWallets.length} smart wallets.`);
    return cachedWallets;

  } catch (error: any) {
    console.error("Bitquery API Error:", error?.response?.status, error?.response?.data || error.message);
    return cachedWallets || [];
  }
};

/**
 * Get PNL and stats for a specific wallet
 */
const getWalletPNL = async (walletAddress: string, since: string): Promise<{ pnl: number; winRate: number; lastTrade: Date }> => {
  const query = `{
    Solana {
      DEXTrades(
        limit: { count: 10 }
        orderBy: { descendingByField: "tradeCount" }
        where: {
          Block: { Date: { since: "${since}" } }
          Trade: { Buy: { Account: { Address: { is: "${walletAddress}" } } } }
        }
      ) {
        tradeCount: count
        totalBought: sum(of: Trade_Buy_AmountInUSD)
        totalSold: sum(of: Trade_Sell_AmountInUSD)
        lastTrade: maximum(of: Block_Date)
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
      timeout: 20000,
    }
  );

  const trades = response.data?.data?.Solana?.DEXTrades || [];

  if (trades.length === 0) {
    return { pnl: 0, winRate: 0, lastTrade: new Date() };
  }

  let totalBought = 0;
  let totalSold = 0;
  let wins = 0;
  let total = 0;
  let lastTradeDate = new Date();

  for (const t of trades) {
    const bought = parseFloat(t.totalBought) || 0;
    const sold = parseFloat(t.totalSold) || 0;
    totalBought += bought;
    totalSold += sold;
    total += 1;
    if (sold > bought) wins += 1;
    if (t.lastTrade) lastTradeDate = new Date(t.lastTrade);
  }

  const pnl = totalSold - totalBought;
  const winRate = total > 0 ? Math.round((wins / total) * 100 * 10) / 10 : 0;

  return { pnl: Math.round(pnl * 100) / 100, winRate, lastTrade: lastTradeDate };
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
