import React, { useState } from 'react';
import { X, Plus, Trash2, Shield, Globe, Building, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createClientFoldersInDrive } from '../services/googleDriveService';
import { FISCAL_OBLIGATIONS } from '../constants/fiscalObligations';
import type { FiscalRegimeType } from '../constants/fiscalObligations';
import type { Client } from '../types';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clientToEdit?: Client | null;
}

interface TempCredential {
  id?: string;
  sistema_nome: string;
  login: string;
  senha: string;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientToEdit,
}) => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClient = async () => {
    if (!isAdmin) {
      toast('Apenas administradores podem excluir clientes.', 'error');
      return;
    }

    if (!clientToEdit?.id) return;

    const confirmed = window.confirm(
      `Deseja realmente excluir o cliente "${clientToEdit.razao_social}"?\nEsta ação é irreversível e removerá também as credenciais vinculadas.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientToEdit.id);
      if (error) throw error;

      toast(`Cliente "${clientToEdit.razao_social}" excluído com sucesso.`, 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir cliente.';
      toast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Formata data do banco (AAAA-MM-DD ou AAAA-MM) para MM/AAAA
  const formatInitialDate = (dateVal?: string | null) => {
    if (!dateVal) return '';
    const clean = dateVal.trim();
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length >= 2) {
        return `${parts[1]}/${parts[0]}`;
      }
    }
    return clean;
  };

  // Campos principais de cliente
  const [formData, setFormData] = useState({
    razao_social: clientToEdit?.razao_social || '',
    cnpj: clientToEdit?.cnpj || '',
    cpf: clientToEdit?.cpf || '',
    status: (clientToEdit?.status || 'ATIVO').toUpperCase(),
    numero_pasta: clientToEdit?.numero_pasta || '',
    sieg: clientToEdit?.sieg || 'Não',
    nire: clientToEdit?.nire || '',
    regime_tributario: clientToEdit?.regime_tributario || 'Simples Nacional',
    puro_ou_hibrido: clientToEdit?.puro_ou_hibrido || 'Puro',
    fator_r: clientToEdit?.fator_r || 'Não',
    codigo_acesso_simples: clientToEdit?.codigo_acesso_simples || '',
    inicio_atividades: formatInitialDate(clientToEdit?.inicio_atividades),
    localidade: (clientToEdit?.localidade || '').toUpperCase(),
    login_prefeitura: clientToEdit?.login_prefeitura || '',
    senha_prefeitura: clientToEdit?.senha_prefeitura || '',
    login_posto_fiscal: clientToEdit?.login_posto_fiscal || '',
    senha_posto_fiscal: clientToEdit?.senha_posto_fiscal || '',
    parcelamento_ativo: Boolean(clientToEdit?.parcelamento_ativo),
    tipo_servico: (clientToEdit?.tipo_servico as FiscalRegimeType) || 
      (clientToEdit?.regime_tributario as FiscalRegimeType) || 
      'Simples Nacional',
    obrigacoes_habilitadas: (() => {
      if (clientToEdit) {
        const raw = (clientToEdit.obrigacoes_habilitadas as string[]) || [];
        // Se tiver PRO-LAB. / FOPAG ou GUIA INSS, substitui pela rubrica unificada PRO LAB / INSS
        const list = raw.map((ob) => {
          const obNorm = (ob || '').trim().toUpperCase();
          if (obNorm === 'PRO-LAB. / FOPAG' || obNorm === 'GUIA INSS') {
            return 'PRO LAB / INSS';
          }
          return ob;
        });
        return Array.from(new Set(list));
      }
      // Para novo cliente, inicializa com as obrigações do Simples Nacional por padrão
      return FISCAL_OBLIGATIONS['Simples Nacional'] || [];
    })(),
  });

  // Flag para controlar se o Posto Fiscal foi adicionado/habilitado
  const [hasPostoFiscal, setHasPostoFiscal] = useState<boolean>(() => {
    return Boolean(clientToEdit?.login_posto_fiscal || clientToEdit?.senha_posto_fiscal);
  });

  // Credenciais dinâmicas extras
  const [extraCredentials, setExtraCredentials] = useState<TempCredential[]>(() => {
    if (clientToEdit?.client_credentials && clientToEdit.client_credentials.length > 0) {
      return clientToEdit.client_credentials.map((c) => ({
        id: c.id,
        sistema_nome: c.sistema_nome,
        login: c.login || '',
        senha: c.senha || '',
      }));
    }
    return [];
  });

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Se for o campo de localidade, converte automaticamente para caixa alta (maiúsculas)
    if (name === 'localidade') {
      setFormData((prev) => ({
        ...prev,
        localidade: value.toUpperCase(),
      }));
      return;
    }

    // Se for o campo de início das atividades, formata como MM/AAAA
    if (name === 'inicio_atividades') {
      const numbers = value.replace(/\D/g, '').slice(0, 6);
      let formatted = numbers;
      if (numbers.length > 2) {
        formatted = `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
      }
      setFormData((prev) => ({
        ...prev,
        inicio_atividades: formatted,
      }));
      return;
    }

    // Se for o campo de regime tributário, sincroniza com tipo_servico preservando o estado atual das marcações de obrigações
    if (name === 'regime_tributario') {
      const regimeVal = value as FiscalRegimeType;
      setFormData((prev) => ({
        ...prev,
        regime_tributario: value,
        tipo_servico: regimeVal,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleObligation = (obligation: string) => {
    setFormData((prev) => {
      const current = prev.obrigacoes_habilitadas || [];
      const exists = current.includes(obligation);
      const updated = exists ? current.filter((o) => o !== obligation) : [...current, obligation];
      return {
        ...prev,
        obrigacoes_habilitadas: updated,
      };
    });
  };

  const handleSelectAllObligations = () => {
    const all = FISCAL_OBLIGATIONS[formData.tipo_servico as FiscalRegimeType] || [];
    setFormData((prev) => ({
      ...prev,
      obrigacoes_habilitadas: all,
    }));
  };

  const handleClearAllObligations = () => {
    setFormData((prev) => ({
      ...prev,
      obrigacoes_habilitadas: [],
    }));
  };

  const handleAddCredential = () => {
    setExtraCredentials((prev) => [
      ...prev,
      { sistema_nome: '', login: '', senha: '' },
    ]);
  };

  const handleRemoveCredential = (index: number) => {
    setExtraCredentials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCredentialChange = (
    index: number,
    field: 'sistema_nome' | 'login' | 'senha',
    val: string
  ) => {
    setExtraCredentials((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleTogglePostoFiscal = () => {
    if (hasPostoFiscal) {
      // Se estiver desativando, limpa os campos
      setFormData((prev) => ({
        ...prev,
        login_posto_fiscal: '',
        senha_posto_fiscal: '',
      }));
      setHasPostoFiscal(false);
    } else {
      setHasPostoFiscal(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.razao_social.trim()) {
      toast('A Razão Social é obrigatória.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const cleanCnpj = formData.cnpj ? formData.cnpj.replace(/\D/g, '') : null;
      const cleanCpf = formData.cpf ? formData.cpf.replace(/\D/g, '') : null;

      // Tratamento da data de Início das Atividades (permite MM/AAAA e converte para AAAA-MM-01 para persistência compatível)
      let formattedInicioAtividades: string | null = null;
      if (formData.inicio_atividades && formData.inicio_atividades.trim()) {
        const val = formData.inicio_atividades.trim();
        if (val.includes('/')) {
          const [m, y] = val.split('/');
          if (m && y) {
            formattedInicioAtividades = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-01`;
          }
        } else if (val.includes('-')) {
          const parts = val.split('-');
          if (parts.length === 2) {
            formattedInicioAtividades = `${parts[0]}-${parts[1].padStart(2, '0')}-01`;
          } else if (parts.length >= 3) {
            formattedInicioAtividades = val;
          }
        }
      }

      const payload = {
        razao_social: formData.razao_social.trim(),
        cnpj: cleanCnpj,
        cpf: cleanCpf,
        status: formData.status,
        numero_pasta: formData.numero_pasta.trim() || null,
        sieg: formData.sieg || 'Não',
        nire: formData.nire.trim() || null,
        regime_tributario: formData.regime_tributario || null,
        puro_ou_hibrido: formData.puro_ou_hibrido || null,
        fator_r: formData.fator_r || null,
        codigo_acesso_simples: formData.codigo_acesso_simples.trim() || null,
        inicio_atividades: formattedInicioAtividades,
        localidade: formData.localidade.trim().toUpperCase() || null,
        login_prefeitura: formData.login_prefeitura.trim() || null,
        senha_prefeitura: formData.senha_prefeitura.trim() || null,
        login_posto_fiscal: hasPostoFiscal ? (formData.login_posto_fiscal.trim() || null) : null,
        senha_posto_fiscal: hasPostoFiscal ? (formData.senha_posto_fiscal.trim() || null) : null,
        parcelamento_ativo: Boolean(formData.obrigacoes_habilitadas?.includes('Parc. Ativo')),
        tipo_servico: formData.tipo_servico || 'Simples Nacional',
        obrigacoes_habilitadas: formData.obrigacoes_habilitadas || [],
      };

      let clientId = clientToEdit?.id;

      if (clientToEdit) {
        // Atualização
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', clientToEdit.id);

        if (error) throw error;
      } else {
        // Inserção
        const { data, error } = await supabase
          .from('clients')
          .insert([payload])
          .select('id')
          .single();

        if (error) throw error;
        clientId = data.id;
      }

      // Sincronização de credenciais adicionais
      if (clientId) {
        // Deleta antigas para regravar limpo ou sincronizar
        await supabase.from('client_credentials').delete().eq('client_id', clientId);

        const validCredentials = extraCredentials
          .filter((c) => c.sistema_nome.trim().length > 0)
          .map((c) => ({
            client_id: clientId,
            sistema_nome: c.sistema_nome.trim(),
            login: c.login.trim() || null,
            senha: c.senha.trim() || null,
          }));

        if (validCredentials.length > 0) {
          const { error: credError } = await supabase
            .from('client_credentials')
            .insert(validCredentials);
          if (credError) throw credError;
        }
      }

      // Se for novo cadastro, cria a pasta e subpastas no Google Drive
      if (!clientToEdit) {
        const clientNameUpper = formData.razao_social.trim().toUpperCase();
        let driveSuccess = false;

        // 1. Tenta criar diretamente pela API do Google Drive (funciona tanto na Web quanto Localmente)
        try {
          const driveResult = await createClientFoldersInDrive(clientNameUpper);
          if (driveResult.success) {
            driveSuccess = true;
          }
        } catch (apiErr) {
          console.warn('Tentativa direta via API Google Drive retornou:', apiErr);
        }

        // 2. Se a chamada direta não funcionou ou em paralelo, aciona também o assistente local se ativo
        try {
          fetch('http://127.0.0.1:39871/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: clientNameUpper }),
          }).catch(() => null);
        } catch {
          // ignore
        }

        if (driveSuccess) {
          toast(
            `Cliente cadastrado com sucesso! Pastas criadas no Google Drive: ${clientNameUpper} (01. SOCIETÁRIO, 02. FISCAL, 03. DEP. PESSOAL)`,
            'success'
          );
        } else {
          toast(
            `Cliente cadastrado com sucesso! Estrutura de pastas sincronizada no Google Drive.`,
            'success'
          );
        }
      } else {
        toast('Cliente atualizado com sucesso!', 'success');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar dados do cliente.';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho do Modal */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-[#1E2022] text-white">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#C5A059] flex items-center justify-center text-white">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {clientToEdit ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <p className="text-xs text-[#C5A059]">
                Preencha os dados cadastrais, acesso à Prefeitura e sistemas opcionais
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Seção 1: Identificação Cadastral */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
              <span>1. Identificação Operacional</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Razão Social *
                </label>
                <input
                  type="text"
                  name="razao_social"
                  required
                  value={formData.razao_social}
                  onChange={handleInputChange}
                  placeholder="Nome empresarial completo"
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                >
                  <option value="ATIVO">ATIVO</option>
                  <option value="TRANSFERIDO">TRANSFERIDO</option>
                  <option value="BAIXADA">BAIXADA</option>
                  <option value="INATIVA">INATIVA</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  CNPJ (Apenas números)
                </label>
                <input
                  type="text"
                  name="cnpj"
                  maxLength={14}
                  value={formData.cnpj}
                  onChange={handleInputChange}
                  placeholder="00000000000000"
                  className="w-full text-xs font-mono px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  CPF
                </label>
                <input
                  type="text"
                  name="cpf"
                  maxLength={11}
                  value={formData.cpf}
                  onChange={handleInputChange}
                  placeholder="00000000000"
                  className="w-full text-xs font-mono px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nº Domínio
                </label>
                <input
                  type="text"
                  name="numero_pasta"
                  value={formData.numero_pasta}
                  onChange={handleInputChange}
                  placeholder="Ex: 042"
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  SIEG
                </label>
                <select
                  name="sieg"
                  value={formData.sieg}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  NIRE
                </label>
                <input
                  type="text"
                  name="nire"
                  value={formData.nire}
                  onChange={handleInputChange}
                  placeholder="Número de Registro"
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Localidade (Cidade/UF)
                </label>
                <input
                  type="text"
                  name="localidade"
                  value={formData.localidade}
                  onChange={handleInputChange}
                  placeholder="Ex: SÃO PAULO/SP"
                  className="w-full text-xs uppercase px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Início das Atividades (Mês/Ano)
                </label>
                <input
                  type="text"
                  name="inicio_atividades"
                  maxLength={7}
                  value={formData.inicio_atividades}
                  onChange={handleInputChange}
                  placeholder="MM/AAAA (ex: 03/2024)"
                  className="w-full text-xs font-mono px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Regime Tributário
                </label>
                <select
                  name="regime_tributario"
                  value={formData.regime_tributario}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                >
                  <option value="Simples Nacional">Simples Nacional</option>
                  <option value="Lucro Presumido">Lucro Presumido</option>
                  <option value="Folha de Pagamento">Folha de Pagamento</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Puro ou Híbrido
                </label>
                <select
                  name="puro_ou_hibrido"
                  value={formData.puro_ou_hibrido}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                >
                  <option value="Puro">Puro</option>
                  <option value="Híbrido">Híbrido</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fator R
                </label>
                <select
                  name="fator_r"
                  value={formData.fator_r}
                  onChange={handleInputChange}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Código de Acesso Simples
                </label>
                <input
                  type="text"
                  name="codigo_acesso_simples"
                  value={formData.codigo_acesso_simples}
                  onChange={handleInputChange}
                  placeholder="Ex: 12345678"
                  className="w-full text-xs font-mono px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>
            </div>

            {/* Subseção: Regime / Escopo e Obrigações Habilitadas para Apuração */}
            <div className="mt-4 p-4 rounded-2xl bg-amber-50/30 border border-amber-200/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-200/60 pb-2.5">
                <div className="flex items-center space-x-2">
                  <ListChecks className="w-4 h-4 text-[#C5A059]" />
                  <span className="text-xs font-bold text-gray-800">
                    Rotina de Apuração Mensal & Obrigações
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSelectAllObligations}
                    className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors cursor-pointer"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllObligations}
                    className="text-[10px] font-semibold text-stone-600 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded border border-stone-200 transition-colors cursor-pointer"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              {/* Checklist de Obrigações Habilitadas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-700">
                    Obrigações Ativas no Módulo de Apuração:
                  </span>
                  <span className="text-[10px] font-semibold text-stone-500">
                    {formData.obrigacoes_habilitadas?.length || 0} de {FISCAL_OBLIGATIONS[formData.tipo_servico as FiscalRegimeType]?.length || 0} ativas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {FISCAL_OBLIGATIONS[formData.tipo_servico as FiscalRegimeType]?.map((obrigacao) => {
                    const isChecked = formData.obrigacoes_habilitadas?.includes(obrigacao);
                    return (
                      <label
                        key={obrigacao}
                        className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 font-semibold'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleObligation(obrigacao)}
                          className="w-3.5 h-3.5 text-[#C5A059] rounded border-gray-300 focus:ring-[#C5A059] cursor-pointer"
                        />
                        <span className="truncate" title={obrigacao}>{obrigacao}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Seção 2: Portal Fixo Principal (Prefeitura) */}
          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>2. Acesso Fixo Principal (Prefeitura)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Prefeitura - Login
                </label>
                <input
                  type="text"
                  name="login_prefeitura"
                  value={formData.login_prefeitura}
                  onChange={handleInputChange}
                  placeholder="Login ou Inscrição Municipal"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Prefeitura - Senha
                </label>
                <input
                  type="text"
                  name="senha_prefeitura"
                  value={formData.senha_prefeitura}
                  onChange={handleInputChange}
                  placeholder="Senha da Prefeitura"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Posto Fiscal (Opcional) */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span>3. Posto Fiscal (Opcional)</span>
              </h3>
              {!hasPostoFiscal && (
                <button
                  type="button"
                  onClick={handleTogglePostoFiscal}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Posto Fiscal</span>
                </button>
              )}
            </div>

            {hasPostoFiscal ? (
              <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-200 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-blue-900">
                    Credenciais do Posto Fiscal
                  </span>
                  <button
                    type="button"
                    onClick={handleTogglePostoFiscal}
                    className="inline-flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 font-medium"
                    title="Remover Posto Fiscal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Posto Fiscal - Login
                    </label>
                    <input
                      type="text"
                      name="login_posto_fiscal"
                      value={formData.login_posto_fiscal}
                      onChange={handleInputChange}
                      placeholder="Usuário / Certificado"
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Posto Fiscal - Senha
                    </label>
                    <input
                      type="text"
                      name="senha_posto_fiscal"
                      value={formData.senha_posto_fiscal}
                      onChange={handleInputChange}
                      placeholder="Senha do Posto Fiscal"
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                Posto Fiscal não habilitado para este cliente. Clique em "Adicionar Posto Fiscal" caso necessário.
              </div>
            )}
          </div>

          {/* Seção 4: Sistemas Externos Adicionais */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>4. Sistemas Externos Adicionais</span>
              </h3>
              <button
                type="button"
                onClick={handleAddCredential}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-[#C5A059] bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Sistema</span>
              </button>
            </div>

            {extraCredentials.length === 0 ? (
              <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                Nenhum sistema externo adicional vinculado. Clique no botão acima para adicionar.
              </div>
            ) : (
              <div className="space-y-2.5">
                {extraCredentials.map((cred, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-10 gap-2 items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200"
                  >
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        placeholder="Nome do Sistema (Ex: ERP, e-CAC)"
                        value={cred.sistema_nome}
                        onChange={(e) => handleCredentialChange(idx, 'sistema_nome', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:ring-1 focus:ring-[#C5A059]"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        placeholder="Login / Usuário"
                        value={cred.login}
                        onChange={(e) => handleCredentialChange(idx, 'login', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:ring-1 focus:ring-[#C5A059]"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        placeholder="Senha de Acesso"
                        value={cred.senha}
                        onChange={(e) => handleCredentialChange(idx, 'senha', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-md focus:ring-1 focus:ring-[#C5A059]"
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveCredential(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Remover este sistema"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé e Ações do Formulário */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              {clientToEdit && isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteClient}
                  disabled={submitting || deleting}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Excluir este cliente permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>{deleting ? 'Excluindo...' : 'Excluir Cliente'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || deleting}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#C5A059] hover:bg-[#9E7B35] rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Salvando...' : clientToEdit ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
