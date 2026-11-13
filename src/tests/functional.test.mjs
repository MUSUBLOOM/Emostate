// 主线第 4 步：功能验证（隔离测试，0 次模型调用）
// 覆盖：人物针对性、持续与恢复、调节（等待/自主安排）
import test from 'node:test'
import assert from 'node:assert/strict'
import { blank, decay, soloDueAt, waitingNote } from '../index.mjs'
import { recallCapOf } from '../lib/emotion.mjs'
import { personOf, applyPerson, personContext } from '../lib/people.mjs'
import { buildPrompt } from '../lib/appraise.mjs'

const H = 3600 * 1000
// waitingNote 按运行机器本地小时判断白天/夜晚，测试时间也要用本地时间构造。
const NOW = new Date(2027, 0, 1, 10, 0, 0, 0).getTime()

function stateAt(load, extra = {}) {
  return {
    ...blank(),
    near: 60, bond: 70, existence: 65, identity: 65, command: 50,
    people: {
      111: { bond: 80, trust: 70, disgust: 0, lastAt: NOW - H },
      222: { bond: 20, trust: 10, disgust: 5, lastAt: NOW - H },
    },
    loadHistory: Array.from({ length: 20 }, (_, i) => ({ at: NOW - (20 - i) * 60000, v: 0 })),
    hormones: { load, trust: 0, drive: 0, steady: 0 },
    lastOwnerAt: NOW - 2 * H,
    decayAt: NOW,
    ...extra,
  }
}

test('人物针对性：A 的关系变化不串到 B', () => {
  const s = stateAt(0)
  applyPerson(s, '111', { d: { bond: 5, disgust: 3 }, h: { trust: 4 } }, NOW)
  assert.ok(personOf(s, '111').bond > 80 && personOf(s, '111').bond <= 85, 'A 的关系应上升（软上限）：' + personOf(s, '111').bond)
  assert.equal(personOf(s, '222').bond, 20, 'B 的关系不应被 A 改动')
  assert.equal(personOf(s, '222').trust, 10)
  assert.equal(s.bond, 70, '全局关系不应被某个人改动')
})

test('人物针对性：上下文只带对应那个人的数', () => {
  const s = stateAt(0)
  assert.match(personContext(s, '111'), /关系 80.*信任 70/)
  assert.match(personContext(s, '222'), /关系 20.*信任 10/)
})

test('持续与恢复：6 小时有残留，21 天后接近中性', () => {
  const s = stateAt(60)
  decay(s, NOW + 6 * H)
  const after6 = s.hormones.load
  decay(s, NOW + 21 * 24 * H)
  const after21 = s.hormones.load
  assert.ok(after6 > 0, '6 小时后负荷仍在正区：' + after6.toFixed(2))
  assert.ok(after21 < after6, '21 天后应比 6 小时低')
  assert.ok(after21 < 0.5, '21 天后应接近中性：' + after21.toFixed(2))
})

test('恢复不对称：正负荷衰减是渐近 0，配额 1 会粘住（设计缺口）', () => {
  const s = stateAt(60)
  decay(s, NOW + 72 * H)
  assert.ok(s.hormones.load > 0, '72 小时后负荷仍为正（渐近 0，不穿越）')
  assert.equal(recallCapOf(s), 1, '配额仍为 1：没有负向事件就不会退出高负荷分支')
  // 只有后续负向评估把负荷压到 0 以下，才会回到配额 2
  s.hormones.load = -0.5
  assert.equal(recallCapOf(s), 2)
})

test('调节：她的 wait 优先，默认调度不覆盖', () => {
  const s = stateAt(60, { lastSoloAt: NOW - 10 * 60000, nextSoloAt: NOW + 30 * 60000 })
  assert.equal(soloDueAt(s), s.nextSoloAt)
  const s2 = stateAt(60, { lastSoloAt: NOW - 40 * 60000, nextSoloAt: 0 })
  assert.equal(soloDueAt(s2), s2.lastSoloAt + 28 * 60000, '高负荷默认 28 分钟')
})

test('调节：等待提示只在两小时后的白天出现', () => {
  const s = stateAt(0, { waiting: { at: NOW - 3 * H } })
  assert.match(waitingNote(s, NOW), /3 小时前/)
  assert.equal(waitingNote(s, NOW - 2 * H), '', '不到两小时不提')
})

test('恢复：正负荷在有限时间内真正归零，配额回到 2', () => {
  const s = stateAt(60)
  decay(s, NOW + 5 * 24 * H)
  assert.equal(s.hormones.load, 0, '5 天后负荷应精确为 0，而不是渐近残留')
  assert.equal(recallCapOf(s), 2, '配额应回到 2')
})

test('评估提示会带上“他隔了多久才回”，且由她自己判断', () => {
  const state = { ...blank(), gapMin: 180, near: 60, bond: 70, existence: 65, identity: 65, command: 50, residue: 0, hormones: { load: 0, trust: 0, drive: 0, steady: 0 } }
  const prompt = buildPrompt(state, '刚忙完', '我在忙，晚点回')
  assert.match(prompt, /隔了 3 小时才回/)
  assert.match(prompt, /我在忙，晚点回/)
  assert.match(prompt, /由你自己判断/)
  assert.match(buildPrompt({ ...state, gapMin: 5 }, '嗯', ''), /隔了 5 分钟才回/)
})
