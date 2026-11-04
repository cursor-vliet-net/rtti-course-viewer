(function(){
'use strict';
var V = window.VIEWER;
var LS_C = 'rttiViewer.comments.v1', LS_T = 'rttiViewer.theme', LS_E = 'rttiViewer.editMode', LS_X = 'rttiViewer.lastExport';
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function normText(s){ return String(s || '').replace(/\s+/g, ' ').trim(); }

var IDX = {}, REF2A = {}, POS = {};
V.index.forEach(function(e, i){ IDX[e[0]] = {doc: e[1], ref: e[2], text: e[3], lc: e[3].toLowerCase()}; REF2A[e[2]] = e[0]; POS[e[0]] = i; });
var current = null;
var content = $('#content'), art = $('#doc');
function wide(){ return window.innerWidth >= 992; }
function scroller(){ return wide() ? content : (document.scrollingElement || document.documentElement); }

/* ---------- lagring ---------- */
/* c[anker] = {ref, doc, items:[{type:'kommentar', t, ts}], ch:{type:'endring', ref, old, oldText, neu, html, why, kind, ts},
               rm:{type:'fjernet', ref, scope:'el'|'head'|'sec'|'row', kind, old, oldText, parts, row, why, ts}}
   Fjernede tabellrader har nøkkelen anker + '::r' + radnummer. */
var memStore = {}, memKV = {}, lsOk = true;
try { localStorage.setItem('rttiViewer.test', '1'); localStorage.removeItem('rttiViewer.test'); } catch(e){ lsOk = false; }
function kvGet(k){ if (lsOk) { try { return localStorage.getItem(k); } catch(e){ return null; } } return memKV[k] === undefined ? null : memKV[k]; }
function kvSet(k, v){ if (lsOk) { try { localStorage.setItem(k, v); } catch(e){} } else memKV[k] = v; }
function loadC(){
  try {
    var o = lsOk ? JSON.parse(localStorage.getItem(LS_C) || '{}') : JSON.parse(JSON.stringify(memStore));
    if (!o || typeof o !== 'object') return {};
    Object.keys(o).forEach(function(a){ if (!o[a] || typeof o[a] !== 'object') { delete o[a]; return; } if (!Array.isArray(o[a].items)) o[a].items = []; });
    return o;
  } catch(e){ return {}; }
}
function saveC(c){
  if (lsOk) { try { localStorage.setItem(LS_C, JSON.stringify(c)); } catch(e){ toast('Kunne ikke lagre i nettleseren: ' + e.message); } }
  else { memStore = c; }
  updateCounts(); renderCmList();
}
function prune(c, a){ var e = c[a]; if (e && !e.items.length && !e.ch && !e.rm) delete c[a]; }
function baseA(k){ return String(k).split('::')[0]; }
function newEntry(a){
  var el = document.getElementById(a), info = IDX[a] || {};
  return {ref: el ? el.getAttribute('data-ref') : (info.ref || a), doc: info.doc || current, items: []};
}

/* ---------- toast og kopiering ---------- */
var toastObj = null, toastLinkVal = null;
function toast(msg, link){
  $('#toastMsg').textContent = msg;
  toastLinkVal = link || null; $('#toastLink').classList.toggle('d-none', !link);
  if (!toastObj) toastObj = bootstrap.Toast.getOrCreateInstance($('#toast'), {delay: 4000});
  toastObj.show();
}
$('#toastLink').addEventListener('click', function(){ var l = toastLinkVal; if (l) copyText(l).then(function(){ toast('Lenke kopiert: ' + l); }); });
function copyText(t){
  function fallback(){ return new Promise(function(res){ var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta); res(); }); }
  if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(t).catch(fallback); }
  return fallback();
}
function download(name, text, type){
  var blob = new Blob([text], {type: type}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp(){ var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }

/* ---------- tema ---------- */
$('#themeBtn').addEventListener('click', function(){
  var h = document.documentElement, t = h.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
  h.setAttribute('data-bs-theme', t); try { localStorage.setItem(LS_T, t); } catch(e){}
});

/* ---------- navigasjonstre ---------- */
var navByDoc = {}, navByAnchor = {};
function buildNode(n, depth){
  var li = document.createElement('li'); li.className = 'nav-node' + (n.open ? ' open' : '');
  var row = document.createElement('div'); row.className = 'nav-row' + (depth === 0 ? ' grp' : '') + (n.a ? ' sec-row' : '');
  var kids = n.c || [];
  var caret = document.createElement('button'); caret.type = 'button'; caret.className = 'caret' + (kids.length ? '' : ' empty');
  caret.innerHTML = '<i class="fa-solid fa-chevron-right"></i>'; caret.setAttribute('aria-label', 'Åpne/lukk');
  caret.addEventListener('click', function(ev){ ev.stopPropagation(); li.classList.toggle('open'); });
  row.appendChild(caret);
  var ic = document.createElement('span'); ic.className = 'ic'; ic.innerHTML = '<i class="' + esc(n.i || 'fa-regular fa-file') + '"></i>'; row.appendChild(ic);
  var a = document.createElement('a');
  if (n.d) { a.href = '#d-' + n.d; navByDoc[n.d] = row; }
  else if (n.a) { a.href = '#' + n.a; navByAnchor[n.a] = row; }
  else { a.href = '#'; a.addEventListener('click', function(ev){ ev.preventDefault(); li.classList.toggle('open'); }); }
  a.textContent = n.t; a.title = n.t; row.appendChild(a);
  li.appendChild(row);
  if (kids.length) { var ul = document.createElement('ul'); kids.forEach(function(k){ ul.appendChild(buildNode(k, depth + 1)); }); li.appendChild(ul); }
  return li;
}
function buildNav(){ var ul = document.createElement('ul'); V.nav.forEach(function(n){ ul.appendChild(buildNode(n, 0)); }); $('#navTree').appendChild(ul); }
function openAncestors(el){ var p = el; while (p && p.id !== 'navTree') { if (p.classList && p.classList.contains('nav-node')) p.classList.add('open'); p = p.parentNode; } }
function markNav(id){
  $$('.nav-row.active').forEach(function(r){ r.classList.remove('active'); });
  var row = navByDoc[id]; if (!row) return;
  row.classList.add('active'); openAncestors(row);
  var tree = $('#navTree'), rb = row.getBoundingClientRect(), tb = tree.getBoundingClientRect();
  if (rb.top < tb.top || rb.bottom > tb.bottom) row.scrollIntoView({block: 'center'});
}
function closeNavMobile(){ if (!wide()) { var oc = bootstrap.Offcanvas.getInstance($('#navPane')); if (oc) oc.hide(); } }
$('#navTree').addEventListener('click', function(ev){ var a = ev.target.closest('a'); if (a && a.getAttribute('href') !== '#') closeNavMobile(); });

/* ---------- HTML -> enkel Markdown ---------- */
var SKIP = /(^|\s)(nb-num|cm-btn|ed-btn|ed-flag|ed-bar|ed-why-in|rm-btn|rm-ph|rm-flag|quiz-radio|quiz-mark|quiz-actions|quiz-note)(\s|$)/;
var BLOCK = /^(P|DIV|UL|OL|LI|TABLE|THEAD|TBODY|TR|BLOCKQUOTE|PRE|H[1-6]|HR|SECTION|DETAILS|FIGURE)$/;
function wrapMark(s, m){ var t = s.trim(); if (!t) return s; return s.match(/^\s*/)[0] + m + t + m + s.match(/\s*$/)[0]; }
function inl(n){ var out = ''; n.childNodes.forEach(function(ch){ out += inlNode(ch); }); return out; }
function inlNode(ch){
  if (ch.nodeType === 3) return ch.nodeValue.replace(/[ \t\r\n\f]+/g, ' ');
  if (ch.nodeType !== 1 || SKIP.test(ch.className || '')) return '';
  var t = ch.tagName;
  if (BLOCK.test(t)) return '\n' + blocks(ch, '\n') + '\n';
  switch (t) {
    case 'STRONG': case 'B': return wrapMark(inl(ch), '**');
    case 'EM': case 'I': return wrapMark(inl(ch), '*');
    case 'S': case 'DEL': case 'STRIKE': return wrapMark(inl(ch), '~~');
    case 'CODE': return '`' + ch.textContent + '`';
    case 'BR': return '\n';
    case 'IMG': return '![' + (ch.getAttribute('alt') || '') + '](' + (ch.getAttribute('src') || '') + ')' + imgMark(ch);
    case 'SUP': if (/footnote-ref/.test(ch.className)) return '[^' + ch.textContent.replace(/[\[\]\s]/g, '') + ']'; return inl(ch);
    case 'A':
      if (/(^|\s)(codelink|footnote-backref)(\s|$)/.test(ch.className)) return inl(ch);
      var h = ch.getAttribute('href') || '', x = inl(ch);
      return h ? '[' + x.trim() + '](' + h + ')' : x;
    default: return inl(ch);
  }
}
function cleanPara(s){ return s.split('\n').map(function(l){ return l.trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function blocks(n, sep){
  var parts = [], buf = '';
  function flush(){ var p = cleanPara(buf); if (p) parts.push(p); buf = ''; }
  n.childNodes.forEach(function(ch){
    if (ch.nodeType === 1 && SKIP.test(ch.className || '')) return;
    if (ch.nodeType !== 1 || !BLOCK.test(ch.tagName)) { buf += inlNode(ch); return; }
    flush();
    var t = ch.tagName, s;
    if (t === 'P') s = (ch.classList.contains('quiz-stem') ? 'Q: ' : '') + cleanPara(inl(ch));
    else if (t === 'UL' || t === 'OL') s = list(ch);
    else if (t === 'TABLE') s = table(ch);
    else if (t === 'BLOCKQUOTE') s = blocks(ch, '\n\n').split('\n').map(function(l){ return l ? '> ' + l : '>'; }).join('\n');
    else if (t === 'PRE') s = '```\n' + ch.textContent.replace(/\n$/, '') + '\n```';
    else if (/^H[1-6]$/.test(t)) s = new Array(+t[1] + 1).join('#') + ' ' + cleanPara(inl(ch)).replace(/\n/g, ' ');
    else if (t === 'HR') s = '---';
    else s = blocks(ch, sep);
    if (s) parts.push(s);
  });
  flush();
  return parts.join(sep);
}
function list(ul){
  if (ul.classList.contains('quiz-opts')) return quizOptsMd(ul);
  var ordered = ul.tagName === 'OL', start = +(ul.getAttribute('start') || 1), out = [];
  $$(':scope > li', ul).forEach(function(li, i){
    var mk = ordered ? (start + i) + '. ' : '- ', pad = new Array(mk.length + 1).join(' ');
    var body = blocks(li, '\n').split('\n');
    out.push(body.map(function(l, k){ return k === 0 ? mk + l : (l ? pad + l : ''); }).join('\n'));
  });
  return out.join('\n');
}
/* Svaralternativer i en quiz: «- [x] tekst | forklaring» (se QUIZ-FORMAT.md) */
function quizOptsMd(ul){
  return $$(':scope > li', ul).map(function(li){
    var tx = li.querySelector('.quiz-txt'), ex = li.querySelector('.quiz-expl');
    var s = cleanPara(inl(tx || li)).replace(/\n/g, ' '), e = ex ? cleanPara(inl(ex)).replace(/\n/g, ' ') : '';
    return '- [' + (li.classList.contains('is-correct') ? 'x' : ' ') + '] ' + s + (e ? ' | ' + e : '');
  }).join('\n');
}
/* Bildeplassering: klassen img-left/img-right/img-full blir merket {left}/{right}/{full} igjen (leser 1.6) */
function imgMark(im){ var m = (im.className || '').match(/(?:^|\s)img-(left|right|full)(?:\s|$)/); return m ? '{' + m[1] + '}' : ''; }
/* Fargede tabellceller: klassen blir merket {grønn}/{gul}/{rød} igjen (se QUIZ-FORMAT.md) */
var CELL_MARK = {'cell-gronn': 'grønn', 'cell-gul': 'gul', 'cell-rod': 'rød'};
function cellMark(c){ for (var k in CELL_MARK) if (c.classList.contains(k)) return ' {' + CELL_MARK[k] + '}'; return ''; }
function table(tb){
  var rows = $$('tr', tb).filter(function(r){ return r.closest('table') === tb && !SKIP.test(r.className || ''); }), out = [];
  rows.forEach(function(r, i){
    var cells = $$(':scope > th, :scope > td', r).map(function(c){ return cleanPara(inl(c)).replace(/\|/g, '\\|').replace(/\n/g, '<br>') + cellMark(c); });
    out.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) out.push('|' + cells.map(function(){ return ' --- '; }).join('|') + '|');
  });
  return out.join('\n');
}
function htmlToMd(node){ return blocks(node, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

/* ---------- rensing av lagret HTML ---------- */
var OK_TAGS = /^(B|STRONG|I|EM|S|DEL|U|MARK|CODE|A|BR|SPAN|P|DIV|UL|OL|LI|TABLE|THEAD|TBODY|TR|TH|TD|BLOCKQUOTE|PRE|SUP|SUB|IMG|HR)$/;
var OK_ATTR = {A: ['href', 'target', 'rel', 'class', 'title'], IMG: ['src', 'alt', 'class', 'loading'], TH: ['colspan', 'rowspan', 'class'], TD: ['colspan', 'rowspan', 'class'], OL: ['start']};
function sanitizeNode(n){
  $$('*', n).reverse().forEach(function(el){
    if (!OK_TAGS.test(el.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE)$/.test(el.tagName)) el.remove(); else el.replaceWith.apply(el, Array.prototype.slice.call(el.childNodes)); return; }
    var keep = OK_ATTR[el.tagName] || ['class'];
    Array.prototype.slice.call(el.attributes).forEach(function(at){ if (keep.indexOf(at.name) < 0) el.removeAttribute(at.name); });
    ['href', 'src'].forEach(function(k){ var v = el.getAttribute(k); if (v && /^\s*(javascript|vbscript|data:text)/i.test(v)) el.removeAttribute(k); });
    if (SKIP.test(el.className || '')) { el.remove(); return; }
    if (el.classList.contains('rm-hidden')) { el.classList.remove('rm-hidden'); if (!el.className) el.removeAttribute('class'); }
  });
}
function sanitize(html){ var t = document.createElement('template'); t.innerHTML = String(html || ''); sanitizeNode(t.content); return t.innerHTML; }

/* ---------- ord-diff ---------- */
function tok(s){ return String(s).match(/\s+|[^\s]+/g) || []; }
function wordDiff(a, b){
  var A = tok(a), B = tok(b), p = 0, ea = A.length, eb = B.length, ops = [];
  while (p < ea && p < eb && A[p] === B[p]) p++;
  while (ea > p && eb > p && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  function push(t, s){ if (!s) return; var l = ops[ops.length - 1]; if (l && l.t === t) l.s += s; else ops.push({t: t, s: s}); }
  push('=', A.slice(0, p).join(''));
  var X = A.slice(p, ea), Y = B.slice(p, eb), n = X.length, m = Y.length;
  if (n * m > 400000) { push('-', X.join('')); push('+', Y.join('')); }
  else {
    var L = [], i, j;
    for (i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = X[i] === Y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (X[i] === Y[j]) { push('=', X[i]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { push('-', X[i]); i++; }
      else { push('+', Y[j]); j++; }
    }
    while (i < n) push('-', X[i++]);
    while (j < m) push('+', Y[j++]);
  }
  push('=', A.slice(ea).join(''));
  return ops;
}
function diffHtml(a, b){
  var ops = wordDiff(a, b);
  return ops.map(function(o, k){
    if (o.t === '-') return '<del class="df-del">' + esc(o.s) + '</del>';
    if (o.t === '+') return '<ins class="df-ins">' + esc(o.s) + '</ins>';
    var s = o.s;
    if (s.length > 220) s = (k === 0 ? '... ' + s.slice(-90) : (k === ops.length - 1 ? s.slice(0, 90) + ' ...' : s.slice(0, 80) + ' ... ' + s.slice(-80)));
    return esc(s);
  }).join('');
}

/* ---------- visning ---------- */
var ORIG = {};
function bodyOf(el){ return el.querySelector(':scope > .nb-body'); }
function prepare(el){
  var num = el.querySelector(':scope > .nb-num');
  var body = document.createElement(/^(P|H[1-6])$/.test(el.tagName) ? 'span' : 'div'); body.className = 'nb-body';
  var n = num ? num.nextSibling : el.firstChild;
  while (n) { var nx = n.nextSibling; body.appendChild(n); n = nx; }
  el.appendChild(body);
  ORIG[el.id] = {html: body.innerHTML, md: htmlToMd(body), text: normText(body.textContent)};
  el.setAttribute('data-orig', ORIG[el.id].md);
  var ref = el.getAttribute('data-ref');
  var b = document.createElement('button'); b.type = 'button'; b.className = 'cm-btn'; b.dataset.a = el.id;
  b.title = 'Kommentar til ' + ref;
  b.innerHTML = '<i class="fa-regular fa-comment"></i><span class="cm-count"></span>'; el.appendChild(b);
  if (isRemovable(el)) {
    var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'rm-btn'; rb.dataset.a = el.id;
    rb.title = 'Fjern ' + ref; rb.setAttribute('aria-label', 'Fjern ' + ref);
    rb.innerHTML = '<i class="fa-regular fa-trash-can"></i>'; el.appendChild(rb);
  }
  setEditable(el, body);
}
function render(id){
  if (ED) finishEdit();
  hideLinkPop(); closeLightbox();
  var d = V.docs[id]; current = id; ORIG = {};
  var cr = '<nav aria-label="brødsmulesti"><ol class="breadcrumb small mb-2">';
  cr += '<li class="breadcrumb-item"><a href="#d-' + esc(V.start) + '" title="Start"><i class="fa-solid fa-house"></i></a></li>';
  d.cr.forEach(function(c){ cr += '<li class="breadcrumb-item">' + esc(c) + '</li>'; });
  cr += '<li class="breadcrumb-item active" aria-current="page">' + esc(d.t) + '</li></ol></nav>';
  var pn = '<nav class="prevnext d-flex justify-content-between gap-2 mt-5 pt-3 border-top">';
  pn += d.prev ? '<a class="btn btn-outline-secondary btn-sm text-start" href="#d-' + esc(d.prev) + '"><i class="fa-solid fa-arrow-left me-1"></i>Forrige: ' + esc(V.docs[d.prev].t) + '</a>' : '<span></span>';
  pn += d.next ? '<a class="btn btn-outline-secondary btn-sm text-end" href="#d-' + esc(d.next) + '">Neste: ' + esc(V.docs[d.next].t) + '<i class="fa-solid fa-arrow-right ms-1"></i></a>' : '<span></span>';
  pn += '</nav>';
  art.innerHTML = cr + d.h + pn;
  $$('[data-ref]', art).forEach(prepare);
  var c = loadC();
  Object.keys(c).forEach(function(a){ if (c[a].ch && ORIG[a]) applyItem(document.getElementById(a), c); });
  hydrateQuiz(art);
  refreshRemovals(c);
  updateCounts(); markNav(id); lbPrep(art);
  document.title = d.t + ' - RTTI-kurs';
  scroller().scrollTop = 0;
}
function isConflict(a, ch){ return !!(ch && ORIG[a] && ch.oldText !== ORIG[a].text); }
function applyItem(el, c){
  if (!el || !ORIG[el.id]) return;
  c = c || loadC();
  var a = el.id, ch = (c[a] || {}).ch, body = bodyOf(el), o = ORIG[a];
  el.classList.remove('ed-showalt');
  if (!ch) { if (body.innerHTML !== o.html) body.innerHTML = o.html; }
  else body.innerHTML = isConflict(a, ch) ? o.html : sanitize(ch.html);
  updateFlag(el, c, true);
  hydrateQuiz(el);
}
function setChip(chip, why){
  chip.innerHTML = why ? '<i class="fa-regular fa-comment-dots me-1"></i>' + esc(why) : '<i class="fa-solid fa-plus me-1"></i>Begrunnelse';
  chip.classList.toggle('has', !!why);
  chip.title = why ? 'Begrunnelse: ' + why + ' (klikk for å endre)' : 'Legg til en kort begrunnelse (valgfritt)';
}
/* Oppdaterer merket under elementet uten å røre teksten (markøren blir stående) */
function updateFlag(el, c, force){
  if (!el || !ORIG[el.id]) return;
  c = c || loadC();
  var a = el.id, ch = (c[a] || {}).ch, conflict = !!ch && isConflict(a, ch), state = !ch ? '' : (conflict ? 'conf' : 'ch');
  var f = el.querySelector(':scope > .ed-flag');
  el.classList.toggle('ed-changed', state === 'ch'); el.classList.toggle('ed-conflict', state === 'conf');
  if (!state) { el.classList.remove('ed-showalt'); if (f) f.remove(); return; }
  var when = new Date(ch.ts).toLocaleString('nb-NO');
  if (f && f.dataset.state === state && !force) {
    if (f.querySelector('.ed-why-in')) return;
    var bd = f.querySelector('.badge'); if (bd && state === 'ch') bd.title = 'Endret ' + when + (ch.why ? ' - ' + ch.why : '');
    var chip = f.querySelector('.ed-why-chip'); if (chip) setChip(chip, ch.why);
    var tg = f.querySelector('[data-act="toggle"]'); if (tg && !el.classList.contains('ed-showalt')) tg.textContent = state === 'conf' ? 'Vis min versjon' : 'Vis original';
    return;
  }
  if (f) f.remove();
  f = document.createElement('span'); f.className = 'ed-flag'; f.contentEditable = 'false'; f.dataset.state = state;
  f.innerHTML = conflict
    ? '<span class="badge text-bg-danger" title="Originalteksten i kilden er endret etter at du lagret endringen (' + esc(when) + '). Endringen vises ikke automatisk."><i class="fa-solid fa-triangle-exclamation me-1"></i>Kilde endret siden</span>' +
      '<button type="button" class="btn btn-link btn-sm" data-act="toggle">Vis min versjon</button><button type="button" class="btn btn-link btn-sm text-danger" data-act="undo">Forkast</button>'
    : '<span class="badge text-bg-success" title="Endret ' + esc(when) + (ch.why ? ' - ' + esc(ch.why) : '') + '"><i class="fa-solid fa-pen me-1"></i>endret</span>' +
      '<button type="button" class="ed-why-chip" data-act="why"></button>' +
      '<button type="button" class="btn btn-link btn-sm" data-act="toggle">Vis original</button><button type="button" class="btn btn-link btn-sm text-danger" data-act="undo">Angre</button>';
  var chp = f.querySelector('.ed-why-chip'); if (chp) setChip(chp, ch.why);
  el.insertBefore(f, bodyOf(el).nextSibling);
}
function toggleView(el, btn){
  var a = el.id, ch = (loadC()[a] || {}).ch; if (!ch) return;
  var conflict = el.classList.contains('ed-conflict'), alt = !el.classList.contains('ed-showalt');
  el.classList.toggle('ed-showalt', alt);
  var showStored = conflict ? alt : !alt;
  bodyOf(el).innerHTML = showStored ? sanitize(ch.html) : ORIG[a].html;
  hydrateQuiz(el);
  btn.textContent = conflict ? (alt ? 'Vis kildeteksten' : 'Vis min versjon') : (alt ? 'Vis endring' : 'Vis original');
  refreshRemovals();
}
function undoChange(a){
  var c = loadC(), e = c[a]; if (!e || !e.ch) return;
  var ref = e.ref; delete e.ch; prune(c, a); saveC(c);
  var el = document.getElementById(a); if (el && ORIG[a]) { applyItem(el, c); refreshRemovals(c); }
  toast('Endringen i ' + ref + ' er angret');
}
function flash(el){ el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); }
function route(){
  var h = decodeURIComponent(location.hash.slice(1));
  if (h === 'hjelp') h = 'd-H';
  var parts = h.split('-'), type = parts[0], doc = parts[1];
  if (!h || !V.docs[doc] || 'dsp'.indexOf(type) < 0 || type.length !== 1) { if (!current) render(V.start); return; }
  if (current !== doc) render(doc);
  if (type === 'd') { scroller().scrollTop = 0; return; }
  var el = document.getElementById(h);
  if (el) {
    while (el && el !== art && el.closest('.rm-hidden')) el = el.previousElementSibling || el.parentNode;
    if (!el || el === art) return;
    var det = el.closest('details'); if (det) det.open = true; el.scrollIntoView({block: 'start'}); flash(el); spy();
  }
}
window.addEventListener('hashchange', route);

/* ---------- flervalgsquiz (```quiz i Markdown, se QUIZ-FORMAT.md) ---------- */
/* Bygget lager div.quiz > div.quiz-q > p.quiz-stem + ul.quiz-opts > li.quiz-opt[.is-correct] > span.quiz-txt + span.quiz-expl.
   Hvert div.quiz-q er ett ¶. Her legges radioknapper og merker til hvert spørsmål, og én linje med «Sjekk», resultat og
   «Prøv igjen» nederst i hver div.quiz (1.3: én Sjekk per quiz). Alt dette har klasser i SKIP og blir aldri med i
   originalteksten, endringer eller eksporten. Kalles etter prepare() og hver gang innholdet byttes ut. */
function hydrateQuiz(scope){
  if (!scope) return;
  var single = scope.classList && scope.classList.contains('quiz-q');
  var qs = single ? [scope] : $$('.quiz-q', scope);
  qs.forEach(function(q){
    var nm = 'quiz-' + (q.id || ('x' + Math.random().toString(36).slice(2)));
    $$('.quiz-opt', q).forEach(function(li, i){
      if (li.querySelector(':scope > .quiz-radio')) return;
      var r = document.createElement('input'); r.type = 'radio'; r.className = 'quiz-radio form-check-input'; r.name = nm; r.value = String(i);
      r.contentEditable = 'false'; r.setAttribute('aria-label', normText((li.querySelector('.quiz-txt') || li).textContent));
      li.insertBefore(r, li.firstChild);
    });
  });
  var quizzes = single ? [scope.closest('.quiz')] : (scope.classList && scope.classList.contains('quiz') ? [scope] : $$('.quiz', scope));
  quizzes.forEach(function(z){
    if (!z) return;
    if (!z.querySelector(':scope > .quiz-actions')) {
      z.classList.remove('quiz-done');
      var act = document.createElement('div'); act.className = 'quiz-actions'; act.contentEditable = 'false';
      act.innerHTML = '<button type="button" class="btn btn-sm btn-primary quiz-check"><i class="fa-solid fa-check me-1"></i>Sjekk</button>' +
        '<span class="quiz-result d-none" role="status"></span>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary quiz-reset d-none"><i class="fa-solid fa-rotate-left me-1"></i>Prøv igjen</button>';
      z.appendChild(act);
    } else if (single && z.classList.contains('quiz-done')) resetQuiz(z);   /* et spørsmål er byttet ut etter sjekk */
  });
}
function quizMark(ok){
  var m = document.createElement('span'); m.className = 'quiz-mark'; m.contentEditable = 'false';
  m.innerHTML = ok ? '<i class="fa-solid fa-circle-check text-success" title="Riktig svar"></i><span class="visually-hidden">Riktig svar: </span>'
                   : '<i class="fa-solid fa-circle-xmark text-danger" title="Feil svar"></i><span class="visually-hidden">Feil svar: </span>';
  return m;
}
function checkQuiz(z, focus){
  if (z.classList.contains('quiz-done')) return;
  z.classList.add('quiz-done');
  var n = 0, right = 0;
  $$('.quiz-q', z).forEach(function(q){
    if (q.classList.contains('rm-hidden') || q.closest('.rm-hidden')) return;   /* fjernet spørsmål telles ikke */
    n++;
    var answered = false;
    $$('.quiz-opt', q).forEach(function(li){
      var r = li.querySelector(':scope > .quiz-radio'), chosen = !!(r && r.checked), ok = li.classList.contains('is-correct');
      if (r) r.disabled = true;
      if (chosen) { answered = true; if (ok) right++; }
      if (ok || chosen) li.insertBefore(quizMark(ok), r ? r.nextSibling : li.firstChild);
      if (chosen) li.classList.add('quiz-show', ok ? 'quiz-right' : 'quiz-wrong');
    });
    if (!answered) {
      var ul = q.querySelector('.quiz-opts'), note = document.createElement('span');
      note.className = 'quiz-note'; note.contentEditable = 'false';
      note.innerHTML = '<i class="fa-solid fa-circle-exclamation me-1"></i>Ikke besvart';
      if (ul) ul.parentNode.insertBefore(note, ul.nextSibling); else q.appendChild(note);
    }
  });
  var c = z.querySelector(':scope > .quiz-actions .quiz-check'), rs = z.querySelector(':scope > .quiz-actions .quiz-reset'),
      res = z.querySelector(':scope > .quiz-actions .quiz-result');
  if (res) { res.textContent = right + ' av ' + n + ' riktige'; res.classList.remove('d-none'); }
  if (c) c.classList.add('d-none');
  if (rs) { rs.classList.remove('d-none'); if (focus) rs.focus(); }
}
function resetQuiz(z, focus){
  z.classList.remove('quiz-done');
  $$('.quiz-mark, .quiz-note', z).forEach(function(m){ m.remove(); });
  $$('.quiz-opt', z).forEach(function(li){ li.classList.remove('quiz-show', 'quiz-right', 'quiz-wrong'); });
  $$('.quiz-radio', z).forEach(function(r){ r.disabled = false; r.checked = false; });
  var c = z.querySelector(':scope > .quiz-actions .quiz-check'), rs = z.querySelector(':scope > .quiz-actions .quiz-reset'),
      res = z.querySelector(':scope > .quiz-actions .quiz-result');
  if (res) { res.textContent = ''; res.classList.add('d-none'); }
  if (rs) rs.classList.add('d-none');
  if (c) { c.classList.remove('d-none'); if (focus) c.focus(); }
}

/* ---------- redigering direkte i teksten ---------- */
/* Hvert tekstelement (.nb-body) er contentEditable i redigeringsmodus. Endringen lagres automatisk:
   når elementet mister fokus, ved Enter, eller etter ca. 1,5 s uten tasting. */
var ED = null, LS_B = 'rttiViewer.editBannerHidden', IDLE_MS = 1500;
function editOn(){ return document.body.classList.contains('edit-mode'); }
function canEdit(el, body){ return !!body && !body.querySelector('pre') && !!normText(body.textContent); }
function setEditable(el, body){
  body = body || bodyOf(el); if (!body) return;
  if (editOn() && canEdit(el, body)) {
    body.contentEditable = 'true'; body.spellcheck = true; body.setAttribute('role', 'textbox');
    body.setAttribute('aria-label', 'Rediger ' + el.getAttribute('data-ref'));
  } else { ['contenteditable', 'spellcheck', 'role', 'aria-label'].forEach(function(k){ body.removeAttribute(k); }); }
}
function setEditMode(on){
  if (!on && ED) { ED.body.blur(); finishEdit(); }
  document.body.classList.toggle('edit-mode', on);
  var t = $('#editToggle'); t.checked = on;
  $('#editState').textContent = on ? 'på' : 'av';
  $('#editBanner').classList.toggle('d-none', !on || kvGet(LS_B) === '1');
  $$('[data-ref]', art).forEach(function(el){ setEditable(el); });
  kvSet(LS_E, on ? '1' : '0');
}
$('#editToggle').addEventListener('change', function(){ setEditMode(this.checked); });
$('#editBannerClose').addEventListener('click', function(){ kvSet(LS_B, '1'); $('#editBanner').classList.add('d-none'); });

var indT = null;
function indicate(msg, kind){
  var s = $('#saveInd'); if (!s) return;
  s.innerHTML = '<i class="fa-solid ' + (kind === 'undo' ? 'fa-rotate-left' : 'fa-check') + ' me-1"></i>' + esc(msg);
  s.classList.toggle('undo', kind === 'undo'); s.classList.add('show');
  clearTimeout(indT); indT = setTimeout(function(){ s.classList.remove('show'); }, 1800);
}
function beginEdit(el){
  if (ED && ED.el === el) return;
  if (ED) finishEdit();
  var body = bodyOf(el);
  ED = {el: el, body: body, ref: el.getAttribute('data-ref'), before: body.innerHTML, saved: body.innerHTML, t: null};
  el.classList.add('editing');
}
/* Lagrer uten å røre teksten mens du skriver (final=false), eller rydder HTML-en når du er ferdig (final=true) */
function commitEdit(final){
  if (!ED) return;
  clearTimeout(ED.t); ED.t = null;
  var el = ED.el, body = ED.body, a = el.id, o = ORIG[a], ref = ED.ref;
  if (!o || body.innerHTML === ED.saved) return;
  var cl = body.cloneNode(true); sanitizeNode(cl);
  var html = cl.innerHTML, md = htmlToMd(cl);
  var c = loadC(), e = c[a] || newEntry(a), prev = e.ch;
  if (md === o.md) {
    delete e.ch; c[a] = e; prune(c, a); saveC(c);
    if (prev) indicate('Lik originalen - endringen i ' + ref + ' er fjernet', 'undo');
  } else {
    e.ch = {type: 'endring', ref: ref, old: o.md, oldText: o.text, neu: md, html: html, why: (prev && prev.why) || '', kind: el.tagName.toLowerCase(), ts: Date.now()};
    c[a] = e; saveC(c);
    indicate('Lagret ' + ref);
  }
  if (!el.classList.contains('ed-conflict')) el.classList.remove('ed-showalt');
  if (final && md !== o.md && body.innerHTML !== html) { body.innerHTML = html; hydrateQuiz(el); refreshRemovals(c); }
  ED.saved = body.innerHTML;
  updateFlag(el, c);
}
function finishEdit(){
  if (!ED) return;
  commitEdit(true);
  if (ED) ED.el.classList.remove('editing');
  ED = null;
}
function editableBodyOf(node){ var b = node && node.closest && node.closest('.nb-body'); return b && b.isContentEditable ? b : null; }
function openLink(lk){
  var h = lk.getAttribute('href') || ''; if (!h) return;
  if (h.charAt(0) === '#') { if (ED) ED.body.blur(); location.hash = h; }
  else window.open(lk.href, '_blank', 'noopener');
}
function openWhy(el, chip){
  var ch = (loadC()[el.id] || {}).ch; if (!ch) return;
  var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'form-control form-control-sm ed-why-in';
  inp.maxLength = 300; inp.placeholder = 'Hvorfor? (valgfritt, kort) - Enter lagrer'; inp.value = ch.why || ''; inp.dataset.a = el.id;
  chip.replaceWith(inp); inp.focus(); inp.select();
}
function setWhy(a, v){
  var c = loadC(), e = c[a]; v = String(v || '').replace(/\s+/g, ' ').trim();
  if (e && e.ch && (e.ch.why || '') !== v) { e.ch.why = v; saveC(c); indicate((v ? 'Begrunnelse lagret for ' : 'Begrunnelse fjernet for ') + e.ref); }
  var el = document.getElementById(a); if (el && ORIG[a]) updateFlag(el, c, true);
}

art.addEventListener('focusin', function(ev){
  var b = ev.target;
  if (b && b.classList && b.classList.contains('nb-body') && b.isContentEditable) beginEdit(b.parentNode);
});
art.addEventListener('focusout', function(ev){
  var t = ev.target;
  if (ED && t === ED.body) { finishEdit(); return; }
  if (t && t.classList && t.classList.contains('ed-why-in')) {
    if (t.dataset.cancel) { var el = document.getElementById(t.dataset.a); if (el) updateFlag(el, null, true); }
    else setWhy(t.dataset.a, t.value);
  }
});
art.addEventListener('input', function(ev){
  if (!ED || !ED.body.contains(ev.target)) return;
  clearTimeout(ED.t); ED.t = setTimeout(function(){ commitEdit(false); }, IDLE_MS);
});
art.addEventListener('click', function(ev){
  var qb = ev.target.closest('.quiz-check, .quiz-reset');
  if (qb) { ev.preventDefault(); var qq = qb.closest('.quiz'); if (qq) (qb.classList.contains('quiz-check') ? checkQuiz : resetQuiz)(qq, true); return; }
  var qo = ev.target.closest('.quiz-opt');
  if (qo && !qo.closest('.editing') && !(ev.target.closest('.nb-body') || {}).isContentEditable) {
    var qr = qo.querySelector(':scope > .quiz-radio'); if (qr && !qr.disabled && ev.target !== qr && !ev.target.closest('a')) qr.checked = true;
  }
  var ru = ev.target.closest('[data-rm-undo]');
  if (ru) { ev.preventDefault(); undoRemove(ru.dataset.rmUndo); return; }
  var ra = ev.target.closest('[data-rm-again]');
  if (ra) { ev.preventDefault(); removeAgain(ra.dataset.rmAgain); return; }
  var rbt = ev.target.closest('.rm-btn');
  if (rbt) { ev.preventDefault(); var rel = document.getElementById(rbt.dataset.a); if (rel) openRemove(rel); return; }
  var lk = ev.target.closest('a');
  if (lk && editableBodyOf(lk)) { ev.preventDefault(); if (ev.ctrlKey || ev.metaKey) openLink(lk); return; }
  var num = ev.target.closest('.nb-num');
  if (num) {
    ev.preventDefault();
    var el = num.parentNode, ref = el.getAttribute('data-ref');
    history.replaceState(null, '', '#' + el.id);
    flash(el);
    copyText(ref).then(function(){ toast('Kopiert: ' + ref, location.href); });
    return;
  }
  var cb = ev.target.closest('.cm-btn');
  if (cb) { ev.preventDefault(); openComment(cb.dataset.a); return; }
  var act = ev.target.closest('[data-act]');
  if (act) {
    ev.preventDefault();
    var item = act.closest('.nb'), k = act.dataset.act;
    if (k === 'toggle') toggleView(item, act);
    else if (k === 'undo') undoChange(item.id);
    else if (k === 'why') openWhy(item, act);
  }
});
art.addEventListener('keydown', function(ev){
  if (ED && ED.body.contains(ev.target)) {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      ev.preventDefault(); clearTimeout(ED.t);
      var changed = ED.body.innerHTML !== ED.before, ref = ED.ref;
      ED.body.innerHTML = ED.before; ED.body.blur(); if (ED) finishEdit();
      if (changed) indicate('Angret i ' + ref, 'undo');
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.shiftKey && !/^H[1-6]$/.test(ED.el.tagName)) document.execCommand('insertLineBreak');
      else if (!ev.shiftKey) ED.body.blur();
    }
    return;
  }
  var wi = ev.target.classList && ev.target.classList.contains('ed-why-in') ? ev.target : null;
  if (wi) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); wi.blur(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); wi.dataset.cancel = '1'; wi.blur(); }
  }
});
art.addEventListener('paste', function(ev){
  if (!ED || !ED.body.contains(ev.target)) return;
  ev.preventDefault();
  var t = (ev.clipboardData || window.clipboardData).getData('text/plain') || '';
  document.execCommand('insertText', false, t.replace(/\s*\r?\n\s*/g, ' '));
});
art.addEventListener('drop', function(ev){ if (editableBodyOf(ev.target)) ev.preventDefault(); });
window.addEventListener('pagehide', function(){ if (ED) commitEdit(false); });
window.addEventListener('beforeunload', function(){ if (ED) commitEdit(false); });
document.addEventListener('visibilitychange', function(){ if (document.hidden && ED) commitEdit(false); });

/* liten knapp «Åpne lenke» over lenker i tekst som kan redigeres */
var lp = $('#linkPop'), lpLink = null, lpT = null;
function showLinkPop(lk){
  lpLink = lk; clearTimeout(lpT);
  lp.title = lk.getAttribute('href') || '';
  lp.classList.remove('d-none');
  var r = lk.getBoundingClientRect();
  lp.style.left = Math.max(4, Math.min(r.left, window.innerWidth - lp.offsetWidth - 4)) + 'px';
  lp.style.top = (r.top - lp.offsetHeight - 4 < 4 ? r.bottom + 4 : r.top - lp.offsetHeight - 4) + 'px';
}
function hideLinkPop(){ clearTimeout(lpT); lp.classList.add('d-none'); lpLink = null; }
art.addEventListener('mouseover', function(ev){ var lk = ev.target.closest && ev.target.closest('a'); if (lk && editableBodyOf(lk)) showLinkPop(lk); });
art.addEventListener('mouseout', function(ev){ var lk = ev.target.closest && ev.target.closest('a'); if (lk && lk === lpLink) { clearTimeout(lpT); lpT = setTimeout(hideLinkPop, 800); } });
lp.addEventListener('mouseenter', function(){ clearTimeout(lpT); });
lp.addEventListener('mouseleave', function(){ lpT = setTimeout(hideLinkPop, 300); });
lp.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
lp.addEventListener('click', function(){ var l = lpLink; hideLinkPop(); if (l) openLink(l); });
document.addEventListener('selectionchange', function(){
  if (!ED) return;
  var s = window.getSelection(); if (!s || !s.rangeCount) return;
  var n = s.anchorNode; n = n && (n.nodeType === 3 ? n.parentNode : n);
  var lk = n && n.closest ? n.closest('a') : null;
  if (lk && ED.body.contains(lk)) showLinkPop(lk);
  else if (lpLink && !lp.matches(':hover')) hideLinkPop();
  var tr = rowTarget(n);
  if (tr && ED.body.contains(tr)) showRowRm(tr);
});
content.addEventListener('scroll', function(){ if (lpLink) hideLinkPop(); if (rrTr) hideRowRm(); }, {passive: true});
window.addEventListener('scroll', function(){ if (rrTr) hideRowRm(); }, {passive: true});
window.addEventListener('resize', function(){ if (lpLink) hideLinkPop(); if (rrTr) hideRowRm(); });

var spyT = null;
function spy(){
  spyT = null;
  var lim = (wide() ? content.getBoundingClientRect().top : 0) + 90, best = null;
  $$('h2.nb,h3.nb', art).forEach(function(h){ if (h.getBoundingClientRect().top < lim) best = h; });
  $$('.nav-row.spy').forEach(function(r){ r.classList.remove('spy'); });
  if (best && navByAnchor[best.id]) navByAnchor[best.id].classList.add('spy');
}
function onScroll(){ if (!spyT) spyT = setTimeout(spy, 120); }
content.addEventListener('scroll', onScroll); window.addEventListener('scroll', onScroll);

/* ---------- fjerne elementer ---------- */
/* I redigeringsmodus får overskrifter, avsnitt, listepunkter og tabeller et søppelbøttetegn, og tabellrader
   en flytende knapp. Fjerningen er et forslag: elementet skjules, og en plassholder med «Angre» står igjen. */
function isRemovable(el){ return !!el && el.classList.contains('nb') && !el.classList.contains('doc-title') && /^(P|DIV|LI|H[2-6])$/.test(el.tagName); }
function headLevel(el){ var m = /^H([1-6])$/.exec((el && el.tagName) || ''); return m ? +m[1] : 0; }
/* Seksjonen under en overskrift: alt fram til neste overskrift på samme eller høyere nivå */
function sectionNodes(h){
  var lv = headLevel(h), out = [], n = h.nextElementSibling;
  while (n) {
    var l = headLevel(n);
    if ((l && l <= lv) || /(^|\s)(hidden-meta|editor-notes|prevnext)(\s|$)/.test(n.className || '')) break;
    out.push(n); n = n.nextElementSibling;
  }
  return out;
}
function refsIn(nodes){
  var r = [];
  nodes.forEach(function(n){ if (n.hasAttribute('data-ref')) r.push(n); else $$('[data-ref]', n).forEach(function(x){ r.push(x); }); });
  return r;
}
function tableOf(el){ var b = bodyOf(el); return b ? b.querySelector('table') : null; }
function rowsOf(tb){ return $$('tr', tb).filter(function(r){ return r.closest('table') === tb && !r.classList.contains('rm-ph'); }); }
function rowMd(tr){
  var cells = $$(':scope > th, :scope > td', tr).map(function(c){ return cleanPara(inl(c)).replace(/\|/g, '\\|').replace(/\n/g, '<br>'); });
  return '| ' + cells.join(' | ') + ' |';
}
/* Originalelementet fra bygget (uten nummer), også for dokumenter som ikke er åpne */
var ORIG_N = {};
function origNode(a){
  if (ORIG[a]) { var t = document.createElement('template'); t.innerHTML = ORIG[a].html; return t.content; }
  if (ORIG_N[a] !== undefined) return ORIG_N[a];
  var info = IDX[a], d = info && V.docs[info.doc];
  if (!d) return (ORIG_N[a] = null);
  var t2 = document.createElement('template'); t2.innerHTML = d.h;
  var el = null;
  $$('[data-ref]', t2.content).some(function(x){ if (x.id === a) { el = x; return true; } return false; });
  return (ORIG_N[a] = el);
}
function origRow(a, idx){ var n = origNode(a), tb = n ? n.querySelector('table') : null, rows = tb ? rowsOf(tb) : []; return rows[idx] || null; }
function rmConflict(k, rm){
  if (!rm) return false;
  var a = baseA(k);
  if (rm.scope === 'row') { var r = origRow(a, rm.row); return !r || normText(r.textContent) !== rm.oldText; }
  var o = origFor(a); if (!o || o.text !== rm.oldText) return true;
  if (rm.scope === 'sec') return (rm.parts || []).some(function(p){ var q = origFor(p.a); return !q || q.text !== p.text; });
  return false;
}
function rmLabel(rm){ return {el: 'fjernet', head: 'Fjern overskrift', sec: 'hele seksjonen', row: 'tabellrad'}[rm.scope] || 'fjernet'; }
function cut(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 4) + ' ...' : s; }
function hashes(kind){ var m = /^h([1-6])$/.exec(kind || ''); return m ? new Array(+m[1] + 1).join('#') + ' ' : ''; }

function clearRemovals(){
  $$('.rm-ph', art).forEach(function(n){ n.remove(); });
  $$('.rm-flag', art).forEach(function(n){ n.remove(); });
  $$('.rm-hidden', art).forEach(function(n){ n.classList.remove('rm-hidden'); });
}
function placeholder(k, rm, first, hidden){
  var tag = first.tagName === 'LI' ? 'li' : (first.tagName === 'TR' ? 'tr' : 'div');
  var ph = document.createElement(tag); ph.className = 'rm-ph' + (hidden ? ' rm-hidden' : ''); ph.contentEditable = 'false'; ph.dataset.k = k;
  var extra = rm.scope === 'sec' ? ' (hele seksjonen, ' + (1 + (rm.parts || []).length) + ' elementer)' : (rm.scope === 'head' ? ' (bare overskriften, innholdet under står igjen)' : '');
  var inner = '<i class="fa-regular fa-trash-can me-1"></i><span class="fw-semibold">Fjernet</span> <span class="font-monospace">' + esc(rm.ref) + '</span>' + esc(extra) +
    ' <span class="rm-snip">«' + esc(cut(rm.oldText, 90)) + '»</span>' + (rm.why ? ' <span class="rm-why" title="Hvorfor?"><i class="fa-regular fa-comment-dots me-1"></i>' + esc(rm.why) + '</span>' : '') +
    ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" data-rm-undo="' + esc(k) + '">Angre</button>';
  if (tag === 'tr') { var td = document.createElement('td'); td.colSpan = Math.max(1, first.children.length); td.innerHTML = inner; ph.appendChild(td); }
  else ph.innerHTML = inner;
  first.parentNode.insertBefore(ph, first);
}
function addRmFlag(el, k, rm){
  var f = document.createElement('span'); f.className = 'rm-flag'; f.contentEditable = 'false'; f.dataset.k = k;
  f.innerHTML = '<span class="badge text-bg-danger" title="Originalteksten i kilden er endret etter at du fjernet den. Fjerningen brukes ikke automatisk."><i class="fa-solid fa-triangle-exclamation me-1"></i>Kilde endret siden</span>' +
    '<span>Fjerning av <span class="font-monospace">' + esc(rm.ref) + '</span> er ikke brukt.</span>' +
    '<button type="button" class="btn btn-link btn-sm" data-rm-again="' + esc(k) + '">Fjern likevel</button>' +
    '<button type="button" class="btn btn-link btn-sm text-danger" data-rm-undo="' + esc(k) + '">Forkast</button>';
  var b = bodyOf(el); el.insertBefore(f, b ? b.nextSibling : null);
}
function applyRemoval(k, rm){
  var a = baseA(k), el = document.getElementById(a); if (!el) return;
  if (rmConflict(k, rm)) { addRmFlag(el, k, rm); return; }
  var targets;
  if (rm.scope === 'row') {
    var tb = tableOf(el), tr = tb ? rowsOf(tb)[rm.row] : null;
    if (!tr) { addRmFlag(el, k, rm); return; }
    targets = [tr];
  } else if (rm.scope === 'sec') targets = [el].concat(sectionNodes(el));
  else targets = [el];
  placeholder(k, rm, targets[0], !!targets[0].closest('.rm-hidden'));
  targets.forEach(function(t){ t.classList.add('rm-hidden'); });
}
/* Legger alle lagrede fjerninger for det åpne dokumentet over teksten (først hele seksjoner) */
function refreshRemovals(c){
  c = c || loadC();
  clearRemovals();
  var keys = sortedAnchors(c).filter(function(k){ return c[k].rm && ORIG[baseA(k)]; });
  keys.filter(function(k){ return c[k].rm.scope === 'sec'; }).concat(keys.filter(function(k){ return c[k].rm.scope !== 'sec'; }))
    .forEach(function(k){ applyRemoval(k, c[k].rm); });
}
function normWhy(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
function buildRm(a, scope, row, ref, why){
  var el = document.getElementById(a), o = ORIG[a]; if (!el || !o) return null;
  var rm = {type: 'fjernet', ref: ref, scope: scope, kind: el.tagName.toLowerCase(), why: why || '', ts: Date.now()};
  if (scope === 'row') {
    var r = origRow(a, row); if (!r) return null;
    rm.row = row; rm.kind = 'tr'; rm.old = rowMd(r); rm.oldText = normText(r.textContent);
  } else {
    rm.old = o.md; rm.oldText = o.text;
    if (scope === 'sec') rm.parts = refsIn(sectionNodes(el)).filter(function(x){ return ORIG[x.id]; })
      .map(function(x){ return {a: x.id, ref: x.getAttribute('data-ref'), old: ORIG[x.id].md, text: ORIG[x.id].text}; });
  }
  return rm;
}
var rmModal = null, RM = null;
function openRemove(el, tr){
  if (!el || !ORIG[el.id]) return;
  if (ED) { ED.body.blur(); finishEdit(); }
  hideRowRm(); hideLinkPop();
  var a = el.id, ref = el.getAttribute('data-ref'), hl = headLevel(el), q, snip;
  if (tr) {
    var idx = rowsOf(tableOf(el)).indexOf(tr); if (idx < 1) return;
    var orow = origRow(a, idx);
    RM = {a: a, k: a + '::r' + idx, scope: 'row', row: idx, ref: ref + ' rad ' + idx};
    q = 'Fjern denne tabellraden?'; snip = orow ? normText(orow.textContent) : normText(tr.textContent);
  } else {
    RM = {a: a, k: a, scope: hl ? 'head' : 'el', row: 0, ref: ref};
    q = hl ? 'Fjern denne overskriften?' : (el.tagName === 'LI' ? 'Fjern dette listepunktet?' : 'Fjern dette avsnittet?');
    snip = ORIG[a].text;
  }
  $('#rmQ').textContent = q; $('#rmRef').textContent = RM.ref; $('#rmSnip').textContent = cut(snip, 400);
  $('#rmWhy').value = '';
  $('#rmScope').classList.toggle('d-none', !hl);
  if (hl) {
    var n = refsIn(sectionNodes(el)).length;
    $('#rmScopeHead').checked = true;
    $('#rmSecInfo').textContent = '(overskriften og ' + n + (n === 1 ? ' element' : ' elementer') + ' fram til neste overskrift på samme eller høyere nivå)';
  }
  if (!rmModal) rmModal = bootstrap.Modal.getOrCreateInstance($('#rmModal'));
  rmModal.show();
}
function doRemove(){
  if (!RM) return;
  var scope = RM.scope === 'head' && $('#rmScopeSec').checked ? 'sec' : RM.scope;
  var rm = buildRm(RM.a, scope, RM.row, RM.ref, normWhy($('#rmWhy').value));
  if (!rm) { toast('Kunne ikke fjerne ' + RM.ref); return; }
  var c = loadC(), k = RM.k, e = c[k] || newEntry(RM.a);
  e.ref = k === RM.a ? e.ref : RM.ref; e.rm = rm; c[k] = e; saveC(c);
  refreshRemovals(c);
  RM = null; rmModal.hide();
  indicate('Fjernet ' + rm.ref + (scope === 'sec' ? ' (hele seksjonen)' : ''), 'undo');
}
function undoRemove(k){
  if (ED) { ED.body.blur(); finishEdit(); }
  var c = loadC(), e = c[k]; if (!e || !e.rm) return;
  var ref = e.rm.ref; delete e.rm; prune(c, k); saveC(c);
  if (ORIG[baseA(k)]) {
    refreshRemovals(c);
    var el = document.getElementById(baseA(k)); if (el && !el.closest('.rm-hidden')) flash(el);
  }
  indicate('Angret fjerning av ' + ref, 'undo');
}
/* «Kilde endret siden»: lag fjerningen på nytt med dagens kildetekst */
function removeAgain(k){
  var c = loadC(), e = c[k]; if (!e || !e.rm) return;
  var old = e.rm, rm = buildRm(baseA(k), old.scope, old.row, old.ref, old.why);
  if (!rm) { toast('Fant ikke ' + old.ref + ' i kilden lenger. Bruk «Forkast».'); return; }
  e.rm = rm; saveC(c); refreshRemovals(c); indicate('Fjernet ' + rm.ref, 'undo');
}
function setRmWhy(k, v){
  var c = loadC(), e = c[k]; v = normWhy(v);
  if (e && e.rm && (e.rm.why || '') !== v) { e.rm.why = v; saveC(c); indicate((v ? 'Begrunnelse lagret for ' : 'Begrunnelse fjernet for ') + e.rm.ref); if (ORIG[baseA(k)]) refreshRemovals(c); }
}
$('#rmGo').addEventListener('click', doRemove);
$('#rmWhy').addEventListener('keydown', function(ev){ if (ev.key === 'Enter') { ev.preventDefault(); doRemove(); } });
$('#rmModal').addEventListener('shown.bs.modal', function(){ $('#rmGo').focus(); });
$('#rmModal').addEventListener('hidden.bs.modal', function(){ RM = null; });

/* flytende knapp for å fjerne en tabellrad (ikke overskriftsraden) */
var rr = $('#rowRm'), rrTr = null, rrT = null;
function rowTarget(n){
  if (!editOn() || !n || !n.closest) return null;
  var tr = n.closest('tr'); if (!tr || !art.contains(tr) || tr.classList.contains('rm-ph') || tr.closest('.rm-hidden')) return null;
  var el = tr.closest('.nb'), tb = tr.closest('table');
  if (!el || el.tagName !== 'DIV' || !ORIG[el.id] || tb !== tableOf(el)) return null;
  if (tr.parentNode.tagName === 'THEAD' || rowsOf(tb).indexOf(tr) < 1) return null;
  return tr;
}
function showRowRm(tr){
  rrTr = tr; clearTimeout(rrT);
  rr.classList.remove('d-none');
  var r = tr.getBoundingClientRect(), tb = tr.closest('table').getBoundingClientRect();
  rr.style.left = Math.max(4, Math.min(tb.right + 4, window.innerWidth - rr.offsetWidth - 4)) + 'px';
  rr.style.top = Math.max(4, r.top + (r.height - rr.offsetHeight) / 2) + 'px';
  rr.title = 'Fjern ' + tr.closest('.nb').getAttribute('data-ref') + ' rad ' + rowsOf(tr.closest('table')).indexOf(tr);
}
function hideRowRm(){ clearTimeout(rrT); rr.classList.add('d-none'); rrTr = null; }
art.addEventListener('mouseover', function(ev){ var tr = rowTarget(ev.target); if (tr) showRowRm(tr); });
art.addEventListener('mouseout', function(ev){ var tr = ev.target.closest && ev.target.closest('tr'); if (tr && tr === rrTr && !(ev.relatedTarget && (tr.contains(ev.relatedTarget) || ev.relatedTarget === rr || rr.contains(ev.relatedTarget)))) { clearTimeout(rrT); rrT = setTimeout(hideRowRm, 700); } });
rr.addEventListener('mouseenter', function(){ clearTimeout(rrT); });
rr.addEventListener('mouseleave', function(){ rrT = setTimeout(hideRowRm, 300); });
rr.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
rr.addEventListener('click', function(){ var tr = rrTr; if (tr && document.contains(tr)) openRemove(tr.closest('.nb'), tr); else hideRowRm(); });

/* ---------- kommentarer ---------- */
var modal = null, mAnchor = null, mEdit = -1;
function docTitle(id){ var d = V.docs[id]; if (!d) return id; return d.t.indexOf(id + ' ') === 0 ? d.t : id + ' ' + d.t; }
function snippetOf(a){ var e = IDX[a]; if (!e) return ''; var t = e.text; return t.length > 160 ? t.slice(0, 157) + ' ...' : t; }
function openComment(a){
  mAnchor = a; mEdit = -1;
  var el = document.getElementById(a), ref = el ? el.getAttribute('data-ref') : (IDX[a] ? IDX[a].ref : a);
  $('#cmRef').textContent = ref; $('#cmSnip').textContent = snippetOf(a);
  $('#cmText').value = ''; $('#cmTextLabel').textContent = 'Ny kommentar';
  renderExisting();
  if (!modal) modal = bootstrap.Modal.getOrCreateInstance($('#cmModal'));
  modal.show();
}
function renderExisting(){
  var c = loadC(), e = c[mAnchor], box = $('#cmExisting');
  if (!e || !e.items.length) { box.innerHTML = ''; return; }
  box.innerHTML = e.items.map(function(it, i){
    return '<div class="cm-item"><div class="cm-text">' + esc(it.t) + '</div><div class="d-flex justify-content-between align-items-center mt-1"><span class="small text-body-secondary">' + esc(new Date(it.ts).toLocaleString('nb-NO')) + '</span><span>' +
      '<button class="btn btn-sm btn-link p-0 me-2" data-edit="' + i + '"><i class="fa-solid fa-pen"></i> Rediger</button>' +
      '<button class="btn btn-sm btn-link text-danger p-0" data-del="' + i + '"><i class="fa-solid fa-trash"></i> Slett</button></span></div></div>';
  }).join('');
}
$('#cmExisting').addEventListener('click', function(ev){
  var b = ev.target.closest('button'); if (!b) return;
  var c = loadC(), e = c[mAnchor]; if (!e) return;
  if (b.dataset.edit !== undefined) { mEdit = +b.dataset.edit; $('#cmText').value = e.items[mEdit].t; $('#cmTextLabel').textContent = 'Rediger kommentar'; $('#cmText').focus(); }
  else if (b.dataset.del !== undefined) { e.items.splice(+b.dataset.del, 1); prune(c, mAnchor); saveC(c); renderExisting(); }
});
function saveComment(){
  var t = $('#cmText').value.trim(); if (!t) { modal.hide(); return; }
  var c = loadC(), e = c[mAnchor] || newEntry(mAnchor);
  if (mEdit >= 0 && e.items[mEdit]) { e.items[mEdit].t = t; e.items[mEdit].ts = Date.now(); } else e.items.push({type: 'kommentar', t: t, ts: Date.now()});
  c[mAnchor] = e; saveC(c); modal.hide(); toast('Kommentar lagret til ' + e.ref);
}
$('#cmSave').addEventListener('click', saveComment);
$('#cmText').addEventListener('keydown', function(ev){ if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); saveComment(); } });
$('#cmModal').addEventListener('shown.bs.modal', function(){ $('#cmText').focus(); });

function stats(c){
  var s = {kom: 0, end: 0, fj: 0, konf: 0, ny: 0}, last = +(kvGet(LS_X) || 0);
  Object.keys(c).forEach(function(a){
    var e = c[a];
    e.items.forEach(function(it){ s.kom++; if ((it.ts || 0) > last) s.ny++; });
    if (e.ch) { s.end++; if ((e.ch.ts || 0) > last) s.ny++; if (conflictAny(a, e.ch)) s.konf++; }
    if (e.rm) { s.fj++; if ((e.rm.ts || 0) > last) s.ny++; }
  });
  return s;
}
function markExported(){ kvSet(LS_X, String(Date.now())); updateCounts(); renderCmList(); }
function updateCounts(){
  var c = loadC(), s = stats(c);
  $('#cmTotal').textContent = s.kom + s.end + s.fj;
  $('#cmTotal').title = s.kom + ' kommentarer, ' + s.end + ' endringer, ' + s.fj + ' fjernet';
  var nb = $('#cmNew'); nb.textContent = s.ny; nb.classList.toggle('d-none', !s.ny);
  nb.title = s.ny + ' ikke eksportert ennå';
  $$('.cm-btn', art).forEach(function(b){
    var e = c[b.dataset.a], n = e ? e.items.length : 0;
    b.classList.toggle('has', n > 0); b.querySelector('.cm-count').textContent = n ? n : '';
    b.querySelector('i').className = n ? 'fa-solid fa-comment' : 'fa-regular fa-comment';
    b.parentNode.classList.toggle('has-cm', n > 0);
  });
}
function sortedAnchors(c){
  function pos(k){ var p = POS[baseA(k)]; if (p === undefined) return 1e9; var m = /::r(\d+)$/.exec(k); return p + (m ? +m[1] / 1e4 : 0); }
  return Object.keys(c).sort(function(x, y){ return pos(x) - pos(y) || (x < y ? -1 : 1); });
}
/* Originaltekst for elementer i dokumenter som ikke er åpne: tolkes fra byggets HTML uten å vises */
var ORIG_X = {};
function origFor(a){
  if (ORIG[a]) return ORIG[a];
  if (ORIG_X[a] !== undefined) return ORIG_X[a];
  var info = IDX[a], d = info && V.docs[info.doc];
  if (!d) return (ORIG_X[a] = null);
  var t = document.createElement('template'); t.innerHTML = d.h;
  $$('[data-ref]', t.content).forEach(function(el){
    if (!(el.id in ORIG_X) && !ORIG[el.id]) {
      var num = el.querySelector(':scope > .nb-num'); if (num) num.remove();
      ORIG_X[el.id] = {md: htmlToMd(el), text: normText(el.textContent)};
    }
  });
  return ORIG_X[a] || (ORIG_X[a] = null);
}
function conflictAny(a, ch){
  if (!ch) return false;
  var o = origFor(a);
  return !o || o.text !== ch.oldText;
}
var cmFilter = 'alle';
$('#cmTabs').addEventListener('click', function(ev){
  var b = ev.target.closest('[data-f]'); if (!b) return; ev.preventDefault();
  cmFilter = b.dataset.f; renderCmList();
});
function renderCmList(){
  var c = loadC(), keys = sortedAnchors(c), box = $('#cmList'), last = +(kvGet(LS_X) || 0);
  var nk = 0, ne = 0, nf = 0, nn = 0;
  keys.forEach(function(a){
    nk += c[a].items.length; if (c[a].ch) ne++; if (c[a].rm) nf++;
    c[a].items.forEach(function(it){ if ((it.ts || 0) > last) nn++; });
    if (c[a].ch && c[a].ch.ts > last) nn++; if (c[a].rm && c[a].rm.ts > last) nn++;
  });
  $$('#cmTabs [data-f]').forEach(function(b){
    b.classList.toggle('active', b.dataset.f === cmFilter);
    var f = b.dataset.f, n = f === 'alle' ? nk + ne + nf : (f === 'kommentar' ? nk : (f === 'fjernet' ? nf : ne));
    b.querySelector('.cnt').textContent = n;
  });
  var un = $('#cmUnexported');
  un.classList.toggle('d-none', !nn);
  un.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>' + nn + (nn === 1 ? ' kommentar, endring eller fjerning er' : ' kommentarer, endringer og fjerninger er') + ' ikke eksportert ennå. De finnes bare i denne nettleseren.' + (last ? ' Sist eksportert ' + esc(new Date(last).toLocaleString('nb-NO')) + '.' : '');
  if (!keys.length) { box.innerHTML = '<p class="text-body-secondary small">Ingen kommentarer eller endringer ennå. Klikk rett i teksten for å endre den (endringen lagres automatisk), klikk på søppelbøtta for å fjerne et element, eller klikk på snakkeboblen til høyre for et avsnitt for å kommentere.</p>'; return; }
  var html = '', lastDoc = null, shown = 0;
  keys.forEach(function(a){
    var e = c[a], rows = '';
    var gone = !IDX[baseA(a)] ? ' <span class="badge text-bg-warning">finnes ikke lenger</span>' : '';
    if (e.rm && (cmFilter === 'alle' || cmFilter === 'fjernet')) {
      var rm = e.rm, rc = rmConflict(a, rm);
      rows += '<div class="cm-item rm-item' + (rc ? ' conflict' : '') + '"><div class="d-flex align-items-center gap-2">' +
        '<i class="fa-regular fa-trash-can ' + (rc ? 'text-danger' : 'text-danger-emphasis') + '" title="Fjernet"></i>' +
        '<a href="#' + esc(baseA(a)) + '" class="font-monospace small">' + esc(rm.ref) + '</a>' + gone +
        (rc ? ' <span class="badge text-bg-danger">Kilde endret siden</span>' : ' <span class="badge text-bg-secondary">' + esc(rmLabel(rm)) + '</span>') +
        '<span class="ms-auto small text-body-secondary">' + esc(new Date(rm.ts).toLocaleString('nb-NO')) + '</span></div>' +
        '<div class="diff"><del class="df-del">' + esc(cut((rm.scope === 'head' || rm.scope === 'sec' ? hashes(rm.kind) : '') + rm.old, 400)) + '</del>' +
        (rm.scope === 'sec' ? '<div class="small text-body-secondary mt-1">+ ' + (rm.parts || []).length + ' elementer i seksjonen</div>' : '') + '</div>' +
        (rm.scope === 'head' ? '<div class="small text-body-secondary">Bare overskriften fjernes. Innholdet under blir stående.</div>' : '') +
        '<div class="input-group input-group-sm mt-1"><span class="input-group-text">Hvorfor?</span><input type="text" class="form-control cm-why-rm" maxlength="300" data-k="' + esc(a) + '" value="' + esc(rm.why || '') + '" placeholder="valgfritt - Enter lagrer"></div>' +
        (rc ? '<div class="small text-danger-emphasis">Originalteksten er endret etter at du fjernet den. Teksten vises igjen til du velger «Fjern likevel» ved elementet.</div>' : '') +
        '<div class="text-end mt-1"><button class="btn btn-sm btn-link p-0 text-danger" data-rmundo="' + esc(a) + '"><i class="fa-solid fa-rotate-left me-1"></i>' + (rc ? 'Forkast' : 'Angre fjerning') + '</button></div></div>';
    }
    if (e.ch && (cmFilter === 'alle' || cmFilter === 'endring')) {
      var ch = e.ch, conf = conflictAny(a, ch);
      rows += '<div class="cm-item ch-item' + (conf ? ' conflict' : '') + '"><div class="d-flex align-items-center gap-2">' +
        '<i class="fa-solid ' + (conf ? 'fa-triangle-exclamation text-danger' : 'fa-pen-to-square text-success') + '" title="Endring"></i>' +
        '<a href="#' + esc(a) + '" class="font-monospace small">' + esc(e.ref) + '</a>' + gone +
        (conf ? ' <span class="badge text-bg-danger">Kilde endret siden</span>' : ' <span class="badge text-bg-success">endret</span>') +
        '<span class="ms-auto small text-body-secondary">' + esc(new Date(ch.ts).toLocaleString('nb-NO')) + '</span></div>' +
        '<div class="diff">' + diffHtml(ch.old, ch.neu) + '</div>' +
        '<div class="input-group input-group-sm mt-1"><span class="input-group-text">Begrunnelse</span><input type="text" class="form-control cm-why" maxlength="300" data-a="' + esc(a) + '" value="' + esc(ch.why || '') + '" placeholder="valgfritt - Enter lagrer"></div>' +
        (conf ? '<div class="small text-danger-emphasis">Originalteksten er endret etter at du lagret endringen. Endringen vises ikke i teksten før du lager den på nytt.</div>' : '') +
        '<div class="text-end mt-1"><button class="btn btn-sm btn-link p-0 text-danger" data-undo="' + esc(a) + '"><i class="fa-solid fa-rotate-left me-1"></i>' + (conf ? 'Forkast' : 'Angre endring') + '</button></div></div>';
    }
    if (cmFilter === 'alle' || cmFilter === 'kommentar') e.items.forEach(function(it, i){
      rows += '<div class="cm-item"><div class="d-flex align-items-center gap-2"><i class="fa-solid fa-comment text-warning-emphasis" title="Kommentar"></i>' +
        '<a href="#' + esc(a) + '" class="font-monospace small">' + esc(e.ref) + '</a>' + gone +
        '<span class="ms-auto small text-body-secondary">' + esc(new Date(it.ts).toLocaleString('nb-NO')) + '</span></div>' +
        '<div class="snip">' + esc(snippetOf(a)) + '</div><div class="cm-text">' + esc(it.t) + '</div>' +
        '<div class="text-end mt-1"><button class="btn btn-sm btn-link p-0 text-danger" data-delc="' + esc(a) + '" data-i="' + i + '"><i class="fa-solid fa-trash me-1"></i>Slett</button></div></div>';
    });
    if (!rows) return;
    shown++;
    if (e.doc !== lastDoc) { html += '<h6 class="mt-3">' + esc(docTitle(e.doc)) + '</h6>'; lastDoc = e.doc; }
    html += rows;
  });
  box.innerHTML = shown ? html : '<p class="text-body-secondary small">Ingen i denne visningen.</p>';
}
$('#cmList').addEventListener('click', function(ev){
  var u = ev.target.closest('[data-undo]');
  if (u) { ev.preventDefault(); undoChange(u.dataset.undo); return; }
  var ru = ev.target.closest('[data-rmundo]');
  if (ru) { ev.preventDefault(); undoRemove(ru.dataset.rmundo); return; }
  var d = ev.target.closest('[data-delc]');
  if (d) { ev.preventDefault(); var c = loadC(), a = d.dataset.delc, e = c[a]; if (e) { e.items.splice(+d.dataset.i, 1); prune(c, a); saveC(c); } return; }
  if (ev.target.closest('a')) { var oc = bootstrap.Offcanvas.getInstance($('#cmPane')); if (oc) oc.hide(); }
});

$('#cmList').addEventListener('change', function(ev){
  var w = ev.target.closest('.cm-why'); if (w) setWhy(w.dataset.a, w.value);
  var wr = ev.target.closest('.cm-why-rm'); if (wr) setRmWhy(wr.dataset.k, wr.value);
});
$('#cmList').addEventListener('keydown', function(ev){ if (ev.key === 'Enter' && /(^|\s)cm-why(-rm)?(\s|$)/.test(ev.target.className)) { ev.preventDefault(); ev.target.blur(); } });

/* ---------- eksport ---------- */
function quoteBlock(label, s){
  s = String(s || '');
  if (s.indexOf('\n') < 0) return [label + ': "' + s + '"'];
  return [label + ':'].concat(s.split('\n').map(function(l){ return l ? '> ' + l : '>'; }));
}
function exportMd(){
  var c = loadC(), keys = sortedAnchors(c), snip = $('#cmSnippet').checked, lines = [], lastDoc = null;
  var nk = 0, ne = 0, nc = 0, nf = 0, nfc = 0, covered = {};
  /* En endring i et element som også er fjernet (selv eller som del av en seksjon), tas ikke med */
  keys.forEach(function(a){ var rm = c[a].rm; if (rm && rm.scope !== 'row' && !rmConflict(a, rm)) { covered[a] = 1; (rm.parts || []).forEach(function(p){ covered[p.a] = 1; }); } });
  keys.forEach(function(a){
    nk += c[a].items.length;
    if (c[a].ch && !covered[a]) { ne++; if (conflictAny(a, c[a].ch)) nc++; }
    if (c[a].rm) { nf++; if (rmConflict(a, c[a].rm)) nfc++; }
  });
  lines.push('# Tilbakemelding på RTTI-kurset', '',
    'Eksportert ' + new Date().toLocaleString('nb-NO') + ' · leser bygget ' + V.built + ' (Europe/Oslo)' + (V.ver ? ' · leser v' + V.ver : ''),
    'Innhold: ' + ne + (ne === 1 ? ' endring' : ' endringer') + (nc ? ' (' + nc + ' med «Kilde endret siden»)' : '') + ', ' + nf + ' fjernet' + (nfc ? ' (' + nfc + ' med «Kilde endret siden»)' : '') + ', ' + nk + (nk === 1 ? ' kommentar' : ' kommentarer'), '',
    'Endringene er forslag. «Før» er teksten i leseren da endringen ble laget, «Etter» er forslaget (enkel Markdown). FJERNET betyr at teksten under «Før» foreslås strøket.', '');
  keys.forEach(function(a){
    var e = c[a];
    if (e.doc !== lastDoc) { lines.push('## ' + docTitle(e.doc), ''); lastDoc = e.doc; }
    if (e.rm) {
      var rm = e.rm, rc = rmConflict(a, rm), parts = rm.parts || [];
      var lab = rm.scope === 'head' ? ' (Fjern overskrift)' : (rm.scope === 'sec' ? ' (hele seksjonen)' : (rm.scope === 'row' ? ' (tabellrad)' : ''));
      lines.push('### ' + rm.ref + ' — FJERNET' + lab + (rc ? ' — KILDE ENDRET SIDEN' : ''));
      var before = rm.scope === 'sec' ? [hashes(rm.kind) + rm.old].concat(parts.map(function(p){ return p.old; })).join('\n\n') : (rm.scope === 'head' ? hashes(rm.kind) + rm.old : rm.old);
      lines = lines.concat(quoteBlock('Før', before));
      if (rm.scope === 'head') lines.push('Merk: bare overskriften fjernes. Innholdet som følger, blir stående.');
      if (rm.scope === 'sec') lines.push('Omfatter: ' + [rm.ref].concat(parts.map(function(p){ return p.ref; })).join(', '));
      if (rm.why) lines.push('Begrunnelse: ' + rm.why.replace(/\r?\n/g, ' '));
      if (rc) lines.push('Merk: originalteksten i kilden er endret etter at fjerningen ble laget.');
      lines.push('');
    }
    if (e.ch && !covered[a]) {
      var ch = e.ch, conf = conflictAny(a, ch), head = /^h/.test(ch.kind || '') ? ' (overskrift)' : '';
      lines.push('### ' + e.ref + ' — ENDRET' + head + (conf ? ' — KILDE ENDRET SIDEN' : ''));
      lines = lines.concat(quoteBlock('Før', ch.old), quoteBlock('Etter', ch.neu));
      if (ch.why) lines.push('Begrunnelse: ' + ch.why.replace(/\r?\n/g, ' '));
      if (conf) lines.push('Merk: originalteksten i kilden er endret etter at endringen ble laget.');
      lines.push('');
    }
    if (e.items.length) {
      e.items.forEach(function(it){
        lines.push('- ' + e.ref + ' — KOMMENTAR: ' + it.t.replace(/\r?\n/g, ' / '));
        if (snip && IDX[a]) lines.push('  > «' + snippetOf(a) + '»');
      });
      lines.push('');
    }
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '') + '\n';
}
function exportJson(){
  return JSON.stringify({format: 'rtti-viewer-feedback', version: 3, exported: new Date().toISOString(), built: V.built, viewer: V.ver || '', entries: loadC()}, null, 2);
}
$('#cmCopy').addEventListener('click', function(){ var md = exportMd(); copyText(md).then(function(){ markExported(); toast('Kommentarer og endringer er kopiert som Markdown'); }); });
$('#cmDownload').addEventListener('click', function(){ download('tilbakemelding-rtti-kurs-' + stamp() + '.md', exportMd(), 'text/markdown;charset=utf-8'); markExported(); });
$('#cmJson').addEventListener('click', function(){ download('tilbakemelding-rtti-kurs-' + stamp() + '.json', exportJson(), 'application/json;charset=utf-8'); markExported(); toast('Sikkerhetskopi lastet ned (.json). Den kan importeres i en annen nettleser.'); });
$('#cmImportBtn').addEventListener('click', function(){ $('#cmImportBox').classList.toggle('d-none'); });
function importJson(txt){
  var o; try { o = JSON.parse(txt); } catch(e){ toast('Kunne ikke lese JSON: ' + e.message); return; }
  var src = o && (o.entries || o); if (!src || typeof src !== 'object') { toast('Fant ingen kommentarer i filen'); return; }
  var c = loadC(), nk = 0, ne = 0, nf = 0;
  Object.keys(src).forEach(function(a){
    var s = src[a]; if (!s || typeof s !== 'object') return;
    var b = baseA(a), e = c[a] || {ref: String(s.ref || (IDX[b] ? IDX[b].ref : a)), doc: s.doc || (IDX[b] ? IDX[b].doc : ''), items: []};
    (Array.isArray(s.items) ? s.items : []).forEach(function(it){
      if (!it || typeof it.t !== 'string') return;
      if (e.items.some(function(x){ return x.t === it.t; })) return;
      e.items.push({type: 'kommentar', t: it.t, ts: +it.ts || Date.now()}); nk++;
    });
    if (s.ch && typeof s.ch.neu === 'string' && (!e.ch || (+s.ch.ts || 0) > (+e.ch.ts || 0))) {
      var ch = s.ch;
      e.ch = {type: 'endring', ref: e.ref, old: String(ch.old || ''), oldText: String(ch.oldText || ''), neu: ch.neu, html: sanitize(ch.html || esc(ch.neu)), why: String(ch.why || ''), kind: String(ch.kind || ''), ts: +ch.ts || Date.now()}; ne++;
    }
    var r = s.rm;
    if (r && typeof r.old === 'string' && /^(el|head|sec|row)$/.test(r.scope) && (!e.rm || (+r.ts || 0) > (+e.rm.ts || 0))) {
      e.rm = {type: 'fjernet', ref: String(r.ref || e.ref), scope: r.scope, kind: String(r.kind || ''), old: r.old, oldText: String(r.oldText || ''), why: String(r.why || ''), ts: +r.ts || Date.now()};
      if (r.scope === 'row') e.rm.row = Math.max(1, +r.row || 1);
      if (r.scope === 'sec') e.rm.parts = (Array.isArray(r.parts) ? r.parts : []).filter(function(p){ return p && typeof p.a === 'string'; })
        .map(function(p){ return {a: p.a, ref: String(p.ref || p.a), old: String(p.old || ''), text: String(p.text || '')}; });
      nf++;
    }
    c[a] = e; prune(c, a);
  });
  saveC(c); if (current) render(current);
  toast(nk + ' kommentarer, ' + ne + ' endringer og ' + nf + ' fjerninger importert');
}
function importText(txt){
  if (/^\s*\{/.test(txt)) { importJson(txt); return; }
  var c = loadC(), n = 0, skipped = 0;
  txt.split(/\r?\n/).forEach(function(line){
    var m = line.match(/^\s*[-*]\s+(\S+(?:\s+§\S+)?(?:\s+¶\d+)?)(?:\s+—\s+KOMMENTAR)?:\s+(.+)$/); if (!m) return;
    var ref = m[1].trim(), a = REF2A[ref];
    if (!a) { if (V.docs[ref]) a = 'd-' + ref; else { skipped++; return; } }
    var e = c[a] || {ref: ref, doc: (IDX[a] ? IDX[a].doc : ref.split(' ')[0]), items: []};
    var t = m[2].replace(/ \/ /g, '\n');
    if (e.items.some(function(it){ return it.t === t; })) return;
    e.items.push({type: 'kommentar', t: t, ts: Date.now()}); c[a] = e; n++;
  });
  saveC(c); toast(n + ' kommentarer importert' + (skipped ? ', ' + skipped + ' ukjente referanser hoppet over' : '') + '. Endringer importeres fra .json-sikkerhetskopien.');
}
$('#cmImportGo').addEventListener('click', function(){ importText($('#cmImportText').value); $('#cmImportText').value = ''; });
$('#cmImportFile').addEventListener('change', function(ev){ var f = ev.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function(){ importText(String(r.result)); }; r.readAsText(f, 'utf-8'); ev.target.value = ''; });
$('#cmClear').addEventListener('click', function(){ if (confirm('Slette alle kommentarer, endringer og fjerninger i denne nettleseren? Eksporter dem først (gjerne som .json) hvis du vil ta vare på dem.')) { saveC({}); if (current) render(current); toast('Alle kommentarer og endringer er slettet'); } });
$('#cmPane').addEventListener('show.bs.offcanvas', renderCmList);

/* ---------- søk ---------- */
var sT = null;
function doSearch(){
  var q = $('#searchBox').value.trim().toLowerCase(), scope = $('#searchScope').value, box = $('#searchResults'), tree = $('#navTree');
  if (q.length < 2) { box.classList.add('d-none'); tree.classList.remove('d-none'); return; }
  var terms = q.split(/\s+/), res = [];
  for (var i = 0; i < V.index.length && res.length < 150; i++) {
    var e = V.index[i], d = V.docs[e[1]];
    if (scope && d.g !== scope) continue;
    var lc = IDX[e[0]].lc, ok = terms.every(function(t){ return lc.indexOf(t) >= 0; });
    if (ok) res.push(e);
  }
  var re = new RegExp('(' + terms.map(function(t){ return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
  var html = '<div class="small text-body-secondary mb-1">' + (res.length >= 150 ? 'Over 150' : res.length) + ' treff</div>';
  html += res.map(function(e){
    var t = e[3], p = t.toLowerCase().indexOf(terms[0]), s = Math.max(0, p - 50), frag = (s ? '... ' : '') + t.slice(s, s + 170) + (t.length > s + 170 ? ' ...' : '');
    return '<a class="res" href="#' + esc(e[0]) + '"><span class="badge text-bg-secondary font-monospace me-1">' + esc(e[2]) + '</span>' + esc(V.docs[e[1]].t) + '<br>' + esc(frag).replace(re, '<mark>$1</mark>') + '</a>';
  }).join('');
  box.innerHTML = html; box.classList.remove('d-none'); tree.classList.add('d-none');
}
$('#searchBox').addEventListener('input', function(){ clearTimeout(sT); sT = setTimeout(doSearch, 200); });
$('#searchScope').addEventListener('change', doSearch);
$('#searchResults').addEventListener('click', function(ev){ if (ev.target.closest('a')) closeNavMobile(); });
document.addEventListener('keydown', function(ev){ var ae = document.activeElement; if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(ae.tagName) && !ae.isContentEditable) { ev.preventDefault(); $('#searchBox').focus(); } });

/* ---------- lysboks for bilder (leser 1.7) ---------- */
/* Klikk (eller Enter) på et bilde i teksten viser det forstørret over en mørk bakgrunn, med alt-teksten under.
   Lukk med X, Esc eller klikk på bakgrunnen. Klikket fanges før redigering, kommentarer og quiz, så et klikk på
   et bilde i redigeringsmodus starter ikke redigering. Ingen eksterne biblioteker. */
var LB = null, lbBack = null;
function lbEl(){
  if (LB) return LB;
  LB = document.createElement('div'); LB.id = 'lightbox'; LB.className = 'lb'; LB.hidden = true;
  LB.setAttribute('role', 'dialog'); LB.setAttribute('aria-modal', 'true'); LB.setAttribute('aria-label', 'Forstørret bilde');
  LB.innerHTML = '<button type="button" class="lb-close" aria-label="Lukk forstørret bilde" title="Lukk (Esc)"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span class="visually-hidden">Lukk</span></button>'
    + '<figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"></figcaption></figure>';
  document.body.appendChild(LB);
  LB.addEventListener('click', function(ev){
    ev.stopPropagation();
    if (ev.target.closest('.lb-close') || !ev.target.closest('.lb-img, .lb-cap')) closeLightbox();
  });
  return LB;
}
/* Små bilder skaleres opp (høyst 2 ganger) til de fyller 95vw × 90vh; store bilder krympes av CSS. */
function lbFit(){
  if (!LB || LB.hidden) return;
  var big = LB.querySelector('.lb-img'), nw = big.naturalWidth, nh = big.naturalHeight;
  big.style.width = '';
  if (!nw || !nh) return;
  var k = Math.min(window.innerWidth * 0.95 / nw, window.innerHeight * 0.9 / nh, 2);
  if (k > 1) big.style.width = Math.floor(nw * k) + 'px';
}
window.addEventListener('resize', lbFit);
function lbImg(t){
  var im = t && t.closest && t.closest('#doc img');
  return im && !im.classList.contains('broken') && !im.closest('a') ? im : null;
}
function openLightbox(im){
  var lb = lbEl(), big = lb.querySelector('.lb-img'), cap = lb.querySelector('.lb-cap'), alt = im.getAttribute('alt') || '';
  lbBack = im.tabIndex >= 0 ? im : (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
  big.style.width = ''; big.onload = lbFit;
  big.src = im.currentSrc || im.src; big.alt = alt; if (big.complete) lbFit(); cap.textContent = alt; cap.hidden = !alt;
  lb.setAttribute('aria-label', alt ? 'Forstørret bilde: ' + alt : 'Forstørret bilde');
  lb.hidden = false; document.documentElement.classList.add('lb-open');
  lb.querySelector('.lb-close').focus();
}
function closeLightbox(){
  if (!LB || LB.hidden) return;
  LB.hidden = true; document.documentElement.classList.remove('lb-open');
  LB.querySelector('.lb-img').removeAttribute('src');
  var b = lbBack; lbBack = null;
  if (b && document.contains(b) && b.focus) { try { b.focus({preventScroll: true}); } catch (e) { b.focus(); } }
}
function lbPrep(root){
  $$('img', root).forEach(function(im){ if (lbImg(im) && !im.hasAttribute('tabindex')) im.tabIndex = 0; });
}
document.addEventListener('mousedown', function(ev){ if (lbImg(ev.target)) ev.preventDefault(); }, true);
document.addEventListener('click', function(ev){
  var im = lbImg(ev.target);
  if (!im || ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault(); ev.stopPropagation(); openLightbox(im);
}, true);
document.addEventListener('keydown', function(ev){
  if (LB && !LB.hidden) {
    ev.stopPropagation();
    if (ev.key === 'Escape' || ev.key === 'Esc') { ev.preventDefault(); closeLightbox(); }
    else if (ev.key === 'Tab') { ev.preventDefault(); LB.querySelector('.lb-close').focus(); }
    return;
  }
  var im = (ev.key === 'Enter' || ev.key === ' ') && ev.target && ev.target.tagName === 'IMG' ? lbImg(ev.target) : null;
  if (im) { ev.preventDefault(); ev.stopPropagation(); openLightbox(im); }
}, true);

buildNav(); setEditMode(kvGet(LS_E) !== '0'); route(); renderCmList();
})();
