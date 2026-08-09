'use client';

import React, { useState, useEffect } from 'react';
import { 
  OrgUserProvider, useOrgUser 
} from '../components/OrgUserContext';
import { QuotaBar } from '../components/QuotaBar';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { LiveExecutionConsole } from '../components/LiveExecutionConsole';
import { CrossOrgSecurityTester } from '../components/CrossOrgSecurityTester';
import { 
  Bot, Layers, Activity, ShieldCheck, Users, Sparkles, RefreshCw, Cpu 
} from 'lucide-react';

function DashboardContent() {
  const { session, setSession, demoSessions } = useOrgUser();
  const [activeTab, setActiveTab] = useState<'builder' | 'execution' | 'security'>('builder');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [orgData, setOrgData] = useState<{ calls_used: number; calls_allowed: number }>({
    calls_used: 5,
    calls_allowed: 50,
  });

  // Sample workflow data for Org A & Org B
  const [workflows, setWorkflows] = useState<any[]>([
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      org_id: '11111111-1111-1111-1111-111111111111',
      name: 'Customer Support AI Classifier & Manager Approval',
      description: 'Analyzes tickets with LLM, sends telemetry, routes negative cases to approval gate, and posts alerts.',
      steps: [
        {
          id: 'step-1',
          name: 'Analyze Ticket Sentiment',
          type: 'llm_call',
          step_order: 1,
          config: { prompt: 'Analyze sentiment for ticket: {{input.ticket_text}}', model: 'gemini-flash' },
        },
        {
          id: 'step-2',
          name: 'Log Telemetry HTTP Request',
          type: 'http_request',
          step_order: 2,
          config: { url: 'https://httpbin.org/post', method: 'POST', body: '{"ticket_id": "{{input.ticket_id}}"}' },
        },
        {
          id: 'step-3',
          name: 'Check Priority Branch',
          type: 'conditional_branch',
          step_order: 3,
          config: { condition_field: 'steps.Analyze Ticket Sentiment.output.priority', operator: 'equals', value: 'high' },
        },
        {
          id: 'step-4',
          name: 'Manager Approval Gate',
          type: 'approval_gate',
          step_order: 4,
          config: { required_role: 'editor', message: 'High priority ticket detected! Requires Manager / Owner approval to proceed.' },
        },
        {
          id: 'step-5',
          name: 'Send Slack Notification',
          type: 'notify',
          step_order: 5,
          config: { channel: '#support-alerts', message: 'Ticket {{input.ticket_id}} processed.' },
        },
        {
          id: 'step-6',
          name: 'Archive Result to DB',
          type: 'db_write',
          step_order: 6,
          config: { table: 'workflow_results', data: { ticket_id: '{{input.ticket_id}}' } },
        },
      ],
      triggers: [{ type: 'manual', config: {} }, { type: 'webhook', config: {} }],
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      org_id: '22222222-2222-2222-2222-222222222222',
      name: 'Beta Lead Scoring Pipeline',
      description: 'Fetches lead data and scores lead potential with LLM.',
      steps: [
        {
          id: 'bstep-1',
          name: 'Fetch CRM Lead Data',
          type: 'http_request',
          step_order: 1,
          config: { url: 'https://httpbin.org/json', method: 'GET' },
        },
        {
          id: 'bstep-2',
          name: 'Score Lead Quality',
          type: 'llm_call',
          step_order: 2,
          config: { prompt: 'Score lead quality for: {{steps.Fetch CRM Lead Data.output}}', model: 'gemini-flash' },
        },
      ],
      triggers: [{ type: 'manual', config: {} }],
    },
  ]);

  const activeWorkflow = workflows.find((w) => w.org_id === session.org_id) || workflows[0];

  // Trigger Workflow Run Action
  const handleTriggerRun = async (workflowId: string, inputPayload?: any) => {
    setIsExecuting(true);
    try {
      const res = await fetch(`http://localhost:4000/api/actions/triggerWorkflowRun`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': session.user_id,
          'x-hasura-org-id': session.org_id,
          'x-hasura-role': session.role,
        },
        body: JSON.stringify({
          input: { workflow_id: workflowId, input: inputPayload },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Error (${data.code}): ${data.message}`);
        setIsExecuting(false);
        return;
      }

      setActiveRunId(data.id);
      setActiveTab('execution');
      // Update quota count locally
      setOrgData((prev) => ({ ...prev, calls_used: prev.calls_used + 1 }));
    } catch (err: any) {
      alert(`Execution trigger failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Approve Step Action
  const handleApproveStep = async (stepRunId: string, action: 'approve' | 'reject') => {
    const res = await fetch(`http://localhost:4000/api/actions/approveStep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-user-id': session.user_id,
        'x-hasura-org-id': session.org_id,
        'x-hasura-role': session.role,
      },
      body: JSON.stringify({
        input: { step_run_id: stepRunId, action },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`(${data.code}): ${data.message}`);
    }
  };

  // Save Workflow Action
  const handleSaveWorkflow = async (updatedWf: any) => {
    const res = await fetch(`http://localhost:4000/api/actions/saveWorkflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-user-id': session.user_id,
        'x-hasura-org-id': session.org_id,
        'x-hasura-role': session.role,
      },
      body: JSON.stringify({
        input: updatedWf,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`(${data.code}): ${data.message}`);
    }

    // Update local state
    setWorkflows((prev) =>
      prev.map((w) => (w.id === updatedWf.workflow_id ? { ...w, steps: updatedWf.steps } : w))
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header & Demo Session Switcher */}
      <header className="glass-panel rounded-none border-x-0 border-t-0 border-b-slate-800/80 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-xl shadow-lg shadow-brand-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                AgentFlow <span className="text-xs px-2 py-0.5 bg-brand-500/20 text-brand-300 border border-brand-500/30 rounded font-mono">nhost + Hasura</span>
              </h1>
              <p className="text-xs text-slate-400">AI Agent Workflow Builder — Dual-Layer Security & Subscriptions</p>
            </div>
          </div>

          {/* Interactive User & Org Session Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl text-xs">
            <Users className="w-4 h-4 text-brand-400 ml-2" />
            <span className="text-slate-400 font-medium hidden sm:inline">Active User Context:</span>
            <select
              value={session.user_id}
              onChange={(e) => {
                const target = demoSessions.find((s) => s.user_id === e.target.value);
                if (target) setSession(target);
              }}
              className="bg-slate-950 text-slate-200 font-semibold border border-slate-700/80 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              {demoSessions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.org_name} — {s.email} ({s.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        {/* Quota Gauge */}
        <QuotaBar
          callsUsed={orgData.calls_used}
          callsAllowed={session.org_id === '11111111-1111-1111-1111-111111111111' ? 50 : 100}
          orgName={session.org_name}
        />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('builder')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'builder'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Workflow Canvas Builder
          </button>

          <button
            onClick={() => setActiveTab('execution')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition relative ${
              activeTab === 'execution'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Live Execution Stream
            {activeRunId && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping absolute top-1.5 right-1.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'security'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Cross-Org Security Sandbox
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'builder' && (
          <WorkflowBuilder
            workflow={activeWorkflow}
            onTriggerRun={handleTriggerRun}
            onSaveWorkflow={handleSaveWorkflow}
            isExecuting={isExecuting}
          />
        )}

        {activeTab === 'execution' && (
          <LiveExecutionConsole
            runId={activeRunId}
            onApproveStep={handleApproveStep}
          />
        )}

        {activeTab === 'security' && (
          <CrossOrgSecurityTester />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 mt-auto text-center text-xs text-slate-500 font-mono">
        Built with Nhost • Hasura GraphQL Engine • PostgreSQL • Next.js
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <OrgUserProvider>
      <DashboardContent />
    </OrgUserProvider>
  );
}
