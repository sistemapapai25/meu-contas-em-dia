import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NovaCategoriaModal from '@/components/NovaCategoriaModal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tag, Edit2, Trash2, Search, Plus, GripVertical, MoreVertical, FolderOpen, Printer, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface Categoria {
  id: string;
  name: string;
  tipo: 'DESPESA' | 'RECEITA';
  created_at: string;
  parent_id?: string | null;
  ordem?: number;
}
interface LancResumoRow {
  id: string;
  tipo: 'DESPESA' | 'RECEITA';
  valor: number;
  valor_pago?: number | null;
  vencimento: string;
  data_pagamento?: string | null;
  descricao?: string | null;
}

const CadastroCategorias = () => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<'ALL' | 'DESPESA' | 'RECEITA'>('ALL');
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    tipo: 'DESPESA' as 'DESPESA' | 'RECEITA'
  });
  const [chipFiltro, setChipFiltro] = useState('todas');
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [categoriaSel, setCategoriaSel] = useState<Categoria | null>(null);
  const [chartData, setChartData] = useState<{ mes: string; receita: number; despesa: number }[]>([]);
  const [resumo, setResumo] = useState<{ receita: number; despesa: number; total: number }>({ receita: 0, despesa: 0, total: 0 });
  const [transacoes, setTransacoes] = useState<{ id: string; data: string; descricao: string | null; valor: number }[]>([]);

  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadCategorias();
    }
  }, [user]);

  const loadCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,tipo,created_at,parent_id,ordem')
        .eq('user_id', user?.id)
        .order('tipo')
        .order('ordem', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setCategorias(data || []);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar categorias",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalhe = async (cat: Categoria) => {
    setCategoriaSel(cat);
    setDetalheOpen(true);
    await carregarDetalhes(cat);
  };

  const carregarDetalhes = async (cat: Categoria) => {
    try {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const inicioStr = toYMD(inicio);
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, tipo, valor, valor_pago, vencimento, data_pagamento, descricao')
        .eq('user_id', user?.id)
        .eq('categoria_id', cat.id)
        .gte('vencimento', inicioStr);
      if (error) throw error;
      const mapMes: Record<string, { receita: number; despesa: number }> = {};
      const recentes: { id: string; data: string; descricao: string | null; valor: number }[] = [];
      (data as LancResumoRow[] || []).forEach((r) => {
        const dStr = r.data_pagamento || r.vencimento;
        const d = new Date(dStr);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const val = Number(r.valor_pago ?? r.valor ?? 0);
        if (!mapMes[key]) mapMes[key] = { receita: 0, despesa: 0 };
        if (r.tipo === 'RECEITA') mapMes[key].receita += val; else mapMes[key].despesa += val;
        recentes.push({ id: r.id, data: dStr, descricao: r.descricao, valor: val });
      });
      const serie: { mes: string; receita: number; despesa: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const lbl = d.toLocaleDateString('pt-BR', { month: 'short' });
        const agg = mapMes[key] || { receita: 0, despesa: 0 };
        serie.push({ mes: lbl, receita: agg.receita, despesa: agg.despesa });
      }
      setChartData(serie);
      const totRec = serie.reduce((s, m) => s + m.receita, 0);
      const totDes = serie.reduce((s, m) => s + m.despesa, 0);
      setResumo({ receita: totRec, despesa: totDes, total: totRec - totDes });
      recentes.sort((a, b) => (a.data < b.data ? 1 : -1));
      setTransacoes(recentes.slice(0, 20));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      if (editingCategoria) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: formData.name.trim(),
            tipo: formData.tipo
          })
          .eq('id', editingCategoria.id);

        if (error) throw error;
        
        toast({
          title: "Sucesso",
          description: "Categoria atualizada com sucesso!",
        });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({
            user_id: user?.id,
            name: formData.name.trim(),
            tipo: formData.tipo
          });

        if (error) throw error;
        
        toast({
          title: "Sucesso",
          description: "Categoria criada com sucesso!",
        });
      }

      resetForm();
      loadCategorias();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar categoria",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (categoria: Categoria) => {
    setEditingCategoria(categoria);
    setFormData({
      name: categoria.name,
      tipo: categoria.tipo
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Sucesso",
        description: "Categoria excluída com sucesso!",
      });
      
      loadCategorias();
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir categoria",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', tipo: 'DESPESA' });
    setEditingCategoria(null);
    setIsDialogOpen(false);
  };

  const filteredCategorias = categorias.filter(categoria => {
    const matchesSearch = categoria.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterTipo === 'ALL' || categoria.tipo === filterTipo;
    const chipOk = chipFiltro === 'todas' || categoria.name.toLowerCase().includes(chipFiltro.toLowerCase());
    return matchesSearch && matchesFilter && chipOk;
  });

  const baseCats = categorias.filter(c => filterTipo === 'ALL' || c.tipo === filterTipo);
  const countTodas = baseCats.length;
  const countPrebenda = baseCats.filter(c => c.name.toLowerCase().includes('prebenda')).length;
  const countAdministrativo = baseCats.filter(c => c.name.toLowerCase().includes('administrativo')).length;
  const countEntradasBanco = baseCats.filter(c => c.name.toLowerCase().includes('entradas banco')).length;

  type CatNode = Categoria & { children: CatNode[] };
  const buildTree = (list: Categoria[], tipo: 'DESPESA'|'RECEITA'): CatNode[] => {
    const items = list.filter(c => c.tipo === tipo);
    const map = new Map<string, CatNode>();
    items.forEach(c => map.set(c.id, { ...c, children: [] }));
    const roots: CatNode[] = [];
    items.forEach(c => {
      const node = map.get(c.id)!;
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortNodes = (nodes: CatNode[]) => {
      nodes.sort((a,b)=> (a.ordem??0)-(b.ordem??0) || a.name.localeCompare(b.name));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);
    return roots;
  };
  const treeReceitas = buildTree(filteredCategorias, 'RECEITA');
  const treeDespesas = buildTree(filteredCategorias, 'DESPESA');

  const findSiblings = (cat: Categoria) => filteredCategorias.filter(c => c.tipo===cat.tipo && (c.parent_id??null)===(cat.parent_id??null)).sort((a,b)=> (a.ordem??0)-(b.ordem??0) || a.name.localeCompare(b.name));

  const moverAcima = async (cat: Categoria) => {
    const siblings = findSiblings(cat);
    const idx = siblings.findIndex(s => s.id===cat.id);
    if (idx<=0) return;
    const prev = siblings[idx-1];
    const a = cat.ordem ?? idx;
    const b = prev.ordem ?? (idx-1);
    await supabase.from('categories').update({ ordem: b }).eq('id', cat.id);
    await supabase.from('categories').update({ ordem: a }).eq('id', prev.id);
    loadCategorias();
  };
  const moverAbaixo = async (cat: Categoria) => {
    const siblings = findSiblings(cat);
    const idx = siblings.findIndex(s => s.id===cat.id);
    if (idx<0 || idx>=siblings.length-1) return;
    const next = siblings[idx+1];
    const a = cat.ordem ?? idx;
    const b = next.ordem ?? (idx+1);
    await supabase.from('categories').update({ ordem: b }).eq('id', cat.id);
    await supabase.from('categories').update({ ordem: a }).eq('id', next.id);
    loadCategorias();
  };

  const renderNode = (n: CatNode, depth: number) => (
    <div key={n.id} className="px-4 py-2 hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-3 flex-1 text-left" onClick={() => abrirDetalhe(n)}>
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <FolderOpen className={`w-4 h-4 ${n.tipo==='RECEITA'?'text-emerald-700':'text-red-600'}`} />
          <span style={{ paddingLeft: depth*16 }} className="font-medium">{n.name}</span>
        </button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => moverAcima(n)} aria-label="Mover acima"><ChevronUp className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => moverAbaixo(n)} aria-label="Mover abaixo"><ChevronDown className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => handleEdit(n)}><Edit2 className="w-3 h-3" /></Button>
          <Button size="sm" variant="destructive" onClick={() => handleDelete(n.id, n.name)}><Trash2 className="w-3 h-3" /></Button>
          <Button size="sm" variant="ghost"><MoreVertical className="w-4 h-4" /></Button>
        </div>
      </div>
      {n.children.length>0 && n.children.map(child => renderNode(child, depth+1))}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b">
        <div className="container mx-auto px-4 py-2 text-sm text-muted-foreground">
          <span>Contas Financeiras</span> <span className="mx-1">&gt;</span> <span className="font-semibold text-foreground">Categorias</span> <span className="mx-1">&gt;</span> <span>Clientes e Fornecedores</span> <span className="mx-1">&gt;</span> <span>Tags</span>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-emerald-700">Categorias</h1>
          <div className="flex items-center gap-2">
            <NovaCategoriaModal trigger={<Button className="bg-emerald-700 hover:bg-emerald-800"><Plus className="w-4 h-4 mr-2" />Adicionar</Button>} onSuccess={() => loadCategorias()} />
            <Button variant="outline">Organizar</Button>
            <Button variant="outline"><Printer className="w-4 h-4" /></Button>
            <Button variant="outline"><Download className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input placeholder="Buscar categorias" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterTipo} onValueChange={(value: 'ALL' | 'DESPESA' | 'RECEITA') => setFilterTipo(value)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="DESPESA">Despesas</SelectItem>
              <SelectItem value="RECEITA">Receitas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mb-4 overflow-x-auto">
          <Tabs value={chipFiltro} onValueChange={setChipFiltro} className="min-w-max">
            <TabsList className="flex gap-1">
              <TabsTrigger value="todas">{`Todas ${countTodas}`}</TabsTrigger>
              <TabsTrigger value="prebenda">{`Prebenda ${countPrebenda}`}</TabsTrigger>
              <TabsTrigger value="administrativo">{`Administrativo ${countAdministrativo}`}</TabsTrigger>
              <TabsTrigger value="entradas banco">{`Entradas Banco ${countEntradasBanco}`}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {loading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : filteredCategorias.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Tag className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <div className="text-lg font-semibold mb-2">Nenhuma categoria encontrada</div>
              <div className="text-muted-foreground mb-4">Ajuste a busca ou filtros</div>
              <NovaCategoriaModal trigger={<Button className="bg-emerald-700 hover:bg-emerald-800"><Plus className="w-4 h-4 mr-2" />Nova Categoria</Button>} onSuccess={() => loadCategorias()} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                <div className="bg-muted/40 px-4 py-2 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-emerald-700" />
                  <span className="font-medium">Receitas</span>
                </div>
                {treeReceitas.map(root => renderNode(root, 0))}
                <div className="bg-muted/40 px-4 py-2 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-red-600" />
                  <span className="font-medium">Despesas</span>
                </div>
                {treeDespesas.map(root => renderNode(root, 0))}
              </div>
            </CardContent>
          </Card>
        )}

        <Sheet open={detalheOpen} onOpenChange={setDetalheOpen}>
          <SheetContent side="right" className="sm:max-w-xl w-full">
            <SheetHeader>
              <SheetTitle>{categoriaSel?.name}</SheetTitle>
            </SheetHeader>
            <div className="text-sm text-muted-foreground mb-4">ID: {categoriaSel?.id}</div>
            <Tabs defaultValue="resumo">
              <TabsList className="mb-2">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Receitas</div><div className="text-lg font-semibold text-emerald-700">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumo.receita)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Despesas</div><div className="text-lg font-semibold text-red-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumo.despesa)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-lg font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumo.total)}</div></CardContent></Card>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="receita" fill="#2E7D32" name="Receitas" />
                      <Bar dataKey="despesa" fill="#dc2626" name="Despesas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
              <TabsContent value="lancamentos">
                <div className="divide-y border rounded">
                  {transacoes.length === 0 && (
                    <div className="p-4 text-muted-foreground">Sem lançamentos recentes</div>
                  )}
                  {transacoes.map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between">
                      <div className="text-sm">{new Date(t.data).toLocaleDateString('pt-BR')}</div>
                      <div className="flex-1 px-3 text-sm">{t.descricao}</div>
                      <div className="text-sm font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}</div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[400px] mx-4">
            <DialogHeader>
              <DialogTitle>{editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nome da categoria" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select value={formData.tipo} onValueChange={(value: 'DESPESA' | 'RECEITA') => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DESPESA">Despesa</SelectItem>
                    <SelectItem value="RECEITA">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CadastroCategorias;
