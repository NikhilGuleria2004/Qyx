import { z } from 'zod';

export const CreateAlertRuleSchema = z.object({
  rule_name: z.string().min(1).max(255),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  service: z.string().optional(),
  threshold: z.string().min(1),
  organization_id: z.string().optional(),
});

export const UpdateAlertRuleSchema = z.object({
  rule_name: z.string().min(1).max(255).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  service: z.string().optional().nullable(),
  threshold: z.string().min(1).optional(),
  status: z.enum(['active', 'suppressed', 'resolved']).optional(),
});

export type CreateAlertRule = z.infer<typeof CreateAlertRuleSchema>;
export type UpdateAlertRule = z.infer<typeof UpdateAlertRuleSchema>;
