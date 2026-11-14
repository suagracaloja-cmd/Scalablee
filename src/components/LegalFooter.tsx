import { Link } from 'react-router-dom'
import { CONTATOS, IDENTIFICACAO } from '../lib/legal-dados'

export const LEGAL_LINKS = [
  { to: '/termos', label: 'Termos de Uso' },
  { to: '/privacidade', label: 'Política de Privacidade' },
  { to: '/cookies', label: 'Política de Cookies' },
  { to: '/reembolso', label: 'Cancelamento e Reembolso' },
]

/** Rodapé com os documentos legais e a identificação da Scalable (usado em todas as telas). */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-muted ${className}`}>
      <nav aria-label="Documentos legais" className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="underline-offset-2 hover:text-ink hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-2">
        © {new Date().getFullYear()} {IDENTIFICACAO}
        {CONTATOS ? ` · ${CONTATOS}` : ''}
      </p>
    </footer>
  )
}
