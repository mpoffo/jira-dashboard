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

FIELDS   = ",".join([
    "key","issuetype","summary","status","created","updated","resolutiondate",
    "customfield_10000","customfield_10002","customfield_10325",
    "customfield_11402","customfield_11401","customfield_11406",
    "customfield_14301","customfield_11407","customfield_12300",
    "issuelinks,customfield_11408,assignee"
])
SIZE_TO_LEADTIME = { 'P': 4, 'M': 6, 'G': 8 }

jira_client = JIRA(server=JIRA_URL, basic_auth=(username, password))

def issues(project):
    jql = (f"project={project} AND (\"Epic Link\" != HCMDOF-133 or  \"Epic Link\" is EMPTY) AND "
           f"(issuetype in (Epic,Feature) "
           f"OR "
           f"(issuetype in (Story, Bug) and (resolved >= \"2025-01-01\" or (resolved IS EMPTY and status != Backlog)))) "
           f"order by key")
    start, size, issues = 0, 1000, []
    issues_dto_List = []
    while True:
        issues = jira_client.search_issues(jql_str=jql, startAt=start, maxResults=size, fields=FIELDS)
        for index, issue in enumerate(issues):
            issue_key = issue.key
            print(f"Lendo issue: {issue_key} [{index+1} de {issues.total}]")
            issue_summary = issue.fields.summary
            worklogs = jira_client.worklogs(issue.key)
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
            sizeLead = SIZE_TO_LEADTIME.get(size, 0)
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
                total_spent=total_spent
            )
            issues_dto_List.append(issue_dto)

        if len(issues_dto_List) == issues.total:
            break

    epic_map = {issue.key: issue.summary for issue in issues_dto_List if issue.type == "Epic"}
    feature_map = {issue.key: issue.summary for issue in issues_dto_List if issue.type == "Feature"}

    if len(epic_map) == 0 or len(feature_map) == 0:
        throw_error("Não foram encontrados Epics ou Features. Verifique se o JQL está correto.")

    # Atualiza o nome do Epic para os issues que não são do tipo Epic
    for issue_dto in issues_dto_List:
        if issue_dto.type != "Epic" and issue_dto.epicLink in epic_map:
            issue_dto.epicName = epic_map[issue_dto.epicLink]
    for issue_dto in issues_dto_List:
        if issue_dto.type != "Epic" and issue_dto.type != "Feature":
            linkedIssues = issue_dto.issueLink
            for link in linkedIssues:
                if link in feature_map:
                    issue_dto.feature_key = link
                    issue_dto.feature_name = feature_map[link]
                    break

    result = {
        'epics': epic_map,
        'features': feature_map,
        'issues': issues_dto_List,
    }

    return result

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

# SERVER FLASK
from flask import Flask, request, jsonify
from flask_cors import CORS  # Importa o CORS
app = Flask(__name__)
CORS(app)  # Habilita CORS para todas as rotas

@app.route('/extract_issues', methods=['POST'])
def extract_issues():
    data = request.get_json()
    project = data.get('project')
    
    if not project:
        return jsonify({"error": "Project is required"}), 400

    try:
        issues_data = issues(project)
        issues_to_file(project, issues_data)
        return jsonify({"message": f"Issues for project {project} extracted successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8001)