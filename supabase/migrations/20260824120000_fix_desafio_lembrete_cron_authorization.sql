-- 2026-08-24: producao confirmou HTTP 401 UNAUTHORIZED_INVALID_JWT_FORMAT ("Auth header is not
-- 'Bearer {token}'") na chamada do cron desafio-lembrete-vencimento-diario. O command gravado
-- tinha espacos extras apos "Bearer" e espacos DENTRO do proprio JWT — sequela da sanitizacao
-- de 20260823120000, que trocou CR/LF por espaco em um token que estava quebrado em varias
-- linhas. Resultado: o gateway rejeitava a request antes da edge function executar.
--
-- Correcao minima: recria APENAS este job, mesmo schedule (0 11 * * * UTC = 08:00 em
-- America/Sao_Paulo), com o command em LINHA UNICA e o token integro (mesma ANON key ja
-- versionada em 20260821120000 e usada pelo frontend). Nada mais e alterado.
--
-- O bloco final revalida o que ficou gravado em cron.job e ABORTA a migration se o command
-- contiver CR/LF ou se o header Authorization nao estiver byte a byte como o esperado —
-- assim um futuro `db push` nunca deixa passar um command defeituoso em silencio.

do $$
declare
  v_jobid bigint;
  v_command text;
  v_token constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdoend5aWdvdWh2bGp1Yml0b3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNTAyMDEsImV4cCI6MjA3MDYyNjIwMX0.N18DkGrlF-0X8Gcg-7kePK0ZJ86-1wyiZu9SeUCjWvY';
  v_header_esperado text;
begin
  if v_token ~ '[^A-Za-z0-9_.-]' then
    raise exception 'Token esperado contem caractere invalido para JWT';
  end if;

  select jobid
    into v_jobid
  from cron.job
  where jobname = 'desafio-lembrete-vencimento-diario'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'desafio-lembrete-vencimento-diario',
    '0 11 * * *',
    'select net.http_post(url := ''https://ghzwyigouhvljubitowt.supabase.co/functions/v1/desafio-lembrete-vencimento'', headers := ''{"Content-Type":"application/json","Authorization":"Bearer ' || v_token || '"}''::jsonb, body := ''{}''::jsonb);'
  );

  select command
    into v_command
  from cron.job
  where jobname = 'desafio-lembrete-vencimento-diario';

  if v_command is null then
    raise exception 'Job desafio-lembrete-vencimento-diario nao encontrado apos recriar';
  end if;

  if v_command ~ E'[\r\n]' then
    raise exception 'command gravado ainda contem CR/LF';
  end if;

  v_header_esperado := '"Authorization":"Bearer ' || v_token || '"';
  if position(v_header_esperado in v_command) = 0 then
    raise exception 'Header Authorization gravado nao confere com o token integro esperado';
  end if;
end
$$;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'desafio-lembrete-vencimento-diario';
