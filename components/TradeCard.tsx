import React from 'react';
import { Target, ShieldAlert, LogIn } from 'lucide-react';
import { TradeSetup } from '../types';

interface TradeCardProps {
  setup: TradeSetup;
}

const TradeCard: React.FC<TradeCardProps> = ({ setup }) => {
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-white/5 shadow-xl">
      <h3 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-2">Thiết Lập Giao Dịch</h3>
      
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
            <LogIn size={20} />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Vùng Vào Lệnh (Entry)</p>
            <p className="text-xl font-mono text-white mt-1">{setup.entryZone}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
            <Target size={20} />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Mục Tiêu (TP)</p>
            <p className="text-xl font-mono text-green-400 mt-1">{setup.targetPrice}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
            <ShieldAlert size={20} />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Cắt Lỗ (SL)</p>
            <p className="text-xl font-mono text-red-400 mt-1">{setup.stopLoss}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeCard;