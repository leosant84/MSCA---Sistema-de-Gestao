import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { RawCnpjCopyButton } from './RawCnpjCopyButton';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { apuracaoValidationService, buildValidationKey } from '../services/apuracaoValidationService';
import { notificationService } from '../services/notificationService';
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
  onOpenValidationModal?: (client: Client, competencia: string) => void;
  onRefreshData?: () => void;
  clients100Percent?: Client[];
  allClients?: Client[];
  onSelectClient?: (client: Client) => void;
  defaultCompetencia?: string;
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
  onRefreshData,
  clients100Percent = [],
  allClients = [],
  onSelectClient,
  defaultCompetencia,
}) => {
  const { toast } = useToast();
  const { profile, user, role, isAdmin: authIsAdmin } = useAuth();
  const isAdmin = authIsAdmin || profile?.role === 'admin' || role === 'admin';
  const currentMonthIdx = (() => {
    const m = new Date().getMonth();
    return m === 0 ? 11 : m - 1;
  })();
  const [selectedComp, setSelectedComp] = useState<string>(
    () => defaultCompetencia || yearCompetencias[currentMonthIdx] || yearCompetencias[0] || 'set/26'
  );

  useEffect(() => {
    if (defaultCompetencia) {
      setSelectedComp(defaultCompetencia);
    }
  }, [defaultCompetencia, client?.id]);

  // Estado para Modal de Confirmação de Pendência
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingObligationTarget, setPendingObligationTarget] = useState<string | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [pendingSubmitting, setPendingSubmitting] = useState(false);

  // Lista de navegação ordenada alfabeticamente:
  // Prioriza clientes 100% apurados se houver mais de 1, caso contrário permite navegar entre os clientes disponíveis (allClients)
  const navigationClients = useMemo(() => {
    // Se a lista de 100% tem 2 ou mais clientes, usa ela
    let list = clients100Percent;
    
    // Se a lista de 100% tem menos de 2 clientes mas recebemos allClients, usa allClients
    if ((!list || list.length < 2) && allClients && allClients.length > 1) {
      list = allClients;
    }

    // Se o cliente atual não estiver na lista selecionada, inclui-o para que a posição e navegação funcionem sempre
    if (client && list && !list.some((c) => c.id === client.id)) {
      list = [client, ...list];
    }

    return [...(list || [])].sort((a, b) =>
      (a.razao_social || '').localeCompare(b.razao_social || '', 'pt-BR')
    );
  }, [clients100Percent, allClients, client]);

  const currentClientIdx = useMemo(() => {
    if (!client || navigationClients.length === 0) return -1;
    return navigationClients.findIndex((c) => c.id === client.id);
  }, [client, navigationClients]);

  const handlePrevClient = () => {
    if (navigationClients.length === 0 || !onSelectClient) return;
    const prevIdx = currentClientIdx <= 0 ? navigationClients.length - 1 : currentClientIdx - 1;
    onSelectClient(navigationClients[prevIdx]);
  };

  const handleNextClient = () => {
    if (navigationClients.length === 0 || !onSelectClient) return;
    const nextIdx = currentClientIdx >= navigationClients.length - 1 ? 0 : currentClientIdx + 1;
    onSelectClient(navigationClients[nextIdx]);
  };

  if (!isOpen || !client) return null;

  // Obrigações habilitadas para este cliente com restrição de perfil ADM:
  // Administrador visualiza SOMENTE: PRO LAB / INSS, GERAR OS DAS e Parc. Ativo
  const clientObligations = obligations.filter((ob) => {
    if (isAdmin) {
      const allowedAdminObligations = ['PRO LAB / INSS', 'GUIA INSS', 'PRO-LAB. / FOPAG', 'GERAR OS DAS', 'Parc. Ativo'];
      if (!allowedAdminObligations.includes(ob)) return false;
    }
    return isObligationEnabled(client, ob);
  });

  // Estatísticas no mês selecionado
  const totalInMonth = clientObligations.length;
  const okCountInMonth = clientObligations.filter((ob) => {
    const key = `${client.id}::${ob}::${selectedComp}`;
    const val = inputValues[key];
    return (val || '').trim().toUpperCase() === 'OK';
  }).length;
  const percentInMonth = totalInMonth > 0 ? Math.round((okCountInMonth / totalInMonth) * 100) : 0;
  const isMonth100 = totalInMonth > 0 && okCountInMonth === totalInMonth;

  // Status de validação do ADM para o cliente no mês selecionado
  const currentValidationKey = buildValidationKey(client.id, selectedComp);
  const currentValidation = validations[currentValidationKey];
  const isNeedsReview = currentValidation?.status === 'NEEDS_REVIEW';

  // Verifica se uma obrigação específica está validada pelo ADM
  const isObligationValidated = (obrigacao: string) => {
    if (!currentValidation) return false;
    if (currentValidation.validated_obligations && Array.isArray(currentValidation.validated_obligations)) {
      if (currentValidation.validated_obligations.includes(obrigacao)) return true;
      const obNorm = (obrigacao || '').trim().toUpperCase();
      if (obNorm === 'PRO LAB / INSS') {
        return (
          currentValidation.validated_obligations.includes('GUIA INSS') ||
          currentValidation.validated_obligations.includes('PRO-LAB. / FOPAG')
        );
      }
      return false;
    }
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
  const percentInYear = totalInYear > 0 ? Math.round((okCountInYear / totalInYear) * 100) : 0;

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

  // Botão Aprovado (homologa individualmente a obrigação)
  const handleApproveObligation = async (obrigacao: string) => {
    if (!isAdmin) {
      toast('Apenas gestores administradores podem validar apurações.', 'info');
      return;
    }

    await apuracaoValidationService.toggleObligationValidation({
      clientId: client.id,
      competencia: selectedComp,
      regime,
      obrigacao,
      allClientObligations: clientObligations,
      validated: true,
      adminId: user?.id,
      adminName: profile?.full_name || 'Gestor ADM',
    });

    toast(`Obrigação "${obrigacao}" aprovada pelo ADM!`, 'success');
    onRefreshData?.();
  };

  // Botão Pendente (abre modal de confirmação e desabilita status OK)
  const handleOpenPendingModal = (obrigacao: string) => {
    if (!isAdmin) {
      toast('Apenas gestores administradores podem apontar pendências.', 'info');
      return;
    }
    setPendingObligationTarget(obrigacao);
    setPendingReason('');
    setPendingModalOpen(true);
  };

  // Confirmar pendência: desabilita o status OK, registra pendência e notifica analista
  const handleConfirmPending = async () => {
    if (!pendingObligationTarget) return;
    setPendingSubmitting(true);
    try {
      // 1. Desabilita o status OK da apuração
      onStatusChange(client, pendingObligationTarget, selectedComp, '');

      // 2. Desvalida a obrigação caso estivesse aprovada
      await apuracaoValidationService.toggleObligationValidation({
        clientId: client.id,
        competencia: selectedComp,
        regime,
        obrigacao: pendingObligationTarget,
        allClientObligations: clientObligations,
        validated: false,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
      });

      // 3. Marca como NEEDS_REVIEW no registro de validação
      await apuracaoValidationService.setValidationNeedsReview({
        clientId: client.id,
        competencia: selectedComp,
        regime,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
        reviewNotes: pendingReason.trim() || `Pendência apontada na obrigação: ${pendingObligationTarget}`,
        pendingObligations: [pendingObligationTarget],
      });

      // 4. Dispara notificação automática detalhada para o analista
      await notificationService.notifyOperatorReviewNeeded({
        client_id: client.id,
        client_name: client.razao_social,
        competencia: selectedComp,
        regime,
        admin_id: user?.id,
        admin_name: profile?.full_name || 'Gestor ADM',
        review_notes: pendingReason.trim() || `Pendência apontada na obrigação: ${pendingObligationTarget}`,
        pending_obligations: [pendingObligationTarget],
      });

      toast(`Pendência apontada em "${pendingObligationTarget}" e notificação enviada ao analista!`, 'info');
      setPendingModalOpen(false);
      setPendingObligationTarget(null);
      setPendingReason('');
      onRefreshData?.();
    } catch {
      toast('Erro ao apontar pendência.', 'error');
    } finally {
      setPendingSubmitting(false);
    }
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

            <div className="flex items-center space-x-2 mt-1">
              <h2 className="text-base sm:text-lg font-bold text-stone-900 flex items-center space-x-2">
                <Building className="w-4 h-4 text-[#C5A059]" />
                <span>{client.razao_social}</span>
              </h2>

              {navigationClients.length > 1 && currentClientIdx !== -1 && (
                <div className="flex items-center space-x-1 ml-2 bg-stone-100/90 rounded-xl p-0.5 border border-stone-200">
                  <button
                    type="button"
                    onClick={handlePrevClient}
                    className="p-1 rounded-lg hover:bg-white text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
                    title="Cliente anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-mono px-1 font-bold text-stone-600">
                    {currentClientIdx + 1}/{navigationClients.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextClient}
                    className="p-1 rounded-lg hover:bg-white text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
                    title="Próximo cliente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

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
          <div className="flex items-center flex-wrap gap-2 shrink-0">
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
                    <span>{profile?.role === 'admin' ? 'Ações de Validação (ADM)' : 'Status da Validação'}</span>
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
                  const isReviewFlagged =
                    !isItemValidated &&
                    Boolean(currentValidation?.pending_obligations?.includes(obrigacao));

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

                          {/* Botões Aprovado e Pendente para perfil Admin (Item 7) */}
                          {isAdmin ? (
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handleApproveObligation(obrigacao)}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer border shadow-2xs ${
                                  isItemValidated
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 hover:border-emerald-300'
                                }`}
                                title={`Aprovar apuração de ${obrigacao}`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Aprovado</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenPendingModal(obrigacao)}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer border shadow-2xs ${
                                  isReviewFlagged
                                    ? 'bg-rose-600 text-white border-rose-700 shadow-rose-200'
                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 hover:border-rose-300'
                                }`}
                                title={`Apontar pendência e notificar analista sobre ${obrigacao}`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Pendente</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 italic">Validação do Administrador</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 3. RODAPÉ INFORMATIVO */}
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
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer bg-white hover:bg-stone-100 text-stone-700 border border-stone-200"
            >
              <span>Fechar</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE PENDÊNCIA (Item 7) */}
      {pendingModalOpen && (
        <div className="fixed inset-0 z-60 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex items-center space-x-3 text-rose-600 mb-3">
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-stone-900">Confirmar Apontamento de Pendência</h4>
                <p className="text-xs text-stone-500">
                  {client.razao_social} • {selectedComp.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs text-stone-700 mb-4 space-y-1">
              <p>
                <strong>Obrigação:</strong> <span className="font-semibold text-rose-700">{pendingObligationTarget}</span>
              </p>
              <p className="text-[11px] text-stone-500">
                Ao confirmar, o status &quot;OK&quot; atual da apuração será <strong>desabilitado</strong> e uma notificação imediata será disparada para o analista responsável com os detalhes do cliente e da obrigação.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Motivo / Detalhes da Pendência (opcional):
              </label>
              <textarea
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                placeholder="Ex: Valor da guia diverge da folha, favor recalcular..."
                rows={3}
                className="w-full text-xs rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                disabled={pendingSubmitting}
                onClick={() => {
                  setPendingModalOpen(false);
                  setPendingObligationTarget(null);
                  setPendingReason('');
                }}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendingSubmitting}
                onClick={handleConfirmPending}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{pendingSubmitting ? 'Registrando...' : 'Confirmar Pendência'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
