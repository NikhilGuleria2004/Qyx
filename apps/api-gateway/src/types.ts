import { Context } from 'hono';

export interface UserSession {
  user_id: string;
  organization_id: string;
  role: string;
  device_id?: string;
}

export interface AppVariables {
  user?: UserSession;
  orgId?: string;
  permission?: string;
  validatedBody?: Record<string, unknown>;
}

export type AppContext = Context;
