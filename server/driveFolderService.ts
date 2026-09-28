import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const TOKEN_PATH = path.resolve('token.json');
const OAUTH_PATH = path.resolve('oauth_credentials.json');
const PARENT_CLIENTS_FOLDER_ID = '1-rhNXfy3ctWwk-dXVpQiNtdWzQRaO2v2'; // ID da pasta '00. CLIENTES'

export async function createDriveClientFolders(razaoSocial: string) {
  if (!fs.existsSync(TOKEN_PATH) || !fs.existsSync(OAUTH_PATH)) {
    throw new Error('Credenciais da API do Google Drive não configuradas no servidor.');
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const oauth = JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf8'));
  const { client_secret, client_id } = oauth.installed || oauth.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
  oAuth2Client.setCredentials(token);

  // Auto-refresh token se atualizar
  oAuth2Client.on('tokens', (newTokens) => {
    try {
      const merged = { ...token, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    } catch (e) {
      console.error('Erro ao atualizar token.json:', e);
    }
  });

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const folderName = razaoSocial.trim().toUpperCase();

  // 1. Verifica se já existe pasta com esse nome dentro de 00. CLIENTES
  const escapedName = folderName.replace(/'/g, "\\'");
  const checkRes = await drive.files.list({
    q: `'${PARENT_CLIENTS_FOLDER_ID}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  let clientFolderId: string;
  let alreadyExisted = false;

  if (checkRes.data.files && checkRes.data.files.length > 0) {
    clientFolderId = checkRes.data.files[0].id!;
    alreadyExisted = true;
  } else {
    // 2. Cria pasta principal em CAIXA ALTA
    const createRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_CLIENTS_FOLDER_ID],
      },
      fields: 'id, name',
    });
    clientFolderId = createRes.data.id!;
  }

  // 3. Cria as 3 subpastas padrão:
  // 01. SOCIETÁRIO
  // 02. FISCAL
  // 03. DEP. PESSOAL
  const subfolders = ['01. SOCIETÁRIO', '02. FISCAL', '03. DEP. PESSOAL'];
  const createdSubfolders: string[] = [];

  for (const sub of subfolders) {
    const escapedSub = sub.replace(/'/g, "\\'");
    const existingSubRes = await drive.files.list({
      q: `'${clientFolderId}' in parents and name = '${escapedSub}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (!existingSubRes.data.files || existingSubRes.data.files.length === 0) {
      await drive.files.create({
        requestBody: {
          name: sub,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [clientFolderId],
        },
        fields: 'id, name',
      });
      createdSubfolders.push(sub);
    }
  }

  return {
    clientFolderId,
    folderName,
    alreadyExisted,
    subfolders,
    createdSubfolders,
  };
}
