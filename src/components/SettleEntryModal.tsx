import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import type { FinancialEntry } from '../types';

interface SettleEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entry: FinancialEntry | null;
}

export const SettleEntryModal: React.FC<SettleEntryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  entry,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataRecebimento, setDataRecebimento] = useState(
    entry?.data_recebimento || new Date().toISOString().split('T')[0]
  );
  const [banco, setBanco] = useState(() => {
    const raw = entry?.banco || '';
    if (raw.toLowerCase().includes('cora')) return 'Cora (c/c)';
    return 'Itaú (c/c)';
  });

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataRecebimento) {
      toast('Informe a data de liquidação do recebimento.', 'error');
      return;
    }
    if (!banco) {
      toast('Selecione o banco de destino.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('financial_entries')
        .update({
          status: 'RECEBIDO',
          data_recebimento: dataRecebimento,
          banco: banco,
        })
        .eq('id', entry.id);

      if (error) throw error;

      toast('Entrada liquidada como RECEBIDO com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao liquidar recebimento';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const clientName = entry.client?.razao_social || entry.cliente_nome_avulso || 'Cliente';
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 bg-[#1E2022] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">Liquidar Recebimento</h3>
              <p className="text-[10px] text-gray-400">Transição para status RECEBIDO</p>
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
              Cliente: <strong className="text-gray-900">{clientName}</strong>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              Competência: <strong className="text-gray-900">{entry.competencia}</strong> • Valor:{' '}
              <strong className="text-emerald-700 font-mono">{formatCurrency(entry.valor)}</strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Data do Recebimento *
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Banco de Destino *
            </label>
            <select
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] bg-white text-gray-800"
            >
              <option value="Itaú (c/c)">Itaú (c/c)</option>
              <option value="Cora (c/c)">Cora (c/c)</option>
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
              {loading ? 'Salvando...' : 'Confirmar Liquidação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
