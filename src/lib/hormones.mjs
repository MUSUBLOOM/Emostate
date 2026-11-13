// 100 沿用既有有符号百分制量尺，用于剩余空间比例换算，不是情绪阈值。
// 向同侧边界继续偏移时渐缓；回向零的变化仍用模型原值，永不放大。
export function applyHormone(value, delta) {
  if (!Number.isFinite(value) || !Number.isFinite(delta)) throw new TypeError('invalid hormone input')
  const current = Math.max(-100, Math.min(100, value))
  const outward = delta > 0 ? Math.max(0, current) : Math.max(0, -current)
  return Math.max(-100, Math.min(100, current + delta * (100 - outward) / 100))
}
