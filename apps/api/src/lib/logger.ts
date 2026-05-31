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
  db: ReturnType<typeof import('../db').getDb>,
  event: string,
  entityType: 'cdk' | 'order',
  entityId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const { auditLogs } = await import('../db')
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      event,
      entityType,
      entityId,
      meta: meta ? JSON.stringify(meta) : null,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    // 审计日志写入失败不影响主流程，仅打印警告
    console.warn('[audit] write failed:', err)
  }
}
