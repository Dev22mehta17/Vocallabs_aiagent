'use client';

import React, { useEffect, useState } from 'react';
import { 
  Activity, CheckCircle2, Clock, AlertTriangle, ShieldCheck, 
  RotateCw, Play, XCircle, Code, ChevronRight, UserCheck, ShieldAlert 
} from 'lucide-react';
import { useOrgUser } from './OrgUserContext';

interface LiveExecutionConsoleProps {
  runId: string | null;
  onApproveStep: (stepRunId: string, action: 'approve' | 'reject') => Promise<void>;
  onClose?: () => void;
}

export const LiveExecutionConsole: React.FC<LiveExecutionConsoleProps> = ({
  runId,
  onApproveStep,
  onClose,
}) => {
  const { session } = useOrgUser();
  const [runData, setRunData] = useState<any>(null);
  const [stepRuns, setStepRuns] = useState<any[]>([]);
  const [selectedStepRun, setSelectedStepRun] = useState<any>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!runId) return;

    // Connect to backend SSE stream endpoint for live real-time subscription updates
    const eventSource = new EventSource(`http://localhost:4000/api/runs/${runId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.run) setRunData(data.run);
        if (data.step_runs) {
          setStepRuns(data.step_runs);
          // Auto-select active or paused step
          const activeOrPaused = data.step_runs.find((s: any) => ['paused', 'running'].includes(s.status));
          if (activeOrPaused) {
            setSelectedStepRun(activeOrPaused);
          } else if (data.step_runs.length > 0 && !selectedStepRun) {
            setSelectedStepRun(data.step_runs[data.step_runs.length - 1]);
          }
        }
      } catch (e) {
        console.error('Error parsing SSE stream data:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  if (!runId) {
    return (
      <div className="glass-panel p-6 text-center text-slate-500 text-sm">
        No active execution run. Click "Run Workflow" or send a Webhook trigger to start a live run.
      </div>
    );
  }

  const pausedStepRun = stepRuns.find((s) => s.status === 'paused');

  const handleApprovalClick = async (action: 'approve' | 'reject') => {
    if (!pausedStepRun) return;
    setIsApproving(true);
    setApprovalError(null);
    try {
      await onApproveStep(pausedStepRun.id, action);
    } catch (err: any) {
      setApprovalError(err.message || 'Approval Action Failed');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="glass-panel p-6 flex flex-col gap-5 border-l-4 border-l-cyan-500 relative overflow-hidden">
      {/* Header & Status Pill */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100">Live Execution Subscription Feed</h3>
              <span className="font-mono text-xs text-slate-400">ID: {runId.substring(0, 8)}...</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Streaming real-time step execution updates via GraphQL subscription stream.
            </p>
          </div>
        </div>

        {runData && (
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-xs font-mono font-semibold rounded-full border badge-${runData.status}`}>
              STATUS: {runData.status.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* PAUSED APPROVAL GATE BANNER MODAL */}
      {pausedStepRun && (
        <div className="bg-rose-950/80 border-2 border-rose-500/80 rounded-xl p-5 shadow-2xl shadow-rose-950/80 flex flex-col gap-4 animate-glow">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-500/40">
                <ShieldAlert className="w-6 h-6 animate-pulse-fast" />
              </div>
              <div>
                <h4 className="font-bold text-base text-rose-100 flex items-center gap-2">
                  Workflow Execution Paused — Approval Required
                </h4>
                <p className="text-xs text-rose-200/90 mt-0.5">
                  Step <strong className="underline">{pausedStepRun.step_name}</strong> is holding execution until authorized by an Owner or Editor in {session.org_name}.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-rose-500/30 rounded-lg p-3 text-xs font-mono text-rose-200">
            {pausedStepRun.output?.message || 'High priority ticket detected! Requires Manager / Owner approval to proceed.'}
          </div>

          {approvalError && (
            <div className="p-3 bg-red-900/90 border border-red-500/80 rounded-lg text-xs text-red-200 flex items-center gap-2 font-mono">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{approvalError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-rose-500/30">
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <span>Active Session:</span>
              <span className="font-semibold text-white px-2 py-0.5 bg-slate-800 rounded border border-slate-700">
                {session.email} ({session.role.toUpperCase()})
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleApprovalClick('reject')}
                disabled={isApproving}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition"
              >
                Reject Run
              </button>

              <button
                onClick={() => handleApprovalClick('approve')}
                disabled={isApproving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/25 transition active:scale-95 disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                {isApproving ? 'Verifying Role...' : 'Approve & Resume Execution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Runs Progress Feed List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 flex flex-col gap-2.5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Realtime Step Execution Chain ({stepRuns.length} steps)
          </h4>

          {stepRuns.map((step, i) => {
            const isSelected = selectedStepRun?.id === step.id;

            return (
              <div
                key={step.id || i}
                onClick={() => setSelectedStepRun(step)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  isSelected ? 'bg-slate-800/90 border-brand-500' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {step.status === 'running' && <RotateCw className="w-4 h-4 text-amber-400 animate-spin" />}
                  {step.status === 'paused' && <Clock className="w-4 h-4 text-rose-400 animate-pulse-fast" />}
                  {step.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  {step.status === 'pending' && <Clock className="w-4 h-4 text-slate-500" />}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{step.step_name}</span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">({step.step_type})</span>
                    </div>
                    {step.attempt_count > 1 && (
                      <span className="text-[10px] text-amber-400 font-mono">
                        Attempt {step.attempt_count}/3
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] font-mono rounded border badge-${step.status}`}>
                    {step.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Step JSON Output Inspector */}
        <div className="lg:col-span-6 glass-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Code className="w-4 h-4 text-brand-400" />
              Step Details & Output Inspector
            </h5>
            {selectedStepRun && (
              <span className="text-[10px] font-mono text-slate-400">
                Attempt: {selectedStepRun.attempt_count || 1}
              </span>
            )}
          </div>

          {selectedStepRun ? (
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Step Status:</span>
                <span className={`ml-2 px-2 py-0.5 font-mono text-[11px] rounded border badge-${selectedStepRun.status}`}>
                  {selectedStepRun.status}
                </span>
              </div>

              {selectedStepRun.approved_by && (
                <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded text-emerald-300 font-mono text-[11px] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Approved by {selectedStepRun.approved_by.substring(0, 8)}... at {new Date(selectedStepRun.approved_at).toLocaleTimeString()}
                </div>
              )}

              {selectedStepRun.error && (
                <div className="p-2 bg-red-950/40 border border-red-500/30 rounded text-red-300 font-mono text-[11px]">
                  Error: {selectedStepRun.error}
                </div>
              )}

              <div>
                <span className="text-slate-400 font-medium block mb-1">Output Payload JSON:</span>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto max-h-56">
                  {JSON.stringify(selectedStepRun.output || selectedStepRun.input || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Select a step from the list to inspect payload data.</p>
          )}
        </div>
      </div>
    </div>
  );
};
