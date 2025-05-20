import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import '../css/Projectpage.css';

export default function ProjectPage() {
    const navigate = useNavigate();
    const [projectName, setProjectName] = useState('InsignificantAccurateProtocols');
    const [files, setFiles] = useState([
        {
            name: 'main.c',
            content: `#include <stdio.h>
int main(void) {
    printf("Hello World");
    return 0;
}`
        }
    ]);
    const [activeIndex, setActiveIndex] = useState(0);
    const editorRef = useRef(null);
    const filePositionsRef = useRef({});

    // Restore cursor position on file switch
    useEffect(() => {
        if (!editorRef.current) return;
        const pos = filePositionsRef.current[activeIndex] || { lineNumber: 1, column: 1 };
        editorRef.current.setPosition(pos);
        editorRef.current.revealPositionInCenter(pos);
    }, [activeIndex]);

    const handleBack = () => navigate(-1);
    const handleRename = () => {
        const name = prompt('프로젝트 이름:', projectName);
        if (name) setProjectName(name);
    };
    const handleNewFile = () => {
        const name = prompt('파일 이름 (확장자 포함):');
        if (!name) return;
        setFiles(prev => [...prev, { name, content: '' }]);
        setActiveIndex(files.length);
    };
    const handleDelete = idx => {
        if (window.confirm(`Delete ${files[idx].name}?`)) {
            const next = files.filter((_, i) => i !== idx);
            setFiles(next);
            setActiveIndex(idx > 0 ? idx - 1 : 0);
        }
    };
    const handleFileClick = idx => {
        if (editorRef.current) {
            filePositionsRef.current[activeIndex] = editorRef.current.getPosition();
        }
        setActiveIndex(idx);
    };
    const handleEditorMount = editor => {
        editorRef.current = editor;
        editor.onDidChangeCursorPosition(e => {
            filePositionsRef.current[activeIndex] = e.position;
        });
    };
    const run = () => {
        if (!editorRef.current) return;
        const code = editorRef.current.getValue();
        try { eval(code); } catch (e) { console.error(e); }
    };

    return (
        <div className="replit-ide">
            <header className="replit-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={handleBack}>🏠</button>
                    <span className="project-title" onClick={handleRename}>{projectName}</span>
                </div>
                <div className="header-right">
                    <button className="run-btn" onClick={run}>▶ Run</button>
                </div>
            </header>
            <div className="replit-body">
                <aside className="file-explorer">
                    <div className="explorer-header">Files</div>
                    <div className="file-list">
                        {files.map((f, i) => (
                            <div key={i} className={`file-item ${activeIndex === i ? 'active' : ''}`}>
                                <span onClick={() => handleFileClick(i)}>{f.name}</span>
                                <button className="del-btn" onClick={() => handleDelete(i)}>×</button>
                            </div>
                        ))}
                    </div>
                    <div className="explorer-footer">
                        <button className="new-file" onClick={handleNewFile}>+ File</button>
                        <button className="new-folder">+ Folder</button>
                    </div>
                </aside>
                <section className="main-pane">
                    <div className="editor-tabs">
                        <div className="tab active">{files[activeIndex].name}</div>
                    </div>
                    <Editor
                        height="calc(100% - 40px)"
                        theme="vs-dark"
                        language="c"
                        value={files[activeIndex].content}
                        onMount={handleEditorMount}
                        onChange={val => setFiles(prev => prev.map((f, i) => i === activeIndex ? { ...f, content: val } : f))}
                        options={{ fontSize: 14 }}
                    />
                </section>
            </div>
        </div>
    );
}
