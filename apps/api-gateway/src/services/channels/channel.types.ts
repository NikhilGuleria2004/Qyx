export interface Channel {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: number;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  can_post: boolean;
  status: string;
  requested_at: number;
  joined_at?: number;
}
