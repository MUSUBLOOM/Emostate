// 条件反射：中性的话与强烈情绪反复配对之后，自己也会带分量
// 只做共现统计，不做推理；消退与自发恢复都在这里。

const MAX_CUES = 60

// 把一句话压成"线索"：太短太长的不要
const normalize = (text) => String(text || '').replace(/[\s，。！？、,.!?~…「」“”"'（）()]+/g, '')
export function cueOf(text) {
  const t = String(text || '').replace(/[\s，。！？、,.!?~…「」“”"'（）()]+/g, '')
  if (t.length < 2 || t.length > 12) return ''
  return t
}

// 配对一次：同一个线索三次共现就到满强度
export function learn(cues, kind, text, now = Date.now()) {
  const c = cueOf(text)
  if (!c) return cues
  const cur = cues[c] || { k: kind, n: 0, s: 0, at: now }
  cur.k = kind
  cur.n += 1
  cur.s = Math.min(1, cur.n / 3)
  cur.at = now
  cur.agedAt = now
  cues[c] = cur
  const keys = Object.keys(cues)
  if (keys.length > MAX_CUES) {
    keys.sort((a, b) => (cues[a].at || 0) - (cues[b].at || 0))
    for (const k of keys.slice(0, keys.length - MAX_CUES)) delete cues[k]
  }
  return cues
}

// 出现线索时：按强度给一点反应，同时自然消退（自发恢复靠 floor）
// 只做全等匹配：整句相同才算线索，避免 2 字词在长句里偶然共现。
export function react(cues, text, now = Date.now()) {
  const t = normalize(text)
  const hits = []
  for (const [c, v] of Object.entries(cues || {})) {
    if (!c || t !== c) continue
    const s = Number(v.s || 0)
    if (s > 0.05) hits.push({ cue: c, kind: v.k, s })
    // 消退：没有新的强事件跟上，就慢慢变弱，但不归零
    v.s = Math.max(0.03, s * 0.97)
    v.at = now
    v.agedAt = now
  }
  return hits
}

// 长期不用也会淡，同样不归零
export function age(cues, now = Date.now()) {
  for (const v of Object.values(cues || {})) {
    const start = Number(v.at) || now
    const previous = Number.isFinite(v.agedAt) ? v.agedAt : start
    const elapsed = Math.max(0, now - Math.max(start + 24 * 3600 * 1000, previous))
    if (elapsed > 0) v.s = Math.max(0.03, (v.s || 0) * Math.exp(-elapsed / (14 * 24 * 3600 * 1000)))
    v.agedAt = Math.max(previous, now)
  }
  return cues
}
