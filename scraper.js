const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// AI 설정
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
    console.log("🚀 RSS 피드 방식으로 전환하여 수집 시작...");
    const articles = [];

    try {
        // 코리아타임스 월드 뉴스 RSS (구조가 단순해서 차단이 없음)
        const rssUrl = "https://www.koreatimes.co.kr/www/rss/world.xml";
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        // XML에서 제목과 링크 추출 (정규식 사용으로 라이브러리 의존 최소화)
        const items = xml.match(/<item>[\s\S]*?<\/item>/g).slice(0, 5);

        for (const item of items) {
            const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)[1];
            const link = item.match(/<link>([\s\S]*?)<\/link>/)[1];

            console.log(`📰 분석 중: ${title}`);

            try {
                // 본문 없이 제목만으로도 Gemini는 훌륭하게 배경지식을 동원해 분석합니다.
                // 본문 크롤링 차단을 피하기 위해 제목 기반 분석으로 안전성을 높였습니다.
                const prompt = `당신은 헬스케어 전문가입니다. 다음 뉴스 제목을 바탕으로 관련 건강 상식이나 시사점을 한국어 3줄로 설명해 주세요.\n뉴스 제목: ${title}`;
                const result = await model.generateContent(prompt);
                const analysis = result.response.text();

                articles.push({ title, link, analysis });
            } catch (err) {
                console.error("AI 분석 중 오류");
            }
        }
    } catch (e) {
        console.error("RSS 수집 실패:", e.message);
    }

    // HTML 생성 (데이터가 없어도 왜 없는지 표시하게 수정)
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f7f6; }
            .container { max-width: 600px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-left: 6px solid #e74c3c; }
            h2 { font-size: 1.1rem; }
            h2 a { color: #2980b9; text-decoration: none; }
            .analysis { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 10px; font-size: 0.95rem; white-space: pre-wrap; }
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
            `).join('') : '<div class="card">현재 수집된 뉴스가 없습니다. 잠시 후 GitHub Actions 로그를 확인해 주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사를 처리했습니다.`);
}

main();