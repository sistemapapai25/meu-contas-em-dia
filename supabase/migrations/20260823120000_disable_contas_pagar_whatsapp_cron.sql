-- O usuario pediu em 2026-08-23 para nao receber mais o resumo automatico de contas a pagar.
-- Na mesma data foi identificado que o job dos mantenedores falhava porque seu command continha
-- CR/LF dentro do JSON do header Authorization. Remove apenas o job de contas e recria o job dos
-- mantenedores com o mesmo command sanitizado.
do $$
declare
  v_contas_jobid bigint;
  v_desafio_jobid bigint;
  v_desafio_command text;
begin
  select jobid
    into v_contas_jobid
  from cron.job
  where jobname = 'contas-pagar-grupo-diario'
  limit 1;

  if v_contas_jobid is not null then
    perform cron.unschedule(v_contas_jobid);
  end if;

  select jobid, command
    into v_desafio_jobid, v_desafio_command
  from cron.job
  where jobname = 'desafio-lembrete-vencimento-diario'
  limit 1;

  if v_desafio_jobid is null or v_desafio_command is null then
    raise exception 'Cron desafio-lembrete-vencimento-diario nao encontrado';
  end if;

  perform cron.unschedule(v_desafio_jobid);
  perform cron.schedule(
    'desafio-lembrete-vencimento-diario',
    '0 11 * * *',
    regexp_replace(v_desafio_command, E'[\r\n]+', ' ', 'g')
  );
end
$$;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'desafio-lembrete-vencimento-diario';
