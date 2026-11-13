import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAboveOwnMedian, loadPercentile } from '../lib/load.mjs'

const hist = (vals) => vals.map((v, i) => ({ at: i * 60_000, v }))

test('loadAboveOwnMedian only treats positive load above her own median as high', () => {
  const base = { loadHistory: hist([-20, -10, 0, 10, 20, 30, 40, 50]) }
  assert.equal(loadAboveOwnMedian({ ...base, hormones: { load: 60 } }), true)
  assert.equal(loadAboveOwnMedian({ ...base, hormones: { load: 15 } }), false)
  assert.equal(loadAboveOwnMedian({ ...base, hormones: { load: -30 } }), false)
})

test('loadPercentile is the share of her own history below current load', () => {
  const s = { loadHistory: hist([-20, -10, 0, 10, 20, 30, 40, 50]), hormones: { load: 25 } }
  assert.equal(loadPercentile(s), 5 / 8)
  assert.equal(loadPercentile({ ...s, hormones: { load: -1 } }), 0)
})
