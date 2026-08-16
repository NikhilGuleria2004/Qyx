export interface Group {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  created_by: string;
  key_epoch: number;
  created_at: number;
}
