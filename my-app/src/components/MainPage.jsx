// src/components/MainPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Home, FileText, Info, FileSignature,
    User, ChevronDown, Settings, LogOut
} from 'lucide-react';
import '../css/MainPage.css';

export default function MainPage() {
    const [loading, setLoading] = useState(true);
    const [activeNav, setActiveNav] = useState('main');
    const [showMenu, setShowMenu] = useState(false);
    const [projects, setProjects] = useState([]);
    const [userEmail, setUserEmail] = useState('');
    const navigate = useNavigate();
    const menuRef = useRef(null);

    // 로그인 상태 확인 및 이메일 저장
    useEffect(() => {
        fetch('http://localhost:4000/api/me', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (!data.loggedIn) return navigate('/');
                setUserEmail(data.email);
                setLoading(false);
            })
            .catch(err => { console.error('Auth fetch error:', err); navigate('/'); });
    }, [navigate]);

    // 프로젝트 목록 불러오기 (홈화면 활성 시)
    useEffect(() => {
        if (activeNav === 'main' && userEmail) {
            fetch('http://localhost:4000/api/projects', { credentials: 'include' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) setProjects(data.projects);
                    else console.error('Fetch projects failed:', data.error);
                })
                .catch(err => console.error('Projects fetch error:', err));
        }
    }, [activeNav, userEmail]);

    // 무작위 프로젝트명 생성
    const generateRandomProjectName = () => {
        const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Hotel', 'India', 'Juliet'];
        const rand = words[Math.floor(Math.random() * words.length)];
        const suffix = Math.random().toString(36).substring(2, 6);
        return `${rand}_${suffix}`;
    };

    // 생성 핸들러
    const handleCreateProject = async () => {
        const projectName = generateRandomProjectName();
        try {
            const res = await fetch('http://localhost:4000/api/projects', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_name: projectName })
            });
            const json = await res.json();
            if (res.ok && json.success) setProjects(prev => [json.project, ...prev]);
            else console.error('Project create error:', json.error);
        } catch (err) {
            console.error('Network or server error:', err);
        }
    };

    // 로그아웃 핸들러
    const handleLogout = () => {
        fetch('http://localhost:4000/api/logout', { method: 'POST', credentials: 'include' })
            .then(() => navigate('/'))
            .catch(err => { console.error('Logout error:', err); navigate('/'); });
    };

    const navItems = [
        { key: 'main', label: '홈화면', icon: Home },
        { key: 'vulnList', label: '취약점 보고서', icon: FileText },
        { key: 'vulnEdu', label: '취약점 정보', icon: FileSignature },
        { key: 'tos', label: '개인정보 약관', icon: Info },
    ];

    // 메뉴 닫기
    useEffect(() => {
        const onClick = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (loading) return <p className="loading">로딩 중…</p>;

    return (
        <div className="page-wrapper">
            {/* Top */}
            <header className="top-section">
                <div className="top-left"><span className="app-title">EXPL</span></div>
                <div className="top-right" ref={menuRef}>
                    <div className="user-menu" onClick={() => setShowMenu(v => !v)}>
                        <User size={24} /><ChevronDown size={16} />
                    </div>
                    {showMenu && (
                        <div className="dropdown-menu">
                            <div className="menu-item"><Settings size={16} /><span>계정</span></div>
                            <div className="menu-item" onClick={handleLogout}><LogOut size={16} /><span>로그 아웃</span></div>
                        </div>
                    )}
                </div>
            </header>

            {/* Container */}
            <div className="app-container">
                {/* Sidebar */}
                <aside className="sidebar">
                    <button className="create-btn" onClick={handleCreateProject}>+ 새 프로젝트 만들기</button>
                    <nav className="nav-group">
                        {navItems.map(item => (
                            <div key={item.key}
                                className={`nav-item ${activeNav === item.key ? 'active' : ''}`}
                                onClick={() => setActiveNav(item.key)}>
                                <item.icon size={18} className="nav-icon" />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Main Area */}
                <div className="main-area">
                    <header className="topbar"><div className="search-placeholder"></div></header>
                    <section className="content">
                        {activeNav === 'main' && (
                            <>
                                <section className="hero">
                                    <h2>어떤 프로젝트를 만들겠습니까?</h2>
                                    <div className="hero-input">
                                        <input placeholder="Describe an app or site you want to create…" />
                                        <button className="start-btn">Start building</button>
                                    </div>
                                </section>
                                {/* 프로젝트 목록 영역 */}
                                <div className="projects-page">
                                    <h2>프로젝트 목록</h2>
                                    <div className="projects-list">
                                        {projects.map(p => (
                                            <div key={p.id}
                                                className="project-card"
                                                onClick={() => navigate(`/project/${p.id}`)}>
                                                <h3>{p.project_name}</h3>
                                                <small>{new Date(p.created_at).toLocaleString()}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        {activeNav === 'vulnList' && <div className="vuln-list-page"><h2>취약점 정리</h2></div>}
                        {activeNav === 'vulnEdu' && <div className="vuln-edu-page"><h2>취약점 교육</h2></div>}
                        {activeNav === 'tos' && <div className="tos-page"><h2>개인정보 약관</h2></div>}
                    </section>
                </div>
            </div>
        </div>
    );
}
