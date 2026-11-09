// src/components/ProjectPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Edit2, Trash2 } from 'lucide-react';
import '../css/Projectpage.css';

// 백엔드 API 기본 주소 (포트 4000)
const API_BASE = 'http://localhost:4000';

export default function ProjectPage() {
    const navigate = useNavigate();
    const { projectId } = useParams();

    // 상태 및 참조 변수
    const [renamingIndex, setRenamingIndex] = useState(null);
    const [menuOpenIndex, setMenuOpenIndex] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [editingProjectName, setEditingProjectName] = useState('');
    const [renameProjectMode, setRenameProjectMode] = useState(false);
    const [files, setFiles] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTab, setActiveTab] = useState('analyze'); // 분석 결과를 바로 보도록 기본값 변경 가능
    const [analysisResult, setAnalysisResult] = useState('');
    const [runOutput, setRunOutput] = useState('');

    const editorRef = useRef(null);
    const filePositionsRef = useRef({});
    const consoleRef = useRef(null);
    const debounceTimerRef = useRef(null);

    // 1) 프로젝트 정보 및 파일 목록 로딩
    useEffect(() => {
        if (!projectId) return;

        // 프로젝트 정보 가져오기
        fetch(`${API_BASE}/api/projects`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success && d.projects) {
                    const proj = d.projects.find(p => String(p.id) === String(projectId));
                    if (proj) setProjectName(proj.project_name);
                }
            })
            .catch(err => console.error('프로젝트 조회 에러:', err));

        // 파일 목록 가져오기
        fetch(`${API_BASE}/api/projects/${projectId}/files`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (d.success && d.files) {
                    setFiles(d.files.map(f => ({ id: f.id, name: f.file_name, content: f.content || '' })));
                    setActiveIndex(0);
                }
            })
            .catch(err => console.error('파일 목록 조회 에러:', err));
    }, [projectId]);

    // 2) 프로젝트 이름 변경
    const saveProjectName = async newName => {
        if (!newName) return;
        try {
            const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_name: newName })
            });
            const j = await res.json();
            if (res.ok && j.success) setProjectName(j.project.project_name);
            else alert('이름 변경 실패');
        } catch {
            alert('서버 오류');
        }
    };

    // 3) 프로젝트 삭제
    const handleDeleteProject = async () => {
        if (!window.confirm('정말 프로젝트를 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const j = await res.json();
            if (res.ok && j.success) navigate('/main');
            else alert('삭제 실패');
        } catch {
            alert('서버 오류');
        }
    };

    // 4) 새 파일 생성 버튼
    const handleNewFile = () => {
        setFiles(prev => {
            const arr = [...prev, { id: null, name: '', content: '' }];
            setActiveIndex(arr.length - 1);
            setRenamingIndex(arr.length - 1);
            return arr;
        });
    };

    // 5) 서버에 새 파일 생성 API 호출
    const createFile = async ({ name, content }, idx) => {
        try {
            const res = await fetch(`${API_BASE}/api/projects/${projectId}/files`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name, content: content || '' })
            });
            const j = await res.json();
            if (j.success && j.file) {
                setFiles(prev => {
                    const cp = [...prev];
                    cp[idx] = { id: j.file.id, name: j.file.file_name, content: j.file.file_content || j.file.content || '' };
                    return cp;
                });
            }
        } catch (err) {
            console.error('파일 생성 실패:', err);
        }
    };

    // 6) 파일 이름 확정 시 (onBlur)
    const onNameBlur = async (idx, raw) => {
        const name = raw.trim();
        setRenamingIndex(null);

        if (!name) {
            const file = files[idx];
            if (file.id) {
                await fetch(`${API_BASE}/api/projects/${projectId}/files/${file.id}`, { method: 'DELETE', credentials: 'include' });
            }
            setFiles(prev => prev.filter((_, i) => i !== idx));
            setActiveIndex(i => (i > 0 ? i - 1 : 0));
            return;
        }

        const file = files[idx];
        if (file.id) {
            // 기존 파일 이름 수정
            const res = await fetch(`${API_BASE}/api/projects/${projectId}/files/${file.id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name, content: file.content })
            });
            const j = await res.json();
            if (j.success) {
                setFiles(prev => {
                    const cp = [...prev];
                    cp[idx] = { ...cp[idx], name };
                    return cp;
                });
            }
        } else {
            // 신규 파일 DB 등록
            createFile({ name, content: files[idx].content }, idx);
        }
    };

    // 7) 파일 내용 DB 저장 함수 (안정적인 디바운스 적용)
    const triggerSaveContent = useCallback((fileId, fileName, content) => {
        if (!fileId) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(async () => {
            try {
                await fetch(`${API_BASE}/api/projects/${projectId}/files/${fileId}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_name: fileName, content })
                });
            } catch (err) {
                console.error('내용 저장 실패:', err);
            }
        }, 500);
    }, [projectId]);

    const onContentChange = (val, idx) => {
        const safeVal = val || '';
        setFiles(prev => {
            const cp = [...prev];
            cp[idx] = { ...cp[idx], content: safeVal };
            return cp;
        });

        const curFile = files[idx];
        if (curFile && curFile.id) {
            triggerSaveContent(curFile.id, curFile.name, safeVal);
        }
    };

    // 8) 파일 삭제
    const handleDelete = async idx => {
        const file = files[idx];
        if (file.id) {
            await fetch(`${API_BASE}/api/projects/${projectId}/files/${file.id}`, {
                method: 'DELETE',
                credentials: 'include'
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
        ed.onDidChangeCursorPosition(e => {
            filePositionsRef.current[activeIndex] = e.position;
        });
    };

    // 분석 실행 (Run 버튼)
    const run = async () => {
        setActiveTab('analyze');
        setAnalysisResult('⏳ 분석 요청을 비동기 큐(Message Queue)에 등록 중...');
        setRunOutput('✅ 백그라운드 워커에서 분석이 시작되었습니다.');

        try {
            const payloadFiles = files.map(f => ({
                id: f.id,
                name: f.name,
                content: f.content
            }));

            // 1. 비동기 작업 큐에 요청 접수
            const res = await fetch(`http://localhost:4000/api/analyze`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: Number(projectId),
                    currentFiles: payloadFiles
                })
            });

            const data = await res.json();
            if (!data.success || !data.jobId) {
                setAnalysisResult(`❌ 작업 큐 등록 실패: ${data.error || '알 수 없는 오류'}`);
                return;
            }

            const { jobId } = data;
            setAnalysisResult(`⏳ [Job ID: ${jobId}] 백그라운드 워커 노드에서 분석 중... 잠시만 기다려주세요.`);

            // 2. 작업 상태 비동기 폴링 (Polling)
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`http://localhost:4000/api/analyze/status/${jobId}`);
                    const statusData = await statusRes.json();

                    if (!statusData.success) {
                        clearInterval(pollInterval);
                        setAnalysisResult(`❌ 분석 상태 조회 실패: ${statusData.error}`);
                        return;
                    }

                    if (statusData.status === 'completed') {
                        clearInterval(pollInterval);
                        const list = statusData.result || [];
                        if (list.length > 0) {
                            const formatted = list.map((v, idx) => {
                                return `[취약점 ${idx + 1}] ${v.vuln_name} (${v.file_name})\n` +
                                    `• 설명: ${v.vuln_description}\n` +
                                    `• 취약 코드: ${v.old_code}\n` +
                                    `• 보안 권장: ${v.new_code}`;
                            }).join('\n\n' + '─'.repeat(45) + '\n\n');

                            setAnalysisResult(`🔍 취약점 분석 완료 (총 ${list.length}건 감지 및 DB 저장 완료)\n\n${formatted}`);
                        } else {
                            setAnalysisResult('✅ 보안 취약점이 발견되지 않았습니다. 코드가 안전합니다.');
                        }
                    } else if (statusData.status === 'failed') {
                        clearInterval(pollInterval);
                        setAnalysisResult(`❌ 분석 실패: ${statusData.error}`);
                    }
                } catch (pollErr) {
                    clearInterval(pollInterval);
                    setAnalysisResult('❌ 워커 상태 확인 중 통신 오류가 발생했습니다.');
                }
            }, 1500); // 1.5초 간격 상태 확인

        } catch (err) {
            console.error('분석 요청 에러:', err);
            setAnalysisResult('❌ 서버와 통신 중 오류가 발생했습니다.');
        }
    };

    // 10) 콘솔 창 자동 스크롤
    useEffect(() => {
        if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }, [analysisResult, runOutput, activeTab]);

    const back = () => navigate(-1);

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
                            <span className="project-title">{projectName || 'Project'}</span>
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
                                        placeholder="파일 이름 (예: test.c)"
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
                            <div className="editor-tabs"><div className="tab active">{files[activeIndex]?.name}</div></div>
                            <Editor
                                height="calc(100% - 140px)"
                                theme="vs-dark"
                                language={files[activeIndex]?.name?.endsWith('.py') ? 'python' : 'c'}
                                value={files[activeIndex]?.content || ''}
                                onMount={handleEditorMount}
                                onChange={val => onContentChange(val, activeIndex)}
                                options={{ fontSize: 14, minimap: { enabled: false } }}
                            />
                            <div className="console-pane">
                                <div className="console-tabs">
                                    <div className={`console-tab ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>▶ 실행 결과</div>
                                    <div className={`console-tab ${activeTab === 'analyze' ? 'active' : ''}`} onClick={() => setActiveTab('analyze')}>🔍 분석 결과</div>
                                </div>
                                <div className="console-view" ref={consoleRef}>
                                    <pre className="analysis-output">
                                        {activeTab === 'run' ? (runOutput || '아직 실행 결과가 없습니다.') : (analysisResult || '아직 분석 결과가 없습니다.')}
                                    </pre>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty-editor">좌측에서 새 파일을 추가하세요.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
