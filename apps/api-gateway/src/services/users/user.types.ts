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
}
