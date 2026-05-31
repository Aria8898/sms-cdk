/**
 * SMSBower 国家映射配置
 * 新增国家：在此文件中添加，重新部署即可（变动不频繁）
 */

/** ISO 2 字母码 → SMSBower 内部 API country key（小写） */
export const ISO_TO_BOWER_KEY: Record<string, string> = {
  US: 'usa', RU: 'russia', CN: 'china', GB: 'england',
  DE: 'germany', FR: 'france', IN: 'india', BR: 'brazil',
  JP: 'japan', KR: 'south korea', VN: 'vietnam', ID: 'indonesia',
  PH: 'philippines', NG: 'nigeria', KE: 'kenya',
  SG: 'singapore', MY: 'malaysia', CA: 'canada', AU: 'australia',
  MX: 'mexico',
}

/**
 * ISO 2 字母码 → SMSBower 官方 getCountries API 中的英文名（小写）
 * 用于通过 getCountries 查询官方数字 country ID
 */
export const ISO_TO_ENG_NAME: Record<string, string> = {
  US: 'united states', RU: 'russia', CN: 'china', GB: 'england',
  DE: 'germany', FR: 'france', IN: 'india', BR: 'brazil',
  JP: 'japan', KR: 'south korea', VN: 'vietnam', ID: 'indonesia',
  PH: 'philippines', NG: 'nigeria', KE: 'kenya',
  SG: 'singapore', MY: 'malaysia', CA: 'canada', AU: 'australia',
  MX: 'mexico', UA: 'ukraine', PL: 'poland', TR: 'turkey',
  TH: 'thailand', PK: 'pakistan', BD: 'bangladesh', EG: 'egypt',
}

/** V3 降级时 bower key（如 'usa'）→ ISO 码（如 'US'） */
export const BOWER_KEY_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_TO_BOWER_KEY).map(([iso, key]) => [key, iso]),
)

/** ISO 码 → SMSBower 内部 key；若不在映射表中返回 null（fallback：不过滤国家） */
export function isoToSmsBowerKey(iso: string): string | null {
  return ISO_TO_BOWER_KEY[iso.toUpperCase()] ?? null
}
