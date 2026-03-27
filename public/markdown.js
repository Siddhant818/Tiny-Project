window.copyToClipboard = function (btn) {
  const code = btn.closest('.code-block').querySelector('code');
  navigator.clipboard.writeText(code.innerText).then(() => {
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
};

window.copyMessage = function (btn) {
  const bubble = btn.closest('.msg-row').querySelector('.bubble');
  navigator.clipboard.writeText(bubble.innerText).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
};

function injectComplexityBadges(html) {
  return html.replace(
    /\b(O\s*\(\s*(?:1|log\s*n|n\s*log\s*n|n|n[²2]|n\^2|2\^n|n!)\s*\))/gi,
    (m) => {
      const lo = m.toLowerCase().replace(/\s/g,'');
      const cls = /o\(1\)|o\(logn\)/.test(lo) ? 'good'
                : /o\(n\^2\)|o\(n²\)|o\(2\^n\)|o\(n!\)/.test(lo) ? 'bad'
                : 'mid';
      return `<span class="cbadge ${cls}">${m}</span>`;
    }
  );
}

function renderMarkdownWithCopy(mdText) {
  if (typeof marked === 'undefined') return mdText.replace(/</g, '&lt;');
  marked.setOptions({ breaks: true, gfm: true });
  const tmp = document.createElement('div');
  tmp.innerHTML = marked.parse(mdText);
  tmp.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    const lang = code ? (code.className.replace('language-','').trim() || 'code') : 'code';
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    wrap.innerHTML = `<div class="code-header"><span class="code-lang">${lang.toUpperCase()}</span><button class="copy-btn" onclick="copyToClipboard(this)">Copy</button></div>`;
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
  });
  return injectComplexityBadges(tmp.innerHTML);
}