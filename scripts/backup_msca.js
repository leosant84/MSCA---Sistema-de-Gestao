/**
 * Script de Backup e Exportação do Supabase para Excel (.xlsx) com Envio para o Google Drive
 * Projeto: MSCA - Sistema de Gestão
 * 
 * Suporta:
 * 1. OAuth2 para Desktop App (oauth_credentials.json + token.json)
 * 2. Service Account (google_credentials.json)
 */

import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

// Carrega variáveis de ambiente
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fwilibswjtlshnhlhqrs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1XDmqkQK53nD5eyipQcb9xbNsnUa7BVR5';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
];
const TOKEN_PATH = path.resolve('token.json');
const OAUTH_PATH = path.resolve('oauth_credentials.json');
const SERVICE_KEY_PATH = path.resolve('google_credentials.json');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getFormattedTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}h${mins}`;
}

function applyHeaderStyle(row) {
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  row.height = 26;
}

function autoFitColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLen = 12;
    if (column.header) {
      maxLen = Math.max(maxLen, String(column.header).length + 4);
    }
    column.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLen && val.length < 60) {
        maxLen = val.length + 3;
      }
    });
    column.width = maxLen;
  });
}

function applyDataRowStyle(row, rowIndex, currencyColIndices = [], dateColIndices = []) {
  const isEven = rowIndex % 2 === 0;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    if (isEven) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };
    }
    
    // Moeda
    if (currencyColIndices.includes(colNumber)) {
      cell.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"R$ 0.00"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
    
    // Data
    if (dateColIndices.includes(colNumber)) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });
  row.height = 20;
}

async function fetchAll(table, selectQuery = '*', orderCol = 'created_at', ascending = false) {
  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select(selectQuery)
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Erro ao buscar dados da tabela ${table}:`, error);
      break;
    }
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
    }
    if (!data || data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }
  return allRows;
}

async function exportToExcel() {
  console.log('🔄 Conectando ao Supabase para extração dos dados...');
  console.log(`📡 URL: ${SUPABASE_URL}`);
  
  const [
    clients,
    credentials,
    entries,
    expenses,
    auditLogs,
    profiles
  ] = await Promise.all([
    fetchAll('clients', '*', 'razao_social', true),
    fetchAll('client_credentials', '*, clients(razao_social)', 'created_at', false),
    fetchAll('financial_entries', '*, clients(razao_social)', 'created_at', false),
    fetchAll('financial_expenses', '*', 'data_pagamento_previsao', false),
    fetchAll('audit_logs', '*', 'created_at', false),
    fetchAll('profiles', '*', 'created_at', false)
  ]);

  console.log(`📊 Registros extraídos:`);
  console.log(`   - Clientes: ${clients.length}`);
  console.log(`   - Credenciais: ${credentials.length}`);
  console.log(`   - Financeiro Entradas: ${entries.length}`);
  console.log(`   - Financeiro Saídas: ${expenses.length}`);
  console.log(`   - Auditoria Logs: ${auditLogs.length}`);
  console.log(`   - Perfis de Usuários: ${profiles.length}`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MSCA Gestão Contábil - Rotina de Backup';
  workbook.created = new Date();

  // 1. Clientes
  const wsClients = workbook.addWorksheet('Clientes', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsClients.columns = [
    { header: 'Status', key: 'status' },
    { header: 'Razão Social', key: 'razao_social' },
    { header: 'CNPJ', key: 'cnpj' },
    { header: 'CPF', key: 'cpf' },
    { header: 'Regime Tributário', key: 'regime_tributario' },
    { header: 'Início de Atividades', key: 'inicio_atividades' },
    { header: 'NIRE', key: 'nire' },
    { header: 'SIEG', key: 'sieg' },
    { header: 'Puro ou Híbrido', key: 'puro_ou_hibrido' },
    { header: 'Nº Pasta', key: 'numero_pasta' },
    { header: 'Localidade', key: 'localidade' },
    { header: 'Fator R', key: 'fator_r' },
    { header: 'Login Prefeitura', key: 'login_prefeitura' },
    { header: 'Senha Prefeitura', key: 'senha_prefeitura' },
    { header: 'Login Posto Fiscal', key: 'login_posto_fiscal' },
    { header: 'Senha Posto Fiscal', key: 'senha_posto_fiscal' },
    { header: 'Cód. Simples', key: 'codigo_acesso_simples' },
    { header: 'Cadastrado em', key: 'created_at' }
  ];
  applyHeaderStyle(wsClients.getRow(1));

  clients.forEach((c, idx) => {
    const row = wsClients.addRow({
      status: c.status || 'Ativo',
      razao_social: c.razao_social,
      cnpj: c.cnpj || '',
      cpf: c.cpf || '',
      regime_tributario: c.regime_tributario || '',
      inicio_atividades: c.inicio_atividades || '',
      nire: c.nire || '',
      sieg: c.sieg || '',
      puro_ou_hibrido: c.puro_ou_hibrido || '',
      numero_pasta: c.numero_pasta || '',
      localidade: c.localidade || '',
      fator_r: c.fator_r || '',
      login_prefeitura: c.login_prefeitura || '',
      senha_prefeitura: c.senha_prefeitura || '',
      login_posto_fiscal: c.login_posto_fiscal || '',
      senha_posto_fiscal: c.senha_posto_fiscal || '',
      codigo_acesso_simples: c.codigo_acesso_simples || '',
      created_at: c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : ''
    });
    applyDataRowStyle(row, idx + 2, [], [6, 18]);
  });
  autoFitColumns(wsClients);

  // 2. Credenciais
  const wsCreds = workbook.addWorksheet('Credenciais de Acesso', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsCreds.columns = [
    { header: 'Cliente (Razão Social)', key: 'cliente' },
    { header: 'Sistema / Portal', key: 'sistema_nome' },
    { header: 'Login / Usuário', key: 'login' },
    { header: 'Senha / Chave', key: 'senha' },
    { header: 'Cadastrado em', key: 'created_at' }
  ];
  applyHeaderStyle(wsCreds.getRow(1));

  credentials.forEach((cr, idx) => {
    const clientName = cr.clients?.razao_social || cr.client_id || 'Não vinculado';
    const row = wsCreds.addRow({
      cliente: clientName,
      sistema_nome: cr.sistema_nome,
      login: cr.login || '',
      senha: cr.senha || '',
      created_at: cr.created_at ? new Date(cr.created_at).toLocaleString('pt-BR') : ''
    });
    applyDataRowStyle(row, idx + 2, [], [5]);
  });
  autoFitColumns(wsCreds);

  // 3. Entradas
  const wsEntries = workbook.addWorksheet('Financeiro - Entradas', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsEntries.columns = [
    { header: 'Data Recebimento', key: 'data_recebimento' },
    { header: 'Competência', key: 'competencia' },
    { header: 'Cliente', key: 'cliente' },
    { header: 'Conta Contábil / Categoria', key: 'conta_contabil' },
    { header: 'Valor Previsto/Recebido', key: 'valor' },
    { header: 'Status', key: 'status' },
    { header: 'Banco / Conta', key: 'banco' },
    { header: 'Observação', key: 'observacao' },
    { header: 'Data de Lançamento', key: 'created_at' }
  ];
  applyHeaderStyle(wsEntries.getRow(1));

  entries.forEach((e, idx) => {
    const clientName = e.clients?.razao_social || e.cliente_nome_avulso || 'Cliente Geral';
    const row = wsEntries.addRow({
      data_recebimento: e.data_recebimento || 'À RECEBER',
      competencia: e.competencia,
      cliente: clientName,
      conta_contabil: e.conta_contabil,
      valor: Number(e.valor || 0),
      status: e.status,
      banco: e.banco || '-',
      observacao: e.observacao || '',
      created_at: e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : ''
    });
    applyDataRowStyle(row, idx + 2, [5], [1, 9]);
  });
  autoFitColumns(wsEntries);

  // 4. Saídas
  const wsExpenses = workbook.addWorksheet('Financeiro - Saídas', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsExpenses.columns = [
    { header: 'Data Pagamento / Previsão', key: 'data_pagamento_previsao' },
    { header: 'Competência', key: 'competencia' },
    { header: 'Descrição do Pagamento', key: 'descricao_pagamento' },
    { header: 'Conta Contábil / Categoria', key: 'conta_contabil' },
    { header: 'Valor Pago/Previsto', key: 'valor' },
    { header: 'Status', key: 'status' },
    { header: 'Forma de Pagamento / Banco', key: 'banco' },
    { header: 'Observação', key: 'observacao' },
    { header: 'Data de Lançamento', key: 'created_at' }
  ];
  applyHeaderStyle(wsExpenses.getRow(1));

  expenses.forEach((ex, idx) => {
    const row = wsExpenses.addRow({
      data_pagamento_previsao: ex.data_pagamento_previsao,
      competencia: ex.competencia,
      descricao_pagamento: ex.descricao_pagamento,
      conta_contabil: ex.conta_contabil,
      valor: Number(ex.valor || 0),
      status: ex.status,
      banco: ex.banco,
      observacao: ex.observacao || '',
      created_at: ex.created_at ? new Date(ex.created_at).toLocaleString('pt-BR') : ''
    });
    applyDataRowStyle(row, idx + 2, [5], [1, 9]);
  });
  autoFitColumns(wsExpenses);

  // 5. Auditoria
  const wsAudit = workbook.addWorksheet('Auditoria', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsAudit.columns = [
    { header: 'Data e Hora', key: 'created_at' },
    { header: 'Ação', key: 'action' },
    { header: 'Entidade', key: 'entity' },
    { header: 'Registro Afetado', key: 'entity_name' },
    { header: 'Usuário', key: 'user_name' },
    { header: 'E-mail do Usuário', key: 'user_email' },
    { header: 'IP', key: 'ip_address' },
    { header: 'Alterações Detalhadas (JSON)', key: 'changes' }
  ];
  applyHeaderStyle(wsAudit.getRow(1));

  auditLogs.forEach((a, idx) => {
    const row = wsAudit.addRow({
      created_at: a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : '',
      action: a.action,
      entity: a.entity,
      entity_name: a.entity_name || '',
      user_name: a.user_name || '',
      user_email: a.user_email || '',
      ip_address: a.ip_address || '',
      changes: a.changes ? JSON.stringify(a.changes, null, 2) : ''
    });
    applyDataRowStyle(row, idx + 2, [], [1]);
  });
  autoFitColumns(wsAudit);

  // 6. Usuários e Perfis
  const wsProfiles = workbook.addWorksheet('Usuários e Perfis', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsProfiles.columns = [
    { header: 'ID do Usuário', key: 'id' },
    { header: 'Nome Completo', key: 'full_name' },
    { header: 'E-mail', key: 'email' },
    { header: 'Perfil / Permissão', key: 'role' },
    { header: 'Data de Cadastro', key: 'created_at' }
  ];
  applyHeaderStyle(wsProfiles.getRow(1));

  profiles.forEach((p, idx) => {
    const row = wsProfiles.addRow({
      id: p.id,
      full_name: p.full_name || '',
      email: p.email,
      role: p.role,
      created_at: p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : ''
    });
    applyDataRowStyle(row, idx + 2, [], [5]);
  });
  autoFitColumns(wsProfiles);

  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const fileName = `Backup_MSCA_${getFormattedTimestamp()}.xlsx`;
  const filePath = path.join(backupsDir, fileName);

  await workbook.xlsx.writeFile(filePath);
  console.log(`\n✅ Planilha Excel gerada com sucesso!`);
  console.log(`📁 Local do arquivo: ${filePath}`);
  console.log(`📦 Tamanho: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);

  return { filePath, fileName };
}

// Obtém cliente autenticado via OAuth ou Service Account
async function getDriveAuthClient() {
  // 1. Checa Service Account
  if (fs.existsSync(SERVICE_KEY_PATH)) {
    console.log(`🔑 Usando credenciais Service Account de: ${SERVICE_KEY_PATH}`);
    return new google.auth.GoogleAuth({
      keyFile: SERVICE_KEY_PATH,
      scopes: SCOPES
    });
  }

  // 2. Checa OAuth Desktop Client
  if (fs.existsSync(OAUTH_PATH)) {
    const content = fs.readFileSync(OAUTH_PATH, 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'http://localhost:3333/oauth2callback'
    );

    // Se já tivermos o token salvo anteriormente
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
      return oAuth2Client;
    }

    // Se não tiver token, inicia fluxo de autorização local via browser
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url, 'http://localhost:3333');
          if (reqUrl.pathname === '/oauth2callback') {
            const code = reqUrl.searchParams.get('code');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #10b981;">Autenticação Concluída com Sucesso!</h1>
                <p>O MSCA Backup recebeu a autorização do Google Drive.</p>
                <p>Você pode fechar esta aba e voltar ao terminal.</p>
              </div>
            `);
            server.close();

            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log(`✅ Token de acesso salvo em: ${TOKEN_PATH}`);
            resolve(oAuth2Client);
          }
        } catch (err) {
          reject(err);
        }
      });

      server.listen(3333, () => {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent'
        });

        console.log('\n======================================================');
        console.log('👉 AUTORIZAÇÃO DO GOOGLE DRIVE NECESSÁRIA (APENAS 1ª VEZ):');
        console.log('Abra o link abaixo no seu navegador para autorizar o acesso:');
        console.log(authUrl);
        console.log('======================================================\n');

        // Tenta abrir o navegador automaticamente no Windows
        import('child_process').then(({ exec }) => {
          exec(`start "" "${authUrl}"`);
        });
      });
    });
  }

  throw new Error('Nenhuma credencial (oauth_credentials.json ou google_credentials.json) encontrada.');
}

async function uploadToGoogleDrive(filePath, fileName) {
  console.log(`\n📤 Conectando ao Google Drive...`);
  console.log(`📂 Pasta de Destino ID: ${GDRIVE_FOLDER_ID}`);

  const auth = await getDriveAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: fileName,
    parents: [GDRIVE_FOLDER_ID]
  };

  const media = {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: fs.createReadStream(filePath)
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink'
  });

  console.log(`\n🎉 Backup enviado com sucesso para o Google Drive!`);
  console.log(`🆔 File ID: ${res.data.id}`);
  console.log(`🔗 Link de Acesso: ${res.data.webViewLink}`);
  return res.data;
}

async function main() {
  try {
    const { filePath, fileName } = await exportToExcel();
    await uploadToGoogleDrive(filePath, fileName);
    process.exit(0);
  } catch (err) {
    console.error('❌ Falha no processo de backup:', err);
    process.exit(1);
  }
}

main();
