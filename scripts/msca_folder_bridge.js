import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PORT = 39871;
const BASE_DIR = 'G:\\Meu Drive\\00. MSCA\\00. CLIENTES';

const server = http.createServer((req, res) => {
  // Configuração de CORS para permitir requisições tanto de localhost quanto de sistema.msca.com.br
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url || '', `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'ok', service: 'msca-folder-bridge' }));
  }

  if (url.pathname === '/api/open-folder') {
    const clientName = url.searchParams.get('name') || '';
    const customFolder = url.searchParams.get('folder') || '';

    if (!fs.existsSync(BASE_DIR)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        message: 'O Google Drive (unidade G:\\) não está montado ou acessível nesta máquina.'
      }));
    }

    let targetDir = '';

    // 1. Se informou nome de pasta exata ou número
    if (customFolder && fs.existsSync(path.join(BASE_DIR, customFolder))) {
      targetDir = path.join(BASE_DIR, customFolder);
    } else {
      try {
        const allDirs = fs.readdirSync(BASE_DIR, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        const cleanQuery = clientName.trim().toUpperCase();

        // Busca exata
        let match = allDirs.find(d => d.toUpperCase() === cleanQuery);

        // Busca por prefixo/início
        if (!match && cleanQuery.length > 3) {
          match = allDirs.find(d => d.toUpperCase().startsWith(cleanQuery));
        }

        // Busca por substring
        if (!match && cleanQuery.length > 3) {
          match = allDirs.find(d => d.toUpperCase().includes(cleanQuery));
        }

        // Busca pelas primeiras palavras
        if (!match) {
          const words = cleanQuery.split(' ').filter(w => w.length > 2);
          if (words.length >= 2) {
            match = allDirs.find(d => {
              const up = d.toUpperCase();
              return words.every(w => up.includes(w));
            });
          }
        }

        if (match) {
          targetDir = path.join(BASE_DIR, match);
        }
      } catch (err) {
        console.error('[BRIDGE] Erro ao ler diretório de clientes:', err);
      }
    }

    const finalFolderToOpen = targetDir || BASE_DIR;

    try {
      const child = spawn('explorer.exe', [finalFolderToOpen], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: true,
        exactMatch: Boolean(targetDir),
        folderOpened: finalFolderToOpen
      }));
    } catch (error) {
      console.error('[BRIDGE] Erro ao abrir Explorer:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: false, message: error?.message || 'Erro ao abrir pasta' }));
    }
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[MSCA Bridge] Serviço local ativo em http://127.0.0.1:${PORT}`);
  console.log(`Monitorando pastas em: ${BASE_DIR}`);
});
