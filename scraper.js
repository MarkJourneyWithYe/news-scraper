const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// [속도 조절 함수] 급하게 가면 체합니다. 10초 쉬는 함수 추가.
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getAvailableModel(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios.get(listUrl);
        const models = response.data.models;

        const activeModel = models.find(m => 
            m.supportedGenerationMethods.includes('generateContent') && 
            m.name.includes('flash')
        ) || models.find(m => m.supportedGenerationMethods.includes('generateContent'));

        if (!activeModel) throw new Error("사용 가능한 모델 없음");

        console.log(`🤖 자동 감지된 모델: ${activeModel.name}`);
        return activeModel.name;
    } catch (e) {
        console.error("🚨 모델 감지 실패, 기본값 사용");
        return 'models/gemini-1.5-flash';
    }
}

async function callGemini(text, modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
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
        // 429 에러(속도 제한)가 뜨면 로그에 명시
        if (error.response && error.response.status === 429) {
            console.error(`🚨 속도 제한 걸림 (429): 잠시 후 다시 시도해야 합니다.`);
            return "AI 요청 과부하로 분석 실패 (잠시 후 다시 시도됨)";
        }
        console.error(`🚨 에러: ${error.message}`);
        return "AI 분석 실패";
    }
}

async function main() {
    console.log("🚀 RSS 데이터 수집 및 스마트 모델 탐색 시작...");
    const articles = [];
    const apiKey = process.env.GEMINI_API_KEY;

    try {
        const modelName = await getAvailableModel(apiKey);

        const rssUrl = "http://rss.cnn.com/rss/cnn_health.rss"; 
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const items = response.data.match(/<item>[\s\S]*?<\/item>/g).slice(0, 5);

        for (const itemXml of items) {
            let title = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)[1].trim();
            let link = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)[1].trim();

            console.log(`📰 분석 중: ${title}`);

            const analysis = await callGemini(title, modelName);
            articles.push({ title, link, analysis });

            // [핵심 수정] 여기서 10초 쉽니다. 그래야 429 에러 안 뜹니다.
            console.log("⏳ 구글 API 쿨타임 (10초 대기 중)...");
            await delay(10000); 
        }
    } catch (e) {
        console.error("🔥 프로세스 에러:", e.message);
    }

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f0f2f5; }
            .container { max-width: 600px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border-left: 5px solid #00b894; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 a { color: #2d3436; text-decoration: none; }
            .analysis { background: #f1f8e9; padding: 15px; border-radius: 8px; margin-top: 15px; line-height: 1.6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p style="text-align:center; color:gray">${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card">수집 실패</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사 처리됨.`);
}

main();