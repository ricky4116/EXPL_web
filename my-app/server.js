// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';

const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '1127',
    database: 'graduate_web'
});

// 세션 스토어 설정
const PgStore = pgSession(session);
app.use(session({
    store: new PgStore({ pool }),
    secret: '세션_비밀키를_여기에',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, maxAge: 86400000 }
}));

// 회원가입 (변경 없음)
app.post('/api/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const salt = bcrypt.genSaltSync(10);
        const hashed = bcrypt.hashSync(password, salt);
        const result = await pool.query(
            `INSERT INTO users (email, password)
       VALUES ($1, $2)
       RETURNING created_at`,
            [email, hashed]
        );
        res.json({ success: true, created_at: result.rows[0].created_at });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 로그인
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body; // identifier === email
    try {
        // email 컬럼만 조회
        const result = await pool.query(
            `SELECT email, password
       FROM users
       WHERE email = $1`,
            [identifier]
        );
        if (result.rowCount === 0) {
            return res.json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        const { email: userEmail, password: hash } = result.rows[0];
        const isMatch = await bcrypt.compare(password, hash);
        if (!isMatch) {
            return res.json({ success: false, error: '비밀번호가 일치하지 않습니다.' });
        }

        // 세션에 email 저장
        req.session.userEmail = userEmail;
        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: '서버 오류' });
    }
});

// 로그인 상태 확인
app.get('/api/me', (req, res) => {
    if (req.session.userEmail) {
        return res.json({ loggedIn: true, email: req.session.userEmail });
    }
    return res.json({ loggedIn: false });
});

// 로그아웃
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false });
        res.clearCookie('connect.sid');
        return res.json({ success: true });
    });
});

app.listen(4000, () => console.log('Server running on port 4000'));
