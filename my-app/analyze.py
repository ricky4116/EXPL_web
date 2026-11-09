import os
import json
import re
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    sys.stderr.write("GEMINI_API_KEY가 없습니다.\n")
    print("[]")
    sys.exit(0)

client = genai.Client(api_key=api_key)

EXT_MAP = {
    'c': 'C', 'cpp': 'C++', 'cc': 'C++', 'h': 'C/C++',
    'py': 'Python', 'java': 'Java', 'js': 'JavaScript', 'ts': 'TypeScript'
}

def normalize_code(raw_code: str) -> str:
    """불필요한 연속 빈 줄 및 트레일링 공백을 정규화하여 LLM 입력 토큰 절감"""
    if not raw_code:
        return ""
    # 각 줄 끝 공백 제거
    lines = [line.rstrip() for line in raw_code.splitlines()]
    cleaned = "\n".join(lines)
    # 3개 이상의 연속 빈 줄을 1개로 압축
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()

def analyze(files):
    results = []
    TARGET_MODEL = "gemini-3.8-flash"

    for f in files:
        file_id = f.get("id", 1)
        file_name = f.get("name", "source_code")
        code = normalize_code(f.get("content", ""))

        ext = file_name.split('.')[-1].lower() if '.' in file_name else 'txt'
        language = EXT_MAP.get(ext, 'Generic Code')

        prompt = f"""당신은 정적 보안 분석(SAST) 전문가입니다.
제공된 [{language}] 코드의 보안 취약점(CWE, OWASP 기준)을 분석하세요.
반드시 아래 키를 가진 JSON 배열 형태로만 응답하세요. 취약점이 없으면 빈 배열 []을 반환하세요.
[
  {{
    "vuln_name": "취약점 명칭",
    "vuln_description": "취약점 상세 설명",
    "old_code": "취약 코드 라인",
    "new_code": "보안 권장 수정 라인"
  }}
]

[소스 코드: {file_name}]
```{ext}
{code}
"""
        MODELS = ["gemini-3.8-flash", "gemini-2.0-flash"]
        success = False
        last_error = ""

        for attempt in range(len(MODELS) + 1):
            current_model = MODELS[min(attempt, len(MODELS) - 1)]
            try:
                response = client.models.generate_content(
                    model=current_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                )

                raw_text = response.text.strip() if response.text else "[]"
                if raw_text.startswith("```"):
                    lines = raw_text.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    raw_text = "\n".join(lines).strip()

                parsed_items = json.loads(raw_text)
                if isinstance(parsed_items, list):
                    for item in parsed_items:
                        results.append({
                            "id": file_id,
                            "file_name": file_name,
                            "vuln_name": item.get("vuln_name", "보안 취약점 감지"),
                            "vuln_description": item.get("vuln_description", ""),
                            "old_code": item.get("old_code", ""),
                            "new_code": item.get("new_code", "")
                        })
                success = True
                break

            except Exception as e:
                last_error = str(e)
                sys.stderr.write(f"[{current_model} 시도 {attempt + 1} 실패]: {last_error}\n")
                sys.stderr.flush()
                time.sleep(2)  # 재시도 전 2초 대기

        if not success:
            results.append({
                "id": file_id,
                "file_name": file_name,
                "vuln_name": "취약점 분석 지연",
                "vuln_description": "AI 서버 트래픽 급증(503)으로 지연되었습니다. 잠시 후 다시 시도해 주세요.",
                "old_code": "",
                "new_code": ""
            })

    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(0)

    res = []
    try:
        input_path = sys.argv[1]
        if not os.path.exists(input_path):
            print("[]")
            sys.exit(0)

        with open(input_path, "r", encoding="utf-8") as f:
            input_files = json.load(f)

        res = analyze(input_files)
    except Exception as err:
        sys.stderr.write(f"실행 오류: {str(err)}\n")
        res = []
    finally:
        print(json.dumps(res if isinstance(res, list) else [], ensure_ascii=False))
        sys.stdout.flush()
