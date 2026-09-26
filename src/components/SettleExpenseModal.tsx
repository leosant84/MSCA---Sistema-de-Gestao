import React, { useState } from 'react';
import { X, CheckCircle2, Calendar, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { EXPENSE_PAYMENT_METHODS } from '../constants/expenseCategories';
import type { FinancialExpense } from '../types';

interface SettleExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expense: FinancialExpense | null;
}

export const SettleExpenseModal: React.FC<SettleExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  expense,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(
    expense?.data_pagamento_previsao || new Date().toISOString().split('T')[0]
  );
  const [banco, setBanco] = useState(
    expense?.banco && (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(expense.banco)
      ? expense.banco
      : EXPENSE_PAYMENT_METHODS[0]
  );

  if (!isOpen || !expense) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataPagamento) {
      toast('Informe a data de liquidação do pagamento.', 'error');
      return;
    }
    if (!banco) {
      toast('Selecione a forma de pagamento / banco.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('financial_expenses')
        .update({
          status: 'Pago',
          data_pagamento_previsao: dataPagamento,
          banco: banco,
        })
        .eq('id', expense.id);

      if (error) throw error;

      toast('Saída baixada como PAGO com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao liquidar saída';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 bg-[#1E2022] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">Dar Baixa na Saída</h3>
              <p className="text-[10px] text-gray-400">Transição para status PAGO</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl">
            <div className="text-xs text-gray-600">
              Descrição: <strong className="text-gray-900">{expense.descricao_pagamento}</strong>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              Conta: <strong className="text-gray-900">{expense.conta_contabil}</strong>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              Competência: <strong className="text-gray-900">{expense.competencia}</strong> • Valor:{' '}
              <strong className="text-rose-700 font-mono">{formatCurrency(expense.valor)}</strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Data do Pagamento *</span>
            </label>
            <input
              type="date"
              required
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
              <Landmark className="w-3.5 h-3.5 text-gray-400" />
              <span>Forma de Pagamento / Banco *</span>
            </label>
            <select
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] bg-white text-gray-800"
            >
              {EXPENSE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Confirmar Baixa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
