import { pool } from '../db.js';

export async function writeAudit({ userId, action, entity, entityId, details, ip }, conn = pool) {
  await conn.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
     VALUES (:userId, :action, :entity, :entityId, :details, :ip)`,
    {
      userId: userId ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId != null ? String(entityId) : null,
      details: details ? JSON.stringify(details) : null,
      ip: ip ?? null,
    },
  );
}
