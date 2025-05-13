# server.py
import json
import tempfile
import urllib3

import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS

urllib3.disable_warnings()
app = Flask(__name__)
CORS(app, supports_credentials=True)   # ← habilita CORS *

genai.configure(api_key="AIzaSyA9aDVb9gzGT8ViuSoFhxEoWIJyW6xyKnc")


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
