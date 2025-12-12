import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Filter, Rows, Square, Edit3, Search, X } from "lucide-react";
import { ymdToBr } from "@/utils/date";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import NovoBeneficiarioModal from "@/components/NovoBeneficiarioModal";

type Mov = {
  id: string;
  data: string;
  descricao: string | null;
  conta_id: string | null;
  conta_nome?: string | null;
  categoria_id?: string | null;
  beneficiario_id?: string | null;
  categoria_nome?: string | null;
  beneficiario_nome?: string | null;
  tipo: "ENTRADA" | "SAIDA";
  valor: number;
  origem?: "LANCAMENTO" | "CULTO" | "AJUSTE" | null;
};

export default function LancamentosDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dataRef, setDataRef] = useState(() => new Date());
  const [contas, setContas] = useState<{ id: string; nome: string; logo?: string | null; saldo_inicial?: number }[]>([]);
  const [contasSel, setContasSel] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [modoCard, setModoCard] = useState(false);
  const [rows, setRows] = useState<Mov[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editMov, setEditMov] = useState<Mov | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCategoriaId, setEditCategoriaId] = useState<string>("");
  const [editBenefId, setEditBenefId] = useState<string>("");
  const [catOpts, setCatOpts] = useState<{ id: string; name: string }[]>([]);
  const [benefOpts, setBenefOpts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [benefSearch, setBenefSearch] = useState("");
  const [showCatResults, setShowCatResults] = useState(false);
  const [showBenefResults, setShowBenefResults] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [benefLoading, setBenefLoading] = useState(false);
  const [addingBenef, setAddingBenef] = useState(false);
  const ano = dataRef.getFullYear();
  const mes = dataRef.getMonth();
  const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const inicio = toYmd(new Date(ano, mes, 1));
  const fim = toYmd(new Date(ano, mes + 1, 0));

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("contas_financeiras")
      .select("id,nome,logo,saldo_inicial")
      .order("nome")
      .then(({ data }) => {
        const arr = (data || []).map((c: { id: string; nome: string; logo?: string | null; saldo_inicial?: number }) => ({ id: c.id, nome: c.nome, logo: c.logo ?? null, saldo_inicial: Number(c.saldo_inicial || 0) }));
        setContas(arr);
      });
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) return;
    let q = supabase
      .from("movimentos_financeiros")
      .select("id, data, descricao, valor, tipo, origem, conta_id, categoria_id, beneficiario_id, contas:contas_financeiras(nome), categoria:categories(name), beneficiario:beneficiaries(name)")
      .eq("user_id", user.id)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data");
    if (contasSel.length > 0) {
      q = q.in("conta_id", contasSel);
    }
    q.then(({ data, error }) => {
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      const arr: Mov[] = (data || []).map((r: { id: string; data: string; descricao: string | null; valor: number; tipo: "ENTRADA"|"SAIDA"; origem?: string|null; conta_id?: string|null; categoria_id?: string|null; beneficiario_id?: string|null; contas?: { nome?: string|null } | null; categoria?: { name?: string|null } | null; beneficiario?: { name?: string|null } | null }) => ({
        id: r.id,
        data: r.data,
        descricao: r.descricao ?? null,
        conta_id: r.conta_id ?? null,
        conta_nome: r.contas?.nome ?? null,
        categoria_id: r.categoria_id ?? null,
        beneficiario_id: r.beneficiario_id ?? null,
        categoria_nome: r.categoria?.name ?? null,
        beneficiario_nome: r.beneficiario?.name ?? null,
        tipo: r.tipo,
        valor: r.valor,
        origem: (r.origem as Mov["origem"]) ?? null,
      }));
      setRows(arr);
    });
  }, [user, inicio, fim, contasSel]);

  useEffect(() => {
    if (!supabase || !user) return;
    const contasIds = contasSel.length ? contasSel : contas.map(c => c.id);
    const baseInicial = contas
      .filter(c => contasIds.includes(c.id))
      .reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);
    let q = supabase
      .from("movimentos_financeiros")
      .select("valor,tipo,conta_id")
      .eq("user_id", user.id)
      .lt("data", inicio);
    if (contasIds.length > 0) {
      q = q.in("conta_id", contasIds);
    }
    q.then(({ data, error }) => {
      if (error) return;
      const net = (data || []).reduce((s: number, r: { valor: number; tipo: "ENTRADA"|"SAIDA" }) => s + (r.tipo === "ENTRADA" ? Number(r.valor || 0) : -Number(r.valor || 0)), 0);
      setSaldoInicial(baseInicial + net);
    });
  }, [user, inicio, contasSel, contas]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  const saldoAtual = useMemo(() => {
    return rows.reduce((s, r) => s + (r.tipo === "ENTRADA" ? r.valor : -r.valor), 0);
  }, [rows]);

  const tituloMes = useMemo(() => {
    const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return `${nomes[mes]} de ${ano}`;
  }, [mes, ano]);

  const ultimoIdPorDia = useMemo(() => {
    const dmap = new Map<string, string>();
    const byDay = new Map<string, Mov[]>();
    rows.forEach(r => {
      const arr = byDay.get(r.data) || [];
      arr.push(r);
      byDay.set(r.data, arr);
    });
    byDay.forEach((arr, day) => {
      const last = arr[arr.length - 1];
      if (last) dmap.set(day, last.id);
    });
    return dmap;
  }, [rows]);

  const saldoFechamentoPorDia = useMemo(() => {
    const dias = Array.from(new Set(rows.map(r => r.data))).sort();
    let acc = saldoInicial;
    const m = new Map<string, number>();
    dias.forEach(day => {
      const net = rows.filter(r => r.data === day).reduce((s, r) => s + (r.tipo === "ENTRADA" ? r.valor : -r.valor), 0);
      acc = acc + net;
      m.set(day, acc);
    });
    return m;
  }, [rows, saldoInicial]);

  function abrirEdicao(m: Mov) {
    setEditMov(m);
    setEditDesc(m.descricao || "");
    setEditCategoriaId(m.categoria_id || "");
    setEditBenefId(m.beneficiario_id || "");
    setCatOpts([]);
    setBenefOpts([]);
    setCatSearch(m.categoria_nome || "");
    setBenefSearch(m.beneficiario_nome || "");
    setShowCatResults(false);
    setShowBenefResults(false);
    setEditOpen(true);
  }

  useEffect(() => {
    if (!editOpen || !editMov) return;
    const termo = catSearch.trim();
    if (termo.length < 3) { setCatOpts([]); return; }
    const tipoCat = editMov.tipo === "ENTRADA" ? "RECEITA" : "DESPESA";
    setCatLoading(true);
    supabase
      .from("categories")
      .select("id,name")
      .eq("tipo", tipoCat)
      .ilike("name", `%${termo}%`)
      .order("name")
      .limit(20)
      .then(({ data }) => {
        const arr = (data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
        setCatOpts(arr);
      })
      .finally(() => setCatLoading(false));
  }, [catSearch, editOpen, editMov]);

  useEffect(() => {
    if (!editOpen) return;
    const termo = benefSearch.trim();
    if (termo.length < 3) { setBenefOpts([]); return; }
    setBenefLoading(true);
    supabase
      .from("beneficiaries")
      .select("id,name")
      .ilike("name", `%${termo}%`)
      .order("name")
      .limit(20)
      .then(({ data }) => {
        const arr = (data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }));
        setBenefOpts(arr);
      })
      .finally(() => setBenefLoading(false));
  }, [benefSearch, editOpen]);

  function handleSelectCategoria(id: string, name: string) {
    setEditCategoriaId(id);
    setCatSearch(name);
    setShowCatResults(false);
  }

  function clearCategoriaSearch() {
    setCatSearch("");
    setEditCategoriaId("");
    setShowCatResults(false);
  }

  function handleSelectBenef(id: string, name: string) {
    setEditBenefId(id);
    setBenefSearch(name);
    setShowBenefResults(false);
  }

  function clearBenefSearch() {
    setBenefSearch("");
    setEditBenefId("");
    setShowBenefResults(false);
  }

  async function criarBeneficiarioInline() {
    if (!user) { toast({ title: "Sessão", description: "Faça login para criar beneficiário", variant: "destructive" }); return; }
    const nome = benefSearch.trim();
    if (nome.length < 3) { toast({ title: "Nome muito curto", description: "Digite pelo menos 3 caracteres" }); return; }
    try {
      setAddingBenef(true);
      const { data, error } = await supabase
        .from('beneficiaries')
        .insert({ user_id: user.id, name: nome })
        .select('id,name')
        .single();
      if (error) { throw error; }
      setBenefOpts(prev => [{ id: data.id, name: data.name }, ...prev]);
      setEditBenefId(data.id);
      setBenefSearch(data.name);
      setShowBenefResults(false);
      toast({ title: 'Beneficiário criado', description: data.name });
    } catch (err: any) {
      toast({ title: 'Erro ao criar beneficiário', description: String(err?.message || 'Falha ao criar'), variant: 'destructive' });
    } finally {
      setAddingBenef(false);
    }
  }

  async function salvarEdicao() {
    if (!editMov || !user) return;
    setSaving(true);
    try {
      const payload: Partial<{ descricao: string; categoria_id: string | null; beneficiario_id: string | null }> = {
        descricao: editDesc,
        categoria_id: editCategoriaId ? editCategoriaId : null,
        beneficiario_id: editBenefId ? editBenefId : null,
      };
      const { error } = await supabase
        .from("movimentos_financeiros")
        .update(payload)
        .eq("id", editMov.id)
        .eq("user_id", user.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      setRows(prev => prev.map(r => r.id === editMov.id ? {
        ...r,
        descricao: editDesc || null,
        categoria_id: payload.categoria_id || null,
        beneficiario_id: payload.beneficiario_id || null,
        categoria_nome: (catOpts.find(c => c.id === editCategoriaId)?.name) || null,
        beneficiario_nome: (benefOpts.find(b => b.id === editBenefId)?.name) || null,
      } : r));
      toast({ title: "Atualizado", description: "Movimento atualizado" });
      setEditOpen(false);
      setEditMov(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div />
          <div className="flex items-center gap-2">
            <Button variant={modoCard ? "secondary" : "ghost"} onClick={() => setModoCard(false)}><Rows className="w-4 h-4"/></Button>
            <Button variant={modoCard ? "ghost" : "secondary"} onClick={() => setModoCard(true)}><Square className="w-4 h-4"/></Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setDataRef(new Date(ano, mes - 1, 1))}><ChevronLeft className="w-4 h-4"/></Button>
            <div className="font-semibold w-40 text-center">{tituloMes}</div>
            <Button variant="ghost" onClick={() => setDataRef(new Date(ano, mes + 1, 1))}><ChevronRight className="w-4 h-4"/></Button>
          </div>
          <div className="flex-1"/>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input placeholder="Pesquisar" value={busca} onChange={e=>setBusca(e.target.value)} className="w-64"/>
            </div>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  {(() => {
                    const first = contasSel.length ? contas.find(c => c.id === contasSel[0]) : null;
                    return (
                      <div className="flex items-center gap-2">
                        {first?.logo ? (
                          <img src={first.logo} alt="Logo" className="h-5 w-5 object-contain" />
                        ) : null}
                        <span>{first?.nome || 'Todas Contas e Cartões'}</span>
                      </div>
                    );
                  })()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[260px]">
                <DropdownMenuItem onSelect={(e)=>{e.preventDefault(); setContasSel([]); setMenuOpen(false);}}>
                  <div className="flex items-center gap-2">
                    <span>Todas Contas e Cartões</span>
                  </div>
                </DropdownMenuItem>
                {contas.map(c => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={(e)=>{ e.preventDefault(); setContasSel([c.id]); setMenuOpen(false); }}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {c.logo ? (
                        <img src={c.logo} alt="Logo" className="h-5 w-5 object-contain" />
                      ) : null}
                      <span>{c.nome}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Saldo atual no período</div>
              <div className={`text-xl font-semibold ${saldoAtual>=0? 'text-emerald-600':'text-red-600'}`}>{formatCurrency(saldoAtual)}</div>
            </CardContent>
          </Card>
        </div>

        {!modoCard ? (
          <div className="overflow-auto rounded border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-left">Categoria</th>
                  <th className="p-2 text-left">Beneficiário</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-right">Saldo</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(r=>{
                  const termo = busca.trim().toLowerCase();
                  if (!termo) return true;
                  const desc = (r.descricao||'').toLowerCase();
                  const dataFmt = ymdToBr(r.data).toLowerCase();
                  const valorFmt = formatCurrency(r.valor).toLowerCase();
                  return desc.includes(termo) || dataFmt.includes(termo) || valorFmt.includes(termo);
                }).map(r => {
                  const isLast = ultimoIdPorDia.get(r.data) === r.id;
                  const sd = saldoFechamentoPorDia.get(r.data) || 0;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{ymdToBr(r.data)}</td>
                      <td className="p-2">{r.descricao}</td>
                      <td className="p-2">{r.categoria_nome || ''}</td>
                      <td className="p-2">{r.beneficiario_nome || ''}</td>
                      <td className="p-2 text-right"><span className={r.tipo==='ENTRADA'?'text-emerald-600':'text-red-600'}>{formatCurrency(r.valor)}</span></td>
                      <td className={`p-2 text-right ${isLast ? (sd>=0? 'text-emerald-600':'text-red-600') : ''}`}>{isLast ? formatCurrency(sd) : ''}</td>
                      <td className="p-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => abrirEdicao(r)}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length===0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum Lançamento</td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(r => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{ymdToBr(r.data)}</div>
                  <div className="font-medium">{r.descricao}</div>
                  <div className="text-sm">{r.conta_nome||''}</div>
                  <div className="text-xs text-muted-foreground">{r.categoria_nome || ''}</div>
                  <div className="text-xs text-muted-foreground">{r.beneficiario_nome || ''}</div>
                  <div className={`mt-2 text-lg font-semibold ${r.tipo==='ENTRADA'?'text-emerald-600':'text-red-600'}`}>{formatCurrency(r.valor)}</div>
                  <div className="text-xs text-muted-foreground">{r.tipo}</div>
                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={() => abrirEdicao(r)}>
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {rows.length===0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum Lançamento</CardContent></Card>
            )}
          </div>
        )}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Movimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição</Label>
              <Input value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Descrição" />
            </div>
            <div className="relative">
              <Label>Categoria</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Digite para buscar categoria..."
                  value={catSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCatSearch(value);
                    setShowCatResults(value.length > 0);
                    if (value === "") {
                      setEditCategoriaId("");
                    }
                  }}
                  onFocus={() => { if (catSearch.length > 0) setShowCatResults(true); }}
                  onBlur={() => { setTimeout(() => setShowCatResults(false), 150); }}
                  className="pl-10 pr-10"
                />
                {catSearch && (
                  <button type="button" onClick={clearCategoriaSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showCatResults && catSearch && (
                <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto border rounded-md bg-background shadow-lg">
                  {catLoading ? (
                    <div className="p-3 text-muted-foreground text-center">Carregando...</div>
                  ) : catOpts.length > 0 ? (
                    catOpts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-left p-3 hover:bg-muted/50 border-b border-border/30 transition-colors ${ editCategoriaId === c.id ? "bg-primary/10" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); handleSelectCategoria(c.id, c.name); }}
                      >
                        {c.name}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-muted-foreground text-center">Nenhuma categoria encontrada</div>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <Label>Beneficiário</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Digite para buscar beneficiário..."
                  value={benefSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBenefSearch(value);
                    setShowBenefResults(value.length > 0);
                    if (value === "") {
                      setEditBenefId("");
                    }
                  }}
                  onFocus={() => { if (benefSearch.length > 0) setShowBenefResults(true); }}
                  onBlur={() => { setTimeout(() => setShowBenefResults(false), 150); }}
                  className="pl-10 pr-10"
                />
                {benefSearch && (
                  <button type="button" onClick={clearBenefSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showBenefResults && benefSearch && (
                <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto border rounded-md bg-background shadow-lg">
                  {benefLoading ? (
                    <div className="p-3 text-muted-foreground text-center">Carregando...</div>
                  ) : benefOpts.length > 0 ? (
                    benefOpts.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`w-full text-left p-3 hover:bg-muted/50 border-b border-border/30 transition-colors ${ editBenefId === b.id ? "bg-primary/10" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); handleSelectBenef(b.id, b.name); }}
                      >
                        {b.name}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-muted-foreground text-center space-y-2">
                      <div>Nenhum beneficiário encontrado</div>
                      <Button size="sm" variant="outline" onMouseDown={(e)=>{ e.preventDefault(); criarBeneficiarioInline(); }} disabled={addingBenef}>
                        {addingBenef ? 'Criando...' : 'Adicionar beneficiário'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={()=>setEditOpen(false)}>Cancelar</Button>
                <Button onClick={salvarEdicao} disabled={saving}>{saving? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
