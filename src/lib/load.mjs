// 负荷的两个读取方式：都只看她自己的历史，不用绝对阈值。
// 这里集中放，避免 emotion.mjs 和 index.mjs 各写一份。

// 当前负荷是否高于她自己历史的中位数。
export function loadAboveOwnMedian(s) {
  const h = Array.isArray(s.loadHistory) ? s.loadHistory : []
  if (h.length < 8) return false
  const vals = h.map((x) => Number(x.v) || 0).sort((a, b) => a - b)
  const mid = vals[Math.floor(vals.length / 2)]
  const cur = Number((s.hormones || {}).load) || 0
  // 只有正负荷（超过中性 0）才算"高"
  return cur > 0 && cur > mid
}

// 当前负荷在她自己历史里的分位，给独处间隔用。
export function loadPercentile(s) {
  const h = Array.isArray(s.loadHistory) ? s.loadHistory : []
  if (h.length < 8) return 0
  const cur = Number((s.hormones || {}).load) || 0
  // 激素 0 是中性：负值（放松）不算"负荷高"
  if (cur <= 0) return 0
  let below = 0
  for (const x of h) if (Number(x.v) < cur) below++
  return below / h.length
}
