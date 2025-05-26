import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import '../css/Projectpage.css';

export default function ProjectPage() {
    const navigate = useNavigate();
    const { projectId } = useParams();

    const [renamingIndex, setRenamingIndex] = useState(null);
    const [menuOpenIndex, setMenuOpenIndex] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [files, setFiles] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [analysisResult, setAnalysisResult] = useState('');
    const [activeTab, setActiveTab] = useState('run');
    const [runOutput, setRunOutput] = useState('');
    const editorRef = useRef(null);
    const filePositionsRef = useRef({});
    const consoleRef = useRef(null);

    // 1) 프로젝트 메타 + 파일 불러오기
    useEffect(() => {
        fetch(`http://localhost:4000/api/projects`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    const proj = d.projects.find(p => String(p.id) === projectId);
                    if (proj) setProjectName(proj.project_name);
                }
            });
        fetch(`http://localhost:4000/api/projects/${projectId}/files`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setFiles(d.files.map(f => ({ id: f.id, name: f.file_name, content: f.content })));
                    setActiveIndex(0);
                }
            });
    }, [projectId]);

    // 2) 새 파일 추가 (입력 모드 전환)
    const handleNewFile = () => {
        setFiles(prev => {
            const newFiles = [...prev, { id: null, name: '', content: '' }];
            setActiveIndex(newFiles.length - 1);
            setRenamingIndex(newFiles.length - 1);
            return newFiles;
        });
    };

    // 3) 서버에 파일 생성 요청
    const createFile = async ({ name, content }, idx) => {
        const res = await fetch(`http://localhost:4000/api/projects/${projectId}/files`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: name, content })
        });
        const j = await res.json();
        if (j.success) {
            setFiles(prev => {
                const cp = [...prev];
                cp[idx] = { id: j.file.id, name: j.file.file_name, content: j.file.content };
                return cp;
            });
        }
    };

    // 4) 이름 입력창 닫힘 처리 + 파일 생성 or 수정
    const onNameBlur = async (idx, raw) => {
        const newName = raw.trim();
        setRenamingIndex(null);

        // 빈 이름이면 삭제
        if (!newName) {
            const file = files[idx];
            if (file.id) {
                await fetch(`/api/projects/${projectId}/files/${file.id}`, {
                    method: 'DELETE', credentials: 'include'
                });
            }
            setFiles(prev => prev.filter((_, i) => i !== idx));
            setActiveIndex(i => (i > 0 ? i - 1 : 0));
            return;
        }

        const file = files[idx];
        if (file.id) {
            const res = await fetch(`/api/projects/${projectId}/files/${file.id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: newName })
            });
            const j = await res.json();
            if (!j.success) return alert('이름 변경 실패: ' + j.error);
            setFiles(prev => {
                const cp = [...prev];
                cp[idx] = { id: j.file.id, name: j.file.file_name, content: j.file.content };
                return cp;
            });
        } else {
            createFile({ name: newName, content: file.content }, idx);
        }
    };

    // 5) 내용 변경 시 자동 저장 (디바운스)
    const saveContent = debounce((id, name, content) => {
        fetch(`http://localhost:4000/api/projects/${projectId}/files/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: name, content })
        })
        .then(r => r.json())
        .then(j => { if (!j.success) console.error('save failed', j.error); });
    }, 500);

    const onContentChange = (val, idx) => {
        setFiles(prev => {
            const cp = [...prev];
            cp[idx] = { ...cp[idx], content: val };
            const { id, name } = cp[idx];
            if (id) saveContent(id, name, val);
            return cp;
        });
    };

    // 6) 삭제, 클릭, 커서 복원, 실행, 뒤로가기
    const handleDelete = async (idx) => {
        const file = files[idx];
        if (file.id) {
            await fetch(`/api/projects/${projectId}/files/${file.id}`, {
                method: 'DELETE', credentials: 'include'
            });
        }
        setFiles(prev => prev.filter((_, i) => i !== idx));
        setActiveIndex(i => (i > 0 ? i - 1 : 0));
    };

    const handleFileClick = idx => {
        if (editorRef.current) filePositionsRef.current[activeIndex] = editorRef.current.getPosition();
        setActiveIndex(idx);
        setMenuOpenIndex(null);
    };

    const handleEditorMount = ed => {
        editorRef.current = ed;
        ed.onDidChangeCursorPosition(e => filePositionsRef.current[activeIndex] = e.position);
    };

    const run = async () => {
        setRunOutput('✅ 실행은 현재 지원되지 않습니다. 분석 결과를 확인하세요.');
        try {
            const analyzeRes = await fetch('http://localhost:4000/api/analyze', { method: 'POST' });
            const result = await analyzeRes.json();
            const formatted = Object.entries(result).map(([file, msg]) => `📄 ${file}\n${msg}`).join('\n\n');
            setAnalysisResult(formatted);
        } catch (err) {
            setAnalysisResult('❌ 분석 중 오류 발생');
        }
    };

    const handleBack = () => navigate(-1);

    // 7) 스크롤 고정
    useEffect(() => {
        if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }, [analysisResult, runOutput]);

    return (
        <div className="replit-ide">
            <header className="replit-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={handleBack}>🏠</button>
                    <span className="project-title" onClick={() => {
                        const n = prompt('프로젝트 이름', projectName);
                        if (n) setProjectName(n.trim());
                    }}>{projectName}</span>
                </div>
                <div className="header-right">
                    <button className="run-btn" onClick={run}>▶ Run</button>
                </div>
            </header>

            <div className="replit-body">
                <aside className="file-explorer">
                    <div className="explorer-header">Files</div>
                    <div className="file-list">
                        {files.length === 0
                            ? <div className="empty-list">파일이 없습니다.</div>
                            : files.map((f, i) => (
                                <div key={i} className={`file-item ${activeIndex === i ? 'active' : ''}`}>
                                    {(renamingIndex === i)
                                        ? <input
                                            autoFocus
                                            value={f.name}
                                            onChange={e => setFiles(p => {
                                                const cp = [...p]; cp[i].name = e.target.value; return cp;
                                            })}
                                            onBlur={e => onNameBlur(i, e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                                            placeholder="파일 이름"
                                        />
                                        : <div className="file-label" onClick={() => handleFileClick(i)}>{f.name}</div>
                                    }
                                    <div className="menu-container">
                                        <button className="menu-btn" onClick={() => setMenuOpenIndex(x => x === i ? null : i)}>⋮</button>
                                        {menuOpenIndex === i && (
                                            <div className="menu-dropdown">
                                                <button onClick={() => { setRenamingIndex(i); setMenuOpenIndex(null); }}>이름 재설정</button>
                                                <button onClick={() => { handleDelete(i); setMenuOpenIndex(null); }}>삭제</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                    <div className="explorer-footer">
                        <button className="new-file" onClick={handleNewFile}>+ File</button>
                    </div>
                </aside>

                <section className="main-pane">
                    {files.length > 0
                        ? <>
                            <div className="editor-tabs">
                                <div className="tab active">{files[activeIndex].name}</div>
                            </div>
                            <div className="editor-area">
                                <Editor
                                    height="100%"
                                    width="100%"
                                    theme="vs-dark"
                                    language="c"
                                    value={files[activeIndex].content}
                                    onMount={handleEditorMount}
                                    onChange={val => onContentChange(val, activeIndex)}
                                    options={{ fontSize: 14 }}
                                />
                            </div>
                            <div className="console-pane">
                                <div className="console-tabs">
                                    <div className={`console-tab ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>▶ 실행 결과</div>
                                    <div className={`console-tab ${activeTab === 'analyze' ? 'active' : ''}`} onClick={() => setActiveTab('analyze')}>🔍 분석 결과</div>
                                </div>
                                <div className="console-view" ref={consoleRef}>
                                    <pre className="analysis-output">
                                        {activeTab === 'run' ? runOutput || '아직 실행 결과가 없습니다.' : analysisResult || '아직 분석 결과가 없습니다.'}
                                    </pre>
                                </div>
                            </div>
                        </>
                        : <div className="empty-editor">새 파일을 추가하세요.</div>
                    }
                </section>
            </div>
        </div>
    );
}

// 8) 디바운스 유틸 함수
function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}
