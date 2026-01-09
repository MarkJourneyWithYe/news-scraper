const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
    console.log("🚀 수집 시작 및 AI 분석 대기 중...");
    const articles = [];

    try {
        const rssUrl = "https://www.koreatimes.co.kr/www/rss/world.xml";
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        const items = xml.match(/<item>[\s\S]*?<\/item>/g).slice(0, 5);

        for (const item of items) {
            const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);

            if (titleMatch && linkMatch) {
                const title = titleMatch[1];
                const link = linkMatch[1];

                console.log(`📰 AI 분석 중: ${title}`);

                try {
                    const prompt = `당신은 헬스케어 전문가입니다. 다음 뉴스 제목을 보고 관련 건강 상식이나 시사점을 한국어 3줄로 설명하세요. (제목: ${title})`;
                    
                    // ✅ 수정 포인트: AI가 대답을 마칠 때까지 확실히 기다립니다.
                    const result = await model.generateContent(prompt);
                    const aiResponse = await result.response;
                    const analysis = aiResponse.text();

                    if (analysis) {
                        articles.push({ title, link, analysis });
                        console.log("✅ 분석 성공");
                    }
                } catch (err) {
                    console.error("❌ AI 분석 실패:", err.message);
                }
            }
        }
    } catch (e) {
        console.error("❌ 수집 실패:", e.message);
    }

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f7f6; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-left: 6px solid #2ecc71; }
            h2 { font-size: 1.1rem; margin-bottom: 10px; }
            h2 a { color: #2980b9; text-decoration: none; }
            .analysis { background: #f9f9f9; padding: 15px; border-radius: 8px; font-size: 0.95rem; white-space: pre-wrap; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p style="text-align:center; color:gray">최종 업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card">기사를 분석하지 못했습니다. API 키와 로그를 다시 확인해 주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 최종 완료! 처리된 기사: ${articles.length}개`);
}

main();