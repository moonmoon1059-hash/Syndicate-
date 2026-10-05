import { TimeFrame } from '../types/crypto';
import { getApiBase } from './api';

export interface LiveCandleUpdate {
  symbol: string;
  timeframe: string;
  time: number; // Seconds (Lightweight Charts format)
  timestampMs: number; // Milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  source: 'binance' | 'bybit' | 'server';
}

export type LiveStreamConnectionStatus = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'STALE' | 'OFFLINE';

export interface LiveStreamStatus {
  status: LiveStreamConnectionStatus;
  symbol: string;
  timeframe: string;
  source?: 'binance' | 'bybit' | 'server';
  lastTickTime?: number;
  error?: string;
}

export interface LiveStreamSubscriptionOptions {
  symbol: string;
  timeframe: TimeFrame | string;
  onTick: (update: LiveCandleUpdate) => void;
  onStatusChange?: (status: LiveStreamStatus) => void;
}

/**
 * Normalizes symbol to standard uppercase (e.g. BTC/USDT -> BTCUSDT)
 */
export function normalizeStreamSymbol(rawSymbol: string): string {
  return rawSymbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Maps standard timeframe to Binance interval string
 */
function toBinanceInterval(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '1d': '1d'
  };
  return map[tf.toLowerCase()] || '1h';
}

/**
 * Maps standard timeframe to Bybit interval string
 */
function toBybitInterval(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '1d': 'D'
  };
  return map[tf.toLowerCase()] || '60';
}

/**
 * Live Market Stream Manager
 * Manages resilient client-side real-time exchange streaming with automatic multi-provider fallback.
 */
class LiveMarketStreamManager {
  /**
   * Subscribes to real-time exchange candlestick ticks for the specified symbol & timeframe.
   * Returns an unsubscribe function that immediately terminates sockets, aborts polling, and clears timers.
   */
  public subscribe(options: LiveStreamSubscriptionOptions): () => void {
    const symbol = normalizeStreamSymbol(options.symbol);
    const timeframe = options.timeframe;
    const { onTick, onStatusChange } = options;

    let isDisposed = false;
    let currentWs: WebSocket | null = null;
    let pollIntervalId: any = null;
    let watchdogTimerId: any = null;
    let reconnectTimeoutId: any = null;

    let activeSource: 'binance' | 'bybit' | 'server' = 'binance';
    let failoverAttempt = 0;
    let lastTickTime = 0;
    let currentStatus: LiveStreamConnectionStatus = 'CONNECTING';

    const notifyStatus = (status: LiveStreamConnectionStatus, error?: string) => {
      if (isDisposed) return;
      currentStatus = status;
      if (onStatusChange) {
        onStatusChange({
          status,
          symbol,
          timeframe,
          source: activeSource,
          lastTickTime: lastTickTime > 0 ? lastTickTime : undefined,
          error
        });
      }
    };

    // Watchdog to detect quiet or dead streams
    const startWatchdog = () => {
      stopWatchdog();
      watchdogTimerId = setInterval(() => {
        if (isDisposed) return;
        if (currentStatus === 'LIVE' && lastTickTime > 0) {
          const silenceMs = Date.now() - lastTickTime;
          if (silenceMs > 18000 && silenceMs <= 35000) {
            notifyStatus('RECONNECTING', 'Stream quiet: verifying connection');
          } else if (silenceMs > 35000) {
            notifyStatus('STALE', 'Stream tick delayed > 35s');
            triggerReconnect(true);
          }
        }
      }, 5000);
    };

    const stopWatchdog = () => {
      if (watchdogTimerId) {
        clearInterval(watchdogTimerId);
        watchdogTimerId = null;
      }
    };

    const cleanupActiveConnection = () => {
      if (currentWs) {
        try {
          currentWs.onopen = null;
          currentWs.onmessage = null;
          currentWs.onerror = null;
          currentWs.onclose = null;
          currentWs.close();
        } catch (e) {
          // ignore
        }
        currentWs = null;
      }

      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }

      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
    };

    const triggerReconnect = (switchProvider = false) => {
      if (isDisposed) return;
      cleanupActiveConnection();

      if (switchProvider) {
        failoverAttempt++;
        if (failoverAttempt % 3 === 1) {
          activeSource = 'bybit';
        } else if (failoverAttempt % 3 === 2) {
          activeSource = 'server';
        } else {
          activeSource = 'binance';
        }
      }

      notifyStatus('RECONNECTING');

      const delay = Math.min(1000 * Math.pow(1.5, Math.min(failoverAttempt, 4)), 8000);
      reconnectTimeoutId = setTimeout(() => {
        if (!isDisposed) {
          connect();
        }
      }, delay);
    };

    // 1. Connect to Binance Kline Stream
    const connectBinance = () => {
      try {
        const binanceInterval = toBinanceInterval(timeframe);
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${binanceInterval}`;
        const ws = new WebSocket(wsUrl);
        currentWs = ws;

        ws.onopen = () => {
          if (isDisposed || ws !== currentWs) return;
          activeSource = 'binance';
          notifyStatus('LIVE');
          startWatchdog();
        };

        ws.onmessage = (event) => {
          if (isDisposed || ws !== currentWs) return;
          try {
            const data = JSON.parse(event.data);
            if (data && data.e === 'kline' && data.k) {
              const k = data.k;
              const openTimeMs = Number(k.t);
              const open = parseFloat(k.o);
              const high = parseFloat(k.h);
              const low = parseFloat(k.l);
              const close = parseFloat(k.c);
              const volume = parseFloat(k.v);
              const isClosed = Boolean(k.x);

              if (!isNaN(close) && !isNaN(openTimeMs)) {
                lastTickTime = Date.now();
                if (currentStatus !== 'LIVE') {
                  notifyStatus('LIVE');
                }

                onTick({
                  symbol,
                  timeframe,
                  time: Math.floor(openTimeMs / 1000),
                  timestampMs: openTimeMs,
                  open,
                  high,
                  low,
                  close,
                  volume: isNaN(volume) ? 0 : volume,
                  isClosed,
                  source: 'binance'
                });
              }
            }
          } catch (err) {
            console.warn('[LiveMarketStream] Error parsing Binance message:', err);
          }
        };

        ws.onerror = () => {
          if (isDisposed || ws !== currentWs) return;
          triggerReconnect(true);
        };

        ws.onclose = () => {
          if (isDisposed || ws !== currentWs) return;
          triggerReconnect(true);
        };
      } catch (err) {
        triggerReconnect(true);
      }
    };

    // 2. Connect to Bybit Kline Stream
    const connectBybit = () => {
      try {
        const bybitInterval = toBybitInterval(timeframe);
        const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');
        currentWs = ws;

        ws.onopen = () => {
          if (isDisposed || ws !== currentWs) return;
          activeSource = 'bybit';
          try {
            ws.send(JSON.stringify({
              op: 'subscribe',
              args: [`kline.${bybitInterval}.${symbol}`]
            }));
            notifyStatus('LIVE');
            startWatchdog();
          } catch (e) {
            triggerReconnect(true);
          }
        };

        ws.onmessage = (event) => {
          if (isDisposed || ws !== currentWs) return;
          try {
            const data = JSON.parse(event.data);
            if (data && data.topic && Array.isArray(data.data) && data.data.length > 0) {
              const k = data.data[0];
              const openTimeMs = Number(k.start);
              const open = parseFloat(k.open);
              const high = parseFloat(k.high);
              const low = parseFloat(k.low);
              const close = parseFloat(k.close);
              const volume = parseFloat(k.volume);
              const isClosed = Boolean(k.confirm);

              if (!isNaN(close) && !isNaN(openTimeMs)) {
                lastTickTime = Date.now();
                if (currentStatus !== 'LIVE') {
                  notifyStatus('LIVE');
                }

                onTick({
                  symbol,
                  timeframe,
                  time: Math.floor(openTimeMs / 1000),
                  timestampMs: openTimeMs,
                  open,
                  high,
                  low,
                  close,
                  volume: isNaN(volume) ? 0 : volume,
                  isClosed,
                  source: 'bybit'
                });
              }
            }
          } catch (err) {
            console.warn('[LiveMarketStream] Error parsing Bybit message:', err);
          }
        };

        ws.onerror = () => {
          if (isDisposed || ws !== currentWs) return;
          triggerReconnect(true);
        };

        ws.onclose = () => {
          if (isDisposed || ws !== currentWs) return;
          triggerReconnect(true);
        };
      } catch (err) {
        triggerReconnect(true);
      }
    };

    // 3. Fallback to Server Live REST Polling
    const connectServerPolling = () => {
      activeSource = 'server';
      notifyStatus('LIVE');

      const pollCandle = async () => {
        if (isDisposed) return;
        try {
          const apiBase = getApiBase();
          const res = await fetch(`${apiBase}/market/live-candle?symbol=${symbol}&interval=${timeframe}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (json && json.candle) {
            const c = json.candle;
            const openTimeMs = Number(c.timestamp || (c as any).time);
            const open = parseFloat(c.open);
            const high = parseFloat(c.high);
            const low = parseFloat(c.low);
            const close = parseFloat(c.close);
            const volume = parseFloat(c.volume || 0);

            if (!isNaN(close) && !isNaN(openTimeMs)) {
              lastTickTime = Date.now();
              onTick({
                symbol,
                timeframe,
                time: Math.floor(openTimeMs / 1000),
                timestampMs: openTimeMs,
                open,
                high,
                low,
                close,
                volume,
                isClosed: false,
                source: 'server'
              });
            }
          }
        } catch (e) {
          // If server polling fails, retry WebSocket
          triggerReconnect(true);
        }
      };

      // Run immediate poll, then every 2.5 seconds
      pollCandle();
      pollIntervalId = setInterval(pollCandle, 2500);
      startWatchdog();
    };

    const connect = () => {
      if (isDisposed) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        notifyStatus('OFFLINE', 'Browser offline');
        return;
      }

      notifyStatus(lastTickTime > 0 ? 'RECONNECTING' : 'CONNECTING');

      if (activeSource === 'binance') {
        connectBinance();
      } else if (activeSource === 'bybit') {
        connectBybit();
      } else {
        connectServerPolling();
      }
    };

    // Network online listener for mobile / web reconnect
    const handleOnline = () => {
      if (!isDisposed && currentStatus === 'OFFLINE') {
        triggerReconnect(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    // Begin connection
    connect();

    // Return clean unsubscribe
    return () => {
      isDisposed = true;
      stopWatchdog();
      cleanupActiveConnection();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }
}

export const liveMarketStreamManager = new LiveMarketStreamManager();
