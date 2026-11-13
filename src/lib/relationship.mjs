// 沿用 bond 的百分制量尺；100 仅用于剩余空间的比例换算，不是判断阈值。
// 正向靠近上限时递减；负向保持模型原增量，不放大、不另设“受伤”系数。
export function applyBond(bond, delta) {
  if (!Number.isFinite(bond) || !Number.isFinite(delta)) throw new TypeError('invalid bond input')
  const current = Math.max(0, Math.min(100, bond))
  const change = delta > 0 ? delta * (100 - current) / 100 : delta
  return Math.max(0, Math.min(100, current + change))
}
