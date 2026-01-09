const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// [지연 함수]
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [1] 구글한테 "너 무슨 모델 가지고 있어?" 하고 물어보는 함수
async function getWorkingModel(apiKey) {
    try {
        // v1beta 목록 조회
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios.get(listUrl);
        const models = response.data.models;

        // 'generateContent' 기능이 있는 모델만 추림
        const validModels = models.filter(m => m.supportedGenerationMethods.includes('generateContent'));

        if (validModels.length === 0) throw new Error("사용 가능한 모델이 없습니다.");

        // 우선순위: flash(빠름) -> pro(안정적) -> 아무거나
        let bestModel = validModels.find(m => m.name.includes('flash')) || 
                        validModels.find(m => m.name.includes('pro')) || 
                        validModels[0];

        console.log(`🤖 구글이 제공한 모델 사용: ${bestModel.name}`);
        return bestModel.name; // 예: models/gemini-2.0-flash-exp (이름을 그대로 리턴)
    } catch (e) {
        console.error("🚨 모델 목록 조회 실패. 기본값 'models/gemini-pro' 시도합니다.");
        return 'models/gemini-pro';
    }
}

// [2] AI 요약 함수 (429 에러 시 무한 재시도)
async function callGemini(text, modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
    // [중요] 제가 이름을 정하지 않고, 위에서 받아온 modelName을 그대로 씁니다.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: `뉴스 제목: "${text}" \n위 의학 뉴스 제목을 보고 한국어로 핵심 건강 정보를 3줄로 요약해 주세요.` }] }]
    };

    let attempts = 0;
    // 최대 10번까지 재시도 (끈질기게 붙음)
    while (attempts < 10) {
        try {
            const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
            return response.data.candidates[0].content.parts[0].text;
        } catch (error) {
            // 429 (속도 제한) -> 30초 쉬고 재시도
            if (error.response && error.response.status === 429) {
                attempts++;
                console.log(`⏳ [속도 제한 429] 30초 대기 후 재시도합니다... (${attempts}/10)`);
                await delay(30000); 
                continue;
            }
            
            // 404가 뜨면 모델이 안 맞는 거니, gemini-pro로 바꿔서 한 번 더 시도
            if (error.response && error.response.status === 404 && !modelName.includes('pro')) {
                console.log("🚨 모델 불일치(404). 'gemini-pro'로 변경하여 재시도...");
                return callGemini(text, 'models/gemini-pro');
            }

            console.error(`🚨 분석 실패 (${error.response ? error.response.status : error.message})`);
            return "AI 분석 오류";
        }
    }
    return "AI 응답 시간 초과";
}

async function main() {
    console.log("🚀 뉴스 수집 시작...");
    const articles = [];
    const apiKey = process.env.GEMINI_API_KEY;

    try {
        // [핵심] 사용 가능한 모델 이름을 먼저 받아옵니다.
        const modelName = await getWorkingModel(apiKey);
        
        // ScienceDaily Health RSS
        const rssUrl = "https://www.sciencedaily.com/rss/health_medicine.xml"; 
        const response = await axios.get(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
        
        const items = (response.data.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 5);

        for (const itemXml of items) {
            let title = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)[1].trim();
            let link = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)[1].trim();

            console.log(`📰 분석 중: ${title}`);

            // 받아온 정확한 모델 이름으로 호출
            const analysis = await callGemini(title, modelName);
            articles.push({ title, link, analysis });

            // 성공 후에도 5초 휴식 (안전빵)
            await delay(5000); 
        }
    } catch (e) {
        console.error("🔥 에러:", e.message);
    }

    // HTML 생성
    const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오늘의 AI 헬스 뉴스</title>
        <style>
            body { font-family: sans-serif; padding: 15px; background: #f4f7f6; }
            .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { font-size: 1.1rem; margin-bottom: 10px; }
            h2 a { color: #333; text-decoration: none; }
            .analysis { background: #e0f7fa; padding: 10px; border-radius: 5px; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; }
        </style>
    </head>
    <body>
        <h1 style="text-align:center; color:#00796b">🏥 오늘의 AI 헬스 뉴스</h1>
        <p style="text-align:center; color:gray">${new Date().toLocaleString('ko-KR')}</p>
        ${articles.map(a => `
            <div class="card">
                <h2><a href="${a.link}" target="_blank">${a.title}</a></h2>
                <div class="analysis">${a.analysis}</div>
            </div>
        `).join('')}
    </body>
    </html>`;

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync('public/index.html', html);
    console.log(`✅ 완료!`);
}

main();