export interface Device {
  id: string;
  user_id: string;
  organization_id: string;
  device_name: string;
  platform?: string;
  public_key: string;
  signing_key: string;
  status: string;
  created_at: number;
  last_seen_at?: number;
}
