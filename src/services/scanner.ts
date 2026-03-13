import axios from 'axios';
import { config } from '../config';

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

export interface SmartWallet {
  address: string;
  tradeCount: number;
  winRate: number;
  pnl: number;
  dexes: string[];
  lastTradeAt: Date;
}

// ===== CACHE: prevent spamming Birdeye API (cache 5 minutes) =====
let cachedWallets: SmartWallet[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 menit

/**
 * Fetch top trader wallets from Birdeye API with caching.
 */
export const scanSmartWallets = async (): Promise<SmartWallet[]> => {
  if (!config.BIRDEYE_API_KEY) {
    console.warn("BIRDEYE_API_KEY is missing. Cannot scan real wallets.");
    return [];
  }

  // Return cached data if still fresh
  if (cachedWallets && (Date.now() - cacheTimestamp < CACHE_DURATION_MS)) {
    console.log("Returning cached smart wallets data.");
    return cachedWallets;
  }

  try {
    console.log("Fetching top traders from Birdeye API...");

    const response = await axios.get(`${BIRDEYE_BASE_URL}/trader/gainers-losers`, {
      headers: {
        'X-API-KEY': config.BIRDEYE_API_KEY,
        'x-chain': 'solana',
      },
      params: {
        type: 'gainers',
        sort_by: 'PnL',
        sort_type: 'desc',
        offset: 0,
        limit: 50,
        time_frame: '30D',
      },
      timeout: 15000,
    });

    const data = response.data?.data?.items || response.data?.data || [];
    const result = processWalletData(data);
    
    // Save to cache
    cachedWallets = result;
    cacheTimestamp = Date.now();
    return result;

  } catch (error: any) {
    // Handle 429 rate limit
    if (error?.response?.status === 429) {
      console.warn("Birdeye API rate limited (429). Returning cached data or empty.");
      if (cachedWallets) return cachedWallets;
      return [];
    }

    console.error("Error fetching from Birdeye:", error?.response?.status, error?.response?.data?.message || error.message);

    // Try alternative endpoint
    try {
      const altResult = await fetchFromAlternativeEndpoint();
      cachedWallets = altResult;
      cacheTimestamp = Date.now();
      return altResult;
    } catch (altError: any) {
      if (altError?.response?.status === 429 && cachedWallets) return cachedWallets;
      console.error("Alternative endpoint also failed.");
      return cachedWallets || [];
    }
  }
};

/**
 * Process raw API data into SmartWallet format
 */
const processWalletData = (data: any[]): SmartWallet[] => {
  if (!data || data.length === 0) return [];

  const mapped: SmartWallet[] = data.map((item: any) => ({
    address: item.address || item.wallet || item.owner || '',
    tradeCount: item.trade_count || item.tradeCount || item.txs || 0,
    winRate: item.win_rate || item.winRate || 0,
    pnl: item.pnl || item.realized_pnl || item.total_pnl || 0,
    dexes: item.dexes || item.platforms || ['Unknown'],
    lastTradeAt: new Date(item.last_trade_time || item.last_trade_at || Date.now()),
  }));

  // Try strict filter first
  const strict = mapped
    .filter((w) => w.tradeCount >= 500 && w.winRate >= 85 && w.pnl >= 50000)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5);

  if (strict.length > 0) return strict;

  // Fallback: return top 5 by PNL without strict filter
  console.log("No wallets matched strict criteria. Returning top 5 by PNL...");
  return mapped
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5);
};

/**
 * Alternative: Fetch from Birdeye defi/v3 trader endpoint
 */
const fetchFromAlternativeEndpoint = async (): Promise<SmartWallet[]> => {
  console.log("Trying alternative Birdeye endpoint...");

  const response = await axios.get(`${BIRDEYE_BASE_URL}/defi/v3/trader/gainers-losers`, {
    headers: {
      'X-API-KEY': config.BIRDEYE_API_KEY,
      'x-chain': 'solana',
    },
    params: {
      type: 'gainers',
      sort_by: 'PnL',
      sort_type: 'desc',
      offset: 0,
      limit: 50,
      time_frame: '30D',
    },
    timeout: 15000,
  });

  const data = response.data?.data?.items || response.data?.data || [];
  return processWalletData(data);
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
