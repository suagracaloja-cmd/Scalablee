import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReport } from '../../src/diagnostic/engine/report'
import { buildReportPdf, clean } from '../../src/diagnostic/lib/pdf'
import type { HistoryItem } from '../../src/diagnostic/lib/storage'
import { all, byDim, PROFILE, randomAnswers } from './helpers'

const AT = '2026-11-23T12:00:00.000Z'
const A = byDim({ financeiro: [0, 1, 0, 0, 1], atendimento: [2, 2, 3, 2, 2], comercial: [3, 3, 3, 2, 3], operacao: [2, 3, 2, 2, 2], gestao: [2, 2, 2, 2, 3] })
const B = byDim({ financeiro: [3, 3, 3, 3, 2], atendimento: [3, 2, 2, 3, 3], comercial: [0, 1, null, 0, 1], operacao: [0, 0, 1, 0, 0], gestao: [2, 2, 1, 2, 1] })

function pdfOf(a: ReturnType<typeof all>, over: Partial<typeof PROFILE> = {}, prev?: HistoryItem) {
  const report = buildReport({ ...PROFILE, ...over }, a, AT)
  const doc = buildReportPdf(report, { origin: 'https://exemplo.test', prev })
  return { report, doc, bytes: Buffer.from(doc.output('arraybuffer')) }
}

/** Extrai o texto com a ferramenta padrão (poppler), como um leitor de PDF faria. */
function text(bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'rx-pdf-'))
  const file = join(dir, 'r.pdf')
  writeFileSync(file, bytes)
  return execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
}
const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('PDF do relatório', () => {
  it('é um PDF válido, em A4, com várias páginas', () => {
    const { doc, bytes } = pdfOf(A)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4)
    const info = execFileSync('pdfinfo', ['-'], { input: bytes, encoding: 'utf8' })
    expect(info).toMatch(/Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/)
    expect(info).toMatch(/Title:\s+Raio-X da Gestão da Clínica/)
  })

  it('traz identificação, data, nota geral, mapa, cinco dimensões, três prioridades, plano e próximo passo', () => {
    const { report, bytes } = pdfOf(A, { clinic: 'Clínica Aurora', specialty: 'Odontologia' })
    const t = flat(text(bytes))
    expect(t).toContain('Raio-X da Gestão da Clínica')
    expect(t).toContain('Clínica Aurora')
    expect(t).toContain('Odontologia')
    expect(t).toContain('Mariana Souza')
    expect(t).toContain('23/11/2026')
    expect(t).toContain(`${report.scores.overall100}`)
    expect(t).toContain('/100')
    expect(t).toContain('Mapa de maturidade')
    for (const d of ['Gestão financeira', 'Atendimento e relacionamento', 'Gestão comercial', 'Operação e processos', 'Gestão e indicadores']) expect(t).toContain(d)
    expect(t).toContain('Análise por dimensão')
    expect(t).toContain('Os três principais pontos de atenção')
    for (const p of report.priorities) expect(t).toContain(`${p.rank}.`)
    expect(t).toContain('Plano inicial de evolução')
    for (const h of ['Agora', 'Próximos 30 dias', 'Próximos 90 dias']) expect(t).toContain(h)
    expect(t).toContain('O próximo passo da sua clínica')
    expect(t).toContain('Quero organizar a gestão da minha clínica')
    expect(t).toContain('https://exemplo.test/?cadastro=1&origem=raio-x')
    expect(t).toMatch(/Página 1 de \d+/)
  })

  it('contém o texto personalizado, e dois diagnósticos geram PDFs diferentes', () => {
    const a = flat(text(pdfOf(A, { clinic: 'Clínica A' }).bytes))
    const b = flat(text(pdfOf(B, { clinic: 'Clínica B' }).bytes))
    expect(a).toContain('Clínica A')
    expect(b).toContain('Clínica B')
    expect(a).toContain('As receitas não são registradas de forma sistemática')
    expect(b).not.toContain('As receitas não são registradas de forma sistemática')
    expect(b).toContain('Agendamentos e confirmações não seguem um processo')
    expect(a).not.toContain('Agendamentos e confirmações não seguem um processo')
  })

  it('mostra "não sei" como lacuna, nunca como zero', () => {
    const t = flat(text(pdfOf(B).bytes))
    expect(t).toMatch(/Você respondeu "não sei" em 1 de 25 perguntas \(4%\)\. Essas respostas não foram contadas como processo ausente/)
    expect(t).toMatch(/lacuna de informação/)
  })

  it('inclui a comparação quando há diagnóstico anterior', () => {
    const prev: HistoryItem = {
      token: 'x',
      completedAt: '2026-08-10T12:00:00.000Z',
      clinic: 'Clínica Aurora',
      overall100: 40,
      knownPct: 100,
      dims: { financeiro: 3, atendimento: 6, comercial: 9, operacao: 5, gestao: 7 },
    }
    const t = flat(text(pdfOf(A, {}, prev).bytes))
    expect(t).toContain('Comparação com o diagnóstico de 10/08/2026')
    expect(t).toContain('Nota geral')
    expect(flat(text(pdfOf(A).bytes))).not.toContain('Comparação com o diagnóstico')
  })

  it('não imprime lixo, e funciona para todos "não sei", tudo 0 e tudo 3', () => {
    for (const a of [all(null), all(0), all(3), randomAnswers(5, 0.9), randomAnswers(6, 0)]) {
      const { bytes, doc } = pdfOf(a)
      const t = text(bytes)
      expect(t).not.toMatch(/undefined|NaN|\[object|\$\{/)
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4)
      expect(t).toContain('Plano inicial de evolução')
    }
  })

  it('texto com caracteres fora do alfabeto do PDF não quebra a geração', () => {
    const { bytes } = pdfOf(A, { clinic: 'Clínica “Ômega” ✓ 😀 Saúde', name: 'Zoë', specialty: 'Ortopedia → Esporte' })
    const t = flat(text(bytes))
    expect(t).toContain('Clínica "Ômega"')
    expect(t).toContain('Zoë')
    expect(clean('a ✓ b → c “q” ‘s’ — – … •')).toBe('a  b  c "q" \'s\' — – … •')
  })

  it('nenhuma página passa das margens: o texto de cada página cabe no corpo', () => {
    const { doc } = pdfOf(B)
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
      const out = execFileSync('pdftotext', ['-f', String(i), '-l', String(i), '-bbox', '-', '-'], { input: Buffer.from(doc.output('arraybuffer')), encoding: 'utf8' })
      const ys = [...out.matchAll(/yMax="([\d.]+)"/g)].map((m) => Number(m[1]))
      expect(Math.max(...ys), `página ${i}`).toBeLessThanOrEqual(841.9)
    }
  })
})
