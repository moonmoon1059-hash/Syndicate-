import React from 'react';
import { CryptoCandle, Signal, TimeFrame, CoinAnalysisReport } from '../types/crypto';
import { TradingViewChart } from './TradingViewChart';

interface Props {
  candles?: CryptoCandle[];
  signal?: Signal | null;
  report?: CoinAnalysisReport | null;
  height?: number;
  selectedTimeframe?: TimeFrame;
  onTimeframeChange?: (tf: TimeFrame) => void;
  availableTimeframes?: TimeFrame[];
}

export const CandlestickChart: React.FC<Props> = ({
  candles = [],
  signal,
  report,
  height = 340,
  selectedTimeframe = '1h',
  onTimeframeChange,
  availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
}) => {
  return (
    <TradingViewChart
      candles={candles}
      signal={signal}
      report={report}
      height={height}
      selectedTimeframe={selectedTimeframe}
      onTimeframeChange={onTimeframeChange}
      availableTimeframes={availableTimeframes}
    />
  );
};
