// src/components/ForgotPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import '../css/ForgotPage.css';

export default function ForgotPage() {
    return (
        <div className="login-container">
            {/* 좌측 비밀번호 찾기 폼 */}
            <div className="login-form">
                <h2>비밀번호 찾기</h2>
                <input type="email" placeholder="이메일을 입력하세요" />
                <button className="btn primary">이메일로 전송</button>

                <p className="signup">
                    <Link to="/" className="signup-link">
                        로그인 화면으로 돌아가기
                    </Link>
                </p>
            </div>

            {/* 우측 그라데이션 배경 */}
            <div className="login-image">
                <div className="overlay">
                    <h1>EXPL</h1>
                </div>
            </div>
        </div>
    );
}
