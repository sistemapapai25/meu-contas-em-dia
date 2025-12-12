-- Adiciona colunas categoria_id e beneficiario_id em movimentos_financeiros
-- e cria FKs vinculadas às tabelas categories e beneficiaries

ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS categoria_id uuid,
  ADD COLUMN IF NOT EXISTS beneficiario_id uuid;

ALTER TABLE public.movimentos_financeiros
  ADD CONSTRAINT movimentos_financeiros_categoria_id_fkey
    FOREIGN KEY (categoria_id)
    REFERENCES public.categories(id)
    ON DELETE RESTRICT;

ALTER TABLE public.movimentos_financeiros
  ADD CONSTRAINT movimentos_financeiros_beneficiario_id_fkey
    FOREIGN KEY (beneficiario_id)
    REFERENCES public.beneficiaries(id)
    ON DELETE RESTRICT;

-- Índices auxiliares para filtros por FK
CREATE INDEX IF NOT EXISTS idx_mov_fin_categoria_id ON public.movimentos_financeiros(categoria_id);
CREATE INDEX IF NOT EXISTS idx_mov_fin_beneficiario_id ON public.movimentos_financeiros(beneficiario_id);

