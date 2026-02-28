// =======================
// 核心配置区（仅需修改这里）
// =======================
const CONFIG = {
    // 你的即刻RSS源地址（直接使用你提供的地址）
    rssUrl: "https://rsshub.app/jike/user/16120E35-EB4B-4FF1-9DBC-9BEFC1D16CCD",
    // CORS代理地址（解决跨域，公共代理可直接用，也可替换为自己部署的）
    corsProxy: "https://corsproxy.io/?",
    // 可选：仅拉取带指定标签的即刻动态，比如只同步带#金句 的内容，空数组则拉取全部
    onlyTags: [], 
    // 可选：默认分类，未匹配到标签的内容归到该分类
    defaultCategory: "life",
    // 标签-分类映射，将你的即刻标签对应到金句分类
    tagCategoryMap: {
        "成长思考": "growth",
        "生活哲思": "life",
        "金句": "growth"
    }
};

// =======================
// 全局变量（无需修改）
// =======================
let quotesData = []; // 存储从RSS拉取的金句数据
const quoteDisplay = document.getElementById('quote-display');
const filterButtons = document.querySelectorAll('.filter-btn');
const quoteText = quoteDisplay.querySelector('.quote-text');
const quoteInterpretation = quoteDisplay.querySelector('.quote-interpretation');
const quoteCategory = quoteDisplay.querySelector('.quote-category');

// =======================
// 核心逻辑：拉取并解析RSS源
// =======================
async function loadQuotesFromRSS() {
    try {
        // 拼接代理后的完整请求地址
        const fullUrl = CONFIG.corsProxy + encodeURIComponent(CONFIG.rssUrl);
        
        // 拉取RSS数据
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error("RSS源请求失败，请检查即刻账号是否公开");
        
        const rssText = await response.text();
        
        // 解析XML格式的RSS
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(rssText, "text/xml");
        const items = xmlDoc.querySelectorAll("item");

        // 遍历RSS条目，转换成金句数据
        items.forEach(item => {
            // 提取RSS核心字段
            const title = item.querySelector("title")?.textContent || "";
            const description = item.querySelector("description")?.textContent || "";
            const pubDate = item.querySelector("pubDate")?.textContent || "";
            
            // 核心：金句正文用description（即刻动态的完整内容）
            const quoteContent = description || title;
            if (!quoteContent.trim()) return; // 跳过空内容

            // 提取动态里的话题标签，用于分类
            const tagMatch = quoteContent.match(/#([^#\s]+)/g) || [];
            const tags = tagMatch.map(tag => tag.replace("#", "").trim());
            
            // 按配置过滤标签
            if (CONFIG.onlyTags.length > 0) {
                const hasTargetTag = tags.some(tag => CONFIG.onlyTags.includes(tag));
                if (!hasTargetTag) return;
            }

            // 匹配金句分类
            let category = CONFIG.defaultCategory;
            for (const tag of tags) {
                if (CONFIG.tagCategoryMap[tag]) {
                    category = CONFIG.tagCategoryMap[tag];
                    break;
                }
            }

            // 生成金句对象，加入数组
            quotesData.push({
                text: quoteContent.replace(/#[^#\s]+/g, "").trim(), // 去掉正文里的标签，内容更干净
                interpretation: `发布于 ${new Date(pubDate).toLocaleDateString()}`, // 用发布时间做解读，可自定义
                category: category,
                tags: tags,
                pubDate: new Date(pubDate)
            });
        });

        // 按发布时间倒序，最新内容在前
        quotesData.sort((a, b) => b.pubDate - a.pubDate);

        // 初始化页面，渲染第一条金句
        if (quotesData.length > 0) {
            renderQuote(quotesData[0]);
        } else {
            quoteText.textContent = "暂无金句内容，请检查即刻账号是否公开，或RSS源是否正常";
        }

    } catch (error) {
        console.error("金句加载失败：", error);
        quoteText.textContent = "金句库加载失败，请检查网络或RSS源配置";
    }
}

// =======================
// 原有功能兼容：渲染金句、按钮交互
// =======================
function renderQuote(quoteObj) {
    if (!quoteObj) return;

    quoteText.textContent = quoteObj.text;
    
    // 处理解读内容
    if (quoteObj.interpretation) {
        quoteInterpretation.textContent = quoteObj.interpretation;
        quoteInterpretation.style.display = 'block';
    } else {
        quoteInterpretation.style.display = 'none';
    }

    // 处理分类标签显示
    const categoryMap = { 'growth': '成长思考', 'life': '生活哲思' };
    quoteCategory.textContent = categoryMap[quoteObj.category] || '摘录';
}

// 筛选按钮点击事件
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (quotesData.length === 0) return;

        // 切换激活状态
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.dataset.category;
        let targetQuotes = quotesData;

        // 分类筛选逻辑
        if (category === 'random') {
            // 随机一条
            const randomIndex = Math.floor(Math.random() * quotesData.length);
            renderQuote(quotesData[randomIndex]);
            return;
        } else if (category !== 'all') {
            // 按分类筛选
            targetQuotes = quotesData.filter(q => q.category === category);
        }

        // 渲染筛选后的第一条
        if (targetQuotes.length > 0) {
            renderQuote(targetQuotes[0]);
        } else {
            quoteText.textContent = "该分类下暂无内容";
            quoteInterpretation.style.display = 'none';
            quoteCategory.textContent = '';
        }
    });
});

// =======================
// 页面加载时自动执行
// =======================
window.addEventListener('DOMContentLoaded', loadQuotesFromRSS);
