import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info', title?: string) => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      removeToast(id);
    }, 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast, toasts, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between min-w-[280px] max-w-md p-3.5 rounded-lg shadow-lg border text-sm transition-all duration-300 transform translate-y-0 ${
              t.type === 'success'
                ? 'bg-[#1E2022] text-white border-[#C5A059]'
                : t.type === 'error'
                ? 'bg-red-900 text-white border-red-700'
                : 'bg-white text-gray-900 border-gray-200'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#C5A059] flex-shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />}
              <div>
                {t.title && <div className="font-semibold text-xs text-gray-300">{t.title}</div>}
                <div>{t.message}</div>
              </div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-3 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return context;
};
