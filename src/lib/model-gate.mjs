// One module-owned model request at a time, including across hot reloads.
// api.ask has no cancellation contract: a timed-out request keeps its slot
// until the underlying promise actually settles.
const safeError = (code, cause) => Object.assign(new Error(code), { code, ...(cause ? { cause } : {}) })
const categoryOf = (error) => /transport|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket|\b429\b|rate.?limit/i
  .test(String(error?.code || '') + ' ' + String(error?.message || '')) ? 'transport' : 'error'
const safeKind = (kind) => ['appraise', 'solo', 'weekly'].includes(kind) ? kind : 'background'

export function createModelGate({ ask, log = () => {}, shared = {}, timeoutMs = 60_000, cooldownMs = 60_000, now = Date.now }) {
  if (typeof ask !== 'function') throw new TypeError('ask must be a function')
  timeoutMs = Math.max(1, Number(timeoutMs) || 60_000)
  cooldownMs = Math.max(1, Number(cooldownMs) || 60_000)
  shared.failures = Math.max(0, Number(shared.failures) || 0)
  shared.until = Math.max(0, Number(shared.until) || 0)
  shared.sequence = Math.max(0, Number(shared.sequence) || 0)
  let disposed = false
  let current = null

  const report = (event, token, category = '') => {
    if (disposed) return
    // Only metadata belongs here. Do not include error.message, inputs or outputs.
    const line = `[model-gate] ${event} kind=${token.kind} id=${token.id} durationMs=${Math.max(0, now() - token.startedAt)}${category ? ` category=${category}` : ''}`
    try { log(line) } catch { /* Observability must not break model work. */ }
  }

  function recordFailure(category) {
    if (category === 'timeout' || category === 'transport') {
      shared.failures++
      if (category === 'timeout' || shared.failures >= 2) shared.until = now() + cooldownMs
    } else {
      shared.failures = 0
    }
  }

  async function run(kind, opts) {
    if (disposed) throw safeError('MODEL_DISPOSED')
    if (shared.active) throw safeError('MODEL_BUSY')
    if (now() < shared.until) throw safeError('MODEL_COOLDOWN')
    const token = { id: ++shared.sequence, kind: safeKind(kind), startedAt: now() }
    // Reserve synchronously, before the first await / microtask.
    shared.active = token
    let done = false
    let timedOut = false
    let timer

    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        if (current === control) current = null
        if (error) reject(error)
        else resolve(value)
      }
      const control = { cancel: () => finish(safeError('MODEL_DISPOSED')) }
      current = control
      timer = setTimeout(() => {
        if (disposed) { finish(safeError('MODEL_DISPOSED')); return }
        timedOut = true
        recordFailure('timeout')
        report('timeout', token, 'timeout')
        finish(safeError('MODEL_TIMEOUT'))
      }, timeoutMs)
      Promise.resolve().then(() => {
        if (disposed) throw safeError('MODEL_DISPOSED')
        report('start', token)
        return ask(opts)
      }).then(
        (value) => settle(null, value),
        (error) => settle(error),
      )

      function settle(error, value) {
        // A late / disposed request may release its own slot, never a newer slot.
        if (shared.active === token) shared.active = null
        clearTimeout(timer)
        if (disposed) { finish(safeError('MODEL_DISPOSED')); return }
        const category = error ? categoryOf(error) : 'success'
        if (timedOut) {
          report('settled', token, `late-${category}`)
          return
        }
        if (error) {
          recordFailure(category)
          report('failure', token, category)
          finish(safeError(category === 'transport' ? 'MODEL_TRANSPORT' : 'MODEL_ERROR', error))
        } else {
          shared.failures = 0
          shared.until = 0
          report('success', token, 'success')
          finish(null, value)
        }
      }
    })
  }

  return {
    run,
    dispose() {
      disposed = true
      current?.cancel()
      // Deliberately keep shared.active: disposing is not cancelling api.ask.
    },
    status() {
      return {
        active: Boolean(shared.active),
        activeId: shared.active?.id ?? null,
        activeKind: shared.active?.kind ?? null,
        activeDurationMs: shared.active ? Math.max(0, now() - shared.active.startedAt) : 0,
        cooldownRemainingMs: Math.max(0, shared.until - now()),
        failures: shared.failures,
        disposed,
      }
    },
  }
}
