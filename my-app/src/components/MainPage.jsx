import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Folder, FileText, Info, FileSignature, User, ChevronDown, Settings, Gift, Users, Terminal, LogOut } from 'lucide-react';
import '../css/MainPage.css';

export default function MainPage() {
    const [loading, setLoading] = useState(true);
    const [activeNav, setActiveNav] = useState('main');
    const [showMenu, setShowMenu] = useState(false);
    const navigate = useNavigate();
    const menuRef = useRef(null);

    // 인증 상태 확인
    useEffect(() => {
        fetch('http://localhost:4000/api/me', { method: 'GET', credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (!data.loggedIn) navigate('/');
                else setLoading(false);
            })
            .catch(err => { console.error(err); navigate('/'); });
    }, [navigate]);

    const handleCreateProject = () => navigate('/project');
    const handleLogout = () => {
        fetch('http://localhost:4000/api/logout', { method: 'POST', credentials: 'include' })
            .then(() => navigate('/'))
            .catch(err => { console.error(err); navigate('/'); });
    };

    const navItems = [
        { key: 'main', label: '홈화면', icon: Home },
        { key: 'projects', label: '프로젝트 관리', icon: Folder },
        { key: 'vulnList', label: '취약점 보고서', icon: FileText },
        { key: 'vulnEdu', label: '취약점 정보', icon: FileSignature },
        { key: 'tos', label: '개인정보 약관', icon: Info },
    ];

    // 클릭 외부영역 클릭시 메뉴 닫기
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (loading) return <p className="loading">로딩 중…</p>;

    return (
        <div className="page-wrapper">
            {/* Global Top Section */}
            <header className="top-section">
                <div className="top-left">
                    <span className="app-title">EXPL</span>
                </div>
                <div className="top-right" ref={menuRef}>
                    <div className="user-menu" onClick={() => setShowMenu(prev => !prev)}>
                        <User size={24} />
                        <ChevronDown size={16} />
                    </div>
                    {showMenu && (
                        <div className="dropdown-menu">
                            <div className="menu-item"><Settings size={16} /><span>계정</span></div>
                            <div className="menu-item"><User size={16} /><span>내 정보</span></div>
                            <div className="menu-item" onClick={handleLogout}><LogOut size={16} /><span>로그 아웃</span></div>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Container */}
            <div className="app-container">
                {/* Sidebar */}
                <aside className="sidebar">
                    <button className="create-btn" onClick={handleCreateProject}>
                        + 새 프로젝트 만들기
                    </button>
                    <nav className="nav-group">
                        {navItems.map(item => (
                            <div
                                key={item.key}
                                className={`nav-item ${activeNav === item.key ? 'active' : ''}`}
                                onClick={() => setActiveNav(item.key)}
                            >
                                <item.icon size={18} className="nav-icon" />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Main Area */}
                <div className="main-area">
                    {/* Page-specific Top Bar */}
                    <header className="topbar">
                        <div className="search-placeholder"></div>
                    </header>

                    {/* Content area */}
                    <section className="content">
                        {activeNav === 'main' && (
                            <section className="hero">
                                <h2>어떤 프로젝트를 만들겠습니까?</h2>
                                <div className="hero-input">
                                    <input type="text" placeholder="Describe an app or site you want to create…" />
                                    <button className="start-btn">Start building</button>
                                </div>
                            </section>
                        )}
                        {activeNav === 'projects' && <div className="projects-page"><h2>프로젝트 목록</h2></div>}
                        {activeNav === 'vulnList' && <div className="vuln-list-page"><h2>취약점 정리</h2></div>}
                        {activeNav === 'vulnEdu' && <div className="vuln-edu-page"><h2>취약점 교육</h2></div>}
                        {activeNav === 'tos' && <div className="tos-page"><h2>개인정보 약관</h2></div>}
                    </section>
                </div>
            </div>
        </div>
    );
}
