import React, { useState } from 'react';
import {
  X,
  Search,
  Building,
  CheckCircle2,
  Clock,
  MapPin,
} from 'lucide-react';
import { RawCnpjCopyButton } from './RawCnpjCopyButton';
import { useToast } from '../contexts/ToastContext';
import type { Client } from '../types';

interface ApuracaoDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  obrigacaoName: string;
  regime: string;
  competencia: string;
  clients: Client[];
  inputValues: Record<string, string>;
  onStatusChange: (client: Client, obrigacao: string, newValue: string) => void;
  isObligationEnabled: (client: Client, obrigacao: string) => boolean;
}

export const ApuracaoDrilldownModal: React.FC<ApuracaoDrilldownModalProps> = ({
  isOpen,
  onClose,
  obrigacaoName,
  regime,
  competencia,
  clients,
  inputValues,
  onStatusChange,
  isObligationEnabled,
}) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filtrar clientes que necessitam desta apuração específica (obrigação habilitada)
  const applicableClients = clients.filter((c) => isObligationEnabled(c, obrigacaoName));

  // Filtrar por busca textual
  const filteredClients = applicableClients.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const rawCnpj = (c.cnpj || '').replace(/\D/g, '');
    return (
      (c.razao_social || '').toLowerCase().includes(term) ||
      rawCnpj.includes(term.replace(/\D/g, '')) ||
      (c.localidade || '').toLowerCase().includes(term) ||
      (c.numero_pasta || '').toLowerCase().includes(term)
    );
  });

  // Estatísticas da obrigação no mês
  const total = applicableClients.length;
  const okCount = applicableClients.filter((c) => {
    const key = `${c.id}::${obrigacaoName}::${competencia}`;
    const keyLegacy = `${c.id}::${obrigacaoName}`;
    const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
    return (val || '').trim().toUpperCase() === 'OK';
  }).length;
  const percent = total > 0 ? Math.round((okCount / total) * 100) : 100;

  const handleToggleStatus = (client: Client) => {
    const key = `${client.id}::${obrigacaoName}::${competencia}`;
    const keyLegacy = `${client.id}::${obrigacaoName}`;
    const currentVal = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
    const isOk = (currentVal || '').trim().toUpperCase() === 'OK';
    const nextVal = isOk ? '' : 'OK';

    onStatusChange(client, obrigacaoName, nextVal);

    if (nextVal === 'OK') {
      toast(`${client.razao_social}: Marcado como OK`, 'success');
    } else {
      toast(`${client.razao_social}: Marcado como Pendente`, 'info');
    }
  };

  const handleMarkAllVisibleOk = () => {
    filteredClients.forEach((c) => {
      const key = `${c.id}::${obrigacaoName}::${competencia}`;
      const keyLegacy = `${c.id}::${obrigacaoName}`;
      const currentVal = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
      if ((currentVal || '').trim().toUpperCase() !== 'OK') {
        onStatusChange(c, obrigacaoName, 'OK');
      }
    });
    toast(`Todos os ${filteredClients.length} clientes visíveis marcados como OK!`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200/80 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        {/* Cabeçalho do Modal */}
        <div className="p-5 px-6 border-b border-stone-100 bg-gradient-to-r from-stone-50 via-white to-amber-50/40 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-bold text-[#A67C2E] uppercase tracking-wider">
              <span>{regime}</span>
              <span>•</span>
              <span className="font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                Competência: {competencia}
              </span>
            </div>
            <h2 className="text-xl font-bold text-stone-900 mt-1 flex items-center space-x-2">
              <span>{obrigacaoName}</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold shadow-2xs ${
                  percent === 100
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {percent}% Concluído ({okCount}/{total})
              </span>
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Gerencie individualmente os clientes vinculados a esta apuração mensal.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
            title="Fechar formulário"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Filtros e Ações Rápidas */}
        <div className="p-4 px-6 bg-stone-50/70 border-b border-stone-200/60 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente por razão social, CNPJ ou cidade..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-xl focus:ring-1 focus:ring-[#C5A059] focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleMarkAllVisibleOk}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Marcar visíveis como OK</span>
            </button>
          </div>
        </div>

        {/* Tabela de Clientes */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-stone-100 shadow-xs">
              <tr className="border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none">
                <th className="py-2.5 px-4 w-12 text-center">Dom.</th>
                <th className="py-2.5 px-4">Razão Social</th>
                <th className="py-2.5 px-3">CNPJ (Cópia Rápida)</th>
                <th className="py-2.5 px-3">Localidade</th>
                <th className="py-2.5 px-4 text-right">Status da Apuração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    <Building className="w-7 h-7 text-stone-300 mx-auto mb-2" />
                    <span>Nenhum cliente localizado para esta apuração.</span>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const key = `${client.id}::${obrigacaoName}::${competencia}`;
                  const keyLegacy = `${client.id}::${obrigacaoName}`;
                  const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
                  const isOk = (val || '').trim().toUpperCase() === 'OK';

                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-amber-50/30 transition-colors ${
                        isOk ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Domínio */}
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-stone-800 text-[11px]">
                        {client.numero_pasta || '-'}
                      </td>

                      {/* Razão Social */}
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-stone-900 leading-tight">
                          {client.razao_social}
                        </div>
                        {client.puro_ou_hibrido && (
                          <span className="text-[9px] text-stone-500 bg-stone-100 px-1 py-0.2 rounded mt-0.5 inline-block">
                            {client.puro_ou_hibrido}
                          </span>
                        )}
                      </td>

                      {/* CNPJ Puro com botão de copiar em 1 clique */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <RawCnpjCopyButton cnpj={client.cnpj} />
                      </td>

                      {/* Localidade */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {client.localidade ? (
                          <div className="inline-flex items-center space-x-1 text-[11px] text-stone-600 bg-stone-50 px-2 py-0.5 rounded-lg border border-stone-200">
                            <MapPin className="w-2.5 h-2.5 text-[#C5A059]" />
                            <span className="uppercase">{client.localidade}</span>
                          </div>
                        ) : (
                          <span className="text-stone-300 text-xs">-</span>
                        )}
                      </td>

                      {/* Status da Apuração com Alternância Editável Instantânea */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(client)}
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer ${
                            isOk
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-stone-100 hover:bg-amber-100 text-stone-600 hover:text-amber-900 border border-stone-200/80'
                          }`}
                          title="Clique para alternar entre OK e Pendente"
                        >
                          {isOk ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>OK</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-stone-400" />
                              <span>PENDENTE</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div className="p-3.5 px-6 bg-stone-50 border-t border-stone-200/70 flex items-center justify-between text-xs text-stone-500 rounded-b-3xl">
          <div>
            Exibindo <strong>{filteredClients.length}</strong> de <strong>{total}</strong> clientes desta apuração.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
          >
            Concluir e Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
