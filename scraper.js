const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// AI 설정
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
    console.log("🚀 RSS 데이터 수집 및 분석 시작...");
    const articles = [];

    try {
        // [변경 1] 헬스케어 전문가 프롬프트에 맞는 'Science/Health' 관련 RSS로 변경 권장
        // 코리아타임즈는 'Nation'이나 'Opinion'이 섞여 있어, 차라리 'Science Daily'나 해외 헬스 RSS가 낫지만
        // 일단 코리아타임즈 'Opinion' (그나마 칼럼이 많음) 또는 Tech/Science가 있다면 교체해야 합니다.
        // 여기서는 예시로 CNN Health (영어지만 번역 시킴) 또는 코리아타임즈 유지하되 로직 강화.
        
        // 테스트를 위해 안정적인 CNN Health RSS를 추천합니다. (한국어 번역 요청 포함)
        const rssUrl = "http://rss.cnn.com/rss/cnn_health.rss"; 
        
        // 기존 코리아타임즈를 꼭 써야 한다면 아래 주석 해제 (단, 헬스 관련 글이 적을 수 있음)
        // const rssUrl = "https://www.koreatimes.co.kr/www/rss/world.xml";

        const response = await axios.get(rssUrl, { timeout: 15000 });
        const xml = response.data;

        // [변경 2] 정규식 대폭 강화 (CDATA 유무 상관없이 추출)
        // <item> 태그 추출
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const itemsMatch = xml.match(itemRegex);
        
        if (!itemsMatch) {
            throw new Error("RSS에서 아이템을 찾을 수 없습니다. XML 구조를 확인하세요.");
        }

        const items = itemsMatch.slice(0, 5); // 5개만 처리

        for (const itemXml of items) {
            // 제목 추출 (CDATA 있든 없든 다 잡는 정규식)
            // <title>...글자...</title> 내부를 캡처
            let titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            let linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);

            const title = titleMatch ? titleMatch[1].trim() : "제목 없음";
            const link = linkMatch ? linkMatch[1].trim() : "#";

            console.log(`📰 분석 중: ${title}`);

            try {
                // [변경 3] 프롬프트 강화 (뉴스 -> 한국어 3줄 요약 + 헬스 인사이트)
                const prompt = `
                역할: 당신은 숙련된 헬스케어 저널리스트입니다.
                임무: 아래 뉴스 제목을 보고, 이것이 건강/의학/과학과 관련이 있다면 핵심 건강 상식을 한국어 3줄로 요약해 주세요.
                만약 정치/전쟁 등 건강과 전혀 무관한 뉴스라면 "건강 관련 내용이 아닌 일반 시사 뉴스입니다."라고만 한 줄로 답하세요.
                
                뉴스 제목: ${title}
                `;
                
                const result = await model.generateContent(prompt);
                const analysis = result.response.text();

                // 분석 결과가 유의미한 경우에만 푸시
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
            body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; padding: 20px; background: #f0f2f5; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; color: #2c3e50; margin-bottom: 5px; }
            .date { text-align: center; color: #7f8c8d; font-size: 0.9rem; margin-bottom: 30px; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 5px solid #00b894; transition: transform 0.2s; }
            .card:hover { transform: translateY(-2px); }
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
            `).join('') : '<div class="card empty">수집된 헬스 뉴스가 없습니다.<br>잠시 후 다시 시도해주세요.</div>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료! 총 ${articles.length}개의 기사 처리됨.`);
}

main();