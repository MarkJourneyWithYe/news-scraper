const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// [최후의 수단]
// 최신 모델(1.5)이 404가 뜨므로, 가장 안정적인 구형 표준 모델(gemini-pro)의 정식 버전(v1)을 사용합니다.
// 이 URL은 전 세계 모든 API Key에서 작동해야 정상입니다.
async function callGemini(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // ▼ 핵심 수정: v1beta (베타) -> v1 (정식), 모델명 gemini-pro 고정
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
        
        // 응답 경로가 v1/v1beta 동일함
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        // 만약 여기서도 에러가 나면 API 키 자체가 'Generative AI' 기능을 켜지 않은 것입니다.
        const errMsg = error.response 
            ? `API 에러: ${error.response.status} ${JSON.stringify(error.response.data)}` 
            : `통신 에러: ${error.message}`;
        
        console.error(`🚨 ${errMsg}`);
        
        // 빈 내용이라도 리턴해서 HTML은 깨지지 않게 방어
        return "AI 요약 서비스를 일시적으로 사용할 수 없습니다.";
    }
}

async function main() {
    console.log("🚀 RSS 데이터 수집 및 분석 시작 (Stable v1 Mode)...");
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