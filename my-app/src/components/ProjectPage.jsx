// src/components/ProjectPage.jsx
// 1) 기본 import 및 초기 세팅
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Edit2, Trash2 } from 'lucide-react';
import '../css/Projectpage.css';

export default function ProjectPage() {
    const navigate = useNavigate();
    const { projectId } = useParams();

    // 2) 상태 및 참조 변수 정의
    const [renamingIndex, setRenamingIndex] = useState(null);
    const [menuOpenIndex, setMenuOpenIndex] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [editingProjectName, setEditingProjectName] = useState('');
    const [renameProjectMode, setRenameProjectMode] = useState(false);
    const [files, setFiles] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTab, setActiveTab] = useState('run');
    const [analysisResult, setAnalysisResult] = useState('');
    const [runOutput, setRunOutput] = useState('');

    const editorRef = useRef(null);
    const filePositionsRef = useRef({});
    const consoleRef = useRef(null);

    // 3) 프로젝트 정보 + 파일 목록 로딩
    useEffect(() => {
        fetch(`/api/projects`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    const proj = d.projects.find(p => String(p.id) === projectId);
                    if (proj) setProjectName(proj.project_name);
                }
            });
        fetch(`/api/projects/${projectId}/files`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setFiles(d.files.map(f => ({ id: f.id, name: f.file_name, content: f.content })));
                    setActiveIndex(0);
                }
            });
    }, [projectId]);

    // 4) 프로젝트 이름 저장
    const saveProjectName = async newName => {
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_name: newName })
            });
            const j = await res.json();
            if (res.ok && j.success) setProjectName(j.project.project_name);
            else alert('이름 변경 실패');
        } catch {
            alert('서버 오류');
        }
    };

    // 5) 프로젝트 삭제
    const handleDeleteProject = async () => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'DELETE', credentials: 'include'
            });
            const j = await res.json();
            if (res.ok && j.success) navigate('/main');
            else alert('삭제 실패');
        } catch {
            alert('서버 오류');
        }
    };

    // 6) 새 파일 추가
    const handleNewFile = () => {
        setFiles(prev => {
            const arr = [...prev, { id: null, name: '', content: '' }];
            setActiveIndex(arr.length - 1);
            setRenamingIndex(arr.length - 1);
            return arr;
        });
    };

    // 7) 서버에 새 파일 생성 요청
    const createFile = async ({ name, content }, idx) => {
        const res = await fetch(`/api/projects/${projectId}/files`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: name, content })
        });
        const j = await res.json();
        if (j.success) setFiles(prev => { const cp = [...prev]; cp[idx] = { id: j.file.id, name: j.file.file_name, content: j.file.content }; return cp; });
    };

    // 8) 이름 입력 완료 시 처리
    const onNameBlur = async (idx, raw) => {
        const name = raw.trim(); setRenamingIndex(null);
        if (!name) {
            const file = files[idx];
            if (file.id) await fetch(`/api/projects/${projectId}/files/${file.id}`, { method: 'DELETE', credentials: 'include' });
            setFiles(prev => prev.filter((_, i) => i !== idx));
            setActiveIndex(i => (i > 0 ? i - 1 : 0));
            return;
        }
        const file = files[idx];
        if (file.id) {
            const res = await fetch(`/api/projects/${projectId}/files/${file.id}`, {
                method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name })
            });
            const j = await res.json(); if (j.success) setFiles(prev => { const cp = [...prev]; cp[idx] = { id: j.file.id, name: j.file.file_name, content: j.file.content }; return cp; });
        } else createFile({ name, content: files[idx].content }, idx);
    };

    // 9) 내용 저장 디바운스 처리
    const debounce = (fn, d) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; };
    const saveContent = debounce((id, name, content) => {
        fetch(`/api/projects/${projectId}/files/${id}`, {
            method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: name, content })
        });
    }, 500);

    const onContentChange = (val, idx) => {
        setFiles(prev => { const cp = [...prev]; cp[idx] = { ...cp[idx], content: val }; if (cp[idx].id) saveContent(cp[idx].id, cp[idx].name, val); return cp; });
    };

    // 10) 삭제, 클릭, 커서 복원
    const handleDelete = async idx => {
        const file = files[idx];
        if (file.id) await fetch(`/api/projects/${projectId}/files/${file.id}`, { method: 'DELETE', credentials: 'include' });
        setFiles(prev => prev.filter((_, i) => i !== idx));
        setActiveIndex(i => (i > 0 ? i - 1 : 0));
    };

    const handleFileClick = idx => { if (editorRef.current) filePositionsRef.current[activeIndex] = editorRef.current.getPosition(); setActiveIndex(idx); setMenuOpenIndex(null); };
    const handleEditorMount = ed => { editorRef.current = ed; ed.onDidChangeCursorPosition(e => filePositionsRef.current[activeIndex] = e.position); };

    // 11) 분석 실행 버튼
    const run = async () => {
        setRunOutput('✅ 실행은 현재 지원되지 않습니다. 분석 결과를 확인하세요.');
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: Number(projectId) })
            });
            const result = await res.json();
            if (result.success) setAnalysisResult(`🔍 분석 완료 (${result.inserted}건 DB 저장됨)`);
            else setAnalysisResult(`❌ 분석 실패: ${result.error}`);
        } catch {
            setAnalysisResult('❌ 분석 중 오류');
        }
    };

    // 12) 콘솔 자동 스크롤
    useEffect(() => {
        if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }, [analysisResult, runOutput]);

    const back = () => navigate(-1);

    // 13) 렌더링 반환 (UI 구성)
    return (
        <div className="replit-ide">
            <header className="replit-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={back}>🏠</button>
                    {renameProjectMode ? (
                        <input
                            className="project-title-input"
                            value={editingProjectName}
                            autoFocus
                            onChange={e => setEditingProjectName(e.target.value)}
                            onBlur={() => { setRenameProjectMode(false); saveProjectName(editingProjectName.trim()); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenameProjectMode(false); }}
                        />
                    ) : (
                        <>
                            <span className="project-title">{projectName}</span>
                            <Edit2 size={20} style={{ cursor: 'pointer', margin: '0 8px' }} onClick={() => { setEditingProjectName(projectName); setRenameProjectMode(true); }} />
                            <Trash2 size={20} style={{ cursor: 'pointer' }} onClick={handleDeleteProject} />
                        </>
                    )}
                </div>
                <div className="header-right">
                    <button className="run-btn" onClick={run}>▶ Run</button>
                </div>
            </header>

            <div className="replit-body">
                <aside className="file-explorer">
                    <div className="explorer-header">Files</div>
                    <div className="file-list">
                        {files.length === 0 ? (
                            <div className="empty-list">파일이 없습니다.</div>
                        ) : files.map((f, i) => (
                            <div key={i} className={`file-item ${activeIndex === i ? 'active' : ''}`}>
                                {renamingIndex === i ? (
                                    <input autoFocus value={f.name}
                                        onChange={e => setFiles(p => { const c = [...p]; c[i].name = e.target.value; return c; })}
                                        onBlur={e => onNameBlur(i, e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                        placeholder="파일 이름"
                                    />
                                ) : (
                                    <div className="file-label" onClick={() => handleFileClick(i)}>{f.name}</div>
                                )}
                                <div className="menu-container">
                                    <button className="menu-btn" onClick={() => setMenuOpenIndex(x => x === i ? null : i)}>⋮</button>
                                    {menuOpenIndex === i && (
                                        <div className="menu-dropdown">
                                            <button onClick={() => { setRenamingIndex(i); setMenuOpenIndex(null); }}>이름 수정</button>
                                            <button onClick={() => { handleDelete(i); setMenuOpenIndex(null); }}>삭제</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="explorer-footer"><button className="new-file" onClick={handleNewFile}>+ File</button></div>
                </aside>

                <section className="main-pane">
                    {files.length > 0 ? (
                        <>
                            <div className="editor-tabs"><div className="tab active">{files[activeIndex].name}</div></div>
                            <Editor height="calc(100% - 120px)" theme="vs-dark" language="c"
                                value={files[activeIndex].content} onMount={handleEditorMount}
                                onChange={val => onContentChange(val, activeIndex)} options={{ fontSize: 14 }}
                            />
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
                    ) : (
                        <div className="empty-editor">새 파일을 추가하세요.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
