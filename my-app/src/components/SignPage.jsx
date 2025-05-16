// src/components/SignPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import '../css/SignPage.css';

export default function SignPage() {
    return (
        <div className="login-container">
            {/* 좌측 회원가입 폼 */}
            <div className="login-form">
                <h2>회원가입</h2>
                <input type="email" placeholder="이메일" />
                <input type="password" placeholder="비밀번호" />
                <button className="btn primary">가입하기</button>

                <p className="signup">
                    이미 계정이 있다면{' '}
                    <Link to="/" className="signup-link">
                        로그인
                    </Link>
                </p>
            </div>

            {/* 우측 그라데이션 배경 */}
            <div className="login-image">
                <div className="overlay">
                    <h1>Welcome to EXPL</h1>
                </div>
            </div>
        </div>
    );
}
