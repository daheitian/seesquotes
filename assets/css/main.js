// 主题管理
const themeManager = {
  init() {
    const themeBtn = document.getElementById('themeBtn');
    if (!themeBtn) return;
    
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    const html = document.documentElement;
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    this.updateIcon(savedTheme, sunIcon, moonIcon);
    
    themeBtn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      this.updateIcon(next, sunIcon, moonIcon);
    });
  },
  
  updateIcon(theme, sun, moon) {
    if (!sun || !moon) return;
    if (theme === 'dark') {
      sun.style.display = 'block';
      moon.style.display = 'none';
    } else {
      sun.style.display = 'none';
      moon.style.display = 'block';
    }
  }
};

// 移动端菜单
const mobileMenu = {
  init() {
    const menuBtn = document.getElementById('menuBtn');
    const mobileNav = document.getElementById('mobileNav');
    const closeBtn = document.getElementById('mobileNavClose');
    
    if (!menuBtn || !mobileNav) return;
    
    menuBtn.addEventListener('click', () => mobileNav.classList.add('active'));
    closeBtn?.addEventListener('click', () => mobileNav.classList.remove('active'));
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  themeManager.init();
  mobileMenu.init();
});
