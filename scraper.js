const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// [1] 구글 API 과부하 방지를 위한 10초 대기 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [2] 현재 사용 가능한 AI 모델 자동 탐색 (404 에러 방지)
async function getAvailableModel(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios.get(listUrl);
        const models = response.data.models;

        // 'generateContent' 기능을 지원하는 모델 중 'flash'가 들어간 최신 모델 우선 선택
        const activeModel = models.find(m => 
            m.supportedGenerationMethods.includes('generateContent') && 
            m.name.includes('flash')
        ) || models.find(m => m.supportedGenerationMethods.includes('generateContent'));

        if (!activeModel) return 'models/gemini-1.5-flash'; // 없으면 기본값
        
        console.log(`🤖 AI 모델 설정 완료: ${activeModel.name}`);
        return activeModel.name;
    } catch (e) {
        console.error("🚨 모델 목록 조회 실패, 기본값 사용");
        return 'models/gemini-1.5-flash';
    }
}

// [3] AI에게 요약 요청 (429 에러 처리 포함)
async function callGemini(text, modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ 
            parts: [{ 
                text: `
                역할: 전문 의학 기자.
                임무: 아래 최신 의학 뉴스 제목을 보고, 한국어로 '핵심 건강 정보'를 3줄로 알기 쉽게 요약해 주세요.
                뉴스 제목: "${text}"
                ` 
            }] 
        }]
    };

    try {
        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        if (error.response && error.response.status === 429) {
             console.error("🚨 구글 API 속도 제한 (429) - 잠시 건너뜁니다.");
             return "속도 제한으로 분석 보류 (다음 업데이트 때 반영됩니다)";
        }
        return "AI 분석 실패 (일시적 오류)";
    }
}

async function main() {
    console.log("🚀 최신 헬스 뉴스 수집 시작 (ScienceDaily Source)...");
    const articles = [];
    const apiKey = process.env.GEMINI_API_KEY;

    try {
        // 1. 모델명 확인
        const modelName = await getAvailableModel(apiKey);
        
        // 2. RSS 데이터 가져오기 (ScienceDaily Health - 실시간 최신)
        // User-Agent 헤더를 넣어야 봇 차단을 피할 수 있음
        const rssUrl = "https://www.sciencedaily.com/rss/health_medicine.xml"; 
        const response = await axios.get(rssUrl, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        
        const xml = response.data;
        
        // 3. XML 파싱 (최신 기사 5개)
        const itemRegex = /<item>[\s\S]*?<\/item>/g;
        const items = (xml.match(itemRegex) || []).slice(0, 5);

        if (items.length === 0) console.log("⚠️ RSS 구조가 변경되었거나 기사가 없습니다.");

        for (const itemXml of items) {
            // 제목과 링크 정규식 추출
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 중: ${title}`);

            // 4. AI 요약 실행
            const analysis = await callGemini(title, modelName);
            articles.push({ title, link, analysis });

            // [중요] 429 에러 방지를 위한 10초 휴식
            console.log("⏳ 10초 대기 중... (구글 API 보호)");
            await delay(10000); 
        }
    } catch (e) {
        console.error("🔥 전체 에러 발생:", e.message);
    }

    // HTML 생성 (모바일 친화적 디자인)
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오늘의 AI 헬스 뉴스</title>
        <style>
            body { font-family: 'Apple SD Gothic Neo', sans-serif; padding: 15px; background: #f0f2f5; margin: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; padding: 10px; }
            h1 { color: #2c3e50; font-size: 1.5rem; margin: 0; }
            .date { color: #7f8c8d; font-size: 0.9rem; margin-top: 5px; }
            .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 5px solid #3498db; }
            h2 { font-size: 1.1rem; margin: 0 0 10px 0; line-height: 1.4; }
            h2 a { color: #2c3e50; text-decoration: none; }
            .analysis { background: #f8f9fa; padding: 12px; border-radius: 8px; color: #444; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏥 오늘의 최신 의학 뉴스</h1>
                <p class="date">업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            </div>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card" style="text-align:center">뉴스 수집 중이거나 일시적 오류입니다.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 수집 완료! 총 ${articles.length}개의 최신 기사가 처리되었습니다.`);
}

main();