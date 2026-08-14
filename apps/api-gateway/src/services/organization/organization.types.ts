export interface Organization {
  id: string;
  name: string;
  status: string;
  security_tier: string;
  created_at: number;
}

export interface Domain {
  id: string;
  organization_id: string;
  domain: string;
  verified: boolean;
  verification_token: string | null;
  created_at: number;
}
