import React from 'react';
import { ArrowUp, ArrowDown, Minus, Eye } from 'lucide-react';

interface SignalGaugeProps {
  signal: 'BUY' | 'SELL' | 'NEUTRAL' | 'WAIT';
  score: number;
}

const SignalGauge: React.FC<SignalGaugeProps> = ({ signal, score }) => {
  let color = 'text-gray-400';
  let bgColor = 'bg-gray-800';
  let icon = <Minus size={48} />;
  let label = 'TRUNG LẬP';
  let barColor = 'bg-gray-500';

  if (signal === 'BUY') {
    color = 'text-green-500';
    bgColor = 'bg-green-500/10';
    icon = <ArrowUp size={48} />;
    label = 'MUA (LONG)';
    barColor = 'bg-green-500';
  } else if (signal === 'SELL') {
    color = 'text-red-500';
    bgColor = 'bg-red-500/10';
    icon = <ArrowDown size={48} />;
    label = 'BÁN (SHORT)';
    barColor = 'bg-red-500';
  } else if (signal === 'WAIT') {
    color = 'text-orange-400';
    bgColor = 'bg-orange-500/10';
    icon = <Eye size={48} />;
    label = 'QUAN SÁT';
    barColor = 'bg-orange-400';
  } else {
    // NEUTRAL
    color = 'text-yellow-400';
    bgColor = 'bg-yellow-500/10';
    icon = <Minus size={48} />;
    label = 'SIDEWAY';
    barColor = 'bg-yellow-400';
  }

  return (
    <div className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border border-white/10 ${bgColor} backdrop-blur-sm transition-all duration-500`}>
      <div className="absolute top-4 right-4 text-xs font-mono text-gray-400">AI CONFIDENCE</div>
      
      <div className={`mb-4 ${color} animate-pulse`}>
        {icon}
      </div>
      
      <h2 className={`text-4xl font-black tracking-tighter ${color} mb-2`}>
        {label}
      </h2>
      
      <div className="w-full bg-slate-700/50 rounded-full h-4 mt-4 overflow-hidden relative">
        <div 
          className={`h-full transition-all duration-1000 ease-out ${barColor}`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
      <div className="flex justify-between w-full mt-2 text-xs text-gray-400 font-mono">
        <span>Yếu</span>
        <span>Mạnh ({score}%)</span>
      </div>
    </div>
  );
};

export default SignalGauge;
