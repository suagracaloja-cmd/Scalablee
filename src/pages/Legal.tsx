import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Markdown } from '../components/Markdown'
import { Logo } from '../components/ui'
import { PRIVACIDADE, TERMOS } from '../lib/legal'

/** Páginas públicas: Termos de Uso e Política de Privacidade (abertas mesmo sem login). */
export default function Legal({ kind }: { kind: 'termos' | 'privacidade' }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" aria-label="Scalable">
            <Logo size={36} />
          </Link>
          <Link to="/" className="btn-ghost h-10 px-4 text-sm">
            <ArrowLeft size={16} /> Voltar
          </Link>
        </div>
        <article className="rounded-3xl border border-line bg-panel p-6 sm:p-10">
          <Markdown text={kind === 'termos' ? TERMOS : PRIVACIDADE} />
        </article>
        <p className="mt-6 text-center text-xs text-muted">
          <Link to="/termos" className="hover:text-ink">Termos de Uso</Link> · <Link to="/privacidade" className="hover:text-ink">Política de Privacidade</Link>
        </p>
      </div>
    </div>
  )
}
