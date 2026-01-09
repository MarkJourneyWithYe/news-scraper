const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 브라우저인 척 속이는 헤더 (가장 중요)
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, { 
            headers: HEADERS,
            timeout: 10000 
        });
        return cheerio.load(response.data);
    } catch (e) { 
        console.error(`❌ 접속 불가 (${url}): ${e.response ? e.response.status : e.message}`);
        return null; 
    }
}

async function analyze(article) {
    try {
        const $ = await fetchHtml(article.link);
        if (!$) return `본문 가져오기 실패 (사이트 접속 차단)`;

        // 코리아헤럴드 및 일반 뉴스 사이트 본문 태그 총동원
        const content = $('.view_con, #articleText, .article-body, #article-view-content-div, .view_content, .article_view').text().trim().substring(0, 2500);
        
        if (content.length < 50) {
            return "본문을 찾을 수 없습니다. (사이트 구조 변경 가능성)";
        }

        const prompt = `당신은 헬스케어 전문 요약가입니다. 다음 기사를 읽고 한국어로 핵심 요약해 주세요.
        제목: ${article.title}
        내용: ${content}`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { 
        return `분석 중 오류 발생: ${e.message}`; 
    }
}

async function main() {
    console.log("🚀 작업 시작...");
    const articles = [];
    
    for (const kw of KEYWORDS) {
        console.log(`🔍 키워드 검색: ${kw}`);
        // 검색 결과 가져오기
        const $ = await fetchHtml(`https://www.koreaherald.com/search/index.php?q=${encodeURIComponent(kw)}`);
        
        if ($) {
            const item = $('.news_list li').first();
            if (item.length) {
                const title = item.find('.news_title a').text().trim();
                const link = 'https://www.koreaherald.com' + item.find('.news_title a').attr('href');
                const date = item.find('.news_date').text().trim();
                
                console.log(`📰 기사 발견: ${title}`);
                const analysis = await analyze({ title, link });
                articles.push({ keyword: kw, title, link, date, analysis });
            }
        }
        // 3초 대기 (사람처럼 보이게)
        await new Promise(res => setTimeout(res, 3000));
    }

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:'Apple SD Gothic Neo',sans-serif;padding:20px;background:#f0f4f8;color:#333;line-height:1.6;}.container{max-width:800px;margin:0 auto;}.card{background:#fff;padding:25px;margin-bottom:25px;border-radius:12px;box-shadow:0 8px 16px rgba(0,0,0,0.05); border-top: 6px solid #3498db;}.tag{background:#ebf5ff;color:#3498db;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:bold;}.content{background:#f9fbff;padding:15px;border-radius:8px;margin-top:15px;white-space:pre-wrap;}a{text-decoration:none;color:inherit;}h1{text-align:center;margin-bottom:40px;}</style></head><body><div class="container"><h1>🏥 오늘의 AI 헬스 뉴스</h1><p style="text-align:right">${new Date().toLocaleString('ko-KR')}</p>${articles.map(a=>`<div class="card"><span class="tag">#${a.keyword}</span><h2><a href="${a.link}" target="_blank">${a.title}</a></h2><div class="content">${a.analysis}</div></div>`).join('')}</div></body></html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 모든 작업 완료!");
}

main();