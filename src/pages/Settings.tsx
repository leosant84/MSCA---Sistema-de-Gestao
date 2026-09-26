import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle2, Shield, Lock, UserCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../services/auditService';

export const Settings: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validações
    if (!newPassword) {
      setErrorMessage('Por favor, informe a nova senha.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da nova senha não confere.');
      return;
    }

    setLoading(true);

    try {
      // 1. Se informou a senha atual, valida as credenciais antes
      if (currentPassword && user?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (signInError) {
          setErrorMessage('A senha atual informada está incorreta.');
          toast('Senha atual incorreta.', 'error');
          setLoading(false);
          return;
        }
      }

      // 2. Atualiza a senha do usuário autenticado no Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      // 3. Registra na auditoria
      await logAuditEvent({
        action: 'PASSWORD_CHANGE',
        entity: 'USER',
        entityId: user?.id,
        entityName: profile?.full_name || user?.email || 'Usuário',
        changes: {
          senha: { old: '*** (anterior)', new: '*** (redefinida)' },
        },
      });

      setSuccessMessage('Senha atualizada com sucesso!');
      toast('Senha alterada com sucesso!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar senha.';
      setErrorMessage(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Cabeçalho da Página */}
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[#C5A059]">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configurações de Segurança</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gerencie seus dados de acesso e mantenha sua conta protegida
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card de Informações da Conta */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-[#C5A059]" />
              <span>Sua Conta</span>
            </h3>

            <div className="space-y-3.5 text-sm">
              <div>
                <span className="text-xs text-gray-400 block font-medium">Nome</span>
                <span className="font-semibold text-gray-900">{profile?.full_name || 'Não informado'}</span>
              </div>

              <div>
                <span className="text-xs text-gray-400 block font-medium">E-mail de Acesso</span>
                <span className="text-gray-800 font-mono text-xs break-all">{user?.email || '-'}</span>
              </div>

              <div>
                <span className="text-xs text-gray-400 block font-medium">Perfil de Acesso</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 uppercase mt-0.5">
                  {role || 'Colaborador'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/60 rounded-xl border border-amber-200/80 p-4 text-xs text-amber-900 space-y-2">
            <div className="flex items-center space-x-1.5 font-semibold text-amber-950">
              <Shield className="w-4 h-4 text-[#C5A059]" />
              <span>Dicas de Segurança</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-amber-800/90 pl-1">
              <li>Utilize no mínimo 6 caracteres.</li>
              <li>Misture letras maiúsculas, números e símbolos.</li>
              <li>Evite sequências ou datas de nascimento.</li>
              <li>A alteração é refletida imediatamente.</li>
            </ul>
          </div>
        </div>

        {/* Formulário de Alteração de Senha */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4 mb-5">
              <Lock className="w-5 h-5 text-[#C5A059]" />
              <h2 className="text-base font-semibold text-gray-900">Alterar Senha de Acesso</h2>
            </div>

            {successMessage && (
              <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Senha Atual */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Senha Atual (Opcional para confirmação)
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Nova Senha */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nova Senha *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo de 6 caracteres"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Nova Senha */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Confirmar Nova Senha *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Repita a nova senha"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[#C5A059] hover:bg-[#b08e4b] text-white font-medium text-sm rounded-lg transition-all shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Salvar Nova Senha</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
