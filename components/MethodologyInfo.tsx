import React from 'react';

const methodologies = [
  {
    name: 'Polarized',
    rationale: "Maximizes aerobic adaptation by strictly separating low-intensity (Zone 1/2) and high-intensity (VO2max/hard anaerobic) sessions. Avoids plateauing caused by 'gray zone' middle-intensity training."
  },
  {
    name: 'Pyramidal',
    rationale: "Builds a robust aerobic base through high-volume Zone 1/2, supported by moderate-intensity (Threshold/Sweetspot) work, with limited VO2max bursts. Mimics physiological demands of long-duration events."
  },
  {
    name: 'Norwegian',
    rationale: "Utilizes 'Double Threshold' concepts—pairing controlled sub-threshold efforts (Sweetspot/Threshold) with high-volume Zone 2 to drive mitochondrial density improvements and capillary development."
  }
];

export const MethodologyInfo: React.FC = () => {
  return (
    <div className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] mt-4 space-y-3">
      <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Methodology Scientific Basis</h3>
      <div className="space-y-4">
        {methodologies.map((m) => (
          <div key={m.name} className="space-y-1">
            <span className="text-xs font-semibold text-emerald-400 capitalize">{m.name}</span>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Scientific rationale: {m.rationale}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
