import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configurações de Supabase ausentes em .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Função para parsear linha de CSV respeitando aspas
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Limpa e normaliza strings
function cleanString(val) {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed === '' || trimmed === '-' || trimmed.toUpperCase() === 'N/A') return null;
  return trimmed;
}

// Limpa apenas dígitos (para CNPJ e CPF)
function cleanDigits(val) {
  if (!val) return null;
  const digits = val.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

// Valida ou formata data YYYY-MM-DD
function parseDate(val) {
  if (!val) return null;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

// Normaliza status
function normalizeStatus(val) {
  if (!val) return 'Ativo';
  const clean = val.trim().toUpperCase();
  if (clean === 'ATIVO') return 'Ativo';
  if (clean === 'INATIVO' || clean === 'INATIVA') return 'Inativo';
  if (clean === 'BAIXADA' || clean === 'BAIXADO') return 'Baixada';
  if (clean === 'TRANSFERIDO' || clean === 'TRANSFERIDA') return 'Transferido';
  if (clean === 'INADIMPLENTE') return 'Inadimplente';
  return val.trim();
}

async function runImport() {
  const csvPath = path.resolve('scripts/clientes_import.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV não encontrado em:', csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length <= 1) {
    console.error('Arquivo CSV vazio ou sem dados.');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]);
  console.log(`Lendo ${lines.length - 1} registros para importação...`);

  let importedCount = 0;
  let credentialsCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 12) continue;

    const rawStatus = cols[0];
    const rawInicio = cols[1];
    const rawSieg = cols[2];
    const rawCnpjFormatado = cols[3];
    const rawCnpjLimpo = cols[4];
    const rawNire = cols[5];
    const rawCpf = cols[6];
    const rawRegime = cols[7];
    const rawPuroHibrido = cols[8];
    const rawCodSimples = cols[9];
    const rawNumeroPasta = cols[10];
    const rawRazaoSocial = cols[11];
    const rawLocalidade = cols[12];
    const rawFatorR = cols[13];
    const rawLoginPref = cols[14];
    const rawSenhaPref = cols[15];
    const rawLoginPosto = cols[16];
    const rawSenhaPosto = cols[17];

    const razaoSocial = cleanString(rawRazaoSocial);
    if (!razaoSocial) {
      console.warn(`Linha ${i + 1} ignorada: sem Razão Social.`);
      continue;
    }

    // CNPJ: usa o de dígitos puros ou extrai
    const cnpj = cleanDigits(rawCnpjLimpo) || cleanDigits(rawCnpjFormatado);
    const cpf = cleanDigits(rawCpf);

    // Monta payload do cliente
    const clientPayload = {
      status: normalizeStatus(rawStatus),
      inicio_atividades: parseDate(rawInicio),
      sieg: cleanString(rawSieg),
      cnpj: cnpj ? cnpj.substring(0, 14) : null,
      nire: cleanString(rawNire),
      cpf: cpf ? cpf.substring(0, 11) : null,
      regime_tributario: cleanString(rawRegime),
      puro_ou_hibrido: cleanString(rawPuroHibrido),
      codigo_acesso_simples: cleanString(rawCodSimples),
      numero_pasta: cleanString(rawNumeroPasta),
      razao_social: razaoSocial,
      localidade: cleanString(rawLocalidade),
      fator_r: cleanString(rawFatorR),
      login_prefeitura: cleanString(rawLoginPref),
      senha_prefeitura: cleanString(rawSenhaPref),
      login_posto_fiscal: cleanString(rawLoginPosto),
      senha_posto_fiscal: cleanString(rawSenhaPosto),
    };

    // Insere o cliente
    const { data: insertedClient, error: clientErr } = await supabase
      .from('clients')
      .insert([clientPayload])
      .select('id, razao_social')
      .single();

    if (clientErr) {
      console.error(`Erro ao inserir cliente [${razaoSocial}]:`, clientErr.message);
      continue;
    }

    importedCount++;
    const clientId = insertedClient.id;

    // Sistemas Extras (colunas 18 a 26 no CSV original: SISTEMA 1, LOGIN 1, SENHA 1, SISTEMA 2, ...)
    const extraCredentials = [];
    for (let c = 18; c < cols.length; c += 3) {
      const sis = cleanString(cols[c]);
      const login = cleanString(cols[c + 1]);
      const senha = cleanString(cols[c + 2]);

      if (sis || login || senha) {
        extraCredentials.push({
          client_id: clientId,
          sistema_nome: sis || 'Acesso Extra',
          login: login || null,
          senha: senha || null,
        });
      }
    }

    if (extraCredentials.length > 0) {
      const { error: credErr } = await supabase
        .from('client_credentials')
        .insert(extraCredentials);

      if (credErr) {
        console.error(`Erro ao salvar credenciais extras de [${razaoSocial}]:`, credErr.message);
      } else {
        credentialsCount += extraCredentials.length;
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`IMPORTAÇÃO CONCLUÍDA COM SUCESSO!`);
  console.log(`Clientes importados: ${importedCount}`);
  console.log(`Credenciais/Sistemas extras: ${credentialsCount}`);
  console.log(`========================================\n`);
}

runImport();
