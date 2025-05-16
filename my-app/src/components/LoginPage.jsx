// src/components/LoginPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import '../css/LoginPage.css';

function LoginPage() {
    return (
        <div className="login-container">

            {/* 좌측 로그인 폼 */}
            <div className="login-form">
                <h2>계정을 로그인하세요</h2>

                <input type="text" placeholder="이메일 또는 아이디" />
                <input type="password" placeholder="비밀번호" />
                <button className="btn primary">로그인</button>

                {/* 비밀번호 찾기도 라우터가 있다면 Link로 */}
                <Link to="/forgot" className="forgot">
                    비밀번호 찾기
                </Link>

                <div className="social-btns">
                    <button className="btn">구글로 로그인</button>
                    <button className="btn">깃허브로 로그인</button>
                </div>

                <p className="signup">
                    <span>계정이 없으신가요? </span>
                    <Link to="/sign" className="signup-link">
                        회원가입
                    </Link>
                </p>
            </div>

            {/* 우측 CSS 그라데이션 배경 + 오버레이 텍스트 */}
            <div className="login-image">
                <div className="overlay">
                    <h1>EXPL</h1>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
