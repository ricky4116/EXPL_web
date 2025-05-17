// src/components/ProjectPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import '../css/Projectpage.css';

export default function ProjectPage() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const termRef = useRef(null);
    const xtermRef = useRef(null);

    useEffect(() => {
        xtermRef.current = new Terminal({ convertEol: true });
        xtermRef.current.open(termRef.current);
        xtermRef.current.writeln(`Ready to create project...`);
    }, []);

    const handleBack = () => navigate(-1);
    const handleCreate = e => {
        e.preventDefault();
        // TODO: API call
        console.log({ name, description });
        xtermRef.current.writeln(`Created: ${name}`);
    };

    return (
        <div className="ide-container">
            <header className="ide-header">
                <button className="ide-back-btn" onClick={handleBack}>&larr; 뒤로</button>
                <h2>새 프로젝트 생성</h2>
            </header>

            <div className="ide-body">
                <aside className="file-tree">
                    <div className="file-item active">ProjectForm.jsx</div>
                    {/* 다른 파일들 */}
                </aside>

                <div className="editor-pane">
                    <Editor
                        height="calc(100% - 150px)"
                        defaultLanguage="jsx"
                        value={`<form onSubmit={handleCreate}>\n  <label>...`}
                        options={{ readOnly: true }}
                        theme="vs-dark"
                    />

                    <div className="console-container" ref={termRef}></div>
                </div>
            </div>
        </div>
    );
}
