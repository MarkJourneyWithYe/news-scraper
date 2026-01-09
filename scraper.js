const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 딜레이 함수 (사이트 차단 방지용: 2초 쉬기)
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function fetchHtml(url) {
    try {
        const { data } = await axios.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 10000 
        });
        return cheerio.load(data);
    } catch (e) { 
        console.error(`접속 에러: ${url}`, e.message);
        return null; 
    }
}

async function scrapeNews(keyword) {
    const $ = await fetchHtml(`https://www.koreaherald.com/search/index.php?q=${encodeURIComponent(keyword)}`);
    if (!$) return null;
    
    const item = $('.news_list li').first();
    if (!item.length) return null;

    const title = item.find('.news_title a').text().trim();
    const link = 'https://www.koreaherald.com' + item.find('.news_title a').attr('href');
    const date = item.find('.news_date').text().trim();

    return { keyword, title, link, date };
}

async function analyze(article) {
    try {
        const $ = await fetchHtml(article.link);
        if (!$) return "기사 본문을 가져오지 못했습니다.";

        // 코리아헤럴드 본문 태그 정밀 조준
        const content = $('#articleText').text().trim().substring(0, 2000) || "본문 추출 실패";
        
        const prompt = `당신은 헬스케어 전문 요약가입니다. 다음 영어 기사를 읽고 한국어로 핵심을 짚어주세요.
        제목: ${article.title}
        내용: ${content}
        
        형식:
        1. 💡 핵심: (한 문장 요약)
        2. 🏥 시사점: (우리 사회에 주는 의미)
        3. ✅ 제언: (우리가 주목할 점)`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { 
        return "AI 분석 중 오류 발생: " + e.message; 
    }
}

async function main() {
    console.log("🚀 뉴스 수집 및 AI 분석 시작...");
    const articles = [];
    
    for (const kw of KEYWORDS) {
        console.log(`🔍 키워드 처리 중: ${kw}`);
        const article = await scrapeNews(kw);
        if (article) {
            await sleep(2000); // 사이트 배려를 위해 2초씩 쉽니다
            article.analysis = await analyze(article);
            articles.push(article);
        }
    }

    const html = `
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; background: #f4f7f6; line-height: 1.6; }
            .card { background: white; padding: 25px; margin-bottom: 25px; border-radius: 15px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); border-left: 5px solid #2ecc71; }
            h2 { color: #2c3e50; font-size: 1.3rem; margin-top: 10px; }
            .tag { background: #e8f8f5; color: #1abc9c; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
            .content { white-space: pre-wrap; color: #34495e; margin-top: 15px; background: #f9f9f9; padding: 15px; border-radius: 10px; }
            a { text-decoration: none; color: inherit; }
            h1 { text-align: center; color: #2c3e50; }
        </style>
    </head>
    <body>
        <h1>🏥 AI 데일리 헬스 뉴스</h1>
        <p style="text-align:center; color:gray">업데이트: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}</p>
        ${articles.map(a => `
            <div class="card">
                <span class="tag">#${a.keyword}</span>
                <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                <div class="content">${a.analysis}</div>
            </div>
        `).join('')}
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 모든 분석 완료!");
}

main();