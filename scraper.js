const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// AI 설정
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// [수정 포인트] 모델 이름을 'gemini-1.5-flash'에서 'gemini-pro'로 변경
// gemini-pro는 가장 안정적이고 널리 쓰이는 모델이라 404 에러가 안 날 겁니다.
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

async function main() {
    console.log("🚀 RSS 데이터 수집 및 분석 시작...");
    const articles = [];

    try {
        // CNN Health RSS (헬스 관련이라 AI가 할 말이 많음)
        const rssUrl = "http://rss.cnn.com/rss/cnn_health.rss"; 
        
        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        // <item> 태그 추출 (정규식 강화 버전)
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const itemsMatch = xml.match(itemRegex);
        
        if (!itemsMatch) {
            console.log("⚠️ RSS 데이터 구조가 예상과 다릅니다. 원본 확인 필요.");
            // itemsMatch가 null일 경우 빈 배열 처리하여 멈추지 않게 함
        }
        
        // 아이템이 있으면 5개, 없으면 빈 배열
        const items = itemsMatch ? itemsMatch.slice(0, 5) : [];

        for (const itemXml of items) {
            // 제목과 링크 추출
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 중: ${title}`);

            try {
                // 프롬프트: 영어 뉴스를 한국어로 번역 및 요약
                const prompt = `
                역할: 당신은 헬스케어 전문 기자입니다.
                임무: 아래 영어 뉴스 제목을 보고, 내용을 유추하여 한국어로 '핵심 건강 정보'를 3줄 요약해 주세요.
                반드시 한국어로 답변해야 합니다.
                
                뉴스 제목: ${title}
                `;
                
                const result = await model.generateContent(prompt);
                const analysis = result.response.text();

                articles.push({ title, link, analysis });
            } catch (err) {
                // 여기서 에러가 나도 다음 기사로 넘어가도록 처리
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
            body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; padding: 20px; background: #f0f2f5; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; color: #2c3e50; margin-bottom: 5px; }
            .date { text-align: center; color: #7f8c8d; font-size: 0.9rem; margin-bottom: 30px; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 5px solid #00b894; }
            h2 { font-size: 1.15rem; margin-top: 0; }
            h2 a { color: #2d3436; text-decoration: none; }
            h2 a:hover { color: #00b894; }
            .analysis { background: #f1f8e9; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 0.95rem; line-height: 1.6; color: #444; white-space: pre-wrap; }
            .empty { text-align: center; padding: 40px; color: #95a5a6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p class="date">업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<div class="card empty">수집된 뉴스가 없거나 AI 분석 중 오류가 발생했습니다.<br>로그를 확인해 주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사 처리됨.`);
}

main();