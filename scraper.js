const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const KEYWORDS = ['mental health', 'digital healthcare', 'aging society'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 더 사람처럼 보이게 하는 설정
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function fetchHtml(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        return cheerio.load(response.data);
    } catch (e) { 
        console.error(`접속 에러: ${url}`);
        return null; 
    }
}

async function analyze(article) {
    try {
        const $ = await fetchHtml(article.link);
        if (!$) return "기사 본문을 읽어오지 못했습니다.";

        // 코리아타임스 본문 영역 추출
        const content = $('#start-abd, .view_article, .article_view').text().trim().substring(0, 2000);
        
        if (content.length < 50) return "본문 요약에 필요한 충분한 내용을 가져오지 못했습니다.";

        const prompt = `당신은 헬스케어 전문 기자입니다. 다음 기사를 한국어로 3줄 요약해 주세요.
        제목: ${article.title}
        내용: ${content}`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { 
        return "AI 분석 실패: " + e.message; 
    }
}

async function main() {
    console.log("🚀 코리아타임스로 뉴스 수집 시작...");
    const articles = [];
    
    for (const kw of KEYWORDS) {
        console.log(`🔍 키워드 검색 중: ${kw}`);
        // 코리아타임스 검색 결과 페이지
        const searchUrl = `https://www.koreatimes.co.kr/www2/common/search.asp?kwd=${encodeURIComponent(kw)}`;
        const $ = await fetchHtml(searchUrl);
        
        if ($) {
            // 코리아타임스 검색 결과 첫 번째 기사 찾기
            const firstArticle = $('.list_story .main_article_headline a, .list_story li a').first();
            const relativeLink = firstArticle.attr('href');
            
            if (relativeLink) {
                const title = firstArticle.text().trim();
                const link = relativeLink.startsWith('http') ? relativeLink : 'https://www.koreatimes.co.kr' + relativeLink;
                
                console.log(`📰 기사 발견: ${title}`);
                const analysis = await analyze({ title, link });
                articles.push({ keyword: kw, title, link, analysis });
            }
        }
        await new Promise(res => setTimeout(res, 2000));
    }

    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f7f6; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: white; padding: 25px; margin-bottom: 25px; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); border-left: 6px solid #3498db; }
            .tag { background: #e1f5fe; color: #0288d1; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; }
            .content { background: #fcfcfc; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; color: #444; }
            a { text-decoration: none; color: #2c3e50; }
            h1 { text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 AI 헬스 뉴스 브리핑</h1>
            <p style="text-align:center; color:gray">업데이트: ${new Date().toLocaleString('ko-KR')}</p>
            ${articles.map(a => `
                <div class="card">
                    <span class="tag">#${a.keyword}</span>
                    <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                    <div class="content">${a.analysis}</div>
                </div>
            `).join('')}
        </div>
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log("✅ 완료! 이제 GitHub 결과를 확인하세요.");
}

main();