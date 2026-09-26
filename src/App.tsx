import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { Login } from './pages/Login';
import { Clients } from './pages/Clients';
import { Financial } from './pages/Financial';
import { AuditLogs } from './pages/AuditLogs';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Rota Pública de Autenticação */}
            <Route path="/login" element={<Login />} />

            {/* Rotas Autenticadas Protegidas */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/clientes" replace />} />
              <Route path="clientes" element={<Clients />} />

              {/* Rota exclusiva para Admin com RBAC */}
              <Route
                path="financeiro"
                element={
                  <ProtectedRoute requireAdmin={true}>
                    <Financial />
                  </ProtectedRoute>
                }
              />

              {/* Rota exclusiva para Admin: Auditoria e Logs de Atividades */}
              <Route
                path="auditoria"
                element={
                  <ProtectedRoute requireAdmin={true}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Redirecionamento Padrão */}
            <Route path="*" element={<Navigate to="/clientes" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
