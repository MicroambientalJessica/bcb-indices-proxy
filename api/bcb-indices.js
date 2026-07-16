/**
 * Proxy Vercel v3 - API SGS do BCB
 * Usa apenas o endpoint oficial e confiavel api.bcb.gov.br
 * IPCA: serie 13522 (ja acumulada em 12 meses)
 * IGP-M e INPC: calculados a partir das series mensais (189 e 188),
 *   compondo os ultimos 12 meses, pois nao ha series 'acumulado 12 meses'
 *   confiavel e atualizada para esses indices no SGS.
 * IPC: serie 4391 (variacao mensal)
 */

const https = require('https');

const SERIES = {
  ipca: { codigo: '13522', tipo: 'direto' },
  igp_m: { codigo: '189', tipo: 'acumulado12' },
  inpc: { codigo: '188', tipo: 'acumulado12' },
  ipc: { codigo: '4391', tipo: 'direto' }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Resposta invalida do BCB: ${e.message}`));
          }
        } else {
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de conexao: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function buscarUltimos(codigo, quantidade) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${quantidade}?formato=json`;
  const dados = await fetchJSON(url);
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error(`Sem dados para a serie ${codigo}`);
  }
  return dados;
}

async function valorDireto(codigo) {
  const dados = await buscarUltimos(codigo, 1);
  const item = dados[dados.length - 1];
  return {
    valor: parseFloat(String(item.valor).replace(',', '.')),
    data: item.data
  };
}

async function valorAcumulado12Meses(codigo) {
  const dados = await buscarUltimos(codigo, 12);
  let fator = 1;
  for (const item of dados) {
    const v = parseFloat(String(item.valor).replace(',', '.'));
    fator *= (1 + v / 100);
  }
  const acumulado = (fator - 1) * 100;
  return {
    valor: Math.round(acumulado * 100) / 100,
    data: dados[dados.length - 1].data
  };
}

async function buscarIndice(config) {
  return config.tipo === 'acumulado12'
    ? valorAcumulado12Meses(config.codigo)
    : valorDireto(config.codigo);
}

async function obterTodosIndices() {
  const chaves = Object.keys(SERIES);
  const resultados = await Promise.all(
    chaves.map((chave) =>
      buscarIndice(SERIES[chave])
        .then((resultado) => ({ chave, resultado }))
        .catch((erro) => ({ chave, erro: erro.message }))
    )
  );

  const indices = {};
  resultados.forEach(({ chave, resultado, erro }) => {
    indices[chave] = resultado || { valor: null, data: null, erro };
  });

  return indices;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'max-age=3600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Metodo nao permitido. Use GET.'
    });
  }

  try {
    const indices = await obterTodosIndices();

    const resposta = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        ipca: indices.ipca?.valor ?? null,
        igp_m: indices.igp_m?.valor ?? null,
        inpc: indices.inpc?.valor ?? null,
        ipc: indices.ipc?.valor ?? null,
        data_atualizacao: new Date().toISOString()
      },
      metadados: {
        ipca_data: indices.ipca?.data ?? null,
        igp_m_data: indices.igp_m?.data ?? null,
        inpc_data: indices.inpc?.data ?? null,
        ipc_data: indices.ipc?.data ?? null
      },
      info: {
        proxy: 'Vercel Serverless v3',
        fonte: 'BCB API SGS (api.bcb.gov.br)',
        documentacao: 'https://www.bcb.gov.br/api/',
        series: {
          ipca: '13522 (acumulado 12 meses, direto do SGS)',
          igp_m: '189 (variacao mensal, acumulado calculado sobre os ultimos 12 meses)',
          inpc: '188 (variacao mensal, acumulado calculado sobre os ultimos 12 meses)',
          ipc: '4391 (variacao mensal)'
        }
      }
    };

    const temDados = resposta.data.ipca !== null || resposta.data.igp_m !== null ||
      resposta.data.inpc !== null || resposta.data.ipc !== null;

    if (!temDados) {
      return res.status(503).json({
        success: false,
        error: 'BCB API indisponivel no momento',
        timestamp: new Date().toISOString(),
        hint: 'Tente novamente em alguns minutos'
      });
    }

    res.status(200).json(resposta);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hint: 'Verifique se o BCB esta disponivel e tente novamente'
    });
  }
};
