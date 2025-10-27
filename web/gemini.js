document.getElementById('send-prompt').addEventListener('click', async () => {
    const promptInput = document.getElementById('prompt-input').value.trim();
    const insightsResult = document.getElementById('insights-result');
    const loadingIndicator = document.getElementById('loading-indicator');

    // Limpa resultados anteriores e exibe o indicador de carregamento
    insightsResult.innerHTML = '';
    loadingIndicator.style.display = 'block';

    try {
        // Verifica se o prompt está vazio
        if (!promptInput) {
            insightsResult.innerHTML = '<p class="text-danger">Por favor, insira uma pergunta ou comando.</p>';
            loadingIndicator.style.display = 'none';
            return;
        }

        const token = document.getElementById('gemini-token').value;
        const initialIAContext = 'Você é um agilista especialista em analisar dados de desempenho de equipes a partir de dados do jira.'
        // Dados do gráfico (monthlyData) para enviar à IA
        const data = window.jiraData;
        const dataJsonReference = JSON.stringify(data);

        const aiResponse = await iaCall(token, initialIAContext, dataJsonReference, promptInput)

        // Exibe a resposta da IA
        insightsResult.innerHTML = `<h5>Insights:</h5><p>${aiResponse}</p>`;
    } catch (error) {
        console.error('Erro ao gerar insights:', error.response.data.error.message);
        insightsResult.innerHTML = '<p class="text-danger">Erro ao gerar insights. '+error.response.data.error.message+'.</p>';
    } finally {
        loadingIndicator.style.display = 'none';
    }
});

async function iaCall(token, initialIAContext, dataJsonReference, userAdditionalInput) {
  const modelName = "gemini-2.5-flash-lite"; // adapte para o modelo que você habilitou
  const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`;

  // Formata o JSON de referência
  let refFormatted = "";
  if (dataJsonReference) {
    try {
      const parsed = typeof dataJsonReference === "string"
        ? JSON.parse(dataJsonReference)
        : dataJsonReference;
      refFormatted = JSON.stringify(parsed, null, 2);
    } catch (e) {
      refFormatted = `JSON inválido:\n${dataJsonReference}`;
    }
  }

  // Monta o prompt
  const promptParts = [];
  if (initialIAContext) {
    promptParts.push({ text: `# CONTEXTO\n${initialIAContext}` });
  }
  if (refFormatted) {
    promptParts.push({ text: `# REFERÊNCIA (JSON)\n\`\`\`json\n${refFormatted}\n\`\`\`` });
  }
  promptParts.push({ text: `# PERGUNTA\n${userAdditionalInput}` });

  // Corpo da requisição
  const body = {
    contents: [
      {
        role: "user",
        parts: promptParts
      }
    ],
    generationConfig: {
      temperature: 0.4,
      topK: 40,
      topP: 0.9,
      maxOutputTokens: 2048
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': token
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
               data?.candidates?.[0]?.output_text ||
               '(Sem resposta)';

  return text;
}
