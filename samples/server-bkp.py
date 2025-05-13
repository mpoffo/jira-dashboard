# server.py
import base64, json, urllib3
import os
import tempfile

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import google.generativeai as genai
from jira import JIRA


urllib3.disable_warnings()
app = Flask(__name__)
CORS(app, supports_credentials=True)   # ← habilita CORS *

JIRA_URL = "https://jira.senior.com.br"
username = os.getenv("JIRA_USERNAME")
password = os.getenv("JIRA_PASSWORD")
FIELDS   = ",".join([
    "key","issuetype","summary","status","created","updated","resolutiondate",
    "customfield_10000","customfield_10002","customfield_10325",
    "customfield_11402","customfield_11401","customfield_11406",
    "customfield_14301","customfield_11407","customfield_12300"
])

genai.configure(api_key="AIzaSyA9aDVb9gzGT8ViuSoFhxEoWIJyW6xyKnc")
jira = JIRA(server=JIRA_URL, basic_auth=(username, password))

# ----------------------------------------------------------------------
# Jira paginado
# ----------------------------------------------------------------------
def jira_search(jql, auth_hdr):
    url = f"{JIRA_URL}/rest/api/2/search"
    start, size, issues = 0, 1000, []
    while True:
        print(f'Query jira: {jql}')
        r = requests.get(
            url,
            params={"jql": jql, "startAt": start, "maxResults": size, "fields": FIELDS},
            headers={'Authorization': auth_hdr},
            verify=False
        ).json()
        issues.extend(r.get('issues', []))
        if start + size >= r.get('total', 0):
            break
        start += size
    return issues

# ----------------------------------------------------------------------
# /api/issues  (POST)
# body = {user, token, project, not}
# ----------------------------------------------------------------------
@app.route("/api/issues", methods=['POST'])
def api_issues():
    body = request.json or {}
    user, token, project = body.get('user'), body.get('token'), body.get('project')
    not_clause = body.get('not') or ''
    if not all([user, token, project]):
        return jsonify({"error": "user, token, project são obrigatórios"}), 400

    auth_hdr = "Basic " + base64.b64encode(f"{user}:{token}".encode()).decode()
    jql = f"project={project} AND issuetype in (Bug,Story,Epic)"
    if not_clause:
        jql += f" AND {not_clause}"

    issues = jira_search(jql, auth_hdr)
    return jsonify(issues)

@app.route('/api/insights', methods=['POST'])
def get_insights():
    data = request.json
    user_prompt = data.get('prompt')
    jira_data = data.get('jiraData')

    if not user_prompt or not jira_data:
        return jsonify({'error': 'Prompt e dados do Jira são obrigatórios'}), 400

    try:
        with tempfile.NamedTemporaryFile(delete=False, mode='w', encoding='utf-8', suffix='jira.json') as temp_file:
            temp_file.write(json.dumps(jira_data))
            temp_file.flush()


        jira_file = genai.upload_file(
            path=temp_file.name,
            mime_type="text/plain"
        )
        model = genai.GenerativeModel("gemini-1.5-pro-latest")   # ou 2.0‑flash
        resp  = model.generate_content(["Você é um analista de dados especializado em interpretar dados do Jira. "
                                       "Forneça insights e análises úteis com base nos dados fornecidos no último arquivo jira.json enviado."
                                        "Issue type Bug não tem tamanho."
                                       f"Considere também: {user_prompt}"
                                       ,jira_file])

        return resp.text

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000, debug=True)
