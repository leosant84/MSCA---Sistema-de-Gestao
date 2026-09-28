import React, { useState } from 'react';
import { X, FileSpreadsheet, CheckSquare, Square, Download } from 'lucide-react';
import {
  AVAILABLE_CLIENT_EXPORT_FIELDS,
  exportClientsToExcel,
  type ClientExportFieldOption,
} from '../utils/excelExport';
import { useToast } from '../contexts/ToastContext';
import type { Client } from '../types';

interface ExportClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  filterContext?: string;
}

export const ExportClientsModal: React.FC<ExportClientsModalProps> = ({
  isOpen,
  onClose,
  clients,
  filterContext,
}) => {
  const { toast } = useToast();

  // Inicializa todos os campos disponíveis marcados por padrão
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    AVAILABLE_CLIENT_EXPORT_FIELDS.map((f) => f.key)
  );

  if (!isOpen) return null;

  const handleToggleField = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    setSelectedKeys(AVAILABLE_CLIENT_EXPORT_FIELDS.map((f) => f.key));
  };

  const handleDeselectAll = () => {
    setSelectedKeys([]);
  };

  const handleExport = () => {
    if (selectedKeys.length === 0) {
      toast('Selecione ao menos um campo para realizar a extração.', 'error');
      return;
    }

    if (clients.length === 0) {
      toast('Nenhum cliente disponível para exportar.', 'info');
      return;
    }

    exportClientsToExcel(clients, filterContext, selectedKeys);
    toast(`Exportando ${clients.length} cliente(s) com ${selectedKeys.length} campo(s)...`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-4 px-5 border-b border-gray-200 flex items-center justify-between bg-[#1E2022] text-white">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Exportar Clientes para Excel</h2>
              <p className="text-[11px] text-gray-300">
                Selecione os campos que deseja extrair ({clients.length} cliente(s) listados)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com Seleção de Campos */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-gray-100">
            <span className="font-semibold text-stone-700">
              Campos Disponíveis ({selectedKeys.length}/{AVAILABLE_CLIENT_EXPORT_FIELDS.length}):
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
              >
                Marcar Todos
              </button>
              <span className="text-gray-300">•</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[11px] font-medium text-stone-500 hover:text-stone-700 hover:underline cursor-pointer"
              >
                Desmarcar Todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {AVAILABLE_CLIENT_EXPORT_FIELDS.map((field: ClientExportFieldOption) => {
              const isChecked = selectedKeys.includes(field.key);
              return (
                <label
                  key={field.key}
                  className={`flex items-center space-x-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none text-xs ${
                    isChecked
                      ? 'bg-amber-50/50 border-[#C5A059]/40 text-stone-900 shadow-2xs'
                      : 'bg-stone-50/50 border-gray-200 text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleField(field.key)}
                    className="sr-only"
                  />
                  <div className="shrink-0 text-[#C5A059]">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-[#C5A059]" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-300" />
                    )}
                  </div>
                  <span className="font-medium">{field.label}</span>
                </label>
              );
            })}
          </div>

          <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/70 text-[11px] text-stone-500">
            💡 <strong>Nota de Segurança e Filtro:</strong> Campos sensíveis (credenciais de acesso, logins e senhas) e administrativos (SIEG, NIRE, Início de Atividade, Cód. Acesso e Status) não são exportados.
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 px-5 border-t border-gray-200 bg-gray-50 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={selectedKeys.length === 0}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Gerar Planilha ({selectedKeys.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
