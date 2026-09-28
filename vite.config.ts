import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'open-client-folder-api',
      configureServer(server) {
        server.middlewares.use('/api/open-folder', (req, res) => {
          const url = new URL(req.url || '', 'http://localhost');
          const clientName = url.searchParams.get('name') || '';
          const customFolder = url.searchParams.get('folder') || '';

          const baseDir = 'G:\\Meu Drive\\00. MSCA\\00. CLIENTES';

          if (!fs.existsSync(baseDir)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ 
              success: false, 
              message: 'O Google Drive (unidade G:\\) não está montado ou acessível nesta máquina.' 
            }));
          }

          let targetDir = '';

          // 1. Se informou nome de pasta exata ou número
          if (customFolder && fs.existsSync(path.join(baseDir, customFolder))) {
            targetDir = path.join(baseDir, customFolder);
          } else {
            // 2. Procura pasta que contenha a razão social ou nome aproximado
            try {
              const allDirs = fs.readdirSync(baseDir, { withFileTypes: true })
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

              // Busca pelas primeiras duas palavras
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
                targetDir = path.join(baseDir, match);
              }
            } catch (err) {
              console.error('Erro ao ler diretório de clientes:', err);
            }
          }

          // Se não encontrou a pasta individual do cliente, abre a pasta base geral
          const finalFolderToOpen = targetDir || baseDir;

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
          } catch (error: any) {
            console.error('Erro ao abrir Explorer:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: error?.message }));
          }
        });

        // Endpoint para criação automática da pasta do cliente e subpastas no Google Drive
        server.middlewares.use('/api/create-folder', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
          }

          try {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                let name = '';
                if (body) {
                  try {
                    const parsed = JSON.parse(body);
                    name = parsed.name || '';
                  } catch {
                    name = '';
                  }
                }
                if (!name) {
                  const url = new URL(req.url || '', 'http://localhost');
                  name = url.searchParams.get('name') || '';
                }

                if (!name.trim()) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, message: 'Nome da Razão Social não informado.' }));
                }

                const { createDriveClientFolders } = await import('./server/driveFolderService.js');
                const result = await createDriveClientFolders(name);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, ...result }));
              } catch (err: any) {
                console.error('Erro na criação de pastas no Google Drive:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: err?.message || 'Falha ao criar pastas no Drive' }));
              }
            });
          } catch (error: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: error?.message }));
          }
        });
      }
    }
  ],
})
