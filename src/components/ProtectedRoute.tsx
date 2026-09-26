import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-[#2B2D2F]">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    // Registra tentativa de acesso indevido no log de auditoria
    import('../services/auditService').then(({ logAuditEvent }) => {
      logAuditEvent({
        action: 'ACCESS_DENIED',
        entity: 'SECURITY',
        entityName: `Tentativa de acesso à rota restrita: ${location.pathname}`,
        changes: {
          path: { old: undefined, new: location.pathname },
          reason: { old: undefined, new: 'Usuário sem privilégios de administrador (role !== admin)' },
        },
      });
    });

    // Colaborador tentando acessar rota exclusiva de admin é redirecionado para /clientes
    return <Navigate to="/clientes" replace state={{ accessDenied: true }} />;
  }

  return <>{children}</>;
};
