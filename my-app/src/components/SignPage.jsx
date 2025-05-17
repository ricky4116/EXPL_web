// src/components/SignPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import bcrypt from 'bcryptjs';
import '../css/SignPage.css';

export default function SignPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async e => {
        e.preventDefault();

        const isEmailValid = email.includes('@');
        const isPasswordValid = password.length >= 8;

        if (!isEmailValid && !isPasswordValid) {
            alert('이메일과 비밀번호를 다시 입력해주세요.');
            return;
        }
        if (!isEmailValid) {
            alert('이메일을 다시 입력해주세요.');
            return;
        }
        if (!isPasswordValid) {
            alert('비밀번호를 다시 입력해주세요. (최소 8자)');
            return;
        }

        // 클라이언트 측 해시 (선택)
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        try {
            const res = await fetch('http://localhost:4000/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: hashedPassword })
            });
            const data = await res.json();

            if (data.success) {
                alert('가입이 완료되었습니다!');
                navigate('/');
            } else {
                alert('가입 중 오류가 발생했습니다: ' + (data.error || '알 수 없는 오류'));
            }
        } catch (err) {
            console.error(err);
            alert('네트워크 오류가 발생했습니다.');
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>회원가입</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="이메일"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="비밀번호"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button type="submit" className="btn primary">
                        가입하기
                    </button>
                </form>
                <p className="signup">
                    이미 계정이 있다면{' '}
                    <Link to="/" className="signup-link">
                        로그인
                    </Link>
                </p>
            </div>
            <div className="login-image">
                <div className="overlay">
                    <h1>Welcome to EXPL</h1>
                </div>
            </div>
        </div>
    );
}
