import React, { useState } from 'react';
import { X, ArrowDownRight, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { generateCompetenciaSequence } from '../utils/competencia';
import { logAuditEvent } from '../services/auditService';
import {
  EXPENSE_CATEGORIES_DATA,
  EXPENSE_PAYMENT_METHODS,
} from '../constants/expenseCategories';
import type { FinancialExpense, FinancialExpenseStatus } from '../types';

interface FinancialExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expenseToEdit?: FinancialExpense | null;
  defaultCompetencia: string;
}

export const FinancialExpenseModal: React.FC<FinancialExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  expenseToEdit,
  defaultCompetencia,
}) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Recorrência / Lote
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringCount, setRecurringCount] = useState<number>(12); // Padrão 12 meses
  const [useParcelSuffix, setUseParcelSuffix] = useState<boolean>(true); // Ex: "Parcela 01 de 12"

  // Pega a primeira conta padrão em ordem alfabética
  const defaultConta =
    EXPENSE_CATEGORIES_DATA[0]?.contas[0] || 'Aluguel';

  const [formData, setFormData] = useState({
    data_pagamento_previsao:
      expenseToEdit?.data_pagamento_previsao || new Date().toISOString().split('T')[0],
    competencia: expenseToEdit?.competencia || defaultCompetencia,
    descricao_pagamento: expenseToEdit?.descricao_pagamento || '',
    observacao: expenseToEdit?.observacao || '',
    conta_contabil: expenseToEdit?.conta_contabil || defaultConta,
    valor: expenseToEdit ? String(expenseToEdit.valor) : '',
    status: (expenseToEdit?.status as FinancialExpenseStatus) || 'A pagar',
    banco: expenseToEdit?.banco || EXPENSE_PAYMENT_METHODS[0],
  });

  if (!isOpen) return null;

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedValor = parseFloat(formData.valor.replace(',', '.'));
    if (isNaN(parsedValor) || parsedValor <= 0) {
      toast('Por favor, informe um valor válido maior que zero.', 'error');
      return;
    }

    if (!formData.descricao_pagamento.trim()) {
      toast('Informe a descrição do pagamento.', 'error');
      return;
    }

    if (!formData.conta_contabil) {
      toast('Selecione uma conta contábil.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (expenseToEdit) {
        // Atualização individual
        const payload = {
          data_pagamento_previsao: formData.data_pagamento_previsao,
          competencia: formData.competencia.trim(),
          descricao_pagamento: formData.descricao_pagamento.trim(),
          observacao: formData.observacao.trim() || null,
          conta_contabil: formData.conta_contabil.trim(),
          valor: parsedValor,
          status: formData.status,
          banco: formData.banco.trim(),
        };

        const { error } = await supabase
          .from('financial_expenses')
          .update(payload)
          .eq('id', expenseToEdit.id);
        if (error) throw error;
        toast('Saída atualizada com sucesso!', 'success');
      } else if (isRecurring && recurringCount > 1) {
        // Lançamento em Lote / Recorrência de N competências para Saídas
        const competencias = generateCompetenciaSequence(formData.competencia.trim(), recurringCount);
        const baseDesc = formData.descricao_pagamento.trim();
        const baseDay = formData.data_pagamento_previsao
          ? formData.data_pagamento_previsao.split('-')[2]
          : '10';

        const batchPayload = competencias.map((comp, idx) => {
          const parcelNumber = String(idx + 1).padStart(2, '0');
          const totalParcels = String(recurringCount).padStart(2, '0');
          const finalDesc = useParcelSuffix
            ? `${baseDesc} - Parc. ${parcelNumber}/${totalParcels}`
            : baseDesc;

          // Projeta a data de previsão mantendo o mesmo dia do mês inicial
          let projectedDate = formData.data_pagamento_previsao;
          try {
            const initialDate = new Date(formData.data_pagamento_previsao);
            initialDate.setMonth(initialDate.getMonth() + idx);
            projectedDate = initialDate.toISOString().split('T')[0];
          } catch {
            projectedDate = formData.data_pagamento_previsao;
          }

          return {
            competencia: comp,
            data_pagamento_previsao: projectedDate,
            descricao_pagamento: finalDesc,
            observacao: formData.observacao.trim()
              ? `${formData.observacao.trim()} (Parcela ${parcelNumber}/${totalParcels})`
              : `Vencimento previsto dia ${baseDay}`,
            conta_contabil: formData.conta_contabil.trim(),
            valor: parsedValor,
            status: formData.status || 'A pagar',
            banco: formData.banco.trim(),
          };
        });

        const { error } = await supabase.from('financial_expenses').insert(batchPayload);
        if (error) throw error;

        // Registra um único log consolidado para todo o lote
        await logAuditEvent({
          action: 'BATCH_INSERT',
          entity: 'FINANCIAL_EXPENSE',
          entityName: `${baseDesc} (${recurringCount} parcelas)`,
          changes: {
            descricao: { new: baseDesc },
            parcelas: { new: `${recurringCount} meses (${competencias[0]} a ${competencias[competencias.length - 1]})` },
            valor_parcela: { new: parsedValor },
            valor_total_lote: { new: parsedValor * recurringCount },
            conta_contabil: { new: formData.conta_contabil.trim() },
            forma_pagamento: { new: formData.banco.trim() },
            status: { new: formData.status || 'A pagar' },
          },
        });

        toast(
          `Sucesso! ${recurringCount} parcelas de saída geradas em lote (de ${competencias[0]} até ${competencias[competencias.length - 1]}).`,
          'success'
        );
      } else {
        // Inserção individual simples
        const payload = {
          data_pagamento_previsao: formData.data_pagamento_previsao,
          competencia: formData.competencia.trim(),
          descricao_pagamento: formData.descricao_pagamento.trim(),
          observacao: formData.observacao.trim() || null,
          conta_contabil: formData.conta_contabil.trim(),
          valor: parsedValor,
          status: formData.status,
          banco: formData.banco.trim(),
        };

        const { error } = await supabase.from('financial_expenses').insert([payload]);
        if (error) throw error;
        toast('Saída registrada com sucesso!', 'success');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Erro ao salvar despesa/saída:', err);
      let errorMsg = 'Falha ao salvar despesa.';
      if (err && typeof err === 'object') {
        const anyErr = err as { message?: string; details?: string };
        errorMsg = anyErr.message || anyErr.details || errorMsg;
      }
      toast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-[#1E2022] text-white">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center text-white">
              <ArrowDownRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {expenseToEdit ? 'Editar Saída' : 'Nova Saída (Pagamento / Despesa)'}
              </h2>
              <p className="text-xs text-[#C5A059]">
                Módulo Financeiro • Registro de Contas a Pagar, Contratos e Despesas Fixas
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Status da Saída *
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-1 focus:ring-[#C5A059] ${
                  formData.status === 'Pago' || formData.status === 'Descontado'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : formData.status === 'A pagar'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-gray-100 text-gray-700 border-gray-300'
                }`}
              >
                <option value="A pagar">A pagar</option>
                <option value="Pago">Pago</option>
                <option value="Descontado">Descontado</option>
                <option value="Permuta">Permuta</option>
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
                Data Inicial / Vencimento *
              </label>
              <input
                type="date"
                required
                name="data_pagamento_previsao"
                value={formData.data_pagamento_previsao}
                onChange={handleInputChange}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
              />
            </div>
          </div>

          {/* Alternador de Recorrência / Lote (Apenas ao criar nova saída) */}
          {!expenseToEdit && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => {
                      setIsRecurring(e.target.checked);
                      if (e.target.checked) {
                        setFormData((prev) => ({ ...prev, status: 'A pagar' }));
                      }
                    }}
                    className="w-4 h-4 text-[#C5A059] rounded border-gray-300 focus:ring-[#C5A059]"
                  />
                  <Repeat className="w-4 h-4 text-[#C5A059]" />
                  <span>Repetir para próximas competências (Despesas / Parcelamentos)</span>
                </label>
                {isRecurring && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#C5A059] text-white">
                    Lote Ativo
                  </span>
                )}
              </div>

              {isRecurring && (
                <div className="pt-2 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Quantidade de Parcelas / Meses
                    </label>
                    <select
                      value={recurringCount}
                      onChange={(e) => setRecurringCount(Number(e.target.value))}
                      className="w-full text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
                    >
                      <option value={2}>2 parcelas</option>
                      <option value={3}>3 parcelas (Trimestral)</option>
                      <option value={6}>6 parcelas (Semestral)</option>
                      <option value={10}>10 parcelas</option>
                      <option value={12}>12 parcelas (1 Ano)</option>
                      <option value={24}>24 parcelas (2 Anos)</option>
                      <option value={36}>36 parcelas (3 Anos)</option>
                    </select>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Serão geradas <strong>{recurringCount} parcelas sequenciais</strong> com status <strong>A pagar</strong>.
                    </p>
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        checked={useParcelSuffix}
                        onChange={(e) => setUseParcelSuffix(e.target.checked)}
                        className="w-4 h-4 text-[#C5A059] rounded border-gray-300 focus:ring-[#C5A059]"
                      />
                      <span>
                        Adicionar sufixo (ex: <code>- Parc. 01/12</code>)
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Descrição do Pagamento *
            </label>
            <input
              type="text"
              required
              name="descricao_pagamento"
              placeholder="Ex: Aluguel da sede, Folha de pagamento, Software Domínio, Empréstimo Giro..."
              value={formData.descricao_pagamento}
              onChange={handleInputChange}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Forma de Pagamento *
              </label>
              <select
                name="banco"
                value={formData.banco}
                onChange={handleInputChange}
                className="w-full text-xs font-medium px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] bg-white"
              >
                {EXPENSE_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Conta Contábil (Categorias) *
              </label>
              <select
                required
                name="conta_contabil"
                value={formData.conta_contabil}
                onChange={handleInputChange}
                className="w-full text-xs font-medium px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] bg-white"
              >
                <option value="">-- Selecione a Conta Contábil --</option>
                {EXPENSE_CATEGORIES_DATA.map((group) => (
                  <optgroup key={group.grupo} label={group.grupo}>
                    {group.contas.map((conta) => (
                      <option key={conta} value={conta}>
                        {conta}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {/* Fallback caso a saída tenha uma conta antiga personalizada */}
                {formData.conta_contabil &&
                  !EXPENSE_CATEGORIES_DATA.some((g) => g.contas.includes(formData.conta_contabil)) && (
                    <optgroup label="OUTRA / PERSONALIZADA">
                      <option value={formData.conta_contabil}>{formData.conta_contabil}</option>
                    </optgroup>
                  )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              OBS. (Opcional)
            </label>
            <textarea
              name="observacao"
              rows={2}
              placeholder="Observações complementares, número do contrato ou chave PIX..."
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
              className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {submitting
                ? 'Processando...'
                : expenseToEdit
                ? 'Atualizar Saída'
                : isRecurring
                ? `Gerar ${recurringCount} Parcelas em Lote`
                : 'Registrar Saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
