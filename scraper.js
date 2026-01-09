const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// [생존 전략] 모델 이름을 내가 정하지 않고, 구글한테 물어보고 씁니다.
async function getAvailableModel(apiKey) {
    try {
        // 1. 현재 사용 가능한 모델 리스트를 조회합니다.
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios.get(listUrl);
        const models = response.data.models;

        // 2. 'generateContent' 기능이 있는 모델 중 하나를 찾습니다.
        // (flash가 있으면 우선 쓰고, 아니면 아무거나 첫 번째 놈을 잡습니다)
        const activeModel = models.find(m => 
            m.supportedGenerationMethods.includes('generateContent') && 
            m.name.includes('flash')
        ) || models.find(m => m.supportedGenerationMethods.includes('generateContent'));

        if (!activeModel) throw new Error("사용 가능한 텍스트 생성 모델이 하나도 없습니다.");

        console.log(`🤖 자동 감지된 모델: ${activeModel.name}`);
        return activeModel.name; // 예: 'models/gemini-1.5-flash-001'
    } catch (e) {
        console.error("🚨 모델 목록 조회 실패:", e.message);
        // 목록 조회마저 실패하면 최후의 수단으로 gemini-1.5-flash를 씁니다.
        return 'models/gemini-1.5-flash';
    }
}

async function callGemini(text, modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // 위에서 찾아낸 "진짜 존재하는 모델 이름"으로 URL을 만듭니다.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

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
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        const errMsg = error.response 
            ? `API 에러 (${error.response.status}): ${JSON.stringify(error.response.data)}` 
            : `통신 에러: ${error.message}`;
        console.error(`🚨 ${errMsg}`);
        return "AI 분석 실패 (API 호출 오류)";
    }
}

async function main() {
    console.log("🚀 RSS 데이터 수집 및 스마트 모델 탐색 시작...");
    const articles = [];
    const apiKey = process.env.GEMINI_API_KEY;

    try {
        // [1단계] 살아있는 모델 이름 가져오기
        const modelName = await getAvailableModel(apiKey);

        // [2단계] RSS 수집
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

            // 찾아낸 모델로 요청
            const analysis = await callGemini(title, modelName);
            articles.push({ title, link, analysis });
        }
    } catch (e) {
        console.error("🔥 프로세스 에러:", e.message);
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
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border-left: 5px solid #8e44ad; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 a { color: #2c3e50; text-decoration: none; font-size: 1.1rem; }
            .analysis { background: #f3e5f5; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; line-height: 1.6; font-size: 0.95rem; }
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