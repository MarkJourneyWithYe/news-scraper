const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

// 2026년 현재 가장 확실한 모델 명칭을 사용합니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
    console.log("🚀 최종 시스템 가동...");
    const articles = [];

    try {
        // 코리아타임스 RSS 피드 사용 (접속이 가장 원활함)
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
                console.log(`📰 분석 중: ${title}`);

                try {
                    const prompt = `뉴스 제목을 보고 한국어 3줄 건강 요약을 작성하세요: ${title}`;
                    
                    // AI 호출 방식 최적화
                    const result = await model.generateContent(prompt);
                    const aiResponse = result.response;
                    const text = aiResponse.text();

                    if (text && text.length > 0) {
                        articles.push({ title, link, analysis: text });
                        console.log("✅ 분석 성공");
                    }
                } catch (err) {
                    console.error(`❌ AI 에러: ${err.message}`);
                }
            }
        }
    } catch (e) {
        console.error("❌ 데이터 수집 실패:", e.message);
    }

    // 결과 HTML 생성
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: -apple-system, sans-serif; padding: 20px; background: #f0f2f5; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-left: 6px solid #2ecc71; }
            h2 { font-size: 1.1rem; margin: 0 0 10px 0; }
            h2 a { color: #1a73e8; text-decoration: none; }
            .analysis { background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 0.95rem; white-space: pre-wrap; color: #3c4043; }
            h1 { text-align: center; color: #202124; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p style="text-align:center; color:gray; font-size:0.8rem;">최종 업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card">기사를 분석하지 못했습니다. 잠시 후 다시 시도해주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 배포 완료! 성공 개수: ${articles.length}`);
}

main().catch(console.error);