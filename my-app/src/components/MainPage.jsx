// src/components/MainPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/MainPage.css';

export default function MainPage() {
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // 인증 상태 확인
    useEffect(() => {
        fetch('http://localhost:4000/api/me', {
            method: 'GET',
            credentials: 'include',
        })
            .then(res => res.json())
            .then(data => {
                if (!data.loggedIn) {
                    navigate('/');
                } else {
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error(err);
                navigate('/');
            });
    }, [navigate]);


    const handleCreateProject = () => {
        navigate('/project');
    };
    // 로그아웃 핸들러
    const handleLogout = () => {
        fetch('http://localhost:4000/api/logout', {
            method: 'POST',
            credentials: 'include',
        })
            .then(() => {
                navigate('/');
            })
            .catch(err => {
                console.error(err);
                navigate('/');
            });
    };

    if (loading) {
        return <p className="loading">로딩 중…</p>;
    }

    const quickLinks = [
        'Waitlist website',
        'Local landmarks map',
        'AI chat'
    ];

    const recentApps = [
        { name: 'InsignificantAccurateProject', date: '3 days ago' },
        { name: 'SnarlingIndigoMonitor', date: '3 years ago' }
    ];

    return (
        <div className="app-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <button
                    className="create-btn"
                    onClick={handleCreateProject}  >
                    + Create Project
                </button>
                <nav className="nav-group">
                    <a className="nav-item active">Home</a>
                    <a className="nav-item">Apps</a>
                    <a className="nav-item">Deployments</a>
                    <a className="nav-item">Usage</a>
                    <a className="nav-item">Teams</a>
                </nav>
                <div className="explore">
                    <p className="explore-title">Explore Replit</p>
                    <a className="nav-item">Bounties</a>
                    <a className="nav-item">Templates</a>
                    <a className="nav-item">Learn</a>
                    <a className="nav-item">Documentation</a>
                </div>
                <div className="plan-info">
                    <p>Your Starter Plan</p>
                    <small>Approaching plan limit for Public Apps.</small>
                </div>
            </aside>

            {/* Main content */}
            <div className="main-area">
                {/* Top bar */}
                <header className="topbar">
                    <div className="search-placeholder">Search &amp; run commands…</div>
                    <button className="quick-link-btn" onClick={handleLogout}>로그아웃</button>
                </header>

                {/* Hero section */}
                <section className="hero">
                    <h2>Hi 창민, what do you want to make?</h2>
                    <div className="hero-input">
                        <input type="text" placeholder="Describe an app or site you want to create…" />
                        <button className="start-btn">Start building</button>
                    </div>
                </section>

                {/* Quick links */}
                <section className="quick-links">
                    {quickLinks.map((q, i) => (
                        <button key={i} className="quick-link-btn">{q}</button>
                    ))}
                </section>

                {/* Recent Apps */}
                <section className="recent-apps">
                    <h3>Your recent Apps</h3>
                    <div className="cards">
                        {recentApps.map((app, i) => (
                            <div key={i} className="app-card">
                                <div className="icon">C</div>
                                <div className="info">
                                    <strong>{app.name}</strong>
                                    <small>{app.date}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
