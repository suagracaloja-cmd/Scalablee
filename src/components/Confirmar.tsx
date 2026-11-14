import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './ui'

type Pedido = { titulo: string; texto?: ReactNode; botao?: string; perigo?: boolean }
type Estado = Pedido & { responder: (ok: boolean) => void }

const Ctx = createContext<(p: Pedido) => Promise<boolean>>(async () => false)

/**
 * Janela de confirmação do próprio app (no lugar do "confirm" do navegador, que alguns navegadores
 * e apps pulam ou aceitam sozinhos). Uso: `if (!(await confirmar({ titulo: 'Excluir?' }))) return`.
 */
export const useConfirmar = () => useContext(Ctx)

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const cancelar = useRef<HTMLButtonElement>(null)

  const confirmar = useCallback(
    (p: Pedido) =>
      new Promise<boolean>((resolve) => {
        setEstado({ ...p, responder: (ok) => (setEstado(null), resolve(ok)) })
      }),
    [],
  )
  // Para não excluir por engano com Enter, o foco começa em "Cancelar"
  useEffect(() => {
    if (estado) setTimeout(() => cancelar.current?.focus(), 30)
  }, [estado])

  return (
    <Ctx.Provider value={confirmar}>
      {children}
      <Modal open={!!estado} onClose={() => estado?.responder(false)} title={estado?.titulo ?? ''}>
        {estado && (
          <div>
            {estado.texto && (
              <div className={`flex items-start gap-2.5 rounded-2xl p-3 text-sm leading-relaxed ${estado.perigo === false ? 'bg-panel-2 text-ink' : 'bg-rose-50 text-rose-900'}`}>
                {estado.perigo !== false && <AlertTriangle size={17} className="mt-0.5 shrink-0" />}
                <div className="min-w-0">{estado.texto}</div>
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button ref={cancelar} type="button" className="btn-ghost" onClick={() => estado.responder(false)}>
                Cancelar
              </button>
              <button type="button" className={estado.perigo === false ? 'btn-primary' : 'btn bg-rose-600 text-white hover:bg-rose-700'} onClick={() => estado.responder(true)}>
                {estado.botao ?? 'Excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
