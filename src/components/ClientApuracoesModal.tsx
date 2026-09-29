import React, { useState } from 'react';
import {
  X,
  Building,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  Check,
} from 'lucide-react';
import { RawCnpjCopyButton } from './RawCnpjCopyButton';
import { useToast } from '../contexts/ToastContext';
import type { Client } from '../types';

interface ClientApuracoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  regime: string;
  year: number;
  yearCompetencias: string[];
  obligations: string[];
  inputValues: Record<string, string>;
  onStatusChange: (client: Client, obrigacao: string, competencia: string, newValue: string) => void;
  isObligationEnabled: (client: Client, obrigacao: string) => boolean;
}

export const ClientApuracoesModal: React.FC<ClientApuracoesModalProps> = ({
  isOpen,
  onClose,
  client,
  regime,
  year,
  yearCompetencias,
  obligations,
  inputValues,
  onStatusChange,
  isObligationEnabled,
}) => {
  const { toast } = useToast();
  const currentMonthIdx = new Date().getMonth();
  const [selectedComp, setSelectedComp] = useState<string>(
    () => yearCompetencias[currentMonthIdx] || yearCompetencias[0] || 'set/26'
  );

  if (!isOpen || !client) return null;

  // Obrigações habilitadas para este cliente
  const clientObligations = obligations.filter((ob) => isObligationEnabled(client, ob));

  // Estatísticas no mês selecionado
  const totalInMonth = clientObligations.length;
  const okCountInMonth = clientObligations.filter((ob) => {
    const key = `${client.id}::${ob}::${selectedComp}`;
    const val = inputValues[key];
    return (val || '').trim().toUpperCase() === 'OK';
  }).length;
  const percentInMonth = totalInMonth > 0 ? Math.round((okCountInMonth / totalInMonth) * 100) : 100;

  // Estatísticas no ano inteiro (todas as competências x obrigações)
  let totalInYear = 0;
  let okCountInYear = 0;
  yearCompetencias.forEach((comp) => {
    clientObligations.forEach((ob) => {
      totalInYear++;
      const key = `${client.id}::${ob}::${comp}`;
      const val = inputValues[key];
      if ((val || '').trim().toUpperCase() === 'OK') {
        okCountInYear++;
      }
    });
  });
  const percentInYear = totalInYear > 0 ? Math.round((okCountInYear / totalInYear) * 100) : 100;

  const handleInputChange = (obrigacao: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    const isOkTyped = trimmed.toUpperCase() === 'OK';
    const finalVal = isOkTyped ? 'OK' : rawValue;
    onStatusChange(client, obrigacao, selectedComp, finalVal);
  };

  const handleToggleStatus = (obrigacao: string) => {
    const key = `${client.id}::${obrigacao}::${selectedComp}`;
    const val = inputValues[key];
    const isOk = (val || '').trim().toUpperCase() === 'OK';
    const nextVal = isOk ? '' : 'OK';

    onStatusChange(client, obrigacao, selectedComp, nextVal);
    if (nextVal === 'OK') {
      toast(`${obrigacao}: Marcado como OK`, 'success');
    } else {
      toast(`${obrigacao}: Marcado como Pendente`, 'info');
    }
  };

  const handleMarkAllVisibleOk = () => {
    clientObligations.forEach((ob) => {
      const key = `${client.id}::${ob}::${selectedComp}`;
      const val = inputValues[key];
      if ((val || '').trim().toUpperCase() !== 'OK') {
        onStatusChange(client, ob, selectedComp, 'OK');
      }
    });
    toast(`Todas as ${clientObligations.length} apurações de ${selectedComp} marcadas como OK!`, 'success');
  };

  const handleUnmarkAll = () => {
    clientObligations.forEach((ob) => {
      const key = `${client.id}::${ob}::${selectedComp}`;
      const val = inputValues[key];
      if ((val || '').trim() !== '') {
        onStatusChange(client, ob, selectedComp, '');
      }
    });
    toast(`Apurações de ${selectedComp} desmarcadas (pendentes)!`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200/80 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-4 px-6 border-b border-stone-100 bg-gradient-to-r from-stone-50 via-white to-amber-50/40 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[10px] font-bold text-[#A67C2E] uppercase tracking-wider">
              <span>{regime}</span>
              <span>•</span>
              <span className="font-mono bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded">
                DOM.: {client.numero_pasta || '-'}
              </span>
              <span>•</span>
              <span className="font-mono bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                ANO: {year}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-bold text-stone-900 mt-1 flex items-center space-x-2">
              <Building className="w-4 h-4 text-[#C5A059]" />
              <span>{client.razao_social}</span>
            </h2>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <RawCnpjCopyButton cnpj={client.cnpj} />

              {client.localidade && (
                <div className="inline-flex items-center space-x-1 text-[10px] text-stone-600 bg-stone-50 px-2 py-0.2 rounded-md border border-stone-200">
                  <MapPin className="w-2.5 h-2.5 text-[#C5A059]" />
                  <span className="uppercase">{client.localidade}</span>
                </div>
              )}

              <span
                className={`text-[10px] px-2 py-0.2 rounded-full font-bold shadow-2xs ${
                  percentInYear === 100
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                Ano {year}: {percentInYear}% concluído ({okCountInYear}/{totalInYear})
              </span>
            </div>
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

        {/* Seletor de Competência (12 Meses em formato tabs horizontais) */}
        <div className="p-2.5 px-6 bg-stone-50 border-b border-stone-200/60 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-stone-400 mr-1 shrink-0" />
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mr-2 shrink-0">
              Mês:
            </span>
            <div className="flex items-center space-x-1 bg-stone-200/60 p-0.5 rounded-xl">
              {yearCompetencias.map((comp) => {
                const isSelected = selectedComp === comp;
                const mLabel = comp.split('/')[0].toUpperCase();

                // Checar se todas as obrigações deste mês estão OK
                const okInThisMonth = clientObligations.filter((ob) => {
                  const key = `${client.id}::${ob}::${comp}`;
                  const val = inputValues[key];
                  return (val || '').trim().toUpperCase() === 'OK';
                }).length;
                const is100InThisMonth = clientObligations.length > 0 && okInThisMonth === clientObligations.length;

                return (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setSelectedComp(comp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1 ${
                      isSelected
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
                    }`}
                  >
                    <span>{mLabel}</span>
                    {is100InThisMonth && (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleMarkAllVisibleOk}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
              title={`Marcar todas as apurações de ${selectedComp.toUpperCase()} como OK`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Marcar todas como OK</span>
            </button>

            <button
              type="button"
              onClick={handleUnmarkAll}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
              title={`Limpar todas as apurações de ${selectedComp.toUpperCase()} (tornar pendente)`}
            >
              <X className="w-3.5 h-3.5 text-stone-500" />
              <span>Desmarcar todas</span>
            </button>
          </div>
        </div>

        {/* Tabela de Obrigações do Cliente */}
        <div className="flex-1 overflow-y-auto min-h-[260px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-stone-100 shadow-xs">
              <tr className="border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none">
                <th className="py-2 px-4 w-12 text-center">Item</th>
                <th className="py-2 px-4">Obrigação / Apuração</th>
                <th className="py-2 px-4 text-center">Competência</th>
                <th className="py-2 px-4 text-right">Status da Apuração</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {clientObligations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-stone-400">
                    Nenhuma apuração habilitada para este cliente.
                  </td>
                </tr>
              ) : (
                clientObligations.map((obrigacao, index) => {
                  const key = `${client.id}::${obrigacao}::${selectedComp}`;
                  const val = inputValues[key] !== undefined ? inputValues[key] : '';
                  const isOk = (val || '').trim().toUpperCase() === 'OK';

                  return (
                    <tr
                      key={obrigacao}
                      className={`hover:bg-amber-50/20 transition-colors ${
                        isOk ? 'bg-emerald-50/15' : ''
                      }`}
                    >
                      {/* Índice */}
                      <td className="py-1 px-4 text-center font-mono text-[10px] text-stone-400">
                        {String(index + 1).padStart(2, '0')}
                      </td>

                      {/* Nome da Obrigação */}
                      <td className="py-1 px-4 font-semibold text-stone-900">
                        <span>{obrigacao}</span>
                      </td>

                      {/* Competência Atual */}
                      <td className="py-1 px-4 text-center font-mono text-[11px] text-stone-600 uppercase">
                        {selectedComp}
                      </td>

                      {/* Status Editável */}
                      <td className="py-1 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end space-x-1.5">
                          {/* Campo de digitação de texto OK/vazio */}
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleInputChange(obrigacao, e.target.value)}
                            placeholder="OK"
                            className={`w-14 px-2 py-0.5 text-center text-xs font-mono font-bold rounded border uppercase transition-colors focus:outline-none focus:ring-1 ${
                              isOk
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800 focus:ring-emerald-500'
                                : 'bg-white border-stone-300 text-stone-700 placeholder-stone-300 focus:border-[#C5A059] focus:ring-[#C5A059]'
                            }`}
                            title='Digite "OK" para apurado ou deixe vazio para pendente'
                          />

                          {/* Botão rápido para alternar */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(obrigacao)}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                              isOk
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                : 'bg-stone-50 hover:bg-amber-50 text-stone-500 hover:text-stone-800 border-stone-200'
                            }`}
                            title="Alternar entre OK e Pendente"
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

        {/* Rodapé */}
        <div className="p-3 px-6 bg-stone-50 border-t border-stone-200/70 flex items-center justify-between text-[11px] text-stone-500 rounded-b-2xl">
          <div>
            Competência <strong>{selectedComp.toUpperCase()}</strong>: <strong>{percentInMonth}%</strong> concluído ({okCountInMonth}/{totalInMonth} apurações).
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
          >
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
