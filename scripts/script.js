// =======================
// 第一步：在这里配置你的金句数据！
// =======================
const quotesData = [
    {
        text: "我们终此一生，就是要摆脱他人的期待，找到真正的自己。",
        interpretation: "这是我对「自我」认知的启蒙句。不要活在别人的定义里。",
        category: "growth"
    },
    {
        text: "种一棵树最好的时间是十年前，其次是现在。",
        interpretation: "每当我想拖延时，就用这句话骂自己。",
        category: "growth"
    },
    {
        text: "生活不是你活过的样子，而是你记住的样子。",
        interpretation: "所以记录很重要，这也是我做金句站的原因之一。",
        category: "life"
    },
    {
        text: "把时间分给睡眠，分给书籍，分给运动，分给花鸟树木和山川湖海。",
        interpretation: "焦虑的时候，就把注意力放回这些具体的事情上。",
        category: "life"
    }
    // 继续往这里加新的金句...
];

// =======================
// 第二步：交互逻辑（不用改）
// =======================
const quoteDisplay = document.getElementById('quote-display');
const filterButtons = document.querySelectorAll('.filter-btn');
const quoteText = quoteDisplay.querySelector('.quote-text');
const quoteInterpretation = quoteDisplay.querySelector('.quote-interpretation');
const quoteCategory = quoteDisplay.querySelector('.quote-category');

// 初始化：先显示第一条
renderQuote(quotesData[0]);

// 按钮点击事件
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // 移除所有激活状态
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.dataset.category;

        if (category === 'random') {
            // 随机逻辑
            const randomIndex = Math.floor(Math.random() * quotesData.length);
            renderQuote(quotesData[randomIndex]);
        } else if (category === 'all') {
            // 显示第一条
            renderQuote(quotesData[0]);
        } else {
            // 分类筛选
            const filteredQuotes = quotesData.filter(q => q.category === category);
            if (filteredQuotes.length > 0) {
                renderQuote(filteredQuotes[0]); // 显示该分类下第一条
            }
        }
    });
});

// 渲染金句的函数
function renderQuote(quoteObj) {
    if (!quoteObj) return;

    quoteText.textContent = quoteObj.text;
    
    // 处理解读（如果有的话）
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
