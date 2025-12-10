
import React, { useState, useCallback, useEffect } from 'react';
import { analyzeCrypto, analyzeMarketOverview, getBatchPrices } from './services/geminiService';
import { AnalysisResult, SourceLink, MarketOverviewResult, PriceAlert } from './types';
import SignalGauge from './components/SignalGauge';
import TradeCard from './components/TradeCard';
import AnalysisDetails from './components/AnalysisDetails';
import ChartProjection from './components/ChartProjection';
import AlertsModal from './components/AlertsModal';
import { Bitcoin, RefreshCw, AlertTriangle, ExternalLink, Loader2, Search, Cpu, Globe, TrendingUp, TrendingDown, Minus, Bell, X } from 'lucide-react';

const SUPPORTED_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: <Bitcoin size={20} /> },
  { symbol: 'ICP', name: 'Internet Computer', icon: <Cpu size={20} /> },
];

type TabType = 'DETAIL' | 'MARKET';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('DETAIL');
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  
  // State for Detail Analysis
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [sources, setSources] = useState<SourceLink[]>([]);
  
  // State for Market Overview
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketData, setMarketData] = useState<MarketOverviewResult | null>(null);

  const [error, setError] = useState<string | null>(null);

  // --- ALERTS STATE ---
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [triggeredAlert, setTriggeredAlert] = useState<PriceAlert | null>(null);

  const handleAnalyze = useCallback(async (symbolOverride?: string) => {
    const symbolToAnalyze = symbolOverride || selectedSymbol;
    setLoading(true);
    setError(null);
    if (symbolOverride && symbolOverride !== selectedSymbol) {
      setData(null);
    }
    
    try {
      const { data: result, sources: resultSources } = await analyzeCrypto(symbolToAnalyze);
      setData(result);
      setSources(resultSources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol]);

  const handleMarketAnalyze = useCallback(async () => {
    setMarketLoading(true);
    setError(null);
    try {
       const result = await analyzeMarketOverview();
       setMarketData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lấy dữ liệu thị trường');
    } finally {
      setMarketLoading(false);
    }
  }, []);

  // --- ALERT MONITORING LOGIC ---
  useEffect(() => {
    if (alerts.length === 0) return;

    const checkAlerts = async () => {
      // Get unique symbols to check
      const symbolsToCheck = Array.from(new Set(alerts.map(a => a.symbol)));
      // Fetch batch prices
      const prices = await getBatchPrices(symbolsToCheck);
      
      const nextAlerts = [...alerts];
      let hasChange = false;

      // Check each alert
      for (let i = 0; i < nextAlerts.length; i++) {
        const alert = nextAlerts[i];
        const currentPrice = prices[alert.symbol];
        
        if (currentPrice !== undefined) {
          let triggered = false;
          if (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) {
            triggered = true;
          } else if (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice) {
            triggered = true;
          }

          if (triggered) {
             setTriggeredAlert({...alert, targetPrice: currentPrice}); // Show actual price in toast
             nextAlerts.splice(i, 1); // Remove alert after trigger (One-time alert)
             i--; // Adjust index
             hasChange = true;
          }
        }
      }

      if (hasChange) {
        setAlerts(nextAlerts);
      }
    };

    const interval = setInterval(checkAlerts, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [alerts]);

  const addAlert = (symbol: string, targetPrice: number, condition: 'ABOVE' | 'BELOW') => {
    const newAlert: PriceAlert = {
      id: Date.now().toString(),
      symbol,
      targetPrice,
      condition,
      createdAt: Date.now()
    };
    setAlerts(prev => [...prev, newAlert]);
  };

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const onSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    setData(null); 
    setSources([]);
    setError(null);
    if (activeTab !== 'DETAIL') setActiveTab('DETAIL');
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setError(null);
    if (tab === 'MARKET' && !marketData) {
      handleMarketAnalyze();
    }
  };

  // Helper render for Market Signal Icon
  const SignalIcon = ({ signal }: { signal: string }) => {
     if (signal === 'BUY') return <span className="flex items-center text-green-400 font-bold bg-green-500/10 px-2 py-1 rounded text-xs"><TrendingUp size={14} className="mr-1"/> BUY</span>;
     if (signal === 'SELL') return <span className="flex items-center text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded text-xs"><TrendingDown size={14} className="mr-1"/> SELL</span>;
     return <span className="flex items-center text-yellow-400 font-bold bg-yellow-500/10 px-2 py-1 rounded text-xs"><Minus size={14} className="mr-1"/> WAIT</span>;
  };

  // Initial prompt (Only show if no data in ANY tab)
  if (!data && !marketData && !loading && !marketLoading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         <AlertsModal 
          isOpen={isAlertModalOpen} 
          onClose={() => setIsAlertModalOpen(false)} 
          alerts={alerts}
          onAddAlert={addAlert}
          onRemoveAlert={removeAlert}
        />
        {/* Header Alert Button (Fixed Position for Initial Screen) */}
        <button 
             onClick={() => setIsAlertModalOpen(true)}
             className="absolute top-4 right-4 p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors border border-white/5"
        >
             <Bell size={24} />
             {alerts.length > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></span>}
        </button>

        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex justify-center mb-6">
             <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center animate-pulse border border-blue-500/20">
                {selectedSymbol === 'BTC' ? <Bitcoin size={64} className="text-orange-500" /> : <Cpu size={64} className="text-purple-500" />}
             </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Crypto AI Analyst</h1>
            <p className="text-slate-400">
              Sử dụng AI kết hợp dữ liệu Real-time từ Binance & On-chain để đưa ra tín hiệu giao dịch chuẩn xác.
            </p>
          </div>
          
          <div className="flex justify-center gap-4">
             {SUPPORTED_COINS.map(coin => (
               <button
                  key={coin.symbol}
                  onClick={() => onSymbolChange(coin.symbol)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    selectedSymbol === coin.symbol 
                    ? 'bg-slate-700 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                    : 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700'
                  }`}
               >
                 {coin.icon}
                 <span className="font-bold">{coin.symbol}</span>
               </button>
             ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleAnalyze()}
              className="py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] flex items-center justify-center gap-2 group"
            >
              <Search className="group-hover:scale-110 transition-transform" />
              PHÂN TÍCH {selectedSymbol}
            </button>
            <button
              onClick={() => switchTab('MARKET')}
              className="py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2 group"
            >
              <Globe className="group-hover:scale-110 transition-transform" />
              TỔNG QUAN TOP 30
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 pb-12 relative">
      <AlertsModal 
          isOpen={isAlertModalOpen} 
          onClose={() => setIsAlertModalOpen(false)} 
          alerts={alerts}
          onAddAlert={addAlert}
          onRemoveAlert={removeAlert}
      />

      {/* Triggered Alert Toast */}
      {triggeredAlert && (
         <div className="fixed bottom-6 right-6 z-[100] max-w-sm w-full bg-slate-800 border border-yellow-500/50 rounded-xl shadow-2xl p-4 animate-in slide-in-from-right duration-500">
            <div className="flex justify-between items-start">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-yellow-500/10 rounded-full text-yellow-500">
                    <Bell size={24} className="animate-bounce" />
                 </div>
                 <div>
                    <h4 className="font-bold text-white text-lg">Cảnh Báo Giá!</h4>
                    <p className="text-slate-300">
                       <span className="font-bold text-white">{triggeredAlert.symbol}</span> đã đạt mức giá <span className="font-mono text-yellow-400 font-bold">${triggeredAlert.targetPrice.toLocaleString()}</span>
                    </p>
                 </div>
               </div>
               <button onClick={() => setTriggeredAlert(null)} className="text-slate-500 hover:text-white">
                 <X size={20} />
               </button>
            </div>
         </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 text-white">
               {selectedSymbol === 'BTC' ? <Bitcoin className="text-orange-500" /> : <Cpu className="text-purple-500" />}
               <span className="font-bold text-lg tracking-tight hidden sm:block">Crypto Analyst AI</span>
             </div>
             
             <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block"></div>
             
             {/* Tab Switcher */}
             <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                    onClick={() => switchTab('DETAIL')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                      activeTab === 'DETAIL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <Search size={14}/> Chi Tiết
                </button>
                <button
                    onClick={() => switchTab('MARKET')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                      activeTab === 'MARKET' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <Globe size={14}/> Thị Trường
                </button>
             </div>
          </div>

          <div className="flex items-center gap-2">
             {activeTab === 'DETAIL' && (
                <div className="hidden md:flex bg-slate-800 rounded-lg p-1 mr-2">
                  {SUPPORTED_COINS.map(coin => (
                    <button
                      key={coin.symbol}
                      onClick={() => onSymbolChange(coin.symbol)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        selectedSymbol === coin.symbol
                        ? 'bg-slate-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {coin.symbol}
                    </button>
                  ))}
                </div>
             )}
            
            <button
               onClick={() => setIsAlertModalOpen(true)}
               className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors relative"
            >
               <Bell size={20} />
               {alerts.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>

            <button
              onClick={() => activeTab === 'DETAIL' ? handleAnalyze() : handleMarketAnalyze()}
              disabled={loading || marketLoading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {loading || marketLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {(loading || marketLoading) ? 'Đang tải...' : 'Cập nhật'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex flex-col md:flex-row items-center gap-3 text-center md:text-left animate-in fade-in slide-in-from-top-4">
            <AlertTriangle className="shrink-0" />
            <span className="text-sm font-medium break-words w-full">{error}</span>
            <button 
              onClick={() => activeTab === 'DETAIL' ? handleAnalyze() : handleMarketAnalyze()}
              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs uppercase font-bold tracking-wider shrink-0 transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* LOADING STATES */}
        {((loading && !data) || (marketLoading && !marketData)) && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
             <Loader2 className="animate-spin text-blue-500" size={48} />
             <p className="text-slate-400 animate-pulse text-center">
               {activeTab === 'DETAIL' 
                 ? `Đang phân tích dữ liệu chuyên sâu cho ${selectedSymbol}...` 
                 : 'Đang quét Top 30 Coins (Volume & Price Action)...'}
             </p>
          </div>
        )}

        {/* TAB 1: CHI TIẾT */}
        {activeTab === 'DETAIL' && data && !loading && (
          <div className="animate-in fade-in duration-500">
            {/* Top Section: Price & Signal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left: Summary & Signal */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-2xl border border-white/5">
                   <div className="flex flex-wrap items-baseline gap-3 mb-2">
                      <h1 className="text-3xl font-bold text-white">
                        {selectedSymbol === 'BTC' ? 'Bitcoin (BTC)' : 'Internet Computer (ICP)'}
                      </h1>
                      <span className="text-2xl font-mono text-blue-400">{data.currentPrice}</span>
                   </div>
                   <p className="text-slate-400 leading-relaxed mb-4">{data.summary}</p>
                   <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <span>Cập nhật: {data.timestamp}</span>
                   </div>
                </div>

                {/* Signal Gauge Component */}
                <SignalGauge signal={data.signal} score={data.confidenceScore} />
                
                {/* Reasoning List */}
                <div className="bg-slate-800/30 p-6 rounded-xl border border-white/5">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                    Luận Điểm Chính (AI Analysis)
                  </h3>
                  <ul className="space-y-3">
                    {data.reasoning.map((r, i) => (
                      <li key={i} className="flex gap-3 text-slate-300 text-sm">
                        <span className="font-mono text-blue-500/50 text-xs mt-1">0{i+1}</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right: Trade Setup & Chart */}
              <div className="space-y-6">
                <TradeCard setup={data.tradeSetup} />
                <div className="bg-slate-800/30 p-4 rounded-xl border border-white/5">
                  <ChartProjection data={data.projectedTrend} />
                </div>
              </div>
            </div>

            {/* Middle Section: Deep Dive Metrics */}
            <div className="pt-8 mt-8 border-t border-white/5">
              <h2 className="text-xl font-bold text-white mb-6">Phân Tích Chi Tiết</h2>
              <AnalysisDetails technical={data.technicalAnalysis} onChain={data.onChainAnalysis} />
            </div>

            {/* Sources Section */}
            {sources.length > 0 && (
              <div className="pt-8 mt-8 border-t border-white/5">
                 <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Nguồn Dữ Liệu Tham Khảo (Google Search)</h4>
                 <div className="flex flex-wrap gap-3">
                    {sources.map((s, i) => (
                      <a 
                        key={i} 
                        href={s.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-blue-400 transition-colors border border-white/5"
                      >
                        <ExternalLink size={12} />
                        <span className="truncate max-w-[200px]">{s.title}</span>
                      </a>
                    ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TỔNG QUAN THỊ TRƯỜNG */}
        {activeTab === 'MARKET' && marketData && !marketLoading && (
           <div className="animate-in fade-in duration-500 space-y-6">
              
              {/* Market Sentiment Header */}
              <div className={`p-8 rounded-2xl border ${
                  marketData.sentiment === 'BULLISH' ? 'bg-green-900/10 border-green-500/30' : 
                  marketData.sentiment === 'BEARISH' ? 'bg-red-900/10 border-red-500/30' : 
                  'bg-yellow-900/10 border-yellow-500/30'
                }`}>
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white">Tổng Quan Thị Trường</h2>
                    <div className={`px-4 py-1 rounded-full text-sm font-bold border ${
                         marketData.sentiment === 'BULLISH' ? 'bg-green-500/20 text-green-400 border-green-500/50' : 
                         marketData.sentiment === 'BEARISH' ? 'bg-red-500/20 text-red-400 border-red-500/50' : 
                         'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                    }`}>
                      {marketData.sentiment} ({marketData.sentimentScore}/100)
                    </div>
                 </div>
                 <p className="text-slate-300 text-lg leading-relaxed">
                   {marketData.marketSummary}
                 </p>
              </div>

              {/* Spotlight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {marketData.spotlight.map((coin, idx) => (
                    <div key={idx} className="bg-slate-800 rounded-xl p-5 border border-white/10 hover:border-blue-500/50 transition-colors relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <TrendingUp size={80} />
                       </div>
                       <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-black text-white">{coin.symbol}</h3>
                            <p className="text-slate-400 text-sm">${parseFloat(coin.price).toLocaleString()}</p>
                          </div>
                          <SignalIcon signal={coin.signal} />
                       </div>
                       <div className="text-sm font-medium text-slate-300 mb-2">
                          24h: <span className={parseFloat(coin.change24h) >= 0 ? 'text-green-400' : 'text-red-400'}>{coin.change24h}%</span>
                       </div>
                       <p className="text-xs text-slate-400 line-clamp-3 bg-slate-900/50 p-2 rounded">
                         {coin.reason}
                       </p>
                    </div>
                 ))}
              </div>

              {/* Others Table */}
              <div className="bg-slate-800/30 rounded-xl border border-white/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-slate-800/50">
                   <h3 className="font-bold text-white">Danh Sách Top 30 (Quick Scan)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-900/50 text-xs uppercase font-medium text-slate-500">
                      <tr>
                        <th className="px-6 py-3">Token</th>
                        <th className="px-6 py-3">Giá</th>
                        <th className="px-6 py-3">24h %</th>
                        <th className="px-6 py-3">Tín Hiệu AI</th>
                        <th className="px-6 py-3">Nhận định</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {marketData.others.map((coin, idx) => (
                        <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-white">{coin.symbol}</td>
                          <td className="px-6 py-4 font-mono">${parseFloat(coin.price).toLocaleString()}</td>
                          <td className={`px-6 py-4 font-mono ${parseFloat(coin.change24h) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {coin.change24h}%
                          </td>
                          <td className="px-6 py-4">
                            <SignalIcon signal={coin.signal} />
                          </td>
                          <td className="px-6 py-4 max-w-xs truncate" title={coin.reason}>
                             {coin.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
           </div>
        )}

      </main>
    </div>
  );
};

export default App;
