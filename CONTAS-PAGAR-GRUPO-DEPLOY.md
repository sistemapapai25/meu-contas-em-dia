# Deploy — Aviso diário de Contas a Pagar no WhatsApp

> Criado em 2026-06-23 (envio para **grupo** via uazapiGO).
> **Reescrito em 2026-07-27:** o destino agora é **número individual via Meta Cloud API**,
> com template aprovado. O caminho de grupo virou legado (a sessão UazAPI está desconectada
> desde 2026-07 e a Cloud API não envia para `@g.us`).

Envia um **resumo** das contas (DESPESA, em aberto) que vencem hoje + as atrasadas.
Formato resumo — e não a lista item a item — porque **variável de template da Meta não aceita
quebra de linha**, então não dá para jogar 39 contas dentro de uma variável.

> **Envio automático desativado em 2026-08-23 a pedido do usuário.** O cron
> `contas-pagar-grupo-diario` deve permanecer ausente. A função continua disponível somente para
> pré-visualização e envio manual com destino explícito.

## Arquivos no repositório

- `supabase/functions/contas-pagar-grupo/index.ts` — a edge function (slug mantido para não quebrar o cron/UI).
- `supabase/migrations/20260623120000_contas_pagar_grupo_template.sql` — template de texto livre (usado só no fallback/grupo).
- `src/pages/ContasAPagar.tsx` — card "Aviso diário de contas a pagar".

---

## Template na Meta

**`contas_pagar_resumo_diario`** · pt_BR · UTILITY · criado em 2026-07-27 (id `1729654464737561`).

```
📋 *Contas a pagar — {{1}}*

Vencendo hoje: {{2}} · Atrasadas: {{3}}
💰 Total: {{4}}

🔎 Maiores: {{5}}

Toque no botão abaixo para ver todas as contas.
```

| Var | Conteúdo | Exemplo |
|-----|----------|---------|
| `{{1}}` | data | `27/07/2026` |
| `{{2}}` | qtd vencendo hoje | `3` |
| `{{3}}` | qtd atrasadas | `34` |
| `{{4}}` | total | `R$ 12.345,67` |
| `{{5}}` | as 3 maiores contas | `Aluguel APB R$ 3.000,00 (venc. 20/03) · ...` |

Botão URL estático: `Ver contas a pagar` → `https://financas-papai.vercel.app/contas-a-pagar`

> O conteúdo das variáveis é montado no código — dá para mudar (ex.: incluir o vencimento nas
> "maiores") **sem** reenviar o template para aprovação. Só o texto fixo exige nova aprovação.

Conferir o status: botão **Verificar template** na tela, ou `{"status_template": true}` no body.

---

## Passo 1 — Deploy da edge function

Com a CLI já autenticada e o projeto linkado (`ghzwyigouhvljubitowt`):

```bash
npx supabase functions deploy contas-pagar-grupo
```

> A CLI resolve o `import "../deno-shim.d.ts"` sozinha — **não precisa mais** remover a 1ª linha
> nem colar o código no painel (aquele era o procedimento antigo, para deploy manual).

## Passo 2 — Secret com o(s) número(s) de destino

```bash
npx supabase secrets set CONTAS_PAGAR_NUMEROS="5562984127321"
# vários destinos: separe por vírgula
# npx supabase secrets set CONTAS_PAGAR_NUMEROS="5562984127321,5562999998888"
```

Outros secrets (opcionais): `ENABLE_CONTAS_PAGAR_GRUPO` (default `false`, é a trava geral do cron),
`CONTAS_PAGAR_GRUPO_ID` (legado, só se voltar a usar grupo via uazapiGO).

## Passo 3 — Testar antes do cron

Na tela **Contas a Pagar** → card "Aviso diário de contas a pagar": digite o número,
**Pré-visualizar** e depois **Enviar agora**.

Ou por linha de comando:

```bash
# prévia (não envia)
curl -s -X POST ".../functions/v1/contas-pagar-grupo" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"dry_run":true}'

# envio de teste para um número específico
curl -s -X POST ".../functions/v1/contas-pagar-grupo" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"numeros":["5562984127321"]}'
```

⚠️ Se a resposta vier com `"via": "texto_fallback"` e um campo `aviso`, o template **não** foi
usado (provavelmente ainda não aprovado). Nesse caso a Meta responde 200 mas **descarta** a
mensagem fora da janela de 24h — não confie no `enviado: true`.

## Passo 4 — Cron diário às 8h (DESATIVADO)

```sql
-- 1) pegue o Authorization do job que já funciona
select jobid, jobname, schedule, command
from cron.job
where jobname ilike '%lembrete%' or jobname ilike '%contas%';

-- 2) crie/atualize o job (use o MESMO token do job de desafios)
select cron.unschedule('contas-pagar-grupo-diario');  -- se já existir
select cron.schedule(
  'contas-pagar-grupo-diario',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://ghzwyigouhvljubitowt.supabase.co/functions/v1/contas-pagar-grupo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer COLE_AQUI_O_MESMO_TOKEN_DO_JOB_DE_DESAFIOS'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

O bloco acima é mantido apenas como histórico. Não recriar esse job sem uma nova autorização
explícita do usuário.

Quando não houver nenhuma conta vencendo/atrasada, a função **não envia** (decisão de 2026-07-27).

## Modos da função (body do POST)

| Body | O que faz |
|------|-----------|
| `{}` | envio do cron — usa o secret `CONTAS_PAGAR_NUMEROS` |
| `{"dry_run": true}` | devolve a mensagem e os `template_params` **sem enviar** |
| `{"status_template": true}` | status do template na Meta (APPROVED/PENDING/REJECTED) |
| `{"numeros": ["5562..."]}` | envia para esses números (ignora o secret) |
| `{"forcar_texto": true}` | pula o template e manda texto livre (só p/ diagnóstico) |
| `{"enviar_vazio": true}` | envia mesmo sem nenhuma conta em aberto |
| `{"grupo_id": "...@g.us"}` | legado — envia ao grupo via uazapiGO |
| `{"listar_grupos": true}` | legado — lista grupos da uazapiGO |
