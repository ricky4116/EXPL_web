import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
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
    const [activeTab, setActiveTab] = useState('Console');
    const termRef = useRef(null);
    const xtermRef = useRef(null);
    const editorRef = useRef(null);
    const filePositionsRef = useRef({}); // store cursor positions per file

    useEffect(() => {
        xtermRef.current = new Terminal({ convertEol: true, theme: { background: '#181818', foreground: '#f5f5f5' } });
        xtermRef.current.open(termRef.current);
        xtermRef.current.writeln('Ready.');
        const orig = console.log;
        console.log = (...args) => { xtermRef.current.writeln(args.join(' ')); orig(...args); };
        return () => { console.log = orig; };
    }, []);

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
        // save current position
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
        xtermRef.current.clear();
        try { eval(code); } catch (e) { xtermRef.current.writeln(e.message); }
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
                <section className="console-pane">
                    <div className="console-tabs">
                        {['Console', 'Shell'].map(tab => (
                            <div key={tab} className={`console-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</div>
                        ))}
                    </div>
                    <div className="console-view" ref={termRef} />
                </section>
            </div>
        </div>
    );
}
