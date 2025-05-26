// src/components/ProjectPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
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
    const editorRef = useRef(null);
    const filePositionsRef = useRef({});

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
                    // API에서 id, file_name, content, created_at 리턴한다고 가정
                    setFiles(d.files.map(f => ({
                        id: f.id,
                        name: f.file_name,
                        content: f.content
                    })));
                    setActiveIndex(0);
                }
            });
    }, [projectId]);


    // 2) 새 파일 생성 → 이름 입력 모드
    const handleNewFile = () => {
        setFiles(prev => {
            const newFiles = [...prev, { id: null, name: '', content: '' }];
            setActiveIndex(newFiles.length - 1);
            setRenamingIndex(newFiles.length - 1);
            return newFiles;
        });
    };


    // 3) 파일 생성 API
    const createFile = async ({ name, content }, idx) => {
        const res = await fetch(
            `http://localhost:4000/api/projects/${projectId}/files`,
            {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name, content: content })
            }
        );
        const j = await res.json();
        if (j.success) {
            setFiles(prev => {
                const cp = [...prev];
                cp[idx] = {
                    id: j.file.id,
                    name: j.file.file_name,
                    content: j.file.content
                };
                return cp;
            });
        }
    };


    // 4) 파일 이름 확정시 (생성 or 이름 변경)
    const onNameBlur = async (idx, raw) => {
        const newName = raw.trim();
        // 입력창 닫기
        setRenamingIndex(null);

        // 1) 이름이 빈 문자열이면, DB/UI에서 삭제
        if (!newName) {
            const file = files[idx];
            if (file.id) {
                // 서버에도 삭제 요청
                await fetch(
                    `/api/projects/${projectId}/files/${file.id}`,
                    { method: 'DELETE', credentials: 'include' }
                );
            }
            // 클라이언트 state에서만 제거
            setFiles(prev => prev.filter((_, i) => i !== idx));
            setActiveIndex(i => (i > 0 ? i - 1 : 0));
            return;
        }

        const file = files[idx];
        if (file.id) {
            // 2) 기존 파일: id 기준으로 이름 변경
            const res = await fetch(
                `/api/projects/${projectId}/files/${file.id}`,
                {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_name: newName })  // ← new_name: newName
                }
            );
            const j = await res.json();
            if (!j.success) {
                return alert('이름 변경 실패: ' + j.error);
            }
            // 서버가 반환한 최신 데이터로 state 갱신
            setFiles(prev => {
                const cp = [...prev];
                cp[idx] = {
                    id: j.file.id,
                    name: j.file.file_name,
                    content: j.file.content
                };
                return cp;
            });
        } else {
            // 3) 새로 만든 파일: POST
            createFile({ name: newName, content: files[idx].content }, idx);
        }
    };



    // 5) 내용 변경시 자동 저장 (debounce)
    const saveContent = debounce((id, name, content) => {
        console.log('saving', { id, name, content });
        fetch(
            `http://localhost:4000/api/projects/${projectId}/files/${id}`,
            {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name, content })
            }
        )
            .then(r => r.json())
            .then(j => {
                if (!j.success) console.error('save failed', j.error);
            });
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


    // 6) 나머지 핸들러: 삭제, 클릭, 에디터 마운트, 실행, 뒤로가기
    const handleDelete = async (idx) => {
        const file = files[idx];
        if (file.id) {
            // 서버에 삭제 요청 (confirm 없이 바로)
            await fetch(
                `http://localhost:4000/api/projects/${projectId}/files/${file.id}`,
                { method: 'DELETE', credentials: 'include' }
            );
        }
        // UI에서만 제거
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
    const run = () => {
        if (!editorRef.current) return;
        try { eval(editorRef.current.getValue()); }
        catch (e) { console.error(e); }
    };
    const handleBack = () => navigate(-1);


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
                                        : <div
                                            className="file-label"
                                            onClick={() => handleFileClick(i)}
                                        >{f.name}</div>
                                    }
                                    <div className="menu-container">
                                        <button
                                            className="menu-btn"
                                            onClick={() => setMenuOpenIndex(x => x === i ? null : i)}
                                        >⋮</button>
                                        {menuOpenIndex === i && (
                                            <div className="menu-dropdown">
                                                <button onClick={() => { setRenamingIndex(i); setMenuOpenIndex(null); }}>
                                                    이름 재설정
                                                </button>
                                                <button onClick={() => { handleDelete(i); setMenuOpenIndex(null); }}>
                                                    삭제
                                                </button>
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
                            <Editor
                                height="calc(100% - 40px)"
                                theme="vs-dark"
                                language="c"
                                value={files[activeIndex].content}
                                onMount={handleEditorMount}
                                onChange={val => onContentChange(val, activeIndex)}
                                options={{ fontSize: 14 }}
                            />
                        </>
                        : <div className="empty-editor">새 파일을 추가하세요.</div>
                    }
                </section>
            </div>
        </div>
    );
}

// 단순 debounce 유틸
function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}
