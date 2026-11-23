import { MARK_PATH } from '../data/markPath'

/** Marca da SCALABLE (vetorizada a partir do arquivo oficial) e wordmark. A cor vem do texto ao redor. */

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="328 291 419 495" width={(size * 419) / 495} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={MARK_PATH} />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="rx-logo">
      <span className="rx-logo__mark">
        <Mark size={22} />
      </span>
      <span className="rx-logo__word">SCALABLE</span>
    </span>
  )
}
