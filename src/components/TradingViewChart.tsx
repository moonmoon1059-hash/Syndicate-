import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  LineStyle,
  CrosshairMode,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  Time
} from 'lightweight-charts';
import { CryptoCandle, Signal, TimeFrame, CoinAnalysisReport } from '../types/crypto';
import { fetchCandles } from '../services/api';
import { liveMarketStreamManager, LiveCandleUpdate, LiveStreamStatus } from '../services/liveMarketStream';
import { formatPrice, formatPercent } from '../utils/formatters';
import { Maximize2, Minimize2, Eye, EyeOff, Layers, Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

interface Props {
  candles?: CryptoCandle[];
  signal?: Signal | null;
  report?: CoinAnalysisReport | null;
  symbol?: string;
  height?: number;
  selectedTimeframe?: TimeFrame;
  onTimeframeChange?: (tf: TimeFrame) => void;
  availableTimeframes?: TimeFrame[];
}

export const TradingViewChart: React.FC<Props> = ({
  candles: initialCandles,
  signal,
  report,
  symbol: propSymbol,
  height = 360,
  selectedTimeframe = '1h',
  onTimeframeChange,
  availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const markersPrimitiveRef = useRef<any>(null);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<any>(null);
  const lastFittedSymbolTfRef = useRef<string>('');

  const activeSignal: any = useMemo(() => {
    if (signal) return signal;
    if (report?.signal) return report.signal;
    if (report) {
      return {
        id: `search-${report.symbol}`,
        symbol: report.symbol,
        direction: (report.decision || 'WAIT') as any,
        timeframe: (report.timeframe || selectedTimeframe) as any,
        entryPrice: report.tradeability?.entryZone?.ideal || report.currentPrice,
        entryZoneLow: report.tradeability?.entryZone?.min,
        entryZoneHigh: report.tradeability?.entryZone?.max,
        stopLoss: report.tradeability?.stopLoss,
        targets: report.tradeability?.targets || [],
        qualityGrade: report.qualityGrade as any,
        smcStructureReport: report.smc as any,
        marketCycle: report.marketCycle as any,
        currentPrice: report.currentPrice
      };
    }
    return null;
  }, [signal, report, selectedTimeframe]);

  const activeSymbol = propSymbol || activeSignal?.symbol || report?.symbol || 'BTCUSDT';
  const cleanSymbol = activeSymbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Determine default timeframe matching signal execution timeframe (prioritizing 5M/15M)
  const defaultSignalTf: TimeFrame = useMemo(() => {
    const rawTf = (activeSignal?.executionTimeframe || activeSignal?.timeframe || selectedTimeframe || '').toLowerCase();
    if (['1m', '5m', '15m', '30m', '1h', '4h', '1d'].includes(rawTf)) {
      return rawTf as TimeFrame;
    }
    if (activeSignal && activeSignal.direction !== 'WAIT') {
      return '15m';
    }
    return '1h';
  }, [activeSignal?.executionTimeframe, activeSignal?.timeframe, selectedTimeframe, activeSignal?.direction]);

  const [activeTf, setActiveTf] = useState<TimeFrame>(defaultSignalTf);
  const [internalCandles, setInternalCandles] = useState<CryptoCandle[]>(initialCandles || []);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Live Market Stream State
  const [liveStatus, setLiveStatus] = useState<LiveStreamStatus>({
    status: 'CONNECTING',
    symbol: cleanSymbol,
    timeframe: activeTf
  });
  const [currentLivePrice, setCurrentLivePrice] = useState<number | null>(null);
  const [priceFlashDirection, setPriceFlashDirection] = useState<'up' | 'down' | null>(null);
  const [latestLiveCandle, setLatestLiveCandle] = useState<CryptoCandle | null>(null);

  // Layer Visibility Toggles
  const [showEMAs, setShowEMAs] = useState<boolean>(true);
  const [showLevels, setShowLevels] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showMarkers, setShowMarkers] = useState<boolean>(true);

  // Crosshair Hover Inspection Legend
  const [hoverData, setHoverData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    changePct: number;
  } | null>(null);

  // Fetch candles when active timeframe changes or if initial candles are empty
  const loadCandles = useCallback(async (tf: TimeFrame) => {
    if (!cleanSymbol) return;
    setIsLoading(true);
    try {
      const data = await fetchCandles(cleanSymbol, tf, 120);
      if (data && data.length > 0) {
        setInternalCandles(data);
      }
    } catch (err) {
      console.warn('[TradingViewChart] Failed to load candles:', err);
    } finally {
      setIsLoading(false);
    }
  }, [cleanSymbol]);

  // Synchronize with signal execution timeframe
  useEffect(() => {
    if (defaultSignalTf && defaultSignalTf !== activeTf) {
      setActiveTf(defaultSignalTf);
      loadCandles(defaultSignalTf);
    }
  }, [defaultSignalTf]);

  // Synchronize when initialCandles change or load if empty
  useEffect(() => {
    if (initialCandles && initialCandles.length > 0) {
      setInternalCandles(initialCandles);
    } else {
      loadCandles(activeTf);
    }
  }, [initialCandles, activeTf, loadCandles]);

  useEffect(() => {
    if (selectedTimeframe !== activeTf) {
      setActiveTf(selectedTimeframe);
    }
  }, [selectedTimeframe]);

  const handleTfClick = (tf: TimeFrame) => {
    setActiveTf(tf);
    if (onTimeframeChange) {
      onTimeframeChange(tf);
    }
    loadCandles(tf);
  };

  // Candle data freshness check (Requirement 3 & 13)
  const candleFreshness = useMemo(() => {
    if (!internalCandles || internalCandles.length === 0) {
      return { isFresh: false, reason: 'NO_DATA' };
    }
    const lastBar = internalCandles[internalCandles.length - 1];
    const rawTime = lastBar.timestamp || (lastBar as any).openTime || (lastBar as any).time;
    if (!rawTime) return { isFresh: false, reason: 'INVALID_TIMESTAMP' };
    const lastMs = rawTime > 1e11 ? rawTime : rawTime * 1000;
    const now = Date.now();
    const ageMs = now - lastMs;

    let maxAgeMs = 3 * 60 * 60 * 1000; // 1h default
    if (activeTf === '1m' || activeTf === '5m') maxAgeMs = 30 * 60 * 1000;
    else if (activeTf === '15m' || activeTf === '30m') maxAgeMs = 60 * 60 * 1000;
    else if (activeTf === '4h') maxAgeMs = 12 * 60 * 60 * 1000;
    else if (activeTf === '1d') maxAgeMs = 36 * 60 * 60 * 1000;

    if (ageMs > maxAgeMs) {
      return {
        isFresh: false,
        reason: 'STALE_DATA',
        ageMinutes: Math.round(ageMs / 60000)
      };
    }
    return { isFresh: true };
  }, [internalCandles, activeTf]);

  // Signal Actionability Status (Requirement 8: show WAIT / INVALIDATED if stale or invalid)
  const signalActionability = useMemo(() => {
    if (!activeSignal) return null;
    if (activeSignal.direction === 'WAIT') {
      return { isActionable: false, label: 'WAIT FOR SETUP', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    }
    if (activeSignal.status === 'INVALIDATED' || activeSignal.status === 'EXPIRED') {
      return { isActionable: false, label: 'INVALIDATED', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    }
    if (activeSignal.entryStatus === 'MISSED') {
      return { isActionable: false, label: 'ENTRY MISSED', badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40' };
    }
    if (activeSignal.entryStatus === 'INVALIDATED' || activeSignal.entryStatus === 'EXPIRED') {
      return { isActionable: false, label: 'INVALIDATED', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    }
    const curPrice = currentLivePrice ?? (internalCandles.length > 0 ? internalCandles[internalCandles.length - 1].close : null);
    if (curPrice && activeSignal.stopLoss > 0) {
      if (activeSignal.direction === 'LONG' && curPrice <= activeSignal.stopLoss) {
        return { isActionable: false, label: 'SL BREACHED', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      }
      if (activeSignal.direction === 'SHORT' && curPrice >= activeSignal.stopLoss) {
        return { isActionable: false, label: 'SL BREACHED', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      }
    }
    return {
      isActionable: true,
      label: `${activeSignal.direction} • ${activeSignal.qualityGrade || 'A'}`,
      badgeClass: activeSignal.direction === 'LONG'
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    };
  }, [activeSignal, currentLivePrice, internalCandles]);

  // Convert raw candles to lightweight-charts format
  // Strict rule: ascending timestamps, no duplicates, unix seconds
  const formattedCandleData = useMemo(() => {
    if (!internalCandles || internalCandles.length === 0) return [];

    const map = new Map<number, { time: Time; open: number; high: number; low: number; close: number; volume: number }>();

    for (const c of internalCandles) {
      const rawTime = c.timestamp || (c as any).openTime || (c as any).time;
      if (!rawTime) continue;
      // Convert ms to seconds
      const sec = Math.floor(rawTime > 1e11 ? rawTime / 1000 : rawTime) as Time;
      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);
      const volume = Number(c.volume || 0);

      if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
        map.set(sec as number, { time: sec, open, high, low, close, volume });
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => (a.time as number) - (b.time as number));
    return sorted;
  }, [internalCandles]);

  // Compute EMAs
  const ema20Data = useMemo(() => {
    if (formattedCandleData.length < 20) return [];
    const k = 2 / (20 + 1);
    let ema = formattedCandleData.slice(0, 20).reduce((acc, val) => acc + val.close, 0) / 20;
    const res = [{ time: formattedCandleData[19].time, value: Number(ema.toFixed(4)) }];
    for (let i = 20; i < formattedCandleData.length; i++) {
      ema = formattedCandleData[i].close * k + ema * (1 - k);
      res.push({ time: formattedCandleData[i].time, value: Number(ema.toFixed(4)) });
    }
    return res;
  }, [formattedCandleData]);

  const ema50Data = useMemo(() => {
    if (formattedCandleData.length < 50) return [];
    const k = 2 / (50 + 1);
    let ema = formattedCandleData.slice(0, 50).reduce((acc, val) => acc + val.close, 0) / 50;
    const res = [{ time: formattedCandleData[49].time, value: Number(ema.toFixed(4)) }];
    for (let i = 50; i < formattedCandleData.length; i++) {
      ema = formattedCandleData[i].close * k + ema * (1 - k);
      res.push({ time: formattedCandleData[i].time, value: Number(ema.toFixed(4)) });
    }
    return res;
  }, [formattedCandleData]);

  const ema200Data = useMemo(() => {
    if (formattedCandleData.length < 200) return [];
    const k = 2 / (200 + 1);
    let ema = formattedCandleData.slice(0, 200).reduce((acc, val) => acc + val.close, 0) / 200;
    const res = [{ time: formattedCandleData[199].time, value: Number(ema.toFixed(4)) }];
    for (let i = 200; i < formattedCandleData.length; i++) {
      ema = formattedCandleData[i].close * k + ema * (1 - k);
      res.push({ time: formattedCandleData[i].time, value: Number(ema.toFixed(4)) });
    }
    return res;
  }, [formattedCandleData]);

  // Volume data with matched colors
  const volumeData = useMemo(() => {
    return formattedCandleData.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
    }));
  }, [formattedCandleData]);

  // Primary chart setup effect
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartHeight = isFullscreen ? window.innerHeight - 110 : height;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 600,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.35)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.35)' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(56, 189, 248, 0.5)',
          width: 1,
          style: LineStyle.Dashed
        },
        horzLine: {
          color: 'rgba(56, 189, 248, 0.5)',
          width: 1,
          style: LineStyle.Dashed
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22
        }
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });

    chartInstanceRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceLineVisible: true,
      lastValueVisible: true
    });
    candleSeriesRef.current = candleSeries;

    // Volume Series (Overlay at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: '' // overlay scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });
    volumeSeriesRef.current = volumeSeries;

    // EMA Series
    const ema20 = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      title: 'EMA 20',
      priceLineVisible: false
    });
    ema20SeriesRef.current = ema20;

    const ema50 = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      title: 'EMA 50',
      priceLineVisible: false
    });
    ema50SeriesRef.current = ema50;

    const ema200 = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      title: 'EMA 200',
      priceLineVisible: false
    });
    ema200SeriesRef.current = ema200;

    // Crosshair subscription for legend updates
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }

      const candleVal = param.seriesData.get(candleSeries) as any;
      const volVal = param.seriesData.get(volumeSeries) as any;

      if (candleVal && typeof candleVal.open === 'number') {
        const dateStr = typeof param.time === 'number'
          ? new Date(param.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : String(param.time);

        const change = ((candleVal.close - candleVal.open) / candleVal.open) * 100;

        setHoverData({
          time: dateStr,
          open: candleVal.open,
          high: candleVal.high,
          low: candleVal.low,
          close: candleVal.close,
          volume: volVal?.value || 0,
          changePct: change
        });
      }
    });

    // ResizeObserver for responsive width
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      const newWidth = entry.contentRect.width;
      if (newWidth > 0 && chartInstanceRef.current) {
        const curHeight = isFullscreen ? window.innerHeight - 110 : height;
        chartInstanceRef.current.applyOptions({ width: newWidth, height: curHeight });
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (livePriceLineRef.current && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
        } catch (e) {
          // ignore
        }
        livePriceLineRef.current = null;
      }
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema200SeriesRef.current = null;
    };
  }, [height, isFullscreen]);

  // Update Series Data
  useEffect(() => {
    if (!candleSeriesRef.current || formattedCandleData.length === 0) return;

    candleSeriesRef.current.setData(formattedCandleData as any);

    if (volumeSeriesRef.current) {
      if (showVolume) {
        volumeSeriesRef.current.setData(volumeData as any);
      } else {
        volumeSeriesRef.current.setData([]);
      }
    }

    if (ema20SeriesRef.current) {
      ema20SeriesRef.current.setData(showEMAs ? ema20Data as any : []);
    }
    if (ema50SeriesRef.current) {
      ema50SeriesRef.current.setData(showEMAs ? ema50Data as any : []);
    }
    if (ema200SeriesRef.current) {
      ema200SeriesRef.current.setData(showEMAs ? ema200Data as any : []);
    }

    // Auto-fit content once per symbol/timeframe when first loaded
    const key = `${cleanSymbol}_${activeTf}`;
    if (chartInstanceRef.current && lastFittedSymbolTfRef.current !== key) {
      chartInstanceRef.current.timeScale().fitContent();
      lastFittedSymbolTfRef.current = key;
    }
  }, [formattedCandleData, volumeData, ema20Data, ema50Data, ema200Data, showVolume, showEMAs, cleanSymbol, activeTf]);

  // Update Price Lines (Entry, SL, TP1, TP2, TP3)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    // Clear existing price lines
    for (const pl of priceLinesRef.current) {
      try {
        candleSeries.removePriceLine(pl);
      } catch (e) {
        // ignore
      }
    }
    priceLinesRef.current = [];

    if (!showLevels || !activeSignal) return;

    const lines: any[] = [];

    // Valid Entry Price & Entry Zone
    if (activeSignal.entryPrice && activeSignal.entryPrice > 0) {
      const pl = candleSeries.createPriceLine({
        price: activeSignal.entryPrice,
        color: '#38bdf8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `ENTRY: ${formatPrice(activeSignal.entryPrice)}`
      });
      lines.push(pl);
    }

    if (activeSignal.entryZoneLow && activeSignal.entryZoneLow > 0 && Math.abs(activeSignal.entryZoneLow - (activeSignal.entryPrice || 0)) > 0.00001) {
      const pl = candleSeries.createPriceLine({
        price: activeSignal.entryZoneLow,
        color: 'rgba(56, 189, 248, 0.75)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `ZONE LOW: ${formatPrice(activeSignal.entryZoneLow)}`
      });
      lines.push(pl);
    }

    if (activeSignal.entryZoneHigh && activeSignal.entryZoneHigh > 0 && Math.abs(activeSignal.entryZoneHigh - (activeSignal.entryPrice || 0)) > 0.00001) {
      const pl = candleSeries.createPriceLine({
        price: activeSignal.entryZoneHigh,
        color: 'rgba(56, 189, 248, 0.75)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `ZONE HIGH: ${formatPrice(activeSignal.entryZoneHigh)}`
      });
      lines.push(pl);
    }

    // Structural Stop Loss
    if (activeSignal.stopLoss && activeSignal.stopLoss > 0) {
      const pl = candleSeries.createPriceLine({
        price: activeSignal.stopLoss,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `STRUCTURAL SL: ${formatPrice(activeSignal.stopLoss)}`
      });
      lines.push(pl);
    }

    // Targets: Full dynamic ladder TP1..TP7+ (strictly data-backed, never fabricated)
    const targets = (activeSignal.targets || []).filter(t => t.price && t.price > 0 && t.status !== 'INVALIDATED');
    const colors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#38bdf8', '#818cf8', '#c084fc'];

    targets.forEach((t, idx) => {
      if (t.price && t.price > 0) {
        const pctStr = typeof t.percentage === 'number' && !isNaN(t.percentage)
          ? ` (+${t.percentage.toFixed(1)}%)`
          : '';
        const pl = candleSeries.createPriceLine({
          price: t.price,
          color: colors[idx % colors.length],
          lineWidth: 1.5,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${t.label || `TP${idx + 1}`}: ${formatPrice(t.price)}${pctStr}`
        });
        lines.push(pl);
      }
    });

    priceLinesRef.current = lines;
  }, [activeSignal, showLevels, formattedCandleData]);

  // Real-Time Live Market Data Stream Subscription
  useEffect(() => {
    if (!cleanSymbol || !activeTf) return;

    let isMounted = true;

    const unsubscribe = liveMarketStreamManager.subscribe({
      symbol: cleanSymbol,
      timeframe: activeTf,
      onTick: (update: LiveCandleUpdate) => {
        if (!isMounted) return;

        const { time, open, high, low, close, volume, timestampMs } = update;

        const prevPrice = lastPriceRef.current;
        if (prevPrice !== null && close !== prevPrice) {
          setPriceFlashDirection(close > prevPrice ? 'up' : 'down');
          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = setTimeout(() => {
            if (isMounted) setPriceFlashDirection(null);
          }, 600);
        }
        lastPriceRef.current = close;
        setCurrentLivePrice(close);

        // 1. Real-time Candlestick update in Lightweight Charts
        if (candleSeriesRef.current) {
          try {
            candleSeriesRef.current.update({
              time: time as Time,
              open,
              high,
              low,
              close
            });
          } catch (e) {
            // ignore
          }
        }

        // 2. Real-time Volume update
        if (volumeSeriesRef.current && showVolume) {
          try {
            volumeSeriesRef.current.update({
              time: time as Time,
              value: volume,
              color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
            });
          } catch (e) {
            // ignore
          }
        }

        // 3. Update or Create LIVE Price Line
        if (candleSeriesRef.current) {
          const isUp = prevPrice !== null ? close >= prevPrice : close >= open;
          const lineColor = isUp ? '#10b981' : '#f43f5e';
          const lineTitle = `LIVE: ${formatPrice(close)}`;

          if (!livePriceLineRef.current) {
            try {
              livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
                price: close,
                color: lineColor,
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: lineTitle
              });
            } catch (e) {
              // ignore
            }
          } else {
            try {
              livePriceLineRef.current.applyOptions({
                price: close,
                color: lineColor,
                title: lineTitle
              });
            } catch (e) {
              // ignore
            }
          }
        }

        // 4. Update latest live candle for OHLCV legend
        setLatestLiveCandle({
          timestamp: timestampMs,
          open,
          high,
          low,
          close,
          volume
        });
      },
      onStatusChange: (status: LiveStreamStatus) => {
        if (!isMounted) return;
        setLiveStatus(status);
      }
    });

    return () => {
      isMounted = false;
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      unsubscribe();
      if (livePriceLineRef.current && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
        } catch (e) {
          // ignore
        }
        livePriceLineRef.current = null;
      }
    };
  }, [cleanSymbol, activeTf, showVolume]);

  // Update Markers (LONG/SHORT, BOS, CHoCH, Liquidity Sweeps, Wyckoff)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries || formattedCandleData.length === 0) return;

    if (!showMarkers || !activeSignal) {
      if (markersPrimitiveRef.current) {
        try {
          markersPrimitiveRef.current.setMarkers([]);
        } catch (e) {
          // ignore
        }
      }
      return;
    }

    const markers: any[] = [];
    const len = formattedCandleData.length;
    const lastBar = formattedCandleData[len - 1];
    const prevBar = len > 5 ? formattedCandleData[len - 4] : lastBar;
    const isLong = activeSignal.direction === 'LONG';

    // 1. Primary Entry Trigger Marker
    if (lastBar) {
      markers.push({
        time: lastBar.time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#10b981' : '#ef4444',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: `${activeSignal.direction} (${activeSignal.qualityGrade || 'A'})`
      });
    }

    // 2. BOS / CHoCH Marker
    const smc = activeSignal.smcStructureReport || (activeSignal.institutionalIntelligence as any)?.smc || (activeSignal as any).smc;
    const structureType = smc?.structureType || (activeSignal as any).structureType;
    if (structureType && structureType !== 'NONE' && structureType !== 'UNKNOWN' && prevBar) {
      const isBOS = String(structureType).toUpperCase().includes('BOS');
      markers.push({
        time: prevBar.time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isBOS ? '#38bdf8' : '#a855f7',
        shape: isBOS ? 'circle' : 'square',
        text: isBOS ? 'BOS' : 'CHoCH'
      });
    }

    // 3. Liquidity Sweep Marker
    const hasSweep =
      (Array.isArray(smc?.liquiditySweeps) && smc.liquiditySweeps.some((s: any) => s.status === 'SWEPT')) ||
      smc?.sweepDetected === true ||
      Boolean((activeSignal as any).liquiditySweepDetected) ||
      Boolean((activeSignal as any).liquidityReason);
    if (hasSweep && len > 8) {
      const sweepBar = formattedCandleData[len - 7];
      markers.push({
        time: sweepBar.time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: '#f59e0b',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: 'SWEEP'
      });
    }

    // 4. Wyckoff Spring / UTAD Marker
    const wyckoff = activeSignal.marketCycle as any;
    if (wyckoff && len > 12) {
      const wyckoffBar = formattedCandleData[len - 10];
      const hasSpring =
        wyckoff.wyckoffPhase === 'PHASE_C' ||
        wyckoff.activeWyckoffEvent?.event === 'SPRING' ||
        wyckoff.wyckoffSpring?.detected === true ||
        wyckoff.wyckoffEvents?.accumulation?.SPRING?.detected === true ||
        (Array.isArray(wyckoff.wyckoffEvents) && wyckoff.wyckoffEvents.includes('SPRING')) ||
        (typeof wyckoff.stage === 'string' && wyckoff.stage.includes('SPRING'));

      const hasUtad =
        wyckoff.activeWyckoffEvent?.event === 'UTAD' ||
        wyckoff.wyckoffUtad?.detected === true ||
        wyckoff.wyckoffEvents?.distribution?.UTAD?.detected === true ||
        (Array.isArray(wyckoff.wyckoffEvents) && wyckoff.wyckoffEvents.includes('UTAD')) ||
        (typeof wyckoff.stage === 'string' && wyckoff.stage.includes('UTAD'));

      if (hasSpring) {
        markers.push({
          time: wyckoffBar.time,
          position: 'belowBar',
          color: '#ec4899',
          shape: 'arrowUp',
          text: 'SPRING'
        });
      } else if (hasUtad) {
        markers.push({
          time: wyckoffBar.time,
          position: 'aboveBar',
          color: '#f43f5e',
          shape: 'arrowDown',
          text: 'UTAD'
        });
      }
    }

    // Sort markers by time ascending
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    try {
      if (!markersPrimitiveRef.current) {
        markersPrimitiveRef.current = createSeriesMarkers(candleSeries, markers);
      } else {
        markersPrimitiveRef.current.setMarkers(markers);
      }
    } catch (err) {
      console.warn('[TradingViewChart] Failed to set markers:', err);
    }
  }, [activeSignal, formattedCandleData, showMarkers]);

  const lastCandle = formattedCandleData[formattedCandleData.length - 1];

  return (
    <div
      className={`relative bg-slate-950/90 rounded-2xl border border-slate-800/90 overflow-hidden font-mono ${
        isFullscreen ? 'fixed inset-0 z-50 p-4 bg-slate-950 flex flex-col justify-between' : ''
      }`}
    >
      {/* Top Header & Timeframe Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/80 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-100">{cleanSymbol}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
              {activeTf.toUpperCase()}
            </span>
          </div>

          {signalActionability && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${signalActionability.badgeClass}`}
            >
              {signalActionability.label}
            </span>
          )}

          {/* Live Price Display & Flash */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800">
            <span
              className={`text-xs font-mono font-black transition-all duration-300 ${
                priceFlashDirection === 'up'
                  ? 'text-emerald-400 scale-105'
                  : priceFlashDirection === 'down'
                  ? 'text-rose-400 scale-105'
                  : 'text-slate-100'
              }`}
            >
              {currentLivePrice && liveStatus.status !== 'OFFLINE'
                ? formatPrice(currentLivePrice)
                : candleFreshness.isFresh && lastCandle
                ? formatPrice(lastCandle.close)
                : '---'}
            </span>

            {/* Live Connection Status Badge */}
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-colors ${
                !candleFreshness.isFresh || liveStatus.status === 'STALE'
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                  : liveStatus.status === 'OFFLINE'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : liveStatus.status === 'LIVE'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : liveStatus.status === 'CONNECTING'
                  ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 animate-pulse'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
              }`}
              title={`Provider: ${liveStatus.source || 'Binance Futures'} | Status: ${!candleFreshness.isFresh ? 'STALE_DATA' : liveStatus.status}${
                liveStatus.error ? ` | Error: ${liveStatus.error}` : ''
              }`}
            >
              {candleFreshness.isFresh && liveStatus.status === 'LIVE' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              )}
              {(!candleFreshness.isFresh || liveStatus.status === 'STALE') && <AlertTriangle className="w-2.5 h-2.5" />}
              {liveStatus.status === 'OFFLINE' && <WifiOff className="w-2.5 h-2.5" />}
              {!candleFreshness.isFresh ? 'STALE DATA' : liveStatus.status}
            </span>
          </div>

          {isLoading && (
            <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin ml-1" />
          )}
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/80">
          {availableTimeframes.map((tf: TimeFrame) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTfClick(tf)}
              className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                activeTf === tf
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Layer Controls & Fullscreen */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEMAs(!showEMAs)}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              showEMAs
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle EMA 20/50/200"
          >
            EMA
          </button>

          <button
            type="button"
            onClick={() => setShowLevels(!showLevels)}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              showLevels
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle Entry, SL, TP Levels"
          >
            LEVELS
          </button>

          <button
            type="button"
            onClick={() => setShowMarkers(!showMarkers)}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              showMarkers
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle BOS/CHoCH/Spring Markers"
          >
            SMC
          </button>

          <button
            type="button"
            onClick={() => setShowVolume(!showVolume)}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              showVolume
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle Volume Histogram"
          >
            VOL
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors ml-1"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Real-time OHLCV Inspection Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 bg-slate-950/80 text-[10px] text-slate-400 border-b border-slate-800/40">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {hoverData ? (
            <>
              <span className="text-slate-300 font-semibold">{hoverData.time}</span>
              <span>
                O: <strong className="text-slate-200">{formatPrice(hoverData.open)}</strong>
              </span>
              <span>
                H: <strong className="text-slate-200">{formatPrice(hoverData.high)}</strong>
              </span>
              <span>
                L: <strong className="text-slate-200">{formatPrice(hoverData.low)}</strong>
              </span>
              <span>
                C: <strong className="text-slate-200">{formatPrice(hoverData.close)}</strong>
              </span>
              <span>
                V: <strong className="text-slate-200">{Math.round(hoverData.volume).toLocaleString()}</strong>
              </span>
              <span className={hoverData.changePct >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {formatPercent(hoverData.changePct)}
              </span>
            </>
          ) : (latestLiveCandle || lastCandle) ? (
            (() => {
              const activeCandle = latestLiveCandle || lastCandle;
              const openVal = activeCandle.open;
              const closeVal = currentLivePrice ?? activeCandle.close;
              const highVal = Math.max(activeCandle.high, closeVal);
              const lowVal = Math.min(activeCandle.low, closeVal);
              const changePct = openVal > 0 ? ((closeVal - openVal) / openVal) * 100 : 0;
              const isLiveActive = liveStatus.status === 'LIVE';

              return (
                <>
                  <span className="flex items-center gap-1 font-bold text-slate-300">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isLiveActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    {isLiveActive ? 'LIVE BAR:' : 'LATEST BAR:'}
                  </span>
                  <span>
                    O: <strong className="text-slate-300">{formatPrice(openVal)}</strong>
                  </span>
                  <span>
                    H: <strong className="text-slate-300">{formatPrice(highVal)}</strong>
                  </span>
                  <span>
                    L: <strong className="text-slate-300">{formatPrice(lowVal)}</strong>
                  </span>
                  <span>
                    C: <strong className={closeVal >= openVal ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{formatPrice(closeVal)}</strong>
                  </span>
                  <span>
                    V: <strong className="text-slate-300">{Math.round(activeCandle.volume).toLocaleString()}</strong>
                  </span>
                  <span className={changePct >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {formatPercent(changePct)}
                  </span>
                </>
              );
            })()
          ) : (
            <span className="text-slate-500">Connecting to real-time market stream...</span>
          )}
        </div>

        {/* Live Status Warning / Source info on right of legend */}
        <div className="flex items-center gap-2 text-[9px]">
          {liveStatus.status === 'STALE' && (
            <span className="text-orange-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> STALE FEED (RECONNECTING)
            </span>
          )}
          {liveStatus.status === 'OFFLINE' && (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> FEED OFFLINE
            </span>
          )}
          {liveStatus.source && (
            <span className="text-slate-500 uppercase tracking-wider font-mono">
              {liveStatus.source}
            </span>
          )}
        </div>
      </div>

      {/* Stale / Unavailable Feed Warning Banner */}
      {!candleFreshness.isFresh && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-300 font-bold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            STALE FEED / UNAVAILABLE ({candleFreshness.reason}{candleFreshness.ageMinutes ? ` • ${candleFreshness.ageMinutes}m old` : ''}) - Real-time candle updates paused
          </span>
          <span className="text-[9px] text-amber-400/70 font-mono">BINANCE FUTURES</span>
        </div>
      )}

      {/* Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        className="w-full relative flex-1 min-h-[220px]"
        style={{ height: isFullscreen ? 'calc(100vh - 120px)' : `${height}px` }}
      />

      {/* Bottom Setup Indicators Bar */}
      {activeSignal && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/80 border-t border-slate-800/80 text-[10px]">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Entry: <strong className="text-sky-300">{formatPrice(activeSignal.entryPrice)}</strong>
            </span>
            <span className="text-slate-400">
              SL: <strong className="text-rose-400">{formatPrice(activeSignal.stopLoss)}</strong>
            </span>
            {activeSignal.tp1 && (
              <span className="text-slate-400">
                TP1: <strong className="text-emerald-400">{formatPrice(activeSignal.tp1)}</strong>
              </span>
            )}
            {activeSignal.riskRewardRatio && (
              <span className="text-slate-400">
                R:R: <strong className="text-amber-300">1:{activeSignal.riskRewardRatio.toFixed(1)}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeSignal.entryStatus && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-bold">
                {activeSignal.entryStatus.replace(/_/g, ' ')}
              </span>
            )}
            {activeSignal.expectedMoveClass && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 text-[9px] border border-cyan-800/50 font-bold">
                {activeSignal.expectedMoveClass.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
