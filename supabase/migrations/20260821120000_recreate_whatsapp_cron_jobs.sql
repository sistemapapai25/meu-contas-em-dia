-- Versiona os cron jobs dos avisos diarios por WhatsApp, no padrao validado em producao em
-- 2026-08-21. Na verificacao de producao dessa data, `desafio-lembrete-vencimento-diario` foi
-- encontrado ativo e `contas-pagar-grupo-diario` estava ausente (nunca fora versionado) -- este
-- ultimo foi recriado manualmente via SQL Editor, espelhando o command do job existente. Esta
-- migration registra os dois em codigo para que um reset futuro do projeto consiga recria-los
-- via `supabase db push`, em vez de depender de "so existir no banco".
--
-- `cron.schedule(job_name, schedule, command)` faz upsert quando `job_name` ja existe (atualiza
-- schedule/command em vez de duplicar) -- por isso este arquivo e seguro de reaplicar.
--
-- Schedule `0 11 * * *`: o banco roda com `cron_timezone = GMT` (equivalente a UTC), entao
-- 11:00 GMT = 08:00 em America/Sao_Paulo (UTC-3, sem horario de verao) -- confirmado em
-- producao em 2026-08-21 (`0 8 * * *` estava disparando 05:00 no horario de Brasilia/Goiania).
--
-- Autenticacao: os dois usam a ANON key (mesma de VITE_SUPABASE_ANON_KEY, ja publica no bundle
-- do frontend) apenas para passar na verificacao de JWT do gateway das edge functions. O acesso
-- privilegiado ao banco e feito dentro de cada function via SUPABASE_SERVICE_ROLE_KEY lido do
-- ambiente (Deno.env), nao pelo header do cron. Nao usa Vault -- nao ha extensao nem segredo
-- adicional necessario para este arquivo rodar.

select cron.schedule(
  'desafio-lembrete-vencimento-diario',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://ghzwyigouhvljubitowt.supabase.co/functions/v1/desafio-lembrete-vencimento',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdoend5aWdvdWh2bGp1Yml0b3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNTAyMDEsImV4cCI6MjA3MDYyNjIwMX0.N18DkGrlF-0X8Gcg-7kePK0ZJ86-1wyiZu9SeUCjWvY"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'contas-pagar-grupo-diario',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://ghzwyigouhvljubitowt.supabase.co/functions/v1/contas-pagar-grupo',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdoend5aWdvdWh2bGp1Yml0b3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNTAyMDEsImV4cCI6MjA3MDYyNjIwMX0.N18DkGrlF-0X8Gcg-7kePK0ZJ86-1wyiZu9SeUCjWvY"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

select jobid, jobname, schedule, active
from cron.job
where jobname in ('desafio-lembrete-vencimento-diario', 'contas-pagar-grupo-diario');
