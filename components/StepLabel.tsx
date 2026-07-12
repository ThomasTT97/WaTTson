import React from "react";

interface StepLabelProps {
  label: string;
}

const formatLabel = (str: string): string => {
  // Replace things like "10m", "10 m", "10 mins", "10 min", "10 minute", "10 minutes"
  // with "10 min" consistently.
  return str.replace(/(\d+)\s*(?:minutes|minute|mins|min|m)\b/gi, "$1 min");
};

export const StepLabel: React.FC<StepLabelProps> = ({ label }) => {
  const formattedLabel = formatLabel(label);

  // Matches "3 times: 10 min 304w + 5 min 180w", "3x: 10 min 304w + 5 min 180w", etc.
  // Regex explains: optional leading number, word "times" or "x", followed by colon, and then details
  const match = formattedLabel.match(/^(\d+)\s*(?:times|x)\s*:\s*(.+)$/i) || 
                formattedLabel.match(/^(\d+)\s*x\s+(.+)$/i);

  if (match) {
    const multiplier = match[1];
    const rest = match[2];
    
    // Split the rest by "+"
    const parts = rest.split(/\s*\+\s*/);

    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <span className="text-emerald-400 font-extrabold text-[12px] uppercase tracking-wider block">
          {multiplier}x:
        </span>
        <div className="pl-3 border-l-2 border-emerald-500/20 ml-1 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-semibold text-[13px] leading-snug">
              {part.trim()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Also check if there's no times/x but has " + "
  if (formattedLabel.includes(" + ")) {
    const parts = formattedLabel.split(/\s*\+\s*/);
    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <div className="pl-2 border-l border-white/10 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-semibold text-[13px] leading-snug">
              {part.trim()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <span className="break-words leading-tight">{formattedLabel}</span>;
};

export const getStepPhaseLabel = (sIdx: number, totalSteps: number, label: string): string => {
  if (totalSteps <= 1) {
    const isInterval = /times|x:|\+|interval/i.test(label);
    return isInterval ? "Intervals" : "Main set";
  }
  if (sIdx === 0) {
    return "Warm up";
  }
  if (sIdx === totalSteps - 1) {
    return "Cool down";
  }
  // Middle steps
  const isInterval = /times|x:|\+|interval/i.test(label);
  return isInterval ? "Intervals" : "Main set";
};
