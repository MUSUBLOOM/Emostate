import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBond } from '../lib/relationship.mjs'

test('bond gains shrink continuously as the existing upper bound approaches', () => {
  for (const [before, expected] of [[0, 6], [50, 53], [94, 94.36], [99, 99.06], [100, 100]]) {
    assert.ok(Math.abs(applyBond(before, 6) - expected) < 1e-10)
  }
  assert.ok(applyBond(94, 6) - 94 < applyBond(50, 6) - 50)
  assert.ok(applyBond(99, 6) > 99, '接近上限仍可保留小数增量，不提前取整归零')
})

test('equal losses exceed attenuated gains without multiplying model negative scores', () => {
  for (const bond of [10, 50, 94, 100]) {
    assert.equal(applyBond(bond, -6), bond - 6)
    assert.ok(bond - applyBond(bond, -6) > applyBond(bond, 6) - bond)
  }
  assert.equal(applyBond(2, -6), 0, '下界处只扣到零，不透支或反向加分')
  assert.equal(applyBond(0, -6), 0)
})

test('all legal model bond deltas stay bounded, preserve direction and never amplify', () => {
  for (let bond = 0; bond <= 100; bond++) {
    for (let delta = -8; delta <= 8; delta++) {
      const result = applyBond(bond, delta)
      assert.ok(result >= 0 && result <= 100)
      assert.ok(Math.abs(result - bond) <= Math.abs(delta) + 1e-10)
      assert.ok(delta >= 0 ? result >= bond : result <= bond)
      if (delta === 0) assert.equal(result, bond)
    }
  }
})

test('repeated positive appraisals approach the upper bound with diminishing increments', () => {
  let bond = 94, previousGain = Infinity
  for (let i = 0; i < 20; i++) {
    const next = applyBond(bond, 6), gain = next - bond
    assert.ok(gain > 0 && gain < previousGain)
    assert.ok(next < 100)
    previousGain = gain
    bond = next
  }
})

test('relationship conversion rejects invalid numeric input instead of fabricating a score', () => {
  for (const invalid of [NaN, Infinity, undefined, '6']) {
    assert.throws(() => applyBond(50, invalid), /invalid bond input/)
    assert.throws(() => applyBond(invalid, 6), /invalid bond input/)
  }
})
