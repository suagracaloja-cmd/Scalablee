import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITIES, FITS, LIMITS } from '../../src/diagnostic/data/capabilities'
import { QUESTIONS } from '../../src/diagnostic/data/questions'

const root = resolve(__dirname, '../..')

describe('conexão com a plataforma só promete o que existe', () => {
  it('toda capacidade aponta para arquivos que existem no repositório', () => {
    for (const c of Object.values(CAPABILITIES)) {
      expect(c.evidence.length, c.id).toBeGreaterThan(0)
      for (const f of c.evidence) expect(existsSync(resolve(root, f)), `${c.id} → ${f}`).toBe(true)
    }
  })

  it('toda página citada como evidência está de fato roteada no App', () => {
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    for (const c of Object.values(CAPABILITIES)) {
      for (const f of c.evidence.filter((e) => e.startsWith('src/pages/'))) {
        const name = f.replace('src/pages/', '').replace('.tsx', '')
        // As telas entram por import direto ou carregadas sob demanda.
        expect(app, `${c.id} → ${name}`).toMatch(new RegExp(`from './pages/${name}'|import\\('./pages/${name}'\\)`))
        expect(app, `${c.id} → <${name} />`).toMatch(new RegExp(`<${name}[\\s/>]`))
      }
    }
  })

  it('o código que faz o que o relatório promete está mesmo lá', () => {
    const read = (f: string) => readFileSync(resolve(root, f), 'utf8')
    // agenda: situações e ações de confirmação e falta
    expect(read('supabase/migrations/0011_clinica_equipe_agenda.sql')).toMatch(/'agendado', 'confirmado', 'realizado', 'faltou', 'cancelado'/)
    expect(read('src/pages/Agenda.tsx')).toMatch(/onStatus\(a, 'confirmado'\)/)
    expect(read('src/pages/Agenda.tsx')).toMatch(/onStatus\(a, 'faltou'\)/)
    // funil e conversão
    expect(read('src/lib/types.ts')).toMatch(/'novo' \| 'contato' \| 'agendado' \| 'compareceu' \| 'orcamento' \| 'fechado' \| 'perdido'/)
    expect(read('supabase/functions/api/lib/tools.ts')).toMatch(/conversao_pct/)
    expect(read('supabase/functions/api/lib/tools.ts')).toMatch(/name: "funil_vendas"/)
    // horários livres
    expect(read('supabase/functions/api/lib/agenda.ts')).toMatch(/name: "agenda_horarios_livres"/)
    // equipe e papéis
    expect(read('supabase/migrations/0011_clinica_equipe_agenda.sql')).toMatch(/papel in \('recepcao', 'profissional'\)/)
    // prontuário
    expect(read('supabase/migrations/0013_prontuario.sql')).toMatch(/create table public\.(anamneses|evolucoes|prontuario_acessos)/)
    // regras da análise
    const analise = read('supabase/functions/api/lib/analise.ts')
    expect(analise).toMatch(/Sem comprar há mais de 30 dias/)
    expect(analise).toMatch(/Leads sem contato há 3\+ dias/)
  })

  it('o diagnóstico tem uma conexão para cada uma das 25 perguntas', () => {
    expect(Object.keys(FITS).sort()).toEqual(QUESTIONS.map((q) => q.id).sort())
  })

  it('toda conexão cita capacidades e limites que existem no registro', () => {
    for (const [id, fit] of Object.entries(FITS)) {
      for (const c of fit.capabilities) expect(CAPABILITIES[c], `${id} → ${c}`).toBeDefined()
      for (const l of fit.limits) expect(LIMITS[l], `${id} → ${l}`).toBeDefined()
      // Sem texto de recurso, só pode haver limite a declarar.
      if (!fit.text) {
        expect(fit.capabilities, id).toEqual([])
        expect(fit.limits.length, id).toBeGreaterThan(0)
      }
    }
  })

  it('declara o que de fato não existe (metas, projeção, reclamações, procedimentos, taxa de faltas, ociosidade)', () => {
    expect(LIMITS['sem-metas']).toMatch(/Ainda não há cadastro de metas/)
    expect(LIMITS['sem-projecao']).toMatch(/Não há projeção/)
    expect(LIMITS['sem-reclamacoes']).toMatch(/Não há registro estruturado de reclamações/)
    expect(LIMITS['sem-taxa-faltas']).toMatch(/não calcula a taxa de faltas/)
    expect(LIMITS['sem-ociosidade']).toMatch(/Não há relatório de agenda ociosa/)
    // Perguntas sobre metas e planejamento financeiro não citam nenhum recurso.
    for (const id of ['ges1', 'fin5'] as const) expect(FITS[id].capabilities, id).toEqual([])
  })

  it('não nega recursos que existem: agenda, equipe, prontuário e funil aparecem como recursos', () => {
    const all = Object.values(LIMITS).join(' ')
    expect(all).not.toMatch(/não tem agenda|sem agenda|não há agenda|usuários separados|não há equipe/i)
    for (const id of ['agenda', 'confirmacao', 'equipe', 'prontuario', 'pacientes', 'funil-conversao', 'horarios-livres']) {
      expect(CAPABILITIES[id], id).toBeDefined()
    }
    expect(FITS.ope1.capabilities).toContain('agenda')
    expect(FITS.ope2.capabilities).toContain('confirmacao')
    expect(FITS.ope3.capabilities).toContain('equipe')
    expect(FITS.com3.capabilities).toContain('funil-conversao')
  })

  it('não descreve preço, cobrança nem condição comercial da plataforma', () => {
    const bad = /(assinatura|mensalidade|pre[cç]o da plataforma|plano pago|gr[aá]tis|teste gr[aá]tis|R\$)/i
    for (const c of Object.values(CAPABILITIES)) expect(`${c.label} ${c.description}`, c.id).not.toMatch(bad)
    for (const [id, f] of Object.entries(FITS)) expect(f.text ?? '', id).not.toMatch(bad)
  })

  it('o que depende da IA ou de configuração externa é dito', () => {
    expect(CAPABILITIES.whatsapp.ai).toMatch(/dependem de a IA/)
    expect(CAPABILITIES.whatsapp.setup).toMatch(/WhatsApp Business/)
    for (const id of ['coraline', 'funil-conversao', 'horarios-livres']) expect(CAPABILITIES[id].ai, id).toMatch(/IA da plataforma/)
    // o que funciona sem IA diz que funciona sem IA
    expect(CAPABILITIES.analise.description).toMatch(/mesmo sem IA/)
  })
})
