import "../deno-shim.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarTextoMeta, enviarTemplateMeta, formatarNumeroBr } from "../_shared/whatsapp-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fallback legado (grupos): uazapiGO ainda é usado se configurado, pois Cloud API não envia para @g.us.
const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL");
const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
// JID do grupo de destino (legado — a sessão UazAPI está desconectada desde 2026-07).
const CONTAS_PAGAR_GRUPO_ID = (Deno.env.get("CONTAS_PAGAR_GRUPO_ID") ?? "").trim();
// Destino atual: número(s) individual(is), separados por vírgula/;/espaço. Ex.: "5562984127321,5562999998888"
const CONTAS_PAGAR_NUMEROS = (Deno.env.get("CONTAS_PAGAR_NUMEROS") ?? "").trim();
// Falha fechada: o envio recorrente so funciona quando for explicitamente habilitado.
// Os modos manuais (pre-visualizacao ou destino informado no body) continuam disponiveis.
const ENABLE_CONTAS_PAGAR_GRUPO =
  (Deno.env.get("ENABLE_CONTAS_PAGAR_GRUPO") ?? "false").toLowerCase() === "true";

const TIPO_TEMPLATE = "CONTAS_PAGAR_GRUPO_DIARIO";
// Template aprovado na Meta (5 vars: data, qtd_hoje, qtd_atrasadas, total, maiores).
const META_TEMPLATE_NOME = "contas_pagar_resumo_diario";
const META_TEMPLATE_IDIOMA = "pt_BR";
// Quantas contas entram na variável {maiores} do template.
const MAIORES_QTD = 3;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function toYmd(date: Date): string {
  return date.toISOString().split("T")[0];
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" sem criar Date (evita problema de fuso)
function ymdToBr(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

function diasEntre(ymdA: string, ymdB: string): number {
  const a = new Date(`${ymdA}T12:00:00`).getTime();
  const b = new Date(`${ymdB}T12:00:00`).getTime();
  return Math.round((a - b) / 86400000);
}

/**
 * A Meta rejeita variável de template com quebra de linha, tab ou 4+ espaços seguidos,
 * e também variável vazia. Colapsa qualquer espaço em branco e trunca.
 */
function sanitizarVarTemplate(valor: unknown, max = 320): string {
  let v = String(valor ?? "").replace(/\s+/g, " ").trim();
  if (v.length > max) v = `${v.slice(0, max - 1).trimEnd()}…`;
  return v || "-";
}

function descricaoConta(c: any, max = 40): string {
  const desc = String(c?.descricao || c?.beneficiario?.name || c?.categoria?.name || "Conta").trim();
  return desc.length > max ? `${desc.slice(0, max - 1).trimEnd()}…` : desc;
}

/** Aceita "5562...,5562..." ou com ; / espaço / quebra de linha. */
function parseDestinos(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => String(n || "").trim()).filter(Boolean);
  }
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Envia o resumo para UM número individual.
 * Caminho principal: template aprovado (funciona fora da janela de 24h).
 * Se o template falhar (ex.: ainda não aprovado), cai em texto livre — que só chega
 * dentro da janela de 24h, mas serve para teste/diagnóstico.
 */
async function enviarParaNumero(
  numero: string,
  params: string[],
  textoFallback: string,
  opts: { forcarTexto?: boolean } = {},
): Promise<{ destino: string; tipo: "numero"; ok: boolean; via: string; erro?: string; result?: unknown }> {
  const destino = formatarNumeroBr(numero);
  let erroTemplate: string | undefined;

  if (!opts.forcarTexto) {
    const envio = await enviarTemplateMeta({
      numero: destino,
      templateName: META_TEMPLATE_NOME,
      languageCode: META_TEMPLATE_IDIOMA,
      components: [
        {
          type: "body",
          parameters: params.map((p) => ({ type: "text", text: sanitizarVarTemplate(p) })),
        },
      ],
    });
    if (envio.ok) {
      return { destino, tipo: "numero", ok: true, via: "template", result: envio.result };
    }
    erroTemplate = envio.error;
    console.error(`Template falhou para ${destino}: ${envio.error}. Tentando texto livre.`);
  }

  const texto = await enviarTextoMeta(destino, textoFallback);
  return {
    destino,
    tipo: "numero",
    ok: texto.ok,
    via: opts.forcarTexto ? "texto" : "texto_fallback",
    erro: texto.ok ? undefined : texto.error,
    erro_template: erroTemplate,
    // A Meta devolve 200 + wamid mesmo descartando texto livre fora da janela de 24h
    // (erro 131047, só visível por webhook). Então "ok" aqui NÃO garante entrega.
    ...(texto.ok
      ? {
          aviso:
            "Enviado como texto livre porque o template falhou. Fora da janela de 24h a Meta descarta a mensagem silenciosamente — só chega se o destinatário tiver escrito para o número nas últimas 24h.",
        }
      : {}),
    result: texto.result,
  };
}

/** Envio ao grupo (legado) — Cloud API não suporta @g.us, então só via uazapiGO. */
async function enviarParaGrupo(
  jid: string,
  mensagem: string,
): Promise<{ destino: string; tipo: "grupo"; ok: boolean; via: string; erro?: string; result?: unknown }> {
  if (!UAZAPI_BASE_URL || !UAZAPI_TOKEN) {
    const erro =
      "Envio para grupo WhatsApp não é suportado pela Cloud API da Meta. Configure UAZAPI_* ou use um número individual.";
    console.error(erro);
    return { destino: jid, tipo: "grupo", ok: false, via: "uazapi", erro };
  }
  try {
    const response = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
      method: "POST",
      headers: { "token": UAZAPI_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ number: jid, text: mensagem }),
    });
    const result = await response.json().catch(() => ({}));
    console.log("Resposta UazAPI (grupo):", JSON.stringify(result));
    return {
      destino: jid,
      tipo: "grupo",
      ok: response.ok,
      via: "uazapi",
      erro: response.ok ? undefined : `UazAPI HTTP ${response.status}`,
      result,
    };
  } catch (error) {
    console.error("Erro ao enviar WhatsApp (grupo):", error);
    return { destino: jid, tipo: "grupo", ok: false, via: "uazapi", erro: String(error) };
  }
}

// Tenta descobrir os grupos conectados na uazapiGO. Como o caminho exato pode variar entre
// versoes, tenta varios candidatos e devolve o primeiro que responder com uma lista.
function normalizarGrupos(data: unknown): Array<{ id: string; nome: string }> {
  const arr: any[] = Array.isArray(data)
    ? (data as any[])
    : Array.isArray((data as any)?.groups)
      ? (data as any).groups
      : Array.isArray((data as any)?.data)
        ? (data as any).data
        : [];
  return arr
    .map((g: any) => {
      const id = g?.JID ?? g?.jid ?? g?.id ?? g?.wa_chatid ?? g?.chatid ?? g?.gid ?? "";
      const nome = g?.subject ?? g?.name ?? g?.Name ?? g?.title ?? g?.subjectName ?? "";
      return { id: String(id || "").trim(), nome: String(nome || "").trim() };
    })
    .filter((g) => g.id.endsWith("@g.us") || g.id.includes("@g.us") || /\d{15,}/.test(g.id));
}

async function listarGrupos(): Promise<{ ok: boolean; endpoint?: string; grupos: Array<{ id: string; nome: string }>; raw?: unknown }> {
  if (!UAZAPI_BASE_URL || !UAZAPI_TOKEN) {
    return { ok: false, grupos: [], raw: { error: "Credenciais UazAPI nao configuradas" } };
  }
  const headers = { "token": UAZAPI_TOKEN, "Content-Type": "application/json" };
  const candidatos: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET", path: "/group/list" },
    { method: "GET", path: "/group/list?force=true" },
    { method: "POST", path: "/group/list", body: {} },
    { method: "POST", path: "/group/list", body: { force: true } },
    { method: "GET", path: "/group/getAllGroups" },
    { method: "GET", path: "/groups" },
  ];
  let ultimoRaw: unknown = null;
  for (const c of candidatos) {
    try {
      const res = await fetch(`${UAZAPI_BASE_URL}${c.path}`, {
        method: c.method,
        headers,
        body: c.body ? JSON.stringify(c.body) : undefined,
      });
      const data = await res.json().catch(() => null);
      ultimoRaw = data;
      if (!res.ok || !data) continue;
      const grupos = normalizarGrupos(data);
      if (grupos.length > 0) {
        return { ok: true, endpoint: `${c.method} ${c.path}`, grupos, raw: data };
      }
    } catch (_) {
      // tenta o proximo candidato
    }
  }
  return { ok: false, grupos: [], raw: ultimoRaw };
}

/**
 * Consulta (somente leitura) o status do template na Meta. Serve pra diagnosticar
 * "por que não chegou" — enquanto o template não estiver APPROVED, o envio fora da
 * janela de 24h é descartado silenciosamente pela Meta.
 */
async function statusTemplateMeta(): Promise<Record<string, unknown>> {
  const token = (Deno.env.get("WHATSAPP_TOKEN") ?? "").trim();
  const wabaId = (Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") ?? "").trim();
  const ver = (Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v22.0").trim();
  if (!token || !wabaId) {
    return { ok: false, error: "WHATSAPP_TOKEN ou WHATSAPP_BUSINESS_ACCOUNT_ID ausente nos secrets." };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${ver}/${wabaId}/message_templates` +
        `?name=${encodeURIComponent(META_TEMPLATE_NOME)}&fields=name,status,language,category,rejected_reason`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json().catch(() => ({}));
    const found = (data as any)?.data?.find(
      (t: any) => t?.name === META_TEMPLATE_NOME && t?.language === META_TEMPLATE_IDIOMA,
    );
    return {
      ok: res.ok,
      template: META_TEMPLATE_NOME,
      idioma: META_TEMPLATE_IDIOMA,
      status: found?.status ?? "NAO_ENCONTRADO",
      rejected_reason: found?.rejected_reason ?? null,
      aprovado: found?.status === "APPROVED",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as any));

    // Modo 0: status do template na Meta (somente leitura)
    if (body?.status_template === true) {
      return new Response(JSON.stringify(await statusTemplateMeta()), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo 1: descobrir o JID do grupo (legado)
    if (body?.listar_grupos === true) {
      const resultado = await listarGrupos();
      return new Response(JSON.stringify(resultado), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dryRun = body?.dry_run === true;
    const forcarTexto = body?.forcar_texto === true;

    // Destinos: número(s) individual(is) — caminho atual — e grupo (legado).
    const numerosBody = parseDestinos(body?.numeros);
    const numeros = numerosBody.length ? numerosBody : parseDestinos(CONTAS_PAGAR_NUMEROS);
    const grupoIdBody = typeof body?.grupo_id === "string" ? body.grupo_id.trim() : "";
    const grupoId = grupoIdBody || CONTAS_PAGAR_GRUPO_ID;

    // Por padrao nao manda nada quando nao ha contas; pode forcar com enviar_vazio.
    const enviarVazio = body?.enviar_vazio === true;

    // Travas do cron. Modo manual (dry_run ou destino explicito no body) ignora as travas.
    const modoManual = dryRun || !!grupoIdBody || numerosBody.length > 0;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: configMsg, error: configMsgError } = await supabase
      .from("configuracao_mensagens")
      .select("template_mensagem,ativo")
      .eq("tipo", TIPO_TEMPLATE)
      .maybeSingle();

    if (configMsgError) {
      console.error("Erro ao consultar a trava do aviso de contas a pagar:", configMsgError);
      return new Response(JSON.stringify({ error: configMsgError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const configAutomaticaAtiva = configMsg?.ativo === true;
    if (!modoManual && (!ENABLE_CONTAS_PAGAR_GRUPO || !configAutomaticaAtiva)) {
      return new Response(JSON.stringify({
        disabled: true,
        motivo: !ENABLE_CONTAS_PAGAR_GRUPO ? "env_desabilitada" : "configuracao_inativa",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hoje = toYmd(new Date());

    // Contas a pagar (DESPESA, em aberto) vencendo hoje OU atrasadas (vencimento <= hoje)
    const { data: contas, error: contasError } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, vencimento, categoria:categories(name), beneficiario:beneficiaries(name)")
      .eq("status", "EM_ABERTO")
      .eq("tipo", "DESPESA")
      .lte("vencimento", hoje)
      .is("deleted_at", null)
      .order("vencimento", { ascending: true });

    if (contasError) {
      console.error("Erro ao buscar contas:", contasError);
      return new Response(JSON.stringify({ error: contasError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lista = contas ?? [];
    const qtd = lista.length;
    const total = lista.reduce((s: number, c: any) => s + Number(c.valor || 0), 0);
    const qtdHoje = lista.filter((c: any) => c.vencimento === hoje).length;
    const qtdAtrasadas = qtd - qtdHoje;

    // Monta o bloco {lista}: uma linha por conta, marcando as atrasadas.
    const linhas = lista.map((c: any) => {
      const desc = c.descricao || c.beneficiario?.name || c.categoria?.name || "Conta";
      const valor = formatCurrency(c.valor);
      if (c.vencimento === hoje) {
        return `• ${desc} — ${valor} (vence hoje)`;
      }
      const dias = diasEntre(hoje, c.vencimento);
      return `• ${desc} — ${valor} (venceu em ${ymdToBr(c.vencimento)}, atrasada ${dias}d)`;
    });
    const blocoLista = linhas.join("\n");

    // As N maiores contas, em linha única (vira a variável {{5}} do template Meta).
    // Inclui o vencimento (DD/MM) porque contas recorrentes repetem a descrição —
    // sem a data, 3 parcelas do mesmo aluguel viram 3 itens idênticos e ilegíveis.
    const maiores = [...lista]
      .sort((a: any, b: any) => Number(b.valor || 0) - Number(a.valor || 0))
      .slice(0, MAIORES_QTD)
      .map((c: any) => {
        const venc = ymdToBr(String(c.vencimento ?? "")).slice(0, 5); // DD/MM
        return `${descricaoConta(c)} ${formatCurrency(c.valor)} (venc. ${venc})`;
      })
      .join(" · ");

    // Template editavel (tela Configuracao de Mensagens) — usado no texto livre / grupo.
    const templatePadrao =
      "📋 *Contas a pagar de hoje ({data})*\n\n{lista}\n\n💰 Total: {total} ({qtd} conta(s))";
    const template = (configMsg?.template_mensagem as string) || templatePadrao;

    let mensagem = template;
    mensagem = mensagem.replace(/{data}/g, ymdToBr(hoje));
    mensagem = mensagem.replace(/{lista}/g, blocoLista);
    mensagem = mensagem.replace(/{total}/g, formatCurrency(total));
    mensagem = mensagem.replace(/{qtd}/g, String(qtd));
    mensagem = mensagem.replace(/{qtd_hoje}/g, String(qtdHoje));
    mensagem = mensagem.replace(/{qtd_atrasadas}/g, String(qtdAtrasadas));
    mensagem = mensagem.replace(/{maiores}/g, maiores);

    // Parâmetros do template Meta, na ordem {{1}}..{{5}}
    const templateParams = [
      ymdToBr(hoje),
      String(qtdHoje),
      String(qtdAtrasadas),
      formatCurrency(total),
      maiores,
    ];

    const baseResultado = {
      data_hoje: hoje,
      qtd,
      qtd_hoje: qtdHoje,
      qtd_atrasadas: qtdAtrasadas,
      total,
      total_formatado: formatCurrency(total),
      maiores,
      grupo_id: grupoId || null,
      numeros,
      mensagem,
      template_meta: META_TEMPLATE_NOME,
      template_params: templateParams.map((p) => sanitizarVarTemplate(p)),
    };

    // Modo 2: pre-visualizar (nao envia)
    if (dryRun) {
      return new Response(JSON.stringify({ ...baseResultado, dry_run: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sem contas: por padrao nao envia (decisao do usuario em 2026-07-27)
    if (qtd === 0 && !enviarVazio) {
      return new Response(JSON.stringify({ ...baseResultado, enviado: false, motivo: "sem_contas" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!numeros.length && !grupoId) {
      return new Response(
        JSON.stringify({
          ...baseResultado,
          enviado: false,
          error:
            "Nenhum destino configurado. Defina o secret CONTAS_PAGAR_NUMEROS (número com DDD) ou envie numeros/grupo_id no body.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Modo 3: enviar de fato
    const envios: Array<Record<string, unknown>> = [];
    for (const numero of numeros) {
      envios.push(await enviarParaNumero(numero, templateParams, mensagem, { forcarTexto }));
    }
    if (grupoId) {
      envios.push(await enviarParaGrupo(grupoId, mensagem));
    }

    const enviado = envios.length > 0 && envios.every((e) => e.ok === true);
    const falhas = envios.filter((e) => e.ok !== true);
    const avisos = envios.map((e) => e.aviso).filter(Boolean) as string[];

    return new Response(
      JSON.stringify({
        ...baseResultado,
        enviado,
        envios,
        ...(avisos.length ? { aviso: avisos[0] } : {}),
        ...(falhas.length ? { error: String(falhas[0].erro ?? "Falha no envio") } : {}),
      }),
      { status: enviado ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro na edge function:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
