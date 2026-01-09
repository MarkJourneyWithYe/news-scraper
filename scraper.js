const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 모델 명칭을 가장 기본값인 'gemini-pro'로 변경했습니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

async function main() {
    console.log("🚀 수집 시작 (모델: gemini-pro)...");
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

                console.log(`📰 AI 분석 시도: ${title}`);

                try {
                    // 프롬프트를 더 단순하게 만들었습니다.
                    const prompt = `뉴스 제목을 보고 한국어 3줄 건강 정보를 작성하세요: ${title}`;
                    
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
            body { font-family: sans-serif; padding: 20px; background: #f4f7f6; }
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
            `).join('') : '<div class="card">기사 분석에 실패했습니다. GitHub Actions의 로그를 다시 확인해 주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 작업 종료. 성공 개수: ${articles.length}`);
}

main();