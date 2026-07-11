import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  changes: string[];
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  version,
  changes
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-slate-900"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-gradient-to-b from-emerald-500/10 to-transparent relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles size={64} />
              </div>
              
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black italic tracking-tight text-white">What's New</h2>
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Version {version}</div>
                </div>
              </div>
              
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <ul className="space-y-4">
                {changes.map((change, index) => (
                  <li key={index} className="flex gap-3 text-sm text-slate-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="leading-relaxed">{change}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={onClose}
                className="w-full mt-8 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] flex justify-center items-center gap-2"
              >
                Let's go
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
