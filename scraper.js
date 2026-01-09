const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        return cheerio.load(response.data);
    } catch (e) { return null; }
}

async function analyze(article) {
    try {
        const $ = await fetchHtml(article.link);
        if (!$) return "기사 본문을 가져오지 못했습니다.";
        
        // 본문 태그 정밀 조준
        const content = $('#articleText, .view_con, .article-body').text().trim().substring(0, 2000);
        if (content.length < 50) return "본문 내용이 너무 짧아 분석할 수 없습니다.";

        const prompt = `다음 기사를 한국어로 요약해줘.\n제목: ${article.title}\n내용: ${content}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { return "분석 실패: " + e.message; }
}

async function main() {
    console.log("🚀 진짜 마지막 수정 버전 시작!");
    const articles = [];
    
    for (const kw of KEYWORDS) {
        console.log(`🔍 키워드 검색: ${kw}`);
        const $ = await fetchHtml(`https://www.koreaherald.com/search/index.php?q=${encodeURIComponent(kw)}`);
        
        if ($) {
            const item = $('.news_list li').first();
            // 🛑 수정 포인트: href가 있는지 먼저 확인하고 주소를 합칩니다.
            const relativeLink = item.find('.news_title a').attr('href');
            
            if (relativeLink) {
                const title = item.find('.news_title a').text().trim();
                const link = relativeLink.startsWith('http') ? relativeLink : 'https://www.koreaherald.com' + relativeLink;
                const date = item.find('.news_date').text().trim();
                
                console.log(`📰 기사 발견: ${title}`);
                const analysis = await analyze({ title, link });
                articles.push({ keyword: kw, title, link, date, analysis });
            }
        }
        await new Promise(res => setTimeout(res, 2000));
    }

    const html = `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;padding:20px;background:#f4f7f6;}.card{background:white;padding:20px;margin-bottom:20px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-left:5px solid #3498db;}.tag{background:#ebf5ff;color:#3498db;padding:4px 10px;border-radius:15px;font-size:0.8rem;font-weight:bold;}.content{white-space:pre-wrap;margin-top:15px;color:#444;}a{text-decoration:none;color:#2c3e50;}</style></head><body><h1>🏥 오늘의 AI 헬스 뉴스</h1>${articles.map(a=>`<div class="card"><span class="tag">#${a.keyword}</span><h2><a href="${a.link}" target="_blank">${a.title}</a></h2><div class="content">${a.analysis}</div></div>`).join('')}</body></html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 모든 작업이 끝났습니다! 이제 GitHub에서 확인하세요.");
}

main();