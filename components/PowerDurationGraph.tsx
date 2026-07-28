import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { TrendingUp, Award, HelpCircle } from 'lucide-react';
import { AnnualPowerCurve } from '../types';

interface PowerDurationGraphProps {
  powerCurves: AnnualPowerCurve[];
  athleteType?: string;
  ftp?: number | null;
}

type RangeType = 'all' | 'sprint' | 'vo2' | 'threshold';

const durations = [1, 10, 20, 30, 60, 120, 180, 240, 300, 480, 600, 1200, 3600, 5400, 7200, 10800];

const durationLabels: { [key: number]: string } = {
  1: "1s", 10: "10s", 20: "20s", 30: "30s", 
  60: "1m", 120: "2m", 180: "3m", 240: "4m", 300: "5m", 480: "8m", 600: "10m", 1200: "20m", 
  3600: "1h", 5400: "1.5h", 7200: "2h", 10800: "3h"
};

// Standard multi-duration power multipliers relative to FTP for different athlete types
const multipliers: Record<string, { [key: number]: number }> = {
  sprinter: {
    1: 5.5, 10: 4.8, 20: 4.0, 30: 3.2, 
    60: 2.1, 120: 1.6, 180: 1.4, 240: 1.3, 300: 1.25, 480: 1.18, 600: 1.12, 1200: 1.05, 
    3600: 0.90, 5400: 0.82, 7200: 0.75, 10800: 0.68
  },
  climber: {
    1: 2.8, 10: 2.4, 20: 2.1, 30: 1.8, 
    60: 1.55, 120: 1.45, 180: 1.40, 240: 1.35, 300: 1.32, 480: 1.25, 600: 1.20, 1200: 1.10, 
    3600: 1.00, 5400: 0.92, 7200: 0.86, 10800: 0.80
  },
  puncheur: {
    1: 4.5, 10: 3.8, 20: 3.2, 30: 2.7, 
    60: 2.0, 120: 1.55, 180: 1.42, 240: 1.32, 300: 1.28, 480: 1.20, 600: 1.14, 1200: 1.06, 
    3600: 0.94, 5400: 0.84, 7200: 0.76, 10800: 0.70
  },
  diesel: {
    1: 2.5, 10: 2.1, 20: 1.9, 30: 1.7, 
    60: 1.5, 120: 1.38, 180: 1.32, 240: 1.28, 300: 1.25, 480: 1.20, 600: 1.16, 1200: 1.10, 
    3600: 1.02, 5400: 0.94, 7200: 0.88, 10800: 0.82
  },
  allrounder: {
    1: 3.8, 10: 3.2, 20: 2.7, 30: 2.3, 
    60: 1.75, 120: 1.45, 180: 1.35, 240: 1.28, 300: 1.24, 480: 1.18, 600: 1.12, 1200: 1.05, 
    3600: 0.96, 5400: 0.87, 7200: 0.80, 10800: 0.74
  }
};

export const PowerDurationGraph: React.FC<PowerDurationGraphProps> = ({ powerCurves, athleteType, ftp }) => {
  const [range, setRange] = useState<RangeType>('all');

  // Filter durations based on selected range
  const activeDurations = useMemo(() => {
    switch (range) {
      case 'sprint':
        return [1, 10, 20, 30, 60]; // 1s to 1m
      case 'vo2':
        return [60, 120, 180, 240, 300, 480, 600]; // 1m to 10m
      case 'threshold':
        return [600, 1200, 3600, 5400, 7200, 10800]; // 10m to 3h
      case 'all':
      default:
        return durations;
    }
  }, [range]);

  // Determine if the actual power curves are empty/all-zero
  const hasRealData = useMemo(() => {
    if (!powerCurves || powerCurves.length === 0) return false;
    // Check if there is at least one non-zero watt value in any year
    return powerCurves.some(curve => 
      curve.bests && curve.bests.some(b => b.watts > 0)
    );
  }, [powerCurves]);

  // Resolve active power curves, fall back to beautiful estimate based on rider profile & FTP
  const resolvedPowerCurves = useMemo(() => {
    if (hasRealData) {
      return powerCurves;
    }

    // Generate fallback curves if none or empty
    const baseFtp = ftp || 250;
    const typeLower = (athleteType || '').toLowerCase();
    
    let category = 'allrounder';
    if (typeLower.includes('sprint')) {
      category = 'sprinter';
    } else if (typeLower.includes('climb') || typeLower.includes('mountain')) {
      category = 'climber';
    } else if (typeLower.includes('punch') || typeLower.includes('puncheur') || typeLower.includes('kermesse') || typeLower.includes('classics')) {
      category = 'puncheur';
    } else if (typeLower.includes('diesel') || typeLower.includes('endurance') || typeLower.includes('time trial') || typeLower.includes('tt')) {
      category = 'diesel';
    }

    const categoryMultipliers = multipliers[category] || multipliers.allrounder;
    const currentYear = new Date().getFullYear();
    
    // Create current year and previous year comparisons for visual gains check
    return [
      {
        year: currentYear,
        bests: durations.map(d => ({
          duration: d,
          watts: Math.round(baseFtp * (categoryMultipliers[d] || 1.0))
        }))
      },
      {
        year: currentYear - 1,
        bests: durations.map(d => ({
          duration: d,
          watts: Math.round(baseFtp * 0.95 * (categoryMultipliers[d] || 1.0)) // 5% lower to show progress
        }))
      }
    ];
  }, [powerCurves, hasRealData, athleteType, ftp]);

  // Transform curves into Recharts format
  const chartData = useMemo(() => {
    return activeDurations.map(d => {
      const row: any = {
        duration: d,
        label: durationLabels[d] || `${d}s`
      };
      
      resolvedPowerCurves.forEach(curve => {
        const best = curve.bests?.find(b => b.duration === d);
        if (best) {
          row[curve.year.toString()] = best.watts;
        }
      });
      
      return row;
    });
  }, [resolvedPowerCurves, activeDurations]);

  // Extract years to map lines
  const years = useMemo(() => {
    return resolvedPowerCurves.map(c => c.year).sort((a, b) => b - a);
  }, [resolvedPowerCurves]);

  // Get color for a year based on its relative rank
  const getYearColor = (year: number, index: number) => {
    if (index === 0) return '#10b981'; // Emerald (Current/Most Recent Year)
    if (index === 1) return '#06b6d4'; // Cyan (Previous Year)
    if (index === 2) return '#a855f7'; // Purple (Two Years Ago)
    return '#f59e0b'; // Amber (Older Years)
  };

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp size={12} className="text-emerald-400" /> Power-Duration Curve
          </h4>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            {hasRealData ? 'Peak mean power values from your rides' : `Profile-derived estimate (FTP: ${ftp || 250}W)`}
          </p>
        </div>

        {/* Range Selector */}
        <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/5 self-start sm:self-center">
          {(['all', 'sprint', 'vo2', 'threshold'] as RangeType[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                range === r 
                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm' 
                  : 'text-slate-400 hover:text-white font-bold'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[220px] w-full bg-slate-950/30 p-2 rounded-2xl border border-white/5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgba(255,255,255,0.03)" 
              vertical={false} 
            />
            <XAxis 
              dataKey="label" 
              stroke="#64748b" 
              fontSize={9} 
              tickLine={false} 
              axisLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={9} 
              tickLine={false} 
              axisLine={false}
              unit="W"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-950/95 border border-white/10 p-3 rounded-xl shadow-xl space-y-1.5 backdrop-blur-md">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Duration: <span className="text-white font-bold">{label}</span>
                      </p>
                      <div className="space-y-1">
                        {payload.map((p: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-4 text-[10px]">
                            <span className="flex items-center gap-1.5 font-semibold" style={{ color: p.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </span>
                            <span className="font-extrabold text-white">{p.value}W</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            
            {years.map((year, idx) => {
              const color = getYearColor(year, idx);
              return (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={year.toString()}
                  name={`${year} Season`}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, stroke: color, strokeWidth: 1, fill: '#020617' }}
                  activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: color }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & Insights */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
        <div className="flex flex-wrap gap-4">
          {years.map((year, idx) => {
            const color = getYearColor(year, idx);
            return (
              <div key={year} className="flex items-center gap-1.5">
                <span className="w-2.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">
                  {year} {idx === 0 ? '(Current)' : ''}
                </span>
              </div>
            );
          })}
        </div>
        
        {hasRealData ? (
          <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md">
            <Award size={10} /> Progressive Profile Connected
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[9px] text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded-md">
            <HelpCircle size={10} /> Type-Specific Estimate
          </div>
        )}
      </div>
    </div>
  );
};
