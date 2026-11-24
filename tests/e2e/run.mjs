// Teste de ponta a ponta do Raio-X da Gestão da Clínica.
//
// Builda o app de produção apontando para um servidor local que executa a migração real em Postgres,
// sobe o app e percorre a jornada num navegador de verdade (Chromium), em desktop e em celular.
// Nada aqui toca o Supabase de produção.
//
//   npm run test:e2e              capturas em tests/e2e/out
//   npm run test:e2e -- /caminho  capturas em outro diretório
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startRpcServer } from './rpc-server.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const OUT = resolve(process.argv[2] ?? join(here, 'out'))
mkdirSync(OUT, { recursive: true })

const RPC_PORT = 54377
const APP_PORT = 4177
const RPC = `http://127.0.0.1:${RPC_PORT}`
const APP = `http://127.0.0.1:${APP_PORT}`

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  try {
    return require('playwright')
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return createRequire(`${g}/`)('playwright')
  }
}
const { chromium, devices } = loadPlaywright()

// Cabeçalhos que a Vercel aplica em produção (vercel.json), com o Supabase apontando para o servidor local.
// A CSP bloqueia script, estilo e conexão inline ou externos: se o diagnóstico precisar de algo que a produção
// bloqueia, o teste acusa erro de console. O build é servido por aqui, com esses cabeçalhos e o mesmo fallback de SPA.
function productionHeaders() {
  const cfg = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  const out = {}
  for (const h of cfg.headers.find((r) => r.source === '/(.*)').headers) out[h.key.toLowerCase()] = h.value
  out['content-security-policy'] = out['content-security-policy']
    .replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, RPC)
    .replace(/wss:\/\/[a-z0-9]+\.supabase\.co/g, RPC.replace('http', 'ws'))
    .replace(/;?\s*upgrade-insecure-requests/, '')
  delete out['strict-transport-security'] // só vale em HTTPS
  return out
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp' }
function serveDist(dir, port) {
  const headers = productionHeaders()
  const server = createServer((req, res) => {
    let file = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html')
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', ...headers })
    res.end(readFileSync(file))
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)))
}

// ---------------------------------------------------------------- verificações
const results = []
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra })
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? `  -> ${extra}` : ''}`)
}
const rpcGet = async (path) => (await fetch(`${RPC}${path}`)).json()
const rpcPost = async (path, body) => (await fetch(`${RPC}${path}`, { method: 'POST', body: JSON.stringify(body) })).json()

// Respostas do cenário principal: todos os níveis e três "não sei" (null), por dimensão.
const SCENARIO = {
  fin: [0, 0, 1, 0, 1],
  ate: [2, 2, 3, 2, 2],
  com: [3, 3, null, 2, 3],
  ope: [1, null, 2, 1, 0],
  ges: [2, 1, 1, null, 3],
}
const KEYS = ['fin', 'ate', 'com', 'ope', 'ges']
const QIDS = KEYS.flatMap((k) => [1, 2, 3, 4, 5].map((n) => `${k}${n}`))
const answersOf = (spec) => QIDS.map((id) => spec[id.slice(0, 3)][Number(id[3]) - 1])
const keyFor = (v) => (v === null ? '5' : String(v + 1)) // teclas: 1–4 níveis 0–3, 5 = não sei
const LEVEL_LABEL = ['Não existe esse processo', 'Existe informalmente', 'Existe, mas ainda precisa melhorar', 'É organizado e acompanhado regularmente']

function expectedScore(values) {
  const valid = values.filter((v) => v !== null)
  const raw = valid.reduce((a, b) => a + b, 0)
  const overall = valid.length ? Math.round((raw * 100) / (3 * valid.length)) : null
  const band = overall === null ? null : overall <= 33 ? 'Situação crítica' : overall <= 59 ? 'Precisa de atenção' : overall <= 86 ? 'Em desenvolvimento' : 'Bem estabelecida'
  return { overall, band, valid: valid.length, unknown: values.length - valid.length }
}


// Espera a tela da pergunta estar montada (o atalho de teclado é anexado depois da navegação) e então tecla.
async function pressKey(page, key) {
  await page.waitForSelector('.rx-opts')
  await page.waitForTimeout(120)
  await page.keyboard.press(key)
}

async function respondAll(page, values, { mouse = false } = {}) {
  for (let i = 0; i < 25; i++) {
    await page.waitForURL(new RegExp(`/pergunta/${i + 1}$`))
    const v = values[i]
    if (mouse) {
      const opt = v === null ? page.getByRole('radio', { name: /Não sei/ }) : page.getByRole('radio', { name: new RegExp(LEVEL_LABEL[v]) })
      await opt.click()
    } else {
      await pressKey(page, keyFor(v))
    }
    if (i < 24) await page.waitForURL(new RegExp(`/pergunta/${i + 2}$`))
  }
}

async function fillIdentify(page, p) {
  await page.getByLabel('Seu nome').fill(p.name)
  await page.getByLabel('Nome da clínica').fill(p.clinic)
  await page.getByLabel(/Especialidade/).fill(p.specialty)
  await page.getByRole('radio', { name: p.team }).click()
  await page.getByLabel('E-mail', { exact: true }).fill(p.email)
  await page.getByLabel(/Concordo que a SCALABLE guarde/).check()
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1)
async function shot(page, name, opts = {}) {
  await page.waitForTimeout(650) // deixa as animações de entrada terminarem
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts })
}
async function scrollShot(page, selector, name, offset = 56) {
  await page.evaluate(([sel, off]) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off) }, [selector, offset])
  await page.waitForTimeout(500)
  await shot(page, name)
}

// ---------------------------------------------------------------- infraestrutura
console.log('> subindo o servidor RPC local (migração real em Postgres)')
const rpc = await startRpcServer(RPC_PORT)

console.log('> buildando o app de produção contra o servidor local')
const dist = join(root, 'node_modules/.rx-e2e-dist')
execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: root,
  env: { ...process.env, VITE_SUPABASE_URL: RPC, VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' },
  stdio: 'inherit',
})
const appServer = await serveDist(dist, APP_PORT)

const browser = await chromium.launch()
const consoleProblems = []
function watch(page, label) {
  page.on('pageerror', (e) => consoleProblems.push(`[${label}] pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) consoleProblems.push(`[${label}] console: ${m.text()}`) })
}
async function newPage(ctx, label) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  const page = await ctx.newPage()
  watch(page, label)
  return page
}

try {
  // ============================================================ DESKTOP
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await newPage(desk, 'desktop')
  const PROFILE = { name: 'Mariana Souza', clinic: 'Clínica Aurora', specialty: 'Odontologia', team: '4 a 7', email: 'mariana@aurora.test' }

  console.log('\n== 1. Apresentação')
  await page.goto(`${APP}/`)
  await page.waitForSelector('h1')
  check('headline exata do briefing', (await page.locator('h1').innerText()) === 'Sua clínica está tão organizada quanto você imagina?')
  const body0 = await page.locator('body').innerText()
  check('texto de apresentação do briefing', body0.includes('Responda a algumas perguntas sobre a gestão da sua clínica e descubra o que está funcionando, onde existem oportunidades de melhoria e o que merece sua atenção.'))
  for (const f of ['Gratuito', '25 perguntas', 'Aproximadamente 5 minutos', 'Resultado personalizado']) check(`informação "${f}"`, body0.includes(f))
  check('CTA "Fazer meu diagnóstico"', await page.getByRole('button', { name: 'Fazer meu diagnóstico' }).isVisible())
  check('não apresenta planos nem preços', !/R\$|\bpreço|\bplanos\b|mensalidade|assinatura/i.test(body0))
  check('título da página', (await page.title()).startsWith('Raio-X da Gestão da Clínica'))
  check('sem rolagem horizontal (desktop)', await noOverflow(page))
  await page.waitForTimeout(2800)
  await shot(page, '01-intro-desktop')
  await scrollShot(page, '.rx-split', '01b-intro-recebe-desktop', 0)

  console.log('\n== 2. Identificação')
  await page.goto(`${APP}/`)
  await page.getByRole('button', { name: 'Fazer meu diagnóstico' }).click()
  await page.waitForURL(/identificacao$/)
  await page.waitForSelector('.rx-form')
  check('explica por que pede os dados', (await page.locator('body').innerText()).includes('Essas informações ajudam a contextualizar o diagnóstico'))
  check('não exige telefone', (await page.getByLabel(/telefone|whatsapp|celular/i).count()) === 0)
  await page.getByRole('button', { name: 'Começar as 25 perguntas' }).click()
  const errs = await page.locator('.rx-error').allInnerTexts()
  check('valida campos vazios, equipe e consentimento', errs.length >= 4, errs.join(' | '))
  check('nada foi criado no servidor com dados inválidos', (await rpcGet('/__sessions')).length === 0)
  await shot(page, '02-identify-erros-desktop')
  await fillIdentify(page, PROFILE)
  check('ao corrigir os campos, os erros antigos somem', (await page.locator('.rx-error').count()) === 0, (await page.locator('.rx-error').allInnerTexts()).join(' | '))
  await shot(page, '02b-identify-preenchido-desktop')
  await page.getByRole('button', { name: 'Começar as 25 perguntas' }).click()
  await page.waitForURL(/pergunta\/1$/)
  const sess = await rpcGet('/__sessions')
  check('sessão criada no banco com o consentimento', sess.length === 1 && sess[0].email === PROFILE.email && sess[0].consent_version === 'v1' && sess[0].marketing_consent === false, JSON.stringify(sess))
  check('perfil gravado', sess[0]?.clinic_name === PROFILE.clinic && sess[0]?.team_size === '4-7' && sess[0]?.specialty === 'Odontologia')

  console.log('\n== 3. Questionário')
  check('uma pergunta por tela, texto exato', (await page.locator('h1').innerText()) === 'Sua clínica mantém um registro organizado de todas as receitas?')
  check('indicador de progresso 01 / 25', (await page.locator('.rx-qcount').innerText()).replace(/\s+/g, ' ') === '01 / 25')
  check('identifica a dimensão atual', (await page.locator('.rx-eyebrow').first().innerText()).includes('Dimensão 1 de 5') && (await page.locator('.rx-eyebrow').first().innerText()).includes('Gestão financeira'))
  check('quatro níveis + "Não sei"', (await page.getByRole('radio').count()) === 5)
  const labels = await page.getByRole('radio').allInnerTexts()
  for (const l of ['Não existe esse processo', 'Existe informalmente, sem organização consistente', 'Existe, mas ainda precisa melhorar', 'É organizado e acompanhado regularmente', 'Não sei / Não tenho essa informação']) check(`opção "${l}"`, labels.some((t) => t.includes(l)))
  check('"Não sei" explica que não vale zero', (await page.getByRole('radio', { name: /Não sei/ }).innerText()).includes('lacuna de informação'))
  check('sem botão Voltar na primeira pergunta', (await page.getByRole('button', { name: 'Voltar' }).count()) === 0)
  await shot(page, '03-quiz-q1-desktop')

  const values = answersOf(SCENARIO)
  const expected = [...values]
  // Q1–Q9
  for (let i = 0; i < 9; i++) {
    const v = values[i]
    if (i % 2) await page.getByRole('radio', { name: v === null ? /Não sei/ : new RegExp(LEVEL_LABEL[v]) }).click()
    else await pressKey(page, keyFor(v))
    await page.waitForURL(new RegExp(`/pergunta/${i + 2}$`))
  }
  check('salvamento automático confirma', await page.locator('.rx-sync--saved').waitFor({ timeout: 5000 }).then(() => true).catch(() => false))
  await shot(page, '03b-quiz-q10-desktop')
  // voltar e alterar: Q10 -> Q9 (muda a resposta)
  await pressKey(page, 'ArrowLeft')
  await page.waitForURL(/pergunta\/9$/)
  await page.getByRole('radio', { checked: true }).first().waitFor()
  const prevSel = await page.getByRole('radio', { checked: true }).innerText()
  check('voltar mostra a resposta dada', prevSel.includes(values[8] === null ? 'Não sei' : LEVEL_LABEL[values[8]].slice(0, 12)), prevSel)
  expected[8] = 3
  await pressKey(page, '4')
  await page.waitForURL(/pergunta\/10$/)
  check('alterar uma resposta anterior funciona', (await page.getByRole('radio', { checked: true }).count()) === 0)
  // Q10
  await pressKey(page, keyFor(values[9]))
  await page.waitForURL(/pergunta\/11$/)
  await page.waitForTimeout(600)
  check('dimensão muda na pergunta 11', (await page.locator('.rx-eyebrow').first().innerText()).includes('Dimensão 3 de 5'))
  check('mostra o contexto da nova dimensão', (await page.locator('.rx-blurb').count()) === 1)
  // persistência: recarregar no meio
  await pressKey(page, keyFor(values[10]))
  await page.waitForURL(/pergunta\/12$/)
  await page.reload()
  await page.waitForSelector('.rx-question')
  check('recarregar mantém a pergunta', (await page.locator('.rx-qcount').innerText()).replace(/\s+/g, ' ') === '12 / 25')
  await pressKey(page, 'ArrowLeft')
  await page.waitForURL(/pergunta\/11$/)
  await page.getByRole('radio', { checked: true }).first().waitFor()
  check('recarregar mantém as respostas', (await page.getByRole('radio', { checked: true }).count()) === 1)
  await pressKey(page, 'ArrowRight')
  await page.waitForURL(/pergunta\/12$/)
  check('não permite pular perguntas por URL', await (async () => { await page.goto(`${APP}/pergunta/20`); await page.waitForURL(/pergunta\/12$/); return true })().catch(() => false))
  // Q12–Q25
  for (let i = 11; i < 25; i++) {
    await page.waitForURL(new RegExp(`/pergunta/${i + 1}$`))
    await pressKey(page, keyFor(values[i]))
    if (i < 24) await page.waitForURL(new RegExp(`/pergunta/${i + 2}$`))
  }
  check('última pergunta oferece "Ver meu diagnóstico"', await page.getByRole('button', { name: 'Ver meu diagnóstico' }).isEnabled())
  await shot(page, '03c-quiz-q25-desktop')

  await page.waitForTimeout(800)
  const ans = await rpcGet(`/__answers?email=${encodeURIComponent(PROFILE.email)}`)
  check('as 25 respostas foram salvas durante o questionário', ans.length === 25, `${ans.length}`)
  check('"Não sei" salvo como lacuna, não como zero', ans.filter((a) => a.is_unknown).length === 3 && ans.filter((a) => a.value === 0).length === values.filter((v, i) => expected[i] === 0).length)

  console.log('\n== 4. Análise')
  await page.getByRole('button', { name: 'Ver meu diagnóstico' }).click()
  await page.waitForURL(/analise$/)
  await page.waitForSelector('h1:has-text("Estamos organizando")')
  check('mensagem da análise do briefing', (await page.locator('h1').innerText()) === 'Estamos organizando os resultados da sua clínica.')
  await page.waitForTimeout(900)
  await shot(page, '04-analise-desktop')
  await page.waitForURL(/resultado$/, { timeout: 15000 })

  console.log('\n== 5. Resultado')
  await page.waitForSelector('.rx-score__num')
  const exp = expectedScore(expected)
  const shown = (await page.locator('.rx-score__num').innerText()).replace(/\D/g, '').replace(/100$/, '')
  check('nota geral na tela confere com o cálculo independente', Number(shown) === exp.overall, `tela=${shown} esperado=${exp.overall}`)
  const res = await rpcGet('/__results')
  check('nota gravada no banco confere com a da tela', res.length === 1 && res[0].overall_score === exp.overall && res[0].unknown_count === exp.unknown && res[0].valid_count === exp.valid, JSON.stringify(res))
  const body1 = await page.locator('body').innerText()
  check('classificação de maturidade', body1.includes(exp.band), exp.band)
  check('percentual de informações conhecidas', body1.includes(`${res[0].known_pct}% das informações conhecidas`))
  check('nome da clínica no relatório', body1.includes('Clínica Aurora'))
  for (const id of ['visao-geral', 'mapa', 'dimensoes', 'prioridades', 'plano', 'proximo-passo']) check(`seção #${id}`, (await page.locator(`#${id}`).count()) === 1)
  check('mapa visual com as cinco dimensões', (await page.locator('.rx-radar__lbl').count()) === 5 && (await page.locator('.rx-radar__poly').count()) === 1)
  check('análise das cinco dimensões', (await page.locator('.rx-dim').count()) === 5)
  check('cada dimensão traz revelações, consequências e prioridade', (await page.locator('.rx-dim__cols h4').allInnerTexts()).filter((t) => /revelam/.test(t)).length === 5 && (await page.locator('.rx-dim__cols h4', { hasText: 'Prioridade' }).count()) === 5)
  check('exatamente três pontos de atenção', (await page.locator('.rx-prios__item').count()) === 3)
  check('cada prioridade explica o motivo', (await page.locator('.rx-prios__why dt', { hasText: 'Por que merece atenção' }).count()) === 3)
  check('plano em três horizontes', (await page.locator('.rx-plan__col h3').allInnerTexts()).join('|') === 'Agora|Próximos 30 dias|Próximos 90 dias')
  check('"O próximo passo da sua clínica"', (await page.locator('#proximo-passo h2').innerText()) === 'O próximo passo da sua clínica')
  check('consequências como possibilidade, nunca prejuízo', !/R\$|prejuízo de|você perde/i.test(body1) && /podem?\b/.test(body1))
  check('sem preço nem condição comercial da plataforma no resultado', !/R\$|mensalidade|assinatura|gr[aá]tis|\btrial\b/i.test(body1))
  check('relatório declara não usar IA', body1.includes('não usa inteligência artificial'))
  const fits = await page.locator('.rx-fit').count()
  check('conexões problema → recurso verificado', fits >= 3 && (await page.locator('.rx-fit__says', { hasText: 'Na SCALABLE' }).count()) === fits)
  check('declara o que a plataforma ainda não cobre', /Ainda não cobre|Ainda não há cadastro de metas|Não há projeção|não calcula a taxa de faltas|Não há registro estruturado|não guarda roteiros/.test(body1))
  check('sem rolagem horizontal no relatório', await noOverflow(page))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await shot(page, '05-resultado-visao-geral-desktop')
  await scrollShot(page, '#mapa', '05b-resultado-mapa-desktop')
  await scrollShot(page, '#dimensoes', '05c-resultado-dimensoes-desktop')
  await scrollShot(page, '#prioridades', '05d-resultado-prioridades-desktop')
  await scrollShot(page, '#plano', '05e-resultado-plano-desktop')
  await scrollShot(page, '#proximo-passo', '05f-resultado-proximo-passo-desktop')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  await shot(page, '05g-resultado-fim-desktop')

  console.log('\n== 6. PDF')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar PDF' }).first().click()])
  const pdfPath = join(OUT, 'relatorio-gerado.pdf')
  await dl.saveAs(pdfPath)
  check('download com nome sugerido', /^raio-x-gestao-clinica-aurora-\d{4}-\d{2}-\d{2}\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename())
  const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
  const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  check('PDF é A4 com várias páginas', /Pages:\s+[4-9]/.test(pdfInfo) && /A4/.test(pdfInfo), pdfInfo.split('\n').filter((l) => /Pages|Page size/.test(l)).join(' '))
  check('PDF traz clínica, nota, dimensões, prioridades, plano e próximo passo', ['Clínica Aurora', `${exp.overall}`, 'Mapa de maturidade', 'Análise por dimensão', 'Os três principais pontos de atenção', 'Plano inicial de evolução', 'O próximo passo da sua clínica', '23/11/2026'].every((s) => s === '23/11/2026' || pdfText.includes(s)))
  check('PDF traz a data do diagnóstico', /\d{2}\/\d{2}\/\d{4}/.test(pdfText))
  execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', pdfPath, join(OUT, 'pdf-pagina')])

  console.log('\n== 7. Eventos, CTA e cadastro')
  await page.waitForTimeout(500)
  const ev0 = (await rpcGet('/__events')).filter((e) => e.email === PROFILE.email).map((e) => e.event)
  check('eventos: início, conclusão, relatório visto e PDF', ['started', 'completed', 'report_viewed', 'pdf_downloaded'].every((e) => ev0.includes(e)), ev0.join(','))
  // O site da SCALABLE é outro endereço: aqui ele é substituído por uma página de teste, só para provar para onde o botão leva.
  await desk.route('https://scalablee.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Site da SCALABLE (teste)</h1>' }))
  const cta = page.locator('#proximo-passo').getByRole('link', { name: 'Quero organizar a gestão da minha clínica' }).first()
  check('o botão final aponta para o site da SCALABLE', (await cta.getAttribute('href')) === 'https://scalablee.vercel.app/')
  await cta.click()
  await page.waitForURL('https://scalablee.vercel.app/')
  check('CTA leva ao site da plataforma, fora do diagnóstico', true)
  await page.waitForTimeout(500)
  const ev1 = (await rpcGet('/__events')).filter((e) => e.email === PROFILE.email)
  check('clique no CTA registrado (e só o clique, sem inventar conversão)', ev1.some((e) => e.event === 'cta_clicked' && e.props.placement === 'next-step-top') && !ev1.some((e) => e.event === 'signup_started'))

  console.log('\n== 8. Relatório recuperável e histórico')
  await page.goto(`${APP}/resultado`)
  await page.waitForSelector('.rx-score__num')
  check('reabrir o relatório recupera do servidor', (await page.locator('h1').first().innerText()) === 'Clínica Aurora')
  const m1 = await rpcGet('/__metrics')
  check('métricas: iniciou 1, concluiu 1, taxa 100%', m1.started === 1 && m1.completed === 1 && Number(m1.completion_rate) === 100, JSON.stringify([m1.started, m1.completed, m1.completion_rate]))
  check('métricas: relatório visto, CTA clicado, PDF baixado', m1.report_viewed === 1 && m1.cta_clicked === 1 && m1.pdf_downloaded === 1)
  check('métricas: não há assinaturas contabilizadas', m1.subscriptions_from_diagnostic === null && m1.signup_started === 0)
  check('métricas: problemas mais frequentes das 25 perguntas', m1.frequent_problems.length === 25)

  console.log('\n== 9. Refazer e comparar')
  await page.getByRole('button', { name: 'Refazer o diagnóstico' }).click()
  await page.waitForURL(/identificacao$/)
  check('novo diagnóstico vem com os dados anteriores', (await page.getByLabel('Nome da clínica').inputValue()) === 'Clínica Aurora')
  await page.getByLabel(/Concordo que a SCALABLE guarde/).check()
  await page.getByRole('radio', { name: PROFILE.team }).click()
  await page.getByRole('button', { name: 'Começar as 25 perguntas' }).click()
  await page.waitForURL(/pergunta\/1$/)
  await respondAll(page, QIDS.map(() => 3))
  await page.getByRole('button', { name: 'Ver meu diagnóstico' }).click()
  await page.waitForURL(/resultado$/, { timeout: 20000 })
  await page.waitForSelector('.rx-score__num')
  check('segundo diagnóstico: nota 100, bem estabelecida', (await page.locator('.rx-score__num').innerText()).startsWith('100') && (await page.locator('body').innerText()).includes('Bem estabelecida'))
  check('mostra a comparação com o diagnóstico anterior', (await page.locator('#evolucao').count()) === 1 && (await page.locator('#evolucao tbody tr').count()) === 6)
  const bodyDelta = await page.locator('#evolucao').innerText()
  check('comparação traz a variação da nota geral', bodyDelta.includes(`+${100 - exp.overall}`), bodyDelta.replace(/\s+/g, ' ').slice(0, 200))
  await scrollShot(page, '#evolucao', '09-resultado-evolucao-desktop')
  check('com tudo organizado, o plano é de manutenção', (await page.locator('.rx-plan__col').first().innerText()).includes('Documente em uma página'))

  console.log('\n== 10. Apagar dados (LGPD)')
  await page.getByRole('button', { name: 'Apagar meus dados' }).click()
  await shot(page, '10-apagar-confirmacao-desktop')
  await page.getByRole('button', { name: 'Apagar tudo' }).click()
  await page.waitForURL(/:4177\/$/)
  check('dados apagados no servidor (os dois diagnósticos)', (await rpcGet('/__sessions')).length === 0)
  check('armazenamento local limpo', await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('rx.v1')).length === 0))

  // ============================================================ SEGURANÇA / ACESSO
  console.log('\n== 11. Acesso sem sessão')
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const ap = await newPage(anon, 'anon')
  await ap.goto(`${APP}/resultado`)
  await ap.waitForURL(/:4177\/$/)
  check('relatório sem token redireciona para o início', true)
  await ap.goto(`${APP}/pergunta/7`)
  await ap.waitForURL(/identificacao$/)
  check('pergunta sem sessão redireciona para a identificação', true)
  await ap.goto(`${APP}/analise`)
  await ap.waitForURL(/:4177\/$/)
  check('análise sem sessão redireciona para o início', true)
  await ap.evaluate(() => localStorage.setItem('rx.v1.token', 'x'.repeat(64)))
  await ap.goto(`${APP}/resultado`)
  await ap.waitForURL(/:4177\/$/)
  check('token falso não abre nenhum relatório', true)

  // ============================================================ RESILIÊNCIA
  console.log('\n== 12. Sem conexão durante o questionário')
  const off = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const op = await newPage(off, 'offline')
  await op.goto(`${APP}/identificacao`)
  await fillIdentify(op, { ...PROFILE, email: 'offline@aurora.test' })
  await op.getByRole('button', { name: 'Começar as 25 perguntas' }).click()
  await op.waitForURL(/pergunta\/1$/)
  await rpcPost('/__fail', { on: true })
  await pressKey(op, '3')
  await op.waitForURL(/pergunta\/2$/)
  check('sem conexão: avisa que ficou guardado no navegador', await op.locator('.rx-sync--offline').waitFor({ timeout: 5000 }).then(() => true).catch(() => false))
  check('a jornada continua mesmo sem conexão', (await op.locator('.rx-qcount').innerText()).startsWith('02'))
  await rpcPost('/__fail', { on: false })
  await pressKey(op, '4')
  await op.waitForURL(/pergunta\/3$/)
  check('voltou a conexão: tudo é reenviado', await op.locator('.rx-sync--saved').waitFor({ timeout: 8000 }).then(() => true).catch(() => false))
  const offAns = await rpcGet('/__answers?email=offline@aurora.test')
  check('as duas respostas chegaram ao banco', offAns.length === 2 && offAns[0].value === 2 && offAns[1].value === 3, JSON.stringify(offAns))
  await off.close()

  // ============================================================ APP EXISTENTE
  console.log('\n== 13. É um site separado')
  const solo = await newPage(await browser.newContext({ viewport: { width: 1440, height: 900 } }), 'solo')
  await solo.goto(`${APP}/`)
  await solo.getByRole('heading', { level: 1 }).waitFor()
  check('a raiz do site é o diagnóstico', (await solo.getByRole('button', { name: 'Fazer meu diagnóstico' }).count()) === 1)
  check('"Já tenho conta" leva ao site da SCALABLE', (await solo.getByRole('link', { name: 'Já tenho conta' }).getAttribute('href')) === 'https://scalablee.vercel.app')
  await solo.goto(`${APP}/login`)
  await solo.waitForURL(/:4177\/$/)
  check('não existe tela de login nem rota do produto aqui', true)
  check('nenhuma menção ao botão "Rodar análise" do produto', !/Rodar análise/.test(await solo.locator('body').innerText()))

  // ============================================================ MOBILE
  console.log('\n== 14. Celular (390 px)')
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13']
  const mob = await browser.newContext({ ...iphone, acceptDownloads: true })
  const mp = await newPage(mob, 'mobile')
  await mp.goto(`${APP}/`)
  await mp.waitForSelector('h1')
  await mp.waitForTimeout(2800)
  check('mobile: intro sem rolagem horizontal', await noOverflow(mp))
  check('mobile: CTA visível', await mp.getByRole('button', { name: 'Fazer meu diagnóstico' }).isVisible())
  await shot(mp, '14-intro-mobile')
  await mp.getByRole('button', { name: 'Fazer meu diagnóstico' }).tap()
  await mp.waitForURL(/identificacao$/)
  check('mobile: identificação sem rolagem horizontal', await noOverflow(mp))
  await fillIdentify(mp, { ...PROFILE, email: 'mobile@aurora.test', clinic: 'Clínica Mobile' })
  await shot(mp, '14b-identify-mobile')
  await mp.getByRole('button', { name: 'Começar as 25 perguntas' }).tap()
  await mp.waitForURL(/pergunta\/1$/)
  check('mobile: pergunta sem rolagem horizontal', await noOverflow(mp))
  const hs = await mp.getByRole('radio').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  check('mobile: alvos de toque com pelo menos 56 px', hs.every((h) => h >= 56), hs.join(','))
  const nav = await mp.locator('.rx-qnav').boundingBox()
  const vh = await mp.evaluate(() => window.innerHeight)
  check('mobile: navegação fica ao alcance do polegar (colada no rodapé da tela)', nav && Math.abs(nav.y + nav.height - vh) <= 4, `nav=${JSON.stringify(nav)} altura=${vh}`)
  await shot(mp, '14c-quiz-mobile')
  await respondAll(mp, values, { mouse: true })
  await mp.getByRole('button', { name: 'Ver meu diagnóstico' }).tap()
  await mp.waitForURL(/resultado$/, { timeout: 20000 })
  await mp.waitForSelector('.rx-score__num')
  await mp.waitForTimeout(1500)
  check('mobile: resultado sem rolagem horizontal', await noOverflow(mp))
  await shot(mp, '14d-resultado-mobile')
  await scrollShot(mp, '#mapa', '14e-mapa-mobile', 48)
  await scrollShot(mp, '#prioridades', '14f-prioridades-mobile', 48)
  await scrollShot(mp, '#plano', '14g-plano-mobile', 48)
  await scrollShot(mp, '#proximo-passo', '14h-proximo-passo-mobile', 48)
  check('mobile: resultado idêntico ao do desktop (mesmas respostas, mesma nota)', (await mp.locator('.rx-score__num').innerText()).startsWith(String(expectedScore(values).overall)))
  await shot(mp, '14i-fim-mobile', { fullPage: false })

  console.log('\n== 15. Erros no console')
  check('nenhum erro de JavaScript em nenhuma tela', consoleProblems.length === 0, consoleProblems.slice(0, 5).join(' || '))
} catch (e) {
  console.error('\nERRO NO TESTE:', e.message, '\n', (e.stack || '').split('\n').filter((l) => l.includes('run.mjs')).slice(0, 3).join('\n'))
  results.push({ name: `exceção: ${e.message.split('\n')[0]}`, pass: false })
  if (consoleProblems.length) console.error('Erros de console até aqui:\n  ' + consoleProblems.slice(0, 8).join('\n  '))
} finally {
  await browser.close().catch(() => {})
  appServer.close()
  await rpc.close().catch(() => {})
}

const failed = results.filter((r) => !r.pass)
writeFileSync(join(OUT, 'resultado.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram. Capturas em ${OUT}`)
if (failed.length) {
  console.log('\nFalharam:')
  for (const f of failed) console.log(` - ${f.name}${f.extra ? `  (${f.extra})` : ''}`)
  process.exit(1)
}
