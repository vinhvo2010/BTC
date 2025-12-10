import React from 'react';
import { TechnicalMetric, OnChainMetric } from '../types';
import { Activity, Database, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AnalysisDetailsProps {
  technical: TechnicalMetric[];
  onChain: OnChainMetric[];
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'BULLISH' || status === 'POSITIVE') return <TrendingUp size={16} className="text-green-500" />;
  if (status === 'BEARISH' || status === 'NEGATIVE') return <TrendingDown size={16} className="text-red-500" />;
  return <Minus size={16} className="text-yellow-500" />;
};

const AnalysisDetails: React.FC<AnalysisDetailsProps> = ({ technical, onChain }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Technical Analysis */}
      <div className="bg-slate-800/30 rounded-xl border border-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="text-orange-500" size={20} />
          <h3 className="font-bold text-white">Phân Tích Kỹ Thuật (Price Action)</h3>
        </div>
        <div className="space-y-3">
          {technical.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div>
                <p className="text-sm text-gray-300 font-medium">{item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.value}</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded border border-white/5">
                <span className={`text-xs font-bold ${
                  item.status === 'BULLISH' ? 'text-green-400' : 
                  item.status === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {item.status}
                </span>
                <StatusIcon status={item.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* On-Chain Analysis */}
      <div className="bg-slate-800/30 rounded-xl border border-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="text-blue-500" size={20} />
          <h3 className="font-bold text-white">Dữ Liệu On-Chain</h3>
        </div>
        <div className="space-y-3">
          {onChain.map((item, idx) => (
            <div key={idx} className="flex flex-col p-3 bg-slate-900/50 rounded-lg">
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-300 font-medium">{item.name}</p>
                <StatusIcon status={item.status} />
              </div>
              <p className="text-xs text-blue-300 mb-1">{item.value}</p>
              <p className="text-xs text-gray-500 italic">"{item.description}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalysisDetails;