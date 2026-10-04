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
  AlertTriangle,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { RawCnpjCopyButton } from './RawCnpjCopyButton';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { apuracaoValidationService, buildValidationKey } from '../services/apuracaoValidationService';
import { notificationService } from '../services/notificationService';
import { FISCAL_OBLIGATIONS, type FiscalRegimeType } from '../constants/fiscalObligations';
import type { Client, ClientApuracaoValidation } from '../types';

interface ApuracaoDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  obrigacaoName: string;
  regime: string;
  competencia: string;
  clients: Client[];
  inputValues: Record<string, string>;
  validations?: Record<string, ClientApuracaoValidation>;
  onStatusChange: (client: Client, obrigacao: string, newValue: string) => void;
  isObligationEnabled: (client: Client, obrigacao: string) => boolean;
  initialShowPendingOnly?: boolean;
  onRefreshData?: () => void;
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
  validations = {},
  onStatusChange,
  isObligationEnabled,
  initialShowPendingOnly = false,
  onRefreshData,
}) => {
  const { toast } = useToast();
  const { profile, user, role, isAdmin: authIsAdmin } = useAuth();
  const isAdmin = authIsAdmin || profile?.role === 'admin' || role === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterNeedsReviewOnly, setFilterNeedsReviewOnly] = useState(initialShowPendingOnly);
  const [filterApuradosOnly, setFilterApuradosOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('razao_social');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estados para Modal de Apontamento de Pendência do ADM
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingClientTarget, setPendingClientTarget] = useState<Client | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [pendingSubmitting, setPendingSubmitting] = useState(false);

  if (!isOpen) return null;

  // Auxiliar para checar se a obrigação do cliente foi validada/aprovada pelo ADM
  // Estritamente vinculada à existência da apuração ativa: se a apuração foi desfeita/não está OK, não pode ser considerada validada
  const checkClientValidated = (c: Client) => {
    const obKey = `${c.id}::${obrigacaoName}::${competencia}`;
    const obKeyLegacy = `${c.id}::${obrigacaoName}`;
    const val = inputValues[obKey] !== undefined ? inputValues[obKey] : (inputValues[obKeyLegacy] || '');
    const isOk = (val || '').trim().toUpperCase() === 'OK';
    if (!isOk) return false;

    const k = buildValidationKey(c.id, competencia);
    const v = validations[k];
    if (!v) return false;
    if (v.status === 'APPROVED') return true;
    if (v.validated_obligations && Array.isArray(v.validated_obligations)) {
      if (v.validated_obligations.includes(obrigacaoName)) return true;
      const obNorm = (obrigacaoName || '').trim().toUpperCase();
      if (obNorm === 'PRO LAB / INSS') {
        return (
          v.validated_obligations.includes('GUIA INSS') ||
          v.validated_obligations.includes('PRO-LAB. / FOPAG')
        );
      }
    }
    return false;
  };

  // Auxiliar para checar se cliente possui pendência apontada na obrigação/competência
  // Mutuamente exclusivo com a validação/aprovação: se já foi validado/aprovado, a pendência anterior é ignorada
  const checkClientNeedsReview = (c: Client) => {
    if (checkClientValidated(c)) return false;

    const k = buildValidationKey(c.id, competencia);
    const v = validations[k];
    if (!v || v.status !== 'NEEDS_REVIEW') return false;
    if (v.pending_obligations && v.pending_obligations.length > 0) {
      if (v.pending_obligations.includes(obrigacaoName)) return true;
      const obNorm = (obrigacaoName || '').trim().toUpperCase();
      if (obNorm === 'PRO LAB / INSS') {
        return (
          v.pending_obligations.includes('GUIA INSS') ||
          v.pending_obligations.includes('PRO-LAB. / FOPAG')
        );
      }
      return false;
    }
    return true;
  };

  // Filtrar clientes que necessitam desta apuração específica (obrigação habilitada)
  // Caso nenhum cliente do regime possua a lista explicitamente cadastrada para essa obrigação,
  // exibe todos os clientes do regime para permitir a apuração consistente (comportamento idêntico ao Simples Nacional)
  const enabledClients = clients.filter((c) => isObligationEnabled(c, obrigacaoName));
  const applicableClients = enabledClients.length > 0 ? enabledClients : clients;

  // Clientes com pendência apontada
  const clientsWithReview = applicableClients.filter(checkClientNeedsReview);

  // Clientes com apuração realizada (OK)
  const clientsApurados = applicableClients.filter((c) => {
    const key = `${c.id}::${obrigacaoName}::${competencia}`;
    const keyLegacy = `${c.id}::${obrigacaoName}`;
    const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
    return (val || '').trim().toUpperCase() === 'OK';
  });

  // Função utilitária para normalizar strings (remover acentos e minúsculas)
  const normalizeText = (text?: string | null) =>
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Filtragem por busca textual, pendência, apurados e ordenação das colunas
  const filteredClients = useMemo(() => {
    const rawTerm = searchTerm.trim();
    const normTerm = normalizeText(rawTerm);
    const cleanNumbers = rawTerm.replace(/\D/g, '');

    // 1. Filtro
    const searched = applicableClients.filter((c) => {
      if (filterNeedsReviewOnly && !checkClientNeedsReview(c)) {
        return false;
      }

      if (filterApuradosOnly) {
        const key = `${c.id}::${obrigacaoName}::${competencia}`;
        const keyLegacy = `${c.id}::${obrigacaoName}`;
        const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
        if ((val || '').trim().toUpperCase() !== 'OK') {
          return false;
        }
      }

      if (!normTerm && !cleanNumbers) return true;

      const normRazao = normalizeText(c.razao_social);
      const normLoc = normalizeText(c.localidade);
      const normPasta = normalizeText(c.numero_pasta);
      const rawCnpj = (c.cnpj || '').replace(/\D/g, '');
      const rawCpf = (c.cpf || '').replace(/\D/g, '');

      const matchesRazao = normTerm ? normRazao.includes(normTerm) : false;
      const matchesLoc = normTerm ? normLoc.includes(normTerm) : false;
      const matchesPasta = normTerm ? normPasta.includes(normTerm) : false;
      const matchesCnpj = cleanNumbers ? rawCnpj.includes(cleanNumbers) : false;
      const matchesCpf = cleanNumbers ? rawCpf.includes(cleanNumbers) : false;

      return matchesRazao || matchesLoc || matchesPasta || matchesCnpj || matchesCpf;
    });

    // 2. Ordenação
    return [...searched].sort((a, b) => {
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
  }, [
    applicableClients,
    filterNeedsReviewOnly,
    filterApuradosOnly,
    searchTerm,
    sortField,
    sortDirection,
    inputValues,
    obrigacaoName,
    competencia,
  ]);

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

  const [confirmUnmarkModalOpen, setConfirmUnmarkModalOpen] = useState(false);

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

  // ADM: Aprovar individualmente a obrigação do cliente
  const handleApproveClientObligation = async (client: Client) => {
    if (!isAdmin) {
      toast('Apenas administradores podem homologar apurações.', 'info');
      return;
    }

    const clientRegime = client.regime_tributario || regime;
    const clientObligations =
      (clientRegime && FISCAL_OBLIGATIONS[clientRegime as FiscalRegimeType]) || [obrigacaoName];

    await apuracaoValidationService.toggleObligationValidation({
      clientId: client.id,
      competencia,
      regime: clientRegime,
      obrigacao: obrigacaoName,
      allClientObligations: clientObligations,
      validated: true,
      adminId: user?.id,
      adminName: profile?.full_name || 'Gestor ADM',
    });

    toast(`${client.razao_social}: Obrigação "${obrigacaoName}" aprovada!`, 'success');
    onRefreshData?.();
  };

  // ADM: Abrir modal de apontamento de pendência
  const handleOpenPendingModal = (client: Client) => {
    if (!isAdmin) {
      toast('Apenas administradores podem apontar pendências.', 'info');
      return;
    }
    setPendingClientTarget(client);
    setPendingReason('');
    setPendingModalOpen(true);
  };

  // ADM: Confirmar pendência para o cliente
  const handleConfirmPending = async () => {
    if (!pendingClientTarget) return;
    setPendingSubmitting(true);
    try {
      const targetClient = pendingClientTarget;
      const clientRegime = targetClient.regime_tributario || regime;
      const clientObligations =
        (clientRegime && FISCAL_OBLIGATIONS[clientRegime as FiscalRegimeType]) || [obrigacaoName];

      // 1. Desabilita o status OK da apuração
      onStatusChange(targetClient, obrigacaoName, '');

      // 2. Desvalida a obrigação
      await apuracaoValidationService.toggleObligationValidation({
        clientId: targetClient.id,
        competencia,
        regime: clientRegime,
        obrigacao: obrigacaoName,
        allClientObligations: clientObligations,
        validated: false,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
      });

      // 3. Marca como NEEDS_REVIEW no registro de validação
      await apuracaoValidationService.setValidationNeedsReview({
        clientId: targetClient.id,
        competencia,
        regime: clientRegime,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
        reviewNotes: pendingReason.trim() || `Pendência apontada na obrigação: ${obrigacaoName}`,
        pendingObligations: [obrigacaoName],
      });

      // 4. Dispara notificação imediata para o operador/analista responsável
      await notificationService.notifyOperatorReviewNeeded({
        client_id: targetClient.id,
        client_name: targetClient.razao_social,
        competencia,
        regime: clientRegime,
        admin_id: user?.id,
        admin_name: profile?.full_name || 'Gestor ADM',
        review_notes: pendingReason.trim() || `Pendência apontada na obrigação: ${obrigacaoName}`,
        pending_obligations: [obrigacaoName],
      });

      toast(`Pendência registrada para ${targetClient.razao_social} e notificação enviada!`, 'info');
      setPendingModalOpen(false);
      setPendingClientTarget(null);
      setPendingReason('');
      onRefreshData?.();
    } catch {
      toast('Erro ao registrar pendência.', 'error');
    } finally {
      setPendingSubmitting(false);
    }
  };

  // ADM: Aprovar todos os clientes visíveis que já foram apurados (com status OK)
  const handleApproveAllVisibleOk = async () => {
    if (!isAdmin) return;
    const okClients = filteredClients.filter((c) => {
      const key = `${c.id}::${obrigacaoName}::${competencia}`;
      const keyLegacy = `${c.id}::${obrigacaoName}`;
      const val = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
      return (val || '').trim().toUpperCase() === 'OK';
    });

    if (okClients.length === 0) {
      toast('Nenhum cliente com apuração realizada (OK) para aprovar.', 'info');
      return;
    }

    for (const c of okClients) {
      const clientRegime = c.regime_tributario || regime;
      const clientObligations =
        (clientRegime && FISCAL_OBLIGATIONS[clientRegime as FiscalRegimeType]) || [obrigacaoName];

      await apuracaoValidationService.toggleObligationValidation({
        clientId: c.id,
        competencia,
        regime: clientRegime,
        obrigacao: obrigacaoName,
        allClientObligations: clientObligations,
        validated: true,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
      });
    }

    toast(`${okClients.length} clientes aprovados com sucesso pelo Administrador!`, 'success');
    onRefreshData?.();
  };

  const handlePromptUnmarkAll = () => {
    // Quantos estão atualmente marcados como OK ou preenchidos?
    const filledCount = filteredClients.filter((c) => {
      const key = `${c.id}::${obrigacaoName}::${competencia}`;
      const keyLegacy = `${c.id}::${obrigacaoName}`;
      const currentVal = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
      return (currentVal || '').trim() !== '';
    }).length;

    if (filledCount === 0) {
      toast('Nenhum cliente visível possui status preenchido para desmarcar.', 'info');
      return;
    }

    setConfirmUnmarkModalOpen(true);
  };

  const handleConfirmUnmarkAll = () => {
    filteredClients.forEach((c) => {
      const key = `${c.id}::${obrigacaoName}::${competencia}`;
      const keyLegacy = `${c.id}::${obrigacaoName}`;
      const currentVal = inputValues[key] !== undefined ? inputValues[key] : (inputValues[keyLegacy] || '');
      if ((currentVal || '').trim() !== '') {
        onStatusChange(c, obrigacaoName, '');
      }
    });
    setConfirmUnmarkModalOpen(false);
    toast(`Status de ${filteredClients.length} clientes visíveis desmarcado com sucesso!`, 'info');
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

        {/* Alerta de Pendência Apontada pelo ADM nesta obrigação */}
        {clientsWithReview.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Atenção:</strong> Existem <strong>{clientsWithReview.length}</strong> cliente(s) com apontamento de pendência nesta obrigação.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFilterNeedsReviewOnly((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer border ${
                filterNeedsReviewOnly
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-100'
              }`}
            >
              {filterNeedsReviewOnly ? 'Exibir Todos os Clientes' : 'Filtrar Clientes com Pendência'}
            </button>
          </div>
        )}

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

          <div className="flex items-center flex-wrap gap-2">
            {/* Filtro Rápido para ADM: Somente Apurados (OK) */}
            {isAdmin && clientsApurados.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterApuradosOnly((prev) => !prev)}
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border shadow-2xs ${
                  filterApuradosOnly
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                }`}
                title="Filtrar apenas clientes com apuração já realizada (OK) para validação"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Apurados ({clientsApurados.length})</span>
              </button>
            )}

            {/* Ação em Lote do ADM: Homologar/Aprovar Todos os Apurados Visíveis */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleApproveAllVisibleOk}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Aprovar e homologar como Administrador todos os clientes com apuração OK visíveis na lista"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Aprovar Todos Apurados</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleMarkAllVisibleOk}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Marcar visíveis como OK</span>
            </button>

            <button
              type="button"
              onClick={handlePromptUnmarkAll}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
              title="Limpar o status dos clientes visíveis (solicitará confirmação)"
            >
              <X className="w-3.5 h-3.5 text-stone-500 group-hover:text-rose-600" />
              <span>Desmarcar todos</span>
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

                {/* Validação / Homologação (ADM) */}
                {isAdmin && (
                  <th className="py-1.5 px-3 text-right whitespace-nowrap">
                    <span className="font-bold text-emerald-800">Homologação (ADM)</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="py-10 text-center text-stone-400">
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
                  const isReviewFlagged = checkClientNeedsReview(client);

                  const isClientVal = checkClientValidated(client);

                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-amber-50/20 transition-colors ${
                        isReviewFlagged
                          ? 'bg-rose-50/40 border-l-4 border-l-rose-500'
                          : isClientVal
                          ? 'bg-emerald-50/25'
                          : isOk
                          ? 'bg-emerald-50/10'
                          : ''
                      }`}
                    >
                      {/* Domínio */}
                      <td className="py-1 px-3 text-center font-mono font-bold text-stone-800 text-[10px]">
                        {client.numero_pasta || '-'}
                      </td>

                      {/* Razão Social */}
                      <td className="py-1 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-stone-900 leading-tight text-xs">
                            {client.razao_social}
                          </span>
                          {isClientVal && (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded-full">
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Validado</span>
                            </span>
                          )}
                          {isReviewFlagged && (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.2 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                              <span>Pendência Apontada</span>
                            </span>
                          )}
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

                      {/* Coluna de Homologação / Validação para Perfil ADM com Botões Diretos Aprovado / Pendente */}
                      {isAdmin && (
                        <td className="py-1 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end space-x-1.5">
                            {/* Botão Aprovado */}
                            <button
                              type="button"
                              onClick={() => handleApproveClientObligation(client)}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer border shadow-2xs ${
                                isClientVal
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 hover:border-emerald-300'
                              }`}
                              title={`Homologar e aprovar ${obrigacaoName} para ${client.razao_social}`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Aprovado</span>
                            </button>

                            {/* Botão Pendente */}
                            <button
                              type="button"
                              onClick={() => handleOpenPendingModal(client)}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer border shadow-2xs ${
                                isReviewFlagged
                                  ? 'bg-rose-600 text-white border-rose-700 shadow-rose-200'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 hover:border-rose-300'
                              }`}
                              title={`Apontar pendência e notificar analista responsável sobre ${client.razao_social}`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Pendente</span>
                            </button>
                          </div>
                        </td>
                      )}
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
            className="p-1 px-3 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/60 transition-colors text-xs font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO PARA DESMARCAR TODOS */}
      {confirmUnmarkModalOpen && (
        <div className="fixed inset-0 z-60 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-stone-900">
                  Tem certeza que deseja desmarcar todos?
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Esta ação limpará o status de apuração de{' '}
                  <strong className="text-stone-700">{filteredClients.length}</strong> clientes visíveis na obrigação{' '}
                  <strong className="text-stone-700">{obrigacaoName}</strong> ({competencia.toUpperCase()}), tornando-os <strong>pendentes</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setConfirmUnmarkModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmUnmarkAll}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer inline-flex items-center space-x-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Sim, Desmarcar Todos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE APONTAMENTO DE PENDÊNCIA DO ADM */}
      {pendingModalOpen && pendingClientTarget && (
        <div className="fixed inset-0 z-60 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-stone-900">Confirmar Apontamento de Pendência</h4>
                <p className="text-xs text-stone-500">
                  {pendingClientTarget.razao_social} • {competencia.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs text-stone-700 mb-4 space-y-1">
              <p>
                <strong>Obrigação:</strong> <span className="font-semibold text-rose-700">{obrigacaoName}</span>
              </p>
              <p className="text-[11px] text-stone-500">
                Ao confirmar, o status &quot;OK&quot; atual da apuração será <strong>desabilitado</strong> e uma notificação imediata será disparada para o operador responsável com os detalhes do cliente e da obrigação.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Motivo / Detalhes da Pendência (opcional):
              </label>
              <textarea
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                placeholder="Ex: Valor diverge da folha, favor recalcular..."
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
                  setPendingClientTarget(null);
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
