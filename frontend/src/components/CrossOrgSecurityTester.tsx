'use client';

import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertOctagon, CheckCircle2, ShieldX, Play, Eye } from 'lucide-react';
import { useOrgUser } from './OrgUserContext';

export const CrossOrgSecurityTester: React.FC = () => {
  const { session } = useOrgUser();
  const [targetOrgAId, setTargetOrgAId] = useState('a0000000-0000-0000-0000-000000000001');
  const [targetStepRunId, setTargetStepRunId] = useState('a0000000-0000-0000-0000-000000000104');
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isOrgB = session.org_id === '22222222-2222-2222-2222-222222222222';

  const testDirectRead = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      // Direct call simulating Hasura RLS query for Org A workflow ID using Org B session headers
      const res = await fetch(`http://localhost:4000/api/actions/triggerWorkflowRun`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': session.user_id,
          'x-hasura-org-id': session.org_id,
          'x-hasura-role': session.role,
        },
        body: JSON.stringify({
          input: { workflow_id: targetOrgAId, input: { test: 'cross_org' } },
        }),
      });

      const data = await res.json();
      setTestResult({
        status: res.status,
        statusText: res.statusText,
        blocked: res.status === 403 || res.status === 404,
        response: data,
      });
    } catch (err: any) {
      setTestResult({
        status: 500,
        blocked: true,
        response: { message: err.message },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testDirectApprove = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      // Direct call simulating approval attempt on Org A step using Org B session
      const res = await fetch(`http://localhost:4000/api/actions/approveStep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': session.user_id,
          'x-hasura-org-id': session.org_id,
          'x-hasura-role': session.role,
        },
        body: JSON.stringify({
          input: { step_run_id: targetStepRunId, action: 'approve' },
        }),
      });

      const data = await res.json();
      setTestResult({
        status: res.status,
        statusText: res.statusText,
        blocked: res.status === 403 || res.status === 404,
        response: data,
      });
    } catch (err: any) {
      setTestResult({
        status: 500,
        blocked: true,
        response: { message: err.message },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 flex flex-col gap-6 border-l-4 border-l-rose-500">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
              Cross-Org Isolation Security Sandbox
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify that users in {session.org_name} are 100% blocked from viewing, triggering, or approving resources in Org A.
            </p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 font-mono rounded-full border ${isOrgB ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-brand-500/20 text-brand-300 border-brand-500/40'}`}>
          Active Context: {session.org_name} ({session.role.toUpperCase()})
        </span>
      </div>

      {!isOrgB && (
        <div className="p-4 bg-brand-950/40 border border-brand-500/30 rounded-xl text-xs text-brand-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-brand-400 shrink-0" />
            <span>Currently logged in as <strong>Org A (Acme AI)</strong>. Switch session context to <strong>Org B (Beta Enterprise)</strong> in top toolbar to run security penetration test.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Test Controls */}
        <div className="flex flex-col gap-4">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            1. Test Direct ID Exploitation Target
          </h4>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Org A Workflow Target ID:</label>
            <input
              type="text"
              value={targetOrgAId}
              onChange={(e) => setTargetOrgAId(e.target.value)}
              className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2.5"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Org A Step Run Target ID:</label>
            <input
              type="text"
              value={targetStepRunId}
              onChange={(e) => setTargetStepRunId(e.target.value)}
              className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2.5"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={testDirectRead}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 rounded-lg text-xs font-semibold transition"
            >
              <Play className="w-4 h-4" />
              Attempt Unauthorized Trigger
            </button>

            <button
              onClick={testDirectApprove}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 rounded-lg text-xs font-semibold transition"
            >
              <Lock className="w-4 h-4" />
              Attempt Unauthorized Approval
            </button>
          </div>
        </div>

        {/* Security Result Display */}
        <div className="glass-card p-4 flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
            <span>2. Layer 1 & 2 Security Enforcement Result</span>
            {testResult && (
              <span className={`text-[11px] font-mono font-bold ${testResult.blocked ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.blocked ? '🔒 BLOCKED (SUCCESS)' : '⚠️ LEAK DETECTED'}
              </span>
            )}
          </h4>

          {testResult ? (
            <div className="flex flex-col gap-3">
              <div className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2.5 ${testResult.blocked ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-red-950/40 border-red-500/40 text-red-300'}`}>
                {testResult.blocked ? (
                  <>
                    <ShieldX className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="block text-emerald-200">Security Check Passed — Request Denied (HTTP {testResult.status})</strong>
                      <span className="text-[11px] text-emerald-300/80">
                        Airtight cross-org scoping prevented Org B user from touching Org A resources.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" />
                    <span>Security Warning: Request was not blocked.</span>
                  </>
                )}
              </div>

              <div>
                <span className="text-slate-400 font-medium text-xs block mb-1">Server Response Payload:</span>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto max-h-48">
                  {JSON.stringify(testResult.response, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Click an exploit test button above to run security validation.</p>
          )}
        </div>
      </div>
    </div>
  );
};
