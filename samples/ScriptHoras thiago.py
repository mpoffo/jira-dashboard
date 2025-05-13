#!/usr/bin/env python3
from jira import JIRA
import pandas as pd
from datetime import datetime, timedelta
import time

# Configurações do Jira
jira_url = "https://jira.senior.com.br"  # URL do Jira
username = "marcio.poffo"              # Usuário (geralmente email)
api_token = "Senior0505*"                     # Token de API gerado no Jira

# Lista de autores permitidos (use lowercase para facilitar a comparação)
allowed_authors = [
    'diegof.silva',
    'mauro.ramos',
    'fernando.zimmermann',
    'leonardo.correa',
    'luiz.silva',
    'vinicius.tramontin',
    'marcio.poffo'
]

# Solicita ao usuário quantos dias para trás buscar os apontamentos
try:
    days_back = int(input("Quantos dias para trás buscar os apontamentos? "))
except ValueError:
    print("Por favor, informe um número inteiro válido.")
    exit(1)

# Define o período de busca
today = datetime.today().date()
start_date = today - timedelta(days=days_back)

# Conecta à instância do Jira
jira = JIRA(server=jira_url, basic_auth=(username, api_token))
worklog_data = []

# Monta a query JQL para filtrar os apontamentos pelos autores e pela data
# Note que não há validação de projeto
jql_query = (
    f"worklogAuthor in ({', '.join(allowed_authors)}) and worklogDate >= '{start_date}' "
    f"and worklogDate <= '{today}'"
)

start_at = 0
max_results = 50
total = 1

print(f"Consultando issues com worklogs de {start_date} até {today} para os autores especificados.")

while start_at < total:
    issues = jira.search_issues(jql_query, startAt=start_at, maxResults=max_results, fields="worklog,summary")
    total = issues.total
    print(f"Processando issues {start_at + 1} até {start_at + len(issues)} de {total}")
    
    for issue in issues:
        issue_key = issue.key
        issue_summary = issue.fields.summary
        
        worklogs = jira.worklogs(issue.key)
        for wl in worklogs:
            try:
                wl_date = datetime.strptime(wl.started.split('.')[0], "%Y-%m-%dT%H:%M:%S").date()
            except Exception as e:
                print(f"Erro ao converter data do worklog da issue {issue.key}: {e}")
                continue
            
            # Filtra somente worklogs dentro do período especificado
            if wl_date < start_date or wl_date > today:
                continue
            
            # Verifica se o autor está na lista permitida (compara o username em lowercase)
            author_username = wl.author.name.lower() if hasattr(wl.author, "name") else ""
            if author_username not in allowed_authors:
                continue
            
            # Usa o displayName para exibição, se disponível
            author = wl.author.displayName if hasattr(wl.author, "displayName") else wl.author.name
            hours = wl.timeSpentSeconds / 3600  # Converte segundos para horas
            
            worklog_data.append({
                "Data": wl_date,
                "Autor": author,
                "Issue Key": issue_key,
                "Issue Summary": issue_summary,
                "Horas": hours
            })
    
    start_at += max_results
    time.sleep(1)

if not worklog_data:
    print("Nenhum worklog encontrado no período especificado para os autores indicados.")
else:
    # Cria DataFrame com os dados detalhados
    df = pd.DataFrame(worklog_data)
    df = df.sort_values(["Data", "Autor", "Issue Key"])
    
    # Agrupa os dados para obter totalizadores por Data e Autor
    df_grouped = df.groupby(["Data", "Autor"], as_index=False)["Horas"].sum()
    # Cria uma tabela pivot: linhas = Data, colunas = Autor
    pivot_table = df_grouped.pivot(index="Data", columns="Autor", values="Horas").fillna(0)
    pivot_table = pivot_table.sort_index()
    
    output_file = f"apontamentos_autores_{start_date}_ate_{today}.xlsx"
    
    # Cria o arquivo Excel e insere o gráfico utilizando o gerenciador de contexto
    with pd.ExcelWriter(output_file, engine="xlsxwriter") as writer:
        df.to_excel(writer, sheet_name="Detalhado", index=False)
        pivot_table.to_excel(writer, sheet_name="Resumo")
        
        workbook  = writer.book
        worksheet = writer.sheets["Resumo"]
        
        num_rows, num_cols = pivot_table.shape
        
        # Cria um gráfico de colunas empilhadas
        chart = workbook.add_chart({'type': 'column', 'subtype': 'stacked'})
        
        # Adiciona uma série para cada autor (cada coluna, a partir da segunda coluna)
        for col in range(1, num_cols + 1):
            chart.add_series({
                'name':       ['Resumo', 0, col],
                'categories': ['Resumo', 1, 0, num_rows, 0],
                'values':     ['Resumo', 1, col, num_rows, col],
            })
        
        chart.set_title({'name': 'Apontamentos de Horas por Data e Autor'})
        chart.set_x_axis({'name': 'Data'})
        chart.set_y_axis({'name': 'Horas'})
        chart.set_legend({'position': 'bottom'})
        
        worksheet.insert_chart('G2', chart)
    
    print("Planilha e gráfico gerados com sucesso:", output_file)