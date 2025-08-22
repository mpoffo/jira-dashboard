import os

import orjson
from jira import JIRA
from jira.resources import CustomFieldOption
from numpy.f2py.auxfuncs import throw_error

from Issue import IssueDTO, WorklogDTO
from flask import Flask, request, jsonify

JIRA_URL = "https://jira.senior.com.br"
username = os.getenv("JIRA_USERNAME")
if not username:
    print(f"Você pode configurar as variáveis de ambiente JIRA_USERNAME e JIRA_PASSWORD")
    username = input("Digite o seu nome de usuário do JIRA: ")
password = os.getenv("JIRA_PASSWORD")
if not password:
    password = input("Digite a sua senha do JIRA: ")

print(f"Rodando com usuário: {username}")
print(f"Rodando com pass: {password}")

FIELDS   = ",".join([
    "key","issuetype","summary","status","created","updated","resolutiondate",
    "customfield_10000","customfield_10002","customfield_10325",
    "customfield_11402","customfield_11401","customfield_11406",
    "customfield_14301","customfield_11407","customfield_12300",
    "issuelinks,customfield_11408,assignee,labels,customfield_10005"])
SIZE_TO_LEADTIME = "P-4,M-6,G-8"

jira_client = JIRA(server=JIRA_URL, basic_auth=(username, password))

def issues(project, tamanho):
    jql = (f"project={project} AND (\"Epic Link\" != HCMDOF-133 or  \"Epic Link\" is EMPTY) AND "
           f"(issuetype in (Epic,Feature) "
           f"OR "
           f"(issuetype in (Story, Bug) and (resolved >= \"2025-01-01\" or (resolved IS EMPTY)))) "
           f"order by key")
    start, size, issues = 0, 1000, []
    issues_dto_List = []
    while True:
        print(f"JQL: {jql}")
        issues = jira_client.search_issues(jql_str=jql, startAt=start, maxResults=size, fields=FIELDS)
        for index, issue in enumerate(issues):
            issue_key = issue.key
            print(f"Lendo issue: {issue_key} [{index+1} de {issues.total}]")
            issue_summary = issue.fields.summary
            comments = [c.body for c in jira_client.comments(issue.key)]
            worklogs = jira_client.worklogs(issue.key)
            #Obtem o usuário que moveu a issue de todo ou backlog para in progress
            first_wl = [wl for wl in worklogs if wl.started and wl.timeSpentSeconds > 0]
            if first_wl and first_wl.__len__() > 0:                
                first_wl = first_wl[0]

            # Ordena os worklogs por data de início
            worklogs.sort(key=lambda wl: wl.started)

            worklog_dto_list = []
            total_spent = 0
            for wl in worklogs:
                author = wl.author.name
                time_spent = (wl.timeSpentSeconds / 3600).__round__(1)
                total_spent += time_spent
                start_date = wl.started.split("T")[0]
                worklog_dto_list.append(WorklogDTO(author, time_spent, wl.timeSpentSeconds, start_date))

            issue_links = getattr(issue.fields, "issuelinks", None)
            issue_links = [getattr(link.inwardIssue, "key", None) if hasattr(link, "inwardIssue")
                          else getattr(link.outwardIssue, "key", None) for link in issue_links]
            leadTime = getattr(issue.fields, "customfield_11402", None)
            size = str(getattr(issue.fields, "customfield_10325", ''))
            sizeLead = tamanho.get(size, 0)
            sizeLead = sizeLead if sizeLead > 0 else leadTime # o que não tem tamanho assume o tamanho realizado pra não distorcer
            assign = getattr(issue.fields, "assignee", '')
            issue_dto = IssueDTO(
                key=issue_key,
                type=issue.fields.issuetype.name,
                summary=issue_summary,
                assignee=assign.key if assign is not None else '',
                status=issue.fields.status.name,
                epicLink=getattr(issue.fields, "customfield_10000", None),
                epicName=getattr(issue.fields, "customfield_10002", None),
                issueLink=issue_links,
                size=size,
                sizeLead=sizeLead,
                lt=leadTime,
                ltProgress=getattr(issue.fields, "customfield_11401", None),
                ltCodeRev=getattr(issue.fields, "customfield_11406", None),
                ltTodoRev=float(getattr(issue.fields, "customfield_14301", 0)),
                ltReview=getattr(issue.fields, "customfield_11407", None),
                ltRTD=getattr(issue.fields, "customfield_11408", None),
                efficiency=getattr(issue.fields, "customfield_12300", None),
                created=issue.fields.created.split("T")[0],
                updated=issue.fields.updated.split("T")[0],
                resolved=issue.fields.resolutiondate.split("T")[0] if issue.fields.resolutiondate else None,
                worklog=worklog_dto_list,
                total_spent=total_spent,
                labels=issue.fields.labels,
                comments=comments,
                start_date=get_start_date(comments),
                rank=getattr(issue.fields, "customfield_10005", None),
            )
            issues_dto_List.append(issue_dto)

        if len(issues_dto_List) == issues.total:
            break

    epic_map = {issue.key: issue.summary for issue in issues_dto_List if issue.type == "Epic"}
    feature_map = {
        issue.key: {
            "key": issue.key,
            "summary": issue.summary,
            "status": issue.status,
            "assignee": issue.assignee,
            "start_date": issue.start_date
        }
        for issue in issues_dto_List if issue.type == "Feature"
    }

    if len(epic_map) == 0 or len(feature_map) == 0:
        throw_error("Não foram encontrados Epics ou Features. Verifique se o JQL está correto.")

    # Atualiza o nome do Epic para os issues que não são do tipo Epic
    for issue_dto in issues_dto_List:
        if issue_dto.type != "Epic" and issue_dto.epicLink in epic_map:
            issue_dto.epicName = epic_map[issue_dto.epicLink]
    
    for issue_dto in issues_dto_List:
        if issue_dto.type != "Epic" and issue_dto.type != "Feature":
            issue_dto.start_date = get_start_date(issue_dto.comments)
            linkedIssues = issue_dto.issueLink
            for link in linkedIssues:
                if link in feature_map:
                    issue_dto.feature_key = link
                    issue_dto.feature_name = feature_map[link].get('summary')
                    break

    result = {
        'epics': epic_map,
        'features': feature_map,
        'issues': issues_dto_List,
    }

    return result

# Pode existir um comentário na issue que tem o valor inicio=[data].
# Essa função recebe uma lista de comentários e retorna a data do primeiro comentário que tem esse padrão.
# Recebe a data no formato DD/MM/AAAA e retorna no formato AAAA-MM-DD.
def get_start_date(comments):
    for comment in comments:
        if "inicio=" in comment:
            start_date = comment.split("inicio=")[1].split()[0]
            start_date = start_date.replace('\r', '').replace('\n', '')
            # Convert DD/MM/AAAA to AAAA-MM-DD
            try:
                day, month, year = start_date.split('/')
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            except Exception:
                return start_date  # fallback if not in expected format
    return None

def issues_to_file(project, issues):
    def serialize(obj):
        if isinstance(obj, CustomFieldOption):
            return str(obj)  # Converte para string
        elif hasattr(obj, "__dict__"):
            return {key: serialize(value) for key, value in obj.__dict__.items()}
        elif isinstance(obj, list):
            return [serialize(item) for item in obj]
        elif isinstance(obj, dict):
            return {key: serialize(value) for key, value in obj.items()}
        else:
            return obj  # Retorna o valor diretamente se for serializável

    issues_json = orjson.dumps(serialize(issues), option=orjson.OPT_SERIALIZE_NUMPY)
    with open(f"web/{project}.json", "wb") as file:
        file.write(issues_json)

def default_extract():
    project = "HCMDOF"    
    issues_data = issues(project, get_tamanho(SIZE_TO_LEADTIME))
    issues_to_file(project, issues_data)
    return jsonify({"message": f"Issues for project {project} extracted successfully."}), 200

# SERVER FLASK
from flask import Flask, request, jsonify
from flask_cors import CORS  # Importa o CORS
app = Flask(__name__)
CORS(app)  # Habilita CORS para todas as rotas

@app.route('/extract_issues', methods=['POST'])
def extract_issues():
    data = request.get_json()
    project = data.get('project')
    tamanho = get_tamanho(data.get('tamanho'))
    
    if not project:
        return jsonify({"error": "Project is required"}), 400

    try:
        issues_data = issues(project, tamanho)
        issues_to_file(project, issues_data)
        return jsonify({"message": f"Issues for project {project} extracted successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def get_tamanho(tamanho):    
    if(tamanho == None):
        tamanho = SIZE_TO_LEADTIME

    #converte tamanho no formato "P-4,M-6,G-8" para um dicionário com value do tipo int
    # Exemplo: "P-4,M-6,G-8" -> {"P": 4, "M": 6, "G": 8}        
    tamanho = {k: int(v) for k, v in (item.split('-') for item in tamanho.split(','))}
    return tamanho

if __name__ == '__main__':    
    #response = default_extract()
    #print(response)
    app.run(debug=True, port=8001)