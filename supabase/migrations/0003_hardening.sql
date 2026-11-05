-- Função de gatilho não precisa ser chamável via API
revoke execute on function public.create_default_agents() from public, anon, authenticated;
