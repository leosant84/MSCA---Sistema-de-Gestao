import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('E-mail ou senha incorretos. Verifique os dados digitados.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('E-mail não confirmado. Verifique sua caixa de entrada.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      if (data.session) {
        navigate('/clientes', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro ao tentar entrar.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden bg-white">
      {/* 
        Fundo com Marca d'Água de Contabilidade à Esquerda
        A imagem cobre o fundo e possui fade suave em degradê em direção à direita
      */}
      <div 
        className="absolute inset-0 z-0 bg-no-repeat bg-left bg-cover pointer-events-none opacity-40 md:opacity-55"
        style={{
          backgroundImage: "url('/accounting-watermark.jpg')",
          maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0) 85%)',
          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0) 85%)',
        }}
      />

      {/* Degradê sutil de luz suave sobre o ambiente */}
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-blue-900/[0.03] via-transparent to-white pointer-events-none" />

      {/* Container Principal estruturado com o formulário deslocado para a direita */}
      <div className="w-full flex flex-col md:flex-row items-center justify-center md:justify-end px-4 sm:px-8 md:px-16 lg:px-24 py-10 relative z-10">
        
        {/* Painel de Login Deslocado à Direita */}
        <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl shadow-gray-300/50 border border-gray-100 p-8 sm:p-10 my-auto">
          
          {/* Logo Oficial MSCA */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="mb-4">
              <img
                src="/logo-msca.png"
                alt="MS Contadores Associados"
                className="h-20 w-auto object-contain drop-shadow-xs"
              />
            </div>
            
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059]"></span>
              <span className="text-[11px] font-bold text-[#9E7B35] tracking-wider uppercase">
                Sistema de Gestão
              </span>
            </div>

            <p className="text-xs text-gray-500 max-w-xs mt-1">
              Acesse com suas credenciais corporativas
            </p>
          </div>

          {/* Mensagem de Erro */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700 leading-relaxed font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Formulário de Autenticação */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                E-mail corporativo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@msca.com.br"
                  className="block w-full pl-10 pr-3.5 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/40 focus:border-[#C5A059] bg-gray-50/60 hover:bg-white text-gray-900 placeholder-gray-400 transition-all shadow-inner/10"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Senha de acesso
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/40 focus:border-[#C5A059] bg-gray-50/60 hover:bg-white text-gray-900 placeholder-gray-400 transition-all shadow-inner/10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-[#C5A059] hover:bg-[#9E7B35] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5A059] shadow-md shadow-[#C5A059]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Rodapé Seguro */}
          <div className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-center space-x-2 text-[11px] text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
            <span>Ambiente Seguro com Criptografia e Políticas RLS</span>
          </div>

          <p className="text-center text-[10px] text-gray-400 mt-5">
            © {new Date().getFullYear()} MS Contadores Associados. Todos os direitos reservados.
          </p>
        </div>

      </div>
    </div>
  );
};
