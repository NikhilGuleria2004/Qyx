import { D1Database } from '@cloudflare/workers-types';

export async function getChannelById(db: D1Database, channelId: string) {
  const result = await db.prepare('SELECT * FROM channels WHERE id = ?').bind(channelId).first();
  return result;
}

export async function getChannelsByOrg(db: D1Database, organizationId: string) {
  const result = await db.prepare('SELECT * FROM channels WHERE organization_id = ?').bind(organizationId).all();
  return result.results;
}

export async function createChannel(
  db: D1Database,
  id: string,
  organizationId: string,
  name: string,
  description: string | null,
  createdBy: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO channels (id, organization_id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, name, description, createdBy, now).run();
  return result;
}

export async function deleteChannel(db: D1Database, orgId: string, channelId: string) {
  const result = await db.prepare('DELETE FROM channels WHERE id = ? AND organization_id = ?').bind(channelId, orgId).run();
  return result;
}

export async function getChannelMember(db: D1Database, channelId: string, userId: string) {
  const result = await db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').bind(channelId, userId).first();
  return result;
}

export async function getChannelMembers(db: D1Database, channelId: string, status?: string) {
  if (status) {
    const result = await db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND status = ?').bind(channelId, status).all();
    return result.results;
  }
  const result = await db.prepare('SELECT * FROM channel_members WHERE channel_id = ?').bind(channelId).all();
  return result.results;
}

export async function createChannelMember(db: D1Database, channelId: string, userId: string, canPost: boolean = false, status: string = 'pending') {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO channel_members (channel_id, user_id, can_post, status, requested_at, joined_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(channelId, userId, canPost ? 1 : 0, status, now, status === 'active' ? now : null).run();
  return result;
}

export async function updateChannelMemberStatus(db: D1Database, channelId: string, userId: string, status: string, canPost: boolean = false) {
  const now = Date.now();
  const result = await db.prepare('UPDATE channel_members SET status = ?, can_post = ?, joined_at = ? WHERE channel_id = ? AND user_id = ?').bind(status, canPost ? 1 : 0, now, channelId, userId).run();
  return result;
}

export async function deleteChannelMember(db: D1Database, channelId: string, userId: string) {
  const result = await db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').bind(channelId, userId).run();
  return result;
}
