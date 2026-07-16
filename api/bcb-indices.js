module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { codigo, dataInicial, dataFinal } = req.query;

  if (!codigo) {
    res.status(400).json({
      erro: 'Parametro "codigo" e obrigatorio. Exemplo: ?codigo=433 (IPCA)'
    });
    return;
  }

  let url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json`;

  if (dataInicial) {
    url += `&dataInicial=${dataInicial}`;
  }
  if (dataFinal) {
    url += `&dataFinal=${dataFinal}`;
  }

  try {
    const resposta = await fetch(url);

    if (!resposta.ok) {
      res.status(resposta.status).json({
        erro: `Erro ao consultar API do Banco Central (status ${resposta.status})`
      });
      return;
    }

    const dados = await resposta.json();
    res.status(200).json(dados);
  } catch (erro) {
    res.status(500).json({
      erro: 'Erro interno ao buscar dados do Banco Central',
      detalhes: erro.message
    });
  }
};
