import crypto from 'crypto';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface BinanceAccountBalance {
  totalEquity: number;
  availableBalance: number;
  unrealizedPnL: number;
  marginBalance: number;
}

export interface BinanceOrderResult {
  orderId: string;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: number;
  avgPrice: number;
  origQty: number;
  executedQty: number;
  cumQuote: number;
  side: 'BUY' | 'SELL';
  type: string;
  reduceOnly: boolean;
}

export class BinanceExchangeAdapter {
  private static getBaseUrl(testnet: boolean = false): string {
    return testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  }

  private static signQuery(queryString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
  }

  private static async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    params: Record<string, string | number | boolean> = {},
    credentials: BinanceCredentials
  ): Promise<T> {
    const { apiKey, apiSecret, testnet = false } = credentials;
    const baseUrl = this.getBaseUrl(testnet);

    const timestamp = Date.now();
    const queryObj: Record<string, string> = {
      ...Object.entries(params).reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {}),
      recvWindow: '5000',
      timestamp: String(timestamp)
    };

    const queryParams = new URLSearchParams(queryObj).toString();
    const signature = this.signQuery(queryParams, apiSecret);
    const fullQuery = `${queryParams}&signature=${signature}`;

    const url = method === 'GET' ? `${baseUrl}${endpoint}?${fullQuery}` : `${baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (method !== 'GET') {
      fetchOptions.body = fullQuery;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
    fetchOptions.signal = controller.signal;

    try {
      const res = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        const code = data?.code;
        const msg = data?.msg || res.statusText;
        throw new Error(`Binance API Error [code ${code}]: ${msg}`);
      }
      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Binance API Error: Request timed out after 8s');
      }
      throw err;
    }
  }

  /**
   * Test user's Binance API credentials and check trading permissions.
   * Never logs secrets.
   */
  public static async testConnection(credentials: BinanceCredentials): Promise<{
    connected: boolean;
    canTrade: boolean;
    accountType: string;
    totalMarginBalance: number;
    availableBalance: number;
  }> {
    try {
      const accountInfo = await this.request<any>('/fapi/v2/account', 'GET', {}, credentials);
      const canTrade = accountInfo.canTrade === true;
      const totalMarginBalance = parseFloat(accountInfo.totalMarginBalance || '0');
      const availableBalance = parseFloat(accountInfo.availableBalance || '0');

      return {
        connected: true,
        canTrade,
        accountType: 'USDT_FUTURES',
        totalMarginBalance: isNaN(totalMarginBalance) ? 0 : totalMarginBalance,
        availableBalance: isNaN(availableBalance) ? 0 : availableBalance
      };
    } catch (err: any) {
      console.warn('[BinanceAdapter] Test connection failed safely:', err.message);
      throw new Error(`Binance Connection Failed: ${err.message}`);
    }
  }

  /**
   * Fetch balance for USDT Futures account
   */
  public static async getAccountBalance(credentials: BinanceCredentials): Promise<BinanceAccountBalance> {
    try {
      const accountInfo = await this.request<any>('/fapi/v2/account', 'GET', {}, credentials);
      return {
        totalEquity: parseFloat(accountInfo.totalWalletBalance || '0') + parseFloat(accountInfo.totalUnrealizedProfit || '0'),
        availableBalance: parseFloat(accountInfo.availableBalance || '0'),
        unrealizedPnL: parseFloat(accountInfo.totalUnrealizedProfit || '0'),
        marginBalance: parseFloat(accountInfo.totalMarginBalance || '0')
      };
    } catch (err: any) {
      throw new Error(`Failed to fetch Binance account balance: ${err.message}`);
    }
  }

  /**
   * Enforces and strictly verifies CROSS margin mode.
   * INVARIANT: Trading profile must default to CROSS margin.
   * The trading system must never silently switch to ISOLATED.
   * Verify the required margin mode before execution.
   * If the required mode cannot be safely verified, do not execute.
   */
  public static async verifyAndEnforceCrossMargin(
    credentials: BinanceCredentials,
    symbol: string
  ): Promise<boolean> {
    const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();

    // Step 1: Attempt to set marginType to CROSSED
    try {
      await this.request('/fapi/v1/marginType', 'POST', {
        symbol: cleanSymbol,
        marginType: 'CROSSED'
      }, credentials);
    } catch (err: any) {
      // Code -4046 means: "No need to change margin type." -> already CROSSED!
      if (!err.message.includes('-4046') && !err.message.includes('No need to change')) {
        console.warn(`[BinanceAdapter] Margin type setting error for ${cleanSymbol}:`, err.message);
      }
    }

    // Step 2: Verification of actual margin type on Binance
    try {
      const positions = await this.request<any[]>('/fapi/v2/positionRisk', 'GET', {
        symbol: cleanSymbol
      }, credentials);

      const pos = positions?.find((p: any) => p.symbol === cleanSymbol);
      if (!pos) {
        throw new Error(`Could not verify position risk telemetry for ${cleanSymbol}`);
      }

      const verifiedMarginType = (pos.marginType || '').toLowerCase();
      if (verifiedMarginType !== 'cross' && verifiedMarginType !== 'crossed') {
        throw new Error(`CRITICAL MARGIN SAFETY: Exchange reported '${pos.marginType}' for ${cleanSymbol}. Required 'cross'. Execution aborted.`);
      }

      return true;
    } catch (err: any) {
      throw new Error(`CROSS Margin Verification Failed for ${cleanSymbol}: ${err.message}`);
    }
  }

  /**
   * Set leverage for symbol
   */
  public static async setLeverage(
    credentials: BinanceCredentials,
    symbol: string,
    leverage: number
  ): Promise<number> {
    const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const targetLeverage = Math.max(1, Math.min(20, Math.floor(leverage)));

    try {
      const res = await this.request<any>('/fapi/v1/leverage', 'POST', {
        symbol: cleanSymbol,
        leverage: targetLeverage
      }, credentials);
      return res.leverage || targetLeverage;
    } catch (err: any) {
      console.warn(`[BinanceAdapter] Setting leverage failed for ${cleanSymbol}:`, err.message);
      throw new Error(`Failed to set leverage on Binance for ${cleanSymbol}: ${err.message}`);
    }
  }

  /**
   * Place real order on Binance Futures
   */
  public static async placeMarketOrder(
    credentials: BinanceCredentials,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false
  ): Promise<BinanceOrderResult> {
    const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    
    return await this.request<BinanceOrderResult>('/fapi/v1/order', 'POST', {
      symbol: cleanSymbol,
      side,
      type: 'MARKET',
      quantity,
      reduceOnly: reduceOnly ? 'true' : 'false'
    }, credentials);
  }

  /**
   * Place Stop Loss order (STOP_MARKET)
   */
  public static async placeStopMarketOrder(
    credentials: BinanceCredentials,
    symbol: string,
    side: 'BUY' | 'SELL',
    stopPrice: number,
    quantity: number
  ): Promise<BinanceOrderResult> {
    const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();

    return await this.request<BinanceOrderResult>('/fapi/v1/order', 'POST', {
      symbol: cleanSymbol,
      side,
      type: 'STOP_MARKET',
      stopPrice,
      quantity,
      reduceOnly: 'true'
    }, credentials);
  }

  /**
   * Cancel open order by orderId
   */
  public static async cancelOrder(
    credentials: BinanceCredentials,
    symbol: string,
    orderId: string
  ): Promise<boolean> {
    const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    try {
      await this.request('/fapi/v1/order', 'DELETE', {
        symbol: cleanSymbol,
        orderId
      }, credentials);
      return true;
    } catch (err: any) {
      console.warn(`[BinanceAdapter] Cancel order ${orderId} failed:`, err.message);
      return false;
    }
  }

  /**
   * Fetch open positions from Binance
   */
  public static async getOpenPositions(credentials: BinanceCredentials): Promise<any[]> {
    try {
      const positions = await this.request<any[]>('/fapi/v2/positionRisk', 'GET', {}, credentials);
      return (positions || []).filter((p: any) => parseFloat(p.positionAmt || '0') !== 0);
    } catch (err: any) {
      throw new Error(`Failed to fetch Binance positions: ${err.message}`);
    }
  }
}
