import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { QUESTIONS } from './data/questions'
import { DiagnosticContext, type DiagnosticState, type SyncState } from './context'
import { buildReport } from './engine/report'
import type { Answer, Answers, Profile, QuestionId, Report } from './engine/types'
import { DiagError, diagComplete, diagDelete, diagGet, diagSaveAnswer, diagStart } from './lib/api'
import { store } from './lib/storage'

export function DiagnosticProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => store.token())
  const [profile, setProfile] = useState<Profile | null>(() => store.draft()?.profile ?? null)
  const [answers, setAnswers] = useState<Answers>(() => store.draft()?.answers ?? {})
  const [report, setReport] = useState<Report | null>(null)
  const [sync, setSync] = useState<SyncState>('idle')

  // Referências para a fila de salvamento ler sempre o valor mais recente.
  const tokenRef = useRef(token)
  const answersRef = useRef(answers)
  const [initialStart] = useState(() => store.draft()?.startedAt ?? new Date().toISOString())
  const startedAt = useRef(initialStart)
  const unsynced = useRef(new Set<QuestionId>())
  const chain = useRef<Promise<void>>(Promise.resolve())

  const persist = useCallback((p: Profile | null, a: Answers) => {
    if (p) store.setDraft({ profile: p, answers: a, startedAt: startedAt.current })
  }, [])

  const flush = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const tk = tokenRef.current
      if (!tk || unsynced.current.size === 0) return
      setSync('saving')
      for (const id of [...unsynced.current]) {
        const v = answersRef.current[id]
        if (v === undefined) {
          unsynced.current.delete(id)
          continue
        }
        try {
          await diagSaveAnswer(tk, id, v)
          if (answersRef.current[id] === v) unsynced.current.delete(id)
        } catch (e) {
          // Recusa de regra (sessão encerrada, por exemplo): não adianta tentar de novo.
          if (e instanceof DiagError && !e.transient) unsynced.current.delete(id)
          else {
            setSync('offline')
            return
          }
        }
      }
      setSync(unsynced.current.size ? 'offline' : 'saved')
    })
  }, [])

  // Voltou a conexão: reenvia o que ficou pendente.
  useEffect(() => {
    const on = () => flush()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [flush])

  const setToken = useCallback((t: string | null) => {
    tokenRef.current = t
    setTokenState(t)
    if (t) store.setToken(t)
    else store.clearToken()
  }, [])

  const begin = useCallback<DiagnosticState['begin']>(
    async (p, marketing) => {
      const { token: t } = await diagStart(p, marketing)
      unsynced.current.clear()
      startedAt.current = new Date().toISOString()
      answersRef.current = {}
      setToken(t)
      setProfile(p)
      setAnswers({})
      setReport(null)
      setSync('idle')
      store.setProfile(p)
      persist(p, {})
    },
    [persist, setToken],
  )

  const setAnswer = useCallback(
    (id: QuestionId, value: Answer) => {
      const next = { ...answersRef.current, [id]: value }
      answersRef.current = next
      setAnswers(next)
      persist(profile, next)
      unsynced.current.add(id)
      flush()
    },
    [flush, persist, profile],
  )

  const complete = useCallback<DiagnosticState['complete']>(async () => {
    const tk = tokenRef.current
    if (!tk || !profile) throw new DiagError('invalid_session')
    const a = answersRef.current
    if (QUESTIONS.some((q) => a[q.id] === undefined)) throw new DiagError('incomplete_answers')
    const r = buildReport(profile, a)
    await diagComplete(tk, a, r)
    setReport(r)
    unsynced.current.clear()
    store.addHistory({
      token: tk,
      completedAt: r.generatedAt,
      clinic: profile.clinic,
      overall100: r.scores.overall100,
      knownPct: r.scores.knownPct,
      dims: Object.fromEntries(Object.values(r.scores.dims).map((d) => [d.id, d.score15])) as never,
    })
    store.clearDraft()
    return r
  }, [profile])

  const hydrate = useCallback<DiagnosticState['hydrate']>(async () => {
    const tk = tokenRef.current
    if (!tk) return 'none'
    if (report) return 'ok'
    let s
    try {
      s = await diagGet(tk)
    } catch {
      // Sem rede: se o rascunho local existe, a jornada continua a partir dele.
      return store.draft() ? 'in_progress' : 'none'
    }
    if (!s) {
      setToken(null)
      return 'none'
    }
    setProfile(s.profile)
    if (s.status === 'completed' && s.report) {
      setAnswers(s.answers)
      answersRef.current = s.answers
      setReport(s.report)
      return 'ok'
    }
    const merged = { ...s.answers, ...answersRef.current }
    answersRef.current = merged
    setAnswers(merged)
    persist(s.profile, merged)
    return 'in_progress'
  }, [persist, report, setToken])

  const open = useCallback((t: string) => {
    unsynced.current.clear()
    answersRef.current = {}
    setProfile(null)
    setAnswers({})
    setReport(null)
    setSync('idle')
    store.clearDraft()
    setToken(t)
  }, [setToken])

  const restart = useCallback(() => {
    unsynced.current.clear()
    answersRef.current = {}
    setToken(null)
    setProfile(null)
    setAnswers({})
    setReport(null)
    setSync('idle')
    store.clearDraft()
  }, [setToken])

  const erase = useCallback(async () => {
    const tokens = [...new Set([tokenRef.current, ...store.history().map((h) => h.token)].filter((t): t is string => !!t))]
    for (const t of tokens) await diagDelete(t) // se falhar, nada local é apagado e o usuário é avisado
    restart()
    store.clearProfile()
    for (const t of tokens) store.removeHistory(t)
  }, [restart])

  const answeredCount = useMemo(() => QUESTIONS.filter((q) => answers[q.id] !== undefined).length, [answers])
  const firstUnanswered = useMemo(() => {
    const i = QUESTIONS.findIndex((q) => answers[q.id] === undefined)
    return i === -1 ? 26 : i + 1
  }, [answers])

  const value = useMemo<DiagnosticState>(
    () => ({
      profile,
      answers,
      token,
      report,
      sync,
      answeredCount,
      firstUnanswered,
      inProgress: !!token && !report && !!profile,
      begin,
      setAnswer,
      complete,
      hydrate,
      open,
      restart,
      erase,
    }),
    [profile, answers, token, report, sync, answeredCount, firstUnanswered, begin, setAnswer, complete, hydrate, open, restart, erase],
  )

  return <DiagnosticContext.Provider value={value}>{children}</DiagnosticContext.Provider>
}
