import { useEffect, useRef, useState } from 'react'

/** Número que "sobe" até o valor final; anima de novo quando o valor muda. */
export function useCountUp(value: number, duration = 1400, delay = 0) {
  const [display, setDisplay] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = from.current
    let raf = 0
    let t0 = 0
    const timer = setTimeout(() => {
      const step = (t: number) => {
        if (!t0) t0 = t
        const p = Math.min(1, (t - t0) / duration)
        const eased = 1 - Math.pow(1 - p, 3)
        const v = start + (value - start) * eased
        setDisplay(v)
        from.current = v
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [value, duration, delay])
  return display
}
