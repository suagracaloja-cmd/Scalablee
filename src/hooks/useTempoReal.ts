import { useEffect, useRef } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type TabelaAoVivo = { tabela: string; filtro?: string }
export type EventoAoVivo = RealtimePostgresChangesPayload<Record<string, unknown>> & { table: string }

/** Depois de quanto tempo escondida a aba devolve a conexão em tempo real (cada aba aberta ocupa uma vaga do plano). */
export const SOLTAR_ESCONDIDA_MS = 60_000

/**
 * Atualização em tempo real econômica, usada por todas as telas:
 *  - vários eventos seguidos viram UMA recarga (`aoMudar` recebe todos os eventos do intervalo);
 *  - aba escondida: não recarrega nada e, depois de 1 minuto, solta a conexão;
 *    ao voltar, conecta de novo e recarrega uma vez;
 *  - se a conexão cair e voltar, recarrega para não perder o que mudou nesse meio tempo.
 * `nome` null = desligado (ex.: clínica ainda não carregada).
 */
export function useTempoReal(nome: string | null, tabelas: TabelaAoVivo[], aoMudar: (eventos: EventoAoVivo[]) => void, espera = 800) {
  const cb = useRef(aoMudar)
  cb.current = aoMudar
  const chave = JSON.stringify(tabelas)

  useEffect(() => {
    if (!nome) return
    const lista = JSON.parse(chave) as TabelaAoVivo[]
    let canal: ReturnType<typeof supabase.channel> | null = null
    let fila: EventoAoVivo[] = []
    let timer: number | undefined
    let soltar: number | undefined
    let pendente = false
    let jaInscrito = false

    const disparar = () => {
      const eventos = fila
      fila = []
      cb.current(eventos)
    }
    const agendar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (document.hidden) pendente = true
        else disparar()
      }, espera)
    }
    const ligar = () => {
      if (canal) return
      let c = supabase.channel(`${nome}:${Math.random().toString(36).slice(2, 8)}`)
      for (const t of lista) {
        c = c.on('postgres_changes', { event: '*', schema: 'public', table: t.tabela, ...(t.filtro ? { filter: t.filtro } : {}) }, (p) => {
          fila.push({ ...(p as RealtimePostgresChangesPayload<Record<string, unknown>>), table: t.tabela })
          agendar()
        })
      }
      canal = c.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // Reconectou (queda de rede ou volta da aba): recarrega para pegar o que mudou enquanto estava fora
        if (jaInscrito && !document.hidden) disparar()
        jaInscrito = true
      })
    }
    const desligar = () => {
      if (!canal) return
      supabase.removeChannel(canal)
      canal = null
    }
    const aoTrocarVisibilidade = () => {
      if (document.hidden) {
        soltar = window.setTimeout(desligar, SOLTAR_ESCONDIDA_MS)
        return
      }
      window.clearTimeout(soltar)
      if (!canal) ligar() // ao conectar de novo, a inscrição recarrega (jaInscrito)
      else if (pendente) {
        pendente = false
        disparar()
      }
    }

    ligar()
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)
    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
      window.clearTimeout(timer)
      window.clearTimeout(soltar)
      desligar()
    }
  }, [nome, chave, espera])
}
