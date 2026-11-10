import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Markdown } from '../components/Markdown'
import { LegalFooter } from '../components/LegalFooter'
import { Logo } from '../components/ui'
import { COOKIES, PRIVACIDADE, REEMBOLSO, TERMOS } from '../lib/legal'

const PAGES = {
  termos: { title: 'Termos de Uso', text: TERMOS },
  privacidade: { title: 'Política de Privacidade', text: PRIVACIDADE },
  cookies: { title: 'Política de Cookies', text: COOKIES },
  reembolso: { title: 'Política de Cancelamento e Reembolso', text: REEMBOLSO },
}
export type LegalKind = keyof typeof PAGES

/** Páginas públicas com os documentos legais (abertas mesmo sem login). */
export default function Legal({ kind }: { kind: LegalKind }) {
  const page = PAGES[kind]
  useEffect(() => {
    const before = document.title
    document.title = `${page.title} — Coraline AI`
    window.scrollTo(0, 0)
    return () => {
      document.title = before
    }
  }, [page.title])

  return (
    <div className="min-h-screen bg-bg px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" aria-label="Coraline AI — página inicial">
            <Logo size={36} />
          </Link>
          <Link to="/" className="btn-ghost h-10 px-4 text-sm">
            <ArrowLeft size={16} /> Voltar
          </Link>
        </div>
        <article className="rounded-3xl border border-line bg-panel p-6 sm:p-10">
          <Markdown text={page.text} />
        </article>
        <LegalFooter className="mt-6" />
      </div>
    </div>
  )
}
