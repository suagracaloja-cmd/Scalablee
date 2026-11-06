import { Fragment, type ReactNode } from 'react'

/** Renderizador de Markdown seguro (gera elementos React, sem HTML bruto). */
export function Markdown({ text }: { text: string }) {
  return <div className="md space-y-3 text-[15px] leading-7 text-ink">{blocks(text)}</div>
}

function blocks(src: string): ReactNode[] {
  const lines = src.replace(/\r/g, '').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    // Bloco de código
    if (line.trim().startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++])
      i++
      out.push(
        <pre key={key++} className="overflow-x-auto rounded-2xl bg-graphite p-4 text-[13px] leading-6 text-white">
          <code>{buf.join('\n')}</code>
        </pre>,
      )
      continue
    }
    // Título
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const cls = level <= 2 ? 'text-lg font-bold' : level === 3 ? 'text-base font-bold' : 'text-[15px] font-semibold'
      out.push(
        <div key={key++} className={`${cls} pt-1`}>
          {inline(h[2])}
        </div>,
      )
      i++
      continue
    }
    // Linha horizontal
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push(<hr key={key++} className="border-line" />)
      i++
      continue
    }
    // Tabela
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows: string[][] = []
      const cells = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const head = cells(line)
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push(
        <div key={key++} className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {head.map((c, k) => (
                  <th key={k} className="px-3 py-2 font-semibold text-muted">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-b border-line/70 last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top tabular-nums">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    // Citação
    if (line.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(
        <blockquote key={key++} className="border-l-4 border-brand pl-4 text-slate-600">
          {inline(buf.join(' '))}
        </blockquote>,
      )
      continue
    }
    // Listas
    const ul = /^\s*[-*•]\s+/
    const ol = /^\s*\d+[.)]\s+/
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? ol : ul).test(lines[i])) {
        let item = lines[i++].replace(ordered ? ol : ul, '')
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) item += ' ' + lines[i++].trim()
        items.push(item)
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(
        <Tag key={key++} className={`space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}>
          {items.map((it, k) => (
            <li key={k} className="pl-1">
              {inline(it)}
            </li>
          ))}
        </Tag>,
      )
      continue
    }
    // Parágrafo
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*•]\s+|\s*\d+[.)]\s+|>|\|)/.test(lines[i])) buf.push(lines[i++])
    if (!buf.length) buf.push(lines[i++])
    out.push(
      <p key={key++}>
        {buf.map((b, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(b)}
          </Fragment>
        ))}
      </p>,
    )
  }
  return out
}

/** Negrito, itálico, código inline e links http(s). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|(?:^|(?<=\s))_[^_]+_(?=\s|$|[.,;:!?]))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++} className="font-semibold">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k++} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[13px]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const label = t.slice(1, t.indexOf(']'))
      out.push(
        <a key={k++} href={m[2]} target="_blank" rel="noreferrer" className="font-medium text-brand-dark underline underline-offset-2">
          {label}
        </a>,
      )
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
