'use client';

import React from 'react';
import { Activity, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface QuotaProps {
  callsUsed: number;
  callsAllowed: number;
  orgName: string;
}

export const QuotaBar: React.FC<QuotaProps> = ({ callsUsed, callsAllowed, orgName }) => {
  const percentage = Math.min(100, Math.round((callsUsed / Math.max(1, callsAllowed)) * 100));
  const remaining = Math.max(0, callsAllowed - callsUsed);

  let barColor = 'bg-indigo-500';
  let badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
  
  if (percentage >= 100) {
    barColor = 'bg-red-500';
    badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';
  } else if (percentage >= 80) {
    barColor = 'bg-amber-500';
    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }

  return (
    <div className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-4 border-l-4 border-l-brand-500">
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="p-2.5 bg-brand-500/10 rounded-lg text-brand-500">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-200">{orgName} Quota Usage</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${badgeColor}`}>
              {percentage}% Used
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {remaining} executions remaining out of {callsAllowed} monthly quota
          </p>
        </div>
      </div>

      <div className="w-full md:w-72 flex flex-col gap-1.5">
        <div className="flex justify-between text-xs font-mono text-slate-400">
          <span>{callsUsed} calls</span>
          <span>{callsAllowed} limit</span>
        </div>
        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
