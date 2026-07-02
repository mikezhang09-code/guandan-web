/* Guandan (掼蛋) engine — DOM-free, adapted from mikezhang09-code/guandan-web.
   Instantiate: const g = new GuandanGame({ onUpdate, onEvent }); g.newGame();
   Read g.view() for a render-ready snapshot. Human actions: toggle(id), play(), pass(), hint(), sort(). */
(function (root) {
  const SUITS = ['S', 'H', 'C', 'D'];
  const SUIT_SYM = { S: '♠', H: '♥', C: '♣', D: '♦' };
  const RED = new Set(['H', 'D']);
  const NAMES = ['你', '左家', '对家', '右家'];
  let uid = 0;

  function makeDeck() {
    const d = [];
    for (let k = 0; k < 2; k++) {
      for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ id: uid++, suit: s, rank: r, joker: null });
      d.push({ id: uid++, suit: 'J', rank: null, joker: 'S' });
      d.push({ id: uid++, suit: 'J', rank: null, joker: 'B' });
    }
    return d;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function isWild(c, level) { return c.suit === 'H' && c.rank === level; }
  function rvCard(c, level) {
    if (c.joker === 'B') return 17;
    if (c.joker === 'S') return 16;
    if (c.rank === level) return 15;
    return c.rank;
  }
  function valueName(v) {
    if (v === 18) return '四王'; if (v === 17) return '大王'; if (v === 16) return '小王';
    if (v === 15) return '级牌'; if (v === 14) return 'A'; if (v === 13) return 'K';
    if (v === 12) return 'Q'; if (v === 11) return 'J'; return '' + v;
  }
  function rankText(c) {
    if (c.joker === 'B') return '大王'; if (c.joker === 'S') return '小王';
    return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.rank] || '' + c.rank;
  }
  function tryNOAK(rest, wc, level) {
    if (rest.some(c => c.joker)) {
      if (wc > 0) return null;
      const t = new Set(rest.map(c => c.joker));
      if (t.size !== 1) return null;
      return { value: rest[0].joker === 'B' ? 17 : 16, n: rest.length };
    }
    if (rest.length === 0) return { value: 15, n: wc };
    const r = rest[0].rank;
    if (rest.some(c => c.rank !== r)) return null;
    return { value: r === level ? 15 : r, n: rest.length + wc };
  }
  function seqValue(rest, wc, g, nr) {
    if (rest.length + wc !== g * nr) return null;
    if (rest.some(c => c.joker)) return null;
    const cnt = {}; rest.forEach(c => cnt[c.rank] = (cnt[c.rank] || 0) + 1);
    for (let start = 1; start <= 15 - nr; start++) {
      let ok = true, inWin = 0;
      for (let i = 0; i < nr; i++) {
        let r = start + i; let ar = (r === 1) ? 14 : r;
        let h = cnt[ar] || 0;
        if (h > g) { ok = false; break; }
        inWin += h;
      }
      if (!ok) continue;
      if (inWin !== rest.length) continue;
      return start + nr - 1;
    }
    return null;
  }
  function tryFullHouse(sel, level) {
    const rest = sel.filter(c => !isWild(c, level)), wc = sel.length - rest.length;
    if (rest.some(c => c.joker)) return null;
    const cnt = {}; rest.forEach(c => cnt[c.rank] = (cnt[c.rank] || 0) + 1);
    const cands = [...new Set([...Object.keys(cnt).map(Number), level])];
    let best = null;
    for (const tR of cands) for (const pR of cands) {
      if (tR === pR) continue;
      const hT = cnt[tR] || 0, hP = cnt[pR] || 0;
      if (hT > 3 || hP > 2) continue;
      if (hT + hP !== rest.length) continue;
      if ((3 - hT) + (2 - hP) !== wc) continue;
      const v = (tR === level) ? 15 : tR;
      if (best === null || v > best) best = v;
    }
    return best;
  }
  function seqOnSel(sel, level, g, nr) {
    const rest = sel.filter(c => !isWild(c, level)), wc = sel.length - rest.length;
    return seqValue(rest, wc, g, nr);
  }
  function tryStraightFlush(sel, level) {
    const rest = sel.filter(c => !isWild(c, level)), wc = sel.length - rest.length;
    if (rest.some(c => c.joker)) return null;
    if (new Set(rest.map(c => c.suit)).size > 1) return null;
    return seqValue(rest, wc, 1, 5);
  }
  function evaluateSelection(sel, level) {
    const rest = sel.filter(c => !isWild(c, level)), wc = sel.length - rest.length, n = sel.length;
    const ds = [];
    const noak = tryNOAK(rest, wc, level);
    if (noak) {
      if (noak.n === 1) ds.push({ category: 'normal', type: 'single', len: 1, value: noak.value });
      else if (noak.n === 2) ds.push({ category: 'normal', type: 'pair', len: 2, value: noak.value });
      else if (noak.n === 3) ds.push({ category: 'normal', type: 'triple', len: 3, value: noak.value });
      else if (noak.n >= 4) ds.push({ category: 'bomb', type: 'bomb', len: noak.n, value: noak.value, strength: noak.n * 100 + noak.value });
    }
    if (n === 5) {
      const fh = tryFullHouse(sel, level); if (fh != null) ds.push({ category: 'normal', type: 'fullhouse', len: 5, value: fh });
      const st = seqOnSel(sel, level, 1, 5); if (st != null) ds.push({ category: 'normal', type: 'straight', len: 5, value: st });
      const sf = tryStraightFlush(sel, level); if (sf != null) ds.push({ category: 'bomb', type: 'straightflush', len: 5, value: sf, strength: 550 + sf });
    }
    if (n === 6) {
      const tb = seqOnSel(sel, level, 2, 3); if (tb != null) ds.push({ category: 'normal', type: 'tube', len: 6, value: tb });
      const pl = seqOnSel(sel, level, 3, 2); if (pl != null) ds.push({ category: 'normal', type: 'plate', len: 6, value: pl });
    }
    if (n === 4 && sel.every(c => c.joker)) {
      const s = sel.filter(c => c.joker === 'S').length, b = sel.filter(c => c.joker === 'B').length;
      if (s === 2 && b === 2) ds.push({ category: 'bomb', type: 'fourjokers', len: 4, value: 18, strength: 100000 });
    }
    return ds;
  }
  function compareBeat(d, req) {
    if (!req) return true;
    if (d.category === 'bomb') { if (req.category !== 'bomb') return true; return d.strength > req.strength; }
    if (req.category === 'bomb') return false;
    return d.type === req.type && d.len === req.len && d.value > req.value;
  }
  const TYPE_ORDER = ['straight', 'tube', 'plate', 'fullhouse', 'triple', 'pair', 'single'];
  function choosePlay(ds, req) {
    if (!ds.length) return null;
    if (req) {
      const norm = ds.filter(d => d.category === 'normal');
      for (const d of norm) if (compareBeat(d, req)) return d;
      const bombs = ds.filter(d => d.category === 'bomb').sort((a, b) => a.strength - b.strength);
      for (const d of bombs) if (compareBeat(d, req)) return d;
      return null;
    }
    const norm = ds.filter(d => d.category === 'normal');
    if (norm.length) { norm.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)); return norm[0]; }
    return ds.filter(d => d.category === 'bomb').sort((a, b) => a.strength - b.strength)[0] || null;
  }
  function descText(d) {
    const m = { single: '单张', pair: '对子', triple: '三张', fullhouse: '三带二', straight: '顺子', tube: '三连对', plate: '钢板', bomb: d.len + '炸', straightflush: '同花顺', fourjokers: '四王炸' };
    return (m[d.type] || d.type) + ' ' + valueName(d.value);
  }
  function genMoves(hand, level) {
    const moves = [], byRank = {}, jokers = [], rankCards = {};
    hand.forEach(c => {
      if (c.joker) jokers.push(c);
      else { (byRank[c.rank] = byRank[c.rank] || []).push(c); (rankCards[c.rank] = rankCards[c.rank] || []).push(c); }
    });
    hand.forEach(c => moves.push([c]));
    for (const r in byRank) {
      const g = byRank[r];
      if (g.length >= 2) moves.push(g.slice(0, 2));
      if (g.length >= 3) moves.push(g.slice(0, 3));
      if (g.length >= 4) moves.push(g.slice());
    }
    const sj = jokers.filter(c => c.joker === 'S'), bj = jokers.filter(c => c.joker === 'B');
    if (sj.length >= 2) moves.push(sj.slice(0, 2));
    if (bj.length >= 2) moves.push(bj.slice(0, 2));
    if (sj.length >= 2 && bj.length >= 2) moves.push([...sj.slice(0, 2), ...bj.slice(0, 2)]);
    for (const r in byRank) if (byRank[r].length >= 3)
      for (const r2 in byRank) if (r2 !== r && byRank[r2].length >= 2)
        moves.push([...byRank[r].slice(0, 3), ...byRank[r2].slice(0, 2)]);
    const seq = (g, nr) => {
      for (let s = 1; s <= 15 - nr; s++) {
        const sel = []; let ok = true;
        for (let i = 0; i < nr; i++) { let r = s + i, ar = (r === 1) ? 14 : r; const cs = rankCards[ar] || []; if (cs.length < g) { ok = false; break; } for (let k = 0; k < g; k++) sel.push(cs[k]); }
        if (ok) moves.push(sel);
      }
    };
    seq(1, 5); seq(2, 3); seq(3, 2);
    return moves;
  }
  function bombCardIds(hand) {
    const ids = new Set(), byRank = {}, jk = { S: [], B: [] };
    hand.forEach(c => { if (c.joker) jk[c.joker].push(c); else (byRank[c.rank] = byRank[c.rank] || []).push(c); });
    for (const r in byRank) if (byRank[r].length >= 4) byRank[r].forEach(c => ids.add(c.id));
    if (jk.S.length >= 2 && jk.B.length >= 2) jk.S.concat(jk.B).forEach(c => ids.add(c.id));
    return ids;
  }
  function breakage(cards, hand) {
    const cnt = {}; hand.forEach(c => { const k = c.joker || ('r' + c.rank); cnt[k] = (cnt[k] || 0) + 1; });
    const used = {}; cards.forEach(c => { const k = c.joker || ('r' + c.rank); used[k] = (used[k] || 0) + 1; });
    let pen = 0; for (const k in used) if (used[k] < cnt[k]) pen += cnt[k] - used[k];
    return pen;
  }

  class GuandanGame {
    constructor(opts) {
      opts = opts || {};
      this.onUpdate = opts.onUpdate || function () {};
      this.onEvent = opts.onEvent || function () {};
      this.aiDelay = opts.aiDelay || 750;
      this.team = i => i % 2;
      this._timer = null;
      this.logs = [];
      this.overlay = null;
      this.selected = new Set();
    }
    notify() { this.onUpdate(); }
    log(t) { this.logs.unshift(t); this.logs = this.logs.slice(0, 8); }
    flash(t) { this.log('⚠ ' + t); this.onEvent('warn'); this.notify(); }

    newGame() {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this.teamLevels = [2, 2]; this.currentLevel = 2; this.aFails = [0, 0]; this.gameOver = false; this.prevOrder = null;
      this.startDeal();
    }
    startDeal() {
      this.onEvent('deal');
      const deck = shuffle(makeDeck());
      this.players = [0, 1, 2, 3].map(i => ({ idx: i, hand: [], finished: false, lastShown: null }));
      deck.forEach((c, i) => this.players[i % 4].hand.push(c));
      this.players.forEach(p => this.sortHand(p.hand));
      this.lastPlay = null; this.passed = new Set(); this.finishedOrder = []; this.selected.clear();
      this.returnMode = null; this.pendingReturns = []; this.retIndex = 0; this.tributeMsgs = [];
      this.log('新一局开始，级牌 ' + valueName(this.currentLevel));
      if (!this.prevOrder) { this.currentPlayer = Math.floor(Math.random() * 4); this.log('首局由 ' + NAMES[this.currentPlayer] + ' 先出'); this.notify(); this.step(); }
      else this.runTribute();
    }
    runTribute() {
      this.onEvent('tribute');
      const order = this.prevOrder, winT = this.team(order[0]);
      const dbl = this.team(order[1]) === winT;
      const pairs = dbl ? [{ p: order[3], r: order[0] }, { p: order[2], r: order[1] }] : [{ p: order[3], r: order[0] }];
      const bigJokers = pairs.reduce((s, x) => s + this.players[x.p].hand.filter(c => c.joker === 'B').length, 0);
      if (bigJokers >= 2) {
        this.showOverlay('进贡 · 还贡', '抗贡！进贡方持有两张大王，本局免进贡', () => this.finishTribute(order[0]), '开始出牌');
        return;
      }
      this.tributeMsgs = []; const info = [];
      for (const x of pairs) {
        const ph = this.players[x.p].hand;
        const card = ph.filter(c => !isWild(c, this.currentLevel)).sort((a, b) => rvCard(b, this.currentLevel) - rvCard(a, this.currentLevel))[0];
        this.players[x.p].hand = ph.filter(c => c.id !== card.id);
        this.players[x.r].hand.push(card);
        info.push({ payer: x.p, receiver: x.r, card });
        this.tributeMsgs.push(`${NAMES[x.p]} 进贡 ${this.cardName(card)} 给 ${NAMES[x.r]}`);
      }
      this.tributeLead = info.length === 2
        ? (rvCard(info[0].card, this.currentLevel) >= rvCard(info[1].card, this.currentLevel) ? info[0] : info[1]).payer
        : info[0].payer;
      this.pendingReturns = info.map(t => ({ payer: t.payer, receiver: t.receiver }));
      this.retIndex = 0; this.processReturns();
    }
    processReturns() {
      while (this.retIndex < this.pendingReturns.length) {
        const pr = this.pendingReturns[this.retIndex];
        if (pr.receiver === 0) {
          this.returnMode = pr; this.notify();
          this.log(`请选一张不大于10的牌还贡给 ${NAMES[pr.payer]}，再按「出牌」`);
          this.notify();
          return;
        }
        this.autoReturn(pr); this.retIndex++;
      }
      this.finalizeTribute();
    }
    autoReturn(pr) {
      const h = this.players[pr.receiver].hand;
      let cand = h.filter(c => !c.joker && !isWild(c, this.currentLevel) && c.rank <= 10);
      if (!cand.length) cand = h.filter(c => !isWild(c, this.currentLevel));
      if (!cand.length) cand = h.slice();
      const card = cand.sort((a, b) => rvCard(a, this.currentLevel) - rvCard(b, this.currentLevel))[0];
      this.players[pr.receiver].hand = h.filter(c => c.id !== card.id);
      this.players[pr.payer].hand.push(card);
      this.tributeMsgs.push(`${NAMES[pr.receiver]} 还贡 ${this.cardName(card)} 给 ${NAMES[pr.payer]}`);
    }
    finalizeTribute() {
      this.returnMode = null; this.players.forEach(p => this.sortHand(p.hand));
      this.showOverlay('进贡 · 还贡', this.tributeMsgs.join('\n') || '无', () => this.finishTribute(this.tributeLead), '开始出牌');
    }
    finishTribute(leader) {
      this.lastPlay = null; this.passed.clear(); this.players.forEach(p => p.lastShown = null);
      this.currentPlayer = leader; this.notify(); this.step();
    }
    cardName(c) { return c.joker ? rankText(c) : rankText(c) + SUIT_SYM[c.suit]; }
    sortHand(h) { h.sort((a, b) => rvCard(b, this.currentLevel) - rvCard(a, this.currentLevel) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)); }
    nextActive(i) { let j = (i + 1) % 4; let g = 0; while (this.players[j].finished && g < 4) { j = (j + 1) % 4; g++; } return j; }

    step() {
      if (this.gameOver) return;
      const active = this.players.filter(p => !p.finished);
      if (this.finishedOrder.length >= 2 && this.team(this.finishedOrder[0].idx) === this.team(this.finishedOrder[1].idx)) {
        active.sort((a, b) => a.hand.length - b.hand.length).forEach(p => { p.finished = true; this.finishedOrder.push(p); });
        this.endDeal(); return;
      }
      if (active.length <= 1) { if (active.length === 1) { active[0].finished = true; this.finishedOrder.push(active[0]); } this.endDeal(); return; }
      if (this.players[this.currentPlayer].finished) { this.currentPlayer = this.nextActive(this.currentPlayer); return this.step(); }
      if (this.currentPlayer === 0) { this.notify(); return; }
      this.notify();
      this._timer = setTimeout(() => {
        const mv = this.aiMove(this.currentPlayer);
        if (mv) this.applyPlay(this.currentPlayer, mv.cards, mv.desc); else this.applyPass(this.currentPlayer);
        this.afterAction();
      }, this.aiDelay);
    }
    afterAction() {
      if (this.gameOver) return;
      if (this.lastPlay) {
        const others = this.players.filter(p => !p.finished && p.idx !== this.lastPlay.player);
        if (others.every(p => this.passed.has(p.idx))) {
          let leader = this.lastPlay.player;
          if (this.players[leader].finished) {
            const partner = (leader + 2) % 4;
            leader = this.players[partner].finished ? this.nextActive(leader) : partner;
          }
          this.lastPlay = null; this.passed.clear(); this.players.forEach(p => p.lastShown = null);
          this.currentPlayer = leader; this.notify(); return this.step();
        }
      }
      this.currentPlayer = this.nextActive(this.currentPlayer); this.notify(); this.step();
    }
    applyPlay(idx, cards, desc) {
      const p = this.players[idx]; const ids = new Set(cards.map(c => c.id));
      p.hand = p.hand.filter(c => !ids.has(c.id));
      this.lastPlay = { player: idx, desc, cards: cards.slice() };
      this.passed.clear(); this.players.forEach(q => { if (q.idx !== idx) q.lastShown = null; });
      p.lastShown = cards.slice();
      this.log(NAMES[idx] + ' 出 ' + descText(desc));
      this.onEvent('play');
      if (p.hand.length === 0) { p.finished = true; this.finishedOrder.push(p); this.log('🎉 ' + NAMES[idx] + ' 出完!'); }
    }
    applyPass(idx) {
      this.passed.add(idx);
      this.players[idx].lastShown = 'pass';
      this.log(NAMES[idx] + ' 不出');
      this.onEvent('pass');
    }
    aiMove(idx) {
      const hand = this.players[idx].hand, req = this.lastPlay ? this.lastPlay.desc : null, lvl = this.currentLevel;
      const bombIds = bombCardIds(hand), cand = [];
      for (const m of genMoves(hand, lvl)) {
        const d = choosePlay(evaluateSelection(m, lvl), null); if (!d) continue;
        cand.push({ cards: m, desc: d, bk: breakage(m, hand), breaksBomb: d.category !== 'bomb' && m.some(c => bombIds.has(c.id)) });
      }
      const beats = cand.filter(c => compareBeat(c.desc, req));
      const goOut = p => p.filter(c => c.cards.length === hand.length).sort((a, b) => a.desc.value - b.desc.value)[0];
      if (req && this.lastPlay.player !== idx && this.team(this.lastPlay.player) === this.team(idx)) {
        return goOut(beats) || null;
      }
      if (!req) {
        let pool = beats.filter(c => c.desc.category === 'normal' && !c.breaksBomb);
        if (!pool.length) pool = beats.filter(c => c.desc.category === 'normal');
        if (!pool.length) pool = beats;
        const out = goOut(pool); if (out) return out;
        pool.sort((a, b) => a.bk - b.bk || a.desc.value - b.desc.value || b.cards.length - a.cards.length);
        return pool[0];
      }
      const norm = beats.filter(c => c.desc.category === 'normal');
      const nb = norm.filter(c => !c.breaksBomb), pool = nb.length ? nb : norm;
      if (pool.length) {
        const out = goOut(pool); if (out) return out;
        pool.sort((a, b) => a.desc.value - b.desc.value || a.bk - b.bk || a.cards.length - b.cards.length);
        return pool[0];
      }
      const bombs = beats.filter(c => c.desc.category === 'bomb').sort((a, b) => a.desc.strength - b.desc.strength);
      if (bombs.length) {
        const oppLow = this.players.some(q => !q.finished && this.team(q.idx) !== this.team(idx) && q.hand.length <= 4);
        if (oppLow || hand.length <= bombs[0].cards.length) return bombs[0];
      }
      return null;
    }
    endDeal() {
      const order = this.finishedOrder.map(p => p.idx);
      const winner = order[0], winTeam = this.team(winner), loseTeam = 1 - winTeam;
      const partner = (winner + 2) % 4;
      const pRank = order.indexOf(partner);
      const gain = [0, 3, 2, 1][pRank];
      const me = this.team(0) === winTeam;
      const sideName = t => t === 0 ? '你方' : '对方';
      const demote = t => { this.teamLevels[t] = 2; this.aFails[t] = 0; };
      const msgs = [`名次：${order.map((i, n) => (n + 1) + '.' + NAMES[i]).join('  ')}`, `${sideName(winTeam)} 头游`];
      let title;
      if (this.teamLevels[winTeam] === 14) {
        if (gain >= 2) {
          this.gameOver = true;
          title = me ? '🏆 你方过A，获胜！' : '😵 对方过A，你方失败';
          msgs.push(`${sideName(winTeam)}在 A 上${gain === 3 ? '双下' : '1、3名'}，过 A 获胜！`);
          this.onEvent(me ? 'victory' : 'defeat');
          this.showOverlay(title, msgs.join('\n'), () => this.newGame(), '再来一局');
          return;
        }
        this.aFails[winTeam]++;
        if (this.aFails[winTeam] >= 3) { demote(winTeam); msgs.push(`⚠ ${sideName(winTeam)}三次打 A 未过，降回 2 级！`); }
        else msgs.push(`${sideName(winTeam)}打 A 未过(1、4名)，第 ${this.aFails[winTeam]} 次，继续打 A`);
      } else {
        this.teamLevels[winTeam] = Math.min(14, this.teamLevels[winTeam] + gain);
        msgs.push(`升 ${gain} 级，至 ${valueName(this.teamLevels[winTeam])}`);
      }
      if (this.teamLevels[loseTeam] === 14) {
        this.aFails[loseTeam]++;
        if (this.aFails[loseTeam] >= 3) { demote(loseTeam); msgs.push(`⚠ ${sideName(loseTeam)}三次打 A 未过，降回 2 级！`); }
        else msgs.push(`${sideName(loseTeam)}打 A 未过(未得头游)，第 ${this.aFails[loseTeam]} 次`);
      }
      this.currentLevel = this.teamLevels[winTeam];
      title = (me ? '本局你方头游' : '本局对方头游') + ' — 下局打 ' + valueName(this.currentLevel);
      this.onEvent(me ? 'win' : 'defeat');
      this.showOverlay(title, msgs.join('\n'), () => { this.prevOrder = order; this.startDeal(); }, '下一局');
    }

    /* human actions */
    play() {
      if (this.returnMode) {
        const sel = this.players[0].hand.filter(c => this.selected.has(c.id));
        if (sel.length !== 1) { this.flash('请选一张牌还贡'); return; }
        const card = sel[0];
        if (card.joker || isWild(card, this.currentLevel) || card.rank > 10) { this.flash('还贡必须是一张不大于10的牌'); return; }
        this.selected.clear();
        const pr = this.returnMode; const h = this.players[pr.receiver].hand;
        this.players[pr.receiver].hand = h.filter(c => c.id !== card.id);
        this.players[pr.payer].hand.push(card);
        this.tributeMsgs.push(`你 还贡 ${this.cardName(card)} 给 ${NAMES[pr.payer]}`);
        this.returnMode = null; this.retIndex++; this.processReturns();
        return;
      }
      if (this.currentPlayer !== 0 || this.gameOver) return;
      const sel = this.players[0].hand.filter(c => this.selected.has(c.id));
      if (!sel.length) { this.flash('请选择要出的牌'); return; }
      const d = choosePlay(evaluateSelection(sel, this.currentLevel), this.lastPlay ? this.lastPlay.desc : null);
      if (!d) { this.flash(this.lastPlay ? '打不过上家 / 不是合法牌型' : '不是合法牌型'); return; }
      this.selected.clear();
      this.applyPlay(0, sel, d);
      this.afterAction();
    }
    pass() {
      if (this.currentPlayer !== 0 || this.gameOver || !this.lastPlay) return;
      this.selected.clear(); this.applyPass(0); this.afterAction();
    }
    hint() {
      if (this.currentPlayer !== 0) return;
      const req = this.lastPlay ? this.lastPlay.desc : null;
      const cand = [];
      for (const m of genMoves(this.players[0].hand, this.currentLevel)) {
        const d = choosePlay(evaluateSelection(m, this.currentLevel), null);
        if (d && compareBeat(d, req)) cand.push({ cards: m, desc: d });
      }
      if (!cand.length) { this.flash('没有能出的牌，建议「不出」'); return; }
      const norm = cand.filter(c => c.desc.category === 'normal'); const pool = norm.length ? norm : cand;
      pool.sort((a, b) => (a.desc.value - b.desc.value) || (a.cards.length - b.cards.length));
      this.selected = new Set(pool[0].cards.map(c => c.id));
      this.notify();
    }
    toggle(id) {
      if ((this.currentPlayer !== 0 && !this.returnMode) || this.gameOver) return;
      if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      this.onEvent('click');
      this.notify();
    }
    sort() { this.sortHand(this.players[0].hand); this.notify(); }
    showOverlay(title, body, cb, btn) { this.overlay = { title, body, btn: btn || '继续', cb }; this.notify(); }
    overlayContinue() { const o = this.overlay; this.overlay = null; if (o && o.cb) o.cb(); else this.notify(); }

    canPlay() { return this.returnMode ? true : (this.currentPlayer === 0 && !this.gameOver); }
    canPass() { return this.currentPlayer === 0 && !this.gameOver && !!this.lastPlay && !this.returnMode; }

    /* render snapshot */
    view() {
      const self = this;
      const lvl = this.currentLevel;
      const cm = c => ({ ...cardMeta(c), wild: isWild(c, lvl) });
      return {
        game: 'guandan',
        players: this.players.map(p => ({
          idx: p.idx, name: NAMES[p.idx], count: p.hand.length, finished: p.finished,
          lastShown: p.lastShown === 'pass' ? 'pass' : (Array.isArray(p.lastShown) ? p.lastShown.map(cm) : null),
          isTurn: self.currentPlayer === p.idx && !self.gameOver
        })),
        hand: this.players[0].hand.map(c => ({ ...cm(c), sel: self.selected.has(c.id) })),
        currentPlayer: this.currentPlayer,
        currentName: NAMES[this.currentPlayer],
        level: valueName(this.currentLevel),
        teamLevels: [valueName(this.teamLevels[0]), valueName(this.teamLevels[1])],
        aFails: this.aFails.slice(),
        needBeat: this.lastPlay ? descText(this.lastPlay.desc) : null,
        returnMode: !!this.returnMode,
        overlay: this.overlay ? { title: this.overlay.title, body: this.overlay.body, btn: this.overlay.btn } : null,
        logs: this.logs.slice(),
        canPlay: this.canPlay(), canPass: this.canPass(),
        gameOver: this.gameOver
      };
    }
    destroy() { if (this._timer) clearTimeout(this._timer); this._timer = null; }
  }
  function cardMeta(c) {
    // level-aware wildness computed lazily via closure not available; recompute against last known level is fine for display
    return {
      id: c.id, joker: c.joker,
      rank: c.joker ? (c.joker === 'B' ? '大' : '小') : rankText(c),
      suitSym: c.joker ? '王' : SUIT_SYM[c.suit],
      suit: c.suit,
      red: !!(c.joker || RED.has(c.suit))
    };
  }

  root.GuandanGame = GuandanGame;
})(typeof window !== 'undefined' ? window : this);
