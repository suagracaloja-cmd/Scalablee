import { jsPDF } from 'jspdf'
import { CAPABILITIES } from '../data/capabilities'
import { MARK_PATH, MARK_VIEWBOX } from '../data/markPath'
import { DIMENSIONS, DIMENSION_BY_ID, QUESTION_BY_ID } from '../data/questions'
import { BAND_LABEL, BAND_RANGE, TEAM_LABEL } from '../engine/content'
import { fmtScore, isLowConfidence } from '../engine/score'
import type { Band, Report } from '../engine/types'
import { SIGNUP_URL } from './events'
import { fmtDate, shortId } from './format'
import type { HistoryItem } from './storage'

/**
 * Relatório em PDF, gerado no navegador (sem serviço externo). Vetorial, com texto selecionável.
 * Fontes padrão do PDF (Helvetica): por isso todo texto passa por `clean`, que troca o que a fonte não cobre.
 */

type RGB = [number, number, number]
const INK: RGB = [11, 13, 18]
const TEXT2: RGB = [64, 72, 88]
const MUTED: RGB = [102, 111, 130]
const LINE: RGB = [216, 221, 229]
const ACCENT: RGB = [27, 111, 194] // o azul da marca, escurecido para ter contraste sobre papel branco
const BAND_RGB: Record<Band, RGB> = { critical: [196, 52, 58], attention: [190, 130, 20], developing: [27, 111, 194], established: [22, 140, 90] }

const M = 18 // margem lateral (mm)
const W = 210 - 2 * M
const TOP = 28
const BOTTOM = 280

const EXTRA_OK = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026])
/** Mantém só o que a fonte padrão do PDF consegue desenhar. */
export function clean(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.codePointAt(0) as number
      if (ch === '“' || ch === '”') return '"'
      if (ch === '‘' || ch === '’') return "'"
      if (c === 0xa0 || c === 0x202f) return ' '
      return c <= 0xff || EXTRA_OK.has(c) ? ch : ''
    })
    .join('')
}

class Pen {
  y = TOP
  doc: jsPDF
  constructor(doc: jsPDF) {
    this.doc = doc
  }

  ensure(h: number) {
    if (this.y + h > BOTTOM) {
      this.doc.addPage()
      this.y = TOP
    }
  }

  text(
    raw: string,
    o: { size?: number; color?: RGB; bold?: boolean; x?: number; w?: number; after?: number; lh?: number; charSpace?: number } = {},
  ): number {
    const { size = 9.5, color = TEXT2, bold = false, x = M, w = W, after = 0, lh = 1.5, charSpace = 0 } = o
    const d = this.doc
    d.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...color)
    const lines = d.splitTextToSize(clean(raw), w) as string[]
    const step = size * 0.3528 * lh
    this.ensure(step * Math.min(lines.length, 2))
    for (const line of lines) {
      this.ensure(step)
      d.text(line, x, this.y + size * 0.3528, charSpace ? { charSpace } : undefined)
      this.y += step
    }
    this.y += after
    return lines.length
  }

  /** Começa uma seção: continua na página se couber `min` mm; senão, abre outra. */
  section(min: number) {
    if (this.y + min > BOTTOM) {
      this.doc.addPage()
      this.y = TOP
    } else {
      this.y += 10
    }
  }

  rule(after = 4, color: RGB = LINE) {
    this.ensure(2)
    this.doc.setDrawColor(...color).setLineWidth(0.2).line(M, this.y, M + W, this.y)
    this.y += after
  }

  bullet(raw: string, o: { x?: number; w?: number } = {}) {
    const x = o.x ?? M
    const w = o.w ?? W
    this.ensure(7)
    const y0 = this.y
    this.doc.setDrawColor(...MUTED).setLineWidth(0.25).line(x, y0 + 2.2, x + 1.8, y0 + 2.2)
    this.text(raw, { x: x + 4.5, w: w - 4.5, after: 1.6 })
  }

  heading(raw: string, size = 14, after = 3) {
    this.ensure(14)
    this.text(raw, { size, color: INK, bold: true, after, lh: 1.25 })
  }
}

function drawMark(doc: jsPDF, x: number, y: number, h: number, color: RGB) {
  // Converte o contorno SVG (curvas de Bézier absolutas) em segmentos relativos, como o jsPDF espera.
  const nums = MARK_PATH.replace(/[MC]/g, ' ').trim().split(/[\s,]+/).map(Number)
  const pts: [number, number][] = []
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
  const s = h / MARK_VIEWBOX.h
  const segs: number[][] = []
  let [cx, cy] = pts[0]
  for (let i = 1; i + 2 < pts.length; i += 3) {
    const [a, b, c] = [pts[i], pts[i + 1], pts[i + 2]]
    segs.push([a[0] - cx, a[1] - cy, b[0] - cx, b[1] - cy, c[0] - cx, c[1] - cy])
    ;[cx, cy] = c
  }
  doc.setFillColor(...color)
  doc.lines(segs, x + (pts[0][0] - MARK_VIEWBOX.x) * s, y + (pts[0][1] - MARK_VIEWBOX.y) * s, [s, s], 'F', true)
}

function drawRadar(doc: jsPDF, cx: number, cy: number, r: number, values: (number | null)[]) {
  const ang = (i: number) => ((-90 + 72 * i) * Math.PI) / 180
  const pt = (i: number, rr: number): [number, number] => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))]
  doc.setDrawColor(...LINE).setLineWidth(0.25)
  for (const v of [4, 8, 12, 15]) {
    const p = DIMENSIONS.map((_, i) => pt(i, (v / 15) * r))
    for (let i = 0; i < 5; i++) doc.line(p[i][0], p[i][1], p[(i + 1) % 5][0], p[(i + 1) % 5][1])
  }
  for (let i = 0; i < 5; i++) {
    const [x, y] = pt(i, r)
    doc.line(cx, cy, x, y)
  }
  const poly = values.map((v, i) => pt(i, ((v ?? 0) / 15) * r))
  const segs = poly.slice(1).map((p, i) => [p[0] - poly[i][0], p[1] - poly[i][1]])
  doc.setFillColor(...ACCENT).setDrawColor(...ACCENT).setLineWidth(0.5)
  // preenchimento translúcido, depois o contorno
  doc.saveGraphicsState()
  doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.16 }))
  doc.lines(segs, poly[0][0], poly[0][1], [1, 1], 'F', true)
  doc.restoreGraphicsState()
  doc.lines(segs, poly[0][0], poly[0][1], [1, 1], 'S', true)
  poly.forEach(([x, y], i) => {
    if (values[i] !== null) doc.circle(x, y, 0.9, 'F')
  })
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...TEXT2)
  DIMENSIONS.forEach((d, i) => {
    const [x, y] = pt(i, r + 5)
    const c = Math.cos(ang(i))
    doc.text(d.short, x, y + 1, { align: c > 0.3 ? 'left' : c < -0.3 ? 'right' : 'center' })
  })
}

export interface PdfOptions {
  /** Diagnóstico anterior deste navegador, para a comparação. */
  prev?: HistoryItem | null
}

export function buildReportPdf(r: Report, opts: PdfOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false })
  doc.setProperties({ title: `Raio-X da Gestão da Clínica - ${clean(r.profile.clinic)}`, subject: 'Diagnóstico de gestão', creator: 'SCALABLE' })
  const p = new Pen(doc)
  const s = r.scores
  const id = `RX-${shortId(r.generatedAt + r.profile.clinic)}`

  // ----- Identificação e nota geral
  p.text('Raio-X da Gestão da Clínica', { size: 8.5, color: MUTED, after: 3 })
  p.text(r.profile.clinic, { size: 22, color: INK, bold: true, w: 120, lh: 1.15, after: 2 })
  p.text([r.profile.specialty, TEAM_LABEL[r.profile.team], `Responsável: ${r.profile.name}`].filter(Boolean).join(' · '), { size: 9, color: TEXT2, w: 120, after: 1 })
  p.text(`${fmtDate(r.generatedAt)} · ${id}`, { size: 8.5, color: MUTED, after: 8 })

  const top = p.y
  doc.setFont('helvetica', 'normal').setFontSize(60).setTextColor(...INK)
  const score = s.overall100 === null ? '-' : String(s.overall100)
  doc.text(score, M, top + 20)
  const sw = doc.getTextWidth(score)
  doc.setFontSize(13).setTextColor(...MUTED).text('/100', M + sw + 2, top + 20)
  const bandRgb = s.band ? BAND_RGB[s.band] : MUTED
  doc.setFillColor(...bandRgb).circle(M + 1.2, top + 27.5, 1.2, 'F')
  p.y = top + 25.8
  p.text(s.band ? BAND_LABEL[s.band] : 'Sem informação suficiente', { size: 10.5, color: INK, bold: true, x: M + 4.5, w: 80, after: 1 })
  p.text(
    `Baseada em ${s.valid} de 25 respostas (${s.knownPct}% das informações conhecidas)${s.overallRaw !== null ? ` · ${s.overallRaw} de 75 pontos` : ''}.`,
    { size: 8.5, color: TEXT2, w: 84, after: 1 },
  )
  if (s.unknown > 0)
    p.text(`${s.unknown} ${s.unknown === 1 ? 'resposta foi' : 'respostas foram'} "não sei" (${s.unknownPct}%): lacuna de informação, não nota zero.`, { size: 8.5, color: MUTED, w: 84 })

  // radar à direita
  drawRadar(doc, 146, top + 21, 26, DIMENSIONS.map((d) => s.dims[d.id].score15))
  p.y = Math.max(p.y, top + 56) + 4
  p.rule(6)

  r.overview.paragraphs.forEach((t, i) => p.text(t, { size: 10, color: i === 0 ? INK : TEXT2, after: 3, lh: 1.55 }))
  if (r.overview.strengths.length) {
    p.y += 2
    p.text('O que já funciona', { size: 9, bold: true, color: INK, after: 2 })
    r.overview.strengths.forEach((t) => p.bullet(t))
  }

  // ----- Mapa de maturidade
  p.y += 6
  p.heading('Mapa de maturidade')
  const order = [...DIMENSIONS].sort((a, b) => (s.dims[b.id].score15 ?? -1) - (s.dims[a.id].score15 ?? -1))
  for (const d of order) {
    const ds = s.dims[d.id]
    p.ensure(12)
    const y = p.y
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK).text(d.name, M, y + 3)
    doc.setFont('helvetica', 'bold').text(`${fmtScore(ds.score15)}/15`, M + W, y + 3, { align: 'right' })
    doc.setFillColor(...LINE).rect(M, y + 5, W, 1.2, 'F')
    if (ds.score15 !== null) doc.setFillColor(...(ds.band ? BAND_RGB[ds.band] : MUTED)).rect(M, y + 5, (W * ds.score15) / 15, 1.2, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text(clean(`${ds.band ? BAND_LABEL[ds.band] : 'Sem informação suficiente'}${ds.unknown ? ` · ${ds.unknown} sem informação` : ''}`), M, y + 10)
    p.y += 13
  }
  p.text(
    `Faixas (escala 0 a 15): ${(['critical', 'attention', 'developing', 'established'] as const).map((b) => `${BAND_LABEL[b]} ${BAND_RANGE[b].replace(' a ', '-')}`).join(' · ')}.`,
    { size: 8, color: MUTED, after: 2 },
  )

  if (r.patterns.length) {
    p.y += 4
    p.text('O que o cruzamento das respostas mostra', { size: 9, bold: true, color: INK, after: 2 })
    for (const pt of r.patterns) {
      p.text(pt.title, { size: 9.5, bold: true, color: INK, after: 0.5 })
      p.text(pt.body, { after: 3 })
    }
  }

  // ----- Análise por dimensão
  p.section(90)
  p.heading('Análise por dimensão', 16, 5)
  for (const a of r.dimensions) {
    const dim = DIMENSION_BY_ID[a.id]
    p.ensure(46)
    p.rule(5)
    const y = p.y
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(clean(`${dim.number}. ${dim.name}`), M, y + 4)
    doc.text(`${fmtScore(a.score.score15)}/15`, M + W, y + 4, { align: 'right' })
    p.y += 7
    p.text(a.score.band ? BAND_LABEL[a.score.band] : 'Sem informação suficiente', { size: 8.5, color: a.score.band ? BAND_RGB[a.score.band] : MUTED, bold: true, after: 2 })
    p.text(a.headline, { size: 10, color: INK, after: 2 })
    if (isLowConfidence(a.score)) p.text(`Leitura frágil: só ${a.score.valid} de 5 respostas desta área são válidas.`, { size: 8.5, color: MUTED, after: 2 })
    p.text('O que as respostas revelam', { size: 8.5, bold: true, color: MUTED, after: 1 })
    a.reveals.forEach((t) => p.bullet(t))
    p.text(a.score.band === 'established' ? 'Para manter o padrão' : 'O que pode acontecer', { size: 8.5, bold: true, color: MUTED, after: 1 })
    a.risks.forEach((t) => p.bullet(t))
    const label = { alta: 'Prioridade alta', media: 'Prioridade média', manter: 'Manter e acompanhar', investigar: 'Descobrir antes de melhorar' }[a.priorityLevel]
    p.text(`${label}${a.priorityTopic ? ` · ${a.priorityTopic}` : ''}`, { size: 8.5, bold: true, color: MUTED, after: 1 })
    if (a.priorityAction) p.text(a.priorityAction, { after: 3 })
  }

  // ----- Três prioridades
  p.section(80)
  p.heading('Os três principais pontos de atenção', 16, 2)
  p.text('A ordem pesa a nota, a importância de cada área, os processos que não existem e as informações que ainda faltam.', { size: 9, color: MUTED, after: 5 })
  const MODE = { urgent: 'Estruturar', build: 'Dar regularidade', sustain: 'Sustentar', discover: 'Descobrir' } as const
  for (const pr of r.priorities) {
    const dim = DIMENSION_BY_ID[pr.dim]
    p.ensure(40)
    p.rule(4)
    p.text(`${pr.rank}. ${dim.name}  ·  ${MODE[pr.mode]}`, { size: 12, bold: true, color: INK, after: 1 })
    p.text(pr.headline, { size: 10, color: INK, after: 2 })
    p.text('Por que merece atenção', { size: 8.5, bold: true, color: MUTED, after: 1 })
    p.text(pr.reasons.join(' · ') || 'Esta é a área com mais a ganhar no momento.', { after: 1 })
    p.text(dim.matters, { after: pr.orderNote ? 1 : 2 })
    if (pr.orderNote) p.text(pr.orderNote, { color: INK, after: 2 })
    pr.evidence.forEach((t) => p.bullet(t))
    p.y += 2
  }

  // ----- Plano inicial
  p.section(70)
  p.heading('Plano inicial de evolução', 16, 2)
  p.text(r.plan.intro, { size: 9.5, color: TEXT2, after: 4 })
  const cols: [string, string, typeof r.plan.now][] = [
    ['Agora', 'Ações prioritárias', r.plan.now],
    ['Próximos 30 dias', 'Organização dos processos', r.plan.d30],
    ['Próximos 90 dias', 'Acompanhamento e evolução', r.plan.d90],
  ]
  for (const [title, sub, items] of cols) {
    p.ensure(24)
    p.rule(3)
    p.text(title, { size: 12, bold: true, color: INK, after: 0 })
    p.text(sub, { size: 8.5, color: MUTED, after: 2 })
    items.forEach((i) => {
      p.text(i.topic, { size: 8, color: MUTED, after: 0.2 })
      p.bullet(i.text)
    })
    p.y += 2
  }

  // ----- Evolução
  if (opts.prev) {
    p.ensure(60)
    p.y += 3
    p.heading(`Comparação com o diagnóstico de ${fmtDate(opts.prev.completedAt)}`, 14, 3)
    const row = (name: string, before: number | null, now: number | null, unit: string, bold = false) => {
      p.ensure(6)
      const y = p.y
      const d = before !== null && now !== null ? Math.round((now - before) * 10) / 10 : null
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(9).setTextColor(...INK).text(clean(name), M, y + 3)
      doc.setTextColor(...TEXT2)
      doc.text(`${fmtScore(before)}${unit}`, M + 110, y + 3, { align: 'right' })
      doc.text(`${fmtScore(now)}${unit}`, M + 140, y + 3, { align: 'right' })
      doc.text(d === null ? 'sem base' : `${d > 0 ? '+' : ''}${fmtScore(d)}`, M + W, y + 3, { align: 'right' })
      doc.setDrawColor(...LINE).setLineWidth(0.15).line(M, y + 5, M + W, y + 5)
      p.y += 6
    }
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text('Antes', M + 110, p.y + 3, { align: 'right' }).text('Agora', M + 140, p.y + 3, { align: 'right' }).text('Variação', M + W, p.y + 3, { align: 'right' })
    p.y += 6
    for (const d of DIMENSIONS) row(d.name, opts.prev.dims[d.id] ?? null, s.dims[d.id].score15, '/15')
    row('Nota geral', opts.prev.overall100, s.overall100, '/100', true)
  }

  // ----- Próximo passo recomendado
  p.section(90)
  p.heading('O próximo passo da sua clínica', 16, 3)
  r.nextStep.intro.forEach((t, i) => p.text(t, { size: 10, color: i === 0 ? INK : TEXT2, after: 3, lh: 1.55 }))
  p.y += 2
  p.text('Como a SCALABLE se conecta ao que você respondeu', { size: 9, bold: true, color: INK, after: 2 })
  for (const c of r.nextStep.connections) {
    const q = QUESTION_BY_ID[c.question]
    p.ensure(22)
    p.text(`${DIMENSION_BY_ID[c.dim].short} · ${q.topic}`, { size: 9, bold: true, color: INK, after: 0.5 })
    p.text(`O que apareceu: ${c.level === null ? q.reveal.u : q.reveal[c.level]}`, { size: 9, color: MUTED, after: 0.5 })
    p.text(c.text ? `Na SCALABLE: ${c.text}` : 'Na SCALABLE: ainda não há um recurso direto para este ponto.', { size: 9, after: 0.5 })
    if (c.limits.length) p.text('Ainda não cobre: veja "O que continua dependendo do seu processo", abaixo.', { size: 8.5, color: MUTED })
    p.y += 2.5
  }
  if (r.nextStep.organize.length) {
    p.y += 2
    p.text('O que a sua clínica poderá organizar na plataforma', { size: 9, bold: true, color: INK, after: 2 })
    r.nextStep.organize.forEach((cid) => {
      const cap = CAPABILITIES[cid]
      p.ensure(14)
      p.text(cap.label, { size: 9, bold: true, color: INK, after: 0.3 })
      p.text(`${cap.description}${cap.setup ? ` ${cap.setup}` : ''}${cap.ai ? ` ${cap.ai}` : ''}`, { size: 8.5, after: 2 })
    })
  }
  if (r.nextStep.limits.length) {
    p.y += 2
    p.text('O que continua dependendo do seu processo', { size: 9, bold: true, color: INK, after: 2 })
    r.nextStep.limits.forEach((t) => p.bullet(t))
  }
  p.y += 3
  p.text('Como começar', { size: 9, bold: true, color: INK, after: 2 })
  r.nextStep.start.forEach((t, i) => p.text(`${i + 1}. ${t}`, { size: 9, after: 1 }))
  p.y += 3
  const link = SIGNUP_URL
  p.ensure(14)
  p.text('Quero organizar a gestão da minha clínica', { size: 11, bold: true, color: ACCENT, after: 1 })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...ACCENT)
  doc.textWithLink(link, M, p.y + 3, { url: link })
  p.y += 7
  p.y += 4
  p.text(
    'Este relatório foi gerado por regras fixas, a partir das respostas informadas, e não usa inteligência artificial nem substitui uma consultoria. As consequências descritas são possibilidades, e não prejuízos medidos.',
    { size: 8, color: MUTED },
  )

  // ----- Cabeçalho e rodapé em todas as páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    drawMark(doc, M, 10, 7, ACCENT)
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK).text('SCALABLE', M + 7, 15.2, { charSpace: 0.9 })
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED).text(clean(`${r.profile.clinic} · ${fmtDate(r.generatedAt)} · ${id}`), M + W, 15.2, { align: 'right' })
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, 289, M + W, 289)
    doc.text('Raio-X da Gestão da Clínica', M, 293.5)
    doc.text(`Página ${i} de ${pages}`, M + W, 293.5, { align: 'right' })
  }
  return doc
}

export function downloadReportPdf(r: Report, prev?: HistoryItem | null): void {
  const doc = buildReportPdf(r, { prev })
  const name =
    r.profile.clinic
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'clinica'
  doc.save(`raio-x-gestao-${name}-${new Date(r.generatedAt).toISOString().slice(0, 10)}.pdf`)
}
