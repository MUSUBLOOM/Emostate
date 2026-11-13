import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_INTENTS, MAX_INTENT_CHARS, parseSelfModel, parseIntentDecision, nextIntents, intentContext, selfContext } from '../lib/agency.mjs'
import { validState } from '../lib/persistence.mjs'

test('self model accepts only her explicit bounded statements, including withdrawal', () => {
  assert.deepEqual(parseSelfModel('{"traits":["PRIVATE_SELF","PRIVATE_SELF"]}'), ['PRIVATE_SELF'])
  assert.deepEqual(parseSelfModel('```json\n{"traits":[]}\n```'), [])
  for (const raw of ['I am kind', '{}', '{"traits":[4]}', '{"traits":[""]}', '{"traits":null}',
    JSON.stringify({ traits: ['x'.repeat(121)] })]) assert.equal(parseSelfModel(raw), null)
  assert.equal(selfContext({}), '')
})

test('intent decisions preserve optionality and never turn arbitrary output into a goal', () => {
  for (const value of [{}, { intent: 4 }, { closeIntents: 'one' }, { closeIntents: [null] }, { intent: 'x'.repeat(MAX_INTENT_CHARS + 1) }]) {
    assert.equal(parseIntentDecision(value), null)
  }
  const original = [{ text: 'KEEP', at: 1, done: false }]
  assert.equal(nextIntents(original, null, 2), original)
  assert.deepEqual(nextIntents(original, parseIntentDecision({ intent: '' }), 2), original)
})

test('intent add, explicit closure and deduplication do not mutate prior records', () => {
  const original = [{ text: 'KEEP', at: 1, done: false }]
  const added = nextIntents(original, parseIntentDecision({ intent: 'NEW' }), 2)
  assert.deepEqual(added, [...original, { text: 'NEW', at: 2, done: false }])
  assert.equal(original.length, 1)
  assert.equal(nextIntents(added, parseIntentDecision({ intent: 'NEW' }), 3).length, 2)
  const closed = nextIntents(added, parseIntentDecision({ closeIntents: ['KEEP', 'UNKNOWN'] }), 4)
  assert.equal(closed[0].done, true)
  assert.equal(closed[1].done, false)
  assert.equal(added[0].done, false)
})

test('intent budget never evicts an open choice; closed entries may yield a slot', () => {
  const full = Array.from({ length: MAX_INTENTS }, (_, i) => ({ text: 'CHOICE_' + i, at: i, done: false }))
  assert.deepEqual(nextIntents(full, parseIntentDecision({ intent: 'NEW' }), 100), full)
  const replaced = nextIntents(full, parseIntentDecision({ intent: 'NEW', closeIntents: ['CHOICE_0'] }), 100)
  assert.equal(replaced.length, MAX_INTENTS)
  assert.equal(replaced.at(-1).text, 'NEW')
  assert.ok(replaced.some((x) => x.text === 'CHOICE_1' && !x.done))
})

test('late intention choices cannot close a later same-text record they never saw', () => {
  const eligible = [{ text: 'SAME', at: 1, done: false }]
  const current = [{ text: 'SAME', at: 2, done: false }]
  assert.equal(nextIntents(current, parseIntentDecision({ closeIntents: ['SAME'] }), 3, eligible)[0].done, false)
})

test('private contexts and persisted agency state remain data, without auto completion', () => {
  const state = { selfModel: { traits: ['PRIVATE_SELF'], updatedAt: 1 },
    intents: [{ text: 'PRIVATE_INTENT', at: 1, done: false }, { text: 'CLOSED', at: 2, done: true }] }
  const before = JSON.stringify(state)
  assert.ok(selfContext(state).includes('PRIVATE_SELF'))
  assert.ok(intentContext(state).includes('PRIVATE_INTENT'))
  assert.ok(!intentContext(state).includes('CLOSED'))
  assert.equal(JSON.stringify(state), before)
  assert.equal(validState(JSON.parse(before)), true)
  assert.equal(validState({}), true)
  for (const invalid of [{ selfModel: { traits: ['x'], updatedAt: '1' } }, { intents: [{ text: 'x', at: 1, done: 'true' }] }]) {
    assert.equal(validState(invalid), false)
  }
})
