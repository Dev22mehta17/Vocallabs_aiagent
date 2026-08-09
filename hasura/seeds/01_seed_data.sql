-- 01_seed_data.sql
-- Seed Data for Org A (Acme AI Corp) & Org B (Beta Enterprise)

-- 1. Organizations
INSERT INTO organizations (id, name, calls_used, calls_allowed) VALUES
('11111111-1111-1111-1111-111111111111', 'Acme AI Corp', 5, 50),
('22222222-2222-2222-2222-222222222222', 'Beta Enterprise', 12, 100)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, calls_allowed = EXCLUDED.calls_allowed;

-- 2. Organization Members
-- Org A Members: Alice (Owner), Bob (Editor), Charlie (Viewer)
INSERT INTO org_members (id, org_id, user_id, user_email, role) VALUES
('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'alice.owner@acme.com', 'owner'),
('a2222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'bob.editor@acme.com', 'editor'),
('a3333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'charlie.viewer@acme.com', 'viewer'),

-- Org B Members: Dave (Owner), Eve (Viewer)
('b1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'dave.owner@beta.com', 'owner'),
('b2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'eve.viewer@beta.com', 'viewer')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

-- 3. Workflows
INSERT INTO workflows (id, org_id, name, description, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Customer Support AI Classifier & Manager Approval', 'Analyzes incoming support tickets using LLM, posts telemetry, routes negative cases to approval gate, and notifies management.', true),
('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Beta Lead Scoring Pipeline', 'Fetches leads from endpoint and scores them with LLM.', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 4. Workflow Steps for Org A Workflow
INSERT INTO workflow_steps (id, workflow_id, step_order, name, type, config) VALUES
(
  'a0000000-0000-0000-0000-000000000101', 
  'a0000000-0000-0000-0000-000000000001', 
  1, 
  'Analyze Ticket Sentiment', 
  'llm_call', 
  '{"prompt": "Analyze the sentiment and summary of this ticket: {{input.ticket_text}}. Output JSON with keys: sentiment (positive/neutral/negative), score (1-10), priority (low/high), summary.", "model": "gemini-flash"}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000102', 
  'a0000000-0000-0000-0000-000000000001', 
  2, 
  'Log Telemetry HTTP Request', 
  'http_request', 
  '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}, "body": "{\"sentiment\": \"{{steps.Analyze Ticket Sentiment.output.sentiment}}\", \"ticket_id\": \"{{input.ticket_id}}\"}"}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000103', 
  'a0000000-0000-0000-0000-000000000001', 
  3, 
  'Check Priority Branch', 
  'conditional_branch', 
  '{"condition_field": "steps.Analyze Ticket Sentiment.output.priority", "operator": "equals", "value": "high"}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000104', 
  'a0000000-0000-0000-0000-000000000001', 
  4, 
  'Manager Approval Gate', 
  'approval_gate', 
  '{"required_role": "editor", "message": "High priority ticket detected! Requires Manager / Owner approval to post public refund alert."}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000105', 
  'a0000000-0000-0000-0000-000000000001', 
  5, 
  'Send Slack Notification', 
  'notify', 
  '{"channel": "#support-alerts", "message": "Ticket {{input.ticket_id}} resolved with sentiment {{steps.Analyze Ticket Sentiment.output.sentiment}}"}'::jsonb
),
(
  'a0000000-0000-0000-0000-000000000106', 
  'a0000000-0000-0000-0000-000000000001', 
  6, 
  'Archive Result to DB', 
  'db_write', 
  '{"table": "workflow_results", "data": {"ticket_id": "{{input.ticket_id}}", "analysis": "{{steps.Analyze Ticket Sentiment.output}}"}}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, config = EXCLUDED.config;

-- Steps for Org B Workflow
INSERT INTO workflow_steps (id, workflow_id, step_order, name, type, config) VALUES
(
  'b0000000-0000-0000-0000-000000000101',
  'b0000000-0000-0000-0000-000000000002',
  1,
  'Fetch CRM Lead',
  'http_request',
  '{"url": "https://httpbin.org/json", "method": "GET"}'::jsonb
),
(
  'b0000000-0000-0000-0000-000000000102',
  'b0000000-0000-0000-0000-000000000002',
  2,
  'Score Lead with LLM',
  'llm_call',
  '{"prompt": "Rate lead potential from 1 to 10 for: {{steps.Fetch CRM Lead.output}}", "model": "gemini-flash"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 5. Workflow Triggers
INSERT INTO workflow_triggers (id, workflow_id, type, config) VALUES
('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', 'manual', '{}'::jsonb),
('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000001', 'webhook', '{"secret": "acme_webhook_secret_99"}'::jsonb),
('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000001', 'db_event', '{"watched_table": "watched_events", "event_type": "ticket_created"}'::jsonb),

('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 'manual', '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type;
