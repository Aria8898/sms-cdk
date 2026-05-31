import { getDb, auditLogs } from '../db'

/**
 * 结构化 JSON 日志工具
 * 输出到 console.log，Cloudflare Workers Dashboard 可实时 tail 并按字段过滤
 */
export function log(event: string, meta: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...meta }))
}

/**
 * 写入 D1 audit_logs 表（持久审计，异步尽力写入，失败不影响主流程）
 */
export async function writeAuditLog(
  db: ReturnType<typeof getDb>,
  event: string,
  entityType: 'cdk' | 'order',
  entityId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      event,
      entityType,
      entityId,
      meta: meta ? JSON.stringify(meta) : null,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    // audit_logs 表不存在（migration 未 apply）或其他写入失败，不影响主流程
    console.warn('[audit] write failed:', err)
  }
}
