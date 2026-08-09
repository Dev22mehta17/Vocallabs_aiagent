// backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { query } = require('./db');
const { executeWorkflowRun } = require('./engine/executor');

const app = express();
app.use(cors());
app.use(express.json());

// Helper: Extract caller identity from headers or body
function getCallerContext(req) {
  const userId = req.headers['x-hasura-user-id'] || req.headers['x-user-id'] || req.body?.session_variables?.['x-hasura-user-id'] || 'a1111111-1111-1111-1111-111111111111';
  const orgId = req.headers['x-hasura-org-id'] || req.headers['x-org-id'] || req.body?.session_variables?.['x-hasura-org-id'] || '11111111-1111-1111-1111-111111111111';
  const role = req.headers['x-hasura-role'] || req.headers['x-role'] || req.body?.session_variables?.['x-hasura-role'] || 'owner';

  return { userId, orgId, role };
}

// Helper: Verify user's actual role in org_members table
async function verifyOrgRole(orgId, userId) {
  const res = await query(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].role;
}

// ----------------------------------------------------
// HASURA ACTION: triggerWorkflowRun
// ----------------------------------------------------
app.post('/api/actions/triggerWorkflowRun', async (req, res) => {
  try {
    const { userId, orgId } = getCallerContext(req);
    const workflowId = req.body?.input?.workflow_id || req.body?.workflow_id;
    const inputPayload = req.body?.input?.input || req.body?.input || {};

    if (!workflowId) {
      return res.status(400).json({ message: 'workflow_id is required', code: 'INVALID_INPUT' });
    }

    // 1. Fetch workflow & verify cross-org isolation
    const wfRes = await query(`SELECT * FROM workflows WHERE id = $1`, [workflowId]);
    if (wfRes.rows.length === 0) {
      return res.status(404).json({ message: 'Workflow not found', code: 'NOT_FOUND' });
    }
    const workflow = wfRes.rows[0];

    if (workflow.org_id !== orgId) {
      return res.status(403).json({
        message: `Cross-Org Security Block: User in Org ${orgId} cannot trigger Workflow ${workflowId} belonging to Org ${workflow.org_id}`,
        code: 'CROSS_ORG_ACCESS_DENIED'
      });
    }

    // 2. Layer 1 Permission check: user must be owner or editor in this org
    const userRole = await verifyOrgRole(workflow.org_id, userId);
    if (!userRole || userRole === 'viewer') {
      return res.status(403).json({
        message: `Permission Denied: User role '${userRole || 'none'}' cannot trigger workflow runs. Required: owner or editor.`,
        code: 'UNAUTHORIZED_ROLE'
      });
    }

    // 3. Quota check
    const orgRes = await query(`SELECT calls_used, calls_allowed FROM organizations WHERE id = $1`, [workflow.org_id]);
    const org = orgRes.rows[0];
    if (org.calls_used >= org.calls_allowed) {
      return res.status(429).json({
        message: `Quota Exceeded: Organization has used ${org.calls_used}/${org.calls_allowed} allowed workflow calls for this period.`,
        code: 'QUOTA_EXCEEDED'
      });
    }

    // 4. Create workflow run record
    const runRes = await query(
      `INSERT INTO workflow_runs (workflow_id, org_id, triggered_by, trigger_type, status, input) VALUES ($1, $2, $3, 'manual', 'pending', $4) RETURNING *`,
      [workflowId, workflow.org_id, userId, JSON.stringify(inputPayload)]
    );
    const run = runRes.rows[0];

    // 5. Execute workflow asynchronously or await first step
    executeWorkflowRun(run.id, 1).catch(err => {
      console.error(`Workflow run ${run.id} async execution error:`, err);
    });

    return res.json({
      id: run.id,
      workflow_id: run.workflow_id,
      org_id: run.org_id,
      status: 'running',
      created_at: run.created_at
    });
  } catch (err) {
    console.error('Error in triggerWorkflowRun:', err);
    return res.status(500).json({ message: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ----------------------------------------------------
// HASURA ACTION: approveStep
// ----------------------------------------------------
app.post('/api/actions/approveStep', async (req, res) => {
  try {
    const { userId, orgId } = getCallerContext(req);
    const stepRunId = req.body?.input?.step_run_id || req.body?.step_run_id;
    const action = req.body?.input?.action || req.body?.action || 'approve';

    if (!stepRunId) {
      return res.status(400).json({ message: 'step_run_id is required', code: 'INVALID_INPUT' });
    }

    // Fetch step_run, workflow_run, and workflow
    const srRes = await query(
      `SELECT sr.*, wr.org_id, wr.id as workflow_run_id, ws.step_order, ws.type as step_type 
       FROM step_runs sr 
       JOIN workflow_runs wr ON sr.workflow_run_id = wr.id 
       JOIN workflow_steps ws ON sr.step_id = ws.id 
       WHERE sr.id = $1`,
      [stepRunId]
    );

    if (srRes.rows.length === 0) {
      return res.status(404).json({ message: 'Step run record not found', code: 'NOT_FOUND' });
    }
    const stepRun = srRes.rows[0];

    // Verify Cross-Org Isolation
    if (stepRun.org_id !== orgId) {
      return res.status(403).json({
        message: `Cross-Org Security Block: User in Org ${orgId} cannot approve step in Org ${stepRun.org_id}`,
        code: 'CROSS_ORG_ACCESS_DENIED'
      });
    }

    // Layer 2 Security Check: Check approver's role in org_members table
    const approverRole = await verifyOrgRole(stepRun.org_id, userId);
    if (!approverRole || approverRole === 'viewer') {
      return res.status(403).json({
        message: `Layer 2 Permission Denied: Role '${approverRole || 'none'}' is not authorized to approve step gates. Required: owner or editor in Org ${stepRun.org_id}.`,
        code: 'UNAUTHORIZED_APPROVAL'
      });
    }

    if (stepRun.status !== 'paused') {
      return res.status(400).json({
        message: `Step run is currently '${stepRun.status}', not 'paused'. Only paused steps can be approved.`,
        code: 'INVALID_STATE'
      });
    }

    if (action === 'reject') {
      // Reject step
      await query(
        `UPDATE step_runs SET status = 'failed', error = 'Rejected by approver', updated_at = NOW() WHERE id = $1`,
        [stepRunId]
      );
      await query(
        `UPDATE workflow_runs SET status = 'failed', error = 'Workflow rejected at approval gate', updated_at = NOW() WHERE id = $1`,
        [stepRun.workflow_run_id]
      );
      return res.json({ id: stepRunId, status: 'failed', approved: false });
    }

    // Update step run to completed with approval metadata
    await query(
      `UPDATE step_runs SET status = 'completed', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [userId, stepRunId]
    );

    // Resume execution from NEXT step order
    const nextOrder = stepRun.step_order + 1;
    executeWorkflowRun(stepRun.workflow_run_id, nextOrder).catch(err => {
      console.error(`Resumed workflow run ${stepRun.workflow_run_id} error:`, err);
    });

    return res.json({
      id: stepRunId,
      status: 'completed',
      approved: true,
      approved_by: userId,
      approved_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in approveStep:', err);
    return res.status(500).json({ message: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ----------------------------------------------------
// HASURA ACTION: saveWorkflow (Layer 2 Step Gating Check)
// ----------------------------------------------------
app.post('/api/actions/saveWorkflow', async (req, res) => {
  try {
    const { userId, orgId } = getCallerContext(req);
    const { workflow_id, name, description, steps = [], triggers = [] } = req.body?.input || req.body;

    // Check if any step requires owner role (Layer 2 gating)
    const sensitiveSteps = steps.filter(s => ['db_write', 'notify'].includes(s.type));
    const sensitiveTriggers = triggers.filter(t => ['webhook', 'db_event'].includes(t.type));

    const callerRole = await verifyOrgRole(orgId, userId);

    if ((sensitiveSteps.length > 0 || sensitiveTriggers.length > 0) && callerRole !== 'owner') {
      return res.status(403).json({
        message: `Layer 2 Security Block: Adding '${sensitiveSteps.map(s => s.type).join(', ')}' steps or sensitive triggers requires 'owner' role. Current role is '${callerRole}'.`,
        code: 'OWNER_ROLE_REQUIRED'
      });
    }

    if (callerRole === 'viewer') {
      return res.status(403).json({
        message: `Permission Denied: Viewers cannot create or modify workflows.`,
        code: 'UNAUTHORIZED_ROLE'
      });
    }

    let targetWorkflowId = workflow_id;

    if (targetWorkflowId) {
      // Update existing workflow
      await query(
        `UPDATE workflows SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4`,
        [name, description, targetWorkflowId, orgId]
      );
      // Delete old steps & triggers to re-insert updated configuration
      await query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [targetWorkflowId]);
      await query(`DELETE FROM workflow_triggers WHERE workflow_id = $1`, [targetWorkflowId]);
    } else {
      // Create new workflow
      const newWf = await query(
        `INSERT INTO workflows (org_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
        [orgId, name, description]
      );
      targetWorkflowId = newWf.rows[0].id;
    }

    // Insert steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await query(
        `INSERT INTO workflow_steps (workflow_id, step_order, name, type, config) VALUES ($1, $2, $3, $4, $5)`,
        [targetWorkflowId, i + 1, step.name || `Step ${i + 1}`, step.type, JSON.stringify(step.config || {})]
      );
    }

    // Insert triggers
    for (const trg of triggers) {
      await query(
        `INSERT INTO workflow_triggers (workflow_id, type, config) VALUES ($1, $2, $3)`,
        [targetWorkflowId, trg.type, JSON.stringify(trg.config || {})]
      );
    }

    return res.json({ id: targetWorkflowId, message: 'Workflow saved successfully' });
  } catch (err) {
    console.error('Error in saveWorkflow:', err);
    return res.status(500).json({ message: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ----------------------------------------------------
// INBOUND TRIGGER: Webhook Endpoint
// ----------------------------------------------------
app.post('/api/webhooks/trigger/:workflow_id', async (req, res) => {
  try {
    const { workflow_id } = req.params;
    const body = req.body || {};

    const wfRes = await query(`SELECT * FROM workflows WHERE id = $1`, [workflow_id]);
    if (wfRes.rows.length === 0) return res.status(404).json({ error: 'Workflow not found' });
    const workflow = wfRes.rows[0];

    // Quota check
    const orgRes = await query(`SELECT calls_used, calls_allowed FROM organizations WHERE id = $1`, [workflow.org_id]);
    const org = orgRes.rows[0];
    if (org.calls_used >= org.calls_allowed) {
      return res.status(429).json({ error: 'Quota exceeded for organization' });
    }

    const runRes = await query(
      `INSERT INTO workflow_runs (workflow_id, org_id, trigger_type, status, input) VALUES ($1, $2, 'webhook', 'pending', $3) RETURNING *`,
      [workflow_id, workflow.org_id, JSON.stringify(body)]
    );
    const run = runRes.rows[0];

    executeWorkflowRun(run.id, 1).catch(console.error);

    return res.json({ success: true, run_id: run.id, trigger: 'webhook', status: 'running' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// INBOUND TRIGGER: Database Event Trigger Handler
// ----------------------------------------------------
app.post('/api/events/db-event', async (req, res) => {
  try {
    const { org_id, event_type, payload } = req.body;

    // Find active workflow matching db_event trigger for this org
    const trgRes = await query(
      `SELECT wt.workflow_id, w.org_id 
       FROM workflow_triggers wt 
       JOIN workflows w ON wt.workflow_id = w.id 
       WHERE wt.type = 'db_event' AND w.org_id = $1 AND w.is_active = true`,
      [org_id]
    );

    if (trgRes.rows.length === 0) {
      return res.json({ message: 'No matching database event workflow found' });
    }

    const workflowId = trgRes.rows[0].workflow_id;
    const runRes = await query(
      `INSERT INTO workflow_runs (workflow_id, org_id, trigger_type, status, input) VALUES ($1, $2, 'db_event', 'pending', $3) RETURNING *`,
      [workflowId, org_id, JSON.stringify({ event_type, payload })]
    );

    executeWorkflowRun(runRes.rows[0].id, 1).catch(console.error);

    return res.json({ success: true, run_id: runRes.rows[0].id, trigger: 'db_event' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// REALTIME SSE STREAM: Live Subscription Stream Endpoint
// ----------------------------------------------------
app.get('/api/runs/:run_id/stream', async (req, res) => {
  const { run_id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = async () => {
    try {
      const runRes = await query(`SELECT * FROM workflow_runs WHERE id = $1`, [run_id]);
      if (runRes.rows.length === 0) return;

      const stepRunsRes = await query(
        `SELECT * FROM step_runs WHERE workflow_run_id = $1 ORDER BY created_at ASC`,
        [run_id]
      );

      const payload = {
        run: runRes.rows[0],
        step_runs: stepRunsRes.rows
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      console.error('SSE Stream write error:', e.message);
    }
  };

  await sendUpdate();
  const interval = setInterval(sendUpdate, 800);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Health & Info Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Nhost / Hasura Action Execution Backend', timestamp: new Date() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ Action Execution Engine Backend running on port ${PORT}`);
});
