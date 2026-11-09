// src/components/VulnEduPage.jsx
import React, { useState, useEffect } from 'react';
import { ShieldAlert, FolderGit2, AlertTriangle, Search, ExternalLink, X } from 'lucide-react';
import '../css/VulnEduPage.css';

const API_BASE = 'http://localhost:4000';

export default function VulnEduPage() {
    const [stats, setStats] = useState({
        summary: { total_vulns: 0, affected_projects: 0, unique_types: 0 },
        topVulns: [],
        projectVulns: [],
        allVulns: []
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('ALL');
    const [selectedVuln, setSelectedVuln] = useState(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/vulnerabilities/stats`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setStats(data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    // 필터링된 취약점 목록
    const filteredList = stats.allVulns.filter(item => {
        const matchesSearch =
            item.vuln_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.vuln_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.file_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesProject = selectedProject === 'ALL' || item.project_name === selectedProject;
        return matchesSearch && matchesProject;
    });

    const maxTopCount = stats.topVulns.length > 0 ? stats.topVulns[0].count : 1;
    const maxProjectCount = stats.projectVulns.length > 0 ? stats.projectVulns[0].count : 1;

    if (loading) {
        return <div className="vuln-loading">통계 데이터 로딩 중...</div>;
    }

    return (
        <div className="vuln-edu-page">
            <header className="edu-header">
                <h2>🛡️ 취약점 보안 통계 및 가이드</h2>
                <p>데이터베이스에 기록된 코드 취약점 패턴과 통계 지표를 확인하고 보안 가이드를 학습합니다.</p>
            </header>

            {/* 1. 핵심 지표 요약 카드 */}
            <div className="stats-cards-grid">
                <div className="stat-card">
                    <div className="icon-wrapper red"><ShieldAlert size={26} /></div>
                    <div className="stat-content">
                        <span className="stat-label">총 발견된 취약점</span>
                        <h3 className="stat-value">{stats.summary.total_vulns}건</h3>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="icon-wrapper orange"><FolderGit2 size={26} /></div>
                    <div className="stat-content">
                        <span className="stat-label">영향받은 프로젝트</span>
                        <h3 className="stat-value">{stats.summary.affected_projects}개</h3>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="icon-wrapper blue"><AlertTriangle size={26} /></div>
                    <div className="stat-content">
                        <span className="stat-label">감지된 취약점 유형</span>
                        <h3 className="stat-value">{stats.summary.unique_types}종</h3>
                    </div>
                </div>
            </div>

            {/* 2. 통계 차트 그리드 */}
            <div className="charts-container">
                <div className="chart-box">
                    <h4>가장 빈번한 취약점 유형 Top 5</h4>
                    <div className="bar-chart">
                        {stats.topVulns.length === 0 ? <p className="empty-text">데이터 없음</p> :
                            stats.topVulns.map((v, i) => (
                                <div key={i} className="bar-row">
                                    <div className="bar-info">
                                        <span className="bar-name">{v.vuln_name}</span>
                                        <span className="bar-count">{v.count}건</span>
                                    </div>
                                    <div className="bar-track">
                                        <div
                                            className="bar-fill red"
                                            style={{ width: `${(v.count / maxTopCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>

                <div className="chart-box">
                    <h4>프로젝트별 취약점 분포</h4>
                    <div className="bar-chart">
                        {stats.projectVulns.length === 0 ? <p className="empty-text">데이터 없음</p> :
                            stats.projectVulns.map((p, i) => (
                                <div key={i} className="bar-row">
                                    <div className="bar-info">
                                        <span className="bar-name">{p.project_name}</span>
                                        <span className="bar-count">{p.count}건</span>
                                    </div>
                                    <div className="bar-track">
                                        <div
                                            className="bar-fill blue"
                                            style={{ width: `${(p.count / maxProjectCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>

            {/* 3. 검색 및 필터 바 */}
            <div className="list-controls">
                <div className="search-input-wrapper">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="취약점명, 설명, 파일명 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="project-select"
                >
                    <option value="ALL">전체 프로젝트 보기</option>
                    {stats.projectVulns.map((p, i) => (
                        <option key={i} value={p.project_name}>{p.project_name}</option>
                    ))}
                </select>
            </div>

            {/* 4. 취약점 목록 테이블 */}
            <div className="table-responsive">
                <table className="vuln-table">
                    <thead>
                        <tr>
                            <th>프로젝트</th>
                            <th>파일명</th>
                            <th>취약점 명칭</th>
                            <th>발견 일시</th>
                            <th>상세 보기</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="empty-row">일치하는 취약점 정보가 없습니다.</td>
                            </tr>
                        ) : (
                            filteredList.map(item => (
                                <tr key={item.id}>
                                    <td className="col-project">{item.project_name}</td>
                                    <td className="col-file">{item.file_name}</td>
                                    <td className="col-name"><strong>{item.vuln_name}</strong></td>
                                    <td className="col-date">{new Date(item.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button className="detail-btn" onClick={() => setSelectedVuln(item)}>
                                            원인/코드 <ExternalLink size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* 5. 취약점 상세 & 교육 모달 */}
            {selectedVuln && (
                <div className="modal-backdrop" onClick={() => setSelectedVuln(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{selectedVuln.vuln_name}</h3>
                            <button className="close-btn" onClick={() => setSelectedVuln(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="meta-group">
                                <span><strong>프로젝트:</strong> {selectedVuln.project_name}</span>
                                <span><strong>파일명:</strong> {selectedVuln.file_name}</span>
                            </div>

                            <div className="detail-section">
                                <h4>취약점 상세 설명</h4>
                                <p className="desc-text">{selectedVuln.vuln_description}</p>
                            </div>

                            <div className="code-comparison">
                                <div className="code-block bad">
                                    <h5>❌ 취약한 원본 코드</h5>
                                    <pre><code>{selectedVuln.old_code || '(내용 없음)'}</code></pre>
                                </div>
                                <div className="code-block good">
                                    <h5>✅ 보안 권장 코드</h5>
                                    <pre><code>{selectedVuln.new_code || '(내용 없음)'}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
