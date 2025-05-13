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

        // Dados do gráfico (monthlyData) para enviar à IA
        const data = window.jiraData.monthlyData;

        // Chamada à API do OpenAI
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'Você é um assistente que analisa dados de desempenho de equipes.' },
                { role: 'user', content: `Com base nos seguintes dados: ${JSON.stringify(data)}, responda: ${promptInput}` }
            ],
            max_tokens: 5000
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ''
            }
        });

        // Exibe a resposta da IA
        const aiResponse = response.data.choices[0].message.content;
        insightsResult.innerHTML = `<h5>Insights:</h5><p>${aiResponse}</p>`;
    } catch (error) {
        console.error('Erro ao gerar insights:', error.response.data.error.message);
        insightsResult.innerHTML = '<p class="text-danger">Erro ao gerar insights. '+error.response.data.error.message+'.</p>';
    } finally {
        loadingIndicator.style.display = 'none';
    }
});