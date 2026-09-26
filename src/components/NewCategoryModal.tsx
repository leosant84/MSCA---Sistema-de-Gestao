import React, { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import type { FinancialCategory } from '../types';

interface NewCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (category: FinancialCategory) => void;
  tipo?: 'entrada' | 'saida';
}

export const NewCategoryModal: React.FC<NewCategoryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  tipo = 'entrada',
}) => {
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast('Informe o nome da categoria contábil.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('financial_categories')
        .insert([{ nome: nome.trim(), tipo }])
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Esta categoria já está cadastrada.');
        }
        throw error;
      }

      toast(`Categoria "${nome.trim()}" cadastrada com sucesso!`, 'success');
      onCreated(data as FinancialCategory);
      setNome('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cadastrar categoria';
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
            <Tag className="w-4 h-4 text-[#C5A059]" />
            <h3 className="text-sm font-bold">Nova Categoria Contábil</h3>
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
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Nome da Conta Contábil / Categoria *
            </label>
            <input
              type="text"
              autoFocus
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Consultoria Tributária Especial"
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Ficará disponível imediatamente na lista de seleção para futuros lançamentos.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#C5A059] hover:bg-[#9E7B35] rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{loading ? 'Salvando...' : 'Cadastrar Categoria'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
