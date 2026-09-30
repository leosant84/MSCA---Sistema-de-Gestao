import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { notificationService } from '../services/notificationService';
import { apuracaoValidationService } from '../services/apuracaoValidationService';
import type { Client } from '../types';

interface ApuracaoValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  competencia: string;
  regime: string;
  obligations: string[];
  onValidationSuccess?: () => void;
}

export const ApuracaoValidationModal: React.FC<ApuracaoValidationModalProps> = ({
  isOpen,
  onClose,
  client,
  competencia,
  regime,
  obligations,
  onValidationSuccess,
}) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<'view' | 'review'>('view');
  const [selectedPendingObligations, setSelectedPendingObligations] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !client) return null;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await apuracaoValidationService.setValidationApproved({
        clientId: client.id,
        competencia,
        regime,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
        allObligations: obligations,
      });

      await notificationService.notifyOperatorApproved({
        client_id: client.id,
        client_name: client.razao_social,
        competencia,
        regime,
        admin_id: user?.id,
        admin_name: profile?.full_name || 'Gestor ADM',
      });

      toast(`Apuração de ${client.razao_social} aprovada com sucesso!`, 'success');
      onValidationSuccess?.();
      onClose();
    } catch {
      toast('Erro ao aprovar apuração.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleObligation = (ob: string) => {
    setSelectedPendingObligations((prev) =>
      prev.includes(ob) ? prev.filter((item) => item !== ob) : [...prev, ob]
    );
  };

  const handleSendReview = async () => {
    if (!reviewNotes.trim()) {
      toast('Por favor, descreva as observações/motivo da revisão apontada.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await apuracaoValidationService.setValidationNeedsReview({
        clientId: client.id,
        competencia,
        regime,
        adminId: user?.id,
        adminName: profile?.full_name || 'Gestor ADM',
        reviewNotes: reviewNotes.trim(),
        pendingObligations: selectedPendingObligations,
      });

      await notificationService.notifyOperatorReviewNeeded({
        client_id: client.id,
        client_name: client.razao_social,
        competencia,
        regime,
        admin_id: user?.id,
        admin_name: profile?.full_name || 'Gestor ADM',
        review_notes: reviewNotes.trim(),
        pending_obligations: selectedPendingObligations,
      });

      toast('Apontamento de revisão enviado ao analista com sucesso!', 'info');
      onValidationSuccess?.();
      onClose();
    } catch {
      toast('Erro ao enviar apontamento de revisão.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200/80 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-5 px-6 border-b border-stone-100 bg-gradient-to-r from-stone-50 via-white to-amber-50/40 flex items-start justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-[#C5A059] flex items-center justify-center border border-amber-200/60 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#A67C2E] uppercase tracking-wider">
                Validação de Apuração ADM
              </div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">
                {client.razao_social}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-stone-500 mt-0.5">
                <span className="font-mono bg-amber-100 text-amber-900 px-2 py-0.2 rounded-md text-[11px] font-semibold">
                  {competencia}
                </span>
                <span>•</span>
                <span>{regime}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4 text-xs">
          {mode === 'view' ? (
            <>
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-800 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-emerald-900 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Apuração 100% Finalizada pelo Analista</span>
                </div>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Todas as etapas de apuração obrigatórias deste cliente foram sinalizadas como OK no mês {competencia}. Você pode homologar a apuração ou solicitar ajustes/revisões específicas.
                </p>
              </div>

              {/* Lista de etapas apuradas */}
              <div>
                <span className="font-bold text-stone-700 block mb-2 uppercase text-[10px] tracking-wider">
                  Etapas Concluídas no Mês ({obligations.length}):
                </span>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {obligations.map((ob) => (
                    <div
                      key={ob}
                      className="p-2 rounded-xl bg-stone-50 border border-stone-200/70 flex items-center space-x-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-[11px] font-semibold text-stone-700 truncate" title={ob}>
                        {ob}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões de Ação do ADM */}
              <div className="pt-3 border-t border-stone-100 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setMode('review')}
                  className="px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-all cursor-pointer shadow-2xs inline-flex items-center space-x-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Apontar Revisão / Pendência</span>
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all cursor-pointer shadow-sm inline-flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aprovar Apuração</span>
                </button>
              </div>
            </>
          ) : (
            /* Modo de Apontamento de Revisão */
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
                <div className="font-bold text-xs flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Apontar Revisão para o Analista</span>
                </div>
                <p className="text-[11px] text-rose-700 mt-1">
                  Selecione quais etapas necessitam de correção e insira as orientações detalhadas. O analista receberá uma notificação instantânea no Sininho.
                </p>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1 text-[11px] uppercase tracking-wider">
                  Etapas a serem revistas (opcional selecionar):
                </label>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {obligations.map((ob) => {
                    const isSelected = selectedPendingObligations.includes(ob);
                    return (
                      <button
                        key={ob}
                        type="button"
                        onClick={() => handleToggleObligation(ob)}
                        className={`p-2 rounded-xl border text-left transition-all flex items-center justify-between text-[11px] cursor-pointer ${
                          isSelected
                            ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                            : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <span className="truncate">{ob}</span>
                        {isSelected && <span className="text-rose-600 text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1 text-[11px] uppercase tracking-wider">
                  Observações / Motivo da Revisão: *
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Ex: Valor da guia difere do extrato bancário, recalcular DAS com novo faturamento..."
                  rows={3}
                  className="w-full p-2.5 text-xs border border-stone-200 rounded-xl focus:ring-1 focus:ring-[#C5A059] focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-3 py-1.5 text-stone-500 hover:text-stone-800 text-xs font-semibold cursor-pointer"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleSendReview}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all cursor-pointer shadow-sm inline-flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Apontamento ao Analista</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
