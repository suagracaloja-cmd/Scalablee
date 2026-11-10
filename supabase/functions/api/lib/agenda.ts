// Agenda da clínica: horários livres, consultas do período e preparo de marcação/alteração
// (marcar e alterar passam pela Central de Aprovações, como as outras operações da Coraline AI).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { norm } from "./util.ts";

type Json = Record<string, unknown>;
export type AgendaCfg = { dias: number[]; inicio: string; fim: string; intervalo_min: number; fuso: string };
export const AGENDA_PADRAO: AgendaCfg = { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "18:00", intervalo_min: 30, fuso: "-03:00" };

export type Agendamento = {
  id: string;
  customer_id: string | null;
  profissional_id: string | null;
  servico_id: string | null;
  inicio: string;
  fim: string;
  status: string;
  tipo: string;
  origem: string;
  observacoes: string | null;
};
type Prof = { id: string; nome: string; especialidade: string | null; ativo: boolean };
type Serv = { id: string; nome: string; duracao_min: number; preco: number | null; ativo: boolean };
type Pac = { id: string; name: string; phone: string | null; etapa?: string };

const ATIVOS = ["agendado", "confirmado"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ---------- datas no fuso da clínica ----------

const fusoMin = (fuso: string) => {
  const m = fuso.match(/^([+-])(\d{2}):(\d{2})$/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -180;
};
/** "AAAA-MM-DD HH:MM" (ou com T) no fuso da clínica → Date (UTC). */
export function paraUtc(local: string, fuso: string): Date | null {
  const m = local.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00${fuso}`);
  return isNaN(d.getTime()) ? null : d;
}
/** Date → { data: AAAA-MM-DD, hora: HH:MM, diaSemana } no fuso da clínica. */
export function local(d: Date, fuso: string) {
  const x = new Date(d.getTime() + fusoMin(fuso) * 60000);
  const iso = x.toISOString();
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16), dia: DIAS[x.getUTCDay()], diaSemana: x.getUTCDay() };
}
const br = (data: string) => data.split("-").reverse().join("/");
export const quando = (d: Date, fuso: string) => {
  const l = local(d, fuso);
  return `${l.dia}, ${br(l.data)} às ${l.hora}`;
};

// ---------- leitura ----------

export async function agendaCfg(db: SupabaseClient, companyId: string): Promise<AgendaCfg> {
  const { data } = await db.from("companies").select("agenda_config").eq("id", companyId).maybeSingle();
  return { ...AGENDA_PADRAO, ...((data?.agenda_config as Partial<AgendaCfg>) ?? {}) };
}
async function lista<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as T[] | null) ?? [];
}
export const profissionais = (db: SupabaseClient, companyId: string) =>
  lista<Prof>(db.from("profissionais").select("id,nome,especialidade,ativo").eq("company_id", companyId));
export const servicos = (db: SupabaseClient, companyId: string) =>
  lista<Serv>(db.from("servicos").select("id,nome,duracao_min,preco,ativo").eq("company_id", companyId));
export const agendamentosEntre = (db: SupabaseClient, companyId: string, de: Date, ate: Date) =>
  lista<Agendamento>(
    db.from("agendamentos").select("id,customer_id,profissional_id,servico_id,inicio,fim,status,tipo,origem,observacoes").eq("company_id", companyId).gte("inicio", de.toISOString()).lt("inicio", ate.toISOString()).order("inicio"),
  );

/** Procura por id ou por nome (sem acento, parcial). Erro claro se for ambíguo. */
function achar<T extends { id: string }>(itens: T[], busca: unknown, nome: (x: T) => string, rotulo: string): T | null {
  const b = typeof busca === "string" ? busca.trim() : "";
  if (!b) return null;
  const porId = itens.find((x) => x.id === b);
  if (porId) return porId;
  const n = norm(b);
  const achados = itens.filter((x) => norm(nome(x)).includes(n));
  if (achados.length === 1) return achados[0];
  if (!achados.length) throw new Error(`${rotulo} "${b}" não encontrado. Opções: ${itens.map(nome).join(", ") || "nenhum cadastrado"}.`);
  throw new Error(`Mais de um ${rotulo.toLowerCase()} com "${b}": ${achados.map(nome).join(", ")}. Seja mais específico.`);
}

/** Horários livres a partir de uma data, respeitando dias/horário da clínica, duração e conflitos. */
export async function horariosLivres(
  db: SupabaseClient,
  companyId: string,
  opts: { de: string; dias?: number; servico?: unknown; profissional?: unknown; agora?: Date; limite?: number },
) {
  const cfg = await agendaCfg(db, companyId);
  const [profs, servs] = await Promise.all([profissionais(db, companyId), servicos(db, companyId)]);
  const serv = achar(servs.filter((s) => s.ativo), opts.servico, (s) => s.nome, "Serviço");
  const ativos = profs.filter((p) => p.ativo);
  const prof = achar(ativos, opts.profissional, (p) => p.nome, "Profissional");
  const alvo: (Prof | null)[] = prof ? [prof] : ativos.length ? ativos : [null];
  const dur = serv?.duracao_min ?? cfg.intervalo_min;
  const dias = Math.min(Math.max(opts.dias ?? 1, 1), 14);
  const ini = paraUtc(`${opts.de} 00:00`, cfg.fuso);
  if (!ini) throw new Error("Data inválida. Use AAAA-MM-DD.");
  const fimJanela = new Date(ini.getTime() + dias * 86400000);
  const ocupados = (await agendamentosEntre(db, companyId, new Date(ini.getTime() - 12 * 3600000), fimJanela)).filter((a) => ATIVOS.includes(a.status));
  const agora = opts.agora ?? new Date();
  const limite = opts.limite ?? 40;
  const livres: { profissional: string | null; profissional_id: string | null; data: string; dia: string; hora: string }[] = [];
  for (let i = 0; i < dias && livres.length < limite; i++) {
    const diaIso = new Date(ini.getTime() + i * 86400000 + 12 * 3600000);
    const l = local(diaIso, cfg.fuso);
    if (!cfg.dias.includes(l.diaSemana)) continue;
    const abre = paraUtc(`${l.data} ${cfg.inicio}`, cfg.fuso)!;
    const fecha = paraUtc(`${l.data} ${cfg.fim}`, cfg.fuso)!;
    for (let t = abre.getTime(); t + dur * 60000 <= fecha.getTime() && livres.length < limite; t += cfg.intervalo_min * 60000) {
      if (t < agora.getTime() + 15 * 60000) continue;
      for (const p of alvo) {
        const conflito = ocupados.some((a) => (p ? a.profissional_id === p.id : true) && Date.parse(a.inicio) < t + dur * 60000 && Date.parse(a.fim) > t);
        if (!conflito) {
          const h = local(new Date(t), cfg.fuso);
          livres.push({ profissional: p?.nome ?? null, profissional_id: p?.id ?? null, data: h.data, dia: h.dia, hora: h.hora });
          if (livres.length >= limite) break;
        }
      }
    }
  }
  return { cfg, servico: serv, profissional: prof, duracao_min: dur, livres };
}

/** Confere se o horário está livre para o profissional (ou para a agenda geral, sem profissional). */
export async function horarioLivre(db: SupabaseClient, companyId: string, inicio: Date, fim: Date, profissionalId: string | null, ignorarId?: string) {
  const ocupados = (await agendamentosEntre(db, companyId, new Date(inicio.getTime() - 12 * 3600000), fim)).filter(
    (a) => ATIVOS.includes(a.status) && a.id !== ignorarId && (profissionalId ? a.profissional_id === profissionalId : true),
  );
  return !ocupados.some((a) => Date.parse(a.inicio) < fim.getTime() && Date.parse(a.fim) > inicio.getTime());
}

// ---------- ferramentas da Coraline AI ----------

type Ctx = { db: SupabaseClient; companyId: string; today?: Date };
type Propose = (ctx: never, a: { kind: string; area: "support"; title: string; reason: string; payload: Json; customer_id?: string | null }) => Promise<unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const dataValida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function pacientes(db: SupabaseClient, companyId: string) {
  return lista<Pac>(db.from("customers").select("id,name,phone,etapa").eq("company_id", companyId));
}

export function agendaTools(propose: Propose) {
  return [
    {
      name: "agenda_consultar",
      area: "support" as const,
      label: "Consultou a agenda",
      description: "Consultas marcadas num período (padrão: hoje e os próximos 7 dias), com paciente, profissional, serviço e situação. Filtre por profissional ou paciente.",
      input_schema: {
        type: "object",
        properties: { de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD (inclusive)" }, profissional: { type: "string" }, paciente: { type: "string" } },
      },
      async run(ctx: Ctx, i: Json) {
        const cfg = await agendaCfg(ctx.db, ctx.companyId);
        const hoje = local(ctx.today ?? new Date(), cfg.fuso).data;
        const de = dataValida(i.de) ?? hoje;
        const ate = dataValida(i.ate) ?? local(new Date(paraUtc(`${de} 12:00`, cfg.fuso)!.getTime() + 7 * 86400000), cfg.fuso).data;
        const [ags, profs, servs, pacs] = await Promise.all([
          agendamentosEntre(ctx.db, ctx.companyId, paraUtc(`${de} 00:00`, cfg.fuso)!, new Date(paraUtc(`${ate} 00:00`, cfg.fuso)!.getTime() + 86400000)),
          profissionais(ctx.db, ctx.companyId),
          servicos(ctx.db, ctx.companyId),
          pacientes(ctx.db, ctx.companyId),
        ]);
        const prof = achar(profs, i.profissional, (p) => p.nome, "Profissional");
        const nomePac = norm(str(i.paciente));
        const linhas = ags
          .map((a) => {
            const p = pacs.find((x) => x.id === a.customer_id);
            const l = local(new Date(a.inicio), cfg.fuso);
            return {
              agendamento_id: a.id,
              data: l.data,
              dia: l.dia,
              hora: l.hora,
              ate: local(new Date(a.fim), cfg.fuso).hora,
              paciente: p?.name ?? "(sem paciente)",
              paciente_id: a.customer_id,
              telefone: p?.phone ?? null,
              profissional: profs.find((x) => x.id === a.profissional_id)?.nome ?? null,
              profissional_id: a.profissional_id,
              servico: servs.find((x) => x.id === a.servico_id)?.nome ?? null,
              situacao: a.status,
              tipo: a.tipo,
              origem: a.origem,
              observacoes: a.observacoes,
            };
          })
          .filter((x) => (!prof || x.profissional_id === prof.id) && (!nomePac || norm(x.paciente).includes(nomePac)));
        const por = (s: string) => linhas.filter((x) => x.situacao === s).length;
        return {
          periodo: { de, ate },
          total: linhas.length,
          por_situacao: { agendado: por("agendado"), confirmado: por("confirmado"), realizado: por("realizado"), faltou: por("faltou"), cancelado: por("cancelado") },
          consultas: linhas.slice(0, 80),
          profissionais_cadastrados: profs.filter((p) => p.ativo).map((p) => p.nome),
        };
      },
    },
    {
      name: "agenda_horarios_livres",
      area: "support" as const,
      label: "Consultou horários livres",
      description: "Horários livres a partir de uma data, considerando dias e horário de atendimento da clínica, a duração do serviço e as consultas já marcadas.",
      input_schema: {
        type: "object",
        required: ["data"],
        properties: {
          data: { type: "string", description: "AAAA-MM-DD (primeiro dia da busca)" },
          dias: { type: "integer", minimum: 1, maximum: 14, description: "Quantos dias olhar (padrão 1)" },
          servico: { type: "string", description: "Nome do serviço (define a duração)" },
          profissional: { type: "string", description: "Nome do profissional" },
        },
      },
      async run(ctx: Ctx, i: Json) {
        const de = dataValida(i.data);
        if (!de) throw new Error("Informe a data no formato AAAA-MM-DD.");
        const r = await horariosLivres(ctx.db, ctx.companyId, { de, dias: Number(i.dias) || 1, servico: i.servico, profissional: i.profissional, agora: ctx.today });
        return {
          servico: r.servico?.nome ?? null,
          duracao_min: r.duracao_min,
          horario_da_clinica: `${r.cfg.inicio}–${r.cfg.fim}, dias ${r.cfg.dias.map((d) => DIAS[d]).join(", ")}`,
          quantidade: r.livres.length,
          livres: r.livres,
        };
      },
    },
    {
      name: "agenda_marcar_preparar",
      area: "support" as const,
      label: "Preparou agendamento",
      description:
        "Prepara a marcação de uma consulta. NÃO marca: cria um pedido na Central de Aprovações. Informe o paciente (id ou nome; para paciente novo, nome e telefone), o horário de início no fuso da clínica, e se houver, serviço e profissional. Consulte os horários livres antes.",
      input_schema: {
        type: "object",
        required: ["inicio"],
        properties: {
          paciente: { type: "string", description: "Id ou nome de paciente já cadastrado" },
          paciente_novo_nome: { type: "string" },
          paciente_novo_telefone: { type: "string" },
          inicio: { type: "string", description: "AAAA-MM-DD HH:MM no horário da clínica" },
          servico: { type: "string" },
          profissional: { type: "string" },
          tipo: { type: "string", enum: ["consulta", "retorno", "procedimento", "avaliacao"] },
          observacoes: { type: "string" },
        },
      },
      async run(ctx: Ctx, i: Json) {
        const cfg = await agendaCfg(ctx.db, ctx.companyId);
        const [profs, servs, pacs] = await Promise.all([profissionais(ctx.db, ctx.companyId), servicos(ctx.db, ctx.companyId), pacientes(ctx.db, ctx.companyId)]);
        const ativos = profs.filter((p) => p.ativo);
        const serv = achar(servs.filter((s) => s.ativo), i.servico, (s) => s.nome, "Serviço");
        let prof = achar(ativos, i.profissional, (p) => p.nome, "Profissional");
        if (!prof && ativos.length === 1) prof = ativos[0];
        if (!prof && ativos.length > 1) throw new Error(`Informe o profissional: ${ativos.map((p) => p.nome).join(", ")}.`);
        const pac = achar(pacs, i.paciente, (p) => p.name, "Paciente");
        const novoNome = str(i.paciente_novo_nome);
        let novoTel = str(i.paciente_novo_telefone).replace(/\D/g, "");
        if (novoTel && novoTel.length <= 11) novoTel = "55" + novoTel;
        if (!pac && !novoNome) throw new Error("Informe o paciente (cadastrado) ou o nome e telefone do paciente novo.");
        const inicio = paraUtc(str(i.inicio), cfg.fuso);
        if (!inicio) throw new Error("Informe o início como AAAA-MM-DD HH:MM.");
        if (inicio.getTime() < (ctx.today ?? new Date()).getTime() - 5 * 60000) throw new Error("Esse horário já passou.");
        const dur = serv?.duracao_min ?? cfg.intervalo_min;
        const fim = new Date(inicio.getTime() + dur * 60000);
        if (!(await horarioLivre(ctx.db, ctx.companyId, inicio, fim, prof?.id ?? null))) throw new Error("Esse horário já está ocupado. Consulte os horários livres e escolha outro.");
        const nome = pac?.name ?? novoNome;
        const tipo = ["consulta", "retorno", "procedimento", "avaliacao"].includes(str(i.tipo)) ? str(i.tipo) : "consulta";
        return propose(ctx as never, {
          kind: "action",
          area: "support",
          title: `Marcar ${tipo}: ${nome} — ${quando(inicio, cfg.fuso)}`,
          reason: [serv?.nome, prof?.nome && `com ${prof.nome}`, `${dur} min`].filter(Boolean).join(" · "),
          customer_id: pac?.id ?? null,
          payload: {
            acao: "agenda_marcar",
            customer_id: pac?.id ?? null,
            paciente_nome: nome,
            paciente_novo: pac ? null : { name: novoNome, phone: novoTel || null },
            profissional_id: prof?.id ?? null,
            profissional: prof?.nome ?? null,
            servico_id: serv?.id ?? null,
            servico: serv?.nome ?? null,
            inicio: inicio.toISOString(),
            fim: fim.toISOString(),
            quando: quando(inicio, cfg.fuso),
            tipo,
            observacoes: str(i.observacoes).slice(0, 2000) || null,
          },
        });
      },
    },
    {
      name: "agenda_alterar_preparar",
      area: "support" as const,
      label: "Preparou alteração na agenda",
      description: "Prepara remarcar (novo_inicio), confirmar, cancelar, marcar como realizada ou falta de uma consulta (use o agendamento_id da consulta). NÃO altera: cria um pedido na Central de Aprovações.",
      input_schema: {
        type: "object",
        required: ["agendamento_id"],
        properties: {
          agendamento_id: { type: "string" },
          novo_inicio: { type: "string", description: "AAAA-MM-DD HH:MM no horário da clínica (para remarcar)" },
          situacao: { type: "string", enum: ["confirmado", "cancelado", "realizado", "faltou"] },
          observacoes: { type: "string" },
        },
      },
      async run(ctx: Ctx, i: Json) {
        const cfg = await agendaCfg(ctx.db, ctx.companyId);
        const id = str(i.agendamento_id);
        const { data: a } = await ctx.db.from("agendamentos").select("id,customer_id,profissional_id,inicio,fim,status").eq("company_id", ctx.companyId).eq("id", id).maybeSingle();
        if (!a) throw new Error("Consulta não encontrada. Use o agendamento_id retornado por agenda_consultar.");
        const ag = a as Agendamento;
        const situacao = ["confirmado", "cancelado", "realizado", "faltou"].includes(str(i.situacao)) ? str(i.situacao) : null;
        const novo = str(i.novo_inicio) ? paraUtc(str(i.novo_inicio), cfg.fuso) : null;
        if (str(i.novo_inicio) && !novo) throw new Error("Informe o novo início como AAAA-MM-DD HH:MM.");
        if (!novo && !situacao && !str(i.observacoes)) throw new Error("Informe o que mudar: novo_inicio, situacao ou observacoes.");
        let fim: Date | null = null;
        if (novo) {
          fim = new Date(novo.getTime() + (Date.parse(ag.fim) - Date.parse(ag.inicio)));
          if (!(await horarioLivre(ctx.db, ctx.companyId, novo, fim, ag.profissional_id, ag.id))) throw new Error("O novo horário já está ocupado. Consulte os horários livres.");
        }
        const pacs = await pacientes(ctx.db, ctx.companyId);
        const nome = pacs.find((p) => p.id === ag.customer_id)?.name ?? "paciente";
        const acaoTxt = novo ? `Remarcar ${nome} para ${quando(novo, cfg.fuso)}` : situacao === "cancelado" ? `Cancelar consulta de ${nome}` : situacao === "confirmado" ? `Confirmar consulta de ${nome}` : situacao === "realizado" ? `Marcar consulta de ${nome} como realizada` : situacao === "faltou" ? `Registrar falta de ${nome}` : `Atualizar observações da consulta de ${nome}`;
        return propose(ctx as never, {
          kind: "action",
          area: "support",
          title: acaoTxt,
          reason: `Consulta de ${quando(new Date(ag.inicio), cfg.fuso)}`,
          customer_id: ag.customer_id,
          payload: {
            acao: "agenda_alterar",
            id: ag.id,
            paciente_nome: nome,
            de: quando(new Date(ag.inicio), cfg.fuso),
            novo_inicio: novo?.toISOString() ?? null,
            novo_fim: fim?.toISOString() ?? null,
            quando: novo ? quando(novo, cfg.fuso) : null,
            situacao,
            observacoes: str(i.observacoes).slice(0, 2000) || null,
          },
        });
      },
    },
  ];
}

// ---------- execução depois da aprovação ----------

const ETAPA_ORDEM = ["novo", "contato", "agendado", "compareceu", "orcamento", "fechado", "perdido"];
/** Avança a etapa do paciente no funil (nunca volta). */
export async function avancarEtapa(db: SupabaseClient, companyId: string, customerId: string | null, etapa: string) {
  if (!customerId) return;
  const { data } = await db.from("customers").select("etapa").eq("company_id", companyId).eq("id", customerId).maybeSingle();
  const atual = (data?.etapa as string) ?? "novo";
  if (atual === "perdido" || ETAPA_ORDEM.indexOf(atual) < ETAPA_ORDEM.indexOf(etapa)) {
    await db.from("customers").update({ etapa }).eq("company_id", companyId).eq("id", customerId);
  }
}

export async function executarAgenda(db: SupabaseClient, companyId: string, p: Json): Promise<string> {
  const conflito = (msg: string) => (/agendamentos_sem_conflito|exclusion|conflicting/i.test(msg) ? "Esse horário já foi ocupado por outra consulta. Escolha outro horário." : msg);
  if (p.acao === "agenda_marcar") {
    let customerId = (p.customer_id as string) || null;
    const novo = p.paciente_novo as { name?: string; phone?: string | null } | null;
    if (!customerId && novo?.name) {
      if (novo.phone) {
        const { data: ex } = await db.from("customers").select("id").eq("company_id", companyId).eq("phone", novo.phone).maybeSingle();
        customerId = (ex?.id as string) ?? null;
      }
      if (!customerId) {
        const { data, error } = await db.from("customers").insert({ company_id: companyId, name: novo.name, phone: novo.phone ?? null, status: "lead", etapa: "agendado" }).select("id").single();
        if (error) throw new Error(error.message);
        customerId = data.id as string;
      }
    }
    const { error } = await db.from("agendamentos").insert({
      company_id: companyId,
      customer_id: customerId,
      profissional_id: p.profissional_id ?? null,
      servico_id: p.servico_id ?? null,
      inicio: p.inicio,
      fim: p.fim,
      tipo: p.tipo ?? "consulta",
      origem: "ia",
      observacoes: p.observacoes ?? null,
    });
    if (error) throw new Error(conflito(error.message));
    await avancarEtapa(db, companyId, customerId, "agendado");
    return `Consulta marcada: ${p.paciente_nome} — ${p.quando}`;
  }
  if (p.acao === "agenda_alterar") {
    const upd: Json = { atualizado_em: new Date().toISOString() };
    if (p.novo_inicio) Object.assign(upd, { inicio: p.novo_inicio, fim: p.novo_fim, status: "agendado", confirmado_em: null, lembrete_enviado_em: null });
    if (p.situacao) upd.status = p.situacao;
    if (p.situacao === "confirmado") upd.confirmado_em = new Date().toISOString();
    if (p.observacoes) upd.observacoes = p.observacoes;
    const { data, error } = await db.from("agendamentos").update(upd).eq("company_id", companyId).eq("id", String(p.id)).select("id,customer_id");
    if (error) throw new Error(conflito(error.message));
    if (!data?.length) throw new Error("Consulta não encontrada (pode ter sido excluída).");
    if (p.situacao === "realizado") await avancarEtapa(db, companyId, (data[0].customer_id as string) ?? null, "compareceu");
    return p.novo_inicio ? `Consulta de ${p.paciente_nome} remarcada para ${p.quando}` : p.situacao === "cancelado" ? `Consulta de ${p.paciente_nome} cancelada` : p.situacao === "confirmado" ? `Consulta de ${p.paciente_nome} confirmada` : p.situacao === "realizado" ? `Consulta de ${p.paciente_nome} registrada como realizada` : p.situacao === "faltou" ? `Falta de ${p.paciente_nome} registrada` : "Consulta atualizada";
  }
  return "Aprovado";
}
