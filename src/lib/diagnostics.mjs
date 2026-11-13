// 只记录固定路径和运行元数据，不记录参数、返回值、消息、念头或错误正文。
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'AbortError', 'TimeoutError'])
const safePath = (value) => typeof value === 'string' && /^[\w\u4e00-\u9fff./:-]{1,96}$/.test(value) ? value : 'unknown'

function errorMeta(error) {
  let name = 'Error', stack = ''
  try { if (ERROR_NAMES.has(error?.name)) name = error.name } catch {}
  try { if (typeof error?.stack === 'string') stack = error.stack } catch {}
  let location = null
  for (const line of stack.split('\n')) {
    if (!/^\s+at\s/.test(line)) continue
    const match = line.match(/(?:^|[/\\ (])([A-Za-z0-9_.-]{1,80}\.(?:[cm]?js|ts)):(\d{1,8}):(\d{1,8})\)?$/)
    if (match) {
      location = { file: match[1], line: Number(match[2]), column: Number(match[3]) }
      break
    }
  }
  return { name, location }
}

export function createDiagnostics(api, { setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout, now = Date.now } = {}) {
  let disposed = false, nextId = 0, failureSequence = 0
  let lastSuccess = null, lastCallback = null, lastFailure = null
  const registrations = [], timeouts = new Map(), cleanup = new Set()
  const counts = { registrations: 0, callbacks: 0, callbackSuccesses: 0, callbackFailures: 0, successes: 0, failures: 0 }
  const timestamp = () => { const at = now(); return Number.isFinite(at) ? at : 0 }
  const label = (kind, name) => safePath(kind + (typeof name === 'string' && name ? ':' + name : ''))

  function failure(path, error) {
    failureSequence++
    counts.failures++
    lastFailure = { path: safePath(path), at: timestamp(), count: counts.failures, error: errorMeta(error) }
    // 元数据单独拷贝；日志器永远拿不到原始 Error 对象或完整 stack。
    try { api.log?.warn?.('运行诊断失败', JSON.parse(JSON.stringify(lastFailure))) } catch {}
  }

  function success(path) {
    if (disposed) return
    counts.successes++
    lastSuccess = { path: safePath(path), at: timestamp(), count: counts.successes }
  }

  function wrap(fn, path, record, excluded = false) {
    if (typeof fn !== 'function') return fn
    return function (...args) {
      if (disposed || (record && !record.active)) return path.startsWith('tool:') ? { ok: false, message: '模块已停止' } : undefined
      if (excluded) return Reflect.apply(fn, this, args)
      counts.callbacks++
      if (record) record.calls++
      const before = failureSequence
      const finish = (failed) => {
        if (disposed) return
        if (failed || failureSequence !== before) {
          counts.callbackFailures++
          if (record) record.failures++
        } else {
          counts.callbackSuccesses++
          if (record) record.successes++
          lastCallback = { path, at: timestamp(), count: counts.callbackSuccesses }
        }
      }
      try {
        const result = Reflect.apply(fn, this, args)
        if (result && typeof result.then === 'function') {
          return Promise.resolve(result).then((value) => { finish(false); return value }, (error) => {
            if (!disposed) failure(path, error)
            finish(true)
            throw error
          })
        }
        finish(false)
        return result
      } catch (error) {
        if (!disposed) failure(path, error)
        finish(true)
        throw error
      }
    }
  }

  function recordFor(kind, path) {
    return { id: ++nextId, kind, path, active: true, calls: 0, successes: 0, failures: 0 }
  }

  function register(kind, path, makeArgs) {
    if (disposed) return () => {}
    const record = recordFor(kind, path)
    let off
    try { off = Reflect.apply(api[kind], api, makeArgs(record)) }
    catch (error) { failure(label('register', path), error); throw error }
    registrations.push(record)
    counts.registrations++
    if (typeof off !== 'function') return off
    const stop = function (...args) {
      if (!record.active) return undefined
      record.active = false
      cleanup.delete(stop)
      return Reflect.apply(off, this, args)
    }
    cleanup.add(stop)
    return stop
  }

  function wrapTool(value, record) {
    if (Array.isArray(value)) return value.map((item) => wrapTool(item, record))
    if (!value || typeof value !== 'object' || typeof value.execute !== 'function') return value
    return { ...value, execute: wrap(value.execute, label('tool', value.name), record) }
  }

  const overrides = {
    on(event, fn, ...rest) {
      const path = label('on', event)
      return register('on', path, (r) => [event, wrap(fn, path, r), ...rest])
    },
    every(ms, fn, name, ...rest) {
      const path = label('every', name)
      return register('every', path, (r) => [ms, wrap(fn, path, r), name, ...rest])
    },
    context(fn, ...rest) {
      return register('context', 'context', (r) => [wrap(fn, 'context', r), ...rest])
    },
    rule(fn, ...rest) {
      return register('rule', 'rule', (r) => [wrap(fn, 'rule', r), ...rest])
    },
    command(command, ...rest) {
      const path = label('command', command?.name)
      return register('command', path, (r) => [{ ...command, run: wrap(command?.run, path, r, command?.name === '情绪自检') }, ...rest])
    },
    tool(builder, ...rest) {
      const path = label('tool', typeof builder === 'object' ? builder?.name : 'builder')
      return register('tool', path, (r) => {
        if (typeof builder !== 'function') return [wrapTool(builder, r), ...rest]
        const wrappedBuilder = wrap(function (...args) {
          const result = Reflect.apply(builder, this, args)
          return result && typeof result.then === 'function'
            ? Promise.resolve(result).then((value) => wrapTool(value, r)) : wrapTool(result, r)
        }, path, r)
        return [wrappedBuilder, ...rest]
      })
    },
  }
  const forwarded = new Map()
  const wrappedApi = new Proxy(api, {
    get(target, key, receiver) {
      if (Object.hasOwn(overrides, key) && typeof target[key] === 'function') return overrides[key]
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      if (!forwarded.has(key) || forwarded.get(key).original !== value) forwarded.set(key, { original: value, bound: value.bind(target) })
      return forwarded.get(key).bound
    },
  })

  function clearTimer(handle) {
    if (!timeouts.has(handle)) return
    timeouts.delete(handle)
    cancel(handle)
  }

  function timeout(fn, ms, name = 'timer') {
    if (disposed) return null
    const path = label('timeout', name)
    const invoke = wrap(fn, path)
    const handle = schedule(() => {
      if (!timeouts.has(handle)) return
      timeouts.delete(handle)
      return invoke()
    }, ms)
    timeouts.set(handle, path)
    return handle
  }

  function snapshot() {
    const intervals = registrations.filter((r) => r.kind === 'every' && r.active).length
    return JSON.parse(JSON.stringify({
      disposed,
      registrations,
      counts: { ...counts, activeRegistrations: registrations.filter((r) => r.active).length },
      timers: { intervals, timeouts: timeouts.size, total: intervals + timeouts.size, scope: 'api.every + diagnostics.timeout; excludes model timeout' },
      lastSuccess, lastCallback, lastFailure,
    }))
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const handle of [...timeouts.keys()]) {
      try { clearTimer(handle) } catch (error) { failure('dispose:timeout', error) }
    }
    for (const stop of [...cleanup]) {
      try { stop() } catch (error) { failure('dispose:registration', error) }
    }
    for (const record of registrations) record.active = false
  }

  // 同时支持宿主自动卸载和入口显式 dispose；清理幂等。
  if (typeof api.onDispose === 'function') api.onDispose(dispose)
  return { api: wrappedApi, timeout, clearTimeout: clearTimer, success, failure, snapshot, dispose }
}
