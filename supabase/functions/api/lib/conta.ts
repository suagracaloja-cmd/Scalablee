// Conta da empresa: exclusão definitiva (direito de eliminação da LGPD).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./util.ts";
import { AsaasError, asaasClient, billingConfig, cancelSubscription, type AsaasClient, type Billing } from "./billing.ts";

/**
 * Apaga a conta e TODOS os dados da empresa. Ao excluir o usuário, o banco apaga em cascata a empresa
 * e tudo ligado a ela (vendas, clientes, financeiro, tarefas, conversas, aprovações, WhatsApp…).
 * Arquivos enviados (fotos) ficam fora do banco, então são removidos antes.
 */
export async function excluirConta(admin: SupabaseClient, userId: string, companyId: string | null, confirmacao: unknown, asaas?: AsaasClient) {
  if (String(confirmacao ?? "").trim().toUpperCase() !== "EXCLUIR") throw new HttpError(400, 'Para confirmar, digite EXCLUIR.');
  if (companyId) {
    // Para de cobrar antes de apagar: a assinatura no Asaas é cancelada primeiro
    const { data: b } = await admin.from("billing").select("*").eq("company_id", companyId).maybeSingle();
    if (b?.asaas_subscription_id && b.status !== "canceled") {
      try {
        await cancelSubscription(admin, b as Billing, asaas ?? asaasClient(billingConfig()));
      } catch (e) {
        const msg = e instanceof AsaasError || e instanceof Error ? e.message : String(e);
        throw new HttpError(502, `Não foi possível cancelar a assinatura no Asaas, então a conta não foi excluída. Tente de novo em instantes. (${msg})`);
      }
    }
    const { data: files } = await admin.storage.from("avatars").list(companyId, { limit: 1000 });
    if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${companyId}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, `Não foi possível excluir a conta: ${error.message}`);
  return { ok: true };
}
