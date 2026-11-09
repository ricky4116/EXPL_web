// clean_cache.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'database-1.cqlou2oomonh.us-east-1.rds.amazonaws.com',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'graduate2025',
    database: process.env.DB_DATABASE || 'postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

async function cleanDB() {
    try {
        console.log('🔄 DB 연결 및 오염된 데이터 삭제 시작...');

        // 1. 오염된 캐시 전체 비우기
        const cacheRes = await pool.query('DELETE FROM analysis_cache;');
        console.log(`✅ analysis_cache 테이블 삭제 완료 (삭제된 행: ${cacheRes.rowCount}건)`);

        // 2. '취약점 분석 지연'으로 잘못 들어간 취약점 데이터 삭제
        const vulnRes = await pool.query("DELETE FROM vulnerabilities WHERE vuln_name LIKE '%취약점 분석 지연%';");
        console.log(`✅ vulnerabilities 잘못된 에러 데이터 삭제 완료 (삭제된 행: ${vulnRes.rowCount}건)`);

        console.log('🎉 모든 오염된 데이터가 정상적으로 초기화되었습니다!');
    } catch (err) {
        console.error('❌ 삭제 중 오류 발생:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

cleanDB();
