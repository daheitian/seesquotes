const CONFIG = {
    RSS_URL: 'https://rsshub.app/jike/user/16120E35-EB4B-4FF1-9DBC-9BEFC1D16CCD',
    REFRESH_INTERVAL: 3 * 60 * 1000,
    RETRY_DELAY: 5000,
    MAX_RETRIES: 3,
    CACHE_KEY: 'jikePosts',
    CACHE_MAX_AGE: 3600000
};

const state = {
    posts: [],
    lastFetchTime: null,
    retryCount: 0,
    autoRefreshInterval: null
};

const elements = {
    homePage: document.getElementById('homePage'),
    aboutPage: document.getElementById('aboutPage'),
    posts: document.getElementById('posts'),
    postCount: document.getElementById('postCount'),
    updateTime: document.getElementById('updateTime'),
    status: document.getElementById('status'),
    statusText: document.getElementById('statusText'),
    refreshBtn: document.getElementById('refreshBtn'),
    themeBtn: document.getElementById('themeBtn'),
    sunIcon: document.getElementById('sunIcon'),
    moonIcon: document.getElementById('moonIcon'),
    randomBtn: document.getElementById('randomBtn'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modalBody'),
    modalClose: document.getElementById('modalClose'),
    html: document.documentElement
};

function formatTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatFullTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function extractImages(content) {
    if (!content) return [];
    const imgRegex = /<img[^>]+src="([^"]+)"/g;
    const images = [];
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
        images.push(match[1]);
    }
    return images;
}

function cleanContent(content) {
    if (!content) return '';
    return content
        .replace(/<img[^>]+>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

function extractTags(content) {
    if (!content) return [];
    const tagRegex = /#([^#\s]+)/g;
    const tags = [];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
        tags.push(match[1]);
    }
    return tags;
}

function updateStatus(text, type = 'normal') {
    elements.statusText.textContent = text;
    elements.status.classList.remove('syncing', 'error');
    if (type === 'syncing') elements.status.classList.add('syncing');
    if (type === 'error') elements.status.classList.add('error');
}

function parseRSS(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    
    const parseError = xml.querySelector('parsererror');
    if (parseError) throw new Error('XML parse error');
    
    const items = xml.querySelectorAll('item');
    return Array.from(items).map(item => ({
        title: item.querySelector('title')?.textContent || '',
        description: item.querySelector('description')?.textContent || '',
        pubDate: item.querySelector('pubDate')?.textContent || '',
        link: item.querySelector('link')?.textContent || ''
    }));
}

function renderPost(item) {
    const images = extractImages(item.description);
    let content = cleanContent(item.description);
    const tags = extractTags(content);
    content = content.replace(/#([^#\s]+)/g, '').trim();
    
    const imageClass = images.length === 1 ? 'single' : images.length === 2 ? 'double' : 'multiple';
    
    return `
        <div class="post-header">
            <div class="post-avatar">黑</div>
            <div class="post-meta">
                <div class="post-author">大黑天</div>
                <div class="post-time">${formatFullTime(item.pubDate)} · ${formatTime(item.pubDate)}</div>
            </div>
        </div>
        <div class="post-content">${content}</div>
        ${images.length > 0 ? `
            <div class="post-images ${imageClass}">
                ${images.map(img => `<img src="${img}" alt="" loading="lazy" onerror="this.style.display='none'">`).join('')}
            </div>
        ` : ''}
        ${tags.length > 0 ? `
            <div class="post-tags">
                ${tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
            </div>
        ` : ''}
    `;
}

function renderPosts(items) {
    if (!items || items.length === 0) {
        elements.posts.innerHTML = `
            <div class="empty">
                <div class="empty-icon">📝</div>
                <p>暂无动态</p>
            </div>
        `;
        return;
    }
    
    elements.posts.innerHTML = items.map((item, index) => `
        <article class="post" data-index="${index}">
            ${renderPost(item)}
        </article>
    `).join('');
    
    elements.postCount.textContent = items.length;
    elements.updateTime.textContent = formatTime(new Date());
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function fetchRSS() {
    const errors = [];
    
    try {
        const response = await fetchWithTimeout(CONFIG.RSS_URL, {
            headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const posts = parseRSS(await response.text());
        if (posts.length > 0) return posts;
    } catch (err) {
        errors.push(`Direct: ${err.message}`);
    }
    
    const corsProxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(CONFIG.RSS_URL)}`,
        `https://corsproxy.io/?${encodeURIComponent(CONFIG.RSS_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(CONFIG.RSS_URL)}`
    ];
    
    for (const proxyUrl of corsProxies) {
        try {
            const response = await fetchWithTimeout(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const posts = parseRSS(await response.text());
            if (posts.length > 0) return posts;
        } catch (err) {
            errors.push(`Proxy: ${err.message}`);
        }
    }
    
    throw new Error('All fetch methods failed: ' + errors.join('; '));
}

async function fetchPosts(showLoading = true, isRetry = false) {
    elements.refreshBtn.disabled = true;
    if (showLoading && !isRetry) updateStatus('正在同步...', 'syncing');
    
    try {
        const items = await fetchRSS();
        state.posts = items;
        state.lastFetchTime = new Date();
        state.retryCount = 0;
        
        renderPosts(state.posts);
        updateStatus('实时同步中');
        
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
            posts: state.posts,
            timestamp: Date.now()
        }));
        
        return true;
    } catch (error) {
        const cached = localStorage.getItem(CONFIG.CACHE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.posts?.length > 0) {
                    state.posts = data.posts;
                    renderPosts(state.posts);
                    updateStatus('显示缓存数据');
                    
                    if (state.retryCount < CONFIG.MAX_RETRIES) {
                        state.retryCount++;
                        setTimeout(() => fetchPosts(false, true), CONFIG.RETRY_DELAY);
                    }
                    return false;
                }
            } catch (e) {
                console.error('Cache parse error:', e);
            }
        }
        
        updateStatus('同步失败', 'error');
        elements.posts.innerHTML = `
            <div class="error">
                <div class="error-icon">⚠️</div>
                <h3>加载失败</h3>
                <p>网络连接不稳定，请检查网络后重试</p>
                <button class="retry-btn" onclick="fetchPosts(true)">重新加载</button>
            </div>
        `;
        
        if (state.retryCount < CONFIG.MAX_RETRIES) {
            state.retryCount++;
            setTimeout(() => fetchPosts(false, true), CONFIG.RETRY_DELAY);
        }
        return false;
    } finally {
        elements.refreshBtn.disabled = false;
    }
}

function loadFromCache() {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (!cached) return false;
    
    try {
        const data = JSON.parse(cached);
        if (data.posts?.length > 0 && (Date.now() - data.timestamp) < CONFIG.CACHE_MAX_AGE) {
            state.posts = data.posts;
            renderPosts(state.posts);
            updateStatus('显示缓存数据');
            return true;
        }
    } catch (e) {
        console.error('Cache error:', e);
    }
    return false;
}

function initNavigation() {
    document.querySelectorAll('nav a[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            elements.homePage.style.display = page === 'home' ? 'block' : 'none';
            elements.aboutPage.style.display = page === 'about' ? 'block' : 'none';
        });
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    elements.html.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    elements.themeBtn.addEventListener('click', () => {
        const currentTheme = elements.html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        elements.html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const isDark = theme === 'dark';
    elements.sunIcon.style.display = isDark ? 'block' : 'none';
    elements.moonIcon.style.display = isDark ? 'none' : 'block';
}

function initModal() {
    elements.randomBtn.addEventListener('click', () => {
        if (state.posts.length === 0) return;
        const randomIndex = Math.floor(Math.random() * state.posts.length);
        elements.modalBody.innerHTML = renderPost(state.posts[randomIndex]);
        elements.modal.classList.add('active');
    });
    
    elements.modalClose.addEventListener('click', () => {
        elements.modal.classList.remove('active');
    });
    
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) elements.modal.classList.remove('active');
    });
}

function initRefresh() {
    elements.refreshBtn.addEventListener('click', () => {
        state.retryCount = 0;
        fetchPosts(true);
    });
}

function startAutoRefresh() {
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    state.autoRefreshInterval = setInterval(() => fetchPosts(false), CONFIG.REFRESH_INTERVAL);
}

function init() {
    initNavigation();
    initTheme();
    initModal();
    initRefresh();
    
    const hasCache = loadFromCache();
    fetchPosts(!hasCache);
    startAutoRefresh();
}

init();
