import fs from 'fs';
import { google } from 'googleapis';

const content = fs.readFileSync('oauth_credentials.json', 'utf8');
const credentials = JSON.parse(content);
const { client_secret, client_id } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333/oauth2callback');
const token = JSON.parse(fs.readFileSync('token.json', 'utf8'));
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: 'v3', auth: oAuth2Client });

async function test() {
  try {
    const user = await drive.about.get({ fields: 'user' });
    console.log('👤 Usuário conectado no token:');
    console.log('   Nome:', user.data.user?.displayName);
    console.log('   Email:', user.data.user?.emailAddress);
    
    // Tenta acessar especificamente a pasta informada
    const targetFolderId = '1drnOvbZI-sm4Pc4YLs_ePBK07QEPvAw4';
    try {
      const folder = await drive.files.get({
        fileId: targetFolderId,
        fields: 'id, name, capabilities, owners'
      });
      console.log('✅ Pasta encontrada com sucesso:', folder.data.name);
    } catch (err) {
      console.log('⚠️ Acesso à pasta 1drnOvbZI-sm4Pc4YLs_ePBK07QEPvAw4 falhou:', err.message);
    }

    const folders = await drive.files.list({
      pageSize: 20,
      fields: 'files(id, name, mimeType)'
    });
    console.log('\n📂 Arquivos/Pastas que este usuário tem acesso:');
    folders.data.files.forEach(f => {
      console.log(` - [${f.mimeType === 'application/vnd.google-apps.folder' ? 'PASTA' : 'ARQUIVO'}] ${f.name} (ID: ${f.id})`);
    });
  } catch (e) {
    console.error('Erro na chamada:', e.message);
  }
}

test();
