const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// [최종 해결책]
// 1.5-flash 모델이 404 에러가 나므로, 
// 가장 호환성이 높은 'gemini-pro' (v1 정식 버전)를 강제로 사용합니다.
async function callGemini(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // 🚨 중요: 주소가 'v1beta'가 아니라 'v1'입니다. 모델명은 'gemini-pro'입니다.
    // 이 조합은 전 세계 모든 API 키에서 작동하는 가장 기초적인 조합입니다.
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{
                text: `
                역할: 헬스케어 전문 기자.
                임무: 다음 영어 뉴스 제목을 보고 한국어로 '핵심 건강 정보'를 3줄 요약해 주세요.
                뉴스 제목: ${text}
                `
            }]
        }]
    };

    try {
        const response = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            return "AI 분석 결과 없음 (내용이 차단되었거나 비어있음)";
        }

    } catch (error) {
        // 에러 로그를 상세히 출력
        const errMsg = error.response 
            ? `API 응답 에러: ${error.response.status} ${JSON.stringify(error.response.data)}` 
            : `통신 요청 에러: ${error.message}`;
        
        console.error(`🚨 ${errMsg}`);
        
        // 404가 또 뜨면, API 키 자체가 문제이거나 프로젝트 설정 문제입니다.
        // 하지만 HTML은 깨지지 않게 텍스트를 반환합니다.
        return "AI 분석 서비스 일시적 장애 (로그 확인 필요)";
    }
}

async function main() {
    console.log("🚀 RSS 데이터 수집 및 분석 시작 (v1/gemini-pro Mode)...");
    const articles = [];

    try {
        // CNN Health RSS
        const rssUrl = "http://rss.cnn.com/rss/cnn_health.rss"; 
        
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const itemsMatch = xml.match(itemRegex);
        const items = itemsMatch ? itemsMatch.slice(0, 5) : [];

        if (items.length === 0) console.log("⚠️ 기사를 찾을 수 없습니다.");

        for (const itemXml of items) {
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 중: ${title}`);

            const analysis = await callGemini(title);
            articles.push({ title, link, analysis });
        }
    } catch (e) {
        console.error("🔥 전체 프로세스 에러:", e.message);
    }

    // HTML 생성
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오늘의 AI 헬스 뉴스</title>
        <style>
            body { font-family: 'Apple SD Gothic Neo', sans-serif; padding: 20px; background: #f0f2f5; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; color: #2c3e50; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border-left: 5px solid #2980b9; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 a { color: #2c3e50; text-decoration: none; font-size: 1.1rem; }
            .analysis { background: #ecf0f1; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; line-height: 1.6; font-size: 0.95rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p style="text-align:center; color:gray">업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card">수집된 뉴스가 없습니다.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사 처리됨.`);
}

main();