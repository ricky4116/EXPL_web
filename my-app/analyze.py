import os
import openai
import json

client = openai.OpenAI(api_key="your-api-key")  # ← API 키 입력 또는 환경변수로 설정

def analyze_project_with_gpt(files: list[dict]) -> dict:
    results = {}
    for file in files:
        path = file["path"]
        code = file["content"]
        prompt = f"""파일 경로: {path}
보안 취약점을 찾아주세요. 줄 번호, 문제 설명, 개선 방법을 포함해주세요.
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
