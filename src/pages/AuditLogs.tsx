import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  Eye,
  ArrowUpRight,
  Edit3,
  Trash2,
  Lock,
  FileText,
  AlertTriangle,
  X,
  Calendar,
  Building,
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import type { AuditLog } from '../types';

export const AuditLogs: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('TODOS');
  const [entityFilter, setEntityFilter] = useState<string>('TODOS');
  const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD

  // Modal de Detalhes da Alteração (JSON diff)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar logs de auditoria';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Formatação amigável de Data e Hora
  const formatDateTime = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(d);
    } catch {
      return isoDate;
    }
  };

  // Filtragem dos logs
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return logs.filter((log) => {
      // Filtro de Ação
      if (actionFilter !== 'TODOS' && log.action !== actionFilter) {
        return false;
      }

      // Filtro de Entidade
      if (entityFilter !== 'TODOS' && log.entity !== entityFilter) {
        return false;
      }

      // Filtro de Data
      if (dateFilter) {
        const logDate = log.created_at.split('T')[0];
        if (logDate !== dateFilter) return false;
      }

      // Busca textual por usuário, e-mail, nome da entidade afetada ou campos alterados
      if (!q) return true;

      const matchUser =
        log.user_name?.toLowerCase().includes(q) || log.user_email?.toLowerCase().includes(q);
      const matchEntityName = log.entity_name?.toLowerCase().includes(q);
      const matchChanges = log.changes ? JSON.stringify(log.changes).toLowerCase().includes(q) : false;

      return matchUser || matchEntityName || matchChanges;
    });
  }, [logs, searchQuery, actionFilter, entityFilter, dateFilter]);

  // Badges e Estilos visuais para ações
  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowUpRight className="w-3 h-3" />
            <span>INSERÇÃO</span>
          </span>
        );
      case 'UPDATE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Edit3 className="w-3 h-3" />
            <span>EDIÇÃO</span>
          </span>
        );
      case 'DELETE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <Trash2 className="w-3 h-3" />
            <span>EXCLUSÃO</span>
          </span>
        );
      case 'ACCESS_DENIED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3" />
            <span>ACESSO BLOQUEADO</span>
          </span>
        );
      case 'BATCH_INSERT':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Layers className="w-3 h-3" />
            <span>LANÇAMENTO EM LOTE</span>
          </span>
        );
      case 'PASSWORD_CHANGE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
            <Lock className="w-3 h-3" />
            <span>ALTERAÇÃO DE SENHA</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            {action}
          </span>
        );
    }
  };

  const getEntityBadge = (entity: string) => {
    switch (entity) {
      case 'CLIENT':
        return (
          <span className="inline-flex items-center space-x-1 text-gray-700 font-semibold">
            <Building className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Cliente</span>
          </span>
        );
      case 'CREDENTIAL':
        return (
          <span className="inline-flex items-center space-x-1 text-purple-700 font-semibold">
            <Lock className="w-3.5 h-3.5 text-purple-600" />
            <span>Credencial / Senha</span>
          </span>
        );
      case 'FINANCIAL_ENTRY':
        return (
          <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>Entrada Financeira</span>
          </span>
        );
      case 'FINANCIAL_EXPENSE':
        return (
          <span className="inline-flex items-center space-x-1 text-rose-700 font-semibold">
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>Saída / Pagamento</span>
          </span>
        );
      case 'SECURITY':
        return (
          <span className="inline-flex items-center space-x-1 text-amber-800 font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Segurança</span>
          </span>
        );
      case 'USER':
        return (
          <span className="inline-flex items-center space-x-1 text-indigo-700 font-semibold">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            <span>Conta de Usuário</span>
          </span>
        );
      default:
        return <span className="text-gray-700">{entity}</span>;
    }
  };

  // Contadores de estatísticas rápidas
  const stats = useMemo(() => {
    const total = logs.length;
    const inserts = logs.filter((l) => l.action === 'INSERT').length;
    const updates = logs.filter((l) => l.action === 'UPDATE').length;
    const deletes = logs.filter((l) => l.action === 'DELETE').length;
    const blocked = logs.filter((l) => l.action === 'ACCESS_DENIED').length;
    return { total, inserts, updates, deletes, blocked };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-[#1E2022] tracking-tight">
              Auditoria & Logs de Atividades
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              Exclusivo Admin
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Rastreamento detalhado de alterações cadastrais, credenciais de portais, exclusões e acessos de segurança
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Logs</span>
          </button>
        </div>
      </div>

      {/* Cards de Resumo Operacional */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total de Logs</div>
          <div className="text-xl font-bold text-[#1E2022] mt-0.5">{stats.total}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-xs">
          <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Inserções</div>
          <div className="text-xl font-bold text-emerald-700 mt-0.5">{stats.inserts}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-xs">
          <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Edições</div>
          <div className="text-xl font-bold text-blue-700 mt-0.5">{stats.updates}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-xs">
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Exclusões</div>
          <div className="text-xl font-bold text-rose-700 mt-0.5">{stats.deletes}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Bloqueios</div>
          <div className="text-xl font-bold text-amber-800 mt-0.5">{stats.blocked}</div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Busca Textual */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por colaborador, cliente, entidade ou campo alterado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filtro por Ação */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-gray-500 font-medium">Ação:</span>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 focus:ring-1 focus:ring-[#C5A059]"
              >
                <option value="TODOS">Todas as ações</option>
                <option value="INSERT">Inserção</option>
                <option value="BATCH_INSERT">Lançamento em Lote</option>
                <option value="UPDATE">Edição</option>
                <option value="DELETE">Exclusão</option>
                <option value="PASSWORD_CHANGE">Alteração de Senha</option>
                <option value="ACCESS_DENIED">Acesso Bloqueado</option>
              </select>
            </div>

            {/* Filtro por Entidade */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-gray-500 font-medium">Módulo/Entidade:</span>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 focus:ring-1 focus:ring-[#C5A059]"
              >
                <option value="TODOS">Todos os módulos</option>
                <option value="CLIENT">Clientes (Dados Cadastrais)</option>
                <option value="CREDENTIAL">Credenciais & Senhas</option>
                <option value="USER">Contas de Usuário</option>
                <option value="SECURITY">Segurança & Bloqueios</option>
              </select>
            </div>

            {/* Filtro por Data */}
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-800 focus:ring-1 focus:ring-[#C5A059]"
                title="Filtrar por data exata"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  className="text-gray-400 hover:text-gray-600 text-xs px-1"
                  title="Limpar filtro de data"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Logs de Auditoria */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
              <thead className="sticky top-16 z-20">
                <tr className="bg-stone-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600 uppercase tracking-wider shadow-xs">
                  <th className="py-3 px-4 bg-stone-50">Data / Hora</th>
                  <th className="py-3 px-4 bg-stone-50">Usuário / Colaborador</th>
                  <th className="py-3 px-4 text-center bg-stone-50">Ação</th>
                  <th className="py-3 px-4 bg-stone-50">Módulo</th>
                  <th className="py-3 px-4 bg-stone-50">Item Afetado</th>
                  <th className="py-3 px-4 bg-stone-50">Resumo das Alterações</th>
                  <th className="py-3 px-4 text-right bg-stone-50">Detalhes</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs">Carregando trilha de auditoria...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <span>Nenhum registro de auditoria localizado para os filtros informados.</span>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const changedKeys = log.changes ? Object.keys(log.changes) : [];

                  return (
                    <tr key={log.id} className="hover:bg-amber-50/30 transition-colors">
                      {/* Data / Hora */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap text-gray-600">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{formatDateTime(log.created_at)}</span>
                        </div>
                      </td>

                      {/* Usuário / Colaborador */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-[10px]">
                            {(log.user_name || log.user_email || 'U')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 leading-tight">
                              {log.user_name || 'Sistema / Desconhecido'}
                            </div>
                            {log.user_email && (
                              <div className="text-[10px] text-gray-400">{log.user_email}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Ação */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      {/* Módulo / Entidade */}
                      <td className="py-3.5 px-4 whitespace-nowrap">{getEntityBadge(log.entity)}</td>

                      {/* Item Afetado */}
                      <td className="py-3.5 px-4 font-medium text-gray-900 max-w-[200px] truncate" title={log.entity_name || ''}>
                        {log.entity_name || <span className="text-gray-300">-</span>}
                      </td>

                      {/* Resumo de Campos Alterados */}
                      <td className="py-3.5 px-4">
                        {changedKeys.length === 0 ? (
                          <span className="text-gray-400 italic">Sem detalhes de campos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {changedKeys.slice(0, 3).map((k) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-mono border border-gray-200"
                              >
                                {k}
                              </span>
                            ))}
                            {changedKeys.length > 3 && (
                              <span className="text-[10px] text-gray-400 self-center">
                                +{changedKeys.length - 3} campos
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Detalhes (Ação) */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {log.changes ? (
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#1E2022] hover:bg-amber-100 hover:text-[#C5A059] transition-colors border border-gray-200 bg-gray-50"
                            title="Ver comparativo completo de alterações"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Diff</span>
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="p-3 bg-gray-50/70 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div>
            Total de registros exibidos: <span className="font-semibold text-gray-800">{filteredLogs.length}</span>
          </div>
          <div className="text-[11px] text-gray-400">
            Trilha protegida por Row-Level Security (RLS)
          </div>
        </div>
      </div>

      {/* Modal de Detalhes da Alteração (Diff Comparativo) */}
      {selectedLog && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-4 bg-[#1E2022] text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-[#C5A059]" />
                <div>
                  <h3 className="text-sm font-bold">Detalhes da Auditoria</h3>
                  <p className="text-[10px] text-gray-400">
                    {formatDateTime(selectedLog.created_at)} • Operação: <strong>{selectedLog.action}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadados */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Responsável:</span>
                <strong className="text-gray-900">{selectedLog.user_name || 'Desconhecido'}</strong>{' '}
                <span className="text-gray-500">({selectedLog.user_email || 'sem e-mail'})</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Registro Afetado:</span>
                <strong className="text-gray-900">{selectedLog.entity_name || selectedLog.entity}</strong>
              </div>
            </div>

            {/* Comparativo de Campos */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Campos Modificados / Registrados:
              </div>

              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {Object.entries(selectedLog.changes).map(([campo, diff]) => {
                    const isInsert = selectedLog.action === 'INSERT';
                    const isDelete = selectedLog.action === 'DELETE';

                    const oldStr = diff.old !== undefined ? String(diff.old) : '-';
                    const newStr = diff.new !== undefined ? String(diff.new) : '-';

                    return (
                      <div key={campo} className="p-3 bg-white text-xs space-y-1">
                        <div className="font-mono font-bold text-[#1E2022] flex items-center justify-between">
                          <span>{campo}</span>
                        </div>

                        {isInsert ? (
                          <div className="text-emerald-700 bg-emerald-50/70 p-2 rounded border border-emerald-200 font-mono text-[11px] break-all">
                            Valor inicial: <strong>{newStr}</strong>
                          </div>
                        ) : isDelete ? (
                          <div className="text-rose-700 bg-rose-50/70 p-2 rounded border border-rose-200 font-mono text-[11px] break-all">
                            Valor excluído: <strong>{oldStr}</strong>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                            <div className="p-2 rounded bg-rose-50/60 border border-rose-200 text-rose-800 break-all">
                              <span className="text-[10px] uppercase font-semibold text-rose-600 block mb-0.5">
                                Antes:
                              </span>
                              {oldStr}
                            </div>
                            <div className="p-2 rounded bg-emerald-50/60 border border-emerald-200 text-emerald-800 break-all">
                              <span className="text-[10px] uppercase font-semibold text-emerald-600 block mb-0.5">
                                Depois:
                              </span>
                              {newStr}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic p-4 text-center">
                  Nenhuma modificação detalhada registrada.
                </div>
              )}
            </div>

            {/* Footer do Modal */}
            <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
