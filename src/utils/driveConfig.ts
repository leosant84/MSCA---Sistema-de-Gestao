/**
 * Utilitário para gerenciamento do Caminho Base das Pastas de Clientes no Google Drive
 */

export const DEFAULT_DRIVE_FOLDER_PATH = 'G:\\Meu Drive\\00. MSCA\\00. CLIENTES';
const STORAGE_KEY = 'msca_google_drive_base_path';

/**
 * Normaliza caminhos no formato Windows
 * - Substitui barras normais '/' por barras invertidas '\'
 * - Remove barras invertidas duplicadas (exceto prefixos UNC se houver)
 * - Remove barra invertida final
 * - Remove aspas acidentais no início ou fim
 */
export function normalizeWindowsPath(inputPath: string): string {
  if (!inputPath) return '';
  // Remove caracteres de controle invisíveis, non-breaking spaces (\u00A0, \u200B, etc)
  let cleaned = inputPath
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .trim()
    .replace(/^["']|["']$/g, '');
  cleaned = cleaned.replace(/\//g, '\\');
  // Substitui repetições de barras invertidas por uma única barra, mantendo se começar com \\
  const isUnc = cleaned.startsWith('\\\\');
  cleaned = cleaned.replace(/\\+/g, '\\');
  if (isUnc) {
    cleaned = '\\' + cleaned;
  }
  // Remove barra final se tiver mais que a raiz (ex: G:\ permanece G:\, mas G:\Pasta\ vira G:\Pasta)
  if (cleaned.length > 3 && cleaned.endsWith('\\')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Obtém o caminho base do Google Drive configurado para o usuário/máquina atual
 */
export function getDriveBasePath(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      return normalizeWindowsPath(saved);
    }
  } catch {
    // Caso localStorage não esteja acessível
  }
  return DEFAULT_DRIVE_FOLDER_PATH;
}

/**
 * Salva o novo caminho base do Google Drive
 */
export function setDriveBasePath(newPath: string): string {
  const normalized = normalizeWindowsPath(newPath);
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Caso ocorra erro de quota ou storage
  }
  return normalized;
}

/**
 * Reseta para o valor padrão
 */
export function resetDriveBasePath(): string {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
  return DEFAULT_DRIVE_FOLDER_PATH;
}
