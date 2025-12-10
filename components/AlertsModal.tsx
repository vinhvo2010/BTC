
import React, { useState } from 'react';
import { X, Bell, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { PriceAlert } from '../types';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: PriceAlert[];
  onAddAlert: (symbol: string, price: number, condition: 'ABOVE' | 'BELOW') => void;
  onRemoveAlert: (id: string) => void;
}

const AlertsModal: React.FC<AlertsModalProps> = ({ isOpen, onClose, alerts, onAddAlert, onRemoveAlert }) => {
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol && price) {
      onAddAlert(symbol.toUpperCase(), parseFloat(price), condition);
      setSymbol('');
      setPrice('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800/50">
          <div className="flex items-center gap-2 text-white">
            <Bell size={20} className="text-yellow-500" />
            <h2 className="font-bold">Cảnh Báo Giá</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 border-b border-white/5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
               <input
                type="text"
                placeholder="Mã (VD: BTC, ETH)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-bold uppercase placeholder:font-normal"
                required
              />
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as 'ABOVE' | 'BELOW')}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ABOVE">Cao hơn (&gt;)</option>
                <option value="BELOW">Thấp hơn (&lt;)</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mức giá mục tiêu (USDT)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="any"
                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap"
              >
                + Thêm
              </button>
            </div>
          </form>
        </div>

        {/* List */}
        <div className="max-h-[300px] overflow-y-auto p-2">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              Chưa có cảnh báo nào.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${alert.condition === 'ABOVE' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {alert.condition === 'ABOVE' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        {alert.symbol}
                        <span className="text-xs font-normal text-slate-400">
                           {alert.condition === 'ABOVE' ? 'vượt qua' : 'tụt xuống'}
                        </span>
                      </div>
                      <div className="text-lg font-mono text-slate-200">${alert.targetPrice.toLocaleString()}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveAlert(alert.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertsModal;
