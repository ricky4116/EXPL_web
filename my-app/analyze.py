import os
import openai
import json
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

client = openai.OpenAI(api_key="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")  # ← API 키 입력 또는 환경변수로 설정

def parse_gpt_response(file_id, file_name, response_text):
    if "- 없음" in response_text:
        return []

    pattern = re.compile(r'- (\d+)번째 줄 ?: (.+?)\n\s+(.+?)\n\s+(.+?) → (.+)')
    findings = []
    for match in pattern.finditer(response_text):
        _, vuln_name, vuln_description, old_code, new_code = match.groups()
        findings.append({
            "id": file_id,
            "file_name": file_name,
            "vuln_name": vuln_name.strip(),
            "vuln_description": vuln_description.strip(),
            "old_code": old_code.strip(),
            "new_code": new_code.strip()
        })
    return findings

def analyze(files):
    results = []
    for f in files:
        file_id = f["id"]
        file_name = f["name"]
        code = f["content"]

        prompt = f"""파일명: {file_name}

아래 코드를 분석하여 보안 취약점을 찾아주세요.

다음과 같은 형식으로만 출력해 주세요:

- xx번째 줄 : (문제 요소 요약)
    (이유를 간단히 설명)
    수정 전 → 수정 후

예시:
- 12번째 줄 : eval() 사용
    사용자의 입력을 그대로 실행하므로 원격 코드 실행(RCE) 취약점이 존재합니다.
    eval(user_input) → ast.literal_eval(user_input)

취약점이 없으면 아래와 같이 출력해 주세요:
- 없음

주의: 반드시 위의 형식을 따르세요. 설명 이외의 다른 요소나 코드 블록, 문법 강조는 포함하지 마세요.

```python
{code}
```"""

        try:
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=1000
            )
            gpt_output = response.choices[0].message.content.strip()
            parsed = parse_gpt_response(file_id, file_name, gpt_output)
            results.extend(parsed)
        except Exception as e:
            results.append({
                "id": file_id,
                "file_name": file_name,
                "vuln_name": "분석 실패",
                "vuln_description": str(e),
                "old_code": "",
                "new_code": ""
            })
    return results

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python analyze.py <input_json_file>")
        sys.exit(1)

    with open(sys.argv[1], encoding='utf-8') as f:
        input_files = json.load(f)

    result = analyze(input_files)
    print(json.dumps(result, ensure_ascii=False))