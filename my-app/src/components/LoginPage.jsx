// src/components/LoginPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import googleIcon from '../assets/google_icon.png';
import githubIcon from '../assets/github_icon.png';
import '../css/LoginPage.css';

function LoginPage() {
    const [identifier, setIdentifier] = useState(''); // 이메일 또는 아이디
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async () => {
        if (!identifier || !password) {
            alert('아이디(또는 이메일)와 비밀번호를 모두 입력해주세요.');
            return;
        }

        try {
            const res = await fetch('http://localhost:4000/api/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            const data = await res.json();

            if (data.success) {
                // 로그인 성공 시 MainPage로 이동
                navigate('/main');
            } else {
                alert('로그인에 실패했습니다: ' + (data.error || '아이디 또는 비밀번호를 확인해주세요.'));
            }
        } catch (err) {
            console.error(err);
            alert('네트워크 오류가 발생했습니다.');
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>계정을 로그인하세요</h2>

                <input
                    type="text"
                    placeholder="이메일 또는 아이디"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="비밀번호"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />
                <button
                    className="btn primary"
                    onClick={handleLogin}
                >
                    로그인
                </button>

                <Link to="/forgot" className="forgot">
                    비밀번호 찾기
                </Link>

                <div className="social-btns">
                    <button className="btn">
                        <img src={googleIcon} alt="Google icon" className="icon" />
                        구글로 로그인
                    </button>
                    <button className="btn">
                        <img src={githubIcon} alt="GitHub icon" className="icon" />
                        깃허브로 로그인
                    </button>
                </div>

                <p className="signup">
                    <span>계정이 없으신가요? </span>
                    <Link to="/sign" className="signup-link">
                        회원가입
                    </Link>
                </p>
            </div>

            <div className="login-image">
                <div className="overlay">
                    <h1>EXPL</h1>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
