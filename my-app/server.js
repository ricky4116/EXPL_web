// server.js (CommonJS)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { exec } = require('child_process');
const { Pool } = require('pg');

const app = express();

const fs = require('fs');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);

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
app.post('/api/analyze', async (req, res) => {
    const { project_id } = req.body;
    if (!project_id) {
        return res.status(400).json({ success: false, error: 'project_id가 필요합니다.' });
    }

    try {
        // 1. 해당 프로젝트의 파일 목록 불러오기
        const { rows: files } = await pool.query(
            `SELECT id, file_name, file_content FROM files WHERE project_id = $1`,
            [project_id]
        );

        if (files.length === 0) {
            return res.json({ success: true, inserted: 0 });
        }

        // 2. analyze.py에 넘길 JSON 파일 생성
        const inputForAnalysis = files.map(f => ({
            id: f.id,
            name: f.file_name,
            content: f.file_content
        }));

        const tempPath = path.join(__dirname, 'analyze_input.json');
        fs.writeFileSync(tempPath, JSON.stringify(inputForAnalysis, null, 2));

        // 3. analyze.py 실행
        const { stdout } = await execAsync(`python "analyze.py" "${tempPath}"`);
        const result = JSON.parse(stdout); // vulnerabilities 리스트

        // 4. 분석 결과 DB에 저장
        for (const vuln of result) {
            const { id: fileId, vuln_name, vuln_description, old_code, new_code } = vuln;
            await pool.query(
                `INSERT INTO vulnerabilities (vuln_name, vuln_description, old_code, new_code, project_id, file_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [vuln_name, vuln_description, old_code, new_code, project_id, fileId]
            );
        }

        // 5. 임시 파일 삭제
        try {
            fs.unlinkSync(tempPath);
        } catch (e) {
            console.warn("⚠️ 임시 파일 삭제 실패:", e.message);
        }

        res.json({ success: true, inserted: result.length, result });
    } catch (err) {
        console.error('❌ 분석 중 오류:', err);
        res.status(500).json({ success: false, error: '서버 오류 또는 분석 실패' });
    }
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
// — 프로젝트 이름 수정 (UPDATE)
app.put('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { project_name } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE projects
           SET project_name = $1
         WHERE id = $2
       RETURNING id, project_name, created_at`,
            [project_name, projectId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
        }
        res.json({ success: true, project: rows[0] });
    } catch (err) {
        console.error('Rename project error:', err);
        res.status(500).json({ success: false, error: '프로젝트 이름 변경 실패' });
    }
});

// — 프로젝트 삭제 (DELETE)
app.delete('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        // (선택) 외래키로 파일도 같이 삭제되도록 CASCADE 설정이 안 되어 있다면
        // await pool.query('DELETE FROM files WHERE project_id = $1', [projectId]);

        const result = await pool.query(
            `DELETE FROM projects
           WHERE id = $1
        RETURNING id`,
            [projectId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete project error:', err);
        res.status(500).json({ success: false, error: '프로젝트 삭제 실패' });
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

// — 취약점 목록 조회
app.get('/api/vulnerabilities', async (req, res) => {
    const userEmail = req.session.userEmail;
    if (!userEmail) {
        return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT
                 v.id,
                 v.vuln_name,
                 v.vuln_description,
                 v.old_code,
                 v.new_code,
                 v.project_id,
                 v.file_id,
                 p.project_name,
                 f.file_name
             FROM vulnerabilities v
             JOIN projects p ON v.project_id = p.id
             JOIN files f    ON v.file_id    = f.id
             WHERE p.user_email = $1
             ORDER BY v.id DESC`,
            [userEmail]
        );
        res.json({ success: true, vulnerabilities: rows });
    } catch (err) {
        console.error('Get vulnerabilities error:', err);
        res.status(500).json({ success: false, error: '취약점 조회 실패' });
    }
});

// 서버 시작
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
