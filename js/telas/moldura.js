// Abre um painel original (Férias, Fiscal) dentro do sistema: sem moldura, na cor do departamento,
// ocupando da posição dele até o fim da tela (só a rolagem do painel, sem barra dupla).
export function moldura(el, src, titulo) {
  const cor = (getComputedStyle(document.querySelector('.app') || document.body).getPropertyValue('--c') || '').trim().replace('#', '');
  el.innerHTML = `<iframe class="moldura" title="${titulo}" src="${src}${src.includes('?') ? '&' : '?'}cor=${cor}"></iframe>`;
  const f = el.querySelector('iframe');
  const ajusta = () => { if (!f.isConnected) { removeEventListener('resize', ajusta); return; } const topo = f.getBoundingClientRect().top + scrollY; const pe = parseFloat(getComputedStyle(f.closest('.conteudo') || document.body).paddingBottom) || 0; f.style.height = Math.max(520, innerHeight - topo - pe - 2) + 'px'; };
  addEventListener('resize', ajusta); requestAnimationFrame(ajusta); setTimeout(ajusta, 300);
  return f;
}
