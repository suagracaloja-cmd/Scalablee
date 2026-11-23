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
        expect(app, `${c.id} → ${name}`).toMatch(new RegExp(`import ${name} from './pages/${name}'`))
        expect(app, `${c.id} → <${name} />`).toContain(`<${name} />`)
      }
    }
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

  it('declara a falta de agenda, metas, equipe e projeção em vez de prometê-las', () => {
    expect(LIMITS['sem-agenda']).toMatch(/ainda não tem agenda/i)
    expect(LIMITS['sem-metas']).toMatch(/Ainda não há cadastro de metas/)
    expect(LIMITS['sem-equipe']).toMatch(/não há usuários separados/)
    expect(LIMITS['sem-projecao']).toMatch(/Não há projeção/)
    // Perguntas de agenda e metas não podem citar nenhum recurso.
    for (const id of ['com4', 'ope1', 'ope2', 'ges1', 'fin5'] as const) {
      expect(FITS[id].capabilities, id).toEqual([])
    }
  })

  it('nenhuma capacidade descreve agenda, prontuário, metas ou plano comercial', () => {
    const bad = /(agenda de consulta|agendamento|prontu[aá]rio|cadastro de metas|assinatura|mensalidade|pre[cç]o da plataforma|R\$)/i
    for (const c of Object.values(CAPABILITIES)) {
      expect(`${c.label} ${c.description}`, c.id).not.toMatch(bad)
    }
  })

  it('o que depende da IA ou de configuração externa é dito', () => {
    expect(CAPABILITIES.whatsapp.ai).toMatch(/depend[em]+ de a IA/)
    expect(CAPABILITIES.whatsapp.setup).toMatch(/WhatsApp Business/)
    expect(CAPABILITIES.assistente.description).toMatch(/Sem a IA ativada/)
    expect(CAPABILITIES.aprovacoes.description).toMatch(/Com a IA da plataforma ativada/)
    expect(FITS.ate1.text).toMatch(/com a IA da plataforma ativada/)
  })
})
