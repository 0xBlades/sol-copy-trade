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

/**
 * Fetch top trader wallets from Birdeye API and filter by smart criteria.
 */
export const scanSmartWallets = async (): Promise<SmartWallet[]> => {
  if (!config.BIRDEYE_API_KEY) {
    console.warn("BIRDEYE_API_KEY is missing. Cannot scan real wallets.");
    return [];
  }

  try {
    console.log("Fetching top traders from Birdeye API...");

    // Fetch top gainers (traders with highest PNL)
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
        limit: 50, // Fetch 50, then filter down to top 5
        time_frame: '30D',
      },
    });

    const data = response.data?.data?.items || response.data?.data || [];

    if (!data || data.length === 0) {
      console.warn("Birdeye returned empty data. Trying alternative endpoint...");
      return await fetchFromAlternativeEndpoint();
    }

    // Map and filter based on smart wallet criteria
    const candidates: SmartWallet[] = data
      .map((item: any) => ({
        address: item.address || item.wallet || item.owner || '',
        tradeCount: item.trade_count || item.tradeCount || item.txs || 0,
        winRate: item.win_rate || item.winRate || 0,
        pnl: item.pnl || item.realized_pnl || item.total_pnl || 0,
        dexes: item.dexes || item.platforms || ['Unknown'],
        lastTradeAt: new Date(item.last_trade_time || item.last_trade_at || Date.now()),
      }))
      .filter((w: SmartWallet) =>
        w.tradeCount >= 500 &&
        w.winRate >= 85 &&
        w.pnl >= 50000
      );

    // Sort by PNL descending, take top 5
    const top5 = candidates
      .sort((a: SmartWallet, b: SmartWallet) => b.pnl - a.pnl)
      .slice(0, 5);

    if (top5.length === 0) {
      console.warn("No wallets matched strict criteria. Returning top 5 by PNL without strict filter...");
      return data
        .map((item: any) => ({
          address: item.address || item.wallet || item.owner || '',
          tradeCount: item.trade_count || item.tradeCount || item.txs || 0,
          winRate: item.win_rate || item.winRate || 0,
          pnl: item.pnl || item.realized_pnl || item.total_pnl || 0,
          dexes: item.dexes || item.platforms || ['Unknown'],
          lastTradeAt: new Date(item.last_trade_time || item.last_trade_at || Date.now()),
        }))
        .sort((a: SmartWallet, b: SmartWallet) => b.pnl - a.pnl)
        .slice(0, 5);
    }

    return top5;
  } catch (error: any) {
    console.error("Error fetching from Birdeye API:", error?.response?.status, error?.response?.data || error.message);

    // If the specific endpoint fails, try alternative
    try {
      return await fetchFromAlternativeEndpoint();
    } catch (altError) {
      console.error("Alternative endpoint also failed:", altError);
      return [];
    }
  }
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
  });

  const data = response.data?.data?.items || response.data?.data || [];

  if (!data || data.length === 0) {
    console.warn("Alternative endpoint also returned empty.");
    return [];
  }

  return data
    .map((item: any) => ({
      address: item.address || item.wallet || item.owner || '',
      tradeCount: item.trade_count || item.tradeCount || item.txs || 0,
      winRate: item.win_rate || item.winRate || 0,
      pnl: item.pnl || item.realized_pnl || item.total_pnl || 0,
      dexes: item.dexes || item.platforms || ['Unknown'],
      lastTradeAt: new Date(item.last_trade_time || item.last_trade_at || Date.now()),
    }))
    .sort((a: SmartWallet, b: SmartWallet) => b.pnl - a.pnl)
    .slice(0, 5);
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
