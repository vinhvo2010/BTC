import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartPoint } from '../types';

interface ChartProjectionProps {
  data: ChartPoint[];
}

const ChartProjection: React.FC<ChartProjectionProps> = ({ data }) => {
  const isPositive = data.length > 0 && data[data.length - 1].price >= data[0].price;
  const strokeColor = isPositive ? "#10b981" : "#ef4444";
  const fillColor = isPositive ? "url(#colorPv)" : "url(#colorPvRed)";

  return (
    <div className="h-[250px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
             <linearGradient id="colorPvRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis 
            dataKey="day" 
            axisLine={false} 
            tickLine={false} 
            tick={{fill: '#94a3b8', fontSize: 12}} 
            dy={10}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            orientation="right" 
            axisLine={false} 
            tickLine={false}
            tick={{fill: '#94a3b8', fontSize: 12}}
            tickFormatter={(value) => `$${(value/1000).toFixed(1)}k`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
            itemStyle={{ color: '#f8fafc' }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Price']}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke={strokeColor} 
            fillOpacity={1} 
            fill={fillColor} 
            strokeWidth={3}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-gray-500 mt-2 font-mono uppercase tracking-widest">
        AI Projected Trend (7 Days)
      </p>
    </div>
  );
};

export default ChartProjection;