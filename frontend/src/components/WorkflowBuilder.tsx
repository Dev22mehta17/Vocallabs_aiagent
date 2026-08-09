'use client';

import React, { useState } from 'react';
import { 
  Bot, Globe, Database, Bell, GitFork, ShieldAlert, Play, 
  Plus, Trash2, ArrowUp, ArrowDown, Lock, CheckCircle2, Copy, Sparkles 
} from 'lucide-react';
import { useOrgUser } from './OrgUserContext';

export interface WorkflowStep {
  id?: string;
  name: string;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: any;
  step_order: number;
}

interface WorkflowBuilderProps {
  workflow: {
    id: string;
    name: string;
    description: string;
    org_id: string;
    steps: WorkflowStep[];
    triggers: { type: string; config: any }[];
  };
  onTriggerRun: (workflowId: string, input?: any) => void;
  onSaveWorkflow: (updatedWf: any) => Promise<void>;
  isExecuting?: boolean;
}

const NODE_ICONS = {
  llm_call: <Bot className="w-5 h-5 text-indigo-400" />,
  http_request: <Globe className="w-5 h-5 text-cyan-400" />,
  db_write: <Database className="w-5 h-5 text-emerald-400" />,
  notify: <Bell className="w-5 h-5 text-amber-400" />,
  conditional_branch: <GitFork className="w-5 h-5 text-purple-400" />,
  approval_gate: <ShieldAlert className="w-5 h-5 text-rose-400" />,
};

const STEP_TYPE_LABELS = {
  llm_call: 'LLM Call (Gemini / Groq)',
  http_request: 'HTTP Request',
  db_write: 'Database Write (Audit)',
  notify: 'Notify Alert (Slack)',
  conditional_branch: 'Conditional Branch (If/Else)',
  approval_gate: 'Approval Gate (Role Guard)',
};

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  workflow,
  onTriggerRun,
  onSaveWorkflow,
  isExecuting = false,
}) => {
  const { session } = useOrgUser();
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow.steps || []);
  const [triggers, setTriggers] = useState(workflow.triggers || [{ type: 'manual', config: {} }]);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(0);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [testInputJson, setTestInputJson] = useState('{\n  "ticket_id": "TCK-9901",\n  "ticket_text": "URGENT: Payments failing on checkout page! Extremely disappointed."\n}');

  const isViewer = session.role === 'viewer';
  const isOwner = session.role === 'owner';

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

  const handleAddStep = (type: WorkflowStep['type']) => {
    if (isViewer) return;
    const newStep: WorkflowStep = {
      name: `New ${STEP_TYPE_LABELS[type].split(' ')[0]}`,
      type,
      step_order: steps.length + 1,
      config: getDefaultConfig(type),
    };
    const updated = [...steps, newStep];
    setSteps(updated);
    setSelectedStepIndex(updated.length - 1);
  };

  const getDefaultConfig = (type: WorkflowStep['type']) => {
    switch (type) {
      case 'llm_call':
        return { prompt: 'Analyze sentiment: {{input.ticket_text}}', model: 'gemini-flash' };
      case 'http_request':
        return { url: 'https://httpbin.org/post', method: 'POST', body: '{"result": "{{steps.Step1.output}}"}' };
      case 'db_write':
        return { table: 'workflow_results', data: { log: '{{steps.Analyze.output}}' } };
      case 'notify':
        return { channel: '#support-alerts', message: 'Workflow completed successfully.' };
      case 'conditional_branch':
        return { condition_field: 'steps.Analyze.output.priority', operator: 'equals', value: 'high' };
      case 'approval_gate':
        return { required_role: 'editor', message: 'Approval required before posting public alert.' };
    }
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (isViewer) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;

    newSteps.forEach((s, idx) => (s.step_order = idx + 1));
    setSteps(newSteps);
    setSelectedStepIndex(targetIndex);
  };

  const handleDeleteStep = (index: number) => {
    if (isViewer) return;
    const newSteps = steps.filter((_, i) => i !== index);
    newSteps.forEach((s, idx) => (s.step_order = idx + 1));
    setSteps(newSteps);
    setSelectedStepIndex(newSteps.length > 0 ? 0 : null);
  };

  const handleSave = async () => {
    setSaveStatus('Saving...');
    try {
      await onSaveWorkflow({
        workflow_id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        steps,
        triggers,
      });
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  const webhookUrl = `http://localhost:4000/api/webhooks/trigger/${workflow.id}`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Visual Canvas Node List */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="glass-panel p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-500" />
                {workflow.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">{workflow.description}</p>
            </div>

            {/* Run Button (Hidden for Viewers) */}
            {!isViewer && (
              <button
                onClick={() => {
                  let parsed = {};
                  try { parsed = JSON.parse(testInputJson); } catch (e) {}
                  onTriggerRun(workflow.id, parsed);
                }}
                disabled={isExecuting}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-brand-500/25 transition-all active:scale-95 disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-white" />
                {isExecuting ? 'Running...' : 'Run Workflow'}
              </button>
            )}
          </div>

          {/* Triggers Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <span className="text-slate-400">Triggers Attached:</span>
              <span className="px-2 py-0.5 bg-brand-500/20 text-brand-300 border border-brand-500/30 rounded font-mono">
                Manual Click
              </span>
              <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded font-mono">
                Inbound Webhook
              </span>
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-mono">
                DB Event Trigger
              </span>
            </div>

            <button
              onClick={copyWebhook}
              className="text-xs flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedWebhook ? 'Webhook Copied!' : 'Copy Webhook URL'}
            </button>
          </div>

          {/* Test Input Payload JSON */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3">
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Sample Trigger Payload Input (JSON):
            </label>
            <textarea
              rows={3}
              value={testInputJson}
              onChange={(e) => setTestInputJson(e.target.value)}
              className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Nodes Canvas List */}
        <div className="glass-panel p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Step Pipeline Chain ({steps.length} Nodes)
            </h3>

            {!isViewer && (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-medium transition"
                >
                  {saveStatus || 'Save Steps'}
                </button>
              </div>
            )}
          </div>

          {steps.map((step, idx) => {
            const isSelected = selectedStepIndex === idx;
            const isOwnerOnly = ['db_write', 'notify'].includes(step.type);

            return (
              <div key={idx} className="flex flex-col items-center">
                <div
                  onClick={() => setSelectedStepIndex(idx)}
                  className={`w-full node-card node-${step.type} cursor-pointer ${
                    isSelected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-950' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                        {NODE_ICONS[step.type]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">#{step.step_order}</span>
                          <h4 className="font-semibold text-sm text-slate-100">{step.name}</h4>

                          {isOwnerOnly && (
                            <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                              <Lock className="w-2.5 h-2.5" /> Layer 2 Guard
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {STEP_TYPE_LABELS[step.type]}
                        </p>
                      </div>
                    </div>

                    {!isViewer && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleMoveStep(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded disabled:opacity-20"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveStep(idx, 'down')}
                          disabled={idx === steps.length - 1}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded disabled:opacity-20"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          className="p-1 hover:bg-red-950 text-slate-400 hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Animated Connecting Arrow */}
                {idx < steps.length - 1 && (
                  <div className="h-6 w-0.5 bg-gradient-to-b from-brand-500 to-indigo-500 my-1 relative">
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 border-r-2 border-b-2 border-indigo-400 rotate-45" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Step Options (Disabled for Viewers) */}
          {!isViewer && (
            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <label className="text-xs font-semibold text-slate-400 mb-2 block">
                + Add Step Node:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(['llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleAddStep(type)}
                    className="flex items-center gap-2 p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 transition text-left"
                  >
                    {NODE_ICONS[type]}
                    <span className="truncate">{type.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Node Config Inspector Panel */}
      <div className="lg:col-span-5">
        <div className="glass-panel p-5 sticky top-6">
          <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
            <span>Node Inspector Configuration</span>
            {selectedStep && (
              <span className="text-xs font-mono text-brand-400 uppercase">
                {selectedStep.type}
              </span>
            )}
          </h3>

          {selectedStep ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Step Name:</label>
                <input
                  type="text"
                  value={selectedStep.name}
                  disabled={isViewer}
                  onChange={(e) => {
                    const newSteps = [...steps];
                    newSteps[selectedStepIndex!].name = e.target.value;
                    setSteps(newSteps);
                  }}
                  className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-800 rounded p-2 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>

              {/* Dynamic Step Configuration Fields */}
              {selectedStep.type === 'llm_call' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">LLM Prompt Template:</label>
                  <textarea
                    rows={4}
                    value={selectedStep.config.prompt || ''}
                    disabled={isViewer}
                    onChange={(e) => {
                      const newSteps = [...steps];
                      newSteps[selectedStepIndex!].config.prompt = e.target.value;
                      setSteps(newSteps);
                    }}
                    className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Use <code className="text-indigo-400 font-mono">{"{{input.ticket_text}}"}</code> to inject trigger payload variables.
                  </p>
                </div>
              )}

              {selectedStep.type === 'http_request' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Endpoint URL:</label>
                    <input
                      type="text"
                      value={selectedStep.config.url || ''}
                      disabled={isViewer}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[selectedStepIndex!].config.url = e.target.value;
                        setSteps(newSteps);
                      }}
                      className="w-full bg-slate-950 text-xs font-mono text-cyan-300 border border-slate-800 rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">HTTP Body Template:</label>
                    <textarea
                      rows={3}
                      value={selectedStep.config.body || ''}
                      disabled={isViewer}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[selectedStepIndex!].config.body = e.target.value;
                        setSteps(newSteps);
                      }}
                      className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2"
                    />
                  </div>
                </div>
              )}

              {selectedStep.type === 'conditional_branch' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Target Context Field:</label>
                    <input
                      type="text"
                      value={selectedStep.config.condition_field || ''}
                      disabled={isViewer}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[selectedStepIndex!].config.condition_field = e.target.value;
                        setSteps(newSteps);
                      }}
                      className="w-full bg-slate-950 text-xs font-mono text-purple-300 border border-slate-800 rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Target Value to Match:</label>
                    <input
                      type="text"
                      value={selectedStep.config.value || ''}
                      disabled={isViewer}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[selectedStepIndex!].config.value = e.target.value;
                        setSteps(newSteps);
                      }}
                      className="w-full bg-slate-950 text-xs font-mono text-slate-200 border border-slate-800 rounded p-2"
                    />
                  </div>
                </div>
              )}

              {selectedStep.type === 'approval_gate' && (
                <div className="bg-rose-950/20 border border-rose-500/30 rounded-lg p-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
                    <ShieldAlert className="w-4 h-4" />
                    Layer 2 Mid-Execution Gate
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Gate Reason / Instructions:</label>
                    <textarea
                      rows={3}
                      value={selectedStep.config.message || ''}
                      disabled={isViewer}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[selectedStepIndex!].config.message = e.target.value;
                        setSteps(newSteps);
                      }}
                      className="w-full bg-slate-950 text-xs text-rose-200 border border-slate-800 rounded p-2"
                    />
                  </div>
                </div>
              )}

              {['db_write', 'notify'].includes(selectedStep.type) && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold mb-1">
                    <Lock className="w-4 h-4" />
                    Layer 2 Owner Guard Active
                  </div>
                  <p className="text-[11px] text-amber-400/80">
                    Only users with the <strong className="text-amber-200">Owner</strong> role in {session.org_name} can add or update this high-privilege step node.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Select a node from the canvas to view or edit configuration.</p>
          )}
        </div>
      </div>
    </div>
  );
};
