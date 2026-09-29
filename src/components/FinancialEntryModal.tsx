import React, { useState, useEffect } from 'react';
import { X, DollarSign, Building, Plus, Tag, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { NewCategoryModal } from './NewCategoryModal';
import { generateCompetenciaSequence } from '../utils/competencia';
import type { FinancialEntry, Client, FinancialCategory, FinancialEntryStatus } from '../types';

interface FinancialEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entryToEdit?: FinancialEntry | null;
  defaultCompetencia: string;
}

export const FinancialEntryModal: React.FC<FinancialEntryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  entryToEdit,
  defaultCompetencia,
}) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Recorrência / Lote
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringCount, setRecurringCount] = useState<number>(12); // Padrão: 12 meses (anual)

  // Tipo de seleção: vinculado a um cliente cadastrado ou nome avulso
  const [isAvulso, setIsAvulso] = useState<boolean>(() => {
    return Boolean(entryToEdit && !entryToEdit.client_id && entryToEdit.cliente_nome_avulso);
  });

  const [formData, setFormData] = useState({
    data_recebimento: entryToEdit?.data_recebimento || '',
    competencia: entryToEdit?.competencia || defaultCompetencia,
    client_id: entryToEdit?.client_id || '',
    cliente_nome_avulso: entryToEdit?.cliente_nome_avulso || '',
    conta_contabil: entryToEdit?.conta_contabil || 'Honorários',
    valor: entryToEdit ? String(entryToEdit.valor) : '',
    status: (entryToEdit?.status as FinancialEntryStatus) || 'À RECEBER',
    banco: entryToEdit?.banco || '',
    observacao: entryToEdit?.observacao || '',
  });

  // Busca lista de clientes e categorias contábeis dinâmicas
  const fetchAuxData = async () => {
    // Busca todos os clientes cadastrados para seleção
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, razao_social, status')
      .order('razao_social', { ascending: true });
    
    if (clientsData) {
      setClients(clientsData as Client[]);
    }

    const { data: catData } = await supabase
      .from('financial_categories')
      .select('*')
      .eq('tipo', 'entrada');

    let loadedCategories: FinancialCategory[] = [];

    if (catData && catData.length > 0) {
      loadedCategories = (catData as FinancialCategory[]).sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    } else {
      const fallbackCats: FinancialCategory[] = [
        { id: '1', nome: 'Honorários', tipo: 'entrada' },
        { id: '2', nome: '13º Honorários', tipo: 'entrada' },
        { id: '3', nome: 'Aberturas de empresa', tipo: 'entrada' },
        { id: '4', nome: 'Encerramento de empresa', tipo: 'entrada' },
        { id: '5', nome: 'Alterações Contratuais', tipo: 'entrada' },
        { id: '6', nome: 'Certificado Digital', tipo: 'entrada' },
        { id: '7', nome: 'Demais receitas', tipo: 'entrada' },
        { id: '8', nome: 'Devoluções', tipo: 'entrada' },
        { id: '9', nome: 'Empréstimos', tipo: 'entrada' },
      ];
      loadedCategories = fallbackCats.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    }

    setCategories(loadedCategories);
    if (!entryToEdit && !formData.conta_contabil && loadedCategories.length > 0) {
      setFormData((prev) => ({ ...prev, conta_contabil: loadedCategories[0].nome }));
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, []);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryCreated = (newCat: FinancialCategory) => {
    setCategories((prev) =>
      [...prev, newCat].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    );
    setFormData((prev) => ({ ...prev, conta_contabil: newCat.nome }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedValor = parseFloat(formData.valor.replace(',', '.'));
    if (isNaN(parsedValor) || parsedValor <= 0) {
      toast('Por favor, informe um valor válido maior que zero.', 'error');
      return;
    }

    if (!isAvulso && !formData.client_id) {
      toast('Selecione um cliente da base ou marque como Cliente Avulso.', 'error');
      return;
    }

    if (isAvulso && !formData.cliente_nome_avulso.trim()) {
      toast('Informe o nome do cliente avulso.', 'error');
      return;
    }

    // Validação de estado RECEBIDO quando individual
    if (!isRecurring && formData.status === 'RECEBIDO') {
      if (!formData.data_recebimento) {
        toast('Para o status RECEBIDO, a Data do Recebimento é obrigatória.', 'error');
        return;
      }
      if (!formData.banco) {
        toast('Para o status RECEBIDO, selecione o Banco de destino.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (entryToEdit) {
        // Atualização individual existente
        const payload = {
          data_recebimento: formData.status === 'RECEBIDO' ? formData.data_recebimento : (formData.data_recebimento || null),
          competencia: formData.competencia.trim(),
          client_id: isAvulso ? null : formData.client_id || null,
          cliente_nome_avulso: isAvulso ? formData.cliente_nome_avulso.trim() : null,
          conta_contabil: formData.conta_contabil.trim(),
          valor: parsedValor,
          status: formData.status,
          banco: formData.status === 'RECEBIDO' ? (formData.banco.trim() || null) : (formData.banco ? formData.banco.trim() : null),
          observacao: formData.observacao.trim() || null,
        };

        const { error } = await supabase
          .from('financial_entries')
          .update(payload)
          .eq('id', entryToEdit.id);
        if (error) throw error;
        toast('Entrada atualizada com sucesso!', 'success');
      } else if (isRecurring && recurringCount > 1) {
        // Lançamento em Lote / Recorrência de N competências
        const competencias = generateCompetenciaSequence(formData.competencia.trim(), recurringCount);
        const obsRecorrente = formData.observacao.trim() || null;

        const batchPayload = competencias.map((comp) => ({
          competencia: comp,
          client_id: isAvulso ? null : formData.client_id || null,
          cliente_nome_avulso: isAvulso ? formData.cliente_nome_avulso.trim() : null,
          conta_contabil: formData.conta_contabil.trim(),
          valor: parsedValor,
          status: 'À RECEBER',
          data_recebimento: null,
          banco: null,
          observacao: obsRecorrente,
        }));

        const { error } = await supabase.from('financial_entries').insert(batchPayload);
        if (error) throw error;

        toast(
          `Sucesso! ${recurringCount} competências geradas em lote (de ${competencias[0]} até ${competencias[competencias.length - 1]}).`,
          'success'
        );
      } else {
        // Inserção individual simples
        const payload = {
          data_recebimento: formData.status === 'RECEBIDO' ? formData.data_recebimento : (formData.data_recebimento || null),
          competencia: formData.competencia.trim(),
          client_id: isAvulso ? null : formData.client_id || null,
          cliente_nome_avulso: isAvulso ? formData.cliente_nome_avulso.trim() : null,
          conta_contabil: formData.conta_contabil.trim(),
          valor: parsedValor,
          status: formData.status,
          banco: formData.status === 'RECEBIDO' ? (formData.banco.trim() || null) : (formData.banco ? formData.banco.trim() : null),
          observacao: formData.observacao.trim() || null,
        };

        const { error } = await supabase.from('financial_entries').insert([payload]);
        if (error) throw error;
        toast('Entrada registrada com sucesso!', 'success');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Erro detalhado no Supabase ao salvar:', err);
      let errorMsg = 'Falha ao salvar recebimento.';
      if (err && typeof err === 'object') {
        const anyErr = err as { message?: string; details?: string; hint?: string };
        errorMsg = anyErr.message || anyErr.details || errorMsg;
        if (anyErr.hint) errorMsg += ` (${anyErr.hint})`;
      }
      toast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
          {/* Cabeçalho */}
          <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-[#1E2022] text-white">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">
                  {entryToEdit ? 'Editar Lançamento de Receita' : 'Nova Entrada / Projeção de Receita'}
                </h2>
                <p className="text-xs text-[#C5A059]">
                  Lançamento de Honorários, Serviços Contratuais e Projeções Futuras
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Status, Competência e Valor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Status da Entrada *
                </label>
                <select
                  disabled={isRecurring}
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-1 focus:ring-[#C5A059] ${
                    isRecurring
                      ? 'bg-rose-50 text-rose-700 border-rose-300 opacity-90'
                      : formData.status === 'À RECEBER'
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : formData.status === 'RECEBIDO'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}
                >
                  <option value="À RECEBER">À RECEBER (Projeção)</option>
                  <option value="RECEBIDO">RECEBIDO (Liquidado)</option>
                  <option value="PERMUTA">PERMUTA</option>
                  <option value="INDICAÇÃO">INDICAÇÃO</option>
                  <option value="PREJUÍZO">PREJUÍZO</option>
                  <option value="ISENTO">ISENTO</option>
                  <option value="PARCELADO">PARCELADO</option>
                  <option value="PROTESTADO">PROTESTADO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isRecurring ? 'Competência Inicial *' : 'Competência (ex: out/26) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="out/26"
                  name="competencia"
                  value={formData.competencia}
                  onChange={handleInputChange}
                  className="w-full text-xs font-mono font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Valor Unitário (R$) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0,00"
                    name="valor"
                    value={formData.valor}
                    onChange={handleInputChange}
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold font-mono border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                  />
                </div>
              </div>
            </div>

            {/* Alternador de Recorrência / Lote (Apenas ao criar novo) */}
            {!entryToEdit && (
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 text-xs font-bold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => {
                        setIsRecurring(e.target.checked);
                        if (e.target.checked) {
                          setFormData((prev) => ({ ...prev, status: 'À RECEBER' }));
                        }
                      }}
                      className="w-4 h-4 text-[#C5A059] rounded border-gray-300 focus:ring-[#C5A059]"
                    />
                    <Repeat className="w-4 h-4 text-[#C5A059]" />
                    <span>Repetir para próximas competências (Lançamento em Lote)</span>
                  </label>
                  {isRecurring && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#C5A059] text-white">
                      Recorrente
                    </span>
                  )}
                </div>

                {isRecurring && (
                  <div className="pt-2 border-t border-amber-200/60 animate-in fade-in">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Quantidade de Parcelas / Meses
                      </label>
                      <select
                        value={recurringCount}
                        onChange={(e) => setRecurringCount(Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                      >
                        <option value={3}>3 meses (Trimestral)</option>
                        <option value={6}>6 meses (Semestral)</option>
                        <option value={12}>12 meses (1 Ano / Anual)</option>
                        <option value={24}>24 meses (2 Anos)</option>
                      </select>
                      <p className="text-[10px] text-gray-500 mt-1.5">
                        Serão geradas {recurringCount} competências sequenciais com status <strong>À RECEBER</strong>.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seleção do Cliente */}
            <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1.5">
                  <Building className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Cliente Pagador *</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsAvulso(!isAvulso);
                    setFormData((prev) => ({
                      ...prev,
                      client_id: '',
                      cliente_nome_avulso: '',
                    }));
                  }}
                  className="text-[11px] font-medium text-[#C5A059] hover:underline"
                >
                  {isAvulso ? 'Selecionar cliente cadastrado' : 'Digitar cliente avulso'}
                </button>
              </div>

              {isAvulso ? (
                <input
                  type="text"
                  name="cliente_nome_avulso"
                  placeholder="Informe o nome ou razão do cliente avulso..."
                  value={formData.cliente_nome_avulso}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                />
              ) : (
                <select
                  name="client_id"
                  value={formData.client_id}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                >
                  <option value="">-- Selecione o cliente cadastrado --</option>
                  {clients.map((c) => {
                    const statusUpper = c.status?.trim().toUpperCase();
                    const isOther = statusUpper && statusUpper !== 'ATIVO';
                    return (
                      <option key={c.id} value={c.id}>
                        {c.razao_social} {isOther ? `(${c.status})` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Conta Contábil com Seletor Dinâmico */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
                  <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Conta Contábil (Categoria) *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#C5A059] hover:text-[#9E7B35] transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nova Categoria</span>
                </button>
              </div>

              <select
                name="conta_contabil"
                value={formData.conta_contabil}
                onChange={handleInputChange}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] bg-white font-medium"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.nome}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Data de Liquidação e Banco (Apenas se NÃO for lote e estiver em RECEBIDO) */}
            {!isRecurring && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/70 p-3.5 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
                    <span>Data do Recebimento</span>
                    {formData.status === 'RECEBIDO' && (
                      <span className="text-rose-600 font-bold">*</span>
                    )}
                    {formData.status !== 'RECEBIDO' && (
                      <span className="text-gray-400 font-normal text-[10px]">(Vazio se À Receber)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    name="data_recebimento"
                    value={formData.data_recebimento}
                    onChange={handleInputChange}
                    className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
                    <span>Banco de Destino</span>
                    {formData.status === 'RECEBIDO' && (
                      <span className="text-rose-600 font-bold">*</span>
                    )}
                    {formData.status !== 'RECEBIDO' && (
                      <span className="text-gray-400 font-normal text-[10px]">(Vazio se À Receber)</span>
                    )}
                  </label>
                  <select
                    name="banco"
                    value={formData.banco}
                    onChange={handleInputChange}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                  >
                    <option value="">-- Não definido --</option>
                    <option value="Itaú (c/c)">Itaú (c/c)</option>
                    <option value="Cora (c/c)">Cora (c/c)</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Observações (Opcional)
              </label>
              <textarea
                name="observacao"
                rows={2}
                placeholder="Detalhes ou anotações específicas deste lançamento..."
                value={formData.observacao}
                onChange={handleInputChange}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
              />
            </div>

            {/* Rodapé e Ações */}
            <div className="pt-3 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                {submitting
                  ? 'Processando...'
                  : entryToEdit
                  ? 'Atualizar Entrada'
                  : isRecurring
                  ? `Gerar ${recurringCount} Parcelas em Lote`
                  : 'Registrar Entrada'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal para Adição de Nova Categoria Contábil */}
      <NewCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onCreated={handleCategoryCreated}
        tipo="entrada"
      />
    </>
  );
};
