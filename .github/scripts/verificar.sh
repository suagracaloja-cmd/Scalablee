#!/usr/bin/env bash
# Verifica se o site e a API da Scalable respondem.
# Até 3 tentativas, com 20 s entre elas, para não alarmar por um soluço passageiro de rede.
# Saídas (GITHUB_OUTPUT): ok=sim|nao e detalhe=<texto curto>. Nunca imprime segredos (não usa nenhum).
set -uo pipefail
: "${SITE_URL:?}" "${SAUDE_URL:?}"
saida=${GITHUB_OUTPUT:-/dev/null}
resumo=${GITHUB_STEP_SUMMARY:-/dev/null}

checa_site() {
  local corpo codigo
  corpo=$(curl -sS --max-time 20 -w $'\n%{http_code} %{time_total}' "$SITE_URL" 2>&1) || { echo "site: sem resposta ($(tail -1 <<<"$corpo"))"; return 1; }
  read -r codigo tempo <<<"$(tail -1 <<<"$corpo")"
  if [ "$codigo" != 200 ]; then echo "site: HTTP $codigo"; return 1; fi
  if ! grep -q 'id="root"' <<<"$corpo"; then echo "site: respondeu 200, mas a página não é a da Scalable"; return 1; fi
  echo "site: ok (${tempo}s)"
}

checa_api() {
  local corpo codigo
  corpo=$(curl -sS --max-time 20 -w $'\n%{http_code} %{time_total}' "$SAUDE_URL" 2>&1) || { echo "api: sem resposta ($(tail -1 <<<"$corpo"))"; return 1; }
  read -r codigo tempo <<<"$(tail -1 <<<"$corpo")"
  local json; json=$(sed '$d' <<<"$corpo")
  if [ "$codigo" != 200 ] || ! jq -e '.ok == true' >/dev/null 2>&1 <<<"$json"; then
    echo "api/banco: HTTP $codigo $(jq -c '{banco, banco_ms}' 2>/dev/null <<<"$json" || true)"; return 1
  fi
  echo "api: ok (${tempo}s), banco respondeu em $(jq -r '.banco_ms' <<<"$json") ms"
}

for tentativa in 1 2 3; do
  s=$(checa_site); rs=$?
  a=$(checa_api); ra=$?
  echo "tentativa $tentativa → $s | $a"
  if [ $rs -eq 0 ] && [ $ra -eq 0 ]; then
    { echo "ok=sim"; echo "detalhe=$s; $a"; } >> "$saida"
    echo "✅ $s · $a" >> "$resumo"
    exit 0
  fi
  [ $tentativa -lt 3 ] && sleep 20
done

{ echo "ok=nao"; echo "detalhe=$s; $a"; } >> "$saida"
echo "❌ $s · $a" >> "$resumo"
exit 0
