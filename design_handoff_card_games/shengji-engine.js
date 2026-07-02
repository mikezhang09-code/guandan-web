/* Shengji / Tractor (升级·拖拉机) engine — DOM-free, adapted from mikezhang09-code/guandan-web.
   All game state lives on the instance so multiple games can run at once.
   new ShengjiGame({ onUpdate, onEvent }); .newGame();  read .view(); actions: toggle/declare/confirmDeclare/bury/play/hint. */
(function (root) {
  const SUITS = ['S', 'H', 'C', 'D'], SUIT_SYM = { S: '♠', H: '♥', C: '♣', D: '♦' }, RED = new Set(['H', 'D']);
  const SUIT_NAME = { S: '黑桃', H: '红桃', C: '梅花', D: '方块', NT: '无主' };
  const NAMES = ['你', '左家', '对家', '右家'];
  const team = i => i % 2;
  let uid = 0;
  function makeDeck() {
    const d = []; for (let k = 0; k < 2; k++) {
      for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ id: uid++, suit: s, rank: r, joker: null });
      d.push({ id: uid++, suit: 'J', rank: null, joker: 'S' }); d.push({ id: uid++, suit: 'J', rank: null, joker: 'B' });
    } return d;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function pts(c) { return c.rank === 5 ? 5 : (c.rank === 10 || c.rank === 13) ? 10 : 0; }
  function rankText(c) { if (c.joker) return c.joker === 'B' ? '大' : '小'; return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.rank] || '' + c.rank; }

  class ShengjiGame {
    constructor(opts) {
      opts = opts || {};
      this.onUpdate = opts.onUpdate || function () {};
      this.onEvent = opts.onEvent || function () {};
      this.logs = [];
      this.overlay = null;
      this.selected = new Set();
      this._timers = [];
      this.teamLevels = [2, 2]; this.declarerTeam = 0; this.declarerSeat = 0;
      this.level = 2; this.trumpSuit = 'NT'; this.SEQ = []; this.SEQIDX = {};
      this.players = []; this.kitty = []; this.gameOver = false;
      this.phase = ''; this.trick = []; this.trickOrder = []; this.turnPos = 0; this.leadSeat = 0; this.lastTrickInfo = null;
      this.teamPoints = [0, 0];
      this.declaration = null; this.firstDeal = true; this.declareLeft = 0;
    }
    notify() { this.onUpdate(); }
    log(t) { this.logs.unshift(t); this.logs = this.logs.slice(0, 8); }
    flash(t) { this.log('⚠ ' + t); this.onEvent('warn'); this.notify(); }
    later(fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; }
    clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; }
    destroy() { this.clearTimers(); if (this._flashTimer) clearTimeout(this._flashTimer); }

    buildSeq() { this.SEQ = []; this.SEQIDX = {}; for (let r = 2; r <= 14; r++) if (r !== this.level) this.SEQ.push(r); this.SEQ.forEach((r, i) => this.SEQIDX[r] = i); }

    isTrump(c) { return !!c.joker || c.rank === this.level || (this.trumpSuit !== 'NT' && c.suit === this.trumpSuit); }
    effSuit(c) { return this.isTrump(c) ? 'T' : c.suit; }
    tval(c) {
      if (c.joker === 'B') return 1006; if (c.joker === 'S') return 1005;
      if (c.rank === this.level) return c.suit === this.trumpSuit ? 1004 : 1003;
      if (this.isTrump(c)) return 100 + c.rank;
      return c.rank;
    }
    sameCard(a, b) { return a.joker ? a.joker === b.joker : (!b.joker && a.rank === b.rank && a.suit === b.suit); }
    tractorVal(c) {
      if (this.isTrump(c)) {
        if (c.joker === 'B') return 15;
        if (c.joker === 'S') return 14;
        if (c.rank === this.level) return (this.trumpSuit !== 'NT' && c.suit === this.trumpSuit) ? 13 : 12;
        return this.SEQIDX[c.rank];
      }
      return this.SEQIDX[c.rank];
    }
    asTractor(cards, g) {
      if (cards.some(c => this.effSuit(c) !== g)) return null;
      const byKey = {};
      cards.forEach(c => { const k = c.joker ? c.joker : (c.suit + '_' + c.rank); (byKey[k] = byKey[k] || []).push(c); });
      const ranks = [];
      for (const k in byKey) { if (byKey[k].length !== 2) return null; ranks.push(this.tractorVal(byKey[k][0])); }
      if (ranks.length !== cards.length / 2) return null;
      ranks.sort((a, b) => a - b);
      for (let i = 1; i < ranks.length; i++) if (ranks[i] - ranks[i - 1] !== 1) return null;
      let maxVal = -1; cards.forEach(c => { const v = this.tval(c); if (v > maxVal) maxVal = v; });
      return { type: 'tractor', size: cards.length, group: g, topVal: maxVal };
    }
    detectCombo(cards) {
      if (!cards.length) return null;
      const g = this.effSuit(cards[0]); if (cards.some(c => this.effSuit(c) !== g)) return null;
      if (cards.length === 1) return { type: 'single', size: 1, group: g, topVal: this.tval(cards[0]) };
      if (cards.length === 2 && this.sameCard(cards[0], cards[1])) return { type: 'pair', size: 2, group: g, topVal: this.tval(cards[0]) };
      if (cards.length >= 4 && cards.length % 2 === 0) { const t = this.asTractor(cards, g); if (t) return t; }
      return null;
    }
    inGroup(c, group) { return group === 'T' ? this.isTrump(c) : (!this.isTrump(c) && c.suit === group); }
    hasPair(cards, group) { const m = {}; for (const c of cards) { if (!this.inGroup(c, group)) continue; const k = c.suit + c.rank + (c.joker || ''); if (m[k]) return true; m[k] = 1; } return false; }
    countPairs(cards, group) { const m = {}; let n = 0; for (const c of cards) { if (!this.inGroup(c, group)) continue; const k = c.suit + '_' + (c.joker || c.rank); m[k] = (m[k] || 0) + 1; if (m[k] % 2 === 0) n++; } return n; }
    validateFollow(sel, hand, lead) {
      if (sel.length !== lead.size) return { ok: false, why: `需要出 ${lead.size} 张` };
      const G = hand.filter(c => this.inGroup(c, lead.group)), need = Math.min(lead.size, G.length);
      const selG = sel.filter(c => this.inGroup(c, lead.group)).length;
      if (selG !== need) return { ok: false, why: `必须跟 ${need} 张${lead.group === 'T' ? '主牌' : SUIT_NAME[lead.group]}` };
      if (lead.type === 'pair' && G.length >= 2 && this.hasPair(hand, lead.group) && !this.hasPair(sel, lead.group)) return { ok: false, why: '有对子时必须出对子' };
      if (lead.type === 'tractor') { const needPairs = Math.min(lead.size / 2, this.countPairs(hand, lead.group)); if (this.countPairs(sel, lead.group) < needPairs) return { ok: false, why: `有对子时必须尽量用对子跟` }; }
      if (lead.type === 'throw' && lead.pairs > 0) { const needPairs = Math.min(lead.pairs, this.countPairs(hand, lead.group)); if (this.countPairs(sel, lead.group) < needPairs) return { ok: false, why: `有对子时必须跟够 ${needPairs} 个对子` }; }
      return { ok: true };
    }
    forcedFollow(hand, lead) {
      const G = hand.filter(c => this.inGroup(c, lead.group)).slice().sort((a, b) => this.tval(a) - this.tval(b));
      const need = Math.min(lead.size, G.length), out = [];
      const needPairs = lead.type === 'pair' ? 1 : lead.type === 'tractor' ? Math.min(lead.size / 2, this.countPairs(G, lead.group)) : (lead.type === 'throw' ? (lead.pairs || 0) : 0);
      if (needPairs > 0) {
        const m = {}; const got = [];
        for (const c of G) { const k = c.suit + c.rank + (c.joker || ''); if (m[k]) { got.push(m[k], c); m[k] = null; if (got.length / 2 >= needPairs) break; } else m[k] = c; }
        for (const c of got) { if (out.length < need) out.push(c); }
      }
      for (const c of G) { if (out.length >= need) break; if (!out.includes(c)) out.push(c); }
      if (out.length < lead.size) { const others = hand.filter(c => !this.inGroup(c, lead.group) && !out.includes(c)).sort((a, b) => pts(a) - pts(b) || this.tval(a) - this.tval(b)); while (out.length < lead.size && others.length) out.push(others.shift()); }
      return out.slice(0, lead.size);
    }
    trickWinner() {
      const lead = this.trick[0].combo;
      if (lead && lead.type === 'throw') {
        let winner = this.trick[0].seat, ruffed = false, ruffTop = -1; const N = lead.size;
        for (let i = 1; i < this.trick.length; i++) { const t = this.trick[i]; if (lead.group !== 'T' && t.cards.length === N && t.cards.every(c => this.isTrump(c))) { const top = Math.max(...t.cards.map(c => this.tval(c))); if (!ruffed || top > ruffTop) { ruffed = true; ruffTop = top; winner = t.seat; } } }
        return winner;
      }
      let best = { combo: this.trick[0].combo, seat: this.trick[0].seat };
      for (let i = 1; i < this.trick.length; i++) {
        const c = this.trick[i].combo; if (!c) continue;
        if (c.type !== best.combo.type || c.size !== best.combo.size) continue;
        const bT = best.combo.group === 'T', cT = c.group === 'T';
        if (cT && !bT) best = { combo: c, seat: this.trick[i].seat };
        else if (c.group === best.combo.group && c.topVal > best.combo.topVal) best = { combo: c, seat: this.trick[i].seat };
      }
      return best.seat;
    }
    suitOrder(c) { if (this.isTrump(c)) return 0; return { S: 1, H: 2, C: 3, D: 4 }[c.suit]; }
    sortHand(h) { h.sort((a, b) => this.suitOrder(a) - this.suitOrder(b) || this.tval(b) - this.tval(a) || a.suit.localeCompare(b.suit)); }

    /* ===== flow ===== */
    newGame() { this.clearTimers(); this.teamLevels = [2, 2]; this.declarerTeam = 0; this.declarerSeat = 0; this.gameOver = false; this.firstDeal = true; this.startDeal(); }
    startDeal() {
      this.clearTimers();
      this.level = this.teamLevels[this.declarerTeam]; this.buildSeq();
      this.trumpSuit = 'NT'; this.declaration = null;
      this.dealPile = shuffle(makeDeck());
      this.dealIdx = 0; this.kitty = [];
      this.players = [0, 1, 2, 3].map(i => ({ idx: i, hand: [], lastShown: null }));
      this.teamPoints = [0, 0]; this.selected.clear(); this.trick = []; this.lastTrickInfo = null;
      this.phase = 'deal';
      this.onEvent('deal');
      this.log(`开始发牌，打 ${rankText({ rank: this.level })}　摸到级牌或王对可亮主 / 反主`);
      this.notify();
      this.later(() => this._dealTick(), 420);
    }
    _dealTick() {
      if (this.phase !== 'deal') return;
      const perTick = 2;
      for (let k = 0; k < perTick && this.dealIdx < 100; k++) {
        this.players[this.dealIdx % 4].hand.push(this.dealPile[this.dealIdx]);
        this.dealIdx++;
        if (this.dealIdx % 7 === 0) this.onEvent('tick');
      }
      this.players.forEach(p => this.sortHand(p.hand));
      // players only start eyeing trump once they hold enough cards
      if (this.dealIdx >= 20) this.aiMaybeDeclare(0.12);
      this.notify();
      if (this.dealIdx >= 100) { this.kitty = this.dealPile.slice(100); this.enterGrabWindow(); return; }
      this.later(() => this._dealTick(), 130);
    }
    enterGrabWindow() {
      this.phase = 'declare'; this.declareLeft = 4; this.notify(); this._tickDeclare();
    }
    skipDeal() {
      if (this.phase !== 'deal') return;
      this.clearTimers();
      while (this.dealIdx < 100) { this.players[this.dealIdx % 4].hand.push(this.dealPile[this.dealIdx]); this.dealIdx++; }
      this.players.forEach(p => this.sortHand(p.hand));
      this.kitty = this.dealPile.slice(100);
      this.aiMaybeDeclare(0.6);
      this.enterGrabWindow();
    }
    _tickDeclare() {
      if (this.phase !== 'declare') return;
      if (this.declareLeft <= 0) { this.finishDeclare(); return; }
      this.aiMaybeDeclare(0.45);
      this.declareLeft--;
      this.notify();
      this.later(() => this._tickDeclare(), 1000);
    }
    declareOptions(seat) {
      const h = this.players[seat].hand, opts = [];
      for (const s of SUITS) { const n = h.filter(c => !c.joker && c.rank === this.level && c.suit === s).length; if (n >= 1) opts.push({ suit: s, strength: n >= 2 ? 2 : 1 }); }
      const bj = h.filter(c => c.joker === 'B').length, sj = h.filter(c => c.joker === 'S').length;
      if (bj >= 2) opts.push({ suit: 'NT', strength: 4 }); else if (sj >= 2) opts.push({ suit: 'NT', strength: 3 });
      return opts;
    }
    canDeclare(seat, suit, strength) {
      if (!this.declaration) return true;
      if (strength <= this.declaration.strength) return false;
      if (this.declaration.seat === seat && suit !== this.declaration.suit) return false;
      return true;
    }
    setDeclaration(seat, suit, strength) {
      const isCounter = !!this.declaration;
      this.declaration = { seat, suit, strength };
      this.trumpSuit = suit;
      const sName = suit === 'NT' ? '无主' : SUIT_NAME[suit];
      this.log(`${NAMES[seat]} ${isCounter ? '反主' : '亮主'} ${sName}`);
      this.declFlash = { seat: seat, name: NAMES[seat], action: isCounter ? '反主' : '亮主', suitName: sName, suit: suit, me: seat === 0, counter: isCounter };
      if (this._flashTimer) clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => { this.declFlash = null; this.notify(); }, 1800);
      this.onEvent('declare');
      this.players.forEach(p => this.sortHand(p.hand));
    }
    aiMaybeDeclare(rate) {
      rate = rate == null ? 1 : rate;
      for (let seat = 1; seat < 4; seat++) {
        const opts = this.declareOptions(seat).filter(o => this.canDeclare(seat, o.suit, o.strength));
        if (!opts.length) continue;
        const h = this.players[seat].hand;
        const suitLen = o => o.suit === 'NT' ? h.filter(c => c.joker).length : h.filter(c => !c.joker && c.suit === o.suit).length;
        let best = null, bestScore = -1;
        for (const o of opts) { const sc = o.strength * 100 + suitLen(o); if (sc > bestScore) { bestScore = sc; best = o; } }
        const counter = !!this.declaration && this.declaration.seat !== seat;
        let base;
        if (best.strength >= 3) base = 0.75;
        else if (best.strength === 2) base = 0.55;
        else {
          const len = suitLen(best); if (len < 4) continue;
          // concentration matters more than raw count: 4 of a suit when the hand
          // is still small (early deal) is very promising; 4 when the hand is
          // large (late deal) is ordinary. hand length is the deal-progress proxy.
          const share = len / (h.length || 1);
          base = 0.10 + (len - 4) * 0.05 + Math.max(0, share - 0.26) * 1.6;
        }
        if (counter) base *= 1.2;
        if (Math.random() < Math.min(1, base * rate)) this.setDeclaration(seat, best.suit, best.strength);
      }
    }
    humanDeclare(suit, strength) {
      if ((this.phase !== 'declare' && this.phase !== 'deal') || !this.canDeclare(0, suit, +strength)) return;
      this.setDeclaration(0, suit, +strength);
      this.notify();
    }
    confirmDeclare() { if (this.phase !== 'declare') return; this.clearTimers(); this.finishDeclare(); }
    finishDeclare() {
      this.clearTimers();
      if (this.declaration) { this.trumpSuit = this.declaration.suit; if (this.firstDeal) { this.declarerSeat = this.declaration.seat; this.declarerTeam = team(this.declarerSeat); } }
      else { this.trumpSuit = 'NT'; if (this.firstDeal) { this.declarerSeat = 0; this.declarerTeam = 0; } }
      this.firstDeal = false;
      this.level = this.teamLevels[this.declarerTeam]; this.buildSeq();
      this.players.forEach(p => this.sortHand(p.hand));
      this.log(`主牌：${this.trumpSuit === 'NT' ? '无主' : SUIT_NAME[this.trumpSuit]}　庄家：${NAMES[this.declarerSeat]}`);
      const d = this.players[this.declarerSeat]; d.hand.push(...this.kitty); this.kitty = []; this.sortHand(d.hand);
      this.phase = 'bury'; this.notify(); this.beginBury();
    }
    beginBury() {
      if (this.declarerSeat !== 0) { this.later(() => this.aiBury(), 700); this.log(NAMES[this.declarerSeat] + ' 拿底牌，正在埋底…'); this.notify(); return; }
      this.log('你拿到底牌，请选 8 张埋入底牌（避免埋分牌/主牌）'); this.notify();
    }
    confirmBury() {
      if (this.selected.size !== 8) { this.flash('请正好选择 8 张'); return; }
      const d = this.players[0]; this.kitty = d.hand.filter(c => this.selected.has(c.id));
      d.hand = d.hand.filter(c => !this.selected.has(c.id)); this.selected.clear(); this.sortHand(d.hand);
      this.onEvent('play'); this.startPlay();
    }
    aiBury() {
      const d = this.players[this.declarerSeat]; const hand = d.hand;
      const suitCounts = {}; hand.forEach(c => { const s = this.isTrump(c) ? 'T' : c.suit; suitCounts[s] = (suitCounts[s] || 0) + 1; });
      const pairKeys = new Set(); const m = {};
      hand.forEach(c => { const k = c.joker ? c.joker : (c.suit + '_' + c.rank); m[k] = (m[k] || 0) + 1; if (m[k] === 2) pairKeys.add(k); });
      const getBuryScore = c => {
        let score = 0; const isT = this.isTrump(c);
        if (isT) score += 1000; else { const len = suitCounts[c.suit] || 0; if (len <= 2) score -= 150; else if (len >= 6) score += 50; }
        const p = pts(c); if (p === 5) score += 100; else if (p === 10) score += 200;
        const k = c.joker ? c.joker : (c.suit + '_' + c.rank); if (pairKeys.has(k)) score += 300;
        if (!isT) { if (c.rank === 14) score += 300; else if (c.rank === 13) score += 150; else if (c.rank === 12) score += 80; else if (c.rank === 11) score += 40; else score += c.rank; } else score += this.tval(c);
        return score;
      };
      const cand = hand.slice().sort((a, b) => getBuryScore(a) - getBuryScore(b));
      this.kitty = cand.slice(0, 8);
      const ids = new Set(this.kitty.map(c => c.id));
      d.hand = hand.filter(c => !ids.has(c.id)); this.sortHand(d.hand);
      this.startPlay();
    }
    startPlay() { this.phase = 'play'; this.leadSeat = this.declarerSeat; this.startTrick(this.leadSeat); }
    startTrick(lead) { this.trick = []; this.trickOrder = [lead, (lead + 1) % 4, (lead + 2) % 4, (lead + 3) % 4]; this.turnPos = 0; this.players.forEach(q => q.lastShown = null); this.notify(); this.takeTurn(); }
    computeLeader() { if (!this.trick.length) return null; return this.trickWinner(); }
    takeTurn() {
      if (this.turnPos >= 4) { return this.resolveTrick(); }
      const seat = this.trickOrder[this.turnPos];
      this.notify();
      if (seat === 0) return;
      this.later(() => { const cards = this.turnPos === 0 ? this.aiLead(seat) : this.aiFollow(seat); this.commit(seat, cards); }, 980);
    }
    commit(seat, cards) {
      const p = this.players[seat]; const ids = new Set(cards.map(c => c.id));
      p.hand = p.hand.filter(c => !ids.has(c.id)); p.lastShown = cards.slice();
      let combo;
      if (this.turnPos === 0) { combo = this.detectCombo(cards); if (!combo) { const tw = this.validateThrow(cards); if (tw.ok) combo = this.makeThrowCombo(cards, tw.group); } }
      else combo = this.detectCombo(cards);
      this.trick.push({ seat, cards: cards.slice(), combo });
      this.log(`${NAMES[seat]} 出 ${cards.map(rankText).join('')}`);
      this.onEvent('play');
      this.turnPos++; this.takeTurn();
    }
    resolveTrick() {
      this.notify();
      const w = this.trickWinner(); const wt = team(w);
      let p = 0; this.trick.forEach(t => t.cards.forEach(c => p += pts(c)));
      this.teamPoints[wt] += p;
      this.trickWin = w; this.lastTrickPts = p;
      this.lastTrickInfo = { winner: w, size: this.trick[0].cards.length, combo: this.trick[0].combo };
      this.log(`${NAMES[w]} 赢墩` + (p ? `，得 ${p} 分` : ''));
      this.onEvent(wt === team(0) ? 'win' : 'pass');
      this.notify();
      const done = this.players.every(pl => pl.hand.length === 0);
      this.later(() => { this.trickWin = null; this.lastTrickPts = 0; if (done) this.endDeal(); else this.startTrick(w); }, 1600);
    }

    /* ===== AI ===== */
    groupPairs(G) { const m = {}, res = []; for (const c of G) { const k = c.suit + c.rank + (c.joker || ''); if (m[k]) { res.push([m[k], c]); m[k] = null; } else m[k] = c; } return res.sort((a, b) => this.tval(a[0]) - this.tval(b[0])); }
    pairsInSeq(G) {
      const byRank = {};
      G.forEach(c => { if (this.effSuit(c) === 'T' && (c.joker || c.rank === this.level || c.suit !== this.trumpSuit)) return; const k = c.suit + c.rank; (byRank[k] = byRank[k] || []).push(c); });
      const pairs = Object.values(byRank).filter(a => a.length >= 2).map(a => [a[0], a[1]]);
      pairs.sort((a, b) => this.SEQIDX[a[0].rank] - this.SEQIDX[b[0].rank]); return pairs;
    }
    adjacentPair(a, b) { return a.suit === b.suit && this.SEQIDX[a.rank] - this.SEQIDX[b.rank] === 1; }
    tractorsOf(G, size) { const need = size / 2, pairs = this.pairsInSeq(G); const res = []; for (let i = 0; i + need <= pairs.length; i++) { let ok = true; for (let j = 1; j < need; j++) if (!this.adjacentPair(pairs[i + j][0], pairs[i + j - 1][0])) { ok = false; break; } if (ok) res.push(pairs.slice(i, i + need).flat()); } return res; }
    longestTractor(G) { const pairs = this.pairsInSeq(G); let best = [], run = []; for (let i = 0; i < pairs.length; i++) { if (i > 0 && !this.adjacentPair(pairs[i][0], pairs[i - 1][0])) run = []; run.push(pairs[i]); if (run.length >= 2 && run.length > best.length) best = run.slice(); } return best.length ? best.flat() : null; }
    aiLead(seat) {
      const hand = this.players[seat].hand;
      const tw = this.bestThrow(seat); if (tw) return tw;
      const nonTr = hand.filter(c => !this.isTrump(c));
      const ntr = this.safeTractor(nonTr, seat); if (ntr) return ntr;
      const npairs = this.groupPairs(nonTr);
      if (npairs.length) { npairs.sort((a, b) => this.tval(b[0]) - this.tval(a[0])); if (this.tval(npairs[0][0]) >= 13 && (pts(npairs[0][0]) === 0 || !this.anyOpponentBeats(npairs[0], seat))) return npairs[0]; }
      const aces = nonTr.filter(c => c.rank === 14); if (aces.length) return [aces[0]];
      const T = hand.filter(c => this.isTrump(c));
      const oppTrumpMax = Math.max(0, ...this.players.filter(p => p.idx !== seat).map(p => p.hand.filter(c => this.isTrump(c)).length));
      if (T.length > oppTrumpMax + 1) {
        const ttr = this.safeTractor(T, seat); if (ttr) return ttr;
        const tprFull = this.groupPairs(T);
        if (tprFull.length) { tprFull.sort((a, b) => this.tval(b[0]) - this.tval(a[0])); if (pts(tprFull[0][0]) === 0 || !this.anyOpponentBeats(tprFull[0], seat)) return tprFull[0]; }
        const Tsafe = T.filter(c => pts(c) === 0);
        const tpr = this.groupPairs(Tsafe); if (tpr.length) { tpr.sort((a, b) => this.tval(b[0]) - this.tval(a[0])); return tpr[0]; }
        const tsingFull = T.slice().sort((a, b) => this.tval(b) - this.tval(a));
        if (tsingFull.length && (pts(tsingFull[0]) === 0 || !this.anyOpponentBeats([tsingFull[0]], seat))) return [tsingFull[0]];
        const tsing = Tsafe.sort((a, b) => this.tval(b) - this.tval(a)); if (tsing.length) return [tsing[0]];
      }
      if (npairs.length) { const safePair = npairs.find(pr => pts(pr[0]) === 0 || !this.anyOpponentBeats(pr, seat)); if (safePair) return safePair; }
      const pool = (nonTr.length ? nonTr : hand).slice().sort((a, b) => pts(a) - pts(b) || this.tval(a) - this.tval(b));
      return [pool[0]];
    }
    aiFollow(seat) {
      const hand = this.players[seat].hand, lead = this.trick[0].combo;
      if (lead.type === 'throw') return this.forcedFollow(hand, lead);
      let bcombo = null, bseat = this.trick[0].seat;
      { let b = this.trick[0]; for (const t of this.trick) { if (!t.combo) continue; const bT = b.combo && b.combo.group === 'T', cT = t.combo.group === 'T'; if (cT && !bT) b = t; else if (t.combo && b.combo && t.combo.group === b.combo.group && t.combo.topVal > b.combo.topVal) b = t; } bcombo = b.combo; bseat = b.seat; }
      const best = { combo: bcombo, seat: bseat };
      const oppWin = team(best.seat) !== team(seat), mateWin = !oppWin && best.seat !== seat;
      const G = hand.filter(c => this.inGroup(c, lead.group)).sort((a, b) => this.tval(a) - this.tval(b));
      const beats = cards => { const c = this.detectCombo(cards); if (!c || c.type !== lead.type || c.size !== lead.size) return false; if (c.group === 'T' && best.combo.group !== 'T') return true; return c.group === best.combo.group && c.topVal > best.combo.topVal; };
      const isLastPlayer = (this.turnPos === 3);
      const partnerWinsDefinitively = mateWin && (isLastPlayer || best.combo.topVal >= 1005);
      const notOvertake = v => v < best.combo.topVal;
      let chosen = null;
      if (G.length >= lead.size) {
        if (lead.type === 'single') {
          if (oppWin) { const c = G.filter(x => beats([x]))[0]; if (c) chosen = [c]; }
          if (!chosen) { const pool = mateWin && G.some(c => notOvertake(this.tval(c))) ? G.filter(c => notOvertake(this.tval(c))) : G; const s = pool.slice().sort((a, b) => partnerWinsDefinitively ? (pts(b) - pts(a) || this.tval(a) - this.tval(b)) : (pts(a) - pts(b) || this.tval(a) - this.tval(b))); chosen = [s[0]]; }
        } else if (lead.type === 'pair') {
          const prs = this.groupPairs(G);
          if (oppWin) { const c = prs.find(p => beats(p)); if (c) chosen = c; }
          if (!chosen) { if (prs.length) { if (mateWin) { const pool = prs.some(p => notOvertake(this.tval(p[0]))) ? prs.filter(p => notOvertake(this.tval(p[0]))) : prs; chosen = pool.slice().sort((a, b) => partnerWinsDefinitively ? (pts(b[0]) - pts(a[0]) || this.tval(a[0]) - this.tval(b[0])) : (pts(a[0]) - pts(b[0]) || this.tval(a[0]) - this.tval(b[0])))[0]; } else chosen = prs[0]; } else { const s = G.slice().sort((a, b) => partnerWinsDefinitively ? (pts(b) - pts(a)) : (pts(a) - pts(b)) || this.tval(a) - this.tval(b)); chosen = [s[0], s[1]]; } }
        } else { const trs = this.tractorsOf(G, lead.size); if (oppWin) { const c = trs.find(t => beats(t)); if (c) chosen = c; } if (!chosen) chosen = trs[0] || G.slice(0, lead.size); }
      } else if (G.length === 0) {
        const trickPts = this.trick.reduce((s, t) => s + t.cards.reduce((s2, c) => s2 + pts(c), 0), 0);
        const worthRuffing = trickPts > 0 || hand.length === lead.size || (isLastPlayer && this.teamPoints[1 - this.declarerTeam] >= 75);
        if (oppWin && worthRuffing) {
          const T = hand.filter(c => this.isTrump(c)).sort((a, b) => this.tval(a) - this.tval(b));
          if (lead.type === 'single' && T.length) { const c = T.find(x => beats([x])); if (c) chosen = [c]; }
          else if (lead.type === 'pair') { const tp = this.groupPairs(T).find(p => beats(p)); if (tp) chosen = tp; }
          else { const tt = this.tractorsOf(T, lead.size).find(t => beats(t)); if (tt) chosen = tt; }
        }
        if (!chosen) { const pool = hand.slice().sort((a, b) => partnerWinsDefinitively ? (pts(b) - pts(a)) : (pts(a) - pts(b)) || this.tval(a) - this.tval(b)); chosen = pool.slice(0, lead.size); }
      } else {
        const need = lead.size - G.length;
        const sortFillers = cs => cs.sort((a, b) => partnerWinsDefinitively ? (pts(b) - pts(a)) : (pts(a) - pts(b)) || this.tval(a) - this.tval(b));
        const otherNonTrump = sortFillers(hand.filter(c => !this.inGroup(c, lead.group) && !this.isTrump(c)));
        const fillers = otherNonTrump.length >= need ? otherNonTrump : sortFillers(hand.filter(c => !this.inGroup(c, lead.group)));
        chosen = [...G, ...fillers.slice(0, need)];
      }
      if (!chosen || !this.validateFollow(chosen, hand, lead).ok) chosen = this.forcedFollow(hand, lead);
      return chosen;
    }
    validateThrow(sel) {
      if (sel.length < 2) return { ok: false, why: '请出单张/对子/连对，或同花色多张甩牌' };
      const g = this.isTrump(sel[0]) ? 'T' : sel[0].suit;
      if (!sel.every(c => this.inGroup(c, g))) return { ok: false, why: '甩牌必须是同一门花色（或全是主牌）' };
      return { ok: true, group: g };
    }
    decomposeThrow(sel) { const byKey = {}; sel.forEach(c => { const k = c.suit + '_' + (c.joker || c.rank); (byKey[k] = byKey[k] || []).push(c); }); const pairs = [], singles = []; for (const k in byKey) { const a = byKey[k]; let i = 0; for (; i + 1 < a.length; i += 2) pairs.push(a[i]); if (i < a.length) singles.push(a[i]); } return { pairs, singles }; }
    oppMaxPairVal(og) { const m = {}; let best = -1; for (const c of og) { const k = c.suit + '_' + (c.joker || c.rank); m[k] = (m[k] || 0) + 1; if (m[k] >= 2) best = Math.max(best, this.tval(c)); } return best; }
    smallestOf(sel) { return sel.slice().sort((a, b) => this.tval(a) - this.tval(b))[0]; }
    makeThrowCombo(sel, group) { const { pairs } = this.decomposeThrow(sel); return { type: 'throw', size: sel.length, group, topVal: Math.max(...sel.map(c => this.tval(c))), pairs: pairs.length }; }
    throwBeatable(sel, group, seat) {
      const { pairs, singles } = this.decomposeThrow(sel);
      const opps = this.players.filter(p => p.idx !== seat);
      for (const opp of opps) {
        const og = opp.hand.filter(c => this.inGroup(c, group)); if (!og.length) continue;
        const maxSingle = Math.max(...og.map(c => this.tval(c)));
        for (const s of singles) if (maxSingle > this.tval(s)) return this.smallestOf(sel);
        if (pairs.length) { const mp = this.oppMaxPairVal(og); for (const p of pairs) if (mp > this.tval(p)) return this.smallestOf(sel); }
      }
      return null;
    }
    bestThrow(seat) {
      const opps = this.players.filter(p => p.idx !== seat), hand = this.players[seat].hand; let pick = null;
      for (const s of SUITS) {
        const mine = hand.filter(c => !this.isTrump(c) && c.suit === s); if (mine.length < 2) continue;
        if (opps.some(p => !p.hand.some(c => !this.isTrump(c) && c.suit === s))) continue;
        const oppMax = Math.max(-1, ...opps.flatMap(p => p.hand.filter(c => !this.isTrump(c) && c.suit === s).map(c => this.tval(c))));
        const safe = mine.filter(c => this.tval(c) > oppMax);
        if (safe.length >= 2 && (!pick || safe.length > pick.length)) pick = safe;
      }
      return pick;
    }
    anyOpponentBeats(cards, seat) {
      const combo = this.detectCombo(cards); if (!combo) return true;
      const group = combo.group;
      const opps = this.players.filter(p => team(p.idx) !== team(seat));
      for (const opp of opps) {
        const inSuit = opp.hand.filter(c => this.inGroup(c, group));
        if (inSuit.length >= combo.size) {
          if (combo.type === 'single') { if (Math.max(...inSuit.map(c => this.tval(c))) > combo.topVal) return true; }
          else if (combo.type === 'pair') { if (this.oppMaxPairVal(inSuit) > combo.topVal) return true; }
          else { if (this.tractorsOf(inSuit, combo.size).some(t => Math.max(...t.map(c => this.tval(c))) > combo.topVal)) return true; }
        } else if (group !== 'T' && inSuit.length === 0) {
          const T = opp.hand.filter(c => this.isTrump(c));
          if (T.length >= combo.size) {
            if (combo.type === 'single') { if (T.length) return true; }
            else if (combo.type === 'pair') { if (this.oppMaxPairVal(T) >= 0) return true; }
            else { if (this.tractorsOf(T, combo.size).length) return true; }
          }
        }
      }
      return false;
    }
    safeTractor(pool, seat) {
      const full = this.longestTractor(pool);
      if (full && (full.every(c => pts(c) === 0) || !this.anyOpponentBeats(full, seat))) return full;
      return this.longestTractor(pool.filter(c => pts(c) === 0));
    }

    /* ===== settle ===== */
    endDeal() {
      const def = 1 - this.declarerTeam;
      let defPts = this.teamPoints[def];
      const kittyPts = this.kitty.reduce((s, c) => s + pts(c), 0);
      let bonusLine = '';
      if (this.lastTrickInfo && team(this.lastTrickInfo.winner) === def && kittyPts > 0) {
        const mult = 2 * (this.lastTrickInfo.size || 1);
        const bonus = kittyPts * mult;
        defPts += bonus;
        bonusLine = `闲家赢末墩，扣底 ${kittyPts} 分 ×${mult} = ${bonus} 分`;
      }
      const msgs = [`闲家共得 ${defPts} 分（保 80）`];
      if (bonusLine) msgs.push(bonusLine);
      let winTeam, up;
      if (defPts < 80) { winTeam = this.declarerTeam; up = defPts === 0 ? 3 : (defPts < 40 ? 2 : 1); msgs.push(`庄家守住 80 分线，升 ${up} 级`); }
      else { winTeam = def; up = Math.floor((defPts - 80) / 40); msgs.push(up > 0 ? `闲家上台并升 ${up} 级` : `闲家上台（未升级）`); }
      const me = team(0) === winTeam;
      const sideName = t => t === 0 ? '你方' : '对方';
      let title, over = false;
      if (this.teamLevels[winTeam] === 14 && up >= 1) {
        over = true; this.gameOver = true;
        title = me ? '🏆 你方过 A，获胜！' : '😵 对方过 A，你方失败';
        msgs.push(`${sideName(winTeam)}在 A 上再升级，过 A 获胜！`);
      } else {
        this.teamLevels[winTeam] = Math.min(14, this.teamLevels[winTeam] + up);
        // next dealer
        if (winTeam === this.declarerTeam) this.declarerSeat = (this.declarerSeat + 2) % 4; // partner deals
        else this.declarerSeat = (this.declarerSeat + 1) % 4; // 上台: next seat (opponent)
        this.declarerTeam = team(this.declarerSeat);
        title = `${sideName(winTeam)}${winTeam === def ? '上台' : '连庄'} — 下局打 ${rankText({ rank: this.teamLevels[this.declarerTeam] })}`;
      }
      this.onEvent(me ? (over ? 'victory' : 'win') : 'defeat');
      this.showOverlay(over ? title : title, msgs.join('\n'), () => { if (over) this.newGame(); else this.startDeal(); }, over ? '再来一局' : '下一局');
    }

    /* ===== human ===== */
    play() {
      if (this.phase === 'bury') { this.confirmBury(); return; }
      if (!(this.phase === 'play' && this.trickOrder[this.turnPos] === 0)) return;
      const sel = this.players[0].hand.filter(c => this.selected.has(c.id));
      if (!sel.length) { this.flash('请选择要出的牌'); return; }
      if (this.turnPos === 0) {
        const c = this.detectCombo(sel);
        if (!c) {
          const tw = this.validateThrow(sel); if (!tw.ok) { this.flash(tw.why); return; }
          const fail = this.throwBeatable(sel, tw.group, 0);
          if (fail) { const nm = fail.joker ? (fail.joker === 'B' ? '大王' : '小王') : (SUIT_SYM[fail.suit] + rankText(fail)); this.flash(`甩牌失败：${nm} 可能被压，强制出最小`); this.selected.clear(); this.commit(0, [fail]); return; }
        }
      } else { const v = this.validateFollow(sel, this.players[0].hand, this.trick[0].combo); if (!v.ok) { this.flash(v.why); return; } }
      this.selected.clear(); this.commit(0, sel);
    }
    hint() {
      if (this.phase === 'bury') { // suggest 8 lowest non-trump non-point cards
        const d = this.players[0]; const cand = d.hand.slice().sort((a, b) => (this.isTrump(a) ? 1 : 0) - (this.isTrump(b) ? 1 : 0) || pts(a) - pts(b) || this.tval(a) - this.tval(b));
        this.selected = new Set(cand.slice(0, 8).map(c => c.id)); this.notify(); return;
      }
      if (!(this.phase === 'play' && this.trickOrder[this.turnPos] === 0)) return;
      const cards = this.turnPos === 0 ? this.aiLead(0) : this.aiFollow(0);
      this.selected = new Set(cards.map(c => c.id)); this.notify();
    }
    toggle(id) {
      if (this.gameOver) return;
      if (!(this.phase === 'bury' || (this.phase === 'play' && this.trickOrder[this.turnPos] === 0))) return;
      if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      this.onEvent('click'); this.notify();
    }
    sort() { this.sortHand(this.players[0].hand); this.notify(); }
    showOverlay(title, body, cb, btn) { this.overlay = { title, body, btn: btn || '继续', cb }; this.notify(); }
    overlayContinue() { const o = this.overlay; this.overlay = null; if (o && o.cb) o.cb(); else this.notify(); }

    canPlay() { if (this.phase === 'bury') return this.declarerSeat === 0; return this.phase === 'play' && this.trickOrder[this.turnPos] === 0 && !this.gameOver; }
    myDeclareOptions() { if (this.phase !== 'declare' && this.phase !== 'deal') return []; return this.declareOptions(0).filter(o => this.canDeclare(0, o.suit, o.strength)).sort((a, b) => b.strength - a.strength); }

    view() {
      const self = this;
      const cm = c => ({
        id: c.id, joker: c.joker, rank: c.joker ? (c.joker === 'B' ? '大' : '小') : rankText(c),
        suitSym: c.joker ? '王' : SUIT_SYM[c.suit], suit: c.suit,
        red: !!(c.joker || RED.has(c.suit)), trump: self.isTrump(c), point: pts(c)
      });
      const def = 1 - this.declarerTeam;
      const declOpts = this.myDeclareOptions().map(o => ({
        suit: o.suit, strength: o.strength,
        label: o.suit === 'NT' ? (o.strength >= 4 ? '大王·无主' : '小王·无主') : (SUIT_SYM[o.suit] + (o.strength >= 2 ? '对·反主' : '')),
        red: o.suit !== 'NT' && RED.has(o.suit), sym: o.suit === 'NT' ? '無' : SUIT_SYM[o.suit]
      }));
      const showDeclare = (this.phase === 'deal' || this.phase === 'declare');
      const optBy = {}; this.myDeclareOptions().forEach(o => { optBy[o.suit] = o; });
      const suitPalette = showDeclare ? ['S', 'H', 'C', 'D'].map(s => ({ suit: s, sym: SUIT_SYM[s], red: RED.has(s), available: !!optBy[s], strength: optBy[s] ? optBy[s].strength : 0 })) : [];
      if (showDeclare) suitPalette.push({ suit: 'NT', sym: '王', red: false, available: !!optBy['NT'], strength: optBy['NT'] ? optBy['NT'].strength : 0 });
      const resolving = this.trickWin != null;
      const leaderSeat = (this.phase === 'play' && !resolving && this.trick.length > 0 && !this.gameOver) ? this.computeLeader() : null;
      return {
        game: 'shengji',
        phase: this.phase,
        players: this.players.map(p => ({
          idx: p.idx, name: NAMES[p.idx], count: p.hand.length,
          isDealer: p.idx === this.declarerSeat,
          isTurn: this.phase === 'play' && this.trickOrder[this.turnPos] === p.idx && !this.gameOver,
          lastShown: Array.isArray(p.lastShown) ? p.lastShown.map(cm) : null,
          win: this.trickWin === p.idx,
          leading: leaderSeat === p.idx,
          declared: !!(this.declaration && this.declaration.seat === p.idx)
        })),
        hand: this.players[0].hand.map(c => ({ ...cm(c), sel: self.selected.has(c.id) })),
        trumpName: this.trumpSuit === 'NT' ? '无主' : (this.trumpSuit ? SUIT_NAME[this.trumpSuit] : '—'),
        trumpSuit: this.trumpSuit,
        levelText: rankText({ rank: this.level }),
        dealerName: NAMES[this.declarerSeat],
        dealerMine: team(this.declarerSeat) === 0,
        teamLevels: [rankText({ rank: this.teamLevels[0] }), rankText({ rank: this.teamLevels[1] })],
        defPoints: this.teamPoints[def],
        declareOptions: declOpts,
        suitPalette: suitPalette,
        declarerSeatIdx: this.declaration ? this.declaration.seat : null,
        declSuitSym: this.declaration ? (this.declaration.suit === 'NT' ? '无主' : SUIT_SYM[this.declaration.suit]) : null,
        declSuitRed: this.declaration ? (this.declaration.suit !== 'NT' && RED.has(this.declaration.suit)) : false,
        declMine: this.declaration ? this.declaration.seat === 0 : false,
        declaration: this.declaration ? { name: NAMES[this.declaration.seat], suitName: this.declaration.suit === 'NT' ? '无主' : SUIT_NAME[this.declaration.suit] } : null,
        declareLeft: this.declareLeft,
        dealt: this.dealIdx || 0, dealTotal: 100,
        declFlash: this.declFlash || null,
        lastTrickPts: this.lastTrickPts || 0,
        trickActive: this.phase === 'play' && this.trick.length > 0,
        burySel: this.phase === 'bury' && this.declarerSeat === 0 ? this.selected.size : null,
        overlay: this.overlay ? { title: this.overlay.title, body: this.overlay.body, btn: this.overlay.btn } : null,
        logs: this.logs.slice(),
        canPlay: this.canPlay(),
        gameOver: this.gameOver
      };
    }
  }
  root.ShengjiGame = ShengjiGame;
})(typeof window !== 'undefined' ? window : this);
