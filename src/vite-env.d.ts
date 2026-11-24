/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do projeto Supabase onde ficam as funções diag_* (ver supabase/migrations). */
  readonly VITE_SUPABASE_URL: string
  /** Chave pública (anon/publishable) do mesmo projeto. É pública por desenho; quem protege os dados é o RLS. */
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Endereço do site da SCALABLE, para onde levam "Já tenho conta" e o botão final do relatório. */
  readonly VITE_SCALABLE_URL?: string
}
