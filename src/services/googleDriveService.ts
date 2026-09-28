/**
 * Serviço de Integração Direta com a API do Google Drive
 * Criação da pasta do cliente e subpastas padrão em:
 * Meu Drive > 00. MSCA > 00. CLIENTES (ID: 1-rhNXfy3ctWwk-dXVpQiNtdWzQRaO2v2)
 */

export const GDRIVE_PARENT_FOLDER_ID = '1-rhNXfy3ctWwk-dXVpQiNtdWzQRaO2v2';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = import.meta.env.VITE_GOOGLE_REFRESH_TOKEN || '';

// Cache em memória do access token para evitar requisições desnecessárias
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtém um token de acesso válido via refresh_token da API OAuth2 do Google
 */
async function getValidAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Credenciais da API do Google Drive não configuradas no ambiente.');
  }

  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao autenticar no Google Drive.');
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
  return data.access_token;
}

export interface CreateClientFolderResult {
  success: boolean;
  folderId?: string;
  folderName?: string;
  alreadyExisted?: boolean;
  createdSubfolders?: string[];
  message?: string;
}

/**
 * Cria a pasta do cliente (em CAIXA ALTA) e as 3 subpastas padrão:
 * - 01. SOCIETÁRIO
 * - 02. FISCAL
 * - 03. DEP. PESSOAL
 */
export async function createClientFoldersInDrive(
  razaoSocial: string
): Promise<CreateClientFolderResult> {
  const folderName = razaoSocial.trim().toUpperCase();
  if (!folderName) {
    return { success: false, message: 'Razão social vazia.' };
  }

  const accessToken = await getValidAccessToken();

  // 1. Procura se a pasta do cliente já existe dentro de 00. CLIENTES
  const escapedName = folderName.replace(/'/g, "\\'");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${GDRIVE_PARENT_FOLDER_ID}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )}&fields=${encodeURIComponent('files(id, name)')}&pageSize=1`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const searchData = await searchRes.json();
  let clientFolderId: string | undefined;
  let alreadyExisted = false;

  if (searchData.files && searchData.files.length > 0) {
    clientFolderId = searchData.files[0].id;
    alreadyExisted = true;
  } else {
    // 2. Cria a pasta principal
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [GDRIVE_PARENT_FOLDER_ID],
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      throw new Error(createData.error?.message || 'Falha ao criar pasta principal do cliente no Drive.');
    }
    clientFolderId = createData.id;
  }

  // 3. Cria as 3 subpastas padrão
  const subfolders = ['01. SOCIETÁRIO', '02. FISCAL', '03. DEP. PESSOAL'];
  const createdSubfolders: string[] = [];

  for (const sub of subfolders) {
    const escapedSub = sub.replace(/'/g, "\\'");
    const checkSubUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${clientFolderId}' in parents and name = '${escapedSub}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&fields=${encodeURIComponent('files(id, name)')}&pageSize=1`;

    const checkSubRes = await fetch(checkSubUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const checkSubData = await checkSubRes.json();

    if (!checkSubData.files || checkSubData.files.length === 0) {
      const subCreateRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: sub,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [clientFolderId],
        }),
      });

      if (subCreateRes.ok) {
        createdSubfolders.push(sub);
      }
    }
  }

  return {
    success: true,
    folderId: clientFolderId,
    folderName,
    alreadyExisted,
    createdSubfolders,
  };
}
