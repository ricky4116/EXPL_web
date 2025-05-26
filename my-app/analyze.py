# analyze.py
import os
import openai
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = openai.OpenAI(api_key="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")  # ← API 키 입력 또는 환경변수로 설정

def analyze_project_with_gpt(files: list[dict]) -> dict:
    results = {}
    for file in files:
        path = file["path"]
        code = file["content"]
        # 추후 파일 확장자에 따라 Python이 외의 언어를 추론해서 프롬프트에 자동 삽입하는 기능 추가가
        prompt = f"""파일 경로: {path}

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
            results[path] = response.choices[0].message.content.strip()
        except Exception as e:
            results[path] = f"❌ 분석 실패: {str(e)}"
    return results

def collect_files_from_project(root_dir: str):
    file_list = []
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(".py"):
                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root_dir)
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
                file_list.append({"path": rel_path, "content": content})
    return file_list

if __name__ == "__main__":
    project_path = "test_project" # 로컬의 "test_project/" 경로에 있는 파일들을 분석 대상으로 사용.
    # 추후 사용자 저장 기능이 생기면 이 경로를 저장 위치와 동기화해야 함
    files = collect_files_from_project(project_path)
    result = analyze_project_with_gpt(files)
    print(json.dumps(result, ensure_ascii=False))  # 👉 Node.js에서 이 JSON을 받아 처리
