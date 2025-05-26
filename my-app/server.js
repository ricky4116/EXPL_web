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

// 미들웨어 설정
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
}));

// 세션 저장소 설정
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
        maxAge: 24 * 60 * 60 * 1000, // 1일
    },
}));

// — 회원가입
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

// — 로그인
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const { rows } = await pool.query(
            `SELECT email, password
         FROM users
        WHERE email = $1`,
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

// — 로그인 상태 확인
app.get('/api/me', (req, res) => {
    if (req.session.userEmail) {
        return res.json({ loggedIn: true, email: req.session.userEmail });
    }
    res.json({ loggedIn: false });
});

// — 로그아웃
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

// — GPT 분석 API
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

// — 프로젝트 생성
app.post('/api/projects', async (req, res) => {
    const user_email = req.session.userEmail;
    const { project_name } = req.body;
    if (!user_email) {
        return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    }
    try {
        const { rows } = await pool.query(
            `INSERT INTO projects (user_email, project_name)
         VALUES ($1, $2)
       RETURNING id, project_name, created_at`,
            [user_email, project_name]
        );
        res.json({ success: true, project: rows[0] });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).json({ success: false, error: '프로젝트 생성 실패' });
    }
});

// — 프로젝트 목록 조회
app.get('/api/projects', async (req, res) => {
    const user_email = req.session.userEmail;
    if (!user_email) {
        return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT id, project_name, created_at
         FROM projects
        WHERE user_email = $1
     ORDER BY created_at DESC`,
            [user_email]
        );
        res.json({ success: true, projects: rows });
    } catch (err) {
        console.error('Get projects error:', err);
        res.status(500).json({ success: false, error: '프로젝트 목록 조회 실패' });
    }
});

// — 특정 프로젝트의 파일 목록 조회 (READ)
app.get('/api/projects/:projectId/files', async (req, res) => {
    const { projectId } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT   id,
                          project_id,
                         file_name,
                           file_content  AS content,
                           created_at
                         FROM files
                      WHERE project_id = $1
                   ORDER BY created_at DESC`,
            [projectId]
        );
        res.json({ success: true, files: rows });

    } catch (err) {
        console.error('Get project files error:', err);
        res.status(500).json({ success: false, error: '파일 목록 조회 실패' });
    }
});

// — 파일 생성 (CREATE)
app.post('/api/projects/:projectId/files', async (req, res) => {
    const projectId = req.params.projectId;
    const { file_name, content } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO files (project_id, file_name, file_content)
                        VALUES ($1, $2, $3)
                       RETURNING
                         id,
                         project_id,
                         file_name,
                         file_content AS content,
                         created_at`,
            [projectId, file_name, content]
        );
        res.json({ success: true, file: rows[0] });
    } catch (err) {
        console.error('Create file error:', err);
        res.status(500).json({ success: false, error: '파일 생성 실패' });
    }
});

// — 파일 수정 (UPDATE)app.put

app.put('/api/projects/:projectId/files/:fileId', async (req, res) => {
    const { projectId, fileId } = req.params;
    const { file_name, content } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE files
            SET file_name    = COALESCE($2, file_name),
                file_content = COALESCE($3, file_content)
          WHERE id = $1
            AND project_id = $4
        RETURNING
            id,
            project_id,
            file_name,
            file_content AS content`,
            [fileId, file_name, content, projectId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
        }
        res.json({ success: true, file: rows[0] });
    } catch (err) {
        console.error('Rename file error:', err);
        res.status(500).json({ success: false, error: '이름 변경 실패' });
    }
});


// — 파일 삭제 (DELETE)
app.delete('/api/projects/:projectId/files/:fileId', async (req, res) => {
    const { projectId, fileId } = req.params;
    try {
        await pool.query(
            `DELETE FROM files
         WHERE id = $1
           AND project_id = $2`,
            [fileId, projectId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Delete file error:', err);
        res.status(500).json({ success: false, error: '파일 삭제 실패' });
    }
});

// 서버 시작
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
