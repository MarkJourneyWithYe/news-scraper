const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 라이브러리가 업데이트되었으므로 최신 모델 사용 가능
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
    console.log("🚀 RSS 데이터 수집 및 분석 시작...");
    const articles = [];

    try {
        // CNN Health RSS
        const rssUrl = "http://rss.cnn.com/rss/cnn_health.rss"; 
        
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const itemsMatch = xml.match(itemRegex);
        
        // 아이템이 있으면 5개, 없으면 빈 배열
        const items = itemsMatch ? itemsMatch.slice(0, 5) : [];

        if (items.length === 0) {
             console.log("⚠️ 수집된 기사가 없습니다.");
        }

        for (const itemXml of items) {
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 중: ${title}`);

            try {
                const prompt = `
                역할: 헬스케어 전문 기자.
                임무: 다음 영어 뉴스 제목을 보고 한국어로 '핵심 건강 정보'를 3줄 요약.
                뉴스 제목: ${title}
                `;
                
                const result = await model.generateContent(prompt);
                const analysis = result.response.text();

                articles.push({ title, link, analysis });
            } catch (err) {
                console.error(`❌ AI 분석 실패 (${title}):`, err.message);
            }
        }
    } catch (e) {
        console.error("🔥 RSS 수집 단계 실패:", e.message);
    }

    // HTML 생성
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오늘의 AI 헬스 브리핑</title>
        <style>
            body { font-family: 'Apple SD Gothic Neo', sans-serif; padding: 20px; background: #f0f2f5; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; color: #2c3e50; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; border-left: 5px solid #00b894; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 a { color: #2d3436; text-decoration: none; }
            .analysis { background: #f1f8e9; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; line-height: 1.6; }
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
            `).join('') : '<div class="card">수집된 뉴스가 없습니다.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사 처리됨.`);
}

main();