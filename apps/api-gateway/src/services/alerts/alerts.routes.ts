import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { AlertsService } from './alerts.service';
import { CreateAlertRuleSchema, UpdateAlertRuleSchema } from './alerts.schema';

type AlertsBindings = {
  PRIMARY_DB: D1Database;
};

type AlertsVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: AlertsBindings; Variables: AlertsVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:read');
  const orgId = c.req.param('orgId')!;

  const service = new AlertsService(c.env.PRIMARY_DB);
  const rules = await service.listRules(orgId);
  const summary = await service.getAlertSummary(orgId);

  return c.json({ rules, summary });
});

app.post('/', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:write');
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = CreateAlertRuleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AlertsService(c.env.PRIMARY_DB);
  const rule = await service.createRule({
    ...parsed.data,
    organization_id: orgId,
  });

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'alert_rule_created',
    metadata: { alert_id: rule.id, rule_name: rule.rule_name },
  });

  return c.json(rule, 201);
});

app.patch('/:ruleId', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:write');
  const orgId = c.req.param('orgId')!;
  const ruleId = c.req.param('ruleId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = UpdateAlertRuleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AlertsService(c.env.PRIMARY_DB);
  const rule = await service.updateRule(ruleId, parsed.data);

  if (!rule) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Alert rule not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'alert_rule_updated',
    metadata: { alert_id: ruleId, rule_name: rule.rule_name },
  });

  return c.json(rule);
});

app.delete('/:ruleId', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:write');
  const orgId = c.req.param('orgId')!;
  const ruleId = c.req.param('ruleId')!;
  const user = c.get('user') as { user_id: string };

  const service = new AlertsService(c.env.PRIMARY_DB);
  await service.deleteRule(ruleId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'alert_rule_removed',
    metadata: { alert_id: ruleId },
  });

  return c.json({ status: 'deleted' });
});

app.get('/:ruleId/events', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:read');
  const orgId = c.req.param('orgId')!;
  const ruleId = c.req.param('ruleId')!;

  const service = new AlertsService(c.env.PRIMARY_DB);
  const events = await service.getAlertEvents(ruleId, orgId, 50);

  return c.json({ events });
});

app.post('/evaluate', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:write');
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };

  const service = new AlertsService(c.env.PRIMARY_DB);
  const firedEvents = await service.evaluateRules(orgId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'alert_rules_evaluated',
    metadata: { fired_count: firedEvents.length },
  });

  return c.json({ fired: firedEvents.length, events: firedEvents });
});

export default app;
