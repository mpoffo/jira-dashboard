# jira-dashboard
Dashboard Jira

Objetivo extrair dados do Jira On-Premisse e apresentar em um dashboard com uma série de indicadores

## Dependencias
Python 312

## Instalação
pip install jira  
pip install jira.resources

## Funcionamento
extractor.py extrai os dados e gera um json com o nome do projeto solicitado na pasta dos arquivos web  
O botão "Extrair" do frontend executa a ação (acessar o botão configurações primeiro para ajustar os parâmetros)

ia-server.py em desenvolvimento

## Executando
Servidor de extração:  
    no root -> python extractor.py  
    ou  server-back.bat

Frontend
    na pasta web -> python -m http.server 8000   
    ou server-front.bat na pasta    
