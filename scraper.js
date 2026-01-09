const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        return cheerio.load(response.data);
    } catch (e) { 
        console.error(`❌ 접속 불가: ${url}`);
        return null; 
    }
}

async function main() {
    console.log("🚀 코리아타임스 최신 건강 뉴스 수집 시작...");
    const articles = [];
    
    // 코리아타임스 월드/국가 뉴스 섹션 혹은 라이프 섹션 활용
    const targetUrl = `https://www.koreatimes.co.kr/www2/index.asp`;
    const $ = await fetchHtml(targetUrl);
    
    if ($) {
        // 메인 페이지에서 뉴스 링크들을 수집 (구조가 단순한 헤드라인 위주)
        const newsItems = $('.main_article_headline a, .latest_news_list li a').slice(0, 5);
        
        for (let i = 0; i < newsItems.length; i++) {
            const el = newsItems[i];
            const title = $(el).text().trim();
            const relativeLink = $(el).attr('href');
            
            if (title && relativeLink && !relativeLink.includes('javascript')) {
                const link = relativeLink.startsWith('http') ? relativeLink : 'https://www.koreatimes.co.kr' + relativeLink;
                
                console.log(`📰 기사 읽는 중: ${title}`);
                
                // 본문 가져오기
                const $post = await fetchHtml(link);
                if ($post) {
                    const content = $post('#start-abd, .view_article').text().trim().substring(0, 2000);
                    
                    if (content.length > 100) {
                        try {
                            const prompt = `당신은 뉴스 큐레이터입니다. 다음 영어 뉴스를 한국어 3줄로 요약하세요:\n제목: ${title}\n내용: ${content}`;
                            const result = await model.generateContent(prompt);
                            const analysis = result.response.text();
                            
                            articles.push({ title, link, analysis });
                            console.log(`✅ 분석 완료: ${title}`);
                        } catch (aiErr) {
                            console.error("AI 분석 에러");
                        }
                    }
                }
                await new Promise(res => setTimeout(res, 2000));
            }
        }
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI News</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f0f2f5; color: #1c1e21; }
            .container { max-width: 600px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h2 { font-size: 1.1rem; margin-bottom: 10px; line-height: 1.4; }
            h2 a { color: #1877f2; text-decoration: none; }
            .analysis { background: #f5f6f7; padding: 15px; border-radius: 8px; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; }
            h1 { text-align: center; font-size: 1.5rem; margin-bottom: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 오늘의 AI 헬스 뉴스</h1>
            <p style="text-align:center; font-size:0.8rem; color:gray; margin-bottom:20px;">업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.length > 0 ? articles.map(a => `
                <div class="card">
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="analysis">${a.analysis}</div>
                </div>
            `).join('') : '<p style="text-align:center">새로운 뉴스를 찾고 있습니다. 잠시 후 다시 확인해 주세요.</p>'}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 배포 준비 완료!");
}

main();