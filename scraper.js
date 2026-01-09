const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 키워드 설정
const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

// API 키 확인 (여기서 실패하면 로그에 바로 찍힘)
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ 에러: GEMINI_API_KEY를 찾을 수 없습니다.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function fetchHtml(url) {
    try {
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000 
        });
        return cheerio.load(data);
    } catch (e) { return null; }
}

async function analyze(article) {
    try {
        const $ = await fetchHtml(article.link);
        if (!$) return "기사 본문을 읽어오지 못했습니다.";

        // 본문 태그 여러 가능성 체크
        const content = $('.view_con, #articleText, .article-body, #article-view-content-div').text().trim().substring(0, 2000);
        
        if (content.length < 50) return "본문 내용이 너무 짧습니다.";

        const prompt = `당신은 헬스케어 전문가입니다. 다음 기사를 한국어로 3줄 요약하세요.
        제목: ${article.title}
        내용: ${content}`;

        // AI 호출 방식 최적화
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        return text;
    } catch (e) { 
        console.error("AI 에러 상세:", e.message);
        return `분석 실패 (이유: ${e.message})`; 
    }
}

async function main() {
    console.log("🚀 시작...");
    const articles = [];
    
    for (const kw of KEYWORDS) {
        console.log(`🔍 키워드 처리: ${kw}`);
        const $ = await fetchHtml(`https://www.koreaherald.com/search/index.php?q=${encodeURIComponent(kw)}`);
        if (!$) continue;

        const item = $('.news_list li').first();
        if (item.length) {
            const title = item.find('.news_title a').text().trim();
            const link = 'https://www.koreaherald.com' + item.find('.news_title a').attr('href');
            const date = item.find('.news_date').text().trim();
            
            const analysis = await analyze({ title, link });
            articles.push({ keyword: kw, title, link, date, analysis });
        }
    }

    const html = `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;padding:20px;background:#f4f7f6;}.card{background:white;padding:20px;margin-bottom:20px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,0.1); border-left: 5px solid #2ecc71;}.tag{background:#e8f8f5;color:#1abc9c;padding:4px 10px;border-radius:15px;font-size:0.8rem;}.content{white-space:pre-wrap;margin-top:15px;color:#444;}a{text-decoration:none;color:#2c3e50;}</style></head><body><h1>🏥 AI Health News</h1>${articles.map(a=>`<div class="card"><span class="tag">#${a.keyword}</span><h2><a href="${a.link}" target="_blank">${a.title}</a></h2><div class="content">${a.analysis}</div></div>`).join('')}</body></html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 완료!");
}

main();