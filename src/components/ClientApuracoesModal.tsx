import React, { useState } from 'react';
import {
  X,
  Building,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  Check,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { RawCnpjCopyButton } from './RawCnpjCopyButton';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { apuracaoValidationService, buildValidationKey } from '../services/apuracaoValidationService';
import type { Client, ClientApuracaoValidation } from '../types';

interface ClientApuracoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  regime: string;
  year: number;
  yearCompetencias: string[];
  obligations: string[];
  inputValues: Record<string, string>;
  validations: Record<string, ClientApuracaoValidation>;
  onStatusChange: (client: Client, obrigacao: string, competencia: string, newValue: string) => void;
  isObligationEnabled: (client: Client, obrigacao: string) => boolean;
  onOpenValidationModal: (client: Client, competencia: string) => void;
  onRefreshData?: () => void;
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
  validations,
  onStatusChange,
  isObligationEnabled,
  onOpenValidationModal,
  onRefreshData,
}) => {
  const { toast } = useToast();
  const { profile, user } = useAuth();
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
  const isMonth100 = totalInMonth > 0 && okCountInMonth === totalInMonth;

  // Status de validação do ADM para o cliente no mês selecionado
  const currentValidationKey = buildValidationKey(client.id, selectedComp);
  const currentValidation = validations[currentValidationKey];
  const isNeedsReview = currentValidation?.status === 'NEEDS_REVIEW';

  // Verifica se uma obrigação específica está validada pelo ADM
  const isObligationValidated = (obrigacao: string) => {
    if (!currentValidation) return false;
    if (currentValidation.validated_obligations && Array.isArray(currentValidation.validated_obligations)) {
      return currentValidation.validated_obligations.includes(obrigacao);
    }
    // Fallback legado: se status for APPROVED, todas estavam validadas
    return currentValidation.status === 'APPROVED';
  };

  // Contagem de obrigações validadas pelo ADM
  const validatedObligationsCount = clientObligations.filter((ob) => isObligationValidated(ob)).length;
  const isAllObligationsValidated =
    clientObligations.length > 0 && validatedObligationsCount === clientObligations.length;
  const isPartiallyValidated =
    validatedObligationsCount > 0 && validatedObligationsCount < clientObligations.length;

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
    toast(`Todas as ${clientObligations.length} apurações de ${selectedComp.toUpperCase()} marcadas como OK!`, 'success');
  };

  const handleUnmarkAll = () => {
    clientObligations.forEach((ob) => {
      const key = `${client.id}::${ob}::${selectedComp}`;
      const val = inputValues[key];
      if ((val || '').trim() !== '') {
        onStatusChange(client, ob, selectedComp, '');
      }
    });
    toast(`Apurações de ${selectedComp.toUpperCase()} desmarcadas (pendentes)!`, 'info');
  };

  // Alternar checkbox de validação de UMA ÚNICA obrigação
  const handleToggleObligationValidation = async (obrigacao: string, currentlyChecked: boolean) => {
    if (profile?.role !== 'admin') {
      toast('Apenas gestores administradores podem validar apurações.', 'info');
      return;
    }

    const nextChecked = !currentlyChecked;
    await apuracaoValidationService.toggleObligationValidation({
      clientId: client.id,
      competencia: selectedComp,
      regime,
      obrigacao,
      allClientObligations: clientObligations,
      validated: nextChecked,
      adminId: user?.id,
      adminName: profile?.full_name || 'Gestor ADM',
    });

    if (nextChecked) {
      toast(`Obrigação "${obrigacao}" validada pelo ADM!`, 'success');
    } else {
      toast(`Validação de "${obrigacao}" desmarcada.`, 'info');
    }
    onRefreshData?.();
  };

  // Alternar validação de TODAS as obrigações (Marcar todas / Desmarcar todas)
  const handleToggleAllValidationCheck = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (profile?.role !== 'admin') {
      toast('Apenas gestores administradores podem validar apurações.', 'info');
      return;
    }

    const checked = e.target.checked;
    if (checked) {
      await apuracaoValidationService.setValidationApproved({
        clientId: client.id,
        competencia: selectedComp,
        regime,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
        allObligations: clientObligations,
      });
      toast(`Todas as apurações de ${selectedComp.toUpperCase()} foram validadas pelo ADM!`, 'success');
    } else {
      await apuracaoValidationService.clearValidation(client.id, selectedComp);
      toast(`Validações de ${selectedComp.toUpperCase()} foram desmarcadas.`, 'info');
    }
    onRefreshData?.();
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

        {/* 1. SELETOR DE COMPETÊNCIA: SELECT/FILTRO AO INVÉS DE ABAS HORIZONTAIS */}
        <div className="p-2.5 px-6 bg-stone-50 border-b border-stone-200/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-white border border-stone-300/80 rounded-xl px-3 py-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              <label htmlFor="comp-select" className="text-xs font-bold text-stone-600 uppercase tracking-wider shrink-0">
                Competência:
              </label>
              <select
                id="comp-select"
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-900 focus:outline-none cursor-pointer pr-2"
              >
                {yearCompetencias.map((comp) => {
                  const mLabel = comp.split('/')[0].toUpperCase();
                  const compValKey = buildValidationKey(client.id, comp);
                  const isCompValid = validations[compValKey]?.status === 'APPROVED';

                  const okCountInComp = clientObligations.filter((ob) => {
                    const key = `${client.id}::${ob}::${comp}`;
                    const val = inputValues[key];
                    return (val || '').trim().toUpperCase() === 'OK';
                  }).length;
                  const is100InComp = clientObligations.length > 0 && okCountInComp === clientObligations.length;

                  let suffix = '';
                  if (isCompValid) {
                    suffix = ' ✓ (Validado ADM)';
                  } else if (is100InComp) {
                    suffix = ' (100% Apurado)';
                  }

                  return (
                    <option key={comp} value={comp}>
                      {mLabel}/{comp.split('/')[1] || year} {suffix}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Badge de Status Geral do Mês Selecionado */}
            <div className="hidden sm:flex items-center space-x-1.5">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1 border ${
                  isAllObligationsValidated
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : isPartiallyValidated
                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : isMonth100
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                {isAllObligationsValidated ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Validado pelo ADM</span>
                  </>
                ) : isPartiallyValidated ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    <span>Validação Parcial ({validatedObligationsCount}/{clientObligations.length})</span>
                  </>
                ) : isNeedsReview ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    <span>Revisão Apontada</span>
                  </>
                ) : isMonth100 ? (
                  <>
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>100% (Aguardando Validação)</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>{percentInMonth}% em andamento</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Botões de Ação em Lote */}
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

        {/* 2. TABELA DE OBRIGAÇÕES COM STATUS DA VALIDAÇÃO E CHECKBOX ADM */}
        <div className="flex-1 overflow-y-auto min-h-[260px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-stone-100 shadow-xs">
              <tr className="border-b border-stone-200 text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none">
                <th className="py-2 px-4 w-12 text-center">Item</th>
                <th className="py-2 px-4">Obrigação / Apuração</th>
                <th className="py-2 px-4 text-center">Competência</th>
                <th className="py-2 px-4 text-center">Status da Apuração</th>
                <th className="py-2 px-4 text-right">
                  <div className="inline-flex items-center justify-end space-x-2">
                    <span>Status da Validação</span>
                    {profile?.role === 'admin' && (
                      <label
                        className="inline-flex items-center space-x-1 cursor-pointer select-none bg-stone-200/70 hover:bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors"
                        title={
                          isAllObligationsValidated
                            ? 'Clique para desmarcar todas as validações'
                            : 'Clique para validar todas as apurações desta competência'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isAllObligationsValidated}
                          ref={(el) => {
                            if (el) el.indeterminate = isPartiallyValidated;
                          }}
                          onChange={handleToggleAllValidationCheck}
                          className="w-3 h-3 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>Marcar todos</span>
                      </label>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {clientObligations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-stone-400">
                    Nenhuma apuração habilitada para este cliente.
                  </td>
                </tr>
              ) : (
                clientObligations.map((obrigacao, index) => {
                  const key = `${client.id}::${obrigacao}::${selectedComp}`;
                  const val = inputValues[key] !== undefined ? inputValues[key] : '';
                  const isOk = (val || '').trim().toUpperCase() === 'OK';
                  const isItemValidated = isObligationValidated(obrigacao);
                  const isReviewFlagged = currentValidation?.pending_obligations?.includes(obrigacao);

                  return (
                    <tr
                      key={obrigacao}
                      className={`hover:bg-amber-50/20 transition-colors ${
                        isItemValidated
                          ? 'bg-emerald-50/20'
                          : isOk
                          ? 'bg-slate-50/40'
                          : ''
                      } ${isReviewFlagged ? 'bg-rose-50/30' : ''}`}
                    >
                      {/* Índice */}
                      <td className="py-1.5 px-4 text-center font-mono text-[10px] text-stone-400">
                        {String(index + 1).padStart(2, '0')}
                      </td>

                      {/* Nome da Obrigação */}
                      <td className="py-1.5 px-4 font-semibold text-stone-900">
                        <div className="flex items-center space-x-1.5">
                          <span>{obrigacao}</span>
                          {isReviewFlagged && (
                            <span className="text-[9px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded border border-rose-300">
                              Revisar
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Competência Atual */}
                      <td className="py-1.5 px-4 text-center font-mono text-[11px] text-stone-600 uppercase">
                        {selectedComp}
                      </td>

                      {/* Status da Apuração: Editável com OK ou vazio */}
                      <td className="py-1.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center space-x-1.5">
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

                      {/* 2. STATUS DA VALIDAÇÃO: Checkbox/Tick e Badge de Validação */}
                      <td className="py-1.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end space-x-2">
                          {isItemValidated ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Validado ADM</span>
                            </span>
                          ) : isReviewFlagged ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Pendente Revisão</span>
                            </span>
                          ) : isOk ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                              <Clock className="w-2.5 h-2.5 text-slate-400" />
                              <span>Aguardando ADM</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-stone-400">Não apurado</span>
                          )}

                          {/* Checkbox para ticar se está validado pelo ADM (um de cada vez) */}
                          <label
                            className={`inline-flex items-center space-x-1 p-0.5 px-1.5 rounded cursor-pointer select-none transition-colors ${
                              profile?.role === 'admin'
                                ? 'hover:bg-stone-100 text-stone-700'
                                : 'opacity-60 cursor-not-allowed text-stone-400'
                            }`}
                            title={
                              profile?.role === 'admin'
                                ? `Ticar para validar apenas ${obrigacao}`
                                : 'Apenas usuários administradores podem alterar a validação'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={isItemValidated}
                              disabled={profile?.role !== 'admin'}
                              onChange={() => handleToggleObligationValidation(obrigacao, isItemValidated)}
                              className="w-3.5 h-3.5 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className="text-[10px] font-semibold">Ticar</span>
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 3. RODAPÉ COM BOTÕES PARA FINALIZAR VALIDAÇÃO OU SINALIZAR PENDÊNCIA (ABRINDO CAIXINHA FINAL) */}
        <div className="p-3 px-6 bg-stone-50 border-t border-stone-200/70 flex flex-wrap items-center justify-between text-[11px] text-stone-500 gap-3 rounded-b-2xl">
          <div>
            Competência <strong>{selectedComp.toUpperCase()}</strong>: <strong>{percentInMonth}%</strong> concluído ({okCountInMonth}/{totalInMonth} apurações).
            {validatedObligationsCount > 0 && (
              <span className={`ml-1 font-bold ${isAllObligationsValidated ? 'text-emerald-700' : 'text-blue-700'}`}>
                • {isAllObligationsValidated ? '100% Homologado pelo ADM' : `${validatedObligationsCount}/${clientObligations.length} validadas pelo ADM`}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Botão para Finalizar Validação ou Sinalizar Pendência (abre ApuracaoValidationModal) */}
            {profile?.role === 'admin' && (
              <button
                type="button"
                onClick={() => onOpenValidationModal(client, selectedComp)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isAllObligationsValidated
                    ? 'bg-slate-700 hover:bg-slate-800 text-white'
                    : isMonth100
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
                title="Abrir caixinha final para homologar validação ou sinalizar pendência ao analista"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {isAllObligationsValidated
                    ? 'Gerenciar Validação / Apontar Pendência'
                    : 'Finalizar Validação / Apontar Pendência'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              Concluir e Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
