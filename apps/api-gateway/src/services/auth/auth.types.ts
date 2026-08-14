export interface User {
  id: string;
  organization_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  public_key?: string;
  created_at: number;
  last_active_at?: number;
  password_hash?: string;
  mfa_secret?: string;
  mfa_enabled: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  organization_id: string;
  device_id?: string;
  refresh_token: string;
  expires_at: number;
  created_at: number;
  last_seen_at: number;
}

export interface LoginState {
  state: 'UNAUTHENTICATED' | 'PRIMARY_VERIFIED' | 'MFA_CHALLENGE_ISSUED' | 'MFA_VERIFIED' | 'SESSION_ISSUED' | 'DEVICE_REGISTRATION_REQUIRED';
  userId?: string;
  organizationId?: string;
  role?: string;
  mfaRequired?: boolean;
  deviceId?: string;
}
