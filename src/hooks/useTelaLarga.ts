import { useEffect, useState } from 'react'

/** true em telas de computador (a partir de 768 px). Serve para desenhar só a versão da lista que aparece. */
export function useTelaLarga(min = 768) {
  const consulta = `(min-width: ${min}px)`
  const [larga, setLarga] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const mudou = () => setLarga(m.matches)
    mudou()
    m.addEventListener('change', mudou)
    return () => m.removeEventListener('change', mudou)
  }, [consulta])
  return larga
}
