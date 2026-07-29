import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, CartesianGrid } from 'recharts';
import { AnnualPowerCurve, PowerBest } from '../types';
import { Zap, TrendingUp, Trophy, Sparkles, Calendar } from 'lucide-react';

interface RiderPowerCurveProps {
  powerCurves: AnnualPowerCurve[];
  athleteType: string;
  ftp?: number;
}

export const RiderPowerCurve: React.FC<RiderPowerCurveProps> = ({ powerCurves, athleteType, ftp }) => {
  if (!powerCurves || powerCurves.length === 0) return null;

  // Find unique years and sort descending
  const availableYears = powerCurves.map(pc => pc.year).sort((a, b) => b - a);
  const [selectedYears, setSelectedYears] = useState<number[]>([availableYears[0]]);

  // Map of phenotype zones based on Athlete Type
  const getPhenotypeZone = (typeStr: string) => {
    const type = typeStr.toLowerCase();
    if (type.includes('sprinter')) {
      return {
        name: 'Neuromuscular Power (Sprint)',
        minSecs: 1,
        maxSecs: 15,
        color: 'rgba(245, 158, 11, 0.08)',
        borderColor: '#f59e0b',
        description: 'Focuses on short, explosive power output (1s to 15s) using the ATP-CP system.'
      };
    } else if (type.includes('puncheur') || type.includes('anaerobic') || type.includes('pursuiter')) {
      return {
        name: 'Anaerobic Capacity (Attack)',
        minSecs: 30,
        maxSecs: 120,
        color: 'rgba(236, 72, 153, 0.08)',
        borderColor: '#ec4899',
        description: 'Focuses on short, high-intensity efforts (30s to 2m) fueled by glycolytic pathways.'
      };
    } else if (type.includes('climber') || type.includes('vo2') || type.includes('gc')) {
      return {
        name: 'Maximal Aerobic Power (VO2 Max)',
        minSecs: 180,
        maxSecs: 480,
        color: 'rgba(59, 130, 246, 0.08)',
        borderColor: '#3b82f6',
        description: 'Focuses on middle-duration efforts (3m to 8m) targeting maximum oxygen uptake.'
      };
    } else {
      // Time Trialist / Diesel / Rouleur / All-Rounder
      return {
        name: 'Threshold & Aerobic Power (FTP)',
        minSecs: 1200,
        maxSecs: 3600,
        color: 'rgba(16, 185, 129, 0.08)',
        borderColor: '#10b981',
        description: 'Focuses on steady-state power output (20m to 1h) highlighting aerobic endurance.'
      };
    }
  };

  const phenotypeZone = getPhenotypeZone(athleteType);

  // Standard durations in seconds we want to plot (pseudo-logarithmic spacing)
  const durations = [1, 10, 20, 30, 60, 120, 180, 240, 300, 480, 600, 1200, 3600, 5400, 7200, 10800];

  const formatDurationLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    return `${Math.round(min / 60)}h`;
  };

  // Merge the multi-year curves into Recharts format
  const chartData = durations.map((d) => {
    const point: any = {
      duration: d,
      label: formatDurationLabel(d),
    };
    
    powerCurves.forEach(pc => {
      const best = pc.bests.find(b => b.duration === d);
      if (best) {
        point[`watts_${pc.year}`] = best.watts;
      }
    });

    return point;
  });

  const toggleYear = (year: number) => {
    if (selectedYears.includes(year)) {
      if (selectedYears.length > 1) {
        setSelectedYears(selectedYears.filter(y => y !== year));
      }
    } else {
      setSelectedYears([...selectedYears, year].sort((a, b) => b - a));
    }
  };

  // Year colors for lines
  const getYearColor = (year: number, isMain: boolean) => {
    if (isMain) return '#10b981'; // Emerald (Current selected newest year)
    const index = availableYears.indexOf(year);
    if (index === 1) return '#3b82f6'; // Blue (Previous year)
    if (index === 2) return '#ec4899'; // Pink (Two years ago)
    return '#64748b'; // Slate
  };

  // Highlighted phenotype duration label check
  const isPhenotypeValue = (sec: number) => {
    return sec >= phenotypeZone.minSecs && sec <= phenotypeZone.maxSecs;
  };

  // Find peak values for key test intervals (5s, 1m, 5m, 20m)
  const keyIntervals = [
    { label: '5s (Sprint)', sec: 5, desc: 'Neuromuscular' },
    { label: '1m (Attack)', sec: 60, desc: 'Anaerobic' },
    { label: '5m (Climb)', sec: 300, desc: 'VO2 Max' },
    { label: '20m (FTP Test)', sec: 1200, desc: 'Threshold' }
  ];

  const getPeakValueForYear = (year: number, sec: number) => {
    const pc = powerCurves.find(c => c.year === year);
    if (!pc) return 0;
    // Find closest or equal
    const match = pc.bests.find(b => b.duration === sec);
    if (match) return match.watts;
    // Fallback find closest
    const sorted = [...pc.bests].sort((a, b) => Math.abs(a.duration - sec) - Math.abs(b.duration - sec));
    return sorted.length > 0 ? sorted[0].watts : 0;
  };

  return (
    <div className="glass-card p-5 rounded-[1.8rem] border border-white/5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp size={12} className="text-emerald-400" />
            Athlete Power Curve
          </h4>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            Discrete test durations compared over time
          </p>
        </div>

        {/* Year Selectors */}
        <div className="flex items-center gap-1.5">
          {availableYears.map((year, index) => {
            const isSelected = selectedYears.includes(year);
            const color = getYearColor(year, index === 0);
            return (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white'
                    : 'bg-transparent text-slate-500 border-white/5 hover:border-white/10'
                }`}
                style={isSelected ? { borderColor: `${color}40`, borderLeft: `3px solid ${color}` } : {}}
              >
                <Calendar size={10} style={{ color: isSelected ? color : 'inherit' }} />
                {year}
              </button>
            );
          })}
        </div>
      </div>

      {/* The Chart */}
      <div className="h-56 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }}
              unit="W"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0c0e17',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '1.2rem',
                padding: '10px 14px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
              }}
              labelStyle={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}
              itemStyle={{ fontSize: '11px', fontWeight: 700, padding: '2px 0' }}
            />

            {/* Phenotype Highlight Reference Area */}
            {phenotypeZone && (
              <ReferenceArea
                x1={formatDurationLabel(phenotypeZone.minSecs)}
                x2={formatDurationLabel(phenotypeZone.maxSecs)}
                fill={phenotypeZone.color}
                stroke={phenotypeZone.borderColor}
                strokeDasharray="2 2"
                strokeOpacity={0.4}
                ifOverflow="extendDomain"
              />
            )}

            {/* Render selected lines */}
            {selectedYears.map((year, idx) => {
              const isMain = availableYears.indexOf(year) === 0;
              return (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={`watts_${year}`}
                  name={`${year} Peak`}
                  stroke={getYearColor(year, isMain)}
                  strokeWidth={isMain ? 2.5 : 1.5}
                  dot={{ r: 2, strokeWidth: 1, stroke: getYearColor(year, isMain), fill: '#0f172a' }}
                  activeDot={{ r: 4, strokeWidth: 0, fill: getYearColor(year, isMain) }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Phenotype Explainer Card */}
      <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/5 flex gap-3 items-start">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${phenotypeZone.borderColor}15`, border: `1px solid ${phenotypeZone.borderColor}30` }}>
          <Sparkles size={14} style={{ color: phenotypeZone.borderColor }} />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-white">
              {phenotypeZone.name}
            </span>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-slate-400 bg-slate-800">
              {athleteType} Highlight
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
            {phenotypeZone.description} Your profile indicates peak relative capabilities in this range, marked above in{' '}
            <span style={{ color: phenotypeZone.borderColor }} className="font-bold">
              {athleteType}
            </span>.
          </p>
        </div>
      </div>

      {/* Key Test Durations Benchmarks Matrix */}
      <div className="space-y-2">
        <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">
          Power Profile Matrix
        </h5>
        <div className="grid grid-cols-2 gap-2">
          {keyIntervals.map(ki => {
            const isHighlighted = isPhenotypeValue(ki.sec);
            const newestYearVal = getPeakValueForYear(availableYears[0], ki.sec);
            const oldestYearVal = availableYears.length > 1 ? getPeakValueForYear(availableYears[availableYears.length - 1], ki.sec) : 0;
            const diff = newestYearVal && oldestYearVal ? newestYearVal - oldestYearVal : 0;
            const pctDiff = oldestYearVal ? Math.round((diff / oldestYearVal) * 100) : 0;

            return (
              <div
                key={ki.label}
                className={`p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                  isHighlighted
                    ? 'bg-[#10b981]/[0.02] border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.03)]'
                    : 'bg-transparent border-white/5'
                }`}
              >
                <div className="flex justify-between items-start gap-1">
                  <div>
                    <span className="text-[9.5px] font-black text-white block truncate tracking-tight">{ki.label}</span>
                    <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wider block">{ki.desc}</span>
                  </div>
                  {isHighlighted && (
                    <span className="text-[6.5px] font-black px-1 py-0.2 rounded uppercase tracking-widest text-emerald-400 bg-emerald-500/10 shrink-0">
                      Phenotype
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-1.5">
                  <span className="text-base font-black italic font-mono text-white leading-none">
                    {newestYearVal}W
                  </span>
                  {diff !== 0 && oldestYearVal > 0 && (
                    <span className={`text-[8px] font-black font-mono flex items-center leading-none ${diff > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {diff > 0 ? '+' : ''}{pctDiff}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
