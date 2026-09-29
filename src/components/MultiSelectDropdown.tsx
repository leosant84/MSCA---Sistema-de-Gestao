import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Calendar } from 'lucide-react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (newValues: string[]) => void;
  allLabel?: string;
  className?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  allLabel = 'Todas',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = selectedValues.length === 0 || selectedValues.includes(allLabel);

  const handleToggleOption = (val: string) => {
    if (val === allLabel) {
      onChange([allLabel]);
      return;
    }

    // Se estava em "Todas", remove o "Todas" e coloca apenas a selecionada
    let currentWithoutAll = selectedValues.filter((v) => v !== allLabel);

    if (currentWithoutAll.includes(val)) {
      currentWithoutAll = currentWithoutAll.filter((v) => v !== val);
      if (currentWithoutAll.length === 0) {
        onChange([allLabel]);
      } else {
        onChange(currentWithoutAll);
      }
    } else {
      currentWithoutAll.push(val);
      onChange(currentWithoutAll);
    }
  };

  const handleSelectAll = () => {
    onChange([allLabel]);
  };

  const handleClear = () => {
    onChange([allLabel]);
  };

  // Texto resumido do botão
  const getDisplayText = () => {
    if (isAllSelected) return allLabel;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues.length} meses selecionados`;
  };

  return (
    <div className={`relative inline-flex items-center space-x-1.5 ${className}`} ref={dropdownRef}>
      <Calendar className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-xs text-gray-500 font-medium">{label}:</span>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center space-x-1.5 text-xs font-mono font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 hover:border-[#C5A059] focus:outline-none focus:ring-1 focus:ring-[#C5A059] shadow-2xs transition-all cursor-pointer min-w-[130px] justify-between"
      >
        <span className="truncate">{getDisplayText()}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-gray-200/90 py-2 z-50 animate-in fade-in zoom-in-95">
          {/* Ações de Seleção Rápida */}
          <div className="flex items-center justify-between px-3 pb-1.5 mb-1.5 border-b border-gray-100 text-[10px]">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[#A67C2E] hover:text-[#7A5B20] font-bold cursor-pointer transition-colors"
            >
              Selecionar Todas
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-rose-600 font-medium cursor-pointer transition-colors"
            >
              Resetar
            </button>
          </div>

          {/* Lista de Opções com Checkbox */}
          <div className="max-h-56 overflow-y-auto px-1 space-y-0.5">
            {/* Opção 'Todas' */}
            <div
              onClick={() => handleToggleOption(allLabel)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                isAllSelected ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span>{allLabel}</span>
              {isAllSelected && <Check className="w-3.5 h-3.5 text-[#C5A059]" />}
            </div>

            {/* Meses individuais */}
            {options.map((opt) => {
              const checked = !isAllSelected && selectedValues.includes(opt);

              return (
                <div
                  key={opt}
                  onClick={() => handleToggleOption(opt)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    checked ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-mono">{opt}</span>
                  {checked && <Check className="w-3.5 h-3.5 text-[#C5A059]" />}
                </div>
              );
            })}
          </div>

          {/* Rodapé informativo */}
          <div className="pt-1.5 px-3 border-t border-gray-100 text-[10px] text-gray-400">
            {isAllSelected
              ? 'Todos os meses selecionados'
              : `${selectedValues.length} de ${options.length} selecionados`}
          </div>
        </div>
      )}
    </div>
  );
};
