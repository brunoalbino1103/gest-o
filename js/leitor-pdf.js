// Lê o texto de um PDF no próprio navegador (pdf.js), linha por linha, na ordem em que aparece na página.
const VERSAO = '3.11.174';
let carregando = null;
function pdfjs() {
  return carregando ||= new Promise((ok, erro) => {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSAO}/pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSAO}/pdf.worker.min.js`; ok(window.pdfjsLib); };
    s.onerror = () => erro(new Error('Não consegui carregar o leitor de PDF (sem internet?).'));
    document.head.append(s);
  });
}

// Devolve [{ pagina, linhas: ['texto da linha', ...] }]. Junta os pedaços que estão na mesma altura.
export async function textoPDF(arquivoOuBuffer, { maxPaginas = 60 } = {}) {
  const lib = await pdfjs();
  const dados = arquivoOuBuffer instanceof ArrayBuffer ? arquivoOuBuffer : await arquivoOuBuffer.arrayBuffer();
  const doc = await lib.getDocument({ data: new Uint8Array(dados), isEvalSupported: false }).promise;
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPaginas); p++) {
    const pg = await doc.getPage(p);
    const tc = await pg.getTextContent();
    const itens = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str, w: i.width, h: Math.abs(i.transform[3]) || 8 }));
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of itens) {
      const l = linhas.find((ln) => Math.abs(ln.y - it.y) <= Math.max(2, it.h * 0.35));
      if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    }
    linhas.sort((a, b) => b.y - a.y);
    linhas.forEach((l) => l.itens.sort((a, b) => a.x - b.x));
    out.push({ pagina: p,
      linhas: linhas.map((l) => l.itens.reduce((s, it, i, arr) => {
        if (!i) return it.s;
        const ant = arr[i - 1]; const gap = it.x - (ant.x + ant.w);
        return s + (gap > 1.5 ? ' ' : '') + it.s;
      }, '').replace(/\s+/g, ' ').trim()),
      // com posição: para relatórios em colunas (cartão de ponto), cada pedaço com o x onde começa
      itens: linhas.map((l) => l.itens.map((it) => ({ s: it.s.trim(), x: it.x, w: it.w })).filter((it) => it.s)) });
  }
  return { paginas: out, total: doc.numPages };
}
export const tudo = (r) => r.paginas.flatMap((p) => p.linhas).join('\n');
