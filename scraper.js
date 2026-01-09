const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 키워드 설정 (원하는대로 바꿔도 됨)
const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

if (!process.env.GEMINI_API_KEY) {
    console.error("Error: API Key is missing.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function fetchHtml(url) {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        return cheerio.load(data);
    } catch { return null; }
}

async function scrapeNews(keyword) {
    // 코리아헤럴드 검색
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
        const content = $('.view_con').text().substring(0, 3000) || "내용 없음";

        const prompt = `
        기사 제목: ${article.title}
        기사 내용: ${content}

        이 기사를 한국어로 3줄 요약해줘:
        1. 핵심 내용
        2. 시사점
        3. 우리가 할 일
        `;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch { return "분석 실패"; }
}

async function main() {
    console.log("뉴스 수집 시작...");
    const articles = [];

    for (const kw of KEYWORDS) {
        const article = await scrapeNews(kw);
        if (article) {
            console.log(`발견: ${article.title}`);
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
            body { font-family: sans-serif; padding: 20px; background: #f0f2f5; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { color: #333; font-size: 1.2rem; }
            .tag { background: #e3f2fd; color: #1565c0; padding: 5px 10px; border-radius: 15px; font-size: 0.8rem; font-weight: bold; }
            .content { white-space: pre-wrap; line-height: 1.6; color: #555; margin-top: 15px; }
            a { text-decoration: none; color: inherit; }
        </style>
    </head>
    <body>
        <h1>🏥 오늘의 헬스케어 뉴스</h1>
        <p style="color:gray">${new Date().toLocaleString('ko-KR')}</p>
        ${articles.map(a => `
            <div class="card">
                <span class="tag">#${a.keyword}</span>
                <h2><a href="${a.link}">${a.title}</a></h2>
                <div class="content">${a.analysis}</div>
            </div>
        `).join('')}
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("완료! public/index.html 생성됨.");
}

main();