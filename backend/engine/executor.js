// backend/engine/executor.js
const { query } = require('../db');
const { callLLM } = require('./llm');

// Helper: Deep variable interpolation for strings and objects
function interpolate(template, context) {
  if (typeof template === 'string') {
    return template.replace(/\{\{\s*([\w\.\s\-]+)\s*\}\}/g, (match, path) => {
      const parts = path.trim().split('.');
      let current = context;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return match; // Keep unresolved template if missing
        }
      }
      if (typeof current === 'object') {
        return JSON.stringify(current);
      }
      return current !== undefined ? String(current) : '';
    });
  } else if (typeof template === 'object' && template !== null) {
    if (Array.isArray(template)) {
      return template.map(item => interpolate(item, context));
    }
    const result = {};
    for (const key of Object.keys(template)) {
      result[key] = interpolate(template[key], context);
    }
    return result;
  }
  return template;
}

// Evaluate condition expression
function evaluateCondition(config, context) {
  const { condition_field, operator = 'equals', value } = config;
  const fieldValue = interpolate(`{{${condition_field}}}`, context);
  const targetValue = interpolate(value, context);

  switch (operator.toLowerCase()) {
    case 'equals':
    case '==':
      return String(fieldValue).trim().toLowerCase() === String(targetValue).trim().toLowerCase();
    case 'not_equals':
    case '!=':
      return String(fieldValue).trim().toLowerCase() !== String(targetValue).trim().toLowerCase();
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
    case 'greater_than':
    case '>':
      return parseFloat(fieldValue) > parseFloat(targetValue);
    case 'less_than':
    case '<':
      return parseFloat(fieldValue) < parseFloat(targetValue);
    default:
      return Boolean(fieldValue);
  }
}

// Execute single step with retries
async function executeStep(step, context, runId, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      let output = {};
      const interpolatedConfig = interpolate(step.config, context);

      switch (step.type) {
        case 'llm_call': {
          const prompt = interpolatedConfig.prompt || 'Summarize ticket';
          const model = interpolatedConfig.model || 'gemini-flash';
          const llmResult = await callLLM({ prompt, model });
          output = llmResult.json || { text: llmResult.text };
          output._model_used = llmResult.model_used;
          output._tokens = llmResult.tokens;
          break;
        }

        case 'http_request': {
          const url = interpolatedConfig.url || 'https://httpbin.org/post';
          const method = (interpolatedConfig.method || 'POST').toUpperCase();
          const headers = interpolatedConfig.headers || { 'Content-Type': 'application/json' };
          let body = interpolatedConfig.body;

          if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
          }

          const options = {
            method,
            headers: typeof headers === 'string' ? JSON.parse(headers) : headers,
          };
          if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
            options.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
          }

          const res = await fetch(url, options);
          const responseText = await res.text();
          let jsonBody = null;
          try { jsonBody = JSON.parse(responseText); } catch (e) {}

          output = {
            status: res.status,
            statusText: res.statusText,
            data: jsonBody || responseText,
            url,
            method
          };
          break;
        }

        case 'db_write': {
          const targetTable = interpolatedConfig.table || 'workflow_results';
          const dataToWrite = interpolatedConfig.data || { result: 'completed' };

          // Insert into workflow_results table
          const dbRes = await query(
            `INSERT INTO workflow_results (workflow_id, run_id, step_id, data) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [step.workflow_id, runId, step.id, JSON.stringify(dataToWrite)]
          );

          output = {
            inserted_id: dbRes.rows[0].id,
            table: targetTable,
            record: dataToWrite,
            created_at: dbRes.rows[0].created_at
          };
          break;
        }

        case 'notify': {
          const channel = interpolatedConfig.channel || '#general';
          const message = interpolatedConfig.message || 'Workflow notification alert';

          output = {
            notified: true,
            channel,
            message,
            delivered_at: new Date().toISOString()
          };
          break;
        }

        case 'conditional_branch': {
          const branchResult = evaluateCondition(step.config, context);
          output = {
            evaluated: true,
            passed: branchResult,
            condition: step.config,
            branch: branchResult ? 'IF_TRUE' : 'ELSE_FALSE'
          };
          break;
        }

        case 'approval_gate': {
          // Approval gate pauses workflow run mid-execution!
          output = {
            required_role: step.config.required_role || 'editor',
            message: step.config.message || 'Awaiting explicit approval by owner/editor to proceed.',
            paused_at: new Date().toISOString()
          };
          return {
            status: 'paused',
            output,
            attemptCount: attempt
          };
        }

        default:
          output = { message: `Step type ${step.type} completed.` };
      }

      return {
        status: 'completed',
        output,
        attemptCount: attempt
      };
    } catch (err) {
      lastError = err.message;
      console.warn(`Attempt ${attempt} for step '${step.name}' failed:`, err.message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  return {
    status: 'failed',
    error: lastError || 'Step execution failed after maximum retries',
    attemptCount: attempt
  };
}

// Execute full workflow run starting from given step order
async function executeWorkflowRun(runId, startFromOrder = 1) {
  // Fetch run details
  const runRes = await query(`SELECT * FROM workflow_runs WHERE id = $1`, [runId]);
  if (runRes.rows.length === 0) throw new Error(`Workflow run ${runId} not found`);
  const run = runRes.rows[0];

  // Update run status to running
  await query(`UPDATE workflow_runs SET status = 'running', updated_at = NOW() WHERE id = $1`, [runId]);

  // Fetch steps
  const stepsRes = await query(
    `SELECT * FROM workflow_steps WHERE workflow_id = $1 AND step_order >= $2 ORDER BY step_order ASC`,
    [run.workflow_id, startFromOrder]
  );
  const steps = stepsRes.rows;

  // Build context object from input and existing completed step runs
  const context = {
    input: run.input || {},
    steps: {}
  };

  // Populate context with past completed step runs
  const pastStepRuns = await query(
    `SELECT sr.*, ws.name as step_name FROM step_runs sr JOIN workflow_steps ws ON sr.step_id = ws.id WHERE sr.workflow_run_id = $1 AND sr.status = 'completed'`,
    [runId]
  );
  for (const sr of pastStepRuns.rows) {
    context.steps[sr.step_name] = {
      output: sr.output,
      status: sr.status
    };
  }

  for (const step of steps) {
    // Check if step run record already exists
    const existingSrRes = await query(
      `SELECT * FROM step_runs WHERE workflow_run_id = $1 AND step_id = $2`,
      [runId, step.id]
    );

    let stepRunId;
    if (existingSrRes.rows.length > 0) {
      stepRunId = existingSrRes.rows[0].id;
      // Mark running
      await query(
        `UPDATE step_runs SET status = 'running', updated_at = NOW() WHERE id = $1`,
        [stepRunId]
      );
    } else {
      const newSr = await query(
        `INSERT INTO step_runs (workflow_run_id, step_id, step_name, step_type, status, input) VALUES ($1, $2, $3, $4, 'running', $5) RETURNING id`,
        [runId, step.id, step.name, step.type, JSON.stringify(step.config)]
      );
      stepRunId = newSr.rows[0].id;
    }

    // Execute step logic
    const stepResult = await executeStep(step, context, runId);

    // Save step_run status
    if (stepResult.status === 'paused') {
      await query(
        `UPDATE step_runs SET status = 'paused', output = $1, attempt_count = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(stepResult.output), stepResult.attemptCount, stepRunId]
      );

      // Pause overall workflow run!
      await query(
        `UPDATE workflow_runs SET status = 'paused', updated_at = NOW() WHERE id = $1`,
        [runId]
      );
      return { status: 'paused', pausedAtStepId: step.id };
    } else if (stepResult.status === 'failed') {
      await query(
        `UPDATE step_runs SET status = 'failed', error = $1, attempt_count = $2, updated_at = NOW() WHERE id = $3`,
        [stepResult.error, stepResult.attemptCount, stepRunId]
      );

      // Fail overall workflow run
      await query(
        `UPDATE workflow_runs SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2`,
        [stepResult.error, runId]
      );
      return { status: 'failed', error: stepResult.error };
    } else {
      // Completed step
      await query(
        `UPDATE step_runs SET status = 'completed', output = $1, attempt_count = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(stepResult.output), stepResult.attemptCount, stepRunId]
      );

      // Add to context for subsequent steps
      context.steps[step.name] = {
        output: stepResult.output,
        status: 'completed'
      };
    }
  }

  // All steps completed! Update workflow run status & increment org quota usage
  await query(
    `UPDATE workflow_runs SET status = 'completed', output = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(context.steps), runId]
  );

  // Increment org calls_used
  await query(
    `UPDATE organizations SET calls_used = calls_used + 1 WHERE id = $1`,
    [run.org_id]
  );

  return { status: 'completed', runId };
}

module.exports = {
  executeWorkflowRun,
  interpolate
};
