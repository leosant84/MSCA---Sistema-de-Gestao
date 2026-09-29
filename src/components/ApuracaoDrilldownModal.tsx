import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Building,
  CheckCircle2,
  Clock,
  MapPin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
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

type SortField = 'numero_pasta' | 'razao_social' | 'cnpj' | 'localidade' | 'status';
type SortDirection = 'asc' | 'desc';

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
  const [sortField, setSortField] = useState<SortField>('razao_social');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  if (!isOpen) return null;

  // Filtrar clientes que necessitam desta apuração específica (obrigação habilitada)
  const applicableClients = clients.filter((c) => isObligationEnabled(c, obrigacaoName));

  // Função auxiliar para normalizar e remover acentos
  const normalizeText = (text?: string | null) => {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Filtrar e ordenar clientes
  const filteredClients = useMemo(() => {
    const rawTerm = searchTerm.trim();
    const normalizedTerm = normalizeText(rawTerm);
    const cleanNumbersQuery = rawTerm.replace(/\D/g, '');

    // 1. Filtragem por busca
    const searched = applicableClients.filter((c) => {
      if (!normalizedTerm) return true;

      const normRazao = normalizeText(c.razao_social);
      const normLocalidade = normalizeText(c.localidade);
      const normPasta = normalizeText(c.numero_pasta);
      const rawCnpj = (c.cnpj || '').replace(/\D/g, '');
      const rawCpf = (c.cpf || '').replace(/\D/g, '');

      const matchesRazao = normRazao.includes(normalizedTerm);
      const matchesLocalidade = normLocalidade.includes(normalizedTerm);
      const matchesPasta = normPasta.includes(normalizedTerm);
      const matchesCnpj = cleanNumbersQuery ? rawCnpj.includes(cleanNumbersQuery) : false;
      const matchesCpf = cleanNumbersQuery ? rawCpf.includes(cleanNumbersQuery) : false;

      return (
        matchesRazao ||
        matchesLocalidade ||
        matchesPasta ||
        matchesCnpj ||
        matchesCpf
      );
    });

    // 2. Ordenação das colunas
    return searched.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'numero_pasta': {
          const pastaA = (a.numero_pasta || '').trim();
          const pastaB = (b.numero_pasta || '').trim();
          comparison = pastaA.localeCompare(pastaB, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'razao_social': {
          const razaoA = (a.razao_social || '').trim();
          const razaoB = (b.razao_social || '').trim();
          comparison = razaoA.localeCompare(razaoB, 'pt-BR', { sensitivity: 'base' });
          break;
        }
        case 'cnpj': {
          const cnpjA = (a.cnpj || '').replace(/\D/g, '');
          const cnpjB = (b.cnpj || '').replace(/\D/g, '');
          comparison = cnpjA.localeCompare(cnpjB);
          break;
        }
        case 'localidade': {
          const locA = (a.localidade || '').trim();
          const locB = (b.localidade || '').trim();
          comparison = locA.localeCompare(locB, 'pt-BR', { sensitivity: 'base' });
          break;
        }
        case 'status': {
          const keyA = `${a.id}::${obrigacaoName}::${competencia}`;
          const keyB = `${b.id}::${obrigacaoName}::${competencia}`;
          const isOkA = (inputValues[keyA] || '').trim().toUpperCase() === 'OK';
          const isOkB = (inputValues[keyB] || '').trim().toUpperCase() === 'OK';
          comparison = (isOkA === isOkB ? 0 : isOkA ? -1 : 1);
          break;
        }
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [applicableClients, searchTerm, sortField, sortDirection, inputValues, obrigacaoName, competencia]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Estatísticas da obrigação no mês
  const total = applicableClients.length;
  const okCount = applicableClients.filter((c) => {
    const key = `${c.id}::${obrigacaoName}::${competencia}`;
    const keyLegacy = `${c.id}::${obrigacaoName}`;
    const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
    return (val || '').trim().toUpperCase() === 'OK';
  }).length;
  const percent = total > 0 ? Math.round((okCount / total) * 100) : 100;

  const handleInputChange = (client: Client, rawValue: string) => {
    const trimmed = rawValue.trim();
    // Se o usuário digitar "OK" (ou minúsculo "ok"), normaliza para "OK"
    const isOkTyped = trimmed.toUpperCase() === 'OK';
    const finalValue = isOkTyped ? 'OK' : rawValue;

    onStatusChange(client, obrigacaoName, finalValue);
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200/80 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        {/* Cabeçalho do Modal (compacto) */}
        <div className="p-3.5 px-5 border-b border-stone-100 bg-gradient-to-r from-stone-50 via-white to-amber-50/40 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center space-x-1.5 text-[10px] font-bold text-[#A67C2E] uppercase tracking-wider">
              <span>{regime}</span>
              <span>•</span>
              <span className="font-mono bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded">
                COMPETÊNCIA: {competencia.toUpperCase()}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 mt-0.5 flex items-center space-x-2">
              <span>{obrigacaoName}</span>
              <span
                className={`text-[10px] px-2 py-0.2 rounded-full font-bold shadow-2xs ${
                  percent === 100
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {percent}% Concluído ({okCount}/{total})
              </span>
            </h2>
            <p className="text-[11px] text-stone-500">
              Digite <strong>OK</strong> no campo de status para marcar como apurado. Deixe vazio para manter como pendente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
            title="Fechar formulário"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Filtros e Ações Rápidas (compacta) */}
        <div className="p-2.5 px-5 bg-stone-50/70 border-b border-stone-200/60 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por razão social, CNPJ ou cidade..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-stone-200 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 rounded cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleMarkAllVisibleOk}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Marcar visíveis como OK</span>
            </button>
          </div>
        </div>

        {/* Tabela de Clientes */}
        <div className="flex-1 overflow-y-auto min-h-[260px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-stone-100 shadow-xs">
              <tr className="border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none">
                {/* Domínio com classificação */}
                <th className="py-1.5 px-3 w-14 text-center">
                  <button
                    type="button"
                    onClick={() => handleSort('numero_pasta')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer"
                    title="Classificar por pasta / domínio"
                  >
                    <span>Dom.</span>
                    {sortField === 'numero_pasta' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-[#C5A059]" /> : <ArrowDown className="w-2.5 h-2.5 text-[#C5A059]" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-stone-300" />
                    )}
                  </button>
                </th>

                {/* Razão Social com classificação */}
                <th className="py-1.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('razao_social')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer"
                    title="Classificar por Razão Social"
                  >
                    <span>Razão Social</span>
                    {sortField === 'razao_social' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-[#C5A059]" /> : <ArrowDown className="w-2.5 h-2.5 text-[#C5A059]" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-stone-300" />
                    )}
                  </button>
                </th>

                {/* CNPJ com classificação */}
                <th className="py-1.5 px-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('cnpj')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer"
                    title="Classificar por CNPJ"
                  >
                    <span>CNPJ</span>
                    {sortField === 'cnpj' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-[#C5A059]" /> : <ArrowDown className="w-2.5 h-2.5 text-[#C5A059]" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-stone-300" />
                    )}
                  </button>
                </th>

                {/* Localidade com classificação */}
                <th className="py-1.5 px-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort('localidade')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer"
                    title="Classificar por Localidade"
                  >
                    <span>Localidade</span>
                    {sortField === 'localidade' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-[#C5A059]" /> : <ArrowDown className="w-2.5 h-2.5 text-[#C5A059]" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-stone-300" />
                    )}
                  </button>
                </th>

                {/* Status da Apuração com classificação */}
                <th className="py-1.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer ml-auto"
                    title="Classificar por Status da Apuração"
                  >
                    <span>Status da Apuração</span>
                    {sortField === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-[#C5A059]" /> : <ArrowDown className="w-2.5 h-2.5 text-[#C5A059]" />
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-stone-300" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-stone-400">
                    <Building className="w-6 h-6 text-stone-300 mx-auto mb-1.5" />
                    <span className="text-xs">Nenhum cliente localizado para esta apuração.</span>
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
                      className={`hover:bg-amber-50/20 transition-colors ${
                        isOk ? 'bg-emerald-50/15' : ''
                      }`}
                    >
                      {/* Domínio */}
                      <td className="py-1 px-3 text-center font-mono font-bold text-stone-800 text-[10px]">
                        {client.numero_pasta || '-'}
                      </td>

                      {/* Razão Social */}
                      <td className="py-1 px-3">
                        <div className="font-semibold text-stone-900 leading-tight text-xs">
                          {client.razao_social}
                        </div>
                        {client.puro_ou_hibrido && (
                          <span className="text-[8px] text-stone-500 bg-stone-100 px-1 rounded inline-block mt-0.5">
                            {client.puro_ou_hibrido}
                          </span>
                        )}
                      </td>

                      {/* CNPJ Puro com botão de copiar em 1 clique */}
                      <td className="py-1 px-2.5 whitespace-nowrap">
                        <RawCnpjCopyButton cnpj={client.cnpj} />
                      </td>

                      {/* Localidade */}
                      <td className="py-1 px-2.5 whitespace-nowrap">
                        {client.localidade ? (
                          <div className="inline-flex items-center space-x-1 text-[10px] text-stone-600 bg-stone-50 px-1.5 py-0.2 rounded border border-stone-200">
                            <MapPin className="w-2 h-2 text-[#C5A059]" />
                            <span className="uppercase">{client.localidade}</span>
                          </div>
                        ) : (
                          <span className="text-stone-300 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Status da Apuração: Campo editável com OK ou vazio (Pendente) + botão rápido */}
                      <td className="py-1 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end space-x-1.5">
                          {/* Campo de input de texto para preencher "OK" ou deixar vazio */}
                          <div className="relative">
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => handleInputChange(client, e.target.value)}
                              placeholder="OK"
                              className={`w-14 px-2 py-0.5 text-center text-xs font-mono font-bold rounded border uppercase transition-colors focus:outline-none focus:ring-1 ${
                                isOk
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-800 focus:ring-emerald-500'
                                  : 'bg-white border-stone-300 text-stone-700 placeholder-stone-300 focus:border-[#C5A059] focus:ring-[#C5A059]'
                              }`}
                              title='Digite "OK" para apurado ou deixe vazio para pendente'
                            />
                          </div>

                          {/* Botão de 1 clique para alternar rápido entre OK e vazio */}
                          <button
                            type="button"
                            onClick={() => {
                              const next = isOk ? '' : 'OK';
                              onStatusChange(client, obrigacaoName, next);
                              if (next === 'OK') {
                                toast(`${client.razao_social}: Marcado como OK`, 'success');
                              } else {
                                toast(`${client.razao_social}: Marcado como Pendente`, 'info');
                              }
                            }}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                              isOk
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                : 'bg-stone-50 hover:bg-amber-50 text-stone-500 hover:text-stone-800 border-stone-200'
                            }`}
                            title="Clique para alternar rápido entre OK e Pendente"
                          >
                            {isOk ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>OK</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-stone-400" />
                                <span>PENDENTE</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé (compacto) */}
        <div className="p-2.5 px-5 bg-stone-50 border-t border-stone-200/70 flex items-center justify-between text-[11px] text-stone-500 rounded-b-2xl">
          <div>
            Exibindo <strong>{filteredClients.length}</strong> de <strong>{total}</strong> clientes.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
          >
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
