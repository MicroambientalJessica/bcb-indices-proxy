/**
 * Proxy Vercel v2 - API SGS do BCB (mais confiavel)
 * Busca serie historica diretamente da API do BCB
 */

const https = require('https');
const http = require('http');

// Series IDs do BCB
const SERIES = {
  ipca: '13522',      // IPCA - acumulado 12 meses
  igp_m: '11255',     // IGP-M - acumulado 12 meses
  inpc: '10846',      // INPC - acumulado 12 meses
  ipc: '4391'         // IPC - variacao mensal
};

async function fetchFromBCB(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    };

    const req = protocol.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
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

async function buscarSerieHistorica(serieId) {
  /**
   * Busca dados de uma serie do BCB
   * Tenta 3 endpoints diferentes para redundancia
   */

  const urls = [
    `https://www.bcb.gov.br/api/dados/v1/serie_temporal/${serieId}/dados?formato=json`,
    `https://www3.bcb.gov.br/wps/wcm/connect/${serieId}/dados?formato=json`,
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serieId}/dados?formato=json`
  ];

  let ultimoErro = null;

  for (const url of urls) {
    try {
      const response = await fetchFromBCB(url);
      const dados = JSON.parse(response);

      // Formato: [{ data: "DD/MM/YYYY", valor: "4.50" }, ...]
      if (Array.isArray(dados)) {
        for (let i = dados.length - 1; i >= 0; i--) {
          const item = dados[i];
          if (item.valor && item.valor !== '' && item.valor !== '0') {
            return {
              valor: parseFloat(item.valor.replace(',', '.')),
              data: item.data,
              fonte: 'BCB SGS'
            };
          }
        }
      } else if (dados.dados && Array.isArray(dados.dados)) {
        // Formato alternativo
        for (let i = dados.dados.length - 1; i >= 0; i--) {
          const item = dados.dados[i];
          if (item.valor && item.valor !== '' && item.valor !== '0') {
            return {
              valor: parseFloat(item.valor.replace(',', '.')),
              data: item.data,
              fonte: 'BCB SGS'
            };
          }
        }
      }
    } catch (e) {
      ultimoErro = e.message;
      continue; // Tenta proxima URL
    }
  }

  throw new Error(`Nao foi possivel buscar serie ${serieId}. Ultimo erro: ${ultimoErro}`);
}

async function obterTodosIndices() {
  /**
   * Busca todos os indices em paralelo
   */
  const promessas = [];

  for (const [key, id] of Object.entries(SERIES)) {
    promessas.push(
      buscarSerieHistorica(id)
        .then(resultado => ({ [key]: resultado }))
        .catch(erro => ({ [key]: { erro: erro.message, valor: null } }))
    );
  }

  const resultados = await Promise.all(promessas);
  const indices = {};

  resultados.forEach(resultado => {
    Object.assign(indices, resultado);
  });

  return indices;
}

module.exports = async (req, res) => {
  // CORS Headers
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
    console.log('Buscando indices do BCB...');

    const indices = await obterTodosIndices();

    // Formatar resposta
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
        proxy: 'Vercel Serverless v2',
        fonte: 'BCB API SGS',
        documentacao: 'https://www.bcb.gov.br/api/',
        series: {
          ipca: '13522 (acumulado 12 meses)',
          igp_m: '11255 (acumulado 12 meses)',
          inpc: '10846 (acumulado 12 meses)',
          ipc: '4391 (variacao mensal)'
        }
      }
    };

    // Verificar se conseguiu obter pelo menos alguns indices
    const temDados = resposta.data.ipca || resposta.data.igp_m || resposta.data.inpc || resposta.data.ipc;

    if (!temDados) {
      return res.status(503).json({
        success: false,
        error: 'BCB APIs indisponiveis no momento',
        timestamp: new Date().toISOString(),
        hint: 'Tente novamente em alguns minutos'
      });
    }

    res.status(200).json(resposta);
  } catch (error) {
    console.error('Erro geral:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hint: 'Verifique se o BCB esta disponivel e tente novamente'
    });
  }
};
