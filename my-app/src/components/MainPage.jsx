// src/components/MainPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Home,
    FileText,
    Info,
    FileSignature,
    User,
    ChevronDown,
    Settings,
    LogOut,
    AlertTriangle,
    Code,
    RefreshCw
} from 'lucide-react';
import VulnEduPage from './VulnEduPage';
import '../css/MainPage.css';

export default function MainPage() {
    const [loading, setLoading] = useState(true);
    const [activeNav, setActiveNav] = useState('main');
    const [showMenu, setShowMenu] = useState(false);
    const [projects, setProjects] = useState([]);
    const [vulnerabilities, setVulnerabilities] = useState([]);
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


    useEffect(() => {
        if (activeNav === 'vulnList') {
            fetch('http://localhost:4000/api/vulnerabilities', { credentials: 'include' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) setVulnerabilities(data.vulnerabilities);
                    else console.error('Fetch vulnerabilities failed:', data.error);
                })
                .catch(err => console.error('Vulnerabilities fetch error:', err));
        }
    }, [activeNav]);

    // 무작위 프로젝트명 생성
    const generateRandomProjectName = () => {
        const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Hotel', 'India', 'Juliet'];
        const rand = words[Math.floor(Math.random() * words.length)];
        const suffix = Math.random().toString(36).substring(2, 6);
        return `${rand}_${suffix}`;
    };

    // 상대 날짜 계산 헬퍼
    const getRelativeDate = timestamp => {
        const created = new Date(timestamp);
        const now = new Date();
        const diffMs = now.setHours(0, 0, 0, 0) - created.setHours(0, 0, 0, 0);
        const day = 24 * 60 * 60 * 1000;
        const daysAgo = Math.floor(diffMs / day);
        if (daysAgo === 0) return '오늘';
        if (daysAgo === 1) return '1일 전';
        return `${daysAgo}일 전`;
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
            if (res.ok && json.success) {
                navigate(`/project/${json.project.id}`);
            } else {
                console.error('Project create error:', json.error);
            }
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
                <div className="top-left">
                    <span
                        className="app-title"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveNav('main')}
                    >EXPL</span>
                </div>
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
                                                <small>{getRelativeDate(p.created_at)}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeNav === 'vulnList' && (
                            <div className="vuln-list-page">
                                <h2>취약점 보고서</h2>
                                <div className="vuln-cards">
                                    {vulnerabilities.map(v => (
                                        <div key={v.id} className="vuln-card">
                                            <div className="vuln-card-header">
                                                <AlertTriangle size={20} />
                                                <span className="vuln-title">{v.vuln_name}</span>
                                            </div>
                                            <div className="vuln-card-body">
                                                <div className="vuln-desc">
                                                    <Info size={16} />
                                                    <p>{v.vuln_description}</p>
                                                </div>
                                                <div className="code-group">
                                                    <div className="code-item">
                                                        <div className="code-label">
                                                            <Code size={16} /><span>이전</span>
                                                        </div>
                                                        <pre>{v.old_code}</pre>
                                                    </div>
                                                    <div className="code-item">
                                                        <div className="code-label">
                                                            <RefreshCw size={16} /><span>수정</span>
                                                        </div>
                                                        <pre>{v.new_code}</pre>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activeNav === 'vulnEdu' && <VulnEduPage />}
                        {activeNav === 'tos' && (
                            <div className="tos-page scrollable">
                                <h2>개인정보 이용약관</h2>
                                <h3>제1조 (목적)</h3>
                                <p>이 약관은 이용자가 본 서비스(이하 "서비스")를 이용함에 있어 필요한 조건 및 책임 사항을 규정함을 목적으로 합니다.</p>
                                <h3>제2조 (파일 보관 및 삭제 정책)</h3>
                                <p>사용자가 업로드한 모든 파일은 업로드 시점으로부터 1일이 지나면 자동으로 삭제됩니다. 당사는 파일의 지속적 보관을 보장하지 않으며, 삭제 이전 사용자에 의한 사용 또는 손실에 대해서는 어떠한 책임도 지지 않습니다.</p>
                                <h3>제3조 (분석 결과의 정확성 책임 부인)</h3>
                                <p>본 서비스는 정적/동적 분석 도구를 활용한 자동화된 분석 결과를 제공합니다. 분석 결과는 참고용으로 제공되며, 절대적인 정확성이나 완전성을 보장하지 않습니다. 분석 결과를 기반으로 한 의사결정 및 결과에 대해서 당사는 책임을 지지 않습니다.</p>
                                <h3>제4조 (저작권 및 불법 파일 관련 책임)</h3>
                                <p>사용자는 업로드한 파일이 타인의 권리를 침해하지 않으며, 국내 및 국제법에 저촉되지 않는다는 점을 보증해야 합니다.
                                    저작권 침해, 불법 콘텐츠 포함, 악성코드 유포 등의 문제가 발생할 경우 모든 책임은 사용자에게 있습니다.
                                    당사는 해당 콘텐츠의 내용에 대해 사전 검열을 하지 않으며, 발견 시 즉시 삭제 및 법적 대응을 할 수 있습니다.</p>
                                <h3>제5조 (서비스 제공자의 면책 조항)</h3>
                                <p>본 서비스는 "있는 그대로(as-is)" 제공되며, 특정 목적에의 적합성이나 비침해성에 대한 보증을 하지 않습니다.
                                    당사는 서비스의 오류, 중단, 데이터 손실, 해킹 등으로 인해 발생한 손해에 대해 책임을 지지 않습니다.
                                    천재지변, 통신 장애, 외부 공격 등 당사의 통제를 벗어난 사유로 인해 서비스 이용에 제한이 발생할 경우, 당사는 이에 대해 면책됩니다.</p>
                                <h3>제6조 (약관의 변경)</h3>
                                <p>본 약관은 사전 공지 없이 변경될 수 있으며, 변경 시 서비스 내 공지를 통해 고지합니다.
                                    변경된 약관은 공지 즉시 효력을 가지며, 이후에도 서비스를 이용할 경우 변경된 약관에 동의한 것으로 간주됩니다.</p>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
