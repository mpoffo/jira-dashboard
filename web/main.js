const TRIMMED_PERCENT = 80;                   // % central da média aparada
const WORKING_HOURS = 7.5;
const SENIOR_EFFICIENCY_MED = 35;            // Eficiência média Senior (80%)
const MINIMUM_HOURS_HEADCOUNT = 40

const colors = ["#bfdb5c", "#1a1faf", "#f19f12", "#fdc34b", "#08e0b8", "#482fa2"];

loadConfigFromCookies();

/* ---------- globals preenchidos em runtime ------------------------ */
let issueList = [];   // issues normalizadas
let monthlyData = [];   // métricas agregadas
let flatWorklogTable = [];

async function fetchIssues(project) {
  if (!project) {
    alert('Informe o nome do projeto.');
    return;
  }
  const response = await fetch(project + '.json');
  if (!response.ok) throw new Error('Não foi possivel carregar os dados do Jira. Considere extrair novamente.');
  return response.json();
}

team = document.getElementById('team').value.split(",").map(t => t.trim().toLowerCase())
if (team.length == 0) {
  alert('Informe os usuários do time separados por vírgula nas configurações.');
}
team.sort((a, b) => a.localeCompare(b));

function buildMonthlyMetrics() {
  const bucket = {};
  let allWorklog = [];

  issueList
    .filter(issue => ['Bug', 'Story'].includes(issue.type))
    .forEach(issue => {
      if (issue.resolved) {
        const monthKey = issue.resolved.slice(0, 7);       // YYYY-MM
        if (!bucket[monthKey]) {
          bucket[monthKey] = [];
        }
        bucket[monthKey].push(issue);
      }

      //apontamentos considera de issues não concluídas também
      issue.worklog.forEach(worklog => {
        worklog.author = worklog.author.toLowerCase();
        if (team.includes(worklog.author)) {
          const month = worklog.started.slice(0, 7);
          worklog.key = issue.key;
          worklog.summary = issue.summary;
          allWorklog.push({ ...worklog, month });
        }
      });
    });

  // Cria uma lista flat com {month, author, ...worklog}
  // Acumula timeSpent para mesma issue, autor e mês  
  let worklogMap = {};

  allWorklog.forEach(worklog => {
    if (!team.includes(worklog.author)) return;
    const key = `${worklog.key}|${worklog.author}|${worklog.month}`;
    if (!worklogMap[key]) {
      worklogMap[key] = {
        month: worklog.month,
        author: worklog.author,
        key: worklog.key,
        summary: worklog.summary,
        timeSpent: 0
      };
    }
    worklogMap[key].timeSpent += worklog.timeSpent;
  });

  flatWorklogTable = Object.values(worklogMap);

  monthlyData = Object.entries(bucket).map(([month, arr]) => {
    const take = prop => arr.map(issue => issue[prop]);
    const takeNZ = prop => take(prop).filter(n => n > 0);
    const takeStory = prop => arr.filter(issue => issue.type == 'Story').map(issue => issue[prop]);
    const takeBug = prop => arr.filter(issue => issue.type == 'Bug').map(issue => issue[prop]);
    //const worklogs = prop => allWorklog.filter(wl => wl.month === month).map(wl => wl[prop]);
    const worklogsFiltered = flatWorklogTable.filter(wl => wl.month === month);
    const worklogs = prop => worklogsFiltered.map(wl => wl[prop]);
    const retrabalho = arr.filter(issue=>issue.labels.includes('Retrabalho'));

    const m = { Mes: month };

    m['Throughput'] = arr.length;
    m['Retrabalho Geral'] = retrabalho.length;
    m['Eficiência Média'] = average(take('efficiency'));
    m['Eficiência (80%)'] = trimmedMean(take('efficiency'));
    m['Tamanho Médio'] = average(take('sizeLead'));
    m['Tamanho Médio Story'] = average(takeStory('sizeLead'));
    m['Tamanho Médio Bug'] = average(takeBug('sizeLead'));
    m['TamanhoEmLeadTime Médio'] = average(takeNZ('sizeLead'));
    m['TamanhoEmLeadTime (80%)'] = trimmedMean(take('sizeLead'));
    m['Apontamento de Horas'] = sum(worklogs('timeSpent'));

    //Indicadores por membro
    team.forEach((member) => {
      const memberWorklogs = prop => worklogsFiltered.filter(wl => wl.month === month && wl.author === member)
        .map(wl => wl[prop]);
      m[member] = sum(memberWorklogs('timeSpent'));
      m['R-' + member] = retrabalho.filter(issue => issue.assignee == member).length; //Retrabalhos
    });

    m['HeadCount'] = [...new Set(worklogsFiltered
      .filter(wl => wl.month === month && team.includes(wl.author) && m[wl.author] >= MINIMUM_HOURS_HEADCOUNT)
      .map(wl => wl.author))].length;

    [
      ['lt', 'LeadTime Geral'],
      ['ltProgress', 'LeadTime InProgress'],
      ['ltCodeRev', 'LeadTime CodeReview'],
      ['ltTodoRev', 'LeadTime TodoReview'],
      ['ltReview', 'LeadTime Review'],
      ['ltRTD', 'LeadTime RTD']
    ].forEach(([prop, label]) => {
      m[label] = average(takeNZ(prop));
      m[`${label} (80%)`] = trimmedMean(take(prop));
    });
    return m;
  }).sort((a, b) => a.Mes.localeCompare(b.Mes));

  monthlyData.forEach(m => {
    const month = m.Mes;
    const days = workDays(month);

    let throughputMedPP = (m.Throughput > 0 && m.HeadCount > 0) ? (m.Throughput / m.HeadCount) : 0
    m['Throughput Médio Por Pessoa'] = throughputMedPP.toFixed(2)
    m['Eficiência Média Senior'] = SENIOR_EFFICIENCY_MED;
    m['Apontamento Esperado'] = days * WORKING_HOURS;
    m['Apontamento Esperado Time'] = days * WORKING_HOURS * m.HeadCount;
  });
  window.jiraData = monthlyData;
}

function renderCharts() {
  let colorIndex = 0;
  let expectedTeamSpentSeries = [
    ...team.map(member => [member, colors[colorIndex++], 'bar']),
    ['Apontamento Esperado', '#ff5733', 'line'],
  ];

  colorIndex = 0;
  let retrabalhoDoTime = [
    ...team.map(member => ['R-' + member, colors[colorIndex++], 'bar']),
    ['Retrabalho Geral', '#ff5733', 'line'],
  ];

  const chartConfigs = [
    {
      id: 'chartComparativo', type: 'bar',
      title: 'TamanhoEmLeadTime × LeadTime Geral',
      series: [
        ['TamanhoEmLeadTime Médio', 'red', 'line'],
        ['LeadTime Geral', 'blue'],
        ['LeadTime Geral (80%)', 'lightblue'],
      ]
    }, {
      id: 'chartSpentByMember', type: 'bar',
      title: 'Apontamento de Horas por Pessoa',
      series: expectedTeamSpentSeries
    }, {
      id: 'chartThroughput', type: 'line', title: 'Throughput x Eficiência',
      series: [
        ['Throughput', '#36b9cc'],
        ['Eficiência Média', '#4e73df'],
        ['Retrabalho Geral', 'red', 'line']]
    },
    {
      id: 'chartTimeSpent', type: 'line', title: 'Apontamento de Horas',
      series: [
        ['Apontamento de Horas', '#36b9cc'],
        ['Apontamento Esperado Time', 'red', 'line'],
        ['HeadCount', 'orange']
      ]
    }, {
      id: 'chartThroughputPP', type: 'line', title: 'Throughput x Por Pessoa x HeadCount',
      series: [
        ['Throughput', '#36b9cc'],
        ['Throughput Médio Por Pessoa', 'green'],
        ['HeadCount', 'orange']
      ]
    }, {
      id: 'chartSizeMed', type: 'line', title: 'Tamanho Médio',
      series: [
        ['Tamanho Médio', 'blue'],
        ['Tamanho Médio Story', 'green'],
        ['Tamanho Médio Bug', 'red']
      ]
    }, {
      id: 'chartEficiencia', type: 'line', title: 'Eficiência de Fluxo',
      series: [
        ['Eficiência Média', '#4e73df'],
        ['Eficiência (80%)', '#1cc88a'],
        ['Eficiência Média Senior', 'red', 'line']
      ]
    }, {
      id: 'chartLtGeral', type: 'line', title: 'Lead Time Geral',
      series: [
        ['LeadTime Geral', '#e74a3b'],
        ['LeadTime Geral (80%)', '#e74a3ba0']
      ]
    }, {
      id: 'chartLtInProg', type: 'line', title: 'Lead Time In Progress',
      series: [
        ['LeadTime InProgress', '#5a5c69'],
        ['LeadTime InProgress (80%)', '#2e59d9']
      ]
    }, {
      id: 'chartLtCR', type: 'line', title: 'Lead Time Code Review',
      series: [
        ['LeadTime CodeReview', '#1cc88a'],
        ['LeadTime CodeReview (80%)', '#17a673']
      ]
    }, {
      id: 'chartLtTodo', type: 'line', title: 'Lead Time To Do Review',
      series: [
        ['LeadTime TodoReview', '#f6c23e'],
        ['LeadTime TodoReview (80%)', '#dda20a']
      ]
    }, {
      id: 'chartLtRev', type: 'line', title: 'Lead Time Review',
      series: [
        ['LeadTime Review', '#36b9cc'],
        ['LeadTime Review (80%)', '#2c9faf']
      ]
    }, {
      id: 'chartLtRTD', type: 'line', title: 'Lead Time RTD',
      series: [
        ['LeadTime RTD', '#36b9cc'],
        ['LeadTime RTD (80%)', '#2c9faf']
      ]
    }
    , {
      id: 'chartTimeSpentByAuthor', type: 'line', title: 'Apontamento de Horas por Pessoa',
      series: [
        ['Apontamento de Horas', '#36b9cc']
      ]
    }, {
      id: 'chartRetrabalho', type: 'line', title: 'Retrabalho do time',
      series: retrabalhoDoTime
    }
  ];

  const labels = monthlyData.map(m => m.Mes);
  chartConfigs.forEach(cfg => {
    const datasets = cfg.series.map(([field, color, type]) => ({
      label: field,
      data: monthlyData.map(m => m[field] || 0),
      borderColor: color,
      backgroundColor: color,
      type: type ? type : cfg.type,
      fill: cfg.type === 'bar' && type != 'line'
    }));

    new Chart(
      document.getElementById(cfg.id),
      {
        type: cfg.type,
        data: { labels, datasets },
        options: {
          responsive: true,
          aspectRatio: 2,
          plugins: {
            title: { display: true, text: cfg.title, font: { size: 16 } },
            legend: { labels: { font: { size: 14 } } }
          },
          onClick: (evt, elements) => {
            if (['chartSpentByMember', 'chartTimeSpent'].includes(cfg.id)) {
              openModalDetails(flatWorklogTable, evt, elements, labels);
            } else {
              openModalDetails(issueList, evt, elements, labels);
            }
          }
        }
      }
    );
  });
}

/* ==================================================================
   6. Modal Detalhes (DataTable colReorder, filtro e copiar)
   ================================================================== */
const $table = $('#tblDetalhes');
const $thead = $('#tblHead');
const $tbody = $('#tblBody');
const detailsModal = new bootstrap.Modal('#modalDetalhes');

function openModalDetailsForAll() {
  openModalDetails(issueList, null, null, null, true)
}

function openModalDetails(data, evt, elements, labels, all) {
  let monthIssues = [];
  if (!all) {
    if (!elements.length) return;

    const monthKey = labels[elements[0].index];
    document.getElementById('lblMes').textContent = monthKey;

    monthIssues = data.filter(i => (i.resolved && i.resolved.startsWith(monthKey)) || (i.month && i.month === monthKey));
  } else {
    document.getElementById('lblMes').textContent = "Todas as issues";
    monthIssues = issueList;
  }
  if (!monthIssues.length) return;

  const columns = ['Seq', ...Object.keys(monthIssues[0])].filter(c => c != 'worklog');

  if ($.fn.DataTable.isDataTable($table)) $table.DataTable().clear().destroy();
  $thead.html('<tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr>');
  $tbody.html(monthIssues.map(issue => {
    const row = columns.map(col => {
      let value = issue[col] || '';
      if(col == 'key'){
        value = `<a href="https://jira.senior.com.br/browse/${value}" target="_blank">${value}</a>`;
        return `<td>${value}</td>`;
      }
      if (['created', 'updated', 'resolved'].includes(col.toLowerCase()) && value) {
        value = new Date(value).toLocaleDateString('pt-BR');
      } else if (!isNaN(value) && value !== '') {
        value = Number(value).toLocaleString('pt-BR');
      }
      tdclass = "class='truncate-13'";
      if (['summary', 'feature_name', 'issueLink'].includes(col)) {
        tdclass = "class='truncate-20'";
      }
      return `<td ${tdclass} title="${value}">${value}</td>`;
    }).join('');
    return `<tr>${row}</tr>`;
  }).join(''));

  const dt = $table.DataTable({
    paging: false,
    searching: true,
    ordering: true,
    info: false,
    colReorder: true,
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' },
    initComplete() {
      this.api().columns().every(function () {
        const column = this;
        const header = $(column.header()).empty().text(columns[column.index()]);
        $('<input>', { class: 'filter-input', placeholder: 'filtrar…' })
          .appendTo(header)
          .on('keyup input', function () { column.search(this.value).draw(); });
      });
    },
    drawCallback() {
      this.api().column(0, { search: 'applied', order: 'applied' })
        .nodes().each((cell, i) => { cell.innerHTML = i + 1; });
    }
  });

  /* Botões de copiar e resetar colunas */
  $('#btnCopiar').off().on('click', () => copyTable(dt));
  $('#btnReset').off().on('click', () => dt.colReorder.reset());

  detailsModal.show();
}

function onViewAll() {
  openModalDetailsForAll();
}

async function requestExtractIssues() {
  const loadingIndicator = document.getElementById('loading-indicator');
  try {
    loadingIndicator.style.display = 'block';

    // Obtém o host da página dinamicamente
    const host = `${window.location.protocol}//${window.location.hostname}:8001`;
    const tamanho = document.getElementById('tamanho').value
    // Faz a requisição ao servidor Flask
    const response = await fetch(`${host}/extract_issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project, tamanho}),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao extrair issues.');
    }

    const data = await response.json();
    console.log(data.message);
    bootstrapDashboard();
    alert(data.message); // Exibe uma mensagem de sucesso
  } catch (error) {
    console.error('Erro ao fazer o request:', error.message);
    alert(`Erro: ${error.message}`); // Exibe uma mensagem de erro
  } finally {
    loadingIndicator.style.display = 'none'; // Esconde o indicador de carregamento
  }

}

// Adiciona o evento ao botão para extrair issues
project = 'HCMDOF';
setTimeout(() => {
  document.getElementById('btnExtractIssues').addEventListener('click', () => {
    project = document.getElementById('project').value;
    if (project) {
      requestExtractIssues();
    } else {
      alert('Por favor, insira o nome do projeto.');
    }
  });
  $('#btnVielAll').off().on('click', onViewAll);
});


// Adiciona evento ao formulário de configurações
document.getElementById('formConfiguracao').addEventListener('submit', (event) => {
  saveConfigToCookies(); // Salva as configurações nos cookies
});

/* ==================================================================
   7. Pipeline de inicialização
   ================================================================== */
function bootstrapDashboard() {
  try {
    project = document.getElementById('project').value;
    fetchIssues(project).then(data => {
      if (data.issues.length) {
        issueList = data.issues;
        buildMonthlyMetrics();
        renderCharts();
        if(data.issues){
          drawGanttChart(data.features, data.issues);
        }
      }
    });
  } catch (err) {
    console.error(err);
    alert('Erro ao carregar dados do Jira: ' + err.message);
  }
};
bootstrapDashboard();
