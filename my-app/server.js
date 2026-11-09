// server.js (CommonJS)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { execFile } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const util = require('util');
const crypto = require('crypto');
const execFileAsync = util.promisify(execFile);
const app = express();

// 신뢰할 프록시 설정
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// AWS RDS(PostgreSQL) 연결 풀 설정
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
        rejectUnauthorized: false // AWS RDS 연결 허용
    }
});

// 데이터베이스 초기 테이블 자동 생성 함수
async function initDB() {
    const createTablesQuery = `
        CREATE TABLE IF NOT EXISTS analysis_cache (
            id SERIAL PRIMARY KEY,
            code_hash VARCHAR(64) UNIQUE NOT NULL,
            vulnerabilities JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            user_email VARCHAR(255) NOT NULL,
            project_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS files (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            file_name VARCHAR(255) NOT NULL,
            file_content TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vulnerabilities (
            id SERIAL PRIMARY KEY,
            vuln_name VARCHAR(255),
            vuln_description TEXT,
            old_code TEXT,
            new_code TEXT,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(createTablesQuery);
        console.log('✅ 데이터베이스 테이블(analysis_cache, users, projects, files, vulnerabilities) 확인 및 생성 완료');
    } catch (err) {
        console.error('❌ 테이블 초기화 실패:', err);
    }
}

// 미들웨어 설정
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
}));

// 세션 저장소 설정
app.use(session({
    name: 'sid',
    store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
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

// ── [비동기 메시지 큐 & 워커 스케줄러] ──────────────────────────
const jobQueue = new Map(); // jobId -> { status: 'pending'|'completed'|'failed', result: null, error: null }

// 코드 해시(SHA-256) 생성 함수 (응답 캐싱용)
function calculateHash(files) {
    const combined = files.map(f => `${f.name}:${f.content}`).sort().join('||');
    return crypto.createHash('sha256').update(combined).digest('hex');
}

// 백그라운드 Worker: 파일 동기화, 캐시 조회, Python 분석, DB 저장을 비동기로 실행
async function processAnalysisJob(jobId, projectId, currentFiles) {
    const job = jobQueue.get(jobId);
    if (!job) return;

    try {
        // ── [자동 캐시 초기화] 매 분석 실행 시 기존 캐시와 오염 데이터를 자동으로 비움 ──
        await pool.query('DELETE FROM analysis_cache;');
        await pool.query("DELETE FROM vulnerabilities WHERE vuln_name LIKE '%취약점 분석 지연%';");
        console.log(`🧹 [Auto Clean] Job ${jobId} 시작 전 캐시 자동 정리 완료`);

        // 1. 해당 프로젝트 존재 여부 확인
        const projCheck = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
        if (projCheck.rows.length === 0) {
            throw new Error(`ID ${projectId}번 프로젝트가 존재하지 않습니다.`);
        }

        // 2. 전달된 파일 DB 동기화 및 file_id 매핑 테이블 구성
        const fileNameToIdMap = {};

        if (Array.isArray(currentFiles) && currentFiles.length > 0) {
            for (const file of currentFiles) {
                if (!file.name) continue;

                const checkFile = await pool.query(
                    `SELECT id FROM files WHERE project_id = $1 AND file_name = $2`,
                    [projectId, file.name]
                );

                if (checkFile.rows.length > 0) {
                    const updated = await pool.query(
                        `UPDATE files SET file_content = $1 WHERE id = $2 RETURNING id`,
                        [file.content || '', checkFile.rows[0].id]
                    );
                    fileNameToIdMap[file.name] = updated.rows[0].id;
                } else {
                    const inserted = await pool.query(
                        `INSERT INTO files (project_id, file_name, file_content) VALUES ($1, $2, $3) RETURNING id`,
                        [projectId, file.name, file.content || '']
                    );
                    fileNameToIdMap[file.name] = inserted.rows[0].id;
                }
            }
        }

        // 3. 파일 목록 조회
        const { rows: files } = await pool.query(
            `SELECT id, file_name, file_content FROM files WHERE project_id = $1`,
            [projectId]
        );

        if (files.length === 0) {
            job.status = 'completed';
            job.result = [];
            return;
        }

        files.forEach(f => {
            fileNameToIdMap[f.file_name] = f.id;
        });

        // 4. 응답 캐시(Response Caching) 확인
        const codeHash = calculateHash(files);
        const cacheCheck = await pool.query(
            `SELECT vulnerabilities FROM analysis_cache WHERE code_hash = $1`,
            [codeHash]
        );

        let result = [];
        if (cacheCheck.rows.length > 0) {
            console.log(`⚡ [Cache Hit] 동일한 코드 패턴 감지 - 캐시 반환 (Hash: ${codeHash.substring(0, 8)})`);
            const cachedData = cacheCheck.rows[0].vulnerabilities;
            // 문자열이면 파싱, 이미 파싱된 배열/객체면 그대로 할당
            result = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        } else {
            console.log(`⚙️ [Worker] 새 분석 수행 (Job: ${jobId}, 파일 ${files.length}개)`);

            const tempFileName = `analyze_input_${jobId}.json`;
            const tempPath = path.join(__dirname, tempFileName);

            const inputForAnalysis = files.map(f => ({
                id: f.id,
                name: f.file_name,
                content: f.file_content || ""
            }));

            fs.writeFileSync(tempPath, JSON.stringify(inputForAnalysis, null, 2), 'utf-8');

            const { stdout, stderr } = await execFileAsync(
                'python',
                ['-u', 'analyze.py', tempFileName],
                {
                    cwd: __dirname,
                    encoding: 'utf-8',
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                    timeout: 90000,
                    maxBuffer: 10 * 1024 * 1024
                }
            );

            // 임시 파일 삭제
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }

            if (stderr) {
                console.log(`>> [Python Log (${jobId})]:\n`, stderr);
            }

            const cleanOutput = (stdout || '').trim();
            try {
                result = cleanOutput ? JSON.parse(cleanOutput) : [];
            } catch (jsonErr) {
                console.error("❌ 파이썬 결과 JSON 파싱 실패:", cleanOutput);
                throw new Error("분석기 응답 형식이 올바르지 않습니다.");
            }

            // 분석 결과를 캐시 테이블에 저장
            await pool.query(
                `INSERT INTO analysis_cache (code_hash, vulnerabilities)
                 VALUES ($1, $2)
                 ON CONFLICT (code_hash) DO NOTHING`,
                [codeHash, JSON.stringify(result)]
            );
        }

        // 5. 기존 취약점 내역 삭제 후 DB 재저장
        await pool.query(`DELETE FROM vulnerabilities WHERE project_id = $1`, [projectId]);

        for (const vuln of result) {
            const { file_name, vuln_name, vuln_description, old_code, new_code } = vuln;
            const targetFileId = fileNameToIdMap[file_name] || files[0].id;

            await pool.query(
                `INSERT INTO vulnerabilities (vuln_name, vuln_description, old_code, new_code, project_id, file_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [vuln_name, vuln_description, old_code, new_code, projectId, targetFileId]
            );
        }

        // 작업 성공 완료 처리
        job.status = 'completed';
        job.result = result;
    } catch (err) {
        console.error(`❌ [Worker Error] Job ${jobId} 처리 실패:`, err);
        job.status = 'failed';
        job.error = err.message || '분석 중 서버 오류가 발생했습니다.';
    }
}

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

// — 파일 생성 및 실시간 자동저장(Upsert)
app.post('/api/projects/:projectId/files/save', async (req, res) => {
    const { projectId } = req.params;
    const { file_name, content } = req.body;

    if (!file_name) {
        return res.status(400).json({ success: false, error: 'file_name이 필요합니다.' });
    }

    try {
        const checkRes = await pool.query(
            `SELECT id FROM files WHERE project_id = $1 AND file_name = $2`,
            [projectId, file_name]
        );

        let savedFile;
        if (checkRes.rows.length > 0) {
            const updateRes = await pool.query(
                `UPDATE files
                 SET file_content = $1
                 WHERE id = $2
                 RETURNING id, project_id, file_name, file_content AS content, created_at`,
                [content, checkRes.rows[0].id]
            );
            savedFile = updateRes.rows[0];
        } else {
            const insertRes = await pool.query(
                `INSERT INTO files (project_id, file_name, file_content)
                 VALUES ($1, $2, $3)
                 RETURNING id, project_id, file_name, file_content AS content, created_at`,
                [projectId, file_name, content]
            );
            savedFile = insertRes.rows[0];
        }

        res.json({ success: true, file: savedFile });
    } catch (err) {
        console.error('File save error:', err);
        res.status(500).json({ success: false, error: '파일 저장 실패' });
    }
});

// — 분석 요청 (비동기 작업 큐 접수 및 jobId 즉시 반환)
app.post('/api/analyze', async (req, res) => {
    let { project_id, currentFiles } = req.body;
    project_id = Number(project_id);

    if (!project_id || isNaN(project_id)) {
        return res.status(400).json({ success: false, error: '유효한 project_id가 필요합니다.' });
    }

    // 고유 작업 ID 발급 및 큐 등록
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    jobQueue.set(jobId, { status: 'pending', result: null, error: null });

    // 워커 백그라운드 비동기 실행 (await를 걸지 않아 클라이언트 블로킹 없음)
    processAnalysisJob(jobId, project_id, currentFiles || []);

    // 202 Accepted 반환
    res.status(202).json({
        success: true,
        message: '분석 작업이 비동기 큐에 등록되었습니다.',
        jobId: jobId
    });
});

// — 비동기 분석 작업 상태 확인 API (Polling용)
app.get('/api/analyze/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobQueue.get(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: '해당 작업을 찾을 수 없습니다.' });
    }

    res.json({
        success: true,
        status: job.status,
        result: job.result,
        error: job.error
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

// — 프로젝트 이름 수정
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

// — 프로젝트 삭제
app.delete('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
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

// — 특정 프로젝트의 파일 목록 조회
app.get('/api/projects/:projectId/files', async (req, res) => {
    const { projectId } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, project_id, file_name, file_content AS content, created_at
             FROM files
             WHERE project_id = $1
             ORDER BY created_at ASC`,
            [projectId]
        );
        res.json({ success: true, files: rows });
    } catch (err) {
        console.error('Get project files error:', err);
        res.status(500).json({ success: false, error: '파일 목록 조회 실패' });
    }
});

// — 파일 생성
app.post('/api/projects/:projectId/files', async (req, res) => {
    const { projectId } = req.params;
    const { file_name, content } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO files (project_id, file_name, file_content)
             VALUES ($1, $2, $3)
             RETURNING id, project_id, file_name, file_content AS content, created_at`,
            [projectId, file_name, content || '']
        );
        res.json({ success: true, file: rows[0] });
    } catch (err) {
        console.error('Create file error:', err);
        res.status(500).json({ success: false, error: '파일 생성 실패' });
    }
});

// — 파일 수정
app.put('/api/projects/:projectId/files/:fileId', async (req, res) => {
    const { projectId, fileId } = req.params;
    const { file_name, content } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE files
             SET file_name    = COALESCE($2, file_name),
                 file_content = COALESCE($3, file_content)
             WHERE id = $1 AND project_id = $4
             RETURNING id, project_id, file_name, file_content AS content`,
            [fileId, file_name, content, projectId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
        }
        res.json({ success: true, file: rows[0] });
    } catch (err) {
        console.error('Update file error:', err);
        res.status(500).json({ success: false, error: '파일 수정 실패' });
    }
});

// — 파일 삭제
app.delete('/api/projects/:projectId/files/:fileId', async (req, res) => {
    const { projectId, fileId } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM files
             WHERE id = $1 AND project_id = $2`,
            [fileId, projectId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '삭제할 파일을 찾을 수 없습니다.' });
        }
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

// 취약점 통계 및 현황 조회 API
app.get('/api/vulnerabilities/stats', async (req, res) => {
    try {
        // 1. 전체 통계 요약
        const { rows: summaryRows } = await pool.query(`
            SELECT
                COUNT(*)::int AS total_vulns,
                COUNT(DISTINCT project_id)::int AS affected_projects,
                COUNT(DISTINCT vuln_name)::int AS unique_types
            FROM vulnerabilities;
        `);

        // 2. 가장 많이 발생한 취약점 Top 5
        const { rows: topVulns } = await pool.query(`
            SELECT COALESCE(vuln_name, '기타 취약점') AS vuln_name, COUNT(*)::int AS count
            FROM vulnerabilities
            GROUP BY vuln_name
            ORDER BY count DESC
            LIMIT 5;
        `);

        // 3. 프로젝트별 취약점 발생 건수 (LEFT JOIN으로 누락 방지)
        const { rows: projectVulns } = await pool.query(`
            SELECT COALESCE(p.project_name, '미지정 프로젝트') AS project_name, COUNT(v.id)::int AS count
            FROM vulnerabilities v
            LEFT JOIN projects p ON v.project_id = p.id
            GROUP BY p.project_name
            ORDER BY count DESC;
        `);

        // 4. 전체 취약점 상세 목록 (LEFT JOIN)
        const { rows: allVulns } = await pool.query(`
            SELECT
                v.id,
                COALESCE(v.vuln_name, '이름 없는 취약점') AS vuln_name,
                COALESCE(v.vuln_description, '설명 없음') AS vuln_description,
                COALESCE(v.old_code, '') AS old_code,
                COALESCE(v.new_code, '') AS new_code,
                COALESCE(v.created_at, NOW()) AS created_at,
                COALESCE(p.project_name, '미지정 프로젝트') AS project_name,
                COALESCE(f.file_name, '소스코드') AS file_name
            FROM vulnerabilities v
            LEFT JOIN projects p ON v.project_id = p.id
            LEFT JOIN files f ON v.file_id = f.id
            ORDER BY v.id DESC;
        `);

        res.json({
            success: true,
            summary: summaryRows[0] || { total_vulns: 0, affected_projects: 0, unique_types: 0 },
            topVulns: topVulns || [],
            projectVulns: projectVulns || [],
            allVulns: allVulns || []
        });
    } catch (err) {
        console.error('❌ 취약점 통계 조회 실패:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 서버 구동 및 초기화 실행
const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    await initDB();
});
