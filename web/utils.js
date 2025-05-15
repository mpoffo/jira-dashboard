function randomColor() {
  const randomValue = () => Math.floor(Math.random() * 256);
  return `#${((1 << 24) + (randomValue() << 16) + (randomValue() << 8) + randomValue()).toString(16).slice(1)}`;
}

function workDays(monthStr, feriados = []) {
  const [ano, mes] = monthStr.split('-').map(Number);        // 2025‑01  →  [2025, 1]
  const feriadosSet = new Set(feriados);                     // lookup O(1)
  let uteis = 0;

  // Começa no primeiro dia do mês (mes‑1 porque Date usa base 0 para mês)
  for (let d = new Date(ano, mes - 1, 1); d.getMonth() === mes - 1; d.setDate(d.getDate() + 1)) {
    const diaSemana = d.getDay();                            // 0 = domingo, 6 = sábado
    const iso = d.toISOString().slice(0, 10);                // "YYYY-MM-DD"

    const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
    const ehFeriado = feriadosSet.has(iso);

    if (!ehFimDeSemana && !ehFeriado) uteis++;
  }
  return uteis;
}

// Função para carregar valores dos cookies nos inputs
function loadConfigFromCookies() {
  const project = Cookies.get('project') || '';
  const team = Cookies.get('team') || ''; 
  const tamanho = Cookies.get('tamanho') || 'P-4,M-6,G-8';

  // Define os valores nos inputs
  document.getElementById('project').value = project;
  document.getElementById('team').value = team;
  document.getElementById('tamanho').value = tamanho;
}

// Função para salvar valores dos inputs nos cookies
function saveConfigToCookies() {
  const project = document.getElementById('project').value.trim();
  const team = document.getElementById('team').value.trim();
  const tamanho = document.getElementById('tamanho').value.trim();
  Cookies.set('project', project);
  Cookies.set('team', team);
  Cookies.set('tamanho', tamanho);
}

function copyTable(dt) {
  const order = dt.colReorder.order();
  const header = order.map(i => $(dt.column(i).header()).text());
  const rows = dt.rows({ search: 'applied', order: 'applied' }).data().toArray();
  let text = header.join('\t') + '\r';
  rows.forEach(r => { text += order.map(i => r[i]).join('\t') + '\r'; });
  navigator.clipboard.writeText(text);
  alert('Tabela copiada para a área de transferência! Só colar no Excel!');
}

function average(nums) {
  return nums.length ? + (nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2) : 0;
}

function sum(nums) {
  return nums.reduce((s, v) => s + v, 0);
}

function trimmedMean(nums) {
  const src = nums.filter(n => n > 0).sort((a, b) => a - b);
  if (src.length < TRIMMED_PERCENT / 10) return average(src);
  const cut = (100 - TRIMMED_PERCENT) / 2 / 100;
  const low = Math.floor(src.length * cut);
  const high = src.length - low;
  return average(src.slice(low, high));
}