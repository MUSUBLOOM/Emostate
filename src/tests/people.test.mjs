import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPerson, personOf, personContext, sameSpeaker } from '../lib/people.mjs'
import { validState } from '../lib/persistence.mjs'

test('person update preserves other people and global fields using only model deltas', () => {
  const state = { bond: 80, hormones: { trust: 30 }, people: {
    '20001': { bond: 60, trust: 4, disgust: 2, lastAt: 10 },
    '20002': { bond: 55, trust: -2, disgust: 7, lastAt: 20 },
  } }
  const other = structuredClone(state.people['20002'])
  applyPerson(state, '20001', { d: { bond: -3, disgust: 5, identity: -6 }, h: { trust: -2, load: 8 } }, 100)
  assert.deepEqual(state.people['20001'], { bond: 57, trust: 2, disgust: 7, lastAt: 100 })
  assert.deepEqual(state.people['20002'], other)
  assert.equal(state.bond, 80)
  assert.deepEqual(state.hormones, { trust: 30 })
  assert.equal(state.identity, undefined)
  const before = JSON.stringify(state)
  const copy = personOf(state, '20001')
  copy.bond = 0
  personContext(state, '20003')
  assert.equal(JSON.stringify(state), before, '读取不会创建或修改任何人的经历')
  assert.ok(validState(JSON.parse(before)), 'people 四字段可通过快照往返校验')
})

test('person IDs and persisted numeric fields reject malformed data', () => {
  const state = { bond: 80 }
  for (const id of ['', '__proto__', 'someone']) {
    assert.throws(() => applyPerson(state, id, { d: { bond: -2 } }), /missing person id/)
  }
  assert.deepEqual(state, { bond: 80 })
  assert.ok(validState(state), '旧状态没有 people 时仍可读取')
  for (const p of [{ bond: 50 }, { bond: 50, trust: '0', disgust: 0, lastAt: 1 },
    { bond: 50, trust: 0, disgust: NaN, lastAt: 1 }]) {
    assert.equal(validState({ people: { '20001': p } }), false)
  }
})

test('speaker batching requires the same identity, ownership and chat', () => {
  const a = { owner: false, userId: '20001', chatId: 'group:90000' }
  assert.equal(sameSpeaker(a, { ...a }), true)
  assert.equal(sameSpeaker(a, { ...a, userId: '20002' }), false)
  assert.equal(sameSpeaker(a, { ...a, owner: true }), false)
  assert.equal(sameSpeaker(a, { ...a, chatId: 'group:90001' }), false)
})
