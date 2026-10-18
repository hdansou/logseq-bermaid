/**
 * Timers that keep time inside the plugin iframe.
 *
 * The iframe is hidden whenever the plugin shows no main UI, and Chromium then
 * aligns its timers to 1-second wake-ups: setTimeout(100) takes ~1000 ms. A
 * Worker's timers are not throttled (measured: 100 -> 102 ms), so every wait
 * goes through one small worker. Falls back to setTimeout where there is no
 * Worker (tests, very old hosts).
 */
const WORKER_SOURCE = `
const timers = new Map()
onmessage = ({ data: { id, ms, cancel } }) => {
  if (cancel) { clearTimeout(timers.get(id)); timers.delete(id); return }
  timers.set(id, setTimeout(() => { timers.delete(id); postMessage(id) }, ms))
}`

function makeTimerWorker(): Worker {
  return new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })))
}

export function createClock(makeWorker: () => Worker = makeTimerWorker) {
  let worker: Worker | null | undefined
  let nextId = 0
  const pending = new Map<number, () => void>()

  const getWorker = (): Worker | null => {
    if (worker === undefined) {
      try {
        worker = makeWorker()
        worker.onmessage = (e: MessageEvent<number>) => {
          const fn = pending.get(e.data)
          pending.delete(e.data)
          fn?.()
        }
      } catch {
        worker = null
      }
    }
    return worker
  }

  /** Run `fn` after `ms`; returns a cancel function. */
  const delay = (ms: number, fn: () => void): (() => void) => {
    const w = getWorker()
    if (!w) {
      const t = setTimeout(fn, ms)
      return () => clearTimeout(t)
    }
    const id = ++nextId
    pending.set(id, fn)
    w.postMessage({ id, ms })
    return () => {
      if (pending.delete(id)) w.postMessage({ id, cancel: true })
    }
  }

  const sleep = (ms: number): Promise<void> => new Promise(resolve => { delay(ms, resolve) })

  return { sleep, delay }
}

export const { sleep, delay } = createClock()
