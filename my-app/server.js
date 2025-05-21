// server.js (CommonJS)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { exec } = require('child_process');
const { Pool } = require('pg');

const app = express();

// 신뢰할 프록시 설정
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// AWS RDS(PostgreSQL) 연결 풀 설정
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
});

// 미들웨어
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
}));

// 세션 스토어 설정
app.use(session({
    name: 'sid',
    store: new PgSession({ pool }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 1일 (만료기간)
    },
}));

// 회원가입 (비밀번호 해시 없이)
app.post('/api/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO users (email, password)
             VALUES ($1, $2)
             RETURNING created_at`,
            [email, password]
        );
        res.json({ success: true, created_at: rows[0].created_at });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 로그인 (비밀번호 평문 비교)
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const { rows } = await pool.query(
            `SELECT email, password FROM users WHERE email = $1`,
            [identifier]
        );
        if (!rows.length) {
            return res.json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        const { email: userEmail, password: storedPassword } = rows[0];
        if (password !== storedPassword) {
            return res.json({ success: false, error: '비밀번호가 일치하지 않습니다.' });
        }

        req.session.userEmail = userEmail;
        res.json({ success: true });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: '서버 오류' });
    }
});

// 로그인 상태 확인
app.get('/api/me', (req, res) => {
    if (req.session.userEmail) {
        return res.json({ loggedIn: true, email: req.session.userEmail });
    }
    res.json({ loggedIn: false });
});

// 로그아웃
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false });
        }
        res.clearCookie('sid');
        res.json({ success: true });
    });
});

// GPT 분석 API
app.post('/api/analyze', (req, res) => {
    exec('python analyze.py', (error, stdout, stderr) => {
        if (error) {
            console.error('Python 실행 오류:', stderr);
            return res.status(500).json({ error: '분석 중 오류 발생' });
        }
        try {
            const result = JSON.parse(stdout);
            res.json(result);
        } catch (e) {
            console.error('분석 결과 파싱 실패:', stdout);
            res.status(500).json({ error: '결과 처리 실패' });
        }
    });
});

// 서버 시작
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
