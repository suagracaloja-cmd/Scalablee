import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './rx.css'
import { DiagnosticProvider } from './Provider'
import { useDiagnostic } from './context'
import { Mark } from './components/Logo'
import Intro from './pages/Intro'
import Identify from './pages/Identify'
import Quiz from './pages/Quiz'
import Analyzing from './pages/Analyzing'
import Result from './pages/Result'

/** Se há um token mas nenhum rascunho local (dados do navegador limpos pela metade), consulta o servidor antes de decidir a tela. */
function Restore({ children }: { children: React.ReactNode }) {
  const { token, profile, hydrate } = useDiagnostic()
  const [checking, setChecking] = useState(!!token && !profile)
  useEffect(() => {
    if (!checking) return
    let alive = true
    hydrate().finally(() => alive && setChecking(false))
    return () => {
      alive = false
    }
  }, [checking, hydrate])
  if (checking)
    return (
      <div className="rx-boot" role="status" aria-label="Carregando">
        <Mark size={28} />
      </div>
    )
  return <>{children}</>
}

export default function DiagnosticApp() {
  // O título volta ao original quando o usuário sai do diagnóstico para o resto da plataforma.
  useEffect(() => {
    const original = document.title
    return () => {
      document.title = original
    }
  }, [])

  return (
    <DiagnosticProvider>
      <div className="rx">
        <Restore>
          <Routes>
            <Route index element={<Intro />} />
            <Route path="identificacao" element={<Identify />} />
            <Route path="pergunta/:n" element={<Quiz />} />
            <Route path="analise" element={<Analyzing />} />
            <Route path="resultado" element={<Result />} />
            <Route path="*" element={<Navigate to="/diagnostico" replace />} />
          </Routes>
        </Restore>
      </div>
    </DiagnosticProvider>
  )
}
