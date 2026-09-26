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
    <div className="min-h-screen w-full flex flex-col md:flex-row relative overflow-hidden bg-gradient-to-br from-[#F5F7FA] via-[#EEF2F6] to-[#E5EBF2]">
      {/* 
        Coluna da Esquerda: Logotipo Grande e Apresentação Institucional
        com a marca d'água de contabilidade ao fundo
      */}
      <div className="relative w-full md:w-1/2 lg:w-3/5 min-h-[300px] md:min-h-screen flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden">
        {/* Marca d'Água de Contabilidade */}
        <div 
          className="absolute inset-0 z-0 bg-no-repeat bg-center md:bg-left bg-cover pointer-events-none opacity-25 md:opacity-40"
          style={{
            backgroundImage: "url('/accounting-watermark.jpg')",
            maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.15) 85%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.15) 85%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Degradê sutil de luz suave */}
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-white/70 via-transparent to-amber-500/[0.04] pointer-events-none" />

        {/* Conteúdo Institucional com Logo Grande à Esquerda */}
        <div className="relative z-10 my-auto max-w-lg">
          <div className="mb-6">
            <img
              src="/logo-msca.png"
              alt="MS Contadores Associados"
              className="h-28 sm:h-36 lg:h-44 w-auto object-contain drop-shadow-sm mix-blend-multiply"
            />
          </div>

          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-amber-200/70 shadow-xs mb-4">
            <span className="w-2 h-2 rounded-full bg-[#C5A059]"></span>
            <span className="text-xs font-bold text-[#9E7B35] tracking-wider uppercase">
              Sistema Integrado de Gestão
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-800 tracking-tight leading-tight">
            Excelência contábil, precisão fiscal e controle financeiro.
          </h2>

          <p className="text-sm text-stone-600 mt-3 leading-relaxed">
            Ambiente corporativo protegido para gestão integrada de clientes, credenciais fiscais e controle financeiro.
          </p>
        </div>

        {/* Rodapé Institucional à Esquerda */}
        <div className="relative z-10 pt-6 border-t border-slate-200/50 hidden md:flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
            <span>Plataforma Segura com Autenticação e RLS</span>
          </div>
          <span>© {new Date().getFullYear()} MS Contadores Associados</span>
        </div>
      </div>

      {/* 
        Coluna da Direita: Somente Formulário de Login (E-mail e Senha)
      */}
      <div className="w-full md:w-1/2 lg:w-2/5 flex items-center justify-center p-6 sm:p-10 lg:p-14 relative z-10">
        <div className="w-full max-w-[420px] bg-white/95 backdrop-blur-md rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-200/80 p-8 sm:p-10">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
              Acesso ao Sistema
            </h1>
            <p className="text-xs text-stone-500 mt-1.5">
              Informe seu e-mail e senha para prosseguir
            </p>
          </div>

          {/* Mensagem de Erro */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-700 leading-relaxed font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Formulário de Autenticação */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                E-mail corporativo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@msca.com.br"
                  className="block w-full pl-10 pr-3.5 py-3 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/40 focus:border-[#C5A059] bg-slate-50/60 hover:bg-white text-stone-900 placeholder-stone-400 transition-all shadow-inner/10"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Senha de acesso
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-3 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/40 focus:border-[#C5A059] bg-slate-50/60 hover:bg-white text-stone-900 placeholder-stone-400 transition-all shadow-inner/10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 flex items-center justify-center space-x-2 py-3.5 px-4 rounded-2xl text-xs font-semibold text-white bg-gradient-to-r from-[#C5A059] to-[#D4B26F] hover:from-[#B8924B] hover:to-[#C5A059] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5A059] shadow-md shadow-[#C5A059]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

          {/* Rodapé Seguro Mobile */}
          <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center space-x-2 text-[11px] text-stone-400 md:hidden">
            <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
            <span>Ambiente Seguro e Criptografado</span>
          </div>
        </div>
      </div>
    </div>
  );
};
