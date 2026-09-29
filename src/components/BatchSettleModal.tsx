import React, { useState } from 'react';
import { X, CheckCircle2, Calendar, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface BatchSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedIds: string[];
  totalValor: number;
}

export const BatchSettleModal: React.FC<BatchSettleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedIds,
  totalValor,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataRecebimento, setDataRecebimento] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [banco, setBanco] = useState('Itaú (c/c)');

  if (!isOpen || selectedIds.length === 0) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

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
        .in('id', selectedIds);

      if (error) throw error;

      toast(
        `Sucesso! ${selectedIds.length} recebimento(s) liquidados simultaneamente em lote!`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao liquidar registros em lote';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 bg-[#1E2022] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">Baixa Rápida em Lote</h3>
              <p className="text-[10px] text-gray-400">Liquidação simultânea de recebíveis</p>
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
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-700">
              <span>Registros Selecionados:</span>
              <strong className="text-gray-900 font-bold">{selectedIds.length} parcelas</strong>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-700 mt-1">
              <span>Total a Liquidar:</span>
              <strong className="text-emerald-700 font-bold font-mono text-sm">
                {formatCurrency(totalValor)}
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Data de Liquidação *</span>
            </label>
            <input
              type="date"
              required
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
              <Landmark className="w-3.5 h-3.5 text-gray-400" />
              <span>Banco de Destino *</span>
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
              {loading ? 'Liquidando...' : `Confirmar Baixa (${selectedIds.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
