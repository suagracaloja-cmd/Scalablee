import { useEffect, useState } from 'react'

/** true quando a página já desceu um pouco. Só muda de valor ao cruzar o limite (não re-renderiza a cada pixel). */
export function useRolou(limite = 8) {
  const [rolou, setRolou] = useState(() => typeof window !== 'undefined' && window.scrollY > limite)
  useEffect(() => {
    let pedido = 0
    const medir = () => {
      pedido = 0
      setRolou(window.scrollY > limite)
    }
    const aoRolar = () => {
      if (!pedido) pedido = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      window.removeEventListener('scroll', aoRolar)
      if (pedido) cancelAnimationFrame(pedido)
    }
  }, [limite])
  return rolou
}
