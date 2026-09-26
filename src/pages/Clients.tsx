import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Building,
  Edit2,
  Trash2,
  Key,
  Shield,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CnpjCopyButton } from '../components/CnpjCopyButton';
import { CredentialSnippet } from '../components/CredentialSnippet';
import { ClientModal } from '../components/ClientModal';
import { isEntryOverdue } from '../utils/competencia';
import type { Client, FinancialEntry } from '../types';

export const Clients: React.FC = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');

  useEffect(() => {
    if (location.state?.accessDenied) {
      toast('Acesso restrito: apenas Administradores têm permissão para acessar o Módulo Financeiro.', 'error');
      // Limpa o state para não disparar novamente
      window.history.replaceState({}, document.title);
    }
  }, [location.state, toast]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Referência para o atalho de teclado Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleOpenFolder = async (client: Client) => {
    try {
      const queryParams = new URLSearchParams({
        name: client.razao_social,
        folder: client.numero_pasta || '',
      });

      let res: Response | null = null;

      // 1. Tenta comunicar prioritariamente com a ponte local na porta 39871
      try {
        res = await fetch(`http://127.0.0.1:39871/api/open-folder?${queryParams.toString()}`);
      } catch {
        // 2. Se falhar, tenta rota relativa local (útil para desenvolvimento local vite)
        try {
          res = await fetch(`/api/open-folder?${queryParams.toString()}`);
        } catch {
          res = null;
        }
      }

      if (!res) {
        toast('O serviço local de pastas não está ativo. Inicie o "iniciar_servico_pastas.bat" no computador.', 'error');
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.message || 'Não foi possível abrir a pasta no Google Drive.', 'error');
      } else {
        if (data.exactMatch) {
          toast(`Pasta aberta: ${client.razao_social}`, 'success');
        } else {
          toast(`Diretório de clientes aberto (pasta específica não localizada)`, 'info');
        }
      }
    } catch {
      toast('O serviço local de pastas não está ativo. Inicie o "iniciar_servico_pastas.bat" no computador.', 'error');
    }
  };

  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      // 1. Busca lista de clientes
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_credentials (*)
        `)
        .order('razao_social', { ascending: true });

      if (error) throw error;
      setClients(data as Client[]);

      // 2. Se for admin, busca lançamentos para mapear inadimplência
      if (isAdmin) {
        const { data: entriesData } = await supabase
          .from('financial_entries')
          .select('id, client_id, competencia, valor, status, observacao')
          .eq('status', 'À RECEBER');
        if (entriesData) {
          setFinancialEntries(entriesData as FinancialEntry[]);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar lista de clientes';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [isAdmin]);

  // Atalho Ctrl+K ou Cmd+K para focar no campo de busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mapeia quais clientes possuem débitos vencidos (inadimplentes) e detalhes das pendências
  const overdueClientsMap = useMemo(() => {
    const map = new Map<string, { totalOverdue: number; count: number; oldestComp: string }>();
    if (!isAdmin || financialEntries.length === 0) return map;

    financialEntries.forEach((entry) => {
      if (entry.client_id && isEntryOverdue(entry)) {
        const current = map.get(entry.client_id) || { totalOverdue: 0, count: 0, oldestComp: entry.competencia };
        current.totalOverdue += Number(entry.valor || 0);
        current.count += 1;
        map.set(entry.client_id, current);
      }
    });

    return map;
  }, [isAdmin, financialEntries]);

  // Filtragem dinâmica por Razão Social, CNPJ, CPF, SIEG ou Nº da pasta
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const cleanNumbersQuery = searchQuery.replace(/\D/g, '');

    return clients.filter((c) => {
      // Filtro especial de Inadimplência
      if (statusFilter === 'Inadimplente') {
        if (!overdueClientsMap.has(c.id)) return false;
      } else if (statusFilter !== 'Todos' && c.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const matchesRazao = c.razao_social?.toLowerCase().includes(q);
      const matchesSieg = c.sieg?.toLowerCase().includes(q);
      const matchesPasta = c.numero_pasta?.toLowerCase().includes(q);

      // Verificação por CNPJ e CPF (removendo máscaras para precisão)
      const rawCnpj = (c.cnpj || '').replace(/\D/g, '');
      const rawCpf = (c.cpf || '').replace(/\D/g, '');

      const matchesCnpj = cleanNumbersQuery && rawCnpj.includes(cleanNumbersQuery);
      const matchesCpf = cleanNumbersQuery && rawCpf.includes(cleanNumbersQuery);

      return matchesRazao || matchesSieg || matchesPasta || matchesCnpj || matchesCpf;
    });
  }, [clients, searchQuery, statusFilter, overdueClientsMap]);

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedClient(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) {
      toast('Apenas administradores podem excluir clientes.', 'error');
      return;
    }

    if (!window.confirm(`Deseja realmente excluir o cliente "${name}"? Esta ação removerá também as credenciais vinculadas.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast(`Cliente "${name}" excluído com sucesso.`, 'success');
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir cliente';
      toast(msg, 'error');
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2022] tracking-tight">
            Gestão de Clientes
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Consulta rápida de cadastros, controle de pastas, acessos fiscais e credenciais
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchClients}
            title="Recarregar clientes"
            className="p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C5A059]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-[#C5A059] hover:bg-[#9E7B35] text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Banner de Alerta para o Administrador sobre Inadimplência */}
      {isAdmin && overdueClientsMap.size > 0 && (
        <div className="bg-red-50/80 border border-red-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-red-100 text-red-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Atenção Financeira:</span>
              <span className="ml-1">
                Existe(m) <strong>{overdueClientsMap.size} cliente(s)</strong> com valores a receber que já excederam a data de vencimento.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Inadimplente' ? 'Todos' : 'Inadimplente')}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors shrink-0 shadow-xs"
          >
            {statusFilter === 'Inadimplente' ? 'Ver Todos os Clientes' : 'Filtrar Inadimplentes'}
          </button>
        </div>
      )}

      {/* Barra de Pesquisa e Filtros */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por Razão Social, CNPJ, CPF, SIEG ou Nº Pasta... (Ctrl + K)"
            className="block w-full pl-9 pr-24 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] text-gray-900 placeholder-gray-400"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <span className="hidden sm:inline-block text-[10px] font-mono font-medium text-gray-400 border border-gray-200 bg-gray-50 px-1.5 py-0.5 rounded">
              Ctrl + K
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-xs text-gray-500 shrink-0">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#C5A059]"
          >
            <option value="Todos">Todos</option>
            <option value="Ativo">Ativos</option>
            {isAdmin && overdueClientsMap.size > 0 && (
              <option value="Inadimplente">
                ⚠️ Inadimplentes ({overdueClientsMap.size})
              </option>
            )}
            <option value="Inativo">Inativos</option>
            <option value="Bloqueado">Bloqueados</option>
          </select>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nº / SIEG</th>
                <th className="py-3 px-4">Razão Social & Localidade</th>
                <th className="py-3 px-4">CNPJ & Regime</th>
                <th className="py-3 px-4">Cód. Acesso</th>
                <th className="py-3 px-4">Portais Fixos</th>
                <th className="py-3 px-4">Sistemas Extras</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs">Carregando dados dos clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    <Building className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <span>Nenhum cliente localizado para esta busca.</span>
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-amber-50/30 transition-colors">
                    {/* Nº & SIEG */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleOpenFolder(c)}
                            title={`Abrir pasta do cliente no Google Drive: G:\\Meu Drive\\00. MSCA\\00. CLIENTES\\${c.razao_social}`}
                            className="p-1 rounded-md text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 transition-colors cursor-pointer group flex items-center"
                          >
                            <FolderOpen className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                          </button>
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span className="font-semibold text-gray-900">
                          {c.numero_pasta || '-'}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1 flex items-center space-x-1">
                        <span>SIEG:</span>
                        <span
                          className={`font-semibold px-1 py-0.2 rounded text-[9px] ${
                            c.sieg === 'Sim'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {c.sieg === 'Sim' ? 'Sim' : 'Não'}
                        </span>
                      </div>
                    </td>

                    {/* Razão Social & Localidade */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="font-semibold text-gray-900 leading-snug">
                          {c.razao_social}
                        </span>

                        {/* Marcação Exclusiva para Administrador: Inadimplente */}
                        {isAdmin && overdueClientsMap.has(c.id) && (
                          <div
                            title={`Cliente Inadimplente: ${overdueClientsMap.get(c.id)?.count} parcela(s) vencida(s) totalizando ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(overdueClientsMap.get(c.id)?.totalOverdue || 0)}`}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-300 shadow-xs animate-pulse"
                          >
                            <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                            <span>Inadimplente</span>
                          </div>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenFolder(c)}
                            title={`Abrir pasta no Windows Explorer`}
                            className="text-gray-400 hover:text-amber-600 p-0.5 rounded hover:bg-amber-50 transition-colors"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {c.localidade || 'Localidade não informada'}
                      </div>
                    </td>

                    {/* CNPJ & Regime */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div>
                        <CnpjCopyButton cnpj={c.cnpj} />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 flex items-center space-x-1">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                          {c.regime_tributario || 'Não def.'}
                        </span>
                        {c.fator_r === 'Sim' && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                            Fator R
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Código de Acesso Simples */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {c.codigo_acesso_simples ? (
                        <div className="inline-flex items-center space-x-1 font-mono text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200">
                          <Key className="w-3 h-3 text-[#C5A059]" />
                          <span>{c.codigo_acesso_simples}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Portais Fixos (Prefeitura & Posto Fiscal) */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5 min-w-[140px]">
                        <CredentialSnippet
                          label="Prefeitura"
                          login={c.login_prefeitura}
                          senha={c.senha_prefeitura}
                        />
                        <CredentialSnippet
                          label="Posto Fiscal"
                          login={c.login_posto_fiscal}
                          senha={c.senha_posto_fiscal}
                        />
                      </div>
                    </td>

                    {/* Sistemas Extras */}
                    <td className="py-3.5 px-4">
                      {c.client_credentials && c.client_credentials.length > 0 ? (
                        <div className="space-y-1 min-w-[130px]">
                          {c.client_credentials.map((cred) => (
                            <CredentialSnippet
                              key={cred.id}
                              label={cred.sistema_nome}
                              login={cred.login}
                              senha={cred.senha}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.status === 'Ativo'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.status === 'Inativo'
                              ? 'bg-gray-100 text-gray-600 border border-gray-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {c.status}
                        </span>

                        {isAdmin && overdueClientsMap.has(c.id) && (
                          <span
                            title="Total vencido em aberto"
                            className="inline-flex items-center text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.2 rounded border border-red-200"
                          >
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                              overdueClientsMap.get(c.id)?.totalOverdue || 0
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(c)}
                          className="p-1.5 text-gray-500 hover:text-[#C5A059] rounded-md hover:bg-amber-50 transition-colors"
                          title="Editar cadastro do cliente"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id, c.razao_social)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                            title="Excluir cliente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="p-3 bg-gray-50/70 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div>
            Total exibido: <span className="font-semibold text-gray-800">{filteredClients.length}</span>{' '}
            {filteredClients.length === 1 ? 'cliente' : 'clientes'}
          </div>
          <div className="flex items-center space-x-1 text-[11px] text-gray-400">
            <Shield className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Dados protegidos por RLS</span>
          </div>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <ClientModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchClients}
          clientToEdit={selectedClient}
        />
      )}
    </div>
  );
};
