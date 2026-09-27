import React, { useState } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Shield,
  Lock,
  UserCheck,
  AlertCircle,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../services/auditService';
import {
  getDriveBasePath,
  setDriveBasePath,
  resetDriveBasePath,
  DEFAULT_DRIVE_FOLDER_PATH,
  normalizeWindowsPath
} from '../utils/driveConfig';

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

  // Estado do Caminho Local do Google Drive
  const [drivePath, setDrivePath] = useState<string>(() => getDriveBasePath());
  const [drivePathSaved, setDrivePathSaved] = useState<boolean>(false);
  const [testingDrive, setTestingDrive] = useState<boolean>(false);
  const [driveStatus, setDriveStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSaveDrivePath = () => {
    if (!drivePath.trim()) {
      toast('Por favor, informe um caminho válido.', 'error');
      return;
    }
    const saved = setDriveBasePath(drivePath);
    setDrivePath(saved);
    setDrivePathSaved(true);
    setDriveStatus({
      success: true,
      message: `Caminho salvo: ${saved}`
    });
    toast('Caminho base do Google Drive configurado com sucesso!', 'success');
  };

  const handleResetDrivePath = () => {
    const defaultPath = resetDriveBasePath();
    setDrivePath(defaultPath);
    setDrivePathSaved(true);
    setDriveStatus({
      success: true,
      message: `Caminho restaurado para o padrão: ${defaultPath}`
    });
    toast('Caminho restaurado para o padrão do sistema.', 'info');
  };

  const handleTestDrivePath = async () => {
    setTestingDrive(true);
    setDriveStatus(null);
    try {
      const normalized = normalizeWindowsPath(drivePath);
      // Salva preventivamente
      setDriveBasePath(normalized);
      setDrivePath(normalized);

      const queryParams = new URLSearchParams({
        basePath: normalized,
      });

      let res: Response | null = null;
      try {
        res = await fetch(`http://127.0.0.1:39871/api/open-folder?${queryParams.toString()}`);
      } catch {
        try {
          res = await fetch(`/api/open-folder?${queryParams.toString()}`);
        } catch {
          res = null;
        }
      }

      if (!res) {
        setDriveStatus({
          success: false,
          message: 'O serviço local de pastas não está ativo no computador. Inicie o "iniciar_servico_pastas.bat".'
        });
        toast('Serviço local de pastas não está rodando.', 'error');
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDriveStatus({
          success: false,
          message: data.message || 'Diretório não acessível nesta máquina.'
        });
        toast(data.message || 'Diretório inacessível.', 'error');
      } else {
        setDriveStatus({
          success: true,
          message: `Pasta aberta no Explorer com sucesso: "${data.folderOpened || normalized}"`
        });
        toast('Pasta aberta no Windows Explorer com sucesso!', 'success');
      }
    } catch {
      setDriveStatus({
        success: false,
        message: 'Falha de comunicação com o serviço local de pastas.'
      });
      toast('Falha ao comunicar com o serviço de pastas.', 'error');
    } finally {
      setTestingDrive(false);
    }
  };

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

          {/* Configuração de Caminho Local do Google Drive */}
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4 mb-4">
              <FolderOpen className="w-5 h-5 text-[#C5A059]" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Caminho Local do Google Drive (Pastas de Clientes)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure o diretório base das pastas dos clientes sincronizadas nesta máquina Windows
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Caminho Base das Pastas *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <HardDrive className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={drivePath}
                    onChange={(e) => {
                      setDrivePath(e.target.value);
                      setDrivePathSaved(false);
                      setTestingDrive(false);
                      setDriveStatus(null);
                    }}
                    placeholder="Ex: G:\Meu Drive\00. MSCA\00. CLIENTES"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C5A059] focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1.5">
                  <span>Padrão do sistema: <code className="text-stone-600 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{DEFAULT_DRIVE_FOLDER_PATH}</code></span>
                  {drivePath && drivePath.includes('/') && (
                    <span className="text-amber-600 font-medium">As barras serão convertidas para o padrão Windows (\)</span>
                  )}
                </div>
              </div>

              {/* Mensagem de Feedback de salvamento ou teste */}
              {drivePathSaved && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Caminho base salvo com sucesso neste computador. As pastas serão abertas usando este diretório.</span>
                </div>
              )}

              {driveStatus && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                    driveStatus.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {driveStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{driveStatus.message}</span>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResetDrivePath}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer"
                  title="Restaurar caminho padrão da unidade G:\"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Restaurar Padrão</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleTestDrivePath}
                    disabled={testingDrive || !drivePath.trim()}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 text-stone-700 hover:bg-slate-50 font-medium text-xs rounded-lg transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                    title="Testar se o serviço de pastas local consegue acessar esta pasta no Windows"
                  >
                    {testingDrive ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>Testar e Abrir no Explorer</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDrivePath}
                    className="inline-flex items-center space-x-1.5 px-5 py-2 bg-[#C5A059] hover:bg-[#b08e4b] text-white font-medium text-xs rounded-lg transition-all shadow hover:shadow-md cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvar Caminho</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
