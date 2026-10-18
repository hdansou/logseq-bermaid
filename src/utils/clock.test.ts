import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClock } from './clock'

/** Stands in for the timer worker: answers each {id, ms} with id after ms, honours {id, cancel}. */
class FakeWorker {
  onmessage: ((e: { data: number }) => void) | null = null
  posted: Array<{ id: number; ms?: number; cancel?: boolean }> = []
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  postMessage(msg: { id: number; ms?: number; cancel?: boolean }) {
    this.posted.push(msg)
    if (msg.cancel) { clearTimeout(this.timers.get(msg.id)); return }
    this.timers.set(msg.id, setTimeout(() => this.onmessage?.({ data: msg.id }), msg.ms))
  }
}

describe('createClock', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('sleeps on the worker, not on the page timer', async () => {
    const worker = new FakeWorker()
    const { sleep } = createClock(() => worker as unknown as Worker)
    let done = false
    void sleep(100).then(() => { done = true })
    expect(worker.posted).toEqual([{ id: 1, ms: 100 }])
    await vi.advanceTimersByTimeAsync(99)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('routes concurrent waits by id', async () => {
    const worker = new FakeWorker()
    const { sleep } = createClock(() => worker as unknown as Worker)
    const order: string[] = []
    void sleep(300).then(() => order.push('slow'))
    void sleep(100).then(() => order.push('fast'))
    await vi.advanceTimersByTimeAsync(300)
    expect(order).toEqual(['fast', 'slow'])
  })

  it('cancels a delay so its callback never runs', async () => {
    const worker = new FakeWorker()
    const { delay } = createClock(() => worker as unknown as Worker)
    const fn = vi.fn()
    const cancel = delay(350, fn)
    cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).not.toHaveBeenCalled()
    expect(worker.posted).toContainEqual({ id: 1, cancel: true })
  })

  it('creates the worker lazily, once', async () => {
    const make = vi.fn(() => new FakeWorker() as unknown as Worker)
    const { sleep } = createClock(make)
    expect(make).not.toHaveBeenCalled()
    void sleep(1); void sleep(1)
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('falls back to setTimeout when no worker can be created', async () => {
    const { sleep, delay } = createClock(() => { throw new Error('no Worker here') })
    let done = false
    void sleep(50).then(() => { done = true })
    const fn = vi.fn()
    delay(50, fn)()
    await vi.advanceTimersByTimeAsync(50)
    expect(done).toBe(true)
    expect(fn).not.toHaveBeenCalled()
  })
})
