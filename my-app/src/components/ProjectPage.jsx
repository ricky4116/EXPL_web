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
    const [analysisResult, setAnalysisResult] = useState('');
    const editorRef = useRef(null);
    const filePositionsRef = useRef({});
    const consoleRef = useRef(null);
    const [activeTab, setActiveTab] = useState('run');
    const [runOutput, setRunOutput] = useState('');


    // Restore cursor position on file switch
    useEffect(() => {
        if (!editorRef.current) return;
        const pos = filePositionsRef.current[activeIndex] || { lineNumber: 1, column: 1 };
        editorRef.current.setPosition(pos);
        editorRef.current.revealPositionInCenter(pos);
    }, [activeIndex]);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [analysisResult, runOutput]);

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
    const run = async () => {
        setRunOutput('✅ 실행은 현재 지원되지 않습니다. 분석 결과를 확인하세요.');

        try {
            const analyzeRes = await fetch('http://localhost:4000/api/analyze', { method: 'POST' });
            const result = await analyzeRes.json();

            const formatted = Object.entries(result).map(
            ([file, msg]) => `📄 ${file}\n${msg}`
            ).join('\n\n');

            setAnalysisResult(formatted);

        } catch (err) {
            setAnalysisResult('❌ 분석 중 오류 발생');
        }
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
                    <div className="editor-area">
                        <Editor
                            height="100%"
                            width="100%"
                            theme="vs-dark"
                            language="c"
                            value={files[activeIndex].content}
                            onMount={handleEditorMount}
                            onChange={val => setFiles(prev => prev.map((f, i) => i === activeIndex ? { ...f, content: val } : f))}
                            options={{ fontSize: 14 }}
                        />
                    </div>
                    <div className="console-pane">
                        <div className="console-tabs">
                            <div
                            className={`console-tab ${activeTab === 'run' ? 'active' : ''}`}
                            onClick={() => setActiveTab('run')}
                            >
                            ▶ 실행 결과
                            </div>
                            <div
                            className={`console-tab ${activeTab === 'analyze' ? 'active' : ''}`}
                            onClick={() => setActiveTab('analyze')}
                            >
                            🔍 분석 결과
                            </div>
                        </div>
                        <div className="console-view" ref={consoleRef}>
                            <pre className="analysis-output">
                                {activeTab === 'run' ? runOutput || '아직 실행 결과가 없습니다.' : analysisResult || '아직 분석 결과가 없습니다.'}
                            </pre>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
