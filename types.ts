
export interface TradeSetup {
  entryZone: string;
  targetPrice: string;
  stopLoss: string;
}

export interface TechnicalMetric {
  name: string;
  value: string;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface OnChainMetric {
  name: string;
  value: string;
  description: string;
  status: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface ChartPoint {
  day: string;
  price: number;
}

export interface AnalysisResult {
  currentPrice: string;
  timestamp: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL' | 'WAIT';
  confidenceScore: number; // 0 to 100
  summary: string;
  tradeSetup: TradeSetup;
  technicalAnalysis: TechnicalMetric[];
  onChainAnalysis: OnChainMetric[];
  reasoning: string[];
  projectedTrend: ChartPoint[]; // Hypothetical trend for visualization
}

export interface SourceLink {
  title: string;
  uri: string;
}

// Market Overview Types
export interface MarketCoinRaw {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
  quoteVolume: string; // To sort by liquidity
}

export interface MarketCoinAnalysis {
  symbol: string;
  price: string;
  change24h: string;
  signal: 'BUY' | 'SELL' | 'WAIT';
  reason: string;
}

export interface MarketOverviewResult {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number; // 0-100
  marketSummary: string;
  spotlight: MarketCoinAnalysis[]; // Top 3 recommended
  others: MarketCoinAnalysis[]; // Rest of the list
}

// Alert System Types
export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  createdAt: number;
}
