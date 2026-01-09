const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// [무조건 성공시키는 함수] 
// 10초 쉬는 걸로는 부족해서 30초로 늘리고, 실패하면 될 때까지 다시 합니다.
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    // [수정] 2.5 버전은 제한이 심합니다. 1.5-flash로 강제 고정합니다.
    const modelName = 'models/gemini-1.5-flash';
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

    let attempts = 0;
    const maxAttempts = 5; // 최대 5번까지 재시도

    while (attempts < maxAttempts) {
        try {
            const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
            return response.data.candidates[0].content.parts[0].text;
        } catch (error) {
            if (error.response && error.response.status === 429) {
                attempts++;
                console.error(`🚨 구글 API 속도 제한 (429) 발생!`);
                console.log(`⏳ [재시도 ${attempts}/${maxAttempts}] 30초 푹 쉬고 다시 뚫어봅니다...`);
                
                // 30초 대기 후 루프 처음으로 돌아가서 다시 요청
                await delay(30000); 
                continue;
            }
            
            // 429 말고 다른 에러면 그냥 포기
            console.error(`🚨 알 수 없는 에러: ${error.message}`);
            return "AI 분석 실패 (오류)";
        }
    }
    return "속도 제한으로 5번 재시도했으나 실패함.";
}

async function main() {
    console.log("🚀 최신 헬스 뉴스 수집 시작 (ScienceDaily + Retry Mode)...");
    const articles = [];

    try {
        // ScienceDaily Health RSS (최신)
        const rssUrl = "https://www.sciencedaily.com/rss/health_medicine.xml"; 
        const response = await axios.get(rssUrl, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        // 기사 5개 추출
        const items = (response.data.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 5);

        if (items.length === 0) console.log("⚠️ 기사를 못 찾았습니다.");

        for (const itemXml of items) {
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 시도: ${title}`);

            // AI 요약 (재시도 로직 포함된 함수 호출)
            const analysis = await callGemini(title);
            articles.push({ title, link, analysis });

            // 성공했어도 다음 타자를 위해 5초 예의상 대기
            await delay(5000); 
        }
    } catch (e) {
        console.error("🔥 전체 에러:", e.message);
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
            `).join('') : '<div class="card" style="text-align:center">AI 분석 중입니다...</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 최종 완료! ${articles.length}개 처리.`);
}

main();