import { applyBond } from './relationship.mjs'
import { applyHormone } from './hormones.mjs'

// 复用现有状态量尺：关系中点50、信任无增量0、厌恶无增量0。
export const validPersonId = (id) => typeof id === 'string' && /^\d+$/.test(id)
export function personOf(state, id) {
  return Object.hasOwn(state.people || {}, id) ? { ...state.people[id] } : { bond: 50, trust: 0, disgust: 0, lastAt: 0 }
}
const bounded = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
export function applyPerson(state, id, result, now = Date.now()) {
  if (!validPersonId(id)) throw new TypeError('missing person id')
  const p = personOf(state, id)
  p.bond = applyBond(p.bond, result.d.bond || 0)
  p.disgust = bounded(p.disgust + (result.d.disgust || 0), 0, 100)
  // 信任增量仍来自模型h.trust，沿用现有激素预算，不人为推导。
  p.trust = applyHormone(p.trust, result.h?.trust || 0)
  p.lastAt = now
  state.people ||= {}
  state.people[id] = p
  return p
}
export function sameSpeaker(a, b) {
  return a.owner === b.owner && a.userId === b.userId && a.chatId === b.chatId
}
export function personContext(state, id) {
  const p = personOf(state, id)
  return `你对这位发言人（${id}）的感觉：关系 ${p.bond}，信任 ${p.trust}，厌恶 ${p.disgust}。`
}
