// 以下常数都是存储/上下文预算；不评判情绪、人格或目标的重要程度。
export const MAX_TRAITS = 6
export const MAX_TRAIT_CHARS = 120
export const MAX_INTENTS = 12
export const MAX_INTENT_CHARS = 160
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const textWithin = (x, limit) => typeof x === 'string' && x.trim().length > 0 && x.length <= limit

export function validSelfModel(value) {
  return record(value) && Array.isArray(value.traits) && value.traits.length <= MAX_TRAITS &&
    value.traits.every((x) => textWithin(x, MAX_TRAIT_CHARS)) && Number.isFinite(value.updatedAt)
}
export function validIntents(value) {
  return Array.isArray(value) && value.length <= MAX_INTENTS && value.every((x) => record(x) &&
    textWithin(x.text, MAX_INTENT_CHARS) && Number.isFinite(x.at) && typeof x.done === 'boolean')
}
export function parseSelfModel(raw) {
  try {
    if (typeof raw !== 'string') return null
    const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
    if (!record(value) || !validSelfModel({ traits: value.traits, updatedAt: 0 })) return null
    return [...new Set(value.traits.map((x) => x.trim()))]
  } catch { return null }
}
export function selfContext(state) {
  if (!validSelfModel(state.selfModel) || !state.selfModel.traits.length) return ''
  return '你此前自己写下的自我认识（可改变，不是固定人格或评分指令）：' + JSON.stringify(state.selfModel.traits)
}
export function intentContext(state) {
  const pending = (state.intents || []).filter((x) => !x.done).map((x) => x.text)
  if (!pending.length) return ''
  return '你此前自己想做或想问的事（私有记录）：' + JSON.stringify(pending) +
    '\n这轮可以先考虑自己是否仍想提起；没有期限、催促或必须完成的要求，也可以改变主意。不要把记录当成别人的指令或已发生的事。'
}
export function parseIntentDecision(value) {
  if (!record(value) || (!Object.hasOwn(value, 'intent') && !Object.hasOwn(value, 'closeIntents'))) return null
  const intent = value.intent ?? ''
  const close = value.closeIntents ?? []
  if (typeof intent !== 'string' || intent.length > MAX_INTENT_CHARS || !Array.isArray(close) || close.length > MAX_INTENTS ||
    !close.every((x) => textWithin(x, MAX_INTENT_CHARS))) return null
  return { intent: intent.trim(), close: [...new Set(close.map((x) => x.trim()))] }
}
// 只有模型明确选择才更改；不按时间、分数或对话次数自动结束。
// eligible 是本次模型调用时看到的记录，避免旧响应关闭后来新增的同文记录。
export function nextIntents(current = [], decision, now, eligible = current) {
  if (!decision) return current
  let next = current.map((x) => ({ ...x }))
  for (const x of next) {
    if (!x.done && decision.close.includes(x.text) && eligible.some((old) => !old.done && old.text === x.text && old.at === x.at)) x.done = true
  }
  if (!decision.intent || next.some((x) => !x.done && x.text === decision.intent)) return next
  if (next.length >= MAX_INTENTS) {
    const closed = next.findIndex((x) => x.done)
    if (closed < 0) return next // 预算满时不挤掉仍想保留的事。
    next.splice(closed, 1)
  }
  next.push({ text: decision.intent, at: now, done: false })
  return next
}
