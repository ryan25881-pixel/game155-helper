// ==UserScript==
// @name         天堂倖存者 小幫手（賭狗 + 自動走位）
// @namespace    game155-helper
// @version      0.4.74
// @description  自動刷怪（閃避、撿取、自動進場）與賭狗；支援多帳號多開（每個帳號請用獨立的 Chrome 設定檔）。
// @match        https://web.game155.com/*
// @match        https://web2.game155.com/*
// @match        https://web3.game155.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ryan25881-pixel/game155-helper/main/game155-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/ryan25881-pixel/game155-helper/main/game155-helper.user.js
// ==/UserScript==

(function () {
  'use strict';
  window.__g155loaded = '0.4.74';
  const MYVER = window.__g155loaded; // 這一份小幫手的版本
  window.__g155zones = () => ZONES.size;
  window.__g155mons = () => { const out = []; MONS.forEach((mo) => { if (mo.boss || out.length < 5) out.push({ n: mo.def && mo.def.name, x: Math.round(mo.x), y: Math.round(mo.y), hp: Math.round(mo.hp), boss: !!mo.boss, dead: !!mo.dead, st: mo.state, hid: mo.hid }); }); return { size: MONS.size, list: out }; };
  window.__g155magR = () => ({ magR: Math.round(magR), gems: GEMS.size });

  // ───────────── 設定（面板上可改，會存在 localStorage） ─────────────
  const DEFAULTS = {
    pickPref: 'mix', // 升級偏好（撿取）：exp 先撿經驗／item 先撿物品／mix 綜合
    pickCat: { gold: 'norm', heal: 'norm', gem: 'norm', potion: 'norm', material: 'norm', equip: 'norm', chest: 'norm', other: 'norm' }, pickRules: {}, // 撿取分類：must 必撿／pri 優先／norm 一般／skip 不撿
    diceLadder: '3,1', dicePick: '2', diceStep: 25, diceLvEvery: 50, diceBase: 1000, diceMaxBet: 100000, diceMaxRolls: 50, diceMaxLoss: 100000, // 骰子：押哪個、沒開加幾 %、每累積幾 % 升一級、起始／最高賭注、最多幾把、虧損上限
    dogStake: 'fixed', dogKellyK: 0.5, // 下注方式：fixed 固定（期望值門檻）／kelly 凱利（照優勢與資金，dogKellyK = 凱利倍數，0.5 = 半凱利）
    dogBet: 1000,          // 每場賭注：1000 / 10000 / 100000 / 1000000 / 10000000（凱利模式時是上限）
    dogStopBelow: 500000,  // 金幣低於這個數字就停
    dogMaxRaces: 20,       // 最多連賭幾場
    dogMaxLoss: 50000,     // 本次累計虧損超過就停
    dogWP: 0.5,            // 選狗的勝率加權：0 = 純期望值；0.5 = 推薦（模擬與 50 場實測都在第一群）；1、2 = 起伏更小
    dogMinEV: 1.08,        // 期望值（真實勝率×賠率）達到這個數才押設定的賭注，否則只押 1,000
    farmStepMs: 700,       // 繞圈時每個方向走多久（毫秒）
    farmMode: 'smart',     // smart = 看小地圖走位；circle = 固定繞圈
    farmSense: 'mem',      // mem = 讀遊戲內部資料（最準）；hook = 攔截繪圖；pixel = 看顏色
    farmDanger: 5,         // 貼身範圍內的怪超過幾隻就閃避
    farmItems: true,       // 主動去撿地上的掉落物品（精確感測才有）
    farmGems: true,        // 安全時主動去撿地上的藍色經驗
    autoNext: true,        // 打倒王之後自動按「立即前往」下一張圖，不等 60 秒倒數
    stageLimit: 0,         // 只刷前幾關：打倒第幾關的首領後就回村重刷（0 = 一路打到最後一關）
    autoLoop: true,        // 打完自動回村並重新進場
    runsTarget: 0,         // 連續打幾場後停（0 = 無限）
    abTest: false,         // 單數場智能、雙數場繞圈，用來比較（測試用，平常關閉）
    farmDiff: '普通',      // 難度：普通 / 惡夢 / 地獄
    farmMap: 0,            // 地圖：0說話之島 1古魯丁 2沙漠 3奇岩 4龍之谷 5龍之谷地監 6妖精森林 7海音
    cls: 'auto',           // 職業：auto 自動判斷 / knight 騎士 / mage 法師
    build: 'sustain',      // 配卡流派（目前場次用的）
    style: 'melee',        // 走位風格：melee 貼身 / kite 繞圈躲怪
    panelScale: 1.15,      // 面板字體倍率（面板上的 A− / A＋ 可調）
    panelX: 8, panelY: 230, panelFixed: true, // 面板位置；panelFixed = 大小不隨瀏覽器縮放改變
    loopR: 260,            // 定點繞圈的半徑（世界像素）
    loopPack: 4,           // 定點繞圈時，約 120px 內有幾隻怪就先脫離（壓力高時會更早）
    expoMax: 12,           // 邊緣作戰：同時「射得到我」的遠程怪超過這個數就往外退（貼身風格會再多容許 3 隻）
    caution: 1,            // 謹慎程度：壓力值的倍率。1 = 標準；1.5 = 更早拉開距離；0.6 = 更敢貼近
    fold: { dog: false, farm: false },
    customBuilds: {},      // 自訂的流派優先順序：{ 職業: { 流派: [卡名…] } }
    banCards: {},          // 各流派不選的卡：{ 職業: { 流派: [卡名…] } } // 面板上「賭狗」「走位」區塊是否收合
    morphLock: '',         // （舊版）指定變身名稱，改用 morphPick
    morphPick: [],         // 指定變身（可勾多隻）：變成其中一隻後不再選其他變身；沒勾 = 不指定
    morphMin: 'green',     // 變身卡至少要這個顏色才選：green 綠 / blue 藍 / gold 金 / red 紅 / purple 紫 / none 都不選（白色一律不選）
    prof: { knight: { build: 'sustain', style: 'loop' }, mage: { build: 'speed', style: 'loop' } }, // 各職業記住的設定
    cardPrefer: '拾取範圍', // 流派以外的額外偏好關鍵字
  };
  // 依角色分開存：遊戲用 l1s_acct（帳號）與 l1s_name（角色名）記錄目前登入的角色（lg.js）。
  // 腳本在登入前就會載入，所以一開始先讀共用設定，進入遊戲後 bindChar() 再換成這個角色自己的設定。
  const LS_BASE = 'g155helper.cfg7';
  let LS_KEY = LS_BASE;
  const who = () => { try { const C = window.CLOUD; if (C && C.user && C.char) return { acct: String(C.user), name: typeof C.char === 'string' ? C.char : String(C.char.name || '') }; return { acct: sessionStorage.getItem('l1s_acct') || localStorage.getItem('l1s_acct') || '', name: sessionStorage.getItem('l1s_name') || localStorage.getItem('l1s_name') || '' }; } catch (e) { return { acct: '', name: '' }; } }; // 照遊戲 v908：分頁各自的角色優先
  let ME = { acct: '', name: '' };
  const cfg = Object.assign({}, DEFAULTS, safeParse(localStorage.getItem(LS_KEY)));
  function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
  function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }

  const state = { diceOn: false, diceCnt: 0, diceN: 0, diceHits: 0, diceStartGold: null, dicePhase: '', diceSeq0: 0, diceHist: [], dogOn: false, farmOn: false, runsAtStart: 0, dogRaces: 0, dogStartGold: null, dogPhase: '', lastPick: '' };

  // ───────────── 共用工具 ─────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const num = (s) => parseInt(String(s || '').replace(/[^\d-]/g, ''), 10) || 0;
  // 視窗是 position:fixed，offsetParent 永遠是 null，所以改看 display 與實際版面
  const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const gold = () => num(($('#goldT') || {}).textContent);
  const inBattle = () => { const t = $('#timeT'); return !!t && t.textContent.trim() !== '村莊'; };
  try { if (window.__g155ac) window.__g155ac.abort(); } catch (e) {} // 舊版小幫手掛的視窗監聽全部移除
  const AC = window.__g155ac = new AbortController(), SIG = AC.signal;
  let lastUserKey = 0; addEventListener('keydown', (e) => { if (e.isTrusted) lastUserKey = Date.now(); }, { capture: true, signal: SIG });
  const typing = () => { const a = document.activeElement; return !!a && /INPUT|TEXTAREA/.test(a.tagName) && !a.closest('#g155-panel'); };

  // 紀錄分成幾類，紀錄分頁可以只看某一類；換新版小幫手時保留（存在 window.__g155LOGS）
  // 寶石／藥水（含卷軸）／材料／裝備／寶箱／其他；遊戲的 ITEMS 讀得到就照它的種類，讀不到才看名字
  const ITEM_CAT_NM = { gem: '💎寶石', potion: '🧪藥水', material: '🪵材料', equip: '🗡️裝備', chest: '📦寶箱', other: '❔其他' };
  let ITEM_BY_NAME = null;
  function itemCatOf(name, id) {
    let d = null;
    try { if (typeof ITEMS !== 'undefined') { if (id && ITEMS[id]) d = ITEMS[id]; else { if (!ITEM_BY_NAME) { ITEM_BY_NAME = {}; for (const k in ITEMS) { const x = ITEMS[k]; if (x && x.name) ITEM_BY_NAME[x.name] = x; } } d = ITEM_BY_NAME[String(name).replace(/^\[[^\]]*\]\s*/, '').replace(/^\+\d+\s*/, '')] || null; } } } catch (e) {}
    const n = String(name || '');
    if (d) {
      if (d.kind === 'weapon' || d.kind === 'armor') return 'equip';
      if (d.type === 'chest' || /寶箱/.test(n)) return 'chest';
      if (d.type === 'potion' || d.type === 'scroll') return 'potion';
      if (d.type === 'material') return /寶石|鑽石|魔石|之石$/.test(n) ? 'gem' : 'material';
      return 'other';
    }
    if (/寶箱/.test(n)) return 'chest';
    if (/寶石|鑽石|魔石|之石$/.test(n)) return 'gem';
    if (/藥水|藥劑|治癒|餅乾|卷軸/.test(n)) return 'potion';
    if (/劍|刀|斧|矛|弓|杖|錘|匕首|盔|甲|袍|斗篷|手套|靴|盾|項鍊|戒指|耳環|腰帶/.test(n)) return 'equip';
    return 'material';
  }
  let pickFilter = 'all';
  const LOG_CAT = [
    ['dice', '🎲', '骰子', '#ff9ec7', /骰子/],
    ['dog', '🐕', '賭狗', '#7fd3ff', /賭狗|^比較|^第 \d+ 場結束|^第 \d+ 場［[^］]*］押|比較表/],
    ['run', '🏁', '場次', '#ffd75e', /^第 \d+ 場［|^過關|王戰開始|^已完成 \d+ 場|^戰績|^進入第 \d+ 關|^打倒首領/],
    ['card', '🃏', '選卡', '#c9a7ff', /^升級選/],
    ['set', '⚙️', '設定', '#e8c872', /模板|偏好|鏡頭|觸控模式|權重|下注方式|走位開啟|走位關閉|小幫手已更新|撿取分類|角色已|^只刷前幾關|^遊戲設定/],
    ['pick', '💰', '撿取', '#9be37a', /撿|^繞過去/],
    ['sys', '🔧', '系統', '#999', /./],
  ];
  const LOGS = window.__g155LOGS = window.__g155LOGS || [];
  let logFilter = 'all';
  const logCat = (msg) => { for (const c of LOG_CAT) if (c[4].test(msg)) return c[0]; return 'sys'; };
  function logRender() {
    const box = $('#g155-log'); if (!box) return;
    const esc = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    const C = {}; LOG_CAT.forEach((c) => { C[c[0]] = c; });
    const quiet = (l) => l.c === 'sys' || (l.c === 'pick' && /^撿到：/.test(l.m)); // 「全部」不顯示：系統訊息、撿到的每一件
    const list = LOGS.filter((l) => logFilter === 'all' ? !quiet(l) : (l.c === logFilter && (logFilter !== 'pick' || pickFilter === 'all' || l.k === pickFilter))).slice(0, 150);
    const pb = $('#g155-pickbar'); if (pb) { pb.style.display = logFilter === 'pick' ? '' : 'none'; if (logFilter === 'pick') { const P = LOGS.filter((l) => l.c === 'pick' && l.k); pb.innerHTML = [['all', '全部撿取']].concat(Object.keys(ITEM_CAT_NM).map((k) => [k, ITEM_CAT_NM[k]])).map(([k, t]) => { const nn = k === 'all' ? P.length : P.filter((l) => l.k === k).length; return '<span data-pf="' + k + '"' + (k === pickFilter ? ' class="on"' : '') + '>' + t + (nn ? '<i>' + nn + '</i>' : '') + '</span>'; }).join(''); pb.querySelectorAll('[data-pf]').forEach((e) => e.addEventListener('click', () => { pickFilter = e.dataset.pf; logRender(); })); } }
    box.innerHTML = list.length ? list.map((l) => '<div style="display:flex;gap:4px;padding:1px 0;border-bottom:1px solid rgba(107,74,42,.35)"><span>' + C[l.c][1] + '</span><span style="color:#888;white-space:nowrap">' + l.t.slice(0, 5) + '</span><span style="color:' + C[l.c][3] + ';white-space:pre-wrap;flex:1;min-width:0">' + esc(l.m) + '</span></div>').join('') : '<span style="color:#aaa">這一類還沒有紀錄</span>';
    const bar = $('#g155-logbar'); if (bar) bar.querySelectorAll('[data-lf]').forEach((e) => { const k = e.dataset.lf, n = k === 'all' ? LOGS.filter((l) => !quiet(l)).length : LOGS.filter((l) => l.c === k).length; e.classList.toggle('on', k === logFilter); const cnt = e.querySelector('i'); if (cnt) cnt.textContent = n ? n : ''; });
    const l3 = $('#g155-log3'); if (l3) l3.textContent = LOGS.filter((l) => !quiet(l)).slice(0, 3).map((l) => C[l.c][1] + ' ' + l.t.slice(0, 5) + ' ' + l.m).join('\n');
  }
  function log(msg, k) {
    const t = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    LOGS.unshift({ t, c: logCat(String(msg)), m: String(msg), k: k || '' }); if (LOGS.length > 400) LOGS.length = 400;
    logRender();
  }

  // ───────────── 精確感測：攔截遊戲的繪圖呼叫 ─────────────
  // 遊戲每一幀都會把要畫的東西交給畫布，接在中間就能拿到精確資料（實測）：
  //   主畫面 fillRect 整張 #2a2820         → 新的一幀開始
  //   主畫面 drawImage old/xpgem.png        → 經驗球；它的變換矩陣 (e,f) 就是畫面座標
  //   主畫面 fillRect #4fc36a 36×4          → 自己的血條（定位自己在畫面上的位置）
  //   小地圖 fillRect #ff4a3a 2×2           → 怪物；小地圖 arc #4aa8ff → 自己
  // 只讀不改，原本的繪圖照常執行。每 3 幀取樣一次以降低負擔。
  const SENSE = { myV: [0, 0], latest: null, seenImgs: {}, shapes: {}, fastIds: {}, hitIds: {}, dodges: 0 };
  const MEM = { mons: [], shots: [], items: [] }; // 最近看到的遊戲內部清單
  const MEMG = window.__g155MEM || (window.__g155MEM = { EPROJ: new Set(), FISS: new Set(), GITEMS: new Set(), ZONES: new Set(), GEMS: new Set(), MONS: new Set() }); // 放在網頁全域：換新版小幫手時，已經在場上的怪（例如王）不會遺失
  const EPROJ = MEMG.EPROJ, FISS = MEMG.FISS; // 敵方投射物、直線地面技能
  const GITEMS = MEMG.GITEMS; // 地上的物品物件
  const ZONES = MEMG.ZONES; // 地面預警區（zones：x, y, r, k, t, tele=幾秒後落下, dur, fired）
  const GEMS = MEMG.GEMS; // 經驗寶石物件（game.js 的 gems：x, y, v=經驗量, pull=已被吸過來）
  const MONS = MEMG.MONS; // 所有出現過、還活著的怪物物件（物件內容由遊戲即時更新）
  const MEMSTAT = { roles: {}, states: {}, ranged: {}, kinds: {}, bosses: {}, hitBy: {}, kindSample: {} };
  const W2MM = 4.9; // 世界座標 4.9px ≈ 小地圖 1px
  const memList = (slot) => { // 取 1.5 秒內最長的那份清單（清單一秒只重建幾次，但裡面的物件是即時的）
    const now = performance.now(); let best = null;
    for (const e of MEM[slot]) { if (now - e.t < 1500 && (!best || e.a.length > best.length)) best = e.a; }
    return best;
  };
  const GATE_NAME = '戰局傳送師';
  const MM_TO_CANVAS = 9.8; // 小地圖 1px ≈ 主畫布 9.8px（由同一幀的怪物位置估算）
  function installSense() {
    const P = CanvasRenderingContext2D.prototype;
    // 原始函式存在 window 上，腳本重複載入時會換掉舊的攔截而不是疊上去
    const orig = window.__g155orig || (window.__g155orig = { fill: P.fillRect, img: P.drawImage, arc: P.arc });
    const oFill = orig.fill, oImg = orig.img, oArc = orig.arc;
    const keyOf = new WeakMap();
    let cur = null, frameNo = 0, capture = false;
    const imgKey = (im) => {
      let k = keyOf.get(im);
      if (k === undefined) { k = im.src ? String(im.src).split('?')[0].split('/').slice(-2).join('/') : ''; keyOf.set(im, k); }
      return k;
    };
    // ── 記憶體感測 ──
    // 遊戲每一幀會把怪物、投射物等物件 push 進清單。在 push 上接一個只讀的觀察點，
    // 用欄位特徵認出是哪種清單，留下參考，之後就能直接讀每隻怪的座標、血量、狀態。
    if (!window.__g155PHook2) {
      window.__g155PHook2 = 1;
      try {
        const isP = (o) => { try { return o && o.maxhp !== undefined && o.magnet !== undefined && o.speed !== undefined && o.x !== undefined; } catch (e) { return false; } };
        Object.defineProperty(Object.prototype, 'form', {
          configurable: true, enumerable: false,
          get() { if (window.__g155P !== this && isP(this)) window.__g155P = this; return undefined; },
          set(v) { Object.defineProperty(this, 'form', { value: v, writable: true, enumerable: true, configurable: true }); if (isP(this)) window.__g155P = this; },
        });
      } catch (e) {}
    }
    if (!window.__g155PHook) {
      window.__g155PHook = 1;
      try {
        Object.defineProperty(Object.prototype, 'moving', {
          configurable: true, enumerable: false,
          get() { return undefined; },
          set(v) {
            Object.defineProperty(this, 'moving', { value: v, writable: true, enumerable: true, configurable: true }); // 之後就是普通屬性，遊戲照常運作
            try { if (this.maxhp !== undefined && this.magnet !== undefined && this.speed !== undefined && this.x !== undefined) window.__g155P = this; } catch (e) {}
          },
        });
      } catch (e) {}
    }
    const AP = Array.prototype;
    if (!orig.push) orig.push = AP.push;
    const oPush = orig.push;
    const note = (slot, arr) => {
      const L = MEM[slot]; if (L.length && L[L.length - 1].a === arr) return;
      L[L.length] = { a: arr, t: performance.now() }; if (L.length > 8) L.shift();
    };
    AP.push = function (it) {
      if (it !== null && typeof it === 'object') {
        try {
          if (it.atkMs !== undefined && it.maxhp !== undefined) MONS.add(it);
          else if (it.vx !== undefined && it.life !== undefined && it.nm !== undefined) EPROJ.add(it); // 敵方投射物（game.js 的 eprojs）
          else if (it.ux !== undefined && it.nm !== undefined && it.hit !== undefined) FISS.add(it);  // 直線地面技能（fiss）
          else if (it.age !== undefined && it.k !== undefined) note('shots', this);
          else if (it.ph !== undefined && it.name !== undefined && it.id !== undefined && it.x !== undefined) GITEMS.add(it); // 地上物品（gitems）
          else if (it.pull !== undefined && it.v !== undefined && it.s !== undefined && it.x !== undefined) GEMS.add(it); // 經驗寶石（gems）
          else if (it.tele !== undefined && it.fired !== undefined && it.k !== undefined && it.r !== undefined) ZONES.add(it); // 紅霧預警（zones）
          else if (it.t === 0 && typeof it.text === 'string' && Object.keys(it).length === 2) lootAdd(it.text); // 撿到東西（lootLog）
          else if (it.length === 2 && typeof it[0] === 'string' && typeof it[1] === 'string' && Array.isArray(it)) chatSeen(it[0]); // 對話紀錄（game.js CHATLOG）
        } catch (e) {}
      }
      return oPush.apply(this, arguments);
    };

    // 自己的世界座標合理性檢查：首領的血條和玩家血條同色同高，畫首領血條時算出來的座標會是 (-51,17) 這種錯值，
    // 讓王被當成在遠處而被略過。真正的世界座標都很大，而且 0.1 秒內不會瞬移 500px。
    let goodMeW = null, goodAt = 0;
    const okMe = (p) => {
      if (!isFinite(p[0]) || !isFinite(p[1]) || (Math.abs(p[0]) < 400 && Math.abs(p[1]) < 400)) return false;
      const now = performance.now();
      if (goodMeW && now - goodAt < 2500 && Math.hypot(p[0] - goodMeW[0], p[1] - goodMeW[1]) > 500) return false;
      goodMeW = p; goodAt = now; return true;
    };
    const gfxCache = new WeakMap();
    const gfxOf = (im, k) => { // 「1022/1022-4.png」→ 1022；不是這種格式回傳 0
      let g = gfxCache.get(im);
      if (g === undefined) { const m = /^(\d+)\/\d+-\d+\.png$/.exec(k); g = m ? +m[1] : 0; gfxCache.set(im, g); }
      return g;
    };
    P.fillRect = function (x, y, w, h) {
      try {
        const cv = this.canvas;
        if (cv.id === 'c') {
          if (this.fillStyle === '#2a2820' && (w > 1000 || w >= cv.width * 0.9)) { // 新的一幀（手機畫布比較小，改成「塗滿整個畫布」就算）
            if (capture && cur) { trackFrame(cur); cur.t = Date.now(); SENSE.latest = cur; }
            frameNo++; capture = frameNo % 3 === 0;
            cur = capture ? { gems: [], orbs: [], items: [], mobs: [], me: null, meW: null, mm: null, misc: [], spr: [], threats: [], zones: [], cw: cv.width, ch: cv.height } : null;
          } else if (capture && h === 4 && !cur.meW && (this.fillStyle === '#4fc36a' || this.fillStyle === '#e0b840' || this.fillStyle === '#e5533d')) { // 血條：綠／黃／紅三種顏色都要認
            const t = this.getTransform(), pw = [(cv.width / 2 - t.e) / t.a, (cv.height / 2 - t.f) / t.d];
            if (t.a > 0.3 && Math.abs(t.a - t.d) < 0.01 && okMe(pw)) { cur.me = [cv.width / 2, cv.height / 2]; cur.meW = pw; cur.barW = [x + w / 2, y]; cur.camA = t.a; } // 鏡頭以角色為中心；算出的是同一個位置的世界座標，用來和怪物、投射物比較
          }
        } else if (capture && this.fillStyle === '#ff4a3a' && w <= 4 && cv.width < 400) { cur.mobs.push(x + w / 2, y + h / 2); }
      } catch (e) {}
      return oFill.call(this, x, y, w, h);
    };
    // 主畫面上畫的大圓／橢圓多半是技能範圍提示，先記下來（位置、半徑、顏色）供閃避與分析
    const noteZone = (ctx, x, y, r) => {
      if (r < 24) return;
      const key = 'r' + Math.round(r / 20) * 20 + ' fill:' + String(ctx.fillStyle).slice(0, 26) + ' stroke:' + String(ctx.strokeStyle).slice(0, 26);
      SENSE.shapes[key] = (SENSE.shapes[key] || 0) + 1;
      if (cur.zones.length < 60) cur.zones.push(x, y, r);
    };
    P.arc = function (x, y, r, a, b, c) {
      try {
        if (capture) {
          if (this.canvas.id === 'c') noteZone(this, x, y, r);
          else if (this.fillStyle === '#4aa8ff' && this.canvas.width < 400) cur.mm = [x, y];
        }
      } catch (e) {}
      return oArc.call(this, x, y, r, a, b, c);
    };
    // 遊戲畫 NPC 名字時會給出精確位置：用它來點「戰局傳送師」，不必猜畫面座標
    if (!orig.text) orig.text = P.fillText;
    const oText = orig.text;
    P.fillText = function (t, x, y) {
      try {
        if (t === GATE_NAME && this.canvas.id === 'c') { const m = this.getTransform(); SENSE.gate = { x: m.a * x + m.e, y: m.d * y + m.f, t: Date.now(), cw: this.canvas.width, ch: this.canvas.height }; }
        else if (t === '骰子莊家' && this.canvas.id === 'c') { const m = this.getTransform(); SENSE.diceNpc = { x: m.a * x + m.e, y: m.d * y + m.f, t: Date.now(), cw: this.canvas.width, ch: this.canvas.height }; }
        else if (t === '賽西賽狗場' && this.canvas.id === 'c') { const m = this.getTransform(); SENSE.dogNpc = { x: m.a * x + m.e, y: m.d * y + m.f, t: Date.now(), cw: this.canvas.width, ch: this.canvas.height }; }
      } catch (e) {}
      return oText.apply(this, arguments);
    };
    if (!orig.ellipse) orig.ellipse = P.ellipse;
    const oEll = orig.ellipse;
    P.ellipse = function (x, y, rx, ry) {
      try { if (capture && this.canvas.id === 'c') noteZone(this, x, y, Math.max(rx, ry)); } catch (e) {}
      return oEll.apply(this, arguments);
    };

    // 追蹤每個圖在世界座標中的移動速度。怪物走路慢，箭矢／法術飛得快：
    // 連續兩次取樣都高速、而且正朝自己飛來、預估會打中的，就列為威脅。
    let tracks = [], lastTrackT = 0, prevMe = null;
    const FAST = 260; // 世界座標 像素／秒
    function trackFrame(f) {
      const now = performance.now(); const dt = (now - lastTrackT) / 1000; lastTrackT = now;
      if (f.meW && prevMe && dt > 0.01 && dt < 0.25) { // 自己的移動速度（平滑過）
        const vx = (f.meW[0] - prevMe[0]) / dt, vy = (f.meW[1] - prevMe[1]) / dt;
        if (Math.hypot(vx, vy) < 600) { SENSE.myV[0] += (vx - SENSE.myV[0]) * 0.35; SENSE.myV[1] += (vy - SENSE.myV[1]) * 0.35; }
      }
      prevMe = f.meW;
      const sp = f.spr, next = [], me = f.meW, ok = dt > 0.01 && dt < 0.25;
      for (let i = 0; i < sp.length; i += 3) {
        const id = sp[i], x = sp[i + 1], y = sp[i + 2];
        let vx = 0, vy = 0, n = 0;
        if (ok) {
          let best = null, bd = 150 * 150;
          for (let j = 0; j < tracks.length; j++) {
            const tr = tracks[j]; if (tr.id !== id || tr.used) continue;
            const d = (tr.x - x) * (tr.x - x) + (tr.y - y) * (tr.y - y);
            if (d < bd) { bd = d; best = tr; }
          }
          if (best) {
            best.used = true; vx = (x - best.x) / dt; vy = (y - best.y) / dt;
            const speed = Math.hypot(vx, vy);
            if (speed > FAST && speed < 3000 && (best.n === 0 || vx * best.vx + vy * best.vy > 0)) n = best.n + 1;
            if (n >= 2 && me) {
              const rx = me[0] - x, ry = me[1] - y, dist = Math.hypot(rx, ry) || 1;
              const closing = (vx * rx + vy * ry) / dist;
              if (closing > FAST * 0.6) {
                const tti = dist / closing, miss = Math.abs(rx * vy - ry * vx) / speed;
                SENSE.fastIds[id] = (SENSE.fastIds[id] || 0) + 1;
                if (tti < 0.9 && miss < 48 && dist > 30) f.threats.push({ id, x, y, vx, vy, tti, miss, side: rx * vy - ry * vx });
              }
            }
          }
        }
        next.push({ id, x, y, vx, vy, n, used: false });
      }
      tracks = next;
    }
    P.drawImage = function (im) {
      try {
        if (capture && this.canvas.id === 'c' && im.tagName === 'IMG') {
          const k = imgKey(im);
          const kind = k === 'old/xpgem.png' ? 'gems' : k === 'old/hporb.png' ? 'orbs' : k.indexOf('icons/') === 0 ? 'items' : '';
          if (kind) { // 取繪製位置的中心，換算成畫布座標
            const a = arguments, n = a.length;
            const dx = n >= 9 ? a[5] : a[1], dy = n >= 9 ? a[6] : a[2];
            const dw = n >= 9 ? a[7] : (n >= 5 ? a[3] : im.width), dh = n >= 9 ? a[8] : (n >= 5 ? a[4] : im.height);
            const t = this.getTransform();
            cur[kind].push(t.a * (dx + dw / 2) + t.e, t.d * (dy + dh / 2) + t.f);
            if (kind === 'items') SENSE.seenImgs[k] = (SENSE.seenImgs[k] || 0) + 1;
          }
          else if (gfxOf(im, k)) { // 角色／怪物／投射物的圖：記世界座標的中心點，交給 trackFrame 算速度
            if (!cur.meW) { // 備援：不靠血條，直接從鏡頭的變換矩陣算出自己的世界座標（角色在畫面中央）
              const t = this.getTransform();
              if (t.a > 0.3 && Math.abs(t.a - t.d) < 0.01) { const cv = this.canvas, pw = [(cv.width / 2 - t.e) / t.a, (cv.height / 2 - t.f) / t.d]; if (okMe(pw)) { cur.meW = pw; cur.camA = t.a; if (!cur.me) cur.me = [cv.width / 2, cv.height / 2]; } }
            }
            const a = arguments, n = a.length;
            const dx = n >= 9 ? a[5] : a[1], dy = n >= 9 ? a[6] : a[2];
            const dw = n >= 9 ? a[7] : (n >= 5 ? a[3] : im.width), dh = n >= 9 ? a[8] : (n >= 5 ? a[4] : im.height);
            if (cur.spr.length < 1500) cur.spr.push(gfxOf(im, k), dx + dw / 2, dy + dh / 2);
          }
          else if (k && !/\.webp$/.test(k)) { // 不是怪物圖也不是地圖：可能是掉落物、特效
            SENSE.seenImgs[k] = (SENSE.seenImgs[k] || 0) + 1;
            if (cur.misc.length < 60) { const t = this.getTransform(); cur.misc.push(k, t.e, t.f); }
          }
        }
      } catch (e) {}
      return oImg.apply(this, arguments);
    };
  }
  const memP = () => { const p = window.__g155P; return p && isFinite(p.x) && isFinite(p.y) && p.maxhp > 0 ? p : null; };
  const senseFresh = () => {
    const s = SENSE.latest; if (!(s && Date.now() - s.t < 500 && (s.mm || memP()))) return null; // 有玩家物件時不需要小地圖
    const p = memP(); if (p) { s.meW = [p.x, p.y]; s.memMe = 1; } // 記憶體座標（精確、不受畫面縮放與首領血條影響）
    return s;
  };

  // ───────────── 賭狗 ─────────────
  // 頁面結構：#npcwin 內 #nwT=「賽狗場」，#nwB 有出馬表 table、賭注按鈕、下注按鈕。
  function dogWindow() {
    const w = $('#npcwin'); const t = $('#nwT');
    return visible(w) && t && t.textContent.includes('賽狗場') ? $('#nwB') : null;
  }

  function parseDogs(body) {
    return $$('tr[onclick]', body).map((tr) => {
      const c = [...tr.children].map((td) => td.innerText.trim());
      const sty = /越跑越有力|起步慢/.test(c[2] || '') ? 'late' : (/起跑衝得快|後段/.test(c[2] || '') ? 'early' : 'steady'); // 個性欄
      const h = parseFloat(c[5]); return { tr, name: c[1], sty, pref: c[3] || '', status: c[4] || '', hist: isFinite(h) ? h : null, odds: parseFloat(c[6]) || 0 };
    }).filter((d) => d.odds > 0);
  }

  // 評分：以賠率推回的基本實力為底，再依「播報員說今天吃香／要小心的喜好」與今日狀態加減。
  // 遊戲自己註明運氣成分很大，這只是挑相對有利的狗，不保證獲利。
  function scoreDog(d, good, bad) {
    let m = 1;
    if (good && d.pref.includes('愛' + good)) m *= 1.35;
    if (bad && d.pref.includes('怕' + bad)) m *= 0.65;
    if (/飽滿|絕佳|很好/.test(d.status)) m *= 1.25;
    if (/疲倦|不佳|受傷/.test(d.status)) m *= 0.75;
    return m; // 期望值正比於 (1/賠率 × m) × 賠率 = m
  }

  // 以下資料與公式取自 game.js 第 5547～5590 行（DOGS、DOGWEA、dogRun）。
  // 公開賠率只看基本實力；真正比賽還要乘上天氣與狀態，所以可以算出每隻狗的真實勝率。
  const DOG_DB = {
    '疾風': [1.10, '乾燥', '潮濕'], '雷霆': [1.06, '炎熱', '雪地'], '白牙': [1.02, '雪地', '炎熱'], '銀月': [1.07, '潮濕', '乾燥'], '赤焰': [0.98, '炎熱', '潮濕'],
    '鐵蹄': [1.04, '乾燥', '雪地'], '黑影': [0.99, '雪地', '乾燥'], '小不點': [0.92, '潮濕', '炎熱'], '老黃': [0.95, '乾燥', null], '幸運星': [0.90, null, null],
  };
  const DOG_WEA = { '晴天': ['乾燥', 1], '陰天': [null, 0], '小雨': ['潮濕', 1], '大雨': ['潮濕', 1.6], '下雪': ['雪地', 1.2], '酷熱': ['炎熱', 1.2] };
  const dogGauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) * Math.SQRT2; };
  const dogEvF = () => (Math.random() < 0.12 ? 0.93 : 1) * (Math.random() < 0.10 ? 0.92 : 1) * (Math.random() < 0.12 ? 1.07 : 1);
  const DW_DEF = { wea: 1, form: 1, base: 1, hist: 0, styE: 0, styL: 0, styS: 0 };
  const DOG_STY = { '疾風': 'early', '雷霆': 'early', '白牙': 'steady', '銀月': 'late', '赤焰': 'early', '鐵蹄': 'steady', '黑影': 'late', '小不點': 'late', '老黃': 'steady', '幸運星': 'steady' };
  const dogW = () => Object.assign({}, DW_DEF, cfg.dogW || {});
  function dogTrueProb(dogs, weaName, M, W) { // 回傳每隻狗的勝率；W = 權重（不給就用面板上的設定）；有不認得的狗或天氣就回傳 null
    W = Object.assign({}, DW_DEF, W || dogW());
    const w = DOG_WEA[weaName]; if (!w) return null;
    const sc = [];
    for (const d of dogs) {
      const db = DOG_DB[d.name]; if (!db) return null;
      const form = /飽滿/.test(d.status) ? 1 : (/疲倦/.test(d.status) ? -1 : 0);
      const wf = !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1];
      const sy = DOG_STY[d.name] || 'steady', sa = (sy === 'early' ? W.styE : sy === 'late' ? W.styL : W.styS) / 100;
      const hf = d.hist != null && W.hist ? Math.pow(Math.max(1, d.hist) / 20, W.hist) : 1; // 歷史勝率：以 20%（5 隻狗平均）為基準
      sc.push(Math.pow(db[0], W.base) * Math.max(0.05, 1 + wf * W.wea + form * 0.02 * W.form) * Math.max(0.05, 1 + sa) * hf); // 權重調很大時實力不會變成負的
    }
    const win = sc.map(() => 0);
    for (let m = 0; m < M; m++) { let b = 0, bv = -1; for (let i = 0; i < sc.length; i++) { const v = sc[i] * Math.exp(0.22 * dogGauss()) * dogEvF(); if (v > bv) { bv = v; b = i; } } win[b]++; }
    return win.map((x) => x / M);
  }

  // 自動前往賽狗場：賽西賽狗場站在奇岩村格子 (105,290)（game.js VNPC，座標不會被重新排列），骰子莊家在它南邊 3 格
  const DOG_AT = [103, 290];
  let dogGoAt = 0, dogGoSince = 0, dogGoTry = 0, dogGoWarned = false;
  function dogGo() {
    const now = Date.now();
    if (inBattle()) { state.dogPhase = '戰鬥中，回村莊後會自動前往賽狗場'; return; }
    if (!dogGoSince) { dogGoSince = now; dogGoWarned = false; }
    state.dogPhase = '正在前往賽狗場';
    const dlg = $('#npcdlg');
    if (visible(dlg)) { // NPC 對話框：選「看出馬表、下注賽狗」；點錯 NPC 就按離開
      release(); if (now - dogGoAt < 700) return; dogGoAt = now;
      const opts = $$('.dgo', dlg), go = opts.find((e) => /出馬表|下注賽狗/.test(e.textContent)), x = opts.find((e) => e.textContent.trim() === '離開');
      if (go) go.click(); else if (x) { x.click(); dogGoAt = now - 2800; }
      return;
    }
    const w = $('#npcwin');
    if (visible(w)) { release(); if (now - dogGoAt > 900) { dogGoAt = now; const x = $('#nwX'); if (x) x.click(); } return; } // 開著別的視窗：先關掉
    if (now - dogGoAt < 3500) { release(); return; } // 剛點過 NPC，讓角色自己走過去
    const dn = SENSE.dogNpc;
    if (dn && now - dn.t < 800 && dn.x > dn.cw * 0.08 && dn.x < dn.cw * 0.92 && dn.y > dn.ch * 0.1 && dn.y < dn.ch * 0.7) { // 名字在畫面上：點名字下方的本體，遊戲會自己走過去並開啟對話
      release(); dogGoAt = now; dogGoTry++;
      clickCanvasPx(dn.x + (dogGoTry % 3 - 1) * 6, dn.y + 30 + (dogGoTry % 3) * 6);
      return;
    }
    const m = (($('#coord') || {}).textContent || '').match(/(\d+),(\d+)/);
    if (m) {
      const ex = DOG_AT[0] - (+m[1]), ey = DOG_AT[1] - (+m[2]);
      const r = (ex + ey) / 2, u = (ex - ey) / 2; // 畫面右 = (+1,+1)，畫面上 = (+1,-1)
      const keys = [];
      if (r > 0.4) keys.push('d'); else if (r < -0.4) keys.push('a');
      if (u > 0.4) keys.push('w'); else if (u < -0.4) keys.push('s');
      if (keys.length) { hold(keys); } else release();
    }
    if (now - dogGoSince > 30000 && !dogGoWarned) { dogGoWarned = true; log('30 秒內沒走到賽狗場，請手動點「賽西賽狗場」打開出馬表（打開後會自動繼續）'); }
  }

  // 近幾場的預判與結果：每場記下每隻狗的賠率、預測勝率、期望值、狀態，比賽完補上冠軍
  // 對話流水號：遊戲每加一行對話就 push 到 CHATLOG，這裡只數骰子與賽狗結果。存在 window 上，換新版小幫手也接得上
  const CHAT = window.__g155chat || (window.__g155chat = { dice: 0, diceT: '', dog: 0, dogT: '' });
  function chatSeen(t) { t = String(t).trim(); if (/^骰子：/.test(t)) { CHAT.dice++; CHAT.diceT = t; } else if (/^賽狗：\S+ 奪冠/.test(t)) { CHAT.dog++; CHAT.dogT = t; } }
  const dogRecKey = () => 'g155helper.dogrec' + (ME.name ? '@' + ME.acct + '@' + ME.name : '');
  const dogRecs = () => { const a = safeParse(localStorage.getItem(dogRecKey())); return Array.isArray(a) ? a : []; };
  function dogRecFinish(force) {
    const pd = state.dogPend; if (!pd) return;
    let win = null;
    if (CHAT.dog > (pd.n0 || 0)) win = (CHAT.dogT.match(/^賽狗：(\S+) 奪冠/) || [])[1] || null;
    if (!win && !force) return;
    state.dogPend = null; delete pd.lastEl; pd.win = win; if (dogSnap && dogSnap.used) { dogSnap.win = win; dwLive(); }
    const a = dogRecs(); a.push(pd); try { localStorage.setItem(dogRecKey(), JSON.stringify(a.slice(-500))); } catch (e) {}
    if (win && pd.mp) {
      const k = 'g155helper.dogcmp' + (ME.name ? '@' + ME.acct + '@' + ME.name : '');
      const c = safeParse(localStorage.getItem(k)); const arr = Array.isArray(c) ? c : [];
      const net = (x) => (x.n === win ? Math.floor(1000 * x.o) - 1000 : -1000);
      if (pd.manual) { const row = { t: new Date().toLocaleTimeString('zh-TW', { hour12: false }), wea: pd.wea, win, manual: 1, m: {} }; Object.keys(pd.mp).forEach((m) => { row.m[m] = [pd.mp[m].n, pd.mp[m].o, net(pd.mp[m])]; }); arr.push(row); }
      else if (arr.length && pd.mp.U && arr[arr.length - 1].win === win && !arr[arr.length - 1].m.U) arr[arr.length - 1].m.U = [pd.mp.U.n, pd.mp.U.o, net(pd.mp.U)];
      try { localStorage.setItem(k, JSON.stringify(arr.slice(-500))); } catch (e) {}
    }
    dogRecShow();
  }
  function dogRecShow() {
    const el = $('#g155-dogrec'); if (!el) return;
    const a = dogRecs().slice(-10).reverse();
    if (!a.length) { el.innerHTML = '<b style="color:#f0c060">近 10 場預判 vs 結果</b><br><span style="color:#aaa">還沒有紀錄（開始賭狗後每場都會記錄）</span>'; return; }
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let hit = 0, fav = 0, rk = 0, rkn = 0, shit = 0;
    a.forEach((r) => {
      if (!r.win) return;
      if (r.pick === r.win) hit++;
      if ((r.sug || r.pick) === r.win) shit++;
      const s = r.dogs.slice().sort((x, y) => y[2] - x[2]); if (s[0] && s[0][0] === r.win) fav++;
      const i = s.findIndex((d) => d[0] === r.win); if (i >= 0) { rk += i + 1; rkn++; }
    });
    const done = a.filter((r) => r.win).length;
    let h = '<b style="color:#f0c060">近 ' + a.length + ' 場預判 vs 結果</b><br>押中 <b>' + hit + '/' + done + '</b>｜小幫手建議會中 <b>' + shit + '/' + done + '</b>｜預測勝率第一名奪冠 <b>' + fav + '/' + done + '</b>' + (rkn ? '｜冠軍平均是預測第 <b>' + (rk / rkn).toFixed(1) + '</b> 名' : '');
    a.forEach((r) => {
      const s = r.dogs.slice().sort((x, y) => y[2] - x[2]);
      const ok = r.win ? (r.pick === r.win ? '<span style="color:#9be37a">✅ 中</span>' : '<span style="color:#ff8a6a">✖</span>') : '<span style="color:#aaa">結果未知</span>';
      h += '<details style="margin-top:2px"><summary style="cursor:pointer">' + esc(r.t) + ' ' + esc(r.wea) + (r.manual ? '｜<span style="color:#8cf">手動</span>押 ' : '｜押 ') + esc(r.pick) + '（' + esc(r.odds) + '）' + (r.stake ? ' ' + Number(r.stake).toLocaleString() : '') + ok + (r.win ? '｜冠軍 ' + esc(r.win) : '') + (r.manual && r.sug && r.sug !== r.pick ? '｜建議 ' + esc(r.sug) + (r.win === r.sug ? ' ✅' : '') : '') + '</summary>' +
        '<div style="color:#aaa;font-size:.85em">★ 押的狗　☆ 小幫手建議　🏆 冠軍</div><table style="border-collapse:collapse;width:100%;font-size:.9em"><tr style="color:#cdbf9a"><td>#</td><td>狗</td><td>賠率</td><td>預測勝率</td><td>期望值</td><td>狀態</td></tr>' +
        s.map((d, i) => '<tr style="' + (d[0] === r.win ? 'color:#ffd75e;font-weight:bold' : '') + '"><td>' + (i + 1) + '</td><td>' + (d[0] === r.pick ? '★' : '') + (r.sug && d[0] === r.sug && r.sug !== r.pick ? '☆' : '') + esc(d[0]) + (d[0] === r.win ? ' 🏆' : '') + '</td><td>' + esc(d[1]) + '</td><td>' + (d[2] / 10).toFixed(1) + '%</td><td>' + (d[3] / 100).toFixed(2) + '</td><td>' + esc(d[4]) + '</td></tr>').join('') +
        '</table></details>';
    });
    el.innerHTML = h;
  }

  // 用某組權重挑狗（綜合分數 = 期望值 + 勝率加權 × 勝率，和自動下注一樣）
  function dogPickW(dogs, wea, W, M) {
    const p = dogTrueProb(dogs, wea, M, W); if (!p) return null;
    const wp = cfg.dogWP === 'bonus' ? 0.5 : (+cfg.dogWP || 0);
    let b = 0; for (let i = 1; i < dogs.length; i++) if (p[i] * dogs[i].odds + wp * p[i] > p[b] * dogs[b].odds + wp * p[b]) b = i;
    return { i: b, p };
  }
  // 回測：用最近的實際紀錄，比較「自訂權重」和「遊戲真實公式（全部 1）」各會押誰、中幾場
  function dogBacktest(W) {
    const recs = dogRecs().filter((r) => r.win && r.dogs && r.dogs.length);
    const D = DW_DEF;
    const st = (WW) => { let hit = 0, net = 0, wp = 0, n = 0; recs.forEach((r) => {
      const dogs = r.dogs.map((d) => ({ name: d[0], odds: +d[1], status: d[4] || '', hist: d[5] != null ? d[5] : null }));
      const k = dogPickW(dogs, r.wea, WW, 3000); if (!k) return; n++;
      const wi = dogs.findIndex((d) => d.name === r.win); if (wi >= 0) wp += k.p[wi];
      if (dogs[k.i].name === r.win) { hit++; net += Math.floor(1000 * dogs[k.i].odds) - 1000; } else net -= 1000;
    }); return { n, hit, net, wp: n ? wp / n : 0 }; };
    return { mine: st(W), base: st(D) };
  }
  // 模擬：照遊戲的出賽方式隨機開 N 場，真正結果用遊戲公式跑，看這組權重長期的回收率
  function dogSim(W, N) {
    const names = Object.keys(DOG_DB), weas = [['晴天', 3], ['陰天', 2], ['小雨', 2], ['大雨', 1], ['下雪', 1.5], ['酷熱', 1.5]];
    const D = DW_DEF, r = { mine: { hit: 0, net: 0 }, base: { hit: 0, net: 0 } };
    for (let k = 0; k < N; k++) {
      const ix = names.slice().sort(() => Math.random() - 0.5).slice(0, 5);
      let t = Math.random() * 11, wea = '晴天'; for (const q of weas) { t -= q[1]; if (t <= 0) { wea = q[0]; break; } }
      const form = ix.map(() => { const x = Math.random(); return x < 0.3 ? 1 : x < 0.75 ? 0 : -1; });
      const bp = (() => { const w = ix.map(() => 0); for (let m = 0; m < 800; m++) { let b = 0, bv = -1; for (let i = 0; i < 5; i++) { const v = DOG_DB[ix[i]][0] * Math.exp(0.22 * dogGauss()) * dogEvF(); if (v > bv) { bv = v; b = i; } } w[b]++; } return w.map((x) => x / 800); })();
      const dogs = ix.map((n, i) => ({ name: n, odds: Math.min(20, Math.max(1.3, Math.round(0.9 / Math.max(bp[i], 0.01) * 10) / 10)), status: form[i] > 0 ? '精神飽滿' : form[i] < 0 ? '有點疲倦' : '普通' }));
      const w = DOG_WEA[wea];
      const eff = ix.map((n, i) => { const db = DOG_DB[n]; const wf = !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1]; return db[0] * (1 + wf + form[i] * 0.02) * Math.exp(0.22 * dogGauss()) * dogEvF(); });
      let win = 0; for (let i = 1; i < 5; i++) if (eff[i] > eff[win]) win = i;
      [['mine', W], ['base', D]].forEach(([key, WW]) => { const pk = dogPickW(dogs, wea, WW, 600); if (!pk) return; if (pk.i === win) { r[key].hit++; r[key].net += Math.floor(1000 * dogs[pk.i].odds) - 1000; } else r[key].net -= 1000; });
    }
    return r;
  }
  function dogWShow(html) { const el = $('#g155-dogw-res'); if (el) { el.style.display = ''; el.innerHTML = html; } }
  const DOG_NM = { U: '你的權重', A: '純期望值', B: '純勝率', C: '期望值＋0.5×勝率', D: '期望值＋1×勝率', E: '期望值＋2×勝率', F: '勝率≥20%挑期望值', H: '只押賠率最低', I: '實力×加成', J: '只看天氣＋狀態加成', K: '實力＋2×加成' };
  function dogMethodPicks(live, weaName) { // live：[{name, odds, status, pu, pg}]
    const w = DOG_WEA[weaName];
    const bonusOf = (d) => { const db = DOG_DB[d.name] || [1]; const wf = !w || !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1]; return wf + (/飽滿/.test(d.status) ? 0.02 : (/疲倦/.test(d.status) ? -0.02 : 0)); };
    const base = (d) => (DOG_DB[d.name] || [1])[0], p = (d) => d.pg, ev = (d) => d.pg * d.odds;
    const M = { A: ev, B: p, C: (d) => ev(d) + 0.5 * p(d), D: (d) => ev(d) + p(d), E: (d) => ev(d) + 2 * p(d), F: (d) => (p(d) >= 0.2 ? 10 : 0) + ev(d), H: (d) => -d.odds, I: (d) => base(d) * (1 + bonusOf(d)), J: (d) => bonusOf(d) + base(d) * 1e-4, K: (d) => base(d) + 2 * bonusOf(d), U: (d) => d.pu };
    const out = {}; Object.keys(M).forEach((k) => { const x = live.reduce((a, b) => (M[k](b) > M[k](a) ? b : a)); out[k] = { n: x.name, o: x.odds }; });
    return out;
  }
  function dwRecalc() { // 權重改了：出馬表沒開也用上一張出馬表的資料立刻重算
    const sn = dogSnap; if (!sn || !sn.live) return;
    const dogs = sn.live.map((d) => ({ name: d.name, status: d.status, hist: d.hist, odds: d.odds })), pu = dogTrueProb(dogs, sn.wea, 6000, dogW()) || [];
    sn.live.forEach((d, i) => { d.pu = pu[i] || 0; d.ev = d.pu * d.odds; });
    if (!sn.used) sn.mp = dogMethodPicks(sn.live, sn.wea);
    const wp = cfg.dogWP === 'bonus' ? 0.5 : (+cfg.dogWP || 0); let b = 0; sn.live.forEach((d, i) => { if (d.ev + wp * d.pu > sn.live[b].ev + wp * sn.live[b].pu) b = i; });
    if (!sn.used) { sn.sug = sn.live[b].name; sn.sugOdds = sn.live[b].odds; sn.sugP = sn.live[b].pu; sn.sugEv = sn.live[b].ev; }
    dwLive();
  }
  function dwLive() {
    const el = $('#g155-dw-live'); if (!el) return;
    const sn = dogSnap; if (!sn || !sn.live) { el.innerHTML = '<span style="color:#aaa">打開賽狗場出馬表後，這裡會用你的權重算出每隻狗的勝率。</span>'; return; }
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const w = DOG_WEA[sn.wea] || [], STY = { early: '快', late: '慢', steady: '穩' };
    const pref = (n) => { const db = DOG_DB[n] || []; if (!w[0]) return '—'; return db[1] === w[0] ? '<span style="color:#7dff9a">愛</span>' : db[2] === w[0] ? '<span style="color:#ff8a7a">怕</span>' : '—'; };
    const fm = (t) => /飽滿/.test(t) ? '<span style="color:#7dff9a">亢</span>' : /疲倦/.test(t) ? '<span style="color:#ff8a7a">疲</span>' : '—';
    const open = !!dogWindow() && !sn.used, rows = sn.live; // 照遊戲出馬表的閘號順序
    let top = 0; rows.forEach((d, i) => { if (d.pu > rows[top].pu) top = i; });
    el.innerHTML = '<b style="color:#f0c060">' + (open ? '本場' : '上一場') + '</b>　天氣：<b>' + esc(sn.wea) + '</b>' + (w[0] ? '（' + w[0] + (w[1] !== 1 ? ' ×' + w[1] : '') + '）' : '（不偏誰）') + (sn.sug ? '　建議押 <b>' + esc(sn.sug) + '</b>' : '') +
      '<table class="g155-umt" style="border-collapse:collapse;width:100%;font-size:.85em;margin-top:2px"><tr style="color:#cdbf9a"><td>閘</td><td>狗</td><td title="快=起跑快 慢=起步慢 穩=穩定">性</td><td title="愛／怕今天的場地">喜</td><td title="亢=精神飽滿 疲=有點疲倦">態</td><td title="你自己的歷史勝率">歷史</td><td>賠</td><td>你的</td><td>公式</td><td title="你的勝率 × 賠率">期望</td></tr>' +
      rows.map((d, i) => '<tr' + (i === top ? ' style="color:#ffd75e;font-weight:bold"' : '') + '><td>' + (i + 1) + '</td><td>' + (i === top ? '👑' : '') + esc(d.name) + (sn.win === d.name ? ' 🏆' : '') + '</td><td>' + (STY[DOG_STY[d.name]] || '') + '</td><td>' + pref(d.name) + '</td><td>' + fm(d.status) + '</td><td>' + (d.hist != null ? d.hist + '%' : '—') + '</td><td>' + d.odds + '</td><td>' + (d.pu * 100).toFixed(1) + '%</td><td>' + (d.pg * 100).toFixed(1) + '%</td><td>' + d.ev.toFixed(2) + '</td></tr>').join('') + '</table>' +
      '<div style="color:#aaa;font-size:.85em">👑 你的權重算出最可能勝出' + (sn.win ? '　🏆 實際冠軍：' + esc(sn.win) : (open ? '，跑完標 🏆' : '')) + '</div>' +
      (sn.mp ? '<div style="margin-top:3px"><b style="color:#f0c060">各方法押哪隻</b>' + rows.map((d) => { const ks = Object.keys(DOG_NM).filter((k) => sn.mp[k] && sn.mp[k].n === d.name); return ks.length ? '<div' + (sn.win === d.name ? ' style="color:#ffd75e"' : '') + '>' + esc(d.name) + (sn.win === d.name ? ' 🏆' : '') + '：' + ks.map((k) => '<span title="' + DOG_NM[k] + '">' + (k === 'U' ? '你的權重' : k) + '</span>').join('、') + '</div>' : ''; }).join('') + '</div>' : '');
    const st = $('#g155-dw-stat'); if (!st) return;
    const k = 'g155helper.dogcmp' + (ME.name ? '@' + ME.acct + '@' + ME.name : ''); let a = safeParse(localStorage.getItem(k)); a = Array.isArray(a) ? a.slice(-50) : [];
    if (!a.length) { st.innerHTML = '<span style="color:#aaa">還沒有紀錄</span>'; return; }
    const res = Object.keys(DOG_NM).map((m) => { let n = 0, hit = 0, net = 0; a.forEach((r) => { const x = r.m && r.m[m]; if (!x) return; n++; net += x[2]; if (x[2] > 0) hit++; }); return { m, n, hit, net }; }).filter((x) => x.n).sort((x, y) => y.net - x.net);
    st.innerHTML = '<b style="color:#f0c060">各方法最近 ' + a.length + ' 場成績</b>（每場以 1,000 計）<table class="g155-umt" style="border-collapse:collapse;width:100%;font-size:.85em">' +
      res.map((x, i) => '<tr' + (x.m === 'U' ? ' style="color:#8cf"' : '') + '><td>' + (i + 1) + '.</td><td>' + (x.m === 'U' ? '' : x.m + ' ') + DOG_NM[x.m] + '</td><td>中 ' + x.hit + '/' + x.n + '</td><td style="color:' + (x.net >= 0 ? '#9be37a' : '#ff8a6a') + '">' + (x.net >= 0 ? '+' : '') + x.net.toLocaleString() + '</td></tr>').join('') + '</table>' +
      '<span style="color:#aaa;font-size:.85em">「你的權重」從現在開始記，場數會比其他方法少。各方法的勝率都用遊戲公式算。</span>';
  }

  // 押多少：固定 = 期望值到門檻押設定的賭注、否則 1,000；凱利 = 押「資金 × 優勢 ÷ (賠率−1) × 倍數」，往下取最接近的賭注按鈕
  // 凱利用遊戲公式的勝率（pg），不用自訂權重，避免權重把勝率算太高而押太大；資金 = 目前金幣 − 停損線
  const KN_TPL = {
    '攻擊': { pri: ['嗜血', '劍氣數量', '劍術強化', '疾風步', '劍氣貫穿', '生命之泉', '拾取範圍', '衝擊劍氣', '騎士的意志', '強健體魄', '死裡逃生', '堅固防禦', '劍氣', '魔王殺手', '護盾之泉'],
      ban: ['劍氣風暴', '破甲劍氣', '地裂術', '紫色地獄火', '堅固防護', '尖刺盔甲', '施法速度', '強化補血球', '遠射', '大地防護', '生存危機'], caution: 1, retreatHp: 0.5 },
    '保命': { pri: ['嗜血', '劍氣數量', '劍術強化', '生命之泉', '騎士的意志', '紫色地獄火', '地裂術', '疾風步', '劍氣貫穿', '拾取範圍', '強健體魄', '死裡逃生', '衝擊劍氣', '堅固防禦', '劍氣', '魔王殺手', '護盾之泉'],
      ban: ['劍氣風暴', '破甲劍氣', '堅固防護', '尖刺盔甲', '施法速度', '強化補血球', '遠射', '大地防護', '生存危機'], caution: 1.3, retreatHp: 0.6 },
  };
  function applyTpl(name) { // 套用騎士模板；從「自訂」換走前先把目前的設定存成自訂
    const b = cfg.build || 'damage', cur = () => ({ pri: (customOf('knight', b) || []).slice(), ban: bannedOf('knight', b).slice(), caution: cfg.caution, retreatHp: cfg.retreatHp || 0.5 });
    if (!KN_TPL[cfg.tpl]) cfg.tplCustom = cur();
    const t = name === '自訂' ? cfg.tplCustom : KN_TPL[name]; if (!t) return false;
    cfg.customBuilds = Object.assign({}, cfg.customBuilds); cfg.customBuilds.knight = Object.assign({}, cfg.customBuilds.knight, { [b]: t.pri.slice() });
    cfg.banCards = Object.assign({}, cfg.banCards); cfg.banCards.knight = Object.assign({}, cfg.banCards.knight, { [b]: t.ban.slice() });
    cfg.caution = t.caution; cfg.retreatHp = t.retreatHp; cfg.tpl = name === '自訂' ? '' : name; saveCfg();
    const c = $('#g155-caution'); if (c) c.value = cfg.caution;
    log('騎士模板：' + name + '（謹慎 ' + cfg.caution + '｜血量低於 ' + Math.round(cfg.retreatHp * 100) + '% 撤退｜不選 ' + t.ban.length + ' 張）');
    return true;
  }
  function dogStake(pg, odds, evUser) {
    if (cfg.dogStake === 'kelly') {
      const edge = (pg || 0) * odds - 1; if (!(edge > 0) || !(odds > 1)) return 1000;
      const want = edge / (odds - 1) * (+cfg.dogKellyK || 0.5) * Math.max(0, gold() - (+cfg.dogStopBelow || 0));
      const cap = +cfg.dogBet || 1e7; let b = 1000;
      for (const x of [1000, 10000, 100000, 1000000, 10000000]) if (x <= want && x <= cap) b = x;
      return b;
    }
    return evUser >= cfg.dogMinEV ? cfg.dogBet : 1000;
  }
  let dogSnap = null;
  function dogPickBy(dogs, weaName) { // 小幫手會押哪一隻（和自動下注同一套算法）
    const probs = dogTrueProb(dogs, weaName, 6000);
    if (probs) dogs.forEach((d, i) => {
      d.p = probs[i]; d.ev = probs[i] * d.odds;
      if (cfg.dogWP === 'bonus') { const db = DOG_DB[d.name], w = DOG_WEA[weaName]; const wf = !w || !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1]; d.score = wf + (/飽滿/.test(d.status) ? 0.02 : (/疲倦/.test(d.status) ? -0.02 : 0)) + db[0] * 1e-4; }
      else d.score = d.ev + (+cfg.dogWP || 0) * probs[i];
    });
    else dogs.forEach((d) => { d.p = 0; d.ev = 0; d.score = -d.odds; });
    return dogs.slice().sort((a, b) => b.score - a.score || a.odds - b.odds)[0];
  }
  function dogWatch() {
    const body = dogWindow(), sug = $('#g155-dogsug');
    if (!body) { if (sug) sug.style.display = 'none'; return; }
    const dogs = parseDogs(body);
    if (dogs.length) { // 出馬表
      if (state.dogPend && state.dogPend.manual) dogRecFinish(true); // 手動那場已經跑完回到出馬表
      const bs = $$('b', body), weaName = ((bs[1] || {}).textContent || '').trim();
      const key = ((bs[0] || {}).textContent || '') + '|' + weaName + '|' + dogs.map((d) => d.name + d.odds).join(',') + '|' + JSON.stringify(dogW()) + cfg.dogWP;
      if (!dogSnap || dogSnap.key !== key) {
        const best = dogPickBy(dogs, weaName);
        const pu = dogTrueProb(dogs, weaName, 6000, dogW()) || [], pg = dogTrueProb(dogs, weaName, 6000, DW_DEF) || [];
        dogSnap = { key, wea: weaName, sug: best.name, sugOdds: best.odds, sugP: best.p || 0, sugEv: best.ev || 0, dogs: dogs.map((d) => [d.name, d.odds, Math.round((d.p || 0) * 1000), Math.round((d.ev || 0) * 100), d.status, d.hist]), used: false,
          live: dogs.map((d, i) => ({ name: d.name, status: d.status, hist: d.hist, odds: d.odds, pu: pu[i] || 0, pg: pg[i] || 0, ev: (pu[i] || 0) * d.odds })) };
        dogSnap.mp = dogMethodPicks(dogSnap.live, weaName);
        dwLive();
      }
      const sel = dogs.find((d) => /outline/.test(d.tr.getAttribute('style') || ''));
      dogSnap.sel = sel ? sel.name : ''; dogSnap.gold = gold();
      if (sug) { sug.style.display = ''; sug.innerHTML = '本場建議：<b>' + dogSnap.sug + '</b>（賠率 ' + dogSnap.sugOdds + '｜勝率 ' + Math.round(dogSnap.sugP * 100) + '%｜期望值 ' + dogSnap.sugEv.toFixed(2) + '）' + (() => { const l = (dogSnap.live || []).find((x) => x.name === dogSnap.sug); return l ? '<br>建議押 <b>' + dogStake(l.pg, l.odds, dogSnap.sugEv).toLocaleString() + '</b>（' + (cfg.dogStake === 'kelly' ? '凱利 ×' + (+cfg.dogKellyK || 0.5) + '｜遊戲公式勝率 ' + Math.round(l.pg * 100) + '%' : '固定') + '）' : ''; })() + (dogSnap.sel ? '<br>你選的：<b>' + dogSnap.sel + '</b>' + (dogSnap.sel === dogSnap.sug ? '（同建議）' : '') : ''); }
    } else if (dogSnap && !dogSnap.used && !state.dogOn) { // 自動沒開、畫面卻開始比賽：是手動下注
      dogSnap.used = true;
      const me = dogSnap.dogs.find((d) => d[0] === dogSnap.sel);
      state.dogPend = { t: new Date().toLocaleTimeString('zh-TW', { hour12: false }).slice(0, 5), wea: dogSnap.wea, pick: dogSnap.sel || '?', odds: me ? me[1] : '', stake: Math.max(0, (dogSnap.gold || 0) - gold()), sug: dogSnap.sug, manual: 1, mp: dogSnap.mp, dogs: dogSnap.dogs, n0: CHAT.dog };
      if (sug) sug.style.display = 'none';
    }
    if (state.dogPend && state.dogPend.manual) dogRecFinish(false);
  }

  // ── 骰子 ──
  // 規則（你指定的）：固定押一個點數；每把沒開「累積」加 diceStep %，開了歸零；每累積 diceLvEvery % 賭注升一級（1,000 → 10,000 → …），最高到 diceMaxBet。
  // 注意：遊戲每把都是重新擲三顆骰子，累積多少都不會改變真正的機率（押單點約 42% 會開）。
  const DICE_LV = [1000, 10000, 100000, 1000000, 10000000];
  const diceWindow = () => { const w = $('#npcwin'), t = $('#nwT'); return visible(w) && t && t.textContent.includes('骰子莊家') ? $('#nwB') : null; };
  const diceLadder = () => String(cfg.diceLadder || '').split(/[,，\s]+/).map(Number).filter((x) => x > 0);
  const diceLevel = () => { // 連續沒中幾次 → 第幾級
    const lad = diceLadder(), miss = state.diceMiss || 0;
    if (lad.length) { let need = 0, lv = 0; for (const n of lad) { need += n; if (miss >= need) lv++; else break; } return lv; }
    return cfg.diceLvEvery > 0 ? Math.floor((state.diceCnt || 0) / cfg.diceLvEvery) : 0; // 沒填階梯：照累積 %
  };
  const diceNextBet = () => { const i0 = Math.max(0, DICE_LV.indexOf(+cfg.diceBase)), im = Math.max(i0, DICE_LV.indexOf(+cfg.diceMaxBet)); return DICE_LV[Math.min(im, i0 + diceLevel())]; };
  let diceGoAt = 0, diceGoTry = 0, diceAt = 0;
  function diceGo() {
    const now = Date.now();
    if (inBattle()) { state.dicePhase = '戰鬥中，回村莊後會自動前往骰子莊家'; return; }
    state.dicePhase = '正在前往骰子莊家';
    const dlg = $('#npcdlg');
    if (visible(dlg)) { release(); if (now - diceGoAt < 700) return; diceGoAt = now; const opts = $$('.dgo', dlg), go = opts.find((e) => /擲骰子/.test(e.textContent)), x = opts.find((e) => e.textContent.trim() === '離開'); if (go) go.click(); else if (x) { x.click(); diceGoAt = now - 2800; } return; }
    const w = $('#npcwin'); if (visible(w)) { release(); if (now - diceGoAt > 900) { diceGoAt = now; const x = $('#nwX'); if (x) x.click(); } return; }
    if (now - diceGoAt < 3500) { release(); return; }
    const dn = SENSE.diceNpc;
    if (dn && now - dn.t < 800 && dn.x > dn.cw * 0.08 && dn.x < dn.cw * 0.92 && dn.y > dn.ch * 0.1 && dn.y < dn.ch * 0.7) { release(); diceGoAt = now; diceGoTry++; clickCanvasPx(dn.x + (diceGoTry % 3 - 1) * 6, dn.y + 30 + (diceGoTry % 3) * 6); return; }
    const m = (($('#coord') || {}).textContent || '').match(/(\d+),(\d+)/); if (!m) return;
    const ex = 103 - (+m[1]), ey = 293 - (+m[2]), r = (ex + ey) / 2, u = (ex - ey) / 2, keys = []; // 骰子莊家在格子 (105,293)
    if (r > 0.4) keys.push('d'); else if (r < -0.4) keys.push('a');
    if (u > 0.4) keys.push('w'); else if (u < -0.4) keys.push('s');
    if (keys.length) hold(keys); else release();
  }
  function stopDice(why) { state.diceOn = false; state.dicePhase = ''; log('骰子停止：' + why); diceShow(); render(); }
  function diceTick() {
    if (!state.diceOn) return;
    const body = diceWindow(); if (!body) { diceGo(); diceShow(); return; }
    const now = Date.now();
    if (state.dicePhase === 'rolling') { // 等結果出現在聊天欄
      if (CHAT.dice > (state.diceSeq0 || 0)) {
        const t = CHAT.diceT, pk = String(cfg.dicePick);
        const r = (t.match(/^骰子：([\d、]+)/) || [])[1] || '';
        const win = (t.match(/贏了 ([\d,]+)/) || [])[1], lose = (t.match(/輸了 ([\d,]+)/) || [])[1];
        const net = win ? +win.replace(/,/g, '') : (lose ? -lose.replace(/,/g, '') : 0), hit = net > 0;
        state.diceN++; if (hit) { state.diceHits++; state.diceCnt = 0; state.diceMiss = 0; } else { state.diceCnt += +cfg.diceStep || 0; state.diceMiss = (state.diceMiss || 0) + 1; }
        state.diceHist.unshift({ t: new Date().toLocaleTimeString('zh-TW', { hour12: false }), r, bet: state.diceBetNow, net, hit, pk });
        state.diceHist = state.diceHist.slice(0, 30);
        log('骰子第 ' + state.diceN + ' 把：' + r + '｜押 ' + (pk === 'big' ? '大' : pk === 'small' ? '小' : pk + ' 點') + ' ' + (state.diceBetNow || 0).toLocaleString() + '｜' + (hit ? '中 +' : '沒中 ') + net.toLocaleString() + '｜累積 ' + state.diceCnt + '%｜連續沒中 ' + (state.diceMiss || 0) + '｜下一注 ' + diceNextBet().toLocaleString());
        state.dicePhase = ''; diceAt = now; diceShow();
      } else if (now - state.diceRollAt > 12000) { state.dicePhase = ''; diceAt = now; }
      return;
    }
    if (now - diceAt < 1500) return;
    const g = gold(); if (state.diceStartGold === null) state.diceStartGold = g;
    if (cfg.diceMaxRolls > 0 && state.diceN >= cfg.diceMaxRolls) return stopDice('已達 ' + cfg.diceMaxRolls + ' 把');
    if (cfg.diceMaxLoss > 0 && state.diceStartGold - g >= cfg.diceMaxLoss) return stopDice('已達虧損上限 ' + (+cfg.diceMaxLoss).toLocaleString());
    const bet = diceNextBet(); if (bet > g) return stopDice('金幣不夠下一注 ' + bet.toLocaleString());
    if (typeof window.__dcBet !== 'function' || typeof window.__dcRoll !== 'function') return stopDice('找不到遊戲的骰子功能');
    state.diceSeq0 = CHAT.dice; // 這一把擲出後，對話紀錄要多一行骰子結果
    state.diceBetNow = bet; state.dicePhase = 'rolling'; state.diceRollAt = now;
    const pk = String(cfg.dicePick);
    try { window.__dcBet(bet); window.__dcRoll(pk === 'big' || pk === 'small' ? pk : +pk); } catch (e) { stopDice('擲骰子失敗：' + e.message); }
  }
  function diceShow() {
    const el = $('#g155-dicesum'); if (!el) return;
    const g = gold(), net = state.diceStartGold === null ? 0 : g - state.diceStartGold;
    el.innerHTML = (state.diceOn ? '● 進行中' : '○ 已停止') + (state.dicePhase && state.dicePhase !== 'rolling' ? '｜' + state.dicePhase : '') +
      '<br>開始金幣 <b>' + (state.diceStartGold === null ? '—' : state.diceStartGold.toLocaleString()) + '</b>｜目前金幣 <b>' + g.toLocaleString() + '</b>' +
      '<br>累積 <b>' + (state.diceCnt || 0) + '%</b>｜連續沒中 <b>' + (state.diceMiss || 0) + '</b>｜下一注 <b>' + diceNextBet().toLocaleString() + '</b>' +
      '<br>第 ' + (state.diceN || 0) + ' 把｜中 ' + (state.diceHits || 0) + '（' + (state.diceN ? Math.round(state.diceHits / state.diceN * 100) : 0) + '%）｜輸贏 <b style="color:' + (net >= 0 ? '#9be37a' : '#ff8a6a') + '">' + (net >= 0 ? '+' : '') + net.toLocaleString() + '</b>';
    const rec = $('#g155-dicerec'); if (rec) rec.innerHTML = state.diceHist.length ? state.diceHist.slice(0, 12).map((h) => '<div style="color:' + (h.hit ? '#9be37a' : '#cdb') + '">' + h.t + '　' + h.r + '　押 ' + h.bet.toLocaleString() + '　' + (h.net >= 0 ? '+' : '') + h.net.toLocaleString() + '</div>').join('') : '<span style="color:#aaa">還沒有擲過</span>';
    const b = $('#g155-dice'); if (b) b.textContent = state.diceOn ? '■ 停止自動骰子' : '▶ 開始自動骰子';
  }

  function dogTick() {
    try { diceTick(); } catch (e) { log('骰子出錯：' + e.message); }
    try { dogWatch(); } catch (e) {}
    if (!state.dogOn) return;
    const body = dogWindow();
    if (!body) { dogGo(); dogSummary(); return; }
    dogGoSince = 0;

    const g = gold();
    if (state.dogStartGold === null) state.dogStartGold = g;

    const dogs = parseDogs(body);
    if (dogs.length) {
      // ── 下注階段 ──
      if (state.dogPhase === 'bet-sent') { // 已送出，等畫面切換；絕不在同一張出馬表上重複下注
        if (Date.now() - state.betAt > 15000) stopDog('下注後畫面沒有切換，請手動檢查');
        return;
      }
      if (state.dogPhase === 'racing' && state.dogCmp && !state.dogCmp.win) {
        const m = CHAT.dog > (state.dogCmp.n0 || 0) ? CHAT.dogT.match(/^賽狗：(\S+) 奪冠/) : null;
        if (m) {
          const c = state.dogCmp; c.win = m[1];
          const net = (x) => (x.n === c.win ? Math.floor(1000 * x.o) - 1000 : -1000);
          const row = { t: new Date().toLocaleTimeString('zh-TW', { hour12: false }), wea: c.wea, win: c.win, m: {} };
          Object.keys(c.picks).forEach((k) => { row.m[k] = [c.picks[k].n, c.picks[k].o, net(c.picks[k])]; });
          const k = 'g155helper.dogcmp' + (ME.name ? '@' + ME.acct + '@' + ME.name : '');
          const a = safeParse(localStorage.getItem(k)); const arr = Array.isArray(a) ? a : []; arr.push(row);
          try { localStorage.setItem(k, JSON.stringify(arr.slice(-500))); } catch (e) {}
          const sum = (f) => arr.reduce((x, r) => x + f(r), 0);
          const tot = Object.keys(row.m).map((k) => [k, sum((r) => (r.m && r.m[k] ? r.m[k][2] : 0)), sum((r) => (r.m && r.m[k] && r.m[k][2] > 0 ? 1 : 0))]).sort((a, b) => b[1] - a[1]);
          log(`比較 ${arr.length} 場｜` + tot.slice(0, 4).map((x) => x[0] + ' 中' + x[2] + ' ' + (x[1] >= 0 ? '+' : '') + x[1].toLocaleString()).join('｜'));
        }
      }
      if (state.dogPhase === 'racing') dogRecFinish(true);
      if (state.dogPhase === 'racing') { // 剛從比賽回到出馬表 = 上一場結束
        state.dogDone = (state.dogDone || 0) + 1;
        if (state.dogAfterBet !== undefined && g > state.dogAfterBet) state.dogWins = (state.dogWins || 0) + 1;
        state.dogAfterBet = undefined;
        dogSummary();
        log(`第 ${state.dogRaces} 場結束，金幣 ${g.toLocaleString()}（本次 ${(g - state.dogStartGold >= 0 ? '+' : '') + (g - state.dogStartGold).toLocaleString()}）`);
      }
      if (cfg.dogMaxRaces > 0 && state.dogRaces >= cfg.dogMaxRaces) return stopDog('已達場數上限'); // 0 = 無限
      if (g - (cfg.dogStake === 'kelly' ? 1000 : cfg.dogBet) < cfg.dogStopBelow) return stopDog('金幣將低於停損線');
      if (cfg.dogMaxLoss > 0 && state.dogStartGold - g >= cfg.dogMaxLoss) return stopDog('已達本次虧損上限');

      const weaName = (($$('b', body)[1] || {}).textContent || '').trim();
      const probs = dogTrueProb(dogs, weaName, 6000);
      { const pgA = dogTrueProb(dogs, weaName, 6000, DW_DEF) || []; dogs.forEach((d, i) => { d.pg = pgA[i] || 0; }); } // 遊戲公式的勝率，給凱利算押多少
      // 綜合分數 = 期望值 + 勝率加權 × 真實勝率。加權 0 = 純期望值；調高會偏向勝率高、賠率低的狗，起伏較小
      const bonusMode = cfg.dogWP === 'bonus';
      if (probs) dogs.forEach((d, i) => {
        d.p = probs[i]; d.ev = probs[i] * d.odds;
        if (bonusMode) { // 因素加成法：天氣修正＋狀態修正最大的；基本實力只用來分高下
          const db = DOG_DB[d.name], w = DOG_WEA[weaName];
          const wf = !w || !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1];
          const fm = /飽滿/.test(d.status) ? 0.02 : (/疲倦/.test(d.status) ? -0.02 : 0);
          d.bonus = wf + fm; d.score = d.bonus + db[0] * 1e-4;
        } else d.score = d.ev + (+cfg.dogWP || 0) * probs[i];
      });
      else { // 遇到沒看過的狗或天氣：退回用播報員提示粗估
        const ann = body.innerText;
        const good = (ann.match(/愛(\S{1,4}?)的狗/) || [])[1], bad = (ann.match(/怕(\S{1,4}?)的/) || [])[1];
        dogs.forEach((d) => { d.p = 0; d.ev = scoreDog(d, good, bad) * 0.9; d.score = d.ev; });
      }
      // 兩種方法的選擇都記下來（同一場比賽，結果出來後各自算勝負）
      if (probs) {
        const w = DOG_WEA[weaName];
        const bonusOf = (d) => { const db = DOG_DB[d.name]; const wf = !w || !w[0] ? 0 : (db[1] === w[0] ? 0.05 : (db[2] === w[0] ? -0.05 : 0)) * w[1]; return wf + (/飽滿/.test(d.status) ? 0.02 : (/疲倦/.test(d.status) ? -0.02 : 0)); };
        const best = (f) => dogs.reduce((a, b) => (f(b) > f(a) ? b : a));
        const base = (d) => DOG_DB[d.name][0];
        const M = {
          A: (d) => d.ev,                                   // 純期望值
          B: (d) => d.p,                                    // 純勝率
          C: (d) => d.ev + 0.5 * d.p,                       // 期望值＋0.5×勝率
          D: (d) => d.ev + d.p,                             // 期望值＋1×勝率（預設）
          E: (d) => d.ev + 2 * d.p,                         // 期望值＋2×勝率
          F: (d) => (d.p >= 0.2 ? 10 : 0) + d.ev,           // 勝率≥20% 裡挑期望值最高
          H: (d) => -d.odds,                                // 只押賠率最低
          I: (d) => base(d) * (1 + bonusOf(d)),             // 實力×(1＋加成)
          J: (d) => bonusOf(d) + base(d) * 1e-4,            // 只看加成
          K: (d) => base(d) + 2 * bonusOf(d),               // 實力＋2×加成
        };
        const picks = {}; Object.keys(M).forEach((k) => { const x = best(M[k]); picks[k] = { n: x.name, o: x.odds }; });
        state.dogCmp = { at: Date.now(), wea: weaName, picks, n0: CHAT.dog };
      } else state.dogCmp = null;
      dogs.sort((a, b) => b.score - a.score || a.odds - b.odds);
      const pick = dogs[0];
      // 期望值夠高才押設定的賭注；不夠高時只押最低的 1,000 把這場帶過（不下注就不會換下一場）
      const stake = dogStake(pick.pg, pick.odds, pick.ev); // 固定：看期望值門檻；凱利：照優勢與資金
      state.dogStake = stake; state.dogEV = pick.ev;

      const betBtn = $$('button.big', body).find((b) => num(b.textContent) === stake);
      if (!betBtn || betBtn.disabled) return stopDog('找不到或無法使用該賭注按鈕');

      pick.tr.click();
      betBtn.click();
      setTimeout(() => {
        const go = $$('button.big', body).find((b) => !/^[\d,]+$/.test(b.textContent.trim()));
        if (!go || /請先選/.test(go.textContent) || go.disabled) { state.dogPhase = ''; return; }
        go.click();
        state.dogRaces++;
        setTimeout(() => { state.dogAfterBet = gold(); dogSummary(); }, 600); // 下注扣款後的金幣，結算後比它多就是猜中
        state.lastPick = pick.name;
        { if (dogSnap) dogSnap.used = true; state.dogPend = { mp: dogSnap && dogSnap.mp, t: new Date().toLocaleTimeString('zh-TW', { hour12: false }).slice(0, 5), wea: weaName, pick: pick.name, sug: pick.name, odds: pick.odds, stake, dogs: dogs.map((d) => [d.name, d.odds, Math.round((d.p || 0) * 1000), Math.round((d.ev || 0) * 100), d.status, d.hist]), n0: CHAT.dog }; }
        state.dogPhase = 'bet-sent';
        log(`第 ${state.dogRaces} 場［${weaName}］押 ${pick.name}｜賠率 ${pick.odds}｜勝率 ${Math.round((pick.p || 0) * 100)}%｜期望值 ${pick.ev.toFixed(2)}｜${pick.bonus !== undefined ? '加成 ' + (pick.bonus >= 0 ? '+' : '') + Math.round(pick.bonus * 100) + '%' : '綜合 ' + pick.score.toFixed(2)}｜${stake.toLocaleString()}`);
      }, 300);
      state.dogPhase = 'bet-sent';
      state.betAt = Date.now();
      return;
    }

    // ── 比賽中／結算畫面 ──
    state.dogPhase = 'racing';
    dogRecFinish(false);
    const next = $$('button', body).find((b) => /下一場|再來|繼續|再賭/.test(b.textContent) && !b.disabled);
    if (next) next.click();
  }

  // ── 累計總列 ──
  // 本場：這一場撿到的金幣／物品（新的一場開始時歸零）
  // 總累計：按下「開始自動走位」起，到按下「停止」前的總和（停止後保留顯示，下次按開始時歸零）
  // 每個角色分開存在 localStorage；每次都重新讀，不留舊的快取（以前舊版小幫手的計時器會把舊數字畫回面板，看起來跳來跳去）
  const lootKey = () => (ME.name ? 'g155helper.loot2@' + ME.acct + '@' + ME.name : '');
  const lootNew = () => ({ since: Date.now(), gold: 0, n: 0, items: {} });
  function lootData() {
    const k = lootKey(); const o = k ? safeParse(localStorage.getItem(k)) : null;
    return { run: (o && o.run && o.run.items) ? o.run : lootNew(), total: (o && o.total && o.total.items) ? o.total : lootNew() };
  }
  function lootSave(d) { const k = lootKey(); if (k) try { localStorage.setItem(k, JSON.stringify(d)); } catch (e) {} }
  const lootQ = []; let lootQT = 0;
  function lootAdd(text) { lootQ[lootQ.length] = String(text); if (!lootQT) lootQT = setTimeout(lootFlush, 800); } // 在遊戲的 push 裡被呼叫：只排隊
  function lootFlush() {
    clearTimeout(lootQT); lootQT = 0; if (!lootQ.length) return;
    const q = lootQ.splice(0); if (!lootKey()) return;
    const d = lootData();
    q.forEach((text) => {
      const m = text.trim().match(/^(.+?)(?:\s*×\s*([\d,]+))?$/); if (!m) return;
      const name = m[1].trim(), n = m[2] ? parseInt(m[2].replace(/,/g, ''), 10) || 1 : 1;
      const add = (t) => { if (name === '金幣') t.gold += n; else { t.n += n; t.items[name] = (t.items[name] || 0) + n; } };
      add(d.run); if (state.farmOn) add(d.total); // 停止後不再加進總累計
      if (name !== '金幣') { const k = itemCatOf(name); log('撿到：' + ITEM_CAT_NM[k] + '｜' + name + (n > 1 ? ' ×' + n : ''), k); }
    });
    lootSave(d); lootShow();
  }
  function lootReset(which) { lootFlush(); const d = lootData(); d[which] = lootNew(); lootSave(d); lootShow(); }
  let lootEl = null; // 只畫在這一份小幫手自己的面板上
  function lootShow() {
    const el = lootEl; if (!el || !el.isConnected) return;
    if (!lootKey()) { el.textContent = '累計：等待角色資料…'; return; }
    const d = lootData(), hm = (t) => { const x = new Date(t); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
    const top = Object.entries(d.total.items).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0] + '×' + x[1]).join('、');
    el.innerHTML = '本場：金幣 <b>+' + d.run.gold.toLocaleString() + '</b>｜物品 <b>' + d.run.n.toLocaleString() + '</b> 件'
      + '<br>總累計（' + hm(d.total.since) + ' 開始' + (state.farmOn ? '' : '，已停止') + '）：金幣 <b>+' + d.total.gold.toLocaleString() + '</b>｜物品 <b>' + d.total.n.toLocaleString() + '</b> 件'
      + (top ? '<br><span style="color:#cdbf9a;font-weight:normal">最多：' + top + '</span>' : '');
    el.title = '總累計明細：\n' + (Object.entries(d.total.items).sort((a, b) => b[1] - a[1]).map((x) => x[0] + ' ×' + x[1]).join('\n') || '還沒撿到物品');
  }

  function dogSummary() {
    const el = $('#g155-dogsum'); if (!el) return;
    const n = state.dogDone || 0;
    if (!n && !state.dogOn) { el.style.display = 'none'; return; }
    const w = state.dogWins || 0, net = state.dogStartGold === null ? 0 : gold() - state.dogStartGold;
    el.style.display = '';
    el.textContent = '賭狗 ' + n + ' 場｜中 ' + w + ' 場（勝率 ' + (n ? Math.round(w / n * 100) : 0) + '%）｜輸贏 ' + (net >= 0 ? '+' : '') + net.toLocaleString() + (state.dogOn ? (/前往|戰鬥中/.test(state.dogPhase || '') ? '｜' + state.dogPhase : '') : '（已停止）');
    el.style.color = net >= 0 ? '#9be37a' : '#ff8a6a';
  }

  function showCompare() {
    const NM = { U: '你的權重', A: '純期望值', B: '純勝率', C: '期望值＋0.5×勝率', D: '期望值＋1×勝率', E: '期望值＋2×勝率', F: '勝率≥20%挑期望值', H: '只押賠率最低', I: '實力×加成', J: '只看天氣＋狀態加成', K: '實力＋2×加成' };
    const k = 'g155helper.dogcmp' + (ME.name ? '@' + ME.acct + '@' + ME.name : '');
    let a = safeParse(localStorage.getItem(k)); a = Array.isArray(a) ? a : [];
    const n = num(($('#g155-cmpn') || {}).value); if (n > 0) a = a.slice(-n);
    if (!a.length) { log('比較表：還沒有比較紀錄（開始賭狗後每場都會記錄）'); return; }
    const keys = Object.keys(NM).filter((m) => a.some((r) => r.m && r.m[m]));
    const rows = keys.map((m) => { let hit = 0, net = 0, cnt = 0; a.forEach((r) => { const x = r.m && r.m[m]; if (!x) return; cnt++; net += x[2]; if (x[2] > 0) hit++; }); return { m, hit, cnt, net }; }).sort((x, y) => y.net - x.net);
    const lines = rows.map((r, i) => (i + 1) + '. ' + r.m + ' ' + NM[r.m] + '｜中 ' + r.hit + '/' + r.cnt + '（' + Math.round(r.hit / Math.max(1, r.cnt) * 100) + '%）｜' + (r.net >= 0 ? '+' : '') + r.net.toLocaleString());
    log('比較表（最近 ' + a.length + ' 場，每場以 1,000 計）\n' + lines.join('\n'));
  }

  function stopDog(why) {
    state.dogOn = false; state.dogPhase = '';
    log('賭狗停止：' + why);
    dogSummary();
    render();
  }

  // ───────────── 自動走位（刷怪） ─────────────
  // 遊戲本身會自動瞄準攻擊，所以只需要移動。怪物畫在 canvas 上讀不到座標，
  // 這版用固定繞圈走位；座標沒變（卡牆）就換方向。
  const DIRS = [['w'], ['w', 'd'], ['d'], ['d', 's'], ['s'], ['s', 'a'], ['a'], ['a', 'w']];
  const KEYINFO = { w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68] };
  let held = [], dirIdx = 0, lastStep = 0, lastCoord = '', spin = 1;

  function key(type, k) {
    const [code, kc] = KEYINFO[k];
    const o = { key: k, code, keyCode: kc, which: kc, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent(type, o));
    document.dispatchEvent(new KeyboardEvent(type, o));
  }
  function release() { held.forEach((k) => key('keyup', k)); held = []; }
  function hold(keys) { release(); keys.forEach((k) => key('keydown', k)); held = keys.slice(); }

  // 升級選單（#lvl）會暫停遊戲：依偏好關鍵字挑一張卡，沒有符合的就選第一張。
  let lastCardAt = 0;
  function pickCard() {
    const cards = $$('#cards .card');
    if (!cards.length || Date.now() - lastCardAt < 600) return;
    // 流派關鍵字在前，面板上自訂的偏好接在後面
    const prefs = buildList().concat(String(cfg.cardPrefer || '').split(/[,，\s]+/).filter(Boolean));
    const info = cards.map((el, idx) => {
      // 說明文字平常是隱藏的（滑鼠移上去才顯示），所以要用 textContent 才讀得到
      // 電腦版的卡片上沒有卡名（只有觸控裝置才把卡名寫在卡片上），卡名和說明在 data-tip（滑鼠移上去的說明）裡
      const tip = (el.dataset && el.dataset.tip) || '', tipName = (tip.match(/<b>([^<]+)<\/b>/) || [])[1];
      const text = (el.textContent + ' ' + tip.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const name = (tipName || ($('b', el) || {}).textContent || '?').trim();
      const tier = (el.className.match(/\bt-(\w+)/) || [])[1] || 'white';
      const isMorph = /^變身/.test(name);
      const rk = isMorph ? MORPH_RANK : TIER_RANK;
      let rank = rk[tier] !== undefined ? rk[tier] : 2;
      if (isMorph && cls() === 'mage' && /甘特/.test(text)) rank = 5.5; // 法師：甘特排在金色之上
      const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      const prefIdx = prefs.findIndex((p) => name.includes(p));
      const prefTxt = prefIdx >= 0 ? prefIdx : (prefs.findIndex((p) => text.includes(p)) >= 0 ? 500 : 999);
      return { el, idx, text, tier, rank, name, morph: /^變身/.test(name), value: nums.length ? Math.max.apply(null, nums) : 0, pref: prefTxt };
    });
    // 變身卡規則：白色不選；比目前變身差或一樣的不選（否則會把好的蓋掉）；
    // 金／紅／紫且比目前好的最優先（紫 > 紅 > 金）。
    const minRank = cfg.morphMin === 'none' ? 99 : (MORPH_RANK[cfg.morphMin] !== undefined ? MORPH_RANK[cfg.morphMin] : 1); // 面板設定：變身至少要什麼顏色才選
    const ban = bannedOf(cls(), cfg.build);
    const PK = morphPicks(), lockNm = PK.join('／');
    const curForm = (() => { try { const f = window.__g155P && window.__g155P.form; return (f && f.name) || ''; } catch (e) { return ''; } })();
    const locked = PK.length > 0 && PK.includes(curForm); // 已經是勾選的變身之一
    info.forEach((c) => { c.want = c.morph && !locked && PK.includes(morphNm(c.name)); });
    try { const ms = morphSeen(); let ch = false; info.forEach((c) => { if (c.morph) { const n = c.name.replace(/^變身[：:]\s*/, ''); if (n && !ms.includes(n)) { ms.push(n); ch = true; } } }); if (ch) localStorage.setItem('g155helper.morphSeen', JSON.stringify(ms.slice(-200))); } catch (e) {}
    let pool = info.filter((c) => !(c.morph && (locked || (!c.want && (c.rank < minRank || c.rank <= morphRank)))) && !ban.includes(c.name));
    const skipped = info.filter((c) => c.morph && !pool.includes(c)).length, banSeen = info.filter((c) => !c.morph && ban.includes(c.name)).map((c) => c.name);
    let forced = false;
    if (!pool.length) pool = info.filter((c) => !c.morph && !ban.includes(c.name));
    if (!pool.length) {
      // 選項全部都是「不選」的卡：遊戲有「重新抽選」（天賦）就先重抽，不浪費一次升級
      const re = $('#lvRe'); if (re && visible(re) && !re.disabled) { lastCardAt = Date.now(); log('升級：三張都是不選的卡（' + banSeen.join('、') + '），用重新抽選'); re.click(); return; }
      forced = true; pool = info.filter((c) => !c.morph);
    }
    if (!pool.length) pool = locked ? (info.filter((c) => c.morph && morphNm(c.name) === curForm).length ? info.filter((c) => c.morph && morphNm(c.name) === curForm) : info) : info; // 全部都是不想要的變身時遊戲仍在暫停，只能選一張（已指定變身時，有同一隻就選同一隻）
    const DEF_CARDS = /生命之泉|強健體魄|護盾之泉|大地防護|強化補血球|堅固防禦|堅固防護|尖刺盔甲|死裡逃生|生存危機/; // 被迫時最後才選的防禦卡
    // 排序：好的變身 → 符合流派（其中比稀有度）→ 其餘純比稀有度
    const bossSoon = runSecs() >= 300 || !!(lastMini && lastMini.boss);
    const situational = (c) => c.name === '魔王殺手' && !bossSoon; // 首領出現前不拿
    const capped = (c) => situational(c) || c.name === '拾取範圍' && (taken('拾取範圍') >= (cfg.build === 'speed' ? 3 : MAGNET_CAP) || (cfg.build === 'speed' && runSecs() < 180)); // 速度輸出流：3 分鐘後才拿，最多 3 張 // 拿滿上限後排到最後
    const grp = (c) => (c.want ? -1 : capped(c) ? 3 : (c.morph && c.rank >= 3 ? 0 : (c.pref < 999 ? 1 : 2))); // 指定的變身最優先
    // 先看分組（好的變身 → 清單內 → 清單外），清單內照優先順序；稀有度只在同順位或清單外時比
    if (forced) pool.sort((a, b) => (DEF_CARDS.test(a.name) ? 1 : 0) - (DEF_CARDS.test(b.name) ? 1 : 0) || b.rank - a.rank || a.idx - b.idx); // 被迫時：攻擊卡優先、防禦卡最後
    else pool.sort((a, b) => grp(a) - grp(b) || a.pref - b.pref || b.rank - a.rank || b.value - a.value || a.idx - b.idx);
    const pick = pool[0];
    lastCardAt = Date.now();
    if (pick.morph) morphRank = Math.max(morphRank, pick.rank);
    if (pick.want) log('變身：拿到指定的「' + morphNm(pick.name) + '」，這一場不再選其他變身');
    if (locked && skipped) log('變身：已是指定的「' + curForm + '」，略過 ' + skipped + ' 張變身卡');
    if (run && run.cards.length < 80) run.cards.push(pick.name + (pick.morph ? '[' + pick.tier + ']' : ''));
    info.forEach((c) => { CARDS_SEEN[c.name] = c.tier + '｜' + c.text.slice(0, 90); });
    try { const sc = seenCards(), k = cls(); sc[k] = sc[k] || {}; info.forEach((c) => { if (!c.morph) sc[k][c.name] = c.text.replace(c.name, '').replace(/(基本強化|武器強化|職業[^\s]*技能)\s*(新學會|Lv\.\d+\s*→\s*\d+)?/, '').trim().slice(0, 120) || 1; }); localStorage.setItem(SEEN_KEY, JSON.stringify(sc)); } catch (e) {}
    log(`升級選：${pick.name}［${pick.tier}］${pick.morph ? '（變身：' + pick.text.slice(0, 60) + '）' : ''}${forced ? '（三張都是不選的卡：' + banSeen.join('、') + '，只能選一張，攻擊卡優先）' : (banSeen.length ? '，略過不選的卡 ' + banSeen.join('、') : '')}${skipped ? '，略過變身 ' + skipped + ' 張' : ''}`);
    pick.el.click();
  }
  // 卡片外框顏色 class（t-xxx）對應的稀有度；目前實際看過 white / green / blue，其餘為推測。
  // 配卡流派：關鍵字比對卡名與說明，越前面越優先
  // 卡名皆為實際在遊戲中看過的。騎士主打回血＋生命上限；法師主打範圍攻擊＋究極光裂術。
  const BUILDS = {
    knight: {
      // 回血流：回血與生命上限為主，攻擊核心穿插其中
      sustain: ['劍氣數量', '生命之泉', '劍術強化', '騎士的意志', '強健體魄', '疾風步', '強化補血球', '死裡逃生', '堅固防護', '拾取範圍', '劍氣貫穿', '護盾之泉', '劍氣風暴', '大地防護', '堅固防禦', '地裂術', '紫色地獄火', '衝擊劍氣', '破甲劍氣', '尖刺盔甲', '生存危機'],
      // 攻擊流：清怪速度為主，只補最必要的回血
      damage: ['劍氣數量', '劍術強化', '疾風步', '劍氣貫穿', '劍氣風暴', '生命之泉', '地裂術', '紫色地獄火', '拾取範圍', '破甲劍氣', '衝擊劍氣', '騎士的意志', '強健體魄', '堅固防護', '死裡逃生', '強化補血球', '護盾之泉', '大地防護', '堅固防禦'],
      // 綜合流：攻擊與回血各半
      mixed: ['劍氣數量', '劍術強化', '生命之泉', '疾風步', '騎士的意志', '強健體魄', '劍氣貫穿', '拾取範圍', '死裡逃生', '劍氣風暴', '堅固防護', '強化補血球', '地裂術', '護盾之泉', '紫色地獄火', '大地防護', '衝擊劍氣', '破甲劍氣', '堅固防禦'],
    },
    mage: {
      speed: ['究極光裂術', '電弧', '流星雨', '龍捲風', '燃燒的火球', '魔杖強化', '疾風步', '冰錐', '岩牢', '施法速度', '地獄之牙', '寒冰氣息', '拾取範圍', '風刃', '火箭'],
      aoe: ['究極光裂術', '電弧', '流星雨', '拾取範圍', '龍捲風', '燃燒的火球','寒冰氣息', '地獄之牙', '冰錐', '施法速度', '魔杖強化', '風刃', '火箭'],
      sustain: ['生命之泉', '強健體魄', '護盾之泉', '大地防護', '緩速術', '岩牢'],
      mixed: ['究極光裂術', '流星雨', '拾取範圍', '生命之泉', '龍捲風', '強健體魄', '燃燒的火球', '護盾之泉', '電弧', '施法速度', '寒冰氣息'],
    },
  };
  const BUILD_NAME = { sustain: '回血流', damage: '攻擊流', aoe: '範圍流', speed: '速度輸出流', mixed: '綜合流', rarity: '稀有度' };
  const STYLE_NAME = { melee: '貼身', kite: '繞圈躲怪', loop: '定點繞圈' };
  // 遊戲 game.js 的變身清單（FD 與 PFAB／pforms.js）。白色不選，所以不列；圖鑑卡變身只有對應職業會出現
  const MORPH_LIST = [
    ['gold', '金（神話）', [['神話公主', 'royal'], ['神話王族', 'royal'], ['神話妖精女', 'elf'], ['神話妖精男', 'elf'], ['神話法師女', 'mage'], ['神話法師男', 'mage'], ['神話騎士女', 'knight'], ['神話騎士男', 'knight']]],
    ['purple', '紫（傳說）', [['哈汀之魂', 'caster'], ['神聖十字軍', 'melee'], ['紫警衛(弓)隊長', 'elf'], ['憎恨的死亡騎士', 'melee']]],
    ['red', '紅（英雄）', [['甘特', 'magic'], ['格立特(弓)', 'elf'], ['真死亡騎士(紅)', 'melee']]],
    ['blue', '藍（稀有）', [['食人妖精王'], ['精英黑騎士'], ['歐吉']]],
    ['green', '綠（高級）', [['史巴托'], ['萊肯'], ['長者'], ['蜥蜴人'], ['黑騎士'], ['食人妖精'], ['高侖石頭怪'], ['卡司特']]],
  ];
  const MORPH_CG = { melee: ['knight', 'darkelf', 'dk'], magic: ['mage', 'elf', 'royal', 'ill'], caster: ['mage', 'ill'] };
  const morphOk = (g, c) => !g || g === c || (MORPH_CG[g] || []).includes(c);
  const morphPicks = () => (Array.isArray(cfg.morphPick) ? cfg.morphPick : []).concat(cfg.morphLock ? [cfg.morphLock] : []);
  const morphNm = (n) => String(n).replace(/^變身[：:]\s*/, '').trim();
  const morphSeen = () => { try { const a = JSON.parse(localStorage.getItem('g155helper.morphSeen') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const cls = () => (cfg.cls !== 'auto' ? cfg.cls : (String(window.__ck || '') || 'knight')); // 遊戲的 __ck 變數寫著職業
  const CLS_NM = { knight: '騎士', mage: '法師', elf: '妖精', royal: '王族', ill: '幻術師', darkelf: '黑暗妖精', dk: '龍騎士' };
  const clsNm = (c) => CLS_NM[c] || c || '騎士';
  const OTHER_BN = [['mixed', '自訂（卡片編輯器）']]; // 還沒有內建流派的職業：卡片編輯器自己排，沒排就只看稀有度
  const taken = (n) => (run && run.cards ? run.cards.filter((c) => c === n).length : 0);
  const MID_DEF = ['強健體魄', '護盾之泉', '死裡逃生']; // 中段補強用
  let lastMini = null; // 最近一次的怪物感測結果（選卡時判斷首領是否在場）
  const MAGNET_CAP = 3;                                 // 拾取範圍最多拿幾張（第 9 場拿了 5 張，佔掉太多升級）
  // 各職業可能出現的卡（取自 game.js 第 3440～3475、489～496 行、levelup.js，以及實際遊戲中看過的卡）
  const CARD_CATALOG = {
    knight: { '職業技能': ['劍氣', '劍氣數量', '劍氣貫穿', '劍氣風暴', '破甲劍氣', '衝擊劍氣', '地裂術', '紫色地獄火', '生存危機', '死裡逃生', '尖刺盔甲', '堅固防護', '堅固防禦', '騎士的意志', '魔王殺手'], '武器強化': ['劍術強化', '重擊強化'] },
    mage: { '職業技能': ['光箭', '火箭', '冰箭', '冰錐', '風刃', '流星雨', '究極光裂術', '燃燒的火球', '電弧', '緩速術', '寒冰氣息', '岩牢', '地獄之牙', '龍捲風', '火風暴'], '武器強化': ['魔杖強化', '大法杖強化'] },
    common: { '基本強化': ['強健體魄', '生命之泉', '護盾之泉', '大地防護', '強化補血球', '疾風步', '施法速度', '攻擊速度', '拾取範圍', '遠射'] },
  };
  // 卡片解說。騎士的數值取自 game.js 第 3428～3483 行（CKV、CK_UP、BLOOD）；通用強化取自第 489～496 行與 levelup.js。
  // 法師魔法的細節原始碼分散，先寫概要；遊戲中實際看過的卡會改用遊戲自己的說明（見 cardDesc）。
  const CARD_DESC = {
    '劍氣': '騎士普攻：扇形射出劍氣，射程約 12 格，每發傷害 60%',
    '劍氣數量': '劍氣一次多射 1 發（每級 +1，最多 5 發）；扇形散開，貼身的大隻怪會吃到好幾發',
    '劍氣貫穿': '每發劍氣多打穿怪（Lv1 打穿 2 隻，每級 +1，最多 6 隻）',
    '劍氣風暴': '每 10／9／8 秒自動朝 8 個方向各射一發劍氣（最多 3 級，貫穿和普攻一樣）',
    '破甲劍氣': '被劍氣打中的怪 3 秒內受到的所有傷害 +10%～30%（每級 +5%）',
    '衝擊劍氣': '劍氣命中時 5%～25% 機率讓怪暈眩 1 秒（菁英減半、首領免疫）',
    '地裂術': '每 6 秒自動往怪最多的地方砸地裂，半徑 3 格，傷害 ×1.5～2.5，普通怪定住 1.5 秒',
    '紫色地獄火': '周圍有怪時定時以自己為中心燃起地獄火；等級越高範圍越大、冷卻越短、傷害越高',
    '生存危機': '升級時若生命低於 50%，必定多出一張「死裡逃生」（還沒學過才會出現）',
    '死裡逃生': '生命低於 30% 時自動發動，瞬間回到 90% 生命，冷卻 90 秒',
    '尖刺盔甲': '被近戰攻擊時，把受到傷害的 50%～150% 反彈給攻擊者',
    '堅固防護': '5%～15% 機率完全擋下一次遠程或魔法攻擊',
    '堅固防禦': '受到的傷害降低（Lv1 約 3%，所有減傷加總上限 60%）',
    '騎士的意志': '每擊殺 1 隻怪回復 0.5%～2% 最大生命',
    '魔王殺手': '首領在附近時發動 4 秒、冷卻 6 秒：對首領傷害 +100%，首領對你的傷害 −45%',
    '嗜血': '造成傷害時，吸取 1%～5% 化為自己的生命',
    '劍術強化': '裝備劍時：普攻與技能傷害每級 +20%（最多 5 級）',
    '重擊強化': '裝備雙手劍時：普攻與技能傷害每級 +25%（最多 5 級）',
    '光箭': '基本單體魔法，自動施放（約每 1.9 秒）',
    '火箭': '基本單體火系魔法，自動施放',
    '冰箭': '基本單體冰系魔法，自動施放',
    '風刃': '基本風系魔法，自動施放',
    '冰錐': '冰系魔法，傷害有額外加成',
    '流星雨': '大範圍魔法，落在怪群上，基礎傷害高',
    '究極光裂術': '最強的單發魔法，基礎傷害約流星雨的 2 倍',
    '燃燒的火球': '火球命中後爆炸，造成範圍傷害',
    '電弧': '連鎖閃電，一次打到多隻怪',
    '緩速術': '讓怪物移動變慢',
    '寒冰氣息': '冰凍周圍的怪物',
    '岩牢': '把怪物困住一段時間',
    '地獄之牙': '地面突刺造成傷害',
    '龍捲風': '移動的龍捲風，持續造成範圍傷害',
    '火風暴': '火焰風暴，範圍傷害',
    '魔杖強化': '裝備法杖時：魔法技能傷害每級 +20%（最多 5 級）',
    '大法杖強化': '裝備雙手法杖時：魔法傷害每級 +15%，範圍魔法範圍擴大',
    '強健體魄': '最大生命 +30，並回復 30',
    '生命之泉': '每秒回復最大生命的 0.5%（每級 +0.5%）',
    '護盾之泉': '每秒恢復護盾 +0.5（每級 +0.5，最多 5 級）',
    '大地防護': '防禦 AC −5（每級 −5）',
    '強化補血球': '吃一顆補血球回復 20／30／50 點生命（最多 3 級）',
    '疾風步': '移動速度 +10%、攻擊速度 +15%',
    '施法速度': '所有魔法的施放間隔縮短約 13%～15%',
    '攻擊速度': '攻擊速度提升（原本是弓手的射箭速度 +18%）',
    '拾取範圍': '經驗寶石吸取範圍每級 +45%（最多 5 級）',
    '遠射': '射程 +18%（弓系）',
  };
  const cardDesc = (c, n) => { const v = (seenCards()[c] || {})[n]; return typeof v === 'string' && v ? v : (CARD_DESC[n] || ''); };
  const SEEN_KEY = 'g155helper.cardsSeen';
  const seenCards = () => { const o = safeParse(localStorage.getItem(SEEN_KEY)); return o && typeof o === 'object' ? o : {}; };
  const customOf = (c, b) => ((cfg.customBuilds || {})[c] || {})[b];          // 自訂的優先順序（陣列），沒有就用預設
  const bannedOf = (c, b) => ((cfg.banCards || {})[c] || {})[b] || [];         // 這個流派不選的卡
  const buildList = () => {
    const custom = customOf(cls(), cfg.build);
    if (Array.isArray(custom)) return custom.slice(); // 使用者自己排的順序，完全照用
    const b = BUILDS[cls()] || {}; let list = (b[cfg.build] || []).slice();
    if (cls() === 'mage' && cfg.build !== 'sustain' && cfg.build !== 'speed') { // 只有法師的範圍流／混合流在中段補保命卡（騎士的清單本身已含回血）
      // 2:30 起（遠程怪約 3:00 出現）先補 3 張保命卡，補滿後回到原本的流派
      const defN = MID_DEF.reduce((a, n) => a + taken(n), 0);
      if (runSecs() >= 150 && defN < 3) list = MID_DEF.concat(list);
      if (lateByTime()) list = LATE_CARDS.concat(list); // 壓力長期偏高：保命卡優先
    }
    return list;
  };
  const LATE_CARDS = ['死裡逃生', '生命之泉', '強健體魄', '護盾之泉', '大地防護', '堅固防護']; // 後期優先拿的保命卡
  const CARDS_SEEN = {};
  let morphRank = 0; // 這一場目前的變身稀有度
  // 一般卡照遊戲原始碼的 TIER_ORDER：白 < 綠 < 藍 < 紫 < 紅 < 金 < 青
  const TIER_RANK = { white: 0, green: 1, blue: 2, purple: 3, red: 4, gold: 5, cyan: 6 };
  // 變身卡依使用者指定：紫 > 紅 > 金（攻擊素質有差）
  const MORPH_RANK = { white: 0, green: 1, blue: 2, red: 3, purple: 4, gold: 5, cyan: 6 }; // 照遊戲數值：紅＜紫＜金（金色神話最強）

  function farmTick() {
    if (!state.farmOn) { if (held.length) release(); return; }
    if (visible($('#lvl'))) { if (held.length) release(); if (!BB.length || BB[BB.length - 1][1] !== '（升級選單）') BB.push([($('#timeT') || {}).textContent || '', '（升級選單）', 0, 0, 0, 0, 0, '', 0, 0]); pickCard(); return; }
    if (!inBattle()) return; // 在村莊時按鍵由「自動進場」流程控制，這裡不能放開
    if (typing()) {
      if (held.length) release();
      if (Date.now() - lastUserKey > 6000) { try { document.activeElement.blur(); } catch (e) {} log('輸入框佔住焦點 6 秒沒有打字，已移開焦點繼續走位'); }
      else { const st = $('#g155-st'); if (st) st.textContent = '（正在輸入文字，走位暫停）'; }
      return;
    }
    const now = Date.now();
    if (cfg.farmMode === 'smart') { smartTick(now); return; }
    if (now - lastStep < cfg.farmStepMs) return;
    lastStep = now;
    const coord = (($('#coord') || {}).textContent || '').split('\n')[0];
    if (coord && coord === lastCoord) spin = -spin; // 卡住就反向
    lastCoord = coord;
    dirIdx = (dirIdx + spin + DIRS.length) % DIRS.length;
    hold(DIRS[dirIdx]);
  }

  // ───────────── 智能走位 ─────────────
  // 資料來源：
  //   1. 小地圖（#mmw canvas）：紅點 = 怪物，藍點 = 自己。
  //   2. 主畫面縮圖：亮藍色小點 = 地上的經驗寶石（假設角色在畫面中央）。
  // 決策順序：怪貼太近或血少 → 逃離（帶一點側移避免被逼到牆角）
  //           附近安全且看得到經驗 → 去撿
  //           有怪但不近 → 靠過去保持在攻擊距離、繞著打
  //           什麼都沒有 → 繞圈巡邏
  const NEAR = 13, MID = 45;      // 小地圖上的像素距離
  let lastSmart = 0, stuckUntil = 0, stuckDir = 0, lastCoordAt = 0, gemCv = null;
  // 地圖分析（依 game.js 第 146～182 行）：
  //   每張地圖有 512×512 格的可行走遮罩（base64，每格 1 bit）。說話之島在全域變數 MAPWALK，其他在 window.MAPS[編號].walk。
  //   格子 → 世界座標：x = (gx+gy)×24 + ox + 24，y = (gy−gx)×12 + oy + 12。
  const MAP_ID = { '說話之島': 0, '冒險洞窟 1F': 1, '冒險洞窟 2F': 2, '古魯丁遠古戰場': 4, '古魯丁地監 1F': 807, '古魯丁地監 2F': 808, '古魯丁地監 3F': 809, '古魯丁地監 4F': 810, '古魯丁地監 5F': 811, '古魯丁地監 6F': 812, '古魯丁地監 7F': 813, '沙漠綠洲': 4001, '螞蟻洞窟 1F': 47, '螞蟻洞窟 2F': 48, '螞蟻洞窟 3F': 51, '騎士洞窟 1F': 25, '騎士洞窟 2F': 26, '騎士洞窟 3F': 27, '騎士洞窟 4F': 28, '奇岩村外': 4100, '奇岩地監 1F': 53, '奇岩地監 2F': 54, '奇岩地監 3F': 55, '奇岩地監 4F': 56, '龍之谷外圍': 4201, '龍之谷中間區域': 4202, '龍之谷深處': 4203, '龍之谷地監 1F': 30, '龍之谷地監 2F': 31, '龍之谷地監 3F': 32, '龍之谷地監 4F': 33, '龍之谷地監 5F': 35, '龍之谷地監 6F': 36, '龍之谷地監 7F': 37, '海音外圍': 4401, '海音地監 1F': 59, '海音地監 2F': 60, '海音地監 3F': 61, '海音地監 4F': 63, '法利昂棲息地': 65 };
  const MC = 512, BLK = 4, NB = MC / BLK; // 每 4×4 格合成一塊來算，夠準也夠快
  const mapCache = {};
  const mapName = () => ((($('#coord') || {}).textContent || '').split('\n')[0].replace(/\s*\d+,\d+\s*$/, '').trim());
  function loadMap(name) {
    if (mapCache[name] !== undefined) return mapCache[name];
    let res = null;
    try {
      const id = MAP_ID[name];
      if (id !== undefined) {
        const M = (window.MAPS || {})[id] || {};
        let walk = M.walk; if (!walk && id === 0) { try { walk = (0, eval)('MAPWALK'); } catch (e) {} }
        const info = M.info || {};
        if (typeof walk === 'string' && walk.length > 1000) {
          const b = atob(walk), box = (id === 1 || id === 2 || (id >= 53 && id <= 56)); // 這幾張圖：外框以內全部可走
          const W = new Uint8Array(MC * MC); let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
          for (let i = 0; i < W.length; i++) { W[i] = (b.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1; if (W[i]) { const gx = (i / MC) | 0, gy = i % MC; if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy; } }
          if (box) for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) W[gx * MC + gy] = 1;
          // 每一塊到「最近的不可走區」的距離（以塊為單位），用廣度優先一次算完
          const open = new Int16Array(NB * NB).fill(-1), q = [];
          for (let bx = 0; bx < NB; bx++) for (let by = 0; by < NB; by++) {
            let ok = 1; for (let i = 0; i < BLK && ok; i++) for (let j = 0; j < BLK; j++) if (!W[(bx * BLK + i) * MC + by * BLK + j]) { ok = 0; break; }
            if (!ok) { open[bx * NB + by] = 0; q.push(bx * NB + by); }
          }
          for (let h = 0; h < q.length; h++) {
            const c = q[h], bx = (c / NB) | 0, by = c % NB, d = open[c] + 1;
            if (bx > 0 && open[c - NB] < 0) { open[c - NB] = d; q.push(c - NB); }
            if (bx < NB - 1 && open[c + NB] < 0) { open[c + NB] = d; q.push(c + NB); }
            if (by > 0 && open[c - 1] < 0) { open[c - 1] = d; q.push(c - 1); }
            if (by < NB - 1 && open[c + 1] < 0) { open[c + 1] = d; q.push(c + 1); }
          }
          let sx = 0, sy = 0, n = 0;
          for (let bx = 0; bx < NB; bx++) for (let by = 0; by < NB; by++) if (open[bx * NB + by] > 0) { sx += bx; sy += by; n++; }
          res = { id, ox: info.ox || 0, oy: info.oy || MC * 12, open, cbx: n ? sx / n : NB / 2, cby: n ? sy / n : NB / 2, n };
        }
      }
    } catch (e) { res = null; }
    mapCache[name] = res; if (res) log('地圖分析完成：' + name + '（可走區 ' + res.n + ' 塊）'); else log('沒有「' + name + '」的地圖資料，圓心改用開場位置');
    return res;
  }
  const blkToWorld = (mp, bx, by) => { const gx = bx * BLK + BLK / 2, gy = by * BLK + BLK / 2; return [(gx + gy) * 24 + mp.ox + 24, (gy - gx) * 12 + mp.oy + 12]; };
  const worldToBlk = (mp, x, y) => { const u = (x - mp.ox - 24) / 24, v = (y - mp.oy - 12) / 12; return [Math.floor(Math.round((u - v) / 2) / BLK), Math.floor(Math.round((u + v) / 2) / BLK)]; };
  // 開闊度（離邊緣幾個像素；一塊對角約 100px 寬）
  const openAt = (mp, x, y) => { const b = worldToBlk(mp, x, y); return b[0] < 0 || b[1] < 0 || b[0] >= NB || b[1] >= NB ? 0 : Math.max(0, mp.open[b[0] * NB + b[1]]) * 96; };
  // 找圓心：越開闊越好、越靠近整張圖的中央越好、離我太遠的扣分（走過去的路上不安全）
  function pickHome(mp, me) {
    const mb = worldToBlk(mp, me[0], me[1]); let best = null, bs = -1e9;
    for (let bx = Math.max(0, mb[0] - 22); bx <= Math.min(NB - 1, mb[0] + 22); bx++) for (let by = Math.max(0, mb[1] - 22); by <= Math.min(NB - 1, mb[1] + 22); by++) {
      const o = mp.open[bx * NB + by]; if (o < 3) continue;
      const w = blkToWorld(mp, bx, by), dMe = Math.hypot(w[0] - me[0], w[1] - me[1]); if (dMe > 2200) continue;
      const dC = Math.hypot(bx - mp.cbx, by - mp.cby);
      const sc = Math.min(o, 9) * 110 - dC * 14 - dMe * 0.25;
      if (sc > bs) { bs = sc; best = { w, open: o * 96, dMe }; }
    }
    return best;
  }

  // 繞過去撿：找出地上最值得撿的一堆（寶箱／裝備 > 一般物品 > 金幣），把圓圈暫時挪到「圓周剛好經過那一堆」的位置。
  // 角色照常繞圈、照常閃避，怪跟在後面被帶開，繞到那一段時順手撿起來；繞完一圈回原本的圓心。
  let detourW = null, detourUntil = 0, nextDetourAt = 0, detourWhat = '';
  function planDetour(sf, R, hpRatio) {
    if (!homeW || (!GITEMS.size && !GEMS.size)) return null;
    const items = [];
    if (cfg.farmGems && sf && sf.meW) for (const g of gemScan(sf.meW)) { const dh = Math.hypot(g.x - homeW[0], g.y - homeW[1]); if (dh < R + magR || dh > 1700) continue; items.push({ x: g.x, y: g.y, w: 0.25 * g.w * gemK(), dh, name: '經驗' }); } // 圈子掃不到的經驗
    GITEMS.forEach((it) => {
      if (it.dead || it.hold > 0 || !(it.n > 0)) return;
      const rule = pickRule(it); if (rule === 'skip') return;
      const val0 = it.heal ? (hpRatio < 0.8 ? 3 : 0.3) : (it.id === 40308 ? 1 : ((it.ench !== undefined || it.keep || /寶箱/.test(it.name || '')) ? 10 : 4));
      const val = rule === 'must' ? Math.max(30, val0 * 3) : (rule === 'pri' ? Math.max(12, val0 * 1.5) : (it.ench !== undefined || it.keep || it.heal ? val0 : val0 * itemK()));
      const dh = Math.hypot(it.x - homeW[0], it.y - homeW[1]); if (dh > 1700) return;
      items.push({ x: it.x, y: it.y, w: val + (!it.keep && it.t > 180 ? 3 : 0), dh, name: it.name });
    });
    if (!items.length) return null;
    items.sort((a, b) => b.w - a.w);
    const mp = mapCache[homeMap] || null; let best = null, bs = 0;
    for (let i = 0; i < Math.min(items.length, 50); i++) {
      const a = items[i]; let sc = 0, n = 0;
      for (const b of items) { if (Math.abs(b.x - a.x) < 230 && Math.abs(b.y - a.y) < 230) { sc += b.w; n++; } }
      sc -= a.dh / 350;
      if (sc > bs) {
        // 新圓心：從那一堆往原圓心方向退 R，這樣圓周會經過它，而且圓圈偏向地圖內側
        let ux = homeW[0] - a.x, uy = homeW[1] - a.y; const d = Math.hypot(ux, uy);
        if (d < 1) { ux = 1; uy = 0; } else { ux /= d; uy /= d; }
        const c = [a.x + ux * R, a.y + uy * R];
        if (mp && openAt(mp, c[0], c[1]) < Math.min(R, 200)) continue; // 會把圈畫到邊緣外的不去
        bs = sc; best = { c, n, name: a.name, sc };
      }
    }
    return best && best.sc >= 4 ? best : null; // 至少要值得繞一趟（一件物品，或四堆以上金幣）
  }

  // 逃生方向：16 個方向裡，鄰近方向一起算（平滑），挑最空的；地圖邊緣（離可走範圍邊界 < 150px）大幅扣分
  function escapeDir(m, sf) {
    const d = m.dens; if (!d) return null;
    const mp = homeMap ? mapCache[homeMap] : null;
    let best = -1, bs = 1e9;
    for (let k = 0; k < 16; k++) {
      let sc = d[k] * 2 + d[(k + 1) % 16] + d[(k + 15) % 16] + 0.5 * (d[(k + 2) % 16] + d[(k + 14) % 16]);
      const a = k * Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a);
      if (mp && sf && sf.meW) { const o = openAt(mp, sf.meW[0] + ux * 160, sf.meW[1] + uy * 160); if (o < 150) sc += 2 + (150 - o) / 50; }
      if (homeW && sf && sf.meW) { const hx = homeW[0] - sf.meW[0], hy = homeW[1] - sf.meW[1], hd = Math.hypot(hx, hy) || 1; if (hd > (cfg.loopR || 260) * 1.6) sc -= 0.15 * (ux * hx + uy * hy) / hd; } // 離圓心太遠時略偏向圓心
      if (sc < bs) { bs = sc; best = k; }
    }
    const a = best * Math.PI / 8; return [Math.cos(a), Math.sin(a)];
  }

  const BB = []; let bbAt = 0;
  let homeW = null, homeMap = '', homeOpen = 0, homeFixed = false; // 定點繞圈的圓心（世界座標）、所在地圖、圓心離邊緣多遠
  let packAt = 0, lastFlip = 0;
  // 王戰（依 game.js 3199～3203）：首領移動速度＝玩家 0.9 倍，只有走到玩家 68px 內才會出手（近戰或放極道落雷／紫色地獄火）。
  // 所以王戰的原則是「永遠不讓王靠近 170px」，在約 270px 的距離繞著王打（騎士劍氣、法師法術射程都約 380px）。
  // 魔法一律打「射程內最近的怪」（game.js magicTargets），要讓究極光裂術打在王身上，就要讓王是最近的那隻：繞得近一點、避開小怪
  const BOSS_NEAR_W = 150, BOSS_RING_W = 220;
  // 紅霧：預警 tele 秒後落下，玩家站在橢圓 (x/r)²+(y/(r/2))² ≤ 1 內就中（極道落雷每道 12%～最大血量，可疊加）。
  // 一半的落雷會預判「玩家現在速度 × 1 秒」的位置，所以要在預警出現後換方向、走到所有紅霧外面。
  function safeDir(v, m, flip) {
    if (!v || !m || !m.dens) return null;
    const vn = Math.hypot(v[0], v[1]) || 1, idx = (x, y) => ((Math.round(Math.atan2(y, x) / (Math.PI / 8)) % 16) + 16) % 16;
    const D = (k) => m.dens[(k + 16) % 16] + 0.5 * (m.dens[(k + 17) % 16] + m.dens[(k + 15) % 16]); // 那個方向加左右兩格
    const k0 = idx(v[0] / vn, v[1] / vn);
    if (D(k0) < 0.12) return null; // 原本方向夠空，不用改
    const cand = []; for (let d = -3; d <= 3; d++) cand.push([k0 + d, Math.abs(d) * 0.06]);
    if (flip) for (let d = -2; d <= 2; d++) cand.push([k0 + 8 + d, 0.08 + Math.abs(d) * 0.06]); // 彈道另一側也可以閃
    let best = null, bs = 1e9;
    for (const [k, pen] of cand) { const sc = D(k) + pen; if (sc < bs) { bs = sc; best = k; } }
    if (best === null || ((best - k0) % 16 + 16) % 16 === 0) return null;
    const a = best * Math.PI / 8; return [Math.cos(a), Math.sin(a)];
  }
  function zoneDodge(sf, m, cur) {
    if (!sf || !sf.meW || !ZONES.size) return null;
    const me = sf.meW, act = [];
    ZONES.forEach((z) => {
      const end = (z.tele || 0) + (z.dur || 0.5);
      if (!(z.t < end) || Math.abs(z.x - me[0]) > 900 || Math.abs(z.y - me[1]) > 700) { ZONES.delete(z); return; }
      const persist = z.k === 'fire' || z.k === 'gas';
      if (!persist && (z.fired || z.t >= z.tele)) return; // 瞬間落下的已經落完了
      act.push({ x: z.x, y: z.y, r: z.r || 50, left: Math.max(0, (z.tele || 0) - z.t), w: z.k === 'bolt' ? 1 + (z.bp || 0.12) * 10 : 1 });
    });
    if (!act.length) return null;
    const dangerAt = (x, y, mg) => { let t = 0; for (const z of act) { const q = Math.hypot((x - z.x) / (z.r * mg), (y - z.y) / (z.r * 0.5 * mg)); if (q <= 1) t += z.w * (1.2 - q * 0.2); } return t; };
    let here = dangerAt(me[0], me[1], 1.3);
    if (here <= 0 && cur) { const n = Math.hypot(cur[0], cur[1]) || 1; here = dangerAt(me[0] + cur[0] / n * 70, me[1] + cur[1] / n * 56, 1.2); } // 照原本方向走下去會踩進去
    if (here <= 0) return null;
    let tl = 9; for (const z of act) { if (Math.hypot((me[0] - z.x) / (z.r * 1.6), (me[1] - z.y) / (z.r * 0.8)) <= 1) tl = Math.min(tl, z.left); }
    const spd = (memP() && memP().speed) || 150, reach = Math.max(45, Math.min(spd * 1.3, spd * Math.max(0.3, tl)));
    const mp = homeMap ? mapCache[homeMap] : null;
    let best = null, bs = 1e9;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a);
      for (const f of [0.45, 0.75, 1]) {
        const st = reach * f, px = me[0] + ux * st, py = me[1] + uy * st * 0.8;
        let sc = dangerAt(px, py, 1.25) * 100 + st * 0.05 + dangerAt(me[0] + ux * st * 0.5, me[1] + uy * st * 0.4, 1) * 15; // 終點在紅霧外，路上也少穿過
        if (m && m.dens) sc += m.dens[k] * 30; // 那個方向的怪
        if (m && m.boss) { const bd = Math.hypot(px - (me[0] + m.boss.dx * W2MM), py - (me[1] + m.boss.dy * W2MM)); if (bd < BOSS_NEAR_W) sc += (BOSS_NEAR_W - bd) * 0.5; } // 別躲到王身邊
        if (mp && openAt(mp, px, py) < 60) sc += 80; // 別躲到地圖外
        if (sc < bs) { bs = sc; best = [ux, uy]; }
      }
    }
    return best ? { v: best, why: '躲紅霧(' + act.length + ')' } : null;
  }
  let lastCd = {}, lastHpV = null; // 技能冷卻（偵測剛放技能）、上一次的生命
  let lastPool = null, hurtUntil = 0, hits = 0, lastDodgeAt = 0, lastSweep = 0, sweepUntil = 0;
  // 後期保命：依 game.js，說話之島等關卡長 360 秒，王在 6:00 登場且之後不再生怪。
  // 所以最後一段時間擊殺數不重要，改成拉開距離、少冒險，撐到王出來。
  const runSecs = () => { // 王戰時時間欄會顯示「首領」而不是數字，視為已到後期
    const t = (($('#timeT') || {}).textContent || '').trim(); if (t && !/^\d+:\d+$/.test(t) && t !== '村莊') return 9999;
    const p = t.split(':').map(Number); return p.length === 2 && p[0] >= 0 ? p[0] * 60 + p[1] : 0;
  };
  // 進入保命模式的條件（任一成立）：
  //   1. 時間到（保命起始秒）
  //   2. 實際承受的傷害：最近 8 秒的受傷速度，照這樣下去「生命＋護盾」撐不到設定的秒數
  //   3. 預估的傷害：身邊攻擊得到我的怪，牠們的傷害÷攻擊間隔加總，若全中撐不到設定秒數的三分之一
  let surviveUntil = 0, dmgRate = 0, ttd = 999, potDps = 0; const dmgLog = [];
  // 壓力值 D（0～1）：不用固定秒數，改由場上狀況連續計算，越高就離怪越遠、越保守。
  //   場面壓力 = 0.6 ×（周圍怪物的傷害加總，全中的話幾秒打死我）＋ 0.4 ×（怪物數量 ÷ 60）
  //   實際壓力 = 最近 8 秒真的掉血的速度，照這樣幾秒會死
  //   D 取兩者較大的，上升快、下降慢，避免忽高忽低
  let D = 0, dAvg = 0, hitFrac = 0.06; // hitFrac：場面傷害實際打中的比例，起始值 6%，之後自動校正
  const lateByTime = () => dAvg > 0.5;   // 壓力持續偏高：選卡開始優先拿保命卡
  const lateNow = () => D > 0.7;         // 壓力很高：只記錄用
  function updatePressure(pool, m) {
    const k = cfg.caution > 0 ? cfg.caution : 1;
    const potAll = (m && m.potAll) || 0, cnt = (m && m.total) || 0;
    // 第 12 場開場 0:26、零受擊時壓力就到 79%：「假設全中」太悲觀。
    // 改成自我校正：持續統計「實際掉血 ÷ 假設全中」的比例（命中率），用它把場面傷害換算成預期掉血。
    // 場面 =（怪物數量 ÷ 60）×（怪物平均一下打掉我多少比例，5% 算滿），最多佔 0.6
    // 實際 = 照最近 8 秒的掉血速度，12 秒內會死算滿
    // 第 12 場的教訓：壓力只用來調整距離，不能讓角色停止撿經驗或一直逃
    const hitPct = m && m.avgDmg > 0 && pool > 0 ? m.avgDmg / pool : 0;
    const scene = Math.min(0.6, Math.min(1, cnt / 60) * Math.min(1, hitPct / 0.05) * 0.6);
    const p2 = dmgRate > 0 ? Math.min(1, 12 / Math.max(1, ttd)) : 0;
    const raw = Math.min(1, Math.max(p2, scene) * k);
    hitFrac = hitPct;
    D += (raw - D) * (raw > D ? 0.12 : 0.05);
    dAvg += (D - dAvg) * 0.01;
  }
  function trackDamage(now, pool, lost, pot) {
    if (lost > 0) dmgLog.push(now, lost);
    while (dmgLog.length && now - dmgLog[0] > 8000) dmgLog.splice(0, 2);
    let sum = 0; for (let i = 1; i < dmgLog.length; i += 2) sum += dmgLog[i];
    dmgRate = sum / 8; potDps = pot || 0;
    ttd = dmgRate > 0 ? pool / dmgRate : 999;

  }
  const HUNT_IN = 40; // 繞遠程怪的基本半徑（小地圖像素，約 195px）。第 11 場用 100px 太近：箭 0.25 秒就到，來不及閃 // 獵殺遠程怪時靠到多近（小地圖像素，約 100px）
  const RANGED_KEEP = 70; // 遠程怪射程 260～340px（game.js RANGED 表）≈ 小地圖 70px；法師射程 380px，站在這之外可以打到牠而不被射
  const BOSS_KEEP = 40; // 和王保持的距離（小地圖像素）
  const KITE_IN = 16, KITE_OUT = 30; // 繞圈躲怪時和最近的怪保持的距離範圍（小地圖像素）

  // 把一組「相對於自己的怪物位置」整理成決策用的統計
  function summarize(pts) { // pts = [dx,dy,dx,dy,...]，單位：小地圖像素
    let nearN = 0, ax = 0, ay = 0, midN = 0, mx = 0, my = 0, best = 1e9, nx = 0, ny = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i], dy = pts[i + 1]; const dist = Math.hypot(dx, dy) || 0.5;
      if (dist < best) { best = dist; nx = dx; ny = dy; }
      if (dist <= NEAR) { nearN++; ax -= dx / (dist * dist); ay -= dy / (dist * dist); }
      else if (dist <= MID) { midN++; mx += dx; my += dy; }
    }
    return { total: pts.length / 2, nearN, ax, ay, midN, mx, my, nearest: best, nx, ny, pts };
  }

  // 記憶體版：直接讀怪物物件。除了位置，還知道誰正在出手、誰是遠程、誰是王。
  function memMobs() {
    const s = senseFresh();
    if (!s || !s.meW || !MONS.size) return null;
    const list = []; // 清掉已死、或離太遠（多半已被遊戲回收）的
    MONS.forEach((mo) => {
      // 遠處的怪只是先略過、不從清單刪掉：首領是在很遠的地方生成再走過來的，以前一出生就被刪掉，整場王戰都看不到王
      const far = Math.abs(mo.x - s.meW[0]) > 1400 || Math.abs(mo.y - s.meW[1]) > 1000;
      if (mo.dead || !(mo.hp > 0) || (!mo.boss && (Math.abs(mo.x - s.meW[0]) > 5000 || Math.abs(mo.y - s.meW[1]) > 4000))) MONS.delete(mo); else if (!far) list.push(mo);
    });
    const pts = [], dens = new Array(16).fill(0); let atk = 0, avx = 0, avy = 0, rAtk = 0, rvx = 0, rvy = 0, boss = null, ranged = 0, special = null, potDps = 0, potAll = 0, dmgSum = 0, dmgCnt = 0, near2 = 0, rN = 0, rax = 0, ray = 0, rBest = 1e9, rdx = 0, rdy = 0, rName = '';
    const attackers = [];
    for (let i = 0; i < list.length; i++) {
      const mo = list[i]; if (!mo || mo.dead || !(mo.hp > 0)) continue;
      const dx = (mo.x - s.meW[0]) / W2MM, dy = (mo.y - s.meW[1]) / W2MM, d = Math.hypot(dx, dy) || 0.5;
      pts.push(dx, dy);
      if (d < 42) { // 約 200px 內：記下 16 個方向各有多擠（越近權重越高）
        const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 8)) % 16) + 16) % 16;
        dens[k] += 1 / Math.max(4, d);
        if (d < 25) near2++; // 約 120px 內：快要被圍的訊號（近戰怪攻擊距離約 40～55px，再留一點反應時間）
      }
      const name = (mo.def && mo.def.name) || '?';
      MEMSTAT.roles[mo.role] = (MEMSTAT.roles[mo.role] || 0) + 1;
      MEMSTAT.states[mo.state] = (MEMSTAT.states[mo.state] || 0) + 1;
      const isRanged = mo.role === 'ranged' || !!mo.rg || !!mo.far || /法師|長者|巫師|術士|祭司|魔導/.test(name), isCharge = mo.role === 'charge'; // 遠程與技能型怪物
      if (mo.jmp && !special) { // 撲擊：落點固定，落地時 70px 內受傷
        const jx = s.meW[0] - mo.jmp.tx, jy = s.meW[1] - mo.jmp.ty, jd = Math.hypot(jx, jy);
        if (jd < 110) special = { v: jd > 4 ? [jx, jy] : [Math.cos(spin), Math.sin(spin)], why: '躲撲擊:' + name };
      }
      if (mo.chs && mo.chx !== undefined && !special) { // 衝撞：預備時方向就固定了，橫向離開
        const rx = s.meW[0] - mo.x, ry = s.meW[1] - mo.y, along = rx * mo.chx + ry * mo.chy, cross = rx * mo.chy - ry * mo.chx;
        if (along > -20 && along < 520 && Math.abs(cross) < 70) { const sd = cross > 0 ? 1 : (cross < 0 ? -1 : spin); special = { v: [mo.chy * sd, -mo.chx * sd], why: '躲衝撞:' + name }; }
      }
      const sk = mo.role + ':' + mo.state; MEMSTAT.kinds[sk] = (MEMSTAT.kinds[sk] || 0) + 1; // 學習：各類型怪有哪些狀態
      if (mo.dmg > 0) {
        dmgSum += mo.dmg; dmgCnt++;
        const dps = mo.dmg * 1000 / (mo.atkMs > 200 ? mo.atkMs : 1500);
        if (isRanged ? d < RANGED_KEEP : d < 15) potDps += dps;                                   // 現在就打得到我
        if (d < 95) potAll += dps * (isRanged ? (d < RANGED_KEEP ? 1 : 0.4) : Math.max(0.12, Math.min(1, 1 - (d - 15) / 70))); // 周圍的：越近權重越高
      }
      if (isRanged) {
        ranged++; MEMSTAT.ranged[name] = (MEMSTAT.ranged[name] || 0) + 1;
        if (d < RANGED_KEEP) { rN++; rax -= dx / d; ray -= dy / d; } // 在牠的射程內
        if (d < rBest) { rBest = d; rdx = dx; rdy = dy; rName = name; } // 最近的一隻遠程怪
      }
      if (mo.boss) { boss = { dx, dy, d, name, state: mo.state }; MEMSTAT.bosses[name] = (MEMSTAT.bosses[name] || 0) + 1; }
      // 正在出手、還沒打到。已知狀態有 walk / attack / damage(受傷) / idle / death；衝撞怪可能有其他狀態名，一律當作出手
      const acting = mo.state === 'attack' || (isCharge && !/^(walk|idle|damage|death)$/.test(mo.state));
      if (acting && !mo.hitDone) {
        if (isRanged || isCharge) { if (d < 75) { rAtk++; rvx += dx / d; rvy += dy / d; attackers.push(name); } } // 遠程／衝撞：距離遠也打得到
        else if (d < 15) { atk++; avx -= dx / d; avy -= dy / d; attackers.push(name); }
      }
    }
    const m = summarize(pts);
    m.src = 'mem'; m.atk = atk; m.avx = avx; m.avy = avy; m.rAtk = rAtk; m.rvx = rvx; m.rvy = rvy; m.boss = boss; m.ranged = ranged; m.attackers = attackers; m.special = special; m.rN = rN; m.rax = rax; m.ray = ray; m.potDps = potDps; m.potAll = potAll; m.avgDmg = dmgCnt ? dmgSum / dmgCnt : 0; m.rBest = rBest; m.rdx = rdx; m.rdy = rdy; m.rName = rName; m.dens = dens; m.near2 = near2;
    return m;
  }

  // 依原始碼的命中規則找出「不躲就會中」的敵方攻擊，回傳該往哪走：
  //   投射物：與（玩家位置往上 22px）的距離 < hr（預設 18）就命中
  //   地裂：沿 ux,uy 每格 40px 延伸，格子離玩家 30px 內命中
  function memThreats() {
    const s = senseFresh(); if (!s || !s.meW) return null;
    const mx = s.meW[0], my = s.meW[1], cy = my - 22;
    let best = null, bestT = 1e9;
    EPROJ.forEach((e) => {
      if (!(e.life > 0) || e.age > 8) { EPROJ.delete(e); return; }
      if (e.wait > 0) return; // 還沒發射，發射時才瞄準
      // 箭瞄準的是發射當下我的位置，不會預判。所以用「相對速度」（箭的速度 − 我的速度）來算：
      // 我持續移動時，多數的箭本來就會落空，不需要為它改變方向。
      // （第 11、13 場試過用「箭速 − 我的速度」預測落空就不閃，結果該閃的沒閃，閃避次數掉到三分之一。已還原成不預測。）
      const rvx = e.vx, rvy = e.vy;
      const sp = Math.hypot(rvx, rvy); if (sp < 1) return;
      const rx = mx - e.x, ry = cy - e.y, dist = Math.hypot(rx, ry) || 1;
      const along = (rvx * rx + rvy * ry) / sp; if (along < -10) return; // 已經飛過去了
      const cross = (rx * rvy - ry * rvx) / sp, miss = Math.abs(cross), tti = along / sp;
      MEMSTAT.kinds['投射物:' + e.nm] = (MEMSTAT.kinds['投射物:' + e.nm] || 0) + 1;
      if (miss < (e.hr || 18) + 30 && tti < 1.3 && tti < bestT) { // 路徑靠近我就閃，寬鬆判定
        const sd = cross > 0 ? 1 : (cross < 0 ? -1 : spin); // 往遠離彈道的那一側
        let dv = [e.vy * sd / sp, -e.vx * sd / sp], tw = '';
        const sh = e.m; // 發射者（game.js eprojs 帶著 m）
        if (sh && !sh.boss && !sh.dead && sh.hp > 0) { const tx = sh.x - mx, ty = sh.y - my, td = Math.hypot(tx, ty) || 1; if (td > 120 && td < 750) { dv = [dv[0] + tx / td * 0.9, dv[1] + ty / td * 0.9]; tw = '並靠近'; } } // 遠程怪離太遠打不到，邊閃邊靠過去
        bestT = tti; best = { v: dv, why: '閃' + (e.bs ? '王彈' : '投射物') + tw, nm: e.nm };
      }
    });
    FISS.forEach((f) => {
      if (f.t >= 2.4 || f.hit) { FISS.delete(f); return; }
      if (f.wait > 0) return;
      const L = f.line, SP = L ? L.sp : 40, LN = L ? L.L : 26, IV = L ? L.iv : 0.07;
      const rx = mx - f.x, ry = my - f.y, along = rx * f.ux + ry * f.uy, cross = rx * f.uy - ry * f.ux;
      const head = (f.n || 0) * SP;
      MEMSTAT.kinds['地裂:' + f.nm] = (MEMSTAT.kinds['地裂:' + f.nm] || 0) + 1;
      if (along > head - 30 && along < LN * SP + 40 && Math.abs(cross) < 62) {
        const tti = Math.max(0, along - head) / (SP / IV);
        if (tti < bestT) { const sd = cross > 0 ? 1 : (cross < 0 ? -1 : spin); bestT = tti; best = { v: [f.uy * sd, -f.ux * sd], why: '閃地裂', nm: f.nm }; }
      }
    });
    return best;
  }

  // （舊）玩家自己的法術清單，保留作分析用
  function memShots() {
    const s = senseFresh(), list = memList('shots');
    if (!s || !s.meW || !list) return null;
    let best = null, bestD = 1e9;
    for (let i = 0; i < list.length; i++) {
      const sh = list[i]; if (!sh || sh.done) continue;
      if (sh.t && typeof sh.t === 'object' && sh.t.atkMs !== undefined) continue; // 目標是怪物 = 自己的法術，不用躲
      const k = typeof sh.k === 'object' ? '(物件)' : String(sh.k); MEMSTAT.kinds[k] = (MEMSTAT.kinds[k] || 0) + 1;
      if (!MEMSTAT.kindSample[k]) MEMSTAT.kindSample[k] = { r: sh.r, dx: sh.dx, dy: sh.dy, age: sh.age, dist: Math.round(Math.hypot(sh.x - s.meW[0], sh.y - s.meW[1])) };
      const rx = s.meW[0] - sh.x, ry = s.meW[1] - sh.y, dist = Math.hypot(rx, ry) || 1, r = +sh.r || 20;
      const sp = Math.hypot(+sh.dx || 0, +sh.dy || 0);
      if (dist < r + 45) { if (dist < bestD) { bestD = dist; best = { v: [rx, ry], k, why: '離開範圍' }; } } // 已在範圍內或邊緣：往外走
      else if (sp > 0 && dist < 520) { // 會移動的：看它是不是朝我來、會不會擦到
        const closing = (sh.dx * rx + sh.dy * ry) / (sp * dist), miss = Math.abs(rx * sh.dy - ry * sh.dx) / sp;
        if (closing > 0.5 && miss < r + 40 && dist < bestD) { const side = rx * sh.dy - ry * sh.dx > 0 ? 1 : -1; bestD = dist; best = { v: [sh.dy * side, -sh.dx * side], k, why: '閃彈道' }; }
      }
    }
    return best;
  }

  function readMini() {
    if (cfg.farmSense === 'mem') { const mm = memMobs(); if (mm) return mm; }
    if (cfg.farmSense !== 'pixel') {
      const s = senseFresh();
      if (s && s.mm) {
        const pts = new Array(s.mobs.length);
        for (let i = 0; i < s.mobs.length; i += 2) { pts[i] = s.mobs[i] - s.mm[0]; pts[i + 1] = s.mobs[i + 1] - s.mm[1]; }
        const m = summarize(pts); m.src = 'hook'; return m;
      }
    }
    const mm = $('#mmw canvas'); if (!mm) return null;
    let d; try { d = mm.getContext('2d').getImageData(0, 0, mm.width, mm.height).data; } catch (e) { return null; }
    const W = mm.width, H = mm.height; const reds = [];
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (R > 200 && G < 80 && B < 80) reds.push(p);
    }
    // 小地圖以自己為中心。（不能用藍點找自己：有海的地圖整片都是藍的）
    const px = W / 2, py = H / 2;
    const pts = [];
    for (const p of reds) { pts.push((p % W) - px, ((p / W) | 0) - py); }
    const m = summarize(pts);
    // 一隻怪在小地圖上是 2×2 = 4 個像素，換算成隻數讓兩種感測的門檻一致
    m.total = Math.round(m.total / 4); m.nearN = Math.round(m.nearN / 4); m.midN = Math.round(m.midN / 4); m.src = 'pixel';
    return m;
  }

  // 精確版：從攔截到的經驗球裡挑目標。分數 = 距離 − 附近其他經驗球的加成 + 目標旁怪物的懲罰
  // 地上物品分類（依 game.js：裝備不會被吸，要走到 36px 內；金幣進吸取範圍會自己飛來；
  // 一般物品 240 秒消失；hold>0 表示背包放不下）
  const gemK = () => (cfg.pickPref === 'exp' ? 2 : cfg.pickPref === 'item' ? 0.5 : 1);   // 經驗的份量
  const itemK = () => (cfg.pickPref === 'item' ? 1.8 : cfg.pickPref === 'exp' ? 0.4 : 1); // 一般物品與金幣的份量（必撿／優先／裝備不受影響）
  const PICK_KIND_NM = { gold: '金幣', heal: '補血球', gem: '寶石', potion: '藥水卷軸', material: '材料', equip: '裝備', chest: '寶箱', other: '其他物品' };
  const PICK_NM = { must: '必撿', pri: '優先', norm: '一般', skip: '不撿' };
  const pickKind = (it) => (it.heal ? 'heal' : (it.id === 40308 ? 'gold' : ((it.ench !== undefined || it.keep) ? 'equip' : itemCatOf(it.name, it.id))));
  const pickRule = (it) => (cfg.pickRules || {})[it.name] || (cfg.pickCat || {})[pickKind(it)] || 'norm';
  function groundLists(s) {
    const out = { must: [], pri: [], equip: [], other: [], gold: [], heal: [], urgent: [], equipNames: [] };
    if (!s || !s.meW) return out;
    const A = s.camA || 2, me = s.me || [s.cw * 0.5, s.ch * 0.47];
    GITEMS.forEach((it) => {
      const wx = it.x - s.meW[0], wy = it.y - (s.meW[1] - 6);
      if (it.dead || Math.abs(wx) > 2600 || Math.abs(wy) > 2000) { GITEMS.delete(it); return; }
      if (it.hold > 0 || !(it.n > 0) || it.pull) return; // pull＝已經被吸過來了
      const rule = pickRule(it); if (rule === 'skip') return; // 不撿
      const kind = it.heal ? 'heal' : (it.id === 40308 ? 'gold' : ((it.ench !== undefined || it.keep || /寶箱/.test(it.name || '')) ? 'equip' : 'other'));
      if (rule === 'must' || rule === 'pri') { out[rule].push(me[0] + wx * A, me[1] + wy * A); if (kind === 'equip') out.equipNames.push(it.name); return; }
      out[kind].push(me[0] + wx * A, me[1] + wy * A);
      // 一般物品放 240 秒會消失（game.js 第 2643 行）：剩不到 60 秒的另外列為急件
      if ((kind === 'other' || kind === 'gold') && !it.keep && it.t > 180) out.urgent.push(me[0] + wx * A, me[1] + wy * A);
      if (kind === 'equip') out.equipNames.push(it.name);
    });
    return out;
  }
  function nearestEquip(s) { // 最近的一件裝備（畫布像素的相對位置）
    const gl = groundLists(s), me = (s && s.me) || [0, 0]; let best = null, bd = 1e9;
    for (let i = 0; i < gl.equip.length; i += 2) { const dx = gl.equip[i] - me[0], dy = gl.equip[i + 1] - me[1], d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = { dx, dy, dist: d, name: gl.equipNames[i / 2] }; } }
    return best;
  }

  // 經驗寶石與金幣：遊戲規則是「進入吸取範圍就自己飛過來」（game.js 2645、3263），所以只要走到範圍邊上，不用踩到。
  // 吸取範圍會隨卡片／魅力／天賦變大，這裡用觀察推估：還沒被吸的寶石一定在範圍外，
  // 所以「最近一段時間裡，沒被吸的寶石離我最近的距離」就是吸取半徑的上限，取第二小的值避開剛掉落那一幀的誤差。
  let magR = 60; const magMins = [];
  function gemScan(meW) {
    const out = []; if (!meW) return out;
    let mn = 1e9, mn2 = 1e9; const vs = [];
    GEMS.forEach((g) => {
      if (g.dead) { GEMS.delete(g); return; }
      const d = Math.hypot(g.x - meW[0], g.y - meW[1]);
      if (d > 3000) { GEMS.delete(g); return; }
      if (g.pull) return; // 已經在飛過來了
      if (d < mn) { mn2 = mn; mn = d; } else if (d < mn2) mn2 = d;
      out.push({ x: g.x, y: g.y, d, v: g.v || 1 }); vs.push(g.v || 1);
    });
    if (mn2 < 700) { magMins.push(mn2); if (magMins.length > 150) magMins.shift(); const a = magMins.slice().sort((p, q) => p - q); magR = Math.max(50, Math.min(600, a[1] || a[0])); }
    vs.sort((p, q) => p - q); const med = vs.length ? vs[vs.length >> 1] || 1 : 1;
    for (const g of out) g.w = Math.min(10, g.v / med); // 菁英怪的大顆寶石權重較高
    return out;
  }

  function findGemHook(m, hpRatio) {
    const s = senseFresh(); if (!s) return null;
    const me = s.me || [s.cw * 0.5, s.ch * 0.47];
    let best = null, bestScore = 1e9;
    // 物品最優先；血量低於 75% 時補血球次之；兩者都要避開有怪守著的
    const extra = (arr, bonus, label, reach) => {
      for (let i = 0; i < arr.length; i += 2) {
        const dx = arr[i] - me[0], dy = arr[i + 1] - me[1]; const dist = Math.max(0, Math.hypot(dx, dy) - (reach || 0)); // reach：走到這麼近它就會自己飛來
        let guard = 0; const gx = dx / MM_TO_CANVAS, gy = dy / MM_TO_CANVAS;
        if (m && m.pts) for (let k = 0; k < m.pts.length; k += 2) { if (Math.abs(m.pts[k] - gx) < 7 && Math.abs(m.pts[k + 1] - gy) < 7) guard++; }
        const score = dist - bonus + guard * 150;
        if (score < bestScore) { bestScore = score; best = { dx, dy, dist, label, guard }; }
      }
    };
    const gl = groundLists(s);
    if (cfg.farmItems) {
      // 定期回頭掃：每 40 秒，地上累積 3 件以上沒撿的東西時，花最多 8 秒專心撿
      const nowT = Date.now(), left = (gl.other.length + gl.gold.length) / 2;
      if (nowT - lastSweep > 40000 && left >= 3) { lastSweep = nowT; sweepUntil = nowT + 8000; }
      const sw = nowT < sweepUntil ? 2500 : 0;
      extra(gl.must, 5000, '必撿'); extra(gl.pri, 3200, '優先撿'); extra(gl.equip, 3000, '撿裝備'); extra(gl.urgent, 1800 * itemK(), '撿快消失的'); extra(gl.other, (900 + sw) * itemK(), sw ? '回頭掃物品' : '撿物品'); extra(gl.gold, (260 + sw) * itemK(), sw ? '回頭掃金幣' : '撿金幣', magR * 0.75 * (s.camA || 2));
    }
    if (hpRatio < 0.75) extra(gl.heal.length ? gl.heal : s.orbs, 700 * (1 - hpRatio) + 300, '補血球');
    const gw = s.meW ? gemScan(s.meW) : [];
    if (gw.length) {
      const A = s.camA || 2, reach = magR * 0.75;
      gw.sort((p, q) => p.d - q.d);
      for (let i = 0; i < Math.min(gw.length, 80); i++) {
        const a = gw[i]; if (a.d < magR * 0.9) continue; // 已經快被吸了
        let cw = 0; for (const b of gw) if (Math.abs(b.x - a.x) < magR && Math.abs(b.y - a.y) < magR) cw += b.w; // 走到這顆時順便吸到的量
        const dist = (a.d - reach) * A, dx = (a.x - s.meW[0]) * A, dy = (a.y - s.meW[1]) * A;
        let guard = 0; const gx = dx / MM_TO_CANVAS, gy = dy / MM_TO_CANVAS;
        if (m && m.pts) for (let k = 0; k < m.pts.length; k += 2) { if (Math.abs(m.pts[k] - gx) < 7 && Math.abs(m.pts[k + 1] - gy) < 7) guard++; }
        const score = dist - Math.min(cw, 25) * 40 * gemK() + guard * 120;
        if (score < bestScore) { bestScore = score; best = { dx, dy, dist, count: gw.length, guard, label: '撿經驗' }; }
      }
      return best;
    }
    const g = s.gems, n = g.length / 2;
    for (let i = 0; i < g.length; i += 2) {
      const dx = g[i] - me[0], dy = g[i + 1] - me[1]; const dist = Math.hypot(dx, dy);
      let cluster = 0;
      for (let j = 0; j < g.length; j += 2) { if (j !== i && Math.abs(g[j] - g[i]) < 90 && Math.abs(g[j + 1] - g[i + 1]) < 90) cluster++; }
      let guard = 0; const gx = dx / MM_TO_CANVAS, gy = dy / MM_TO_CANVAS; // 換成小地圖單位，數目標旁邊的怪
      if (m && m.pts) for (let k = 0; k < m.pts.length; k += 2) { if (Math.abs(m.pts[k] - gx) < 7 && Math.abs(m.pts[k + 1] - gy) < 7) guard++; }
      const score = dist - Math.min(cluster, 12) * 45 * gemK() + guard * 120;
      if (score < bestScore) { bestScore = score; best = { dx, dy, dist, count: n, guard, label: '撿經驗' }; }
    }
    return best;
  }

  function findGem() {
    const c = $('#c'); if (!c) return null;
    const w = 480, h = Math.max(1, Math.round(480 * c.height / c.width));
    if (!gemCv) gemCv = document.createElement('canvas');
    gemCv.width = w; gemCv.height = h;
    let d; try { const g = gemCv.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0, w, h); d = g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    // 實測角色約在畫面 (52%, 45%)，頭上有藍色護盾條；海水也是藍的。
    // 所以只認「小而孤立」的藍點：周圍 11×11 內藍色像素 2～22 個才算經驗球。
    const cx = w * 0.52, cy = h * 0.45; const yMax = Math.floor(h * 0.68); // 下方是介面，不掃
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < yMax; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const R = d[i], G = d[i + 1], B = d[i + 2];
      if (B > 170 && R < 120 && G > 60 && G < 200 && B - R > 90) mask[y * w + x] = 1;
    }
    let best = 1e9, gx = 0, gy = 0, count = 0;
    for (let y = 6; y < yMax - 6; y++) for (let x = 6; x < w - 6; x++) {
      if (!mask[y * w + x]) continue;
      const dx = x - cx, dy = y - cy;
      if (Math.abs(dx) < 26 && dy > -34 && dy < 22) continue; // 角色本體與護盾條
      let n = 0;
      for (let yy = y - 5; yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) n += mask[yy * w + xx];
      if (n < 2 || n > 22) continue;
      count++;
      const dist = Math.hypot(dx, dy);
      if (dist < best) { best = dist; gx = dx; gy = dy; }
    }
    return best < 1e9 ? { dx: gx, dy: gy, dist: best, count } : null;
  }

  // 向量 → 八方向（畫面上方 = W）
  function vecToDir(dx, dy) {
    const a = Math.atan2(dy, dx); // 右=0，下=+90°
    const idx = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; // 0右 1右下 2下 3左下 4左 5左上 6上 7右上
    return [2, 3, 4, 5, 6, 7, 0, 1][idx]; // 對應 DIRS 的索引
  }
  const rot = (dx, dy, deg) => { const r = deg * Math.PI / 180; return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)]; };

  function smartTick(now) {
    if (now - lastSmart < 220) return;
    lastSmart = now;

    // 卡牆偵測：座標 0.9 秒沒變就往側邊繞
    if (now - lastCoordAt > 900) {
      const coord = (($('#coord') || {}).textContent || '').split('\n')[0];
      if (coord && coord === lastCoord && held.length) { stuckDir = (dirIdx + 2 * spin + 8) % 8; stuckUntil = now + 700; spin = -spin; }
      lastCoord = coord; lastCoordAt = now;
    }
    if (now < stuckUntil) { dirIdx = stuckDir; hold(DIRS[dirIdx]); return; }

    const m = readMini(); lastMini = m;
    if (!m) { // 小地圖讀不到就退回繞圈
      if (now - lastStep >= cfg.farmStepMs) { lastStep = now; dirIdx = (dirIdx + spin + 8) % 8; hold(DIRS[dirIdx]); }
      return;
    }
    const hp = (($('#hpT') || {}).textContent || '').split('/').map(num);
    const hpRatio = hp[1] ? hp[0] / hp[1] : 1;
    // 受擊偵測：生命＋護盾比上一次少 = 剛被打到，接下來 1.2 秒優先閃避
    const sh = num((($('#mpT') || {}).textContent || '').split('/')[0]);
    const pool = (hp[0] || 0) + sh;
    { let cast = false; const P0 = window.__g155P;
      try { if (P0 && P0.cd) for (const id in P0.cd) { const v = +P0.cd[id] || 0; if (v > (lastCd[id] || 0) + 0.01) cast = true; lastCd[id] = v; } } catch (e) {}
      if (cast && lastPool !== null && lastHpV !== null && (hp[0] || 0) >= lastHpV && pool < lastPool) lastPool = pool;
      lastHpV = hp[0] || 0; }
    const sf = senseFresh();
    let justHit = false;
    trackDamage(now, pool, lastPool !== null && pool < lastPool ? lastPool - pool : 0, m.potDps);
    updatePressure(pool, m);
    if (lastPool !== null && pool < lastPool) {
      hurtUntil = now + 1200; hits++; justHit = true;
      // 學習：被打到的瞬間，記下身邊 90 像素內有哪些圖（之後可看出哪些是會傷人的投射物／技能）
      if (sf && sf.meW) for (let i = 0; i < sf.spr.length; i += 3) {
        if (Math.abs(sf.spr[i + 1] - sf.meW[0]) < 90 && Math.abs(sf.spr[i + 2] - sf.meW[1]) < 90) SENSE.hitIds[sf.spr[i]] = (SENSE.hitIds[sf.spr[i]] || 0) + 1;
      }
    }
    lastPool = pool;
    const hurt = now < hurtUntil;
    const late = false; // 不再有「進入／離開保命模式」的開關，改由壓力值 D 連續調整
    const loop = cfg.style === 'loop';
    const kite = cfg.style !== 'melee'; // 定點繞圈也用較保守的閃避門檻
    if (loop && sf && sf.meW) { // 圓心：開場位置；之後很慢地跟著實際位置漂移，避免被地形卡在圈外
      const nm = mapName();
      if (nm !== homeMap) { homeMap = nm; homeW = null; homeOpen = 0; detourW = null; } // 換關卡（換地圖）要重新找圓心
      if (!homeW) {
        const mp = loadMap(nm), h = mp ? pickHome(mp, sf.meW) : null;
        if (h) { homeW = h.w; homeOpen = h.open; homeFixed = true; log('圓心設在地圖開闊處：離邊緣約 ' + Math.round(h.open) + 'px，距離目前位置 ' + Math.round(h.dMe) + 'px'); }
        else { homeW = [sf.meW[0], sf.meW[1]]; homeFixed = false; }
      } else if (!homeFixed) { homeW[0] += (sf.meW[0] - homeW[0]) * 0.0015; homeW[1] += (sf.meW[1] - homeW[1]) * 0.0015; } // 沒有地圖資料時才讓圓心慢慢漂移
    }
    const dangerN = kite ? Math.max(1, Math.round(cfg.farmDanger / 2)) : cfg.farmDanger; // 幾隻貼身怪就閃：固定，不受壓力影響
    const isMage = true; // 「保持 3 格」法師、騎士都適用（使用者：離怪太遠會打不死、撿不到東西，怪越積越多）
    const danger = (hurt && (!isMage || hpRatio < (cfg.retreatHp || 0.5))) || m.nearN >= dangerN || (hpRatio < 0.4 && m.nearest < MID * 0.6); // 法師被打一下不再整個退開，維持 3 格繼續打

    let v = null, why = '';
    // 1. 有東西高速朝自己飛來：往垂直於它飛行方向、遠離彈道的一側閃
    const th = m.src !== 'mem' && sf && sf.threats.length ? sf.threats.reduce((a, b) => (a.tti < b.tti ? a : b)) : null;
    const shot = m.src === 'mem' ? (memThreats() || m.special) : null;
    const equipGo = cfg.farmItems && sf && sf.meW && m.nearN < dangerN * 2 && !(m.boss && m.boss.d * W2MM < 450) ? nearestEquip(sf) : null; // 不管用哪種感測都要撿（王倒下後場上沒怪時也是）
    const dodged = () => { if (now - lastDodgeAt > 500) { SENSE.dodges++; lastDodgeAt = now; } };
    if (justHit) { const who = m.attackers && m.attackers.length ? m.attackers : ['（來源不明）']; who.forEach((n) => { MEMSTAT.hitBy[n] = (MEMSTAT.hitBy[n] || 0) + 1; }); } // 學習：被打到時誰正在出手
    const zt = zoneDodge(sf, m, null);
    const bossW = m.boss ? m.boss.d * W2MM : 1e9;
    if (zt) { v = zt.v; why = zt.why; dodged(); MEMSTAT.kinds['已閃:紅霧'] = (MEMSTAT.kinds['已閃:紅霧'] || 0) + 1; }
    else if (bossW < BOSS_NEAR_W) { // 王太近：直接遠離（王比我慢 10%），帶一點橫向，往怪少的一側
      const ux = -m.boss.dx / m.boss.d, uy = -m.boss.dy / m.boss.d;
      const side = (sd) => { if (!m.dens) return 0; const tg = rot(ux, uy, 90 * sd), k = ((Math.round(Math.atan2(tg[1], tg[0]) / (Math.PI / 8)) % 16) + 16) % 16; return m.dens[k] + m.dens[(k + 1) % 16] + m.dens[(k + 15) % 16]; };
      if (side(-spin) + 0.1 < side(spin)) spin = -spin;
      const tg = rot(ux, uy, 90 * spin); v = [ux + tg[0] * 0.35, uy + tg[1] * 0.35];
      const mp = homeMap ? mapCache[homeMap] : null;
      if (mp && sf && sf.meW && openAt(mp, sf.meW[0] + v[0] * 150, sf.meW[1] + v[1] * 150) < 120) { v = [tg[0] + ux * 0.2, tg[1] + uy * 0.2]; } // 背後是邊緣：改成橫著繞開
      why = '遠離王:' + m.boss.name + '(' + Math.round(bossW) + 'px)'; dodged();
    }
    else if (m.boss && bossW < 650 && sf && sf.meW) { // 王戰：走位以躲王為主（繞王打），閃箭疊加在上面而不是取代
      const ux = -m.boss.dx / m.boss.d, uy = -m.boss.dy / m.boss.d; // 從王指向我
      const tg = rot(ux, uy, 90 * spin), k = Math.max(-1, Math.min(1.4, (BOSS_RING_W - bossW) / 60));
      v = [tg[0] + ux * k, tg[1] + uy * k];
      if (m.dens) { let rx = 0, ry = 0; for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8; rx -= Math.cos(a) * m.dens[j]; ry -= Math.sin(a) * m.dens[j]; } v = [v[0] + rx * 4, v[1] + ry * 4]; } // 避開小怪：讓王當最近的目標
      if (shot) { const sn = Math.hypot(shot.v[0], shot.v[1]) || 1; v = [v[0] + shot.v[0] / sn * 0.8, v[1] + shot.v[1] / sn * 0.8]; dodged(); }
      const mp = homeMap ? mapCache[homeMap] : null, vn = Math.hypot(v[0], v[1]) || 1;
      const ahead = ((Math.round(Math.atan2(tg[1], tg[0]) / (Math.PI / 8)) % 16) + 16) % 16;
      const blocked = (m.dens && m.dens[ahead] + m.dens[(ahead + 1) % 16] + m.dens[(ahead + 15) % 16] > 0.6) || (mp && openAt(mp, sf.meW[0] + v[0] / vn * 180, sf.meW[1] + v[1] / vn * 180) < 150);
      if (blocked && now - lastFlip > 1500) { spin = -spin; lastFlip = now; }
      why = '繞王打:' + m.boss.name + '(' + Math.round(bossW) + 'px)' + (shot ? '＋閃' : '');
    }
    else if ((m.rN || 0) >= Math.max(6, Math.round(cfg.expoMax * (1 - 0.5 * D))) || (hpRatio < 0.35 && (m.rN || 0) >= 3)) {
      const an = Math.hypot(m.rax, m.ray) || 1; let ox = m.rax / an, oy = m.ray / an; // 遠離「射得到我的那群」
      const mp = homeMap ? mapCache[homeMap] : null;
      if (mp && sf && sf.meW && openAt(mp, sf.meW[0] + ox * 160, sf.meW[1] + oy * 160) < 150) { const t2 = rot(ox, oy, 70 * spin); ox = t2[0]; oy = t2[1]; } // 背後是邊緣就斜著跑
      v = [ox, oy];
      if (shot) { const sn = Math.hypot(shot.v[0], shot.v[1]) || 1; v = [v[0] + shot.v[0] / sn * 0.7, v[1] + shot.v[1] / sn * 0.7]; }
      why = (hpRatio < 0.35 ? '低血跑出火力圈(' : '跑出火力圈(') + m.rN + ')'; dodged();
    }
    else if (shot) { v = shot.v; why = shot.why; dodged(); MEMSTAT.kinds['已閃:' + shot.why] = (MEMSTAT.kinds['已閃:' + shot.why] || 0) + 1; }
    else if (equipGo) { v = [equipGo.dx, equipGo.dy]; why = '撿裝備:' + equipGo.name; } // 裝備不會被吸，優先走過去撿
    else if (loop && (isMage ? m.nearN >= 3 : m.near2 >= Math.max(2, Math.round(cfg.loopPack * (1 - 0.4 * D)))) && escapeDir(m, sf)) { // 法師：真的被貼身包住（2 格內 3 隻）才脫離 // 定點繞圈：怪群快圍上來，先往最空的方向脫離
      v = escapeDir(m, sf); why = '脫離怪群(' + m.near2 + ')'; dodged();
      if (!packAt || now - packAt > 3000) packAt = now;
    }
    else if (m.rAtk) { const rn = Math.hypot(m.rvx, m.rvy) || 1, t1 = rot(m.rvx / rn, m.rvy / rn, 90 * spin); const ap = m.rBest * W2MM > 120 ? 0.8 : 0; v = [t1[0] + m.rvx / rn * ap, t1[1] + m.rvy / rn * ap]; why = '閃遠程(' + m.rAtk + ')' + (ap ? '並靠近' : ''); dodged(); } // 遠程怪正在出手：橫向離開彈道，同時往牠靠近
    else if (m.atk) { v = rot(m.avx, m.avy, 25 * spin); why = '閃近戰(' + m.atk + ')'; dodged(); }   // 近戰怪正在出手：往反方向退開
    else if (m.boss && m.boss.d < BOSS_KEEP + 18 * D) { // 王：保持距離並繞著走
      const ux = m.boss.dx / m.boss.d, uy = m.boss.dy / m.boss.d, tg = rot(ux, uy, 90 * spin);
      v = [tg[0] * 0.7 - ux, tg[1] * 0.7 - uy]; why = '躲王:' + m.boss.name;
    }
    else if (th) {
      const s = th.side > 0 ? 1 : (th.side < 0 ? -1 : spin);
      v = [th.vy * s, -th.vx * s]; why = '閃投射物';
      if (now - lastDodgeAt > 500) { SENSE.dodges++; lastDodgeAt = now; }
    }
    else if (m.boss && sf && sf.meW && m.boss.d * W2MM < 650 && m.nearN < dangerN) {
      const bd = m.boss.d * W2MM, ux = -m.boss.dx / m.boss.d, uy = -m.boss.dy / m.boss.d; // 從王指向我
      const tg = rot(ux, uy, 90 * spin), k = Math.max(-1, Math.min(1.4, (BOSS_RING_W - bd) / 70));
      v = [tg[0] + ux * k, tg[1] + uy * k];
      const mp = homeMap ? mapCache[homeMap] : null, vn = Math.hypot(v[0], v[1]) || 1;
      const ahead = ((Math.round(Math.atan2(tg[1], tg[0]) / (Math.PI / 8)) % 16) + 16) % 16;
      const blocked = (m.dens && m.dens[ahead] + m.dens[(ahead + 1) % 16] + m.dens[(ahead + 15) % 16] > 0.6) || (mp && openAt(mp, sf.meW[0] + v[0] / vn * 180, sf.meW[1] + v[1] / vn * 180) < 150);
      if (blocked && now - lastFlip > 1500) { spin = -spin; lastFlip = now; } // 前面被怪或邊緣擋住就反方向繞
      why = '繞王打:' + m.boss.name + '(' + Math.round(bd) + 'px)';
    }
    else if (danger) {
      // 2. 貼身有怪就背對牠們跑；沒有貼身的怪（遠程攻擊）就背對最近的怪並大幅側移
      if (m.nearN) v = rot(m.ax, m.ay, 30 * spin);
      else if (m.total) v = rot(-m.nx, -m.ny, 60 * spin);
      why = hurt ? '受擊閃避' : '閃避';
    }
    else {
      // 撿取時機：壓力低、身邊沒怪、沒被遠程瞄準時才離開圈子去撿遠處的東西；否則只撿順路的
      const calm = D < 0.45 && m.nearN === 0 && (m.rN || 0) <= 1;
      const huntR = m.ranged >= 1 && m.rBest < 1e8 && m.rBest * W2MM > 200 && D < 0.65 && hpRatio > 0.45 && !m.boss && cls() !== 'mage'; // 遠程怪太遠：去打牠（法師在下面的 3 格邏輯裡處理）
      const gem = !cfg.farmGems ? null : (m.src !== 'pixel' && senseFresh() ? findGemHook(m, hpRatio) : findGem()); // 記憶體與繪圖感測都用完整的撿取判斷（之前記憶體模式誤用了只認經驗球的舊版）
      const gemOk = gem && m.nearN < (kite ? dangerN : cfg.farmDanger) && !(m.ranged >= 1 && gem.label === '撿經驗' && gem.dist > (D < 0.35 && hpRatio > 0.7 ? 260 : 140)) && !(gem.label !== '補血球' && (gem.guard || 0) > (m.ranged ? 4 : 7)) && !(loop && gem.dist > 300 && gem.label !== '撿裝備' && !(m.total === 0 || (calm && gem.dist < 1500))); // 沒有立即危險就去撿；場上有遠程怪時先去打，只撿順路的
      if (gemOk && !(isMage && m.total > 3 && gem.label === '撿經驗' && gem.dist > 200)) { v = [gem.dx, gem.dy]; why = (gem.label || '撿經驗') + (gem.count ? '(' + gem.count + ')' : ''); }
      else if (isMage && loop && m.total && sf && sf.meW && !huntR) {
        const IN = 2.5 * 32, OUT = 3.3 * 32;
        // 法師：有遠程／技能型怪物（650px 內）就以牠為目標，靠到 3 格讓牠變成最近的怪，法術就會先打牠；沒有才對最近的怪保持 3 格
        const pri = cls() === 'mage' && m.ranged && m.rBest < 1e8 && m.rBest * W2MM < 650 && hpRatio > 0.35;
        const tdx = pri ? m.rdx : m.nx, tdy = pri ? m.rdy : m.ny, td = (pri ? m.rBest : m.nearest) || 1, near = td * W2MM;
        const ux = tdx / td, uy = tdy / td, tg = rot(ux, uy, 90 * spin);
        const radial = near > OUT ? Math.min(1.2, (near - OUT) / 40 + 0.4) : (near < IN ? -1 : 0);
        v = [tg[0] + ux * radial, tg[1] + uy * radial];
        if (pri && m.nearest * W2MM < IN) { const nd = m.nearest || 1; v = [v[0] - m.nx / nd * 0.8, v[1] - m.ny / nd * 0.8]; } // 去打遠程的路上，近戰怪靠太近就讓開
        const mp = homeMap ? mapCache[homeMap] : null, vn = Math.hypot(v[0], v[1]) || 1;
        if (mp && openAt(mp, sf.meW[0] + v[0] / vn * 150, sf.meW[1] + v[1] / vn * 150) < 130 && now - lastFlip > 1500) { spin = -spin; lastFlip = now; } // 快到邊緣就反方向繞
        why = (pri ? '優先打遠程:' + m.rName + '(' : '保持3格(') + Math.round(near) + 'px)';
      }
      else if (loop && homeW && sf && sf.meW && !huntR) {
        // 定點繞圈（照使用者實戰的走法）：繞著固定圓心轉，不追怪、不折返，讓怪自己過來被範圍技能打。
        // 半徑隨壓力加大一點。偏離圈太多時先走回圈上。
        let R = cfg.loopR * (1 + 0.35 * D);
        if (homeFixed && homeOpen > 0) R = Math.max(90, Math.min(R, homeOpen - 70)); // 圈不要畫到邊緣外
        if (cfg.farmItems && !detourW && now > nextDetourAt && D < 0.8) {
          const dt2 = planDetour(sf, R, hpRatio);
          if (dt2) { detourW = dt2.c; detourWhat = dt2.name + (dt2.n > 1 ? ' 等 ' + dt2.n + ' 件' : ''); detourUntil = now + Math.max(12000, Math.min(26000, 2 * Math.PI * R / 110 * 1000 * 1.3)); log('繞過去撿：' + detourWhat); }
          else nextDetourAt = now + 5000;
        }
        if (detourW && now > detourUntil) { detourW = null; nextDetourAt = now + 4000; }
        const C = detourW || homeW;
        const hx = sf.meW[0] - C[0], hy = sf.meW[1] - C[1], r = Math.hypot(hx, hy) || 1, ux = hx / r, uy = hy / r;
        const tg = rot(ux, uy, 90 * spin), k = Math.max(-1.2, Math.min(1.2, (R - r) / 90));
        v = [tg[0] + ux * k, tg[1] + uy * k];
        if (m.dens) {
          let rx = 0, ry = 0; for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8; rx -= Math.cos(a) * m.dens[j]; ry -= Math.sin(a) * m.dens[j]; }
          v = [v[0] + rx * 5, v[1] + ry * 5]; // 繞開前方的怪
          const ahead = ((Math.round(Math.atan2(tg[1], tg[0]) / (Math.PI / 8)) % 16) + 16) % 16;
          if (m.dens[ahead] + m.dens[(ahead + 1) % 16] + m.dens[(ahead + 15) % 16] > 0.6 && now - lastFlip > 2500) { spin = -spin; lastFlip = now; } // 前方塞住就反方向繞
        }
        why = detourW ? '繞過去撿:' + detourWhat : '定點繞圈';
      }
      else if (m.ranged && m.rBest < 1e8) { // 全程有效，後期與王戰也一樣：遠程怪越早清掉越好
        // 獵殺遠程怪：法術會先打最近的怪，遠程怪站在後面不處理就會越積越多。
        // 所以主動靠到牠旁邊（讓牠變成最近的目標），到位後繞著牠橫移閃箭。
        // 邊緣作戰：遠程怪常常一次湧出二十幾隻，走進中間會被同時集火（第 9 場 9 秒內被打 13 次）。
        // 所以控制「射得到我的遠程怪」數量：太多就往外側滑出去，降下來再貼回去打，始終待在怪群邊緣。
        const d = m.rBest || 1, ux = m.rdx / d, uy = m.rdy / d, tg = rot(ux, uy, 90 * spin);
        const expoMax = Math.max(3, Math.round((kite ? cfg.expoMax : cfg.expoMax + 3) * (1 - 0.6 * D))), huntIn = 24 + 8 * D; // 約 120～160px：靠近到打得到 // 壓力高：繞大圈、少面對幾隻
        const an = Math.hypot(m.rax, m.ray) || 1, ox = m.rax / an, oy = m.ray / an; // 遠離「射得到我的那群」的方向
        if (m.rN > expoMax) { const t2 = rot(ox, oy, 70 * spin); v = [ox * 0.9 + t2[0] * 0.6, oy * 0.9 + t2[1] * 0.6]; why = '邊緣作戰:退出火力(' + m.rN + ')'; }
        else if (d > huntIn) { v = [ux + tg[0] * 0.35, uy + tg[1] * 0.35]; why = '獵殺遠程:' + m.rName + '(' + m.ranged + '｜射得到我 ' + m.rN + ')'; }
        else { // 到位：固定方向繞著牠轉圈打。持續移動本身就是最好的閃避，所以不隨便換向
          const radial = d < huntIn * 0.55 ? -0.7 : (d > huntIn * 0.9 ? 0.35 : 0); // 維持半徑
          v = [tg[0] + ux * radial, tg[1] + uy * radial]; why = '繞圈打遠程:' + m.rName + '(' + m.rN + ')';
        }
      }
      else if (m.total) {
        if (kite) {
          // 繞圈躲怪：繞著怪群外圍走，太近就往外拉、太遠就往內收，讓遠程技能有時間打
          const cx = m.midN ? m.mx / m.midN : m.nx, cy = m.midN ? m.my / m.midN : m.ny; // 怪群方向
          const d = Math.hypot(cx, cy) || 1, ux = cx / d, uy = cy / d;
          const tang = rot(ux, uy, 90 * spin);
          const kin = KITE_IN + 16 * D, kout = KITE_OUT + 22 * D; // 壓力越高，和怪群保持越遠
          const radial = m.nearest < kin ? -1.2 : (m.nearest > kout ? 0.9 : 0);
          v = [tang[0] + ux * radial, tang[1] + uy * radial]; why = radial < 0 ? '繞圈(拉開)' : (radial > 0 ? '繞圈(靠近)' : '繞圈');
        }
        else if (m.nearest < NEAR * 0.7) { v = rot(m.nx, m.ny, 90 * spin); why = '繞打'; }
        else if (m.midN) { v = [m.mx, m.my]; why = '接近'; }
        else { v = [m.nx, m.ny]; why = '找怪'; }
      }
    }
    if (v && sf && sf.meW && cfg.farmGems && /^(保持3格|優先打遠程|定點繞圈|繞過去撿|獵殺遠程|繞圈打遠程|繞王打|閃投射物|閃遠程|閃近戰|邊緣作戰|繞圈|接近|找怪)/.test(why)) {
      const me = sf.meW; let gx = 0, gy = 0, gn = 0;
      for (const g of gemScan(me)) { if (g.d < magR * 0.9 || g.d > 260 + magR) continue; const k = g.w / (1 + (g.d - magR) / 90); gx += (g.x - me[0]) / g.d * k; gy += (g.y - me[1]) / g.d * k; gn++; }
      if (cfg.farmItems) GITEMS.forEach((it) => { if (it.dead || it.hold > 0 || !(it.n > 0) || it.pull || it.heal || pickRule(it) === 'skip') return; const dx = it.x - me[0], dy = it.y - me[1], d = Math.hypot(dx, dy) || 1; if (d > 300) return; const k = (it.id === 40308 ? 0.6 : 2.5) / (1 + d / 90); gx += dx / d * k; gy += dy / d * k; gn++; }); // 物品要踩到才撿，權重較高
      const gl = Math.hypot(gx, gy);
      if (gl > 0.25) {
        const wt = /^閃/.test(why) ? 0.5 : (/^繞王打/.test(why) ? 0.45 : 0.75); // 閃避時只偏一點，仍以離開彈道為主
        const vn = Math.hypot(v[0], v[1]) || 1, k2 = Math.min(wt, gl * 0.25);
        v = [v[0] / vn + gx / gl * k2, v[1] / vn + gy / gl * k2]; why += '＋順路吸(' + gn + ')';
      }
    }
    if (v && /^(閃遠程|閃投射物|閃王彈|閃近戰|跑出火力圈|低血跑出火力圈)/.test(why)) { const sv = safeDir(v, m, /^(閃投射物|閃王彈|閃遠程)/.test(why)); if (sv) { v = sv; why += '（避開怪群）'; } } // 閃避時別閃進怪群
    if (v && !zt) { const z2 = zoneDodge(sf, m, v); if (z2) { v = z2.v; why = z2.why + '｜原本:' + why; } }
    if (!v || (!v[0] && !v[1])) { // 沒目標：巡邏
      if (now - lastStep >= cfg.farmStepMs) { lastStep = now; dirIdx = (dirIdx + spin + 8) % 8; }
      why = '巡邏';
    } else { dirIdx = vecToDir(v[0], v[1]); }
    hold(DIRS[dirIdx]);
    if (now - bbAt >= 500) { // 黑盒子：[戰局時間, 動作, 生命＋護盾, 貼身怪, 射得到我的遠程, 遠程總數, 怪總數, 座標, 是否正在脫困, 我的速度]
      bbAt = now;
      BB.push([($('#timeT') || {}).textContent || '', why, Math.round(pool), m.nearN, m.rN || 0, m.ranged || 0, m.total, ((($('#coord') || {}).textContent || '').split('\n')[0].match(/\d+,\d+/) || [''])[0], now < stuckUntil ? 1 : 0, Math.round(Math.hypot(SENSE.myV[0], SENSE.myV[1]))]);
      if (BB.length > 30) BB.shift();
    }
    const st = $('#g155-st'); if (st) st.textContent = `[${m.src}] ${why}｜近怪 ${m.nearN}｜怪 ${m.total}｜血 ${Math.round(hpRatio * 100)}%｜受擊 ${hits}｜壓力 ${Math.round(D * 100)}%${dmgRate > 0 ? '｜受傷 ' + dmgRate.toFixed(0) + '/秒 可撐 ' + (ttd > 99 ? '99+' : ttd.toFixed(0)) + ' 秒' : ''}${m.boss ? '｜王:' + m.boss.name : ''}${m.ranged ? '｜遠程 ' + m.ranged : ''}${sf && sf.memMe ? '' : '｜座標:畫面'}`;
  }

  // ───────────── 自動連續進場 + 戰績記錄 ─────────────
  // 流程（皆為實測過的頁面元素）：
  //   結算畫面 #end → 按 #btnAgain 回村 → 走到傳送師旁 (96,290) → 點畫布上的 NPC
  //   → #npcwin「選擇出發地圖」選難度與地圖 → 掉落物預覽 #rlpop 按 #rlGo 出發
  let RUNS_KEY = 'g155helper.runs';
  const runs = (() => { const a = safeParse(localStorage.getItem(RUNS_KEY)); return Array.isArray(a) ? a : []; })();
  const NPC_AT = [89, 286], NPC_CLICK = [0.442, 0.449]; // 站位座標、NPC 在畫面上的比例位置
  let clrAt = 0, clrSeenAt = 0;
  let run = null, lastClickAt = 0, gateStep = 0, endAt = 0, villageSince = 0, gateTry = 0;
  function saveRuns() { try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-200))); } catch (e) {} }
  const secs = (t) => { const p = String(t || '').split(':').map(Number); return p.length === 2 ? p[0] * 60 + p[1] : 0; };

  function clickCanvas(fx, fy) {
    const c = $('#c'); if (!c) return;
    const o = { clientX: Math.round(innerWidth * fx), clientY: Math.round(innerHeight * fy), bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
    c.dispatchEvent(new PointerEvent('pointermove', o)); c.dispatchEvent(new MouseEvent('mousemove', o));
    c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new MouseEvent('mousedown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o)); c.dispatchEvent(new MouseEvent('mouseup', o));
    c.dispatchEvent(new MouseEvent('click', o));
  }

  function clickCanvasPx(cx, cy) { // 以畫布像素為單位
    const c = $('#c'); if (!c) return;
    const r = c.getBoundingClientRect();
    clickCanvas((r.left + cx * r.width / c.width) / innerWidth, (r.top + cy * r.height / c.height) / innerHeight);
  }

  function finishRun(text) {
    if (!run) return;
    const rec = {
      n: (runs.length ? (+runs[runs.length - 1].n || runs.length) : 0) + 1, cls: run.cls, mode: run.mode, map: run.map || '', diff: run.diff || '', dodges: Math.max(0, SENSE.dodges - run.dodges0), at: new Date().toLocaleString('zh-TW', { hour12: false }),
      time: (() => { const a = (text.match(/存活\s*([\d:]+)/) || [])[1] || ''; return secs(a) >= secs(run.time) ? a : run.time; })(), shown: (text.match(/存活\s*([\d:]+)/) || [])[1] || '',
      kills: num((text.match(/擊殺\s*(\d+)/) || [])[1]) || run.kills,
      level: num((text.match(/等級\s*(\d+)/) || [])[1]),
      win: (!!text && !/倒下/.test(text)) || !!run.homeClr, homeClr: run.homeClr || 0,
      cause: ((text.match(/致命一擊[：:]\s*(\S+)/) || [])[1]) || '',
      tl: run.tl, lateAt: run.lateAt, bb: BB.slice(), sawBoss: !!run.sawBoss, bossSecs: run.bossAt ? Math.round((Date.now() - run.bossAt) / 1000) : 0,
      hitBy: (() => { const o = {}; for (const k in MEMSTAT.hitBy) { const d = MEMSTAT.hitBy[k] - (run.hitBy0[k] || 0); if (d > 0) o[k] = d; } return o; })(),
      left: (() => { const o = {}; GITEMS.forEach((it) => { if (!it.dead && it.n > 0) { const k = it.heal ? '補血球' : (it.id === 40308 ? '金幣堆' : ((it.ench !== undefined || it.keep) ? '裝備' : '其他物品')); o[k] = (o[k] || 0) + 1; } }); return o; })(),
      stages: (run.stages || []).map((x, i, a) => Object.assign({}, x, { clr: x.clr || (i === a.length - 1 && !!text && !/倒下/.test(text) ? 1 : 0) })), hits: Math.max(0, hits - run.hits0), minHp: run.minHp, bosses: Object.keys(MEMSTAT.bosses).join(','), cards: run.cards, tpl: cfg.tpl || '', layers: run.layers, result: text.slice(0, 260),
    };
    if (!rec.kills && !secs(rec.time)) { run = null; return; } // 沒打到東西的空紀錄（例如中途重新載入）不存
    runs.push(rec); saveRuns(); run = null;
    log(`第 ${rec.n} 場［${rec.mode}］存活 ${rec.time}｜殺 ${rec.kills}｜Lv${rec.level}｜${rec.win ? '通關' : '倒下：' + rec.cause}`);
  }

  function loopTick() {
    const now = Date.now();
    const end = $('#end');
    if (visible(end)) {
      if (now - endAt < 3000) return;
      endAt = now;
      finishRun(end.innerText.replace(/\s+/g, ' ').trim());
      if (state.farmOn && cfg.autoLoop) { const b = $('#btnAgain') || $('button.big', end); if (b) b.click(); }
      return;
    }
    if (inBattle()) {
      { // 過關的倒數小視窗：東西在過關當下已自動收進背包，不用等 60 秒
        const go = $('#clrGo'), lim = +cfg.stageLimit || 0;
        if (go && state.farmOn && (cfg.autoNext || lim > 0) && visible(go) && now - clrAt > 2500) {
          const bag = MONS.size === 0 || now - clrSeenAt > 6000; // 給 6 秒把背包放不下而留在地上的東西撿一撿
          if (!clrSeenAt) clrSeenAt = now;
          const done = run && run.stages ? Math.max(run.stages.filter((x) => x.clr).length, run.stages.length) : 1; // 這一關已打倒首領，所以至少等於目前第幾關
          const home = lim > 0 && done >= lim, hb = $('#clrHome');
          if (now - clrSeenAt > 3000 && bag) { clrAt = now; clrSeenAt = 0; if (home && hb) { if (run) run.homeClr = done; log('過關：刷完第 ' + done + ' 關（設定只刷 ' + lim + ' 關）→ 回村重刷'); hb.click(); } else { log('過關：' + (($('#clrT') || {}).textContent || '') + ' → ' + go.textContent.trim()); go.click(); } }
        } else if (!go || !visible(go)) clrSeenAt = 0;
      }
      if (!run) {
        const c = cls();
        if (cfg.abTest && state.farmOn) { // 測試模式：同職業的幾種「走位風格＋流派」輪流上場
          const plans = c === 'mage' ? [['loop', 'speed'], ['kite', 'aoe'], ['loop', 'aoe']] : c === 'knight' ? [['loop', 'sustain'], ['loop', 'damage'], ['loop', 'mixed']] : [['loop', 'mixed'], ['kite', 'mixed']];
          const plan = plans[runs.filter((r) => r.cls === c).length % plans.length];
          cfg.farmMode = 'smart'; cfg.farmSense = 'mem'; cfg.style = plan[0]; cfg.build = plan[1];
        } else if (cfg.prof[c]) { cfg.style = cfg.prof[c].style; cfg.build = cfg.prof[c].build; } // 套用該職業存的設定
        syncPanel();
        run = { map: ['說話之島', '古魯丁', '沙漠', '奇岩', '龍之谷', '龍之谷地監', '妖精森林', '海音'][cfg.farmMap] || '', diff: cfg.farmDiff, t0: Date.now(), stages: [], cls: c, mode: (cfg.farmMode === 'circle' ? '固定繞圈' : STYLE_NAME[cfg.style]) + '+' + (BUILD_NAME[cfg.build] || cfg.build), cards: [], time: '', kills: 0, minHp: 100, layers: [], hits0: hits, dodges0: SENSE.dodges, tl: [], lastS: -99, hitBy0: Object.assign({}, MEMSTAT.hitBy), lateAt: 0, dmgSrc: {} };
        gateStep = 0; villageSince = 0; lastPool = null; morphRank = 0;
        surviveUntil = 0; dmgLog.length = 0; D = 0; dAvg = 0; BB.length = 0; homeW = null; homeMap = ''; detourW = null; nextDetourAt = 0;
        if (runSecs() < 8) { lootReset('run'); MONS.clear(); EPROJ.clear(); FISS.clear(); GITEMS.clear(); GEMS.clear(); ZONES.clear(); } // 上一場的物件不再有效（中途換新版小幫手時不清，否則場上的怪和經驗都看不到）
      }
      { // 王戰時時間欄不是數字：用進入王戰時的秒數＋實際經過時間自己算
        const tt = $('#timeT').textContent.trim();
        if (/^\d+:\d+$/.test(tt)) run.time = tt;
        else {
          if (!run.bossAt) { run.bossAt = Date.now(); run.bossBase = secs(run.time); run.sawBoss = true; log('王戰開始（' + run.time + '）'); }
          const e = run.bossBase + Math.round((Date.now() - run.bossAt) / 1000);
          run.time = Math.floor(e / 60) + ':' + String(e % 60).padStart(2, '0');
        }
      }
      run.kills = num($('#killT').textContent);
      { // 關卡：位置欄的地圖名稱換了 = 進入下一關（上一關的首領已打倒）；出現過關倒數視窗 = 這一關的首領打倒了
        const mn = (((($('#coord') || {}).textContent || '').split('\n')[0] || '').split('　')[0] || '').trim();
        run.stages = run.stages || []; if (!run.t0) run.t0 = Date.now();
        const el = () => Math.round((Date.now() - run.t0) / 1000), L = run.stages[run.stages.length - 1];
        if (mn && !/村/.test(mn) && (!L || L.n !== mn)) {
          if (L && !L.clr) { L.clr = 1; L.ct = el(); L.ck = run.kills; }
          run.stages.push({ n: mn, t: el(), k: run.kills });
          if (run.stages.length > 1) { run.bossAt = 0; log('進入第 ' + run.stages.length + ' 關：' + mn); }
        }
        const cg = $('#clrGo'), L2 = run.stages[run.stages.length - 1];
        if (cg && visible(cg) && L2 && !L2.clr) { L2.clr = 1; L2.ct = el(); L2.ck = run.kills; log('打倒首領：' + L2.n + '（第 ' + run.stages.length + ' 關，' + Math.floor(L2.ct / 60) + ' 分，殺 ' + run.kills.toLocaleString() + '）'); }
      }
      { // 每 15 秒記一筆：[秒, 擊殺, 已選卡數, 血%, 受擊, 怪數, 遠程數, 受傷/秒, 是否保命]
        const ts = secs(run.time);
        if (lateNow() && !run.lateAt) run.lateAt = ts;
        if (ts - run.lastS >= 15) {
          run.lastS = ts; let mm = null; try { mm = readMini(); } catch (e) {}
          const h = (($('#hpT') || {}).textContent || '').split('/').map(num);
          run.tl.push([ts, run.kills, run.cards.length, h[1] ? Math.round(h[0] / h[1] * 100) : 0, hits - run.hits0, mm ? mm.total : -1, mm ? (mm.ranged || 0) : -1, Math.round(dmgRate), Math.round(D * 100), mm ? (mm.rN || 0) : -1]);
        }
      }
      const hp = (($('#hpT') || {}).textContent || '').split('/').map(num);
      if (hp[1]) run.minHp = Math.min(run.minHp, Math.round(hp[0] / hp[1] * 100));
      $$('.layer').forEach((l) => { // 記下沒看過的彈窗（例如王戰提示），供之後分析
        if (l.id === 'lvl' || l.id === 'end' || !visible(l)) return;
        const k = run.time + ' ' + l.id + ':' + l.innerText.replace(/\s+/g, ' ').slice(0, 80);
        if (run.layers.length < 8 && !run.layers.some((x) => x.includes(l.id + ':'))) run.layers.push(k);
      });
      const bi = $('#bossIntro');
      if (bi && visible(bi) && bi.className && run.layers.length < 8 && !run.layers.some((x) => x.includes('bossIntro'))) run.layers.push(run.time + ' bossIntro:' + bi.innerText.replace(/\s+/g, ' ').slice(0, 60));
      return;
    }
    // ── 在村莊 ──
    if (run) finishRun(''); // 沒看到結算畫面就回村
    if (state.dogOn || state.diceOn) return; // 賭狗／骰子中：留在村莊，停了才繼續自動進場
    if (!state.farmOn || !cfg.autoLoop) return;
    { // 點到其他玩家會跳出「密語／取消」選單，先關掉
      const pm = $('#pmenu');
      if (visible(pm)) { const x = $$('*', pm).find((e) => !e.children.length && e.textContent.trim() === '取消'); if (x) x.click(); }
    }
    if (cfg.runsTarget > 0 && runs.length - state.runsAtStart >= cfg.runsTarget) { // 場數填 0 = 無限
      state.farmOn = false; release(); render(); log(`已完成 ${cfg.runsTarget} 場，自動停止`); showStats(); return;
    }
    if (!villageSince) villageSince = now;

    if (visible($('#rlpop'))) { // 掉落物預覽 → 出發
      release();
      if (now - lastClickAt > 1200) { lastClickAt = now; const go = $('#rlGo'); if (go) go.click(); }
      return;
    }
    const w = $('#npcwin');
    if (visible(w)) {
      release();
      if (now - lastClickAt < 900) return;
      lastClickAt = now;
      if (!/選擇出發地圖/.test(($('#nwT') || {}).textContent || '')) { const x = $('#nwX'); if (x) x.click(); return; }
      const groups = [...$('#nwB').children];
      const diffs = groups[1] ? $$('div[onclick]', groups[1]) : [];
      const maps = groups[2] ? $$(':scope > div[onclick]', groups[2]) : [];
      if (gateStep === 0) { const d = diffs.find((e) => e.textContent.trim() === cfg.farmDiff) || diffs[0]; if (d) d.click(); gateStep = 1; }
      else { const mp = maps[cfg.farmMap] || maps[0]; if (mp) mp.click(); gateStep = 0; }
      return;
    }
    { // 點錯 NPC 會跳出一般對話框（#npcdlg）：按「離開」關掉
      const dlg = $('#npcdlg');
      if (visible(dlg)) { release(); if (now - lastClickAt > 700) { lastClickAt = now - 2600; const x = $$('.dgo', dlg).find((e) => e.textContent.trim() === '離開'); if (x) x.click(); } return; }
    }
    if (now - lastClickAt < 3500) { release(); return; } // 剛點過 NPC，讓角色自己走過去
    { // 名字在畫面上、而且不在邊緣：直接點名字下方的本體，遊戲會自己走過去
      const gt = SENSE.gate;
      if (gt && now - gt.t < 800 && gt.x > gt.cw * 0.08 && gt.x < gt.cw * 0.92 && gt.y > gt.ch * 0.1 && gt.y < gt.ch * 0.6) {
        release(); lastClickAt = now; villageSince = now; gateTry++;
        clickCanvasPx(gt.x + (gateTry % 3 - 1) * 6, gt.y + 34 + (gateTry % 4) * 9); // 每次稍微換個點，避開擋在前面的玩家
        return;
      }
    }
    const m = (($('#coord') || {}).textContent || '').match(/(\d+),(\d+)/); if (!m) return;
    const ex = NPC_AT[0] - (+m[1]), ey = NPC_AT[1] - (+m[2]);
    const r = (ex + ey) / 2, u = (ex - ey) / 2; // 畫面右 = (+1,+1)，畫面上 = (+1,-1)
    const keys = [];
    if (r > 0.4) keys.push('d'); else if (r < -0.4) keys.push('a');
    if (u > 0.4) keys.push('w'); else if (u < -0.4) keys.push('s');
    if (keys.length && now - villageSince < 9000) { hold(keys); return; }
    release();
    lastClickAt = now; villageSince = now;
    clickCanvas(NPC_CLICK[0], NPC_CLICK[1]);
  }

  function showStats() {
    const by = {};
    runs.forEach((r) => { const k = clsNm(r.cls) + ' ' + r.mode; (by[k] = by[k] || []).push(r); });
    const lines = Object.keys(by).map((k) => {
      const a = by[k], avg = (f) => Math.round(a.reduce((s, r) => s + f(r), 0) / a.length);
      const t = avg((r) => secs(r.time));
      return `${k}：${a.length} 場｜平均存活 ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}｜平均殺 ${avg((r) => r.kills)}｜通關 ${a.filter((r) => r.win).length}`;
    });
    log('戰績 → ' + (lines.join('　') || '尚無記錄'));
  }

  // 戰績視窗：篩選（時間／結果）＋分組（地圖／打法／日期）＋總結＋死因排行＋最近場次
  const ST = { range: 'all', res: 'all', group: 'map' };
  function openStats() {
    let box = $('#g155-statbox'); if (box) { box.remove(); return; }
    const panel = $('#g155-panel');
    box = document.createElement('div'); box.id = 'g155-statbox';
    const mobB = !!(panel && panel.classList.contains('g155-mob'));
    box.style.cssText = 'position:fixed;z-index:100000;left:' + (mobB ? 4 : Math.min(innerWidth - 40, (panel ? panel.getBoundingClientRect().right : 260) + 8)) + 'px;top:' + (mobB ? 4 : 40) + 'px;width:' + (mobB ? (innerWidth - 8) + 'px' : '34em') + ';box-sizing:border-box;max-height:' + (innerHeight - (mobB ? 8 : 80)) + 'px;overflow:auto;background:rgba(20,16,10,.97);color:#eee;border:1px solid #a8843c;border-radius:6px;padding:.6em;font:' + ((panel && panel.style.fontSize) || '13px') + '/1.5 sans-serif';
    ['mousedown', 'mouseup', 'click', 'wheel', 'keydown'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
    document.body.appendChild(box);
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const mm = (t) => Math.floor(t / 60) + ':' + String(Math.round(t % 60)).padStart(2, '0');
    const chips = (key, opts) => opts.map(([v, t]) => '<span class="g155-sc' + (ST[key] === v ? ' on' : '') + '" data-k="' + key + '" data-v="' + v + '">' + t + '</span>').join('');
    const draw = () => {
      let a = runs.filter((r) => r && (r.kills > 0 || secs(r.time) > 0));
      const today = new Date().toLocaleDateString('zh-TW');
      if (ST.range === 'today') a = a.filter((r) => String(r.at || '').indexOf(today.replace(/\//g, '/')) === 0 || new Date(String(r.at || '').replace(/\//g, '-').replace(' ', 'T')).toLocaleDateString('zh-TW') === today);
      else if (ST.range === '10') a = a.slice(-10); else if (ST.range === '30') a = a.slice(-30);
      if (ST.res === 'win') a = a.filter((r) => r.win); else if (ST.res === 'die') a = a.filter((r) => !r.win);
      const sum = (arr) => { const n = arr.length; if (!n) return null; const w = arr.filter((r) => r.win).length; return { n, w, t: arr.reduce((x, r) => x + secs(r.time), 0) / n, k: Math.round(arr.reduce((x, r) => x + (r.kills || 0), 0) / n), mx: Math.max(...arr.map((r) => r.kills || 0)), lv: (arr.reduce((x, r) => x + (r.level || 0), 0) / n).toFixed(1) }; };
      const S = sum(a);
      let h = '<div style="font-weight:bold;color:#f0c060">戰績 <span style="color:#fff;font-weight:normal">' + esc(ME.name || '') + '</span><span id="g155-st-x" style="float:right;cursor:pointer">✕ 關閉</span></div>';
      h += '<div class="g155-scb">時間 ' + chips('range', [['all', '全部'], ['today', '今天'], ['10', '最近 10 場'], ['30', '最近 30 場']]) + '</div>';
      h += '<div class="g155-scb">結果 ' + chips('res', [['all', '全部'], ['win', '✅ 過關'], ['die', '✖ 倒下']]) + '</div>';
      h += '<div class="g155-scb">分組 ' + chips('group', [['stage', '關卡'], ['map', '地圖'], ['tpl', '打法'], ['day', '日期']]) + '</div>';
      if (!S) { box.innerHTML = h + '<div style="color:#aaa;margin-top:6px">沒有符合的場次</div>'; bind(); return; }
      h += '<div class="g155-card" style="margin-top:4px;color:#ffd75e">' + S.n + ' 場｜過關 <b>' + S.w + '</b>（' + Math.round(S.w / S.n * 100) + '%）｜平均存活 <b>' + mm(S.t) + '</b>｜平均殺 <b>' + S.k.toLocaleString() + '</b>｜最高 ' + S.mx.toLocaleString() + '｜平均 Lv' + S.lv + '</div>';
      if (ST.group === 'stage') { // 每一關：到過幾次、打倒首領幾次
        const SG = {}, order = [];
        a.forEach((r) => (r.stages || []).forEach((x, i) => { const k = x.n; if (!SG[k]) { SG[k] = { n: 0, c: 0, idx: i, ts: 0, tc: 0 }; order.push(k); } const g = SG[k]; g.n++; g.idx = Math.min(g.idx, i); if (x.clr) { g.c++; if (x.ct != null) { g.ts += x.ct - x.t; g.tc++; } } }));
        const withSt = a.filter((r) => (r.stages || []).length).length;
        h += '<div class="g155-gt">依關卡' + (withSt < a.length ? '（只有 ' + withSt + ' 場有關卡紀錄；從 0.4.57 開始記）' : '') + '</div>';
        h += order.length ? '<table class="g155-umt" style="border-collapse:collapse;width:100%;font-size:.9em"><tr style="color:#cdbf9a"><td>第幾關</td><td>關卡</td><td>到達</td><td>打倒首領</td><td>平均花</td></tr>' +
          order.sort((x, y) => SG[x].idx - SG[y].idx || SG[y].n - SG[x].n).map((k) => { const g = SG[k]; return '<tr><td>' + (g.idx + 1) + '</td><td>' + esc(k) + '</td><td>' + g.n + '</td><td>' + g.c + '（' + Math.round(g.c / g.n * 100) + '%）</td><td>' + (g.tc ? mm(g.ts / g.tc) : '—') + '</td></tr>'; }).join('') + '</table>' : '<div style="color:#aaa">還沒有關卡紀錄，接下來打的場次會開始記錄</div>';
      }
      // 分組
      const keyOf = (r) => ST.group === 'map' ? (r.map ? r.map + (r.diff && r.diff !== '普通' ? '・' + r.diff : '') : '（未記錄地圖）') : ST.group === 'tpl' ? (clsNm(r.cls) + ' ' + (r.tpl || r.mode || '')) : String(r.at || '').slice(0, 10);
      const G = {}; a.forEach((r) => { (G[keyOf(r)] = G[keyOf(r)] || []).push(r); });
      const gk = Object.keys(G).sort((x, y) => ST.group === 'day' ? (x < y ? 1 : -1) : G[y].length - G[x].length);
      if (ST.group !== 'stage') h += '<div class="g155-gt">依' + ({ map: '地圖', tpl: '打法', day: '日期' })[ST.group] + '</div><table class="g155-umt" style="border-collapse:collapse;width:100%;font-size:.9em"><tr style="color:#cdbf9a"><td></td><td>場</td><td>過關</td><td>平均存活</td><td>平均殺</td><td>最高</td></tr>' +
        gk.map((k) => { const x = sum(G[k]); return '<tr><td>' + esc(k) + '</td><td>' + x.n + '</td><td>' + x.w + '（' + Math.round(x.w / x.n * 100) + '%）</td><td>' + mm(x.t) + '</td><td>' + x.k.toLocaleString() + '</td><td>' + x.mx.toLocaleString() + '</td></tr>'; }).join('') + '</table>';
      // 死因排行
      const dead = a.filter((r) => !r.win && r.cause); if (dead.length) { const C = {}; dead.forEach((r) => { C[r.cause] = (C[r.cause] || 0) + 1; }); h += '<div class="g155-gt">最常被誰打倒</div><div>' + Object.entries(C).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => esc(k) + ' <b>' + v + '</b>').join('｜') + '</div>'; }
      // 最近場次
      h += '<div class="g155-gt">最近場次</div><table class="g155-umt" style="border-collapse:collapse;width:100%;font-size:.88em"><tr style="color:#cdbf9a"><td>#</td><td>時間</td><td>地圖</td><td>關卡</td><td>存活</td><td>殺</td><td>Lv</td><td>結果</td></tr>' +
        a.slice(-15).reverse().map((r) => '<tr style="color:' + (r.win ? '#9be37a' : '#ddd') + '"><td>' + r.n + '</td><td>' + esc(String(r.at || '').slice(5, 16)) + '</td><td>' + esc(r.map || '—') + '</td><td>' + ((r.stages || []).length ? (r.stages.filter((x) => x.clr).length + '/' + r.stages.length + ' ' + esc(r.stages[r.stages.length - 1].n)) : '—') + '</td><td>' + esc(r.time) + '</td><td>' + (r.kills || 0).toLocaleString() + '</td><td>' + (r.level || '') + '</td><td>' + (r.homeClr ? '✅ 刷完 ' + r.homeClr + ' 關' : r.win ? '✅ 過關' : '✖ ' + esc(r.cause || '倒下')) + '</td></tr>').join('') + '</table>';
      box.innerHTML = h; bind();
    };
    const bind = () => {
      box.querySelector('#g155-st-x').onclick = () => box.remove();
      box.querySelectorAll('.g155-sc').forEach((e) => { e.onclick = () => { ST[e.dataset.k] = e.dataset.v; draw(); }; });
    };
    draw();
  }

  // ───────────── 面板 ─────────────
  function buildPanel() {
    const p = document.createElement('div');
    p.id = 'g155-panel';
    p.style.cssText = 'position:fixed;left:8px;top:230px;z-index:99999;width:250px;font:12px/1.5 sans-serif;color:#eee;background:rgba(20,16,10,.92);border:1px solid #a8843c;border-radius:6px;padding:6px 8px';
    p.innerHTML = `
      <div class="g155-hd">小幫手 <span id="g155-who" style="color:#fff;font-weight:normal"></span><span class="g155-tools"><span id="g155-small" title="字體縮小">A−</span><span id="g155-big" title="字體放大">A＋</span><span id="g155-min" title="縮成一行／展開">－</span></span></div>
      <div id="g155-mini" title="點一下展開完整面板"></div>
      <div id="g155-warn" style="display:none;color:#ff8a6a;font-weight:bold;margin:2px 0 4px"></div>
      <div id="g155-upd" style="display:none;background:#2c3a1c;border:1px solid #7fae3c;border-radius:4px;padding:3px 5px;margin:2px 0 4px"></div>
      <div id="g155-body">
        <div class="g155-tabs g155-top" id="g155-top"><span data-top="fight">⚔️ 戰鬥</span><span data-top="casino">🎰 賭場</span><span data-top="cfg">⚙️ 設定</span><span data-top="log">📜 紀錄</span></div>
        <div class="g155-tabs g155-sub" id="g155-sub"></div>
        <div class="g155-pg" data-pg="home">
          <button id="g155-farm" class="g155-main"></button>
          <div id="g155-st" style="color:#8cf"></div>
          <div class="g155-card" style="display:flex;align-items:flex-start;gap:4px;background:rgba(255,215,94,.06)">
            <div id="g155-loot2" style="flex:1;color:#ffd75e" title=""></div>
            <button id="g155-lootreset" style="font-size:11px;padding:0 4px" title="總累計歸零">歸零</button>
          </div>
          <div id="g155-recent" class="g155-card"></div>
          <button id="g155-stats">顯示戰績</button>
          <pre id="g155-log3" title="完整紀錄在「紀錄」分頁"></pre>
        </div>
        <div class="g155-pg" data-pg="set">
          <div class="g155-gt">進場</div>
          <div class="g155-grid">
            <label class="w"><input id="g155-loop" type="checkbox"> 自動連續進場</label>
            <span>場數</span><span><input id="g155-runs" type="number" min="0" style="width:40px"> <label><input id="g155-inf" type="checkbox"> 無限</label></span>
            <span>難度</span><select id="g155-diff"><option>普通</option><option>惡夢</option><option>地獄</option></select>
            <span>地圖</span><select id="g155-map">${[['說話之島', 9], ['古魯丁', 17], ['沙漠', 22], ['奇岩', 19], ['龍之谷', 32], ['龍之谷地監', 24], ['妖精森林', 14], ['海音', 40]].map((m, i) => `<option value="${i}">Lv${m[1]}　${m[0]}</option>`).join('')}</select>
            <label class="w"><input id="g155-next" type="checkbox"> 過關後立即前往下一張圖</label>
            <span title="打倒第幾關的首領後就回村重新進場（例如 1 = 說話之島打完黑騎士隊長就回村再來）。0 = 一路打到最後一關">只刷前幾關</span><span><input id="g155-stlim" type="number" min="0" max="9" style="width:40px"> 關（0 = 打到底）</span>
          </div>
          <div class="g155-gt">角色</div>
          <div class="g155-grid">
            <span>職業</span><span><select id="g155-cls"><option value="auto">自動判斷</option><option value="knight">騎士</option><option value="mage">法師</option><option value="elf">妖精</option><option value="royal">王族</option><option value="ill">幻術師</option></select> <span id="g155-clsnow" style="color:#8cf"></span></span>
            <span class="g155-kt" title="騎士的打法模板。攻擊：衝得快、範圍技能不拿；保命：拿紫色地獄火／地裂術、早拿回血、比較早退開（實測 5 場過關 3 場）；自訂：你自己調過的設定">模板</span><select id="g155-tpl" class="g155-kt"><option value="攻擊">攻擊</option><option value="保命">保命</option><option value="自訂">自訂</option></select>
            <span>流派</span><select id="g155-build"><option value="sustain">回血流（騎士）</option><option value="damage">攻擊流（騎士）</option><option value="mixed">綜合流（騎士）</option><option value="speed">速度輸出流（法師）</option><option value="aoe">範圍流（法師）</option><option value="rarity">只看稀有度</option></select>
            <span>走位</span><select id="g155-style"><option value="loop">定點繞圈</option><option value="melee">貼身</option><option value="kite">繞圈躲怪</option></select>
            <span>變身</span><select id="g155-morph"><option value="green">綠色以上才選</option><option value="blue">藍色以上才選</option><option value="red">紅色以上才選（紅／紫／金）</option><option value="purple">紫色以上才選（紫／金）</option><option value="gold">只選金色</option><option value="none">都不選</option></select>
            <span title="勾選的變身：看到就優先拿（不管顏色），變成其中任何一隻後這一場不再選其他變身。沒勾 = 不指定，照上面的顏色規則">指定變身</span><details id="g155-mp"><summary id="g155-mpS">不指定</summary><div id="g155-mpL" style="max-height:14em;overflow:auto;padding:2px 0"></div></details>
            <span title="經驗：先撿經驗、升級快；物品：先撿掉落物和金幣；綜合：兩者平衡（原本的做法）。必撿／優先／裝備不受影響">升級偏好</span><select id="g155-pp"><option value="exp">經驗（先撿經驗）</option><option value="item">物品（先撿物品）</option><option value="mix">綜合</option></select>
            <button id="g155-cards" class="w">卡片設定（優先順序／不選）</button>
          </div>
          <details id="g155-adv"><summary class="g155-gt">進階走位（一般不用改）</summary>
          <div class="g155-grid">
            <span>模式</span><select id="g155-mode"><option value="smart">智能（看小地圖）</option><option value="circle">固定繞圈</option></select>
            <span>感測</span><select id="g155-sense"><option value="mem">記憶體</option><option value="hook">繪圖</option><option value="pixel">顏色</option></select>
            <label class="w"><input id="g155-gems" type="checkbox"> 主動撿經驗</label>
            <span>閃避門檻</span><input id="g155-danger" type="number" style="width:50px">
            <span title="定點繞圈時，約 120px 內有這麼多怪就先往最空的方向脫離，避免被圍">脫離怪數</span><input id="g155-pack" type="number" min="2" style="width:50px">
            <span title="定點繞圈的半徑，單位是遊戲世界的像素">繞圈半徑</span><input id="g155-loopr" type="number" min="80" step="20" style="width:50px">
            <span title="射得到我的遠程怪超過這個數，就往怪群外側退，降下來再貼回去打">遠程上限</span><input id="g155-expo" type="number" min="1" style="width:50px">
            <span title="壓力值的倍率。1 = 標準，調高更保守，調低更敢貼近">謹慎程度</span><input id="g155-caution" type="number" min="0.3" max="3" step="0.1" style="width:50px">
            <span title="打字指定想優先拿的卡（卡片設定沒有排到時才用）">額外偏好卡</span><input id="g155-card" type="text" style="width:100%">
            <label class="w"><input id="g155-ab" type="checkbox"> 輪流測試各種組合</label>
          </div></details>
          <details id="g155-pick"><summary class="g155-gt">撿取分類（必撿／優先／一般／不撿）</summary>
            <div style="color:#aaa;font-size:.85em">必撿：最優先、離比較遠也會去撿；優先：排在一般物品前面；不撿：完全不理。個別物品的設定會蓋過分類。</div>
            <div class="g155-grid" id="g155-pick-cat"></div>
            <div class="g155-gt" style="margin-top:4px">個別物品</div>
            <div style="display:flex;gap:4px;margin-bottom:3px"><input id="g155-pick-name" type="text" placeholder="物品名稱" style="flex:1;min-width:0"><select id="g155-pick-new"><option value="must">必撿</option><option value="pri">優先</option><option value="norm">一般</option><option value="skip">不撿</option></select><button id="g155-pick-add">加入</button></div>
            <div id="g155-pick-list" style="max-height:16em;overflow:auto"></div>
          </details>
          <div style="color:#aaa">進入戰鬥後才會走位；在村莊不動作。</div>
        </div>
        <div class="g155-pg" data-pg="dog">
          <button id="g155-dog" class="g155-main"></button>
          <div id="g155-dogsum" style="display:none;font-weight:bold;color:#ffd75e;margin:4px 0"></div>
          <div id="g155-dogsug" class="g155-card" style="display:none;color:#ffd75e"></div>
          <div style="color:#aaa">按開始後會自動走到賽西賽狗場打開出馬表（要在村莊；正在刷怪的話會等這場打完）。自己手動下注也會記錄在下面。</div>
          <div id="g155-box-dog" class="g155-grid">
            <span>賭注</span><select id="g155-bet">${[1000, 10000, 100000, 1000000, 10000000].map((v) => `<option value="${v}">${v.toLocaleString()}</option>`).join('')}</select>
            <span>停損線</span><input id="g155-floor" type="number" style="width:90px">
            <span>最多場數</span><span><input id="g155-max" type="number" min="0" style="width:50px"> <label><input id="g155-doginf" type="checkbox"> 無限</label></span>
            <span>虧損上限</span><input id="g155-loss" type="number" min="0" style="width:80px" title="0 = 不限">
            <span>勝率加權</span><select id="g155-wp"><option value="0">0 純期望值</option><option value="0.5">0.5 推薦</option><option value="1">1</option><option value="2">2 較穩</option><option value="bonus">因素加成法</option></select>
            <span title="固定：期望值到門檻就押上面的賭注，否則押 1,000。凱利：照這場的優勢和你的資金決定押多少（上面的賭注變成上限）">下注方式</span><select id="g155-stake"><option value="fixed">固定（期望值門檻）</option><option value="kelly">凱利（照優勢與資金）</option></select>
            <span title="凱利倍數：0.5 = 半凱利（建議）；1 = 全凱利（起伏很大）；0.25 = 更保守">凱利倍數</span><input id="g155-kk" type="number" min="0.05" max="1" step="0.05" style="width:60px">
            <span>期望值門檻</span><input id="g155-ev" type="number" step="0.01" style="width:60px">
            <button id="g155-cmp" class="w">比較表（各方法成績）</button>
            <span>只看最近</span><span><input id="g155-cmpn" type="number" min="0" style="width:40px" title="0 = 全部"> 場</span>
          </div>
          <div id="g155-dogrec" class="g155-card"></div>
        </div>
        <div class="g155-pg" data-pg="dw">
          <div id="g155-dw-live" class="g155-card"></div>
          <div class="g155-gt">權重（1 = 遊戲公式，0 = 不看）</div>
          <div class="g155-grid">
            <span title="愛這種天氣的狗加分、怕的扣分（遊戲裡是 ±5%，大雨 ±8%）">天氣喜好</span><input id="g155-dw-wea" type="number" min="0" step="0.1" style="width:70px">
            <span title="精神飽滿 +2%、有點疲倦 −2%">今日狀態</span><input id="g155-dw-form" type="number" min="0" step="0.1" style="width:70px">
            <span title="每隻狗本身的實力（疾風 1.10 … 幸運星 0.90）">基本實力</span><input id="g155-dw-base" type="number" min="0" step="0.1" style="width:70px">
            <span title="出馬表「勝率」欄＝你自己這隻狗的歷史勝率。0 = 不看；1 = 歷史勝率 40% 的狗實力 ×2（以 20% 為平均）">歷史勝率</span><input id="g155-dw-hist" type="number" min="0" step="0.1" style="width:70px">
          </div>
          <div class="g155-gt">個性（實力加幾 %，0 = 不看）</div>
          <div class="g155-um">
            <label>起跑快<input id="g155-dw-styE" type="number" step="0.5"></label><label>起步慢<input id="g155-dw-styL" type="number" step="0.5"></label><label>穩定<input id="g155-dw-styS" type="number" step="0.5"></label>
          </div>
          <div style="color:#aaa;font-size:.85em;margin-top:2px">改了會立刻用在「本場建議」和自動下注。個性在遊戲公式裡只影響動畫，不影響名次。</div>
          <div style="margin-top:3px"><button id="g155-dw-bt">用實際紀錄回測</button> <button id="g155-dw-sim">模擬 2000 場</button> <button id="g155-dw-reset">恢復遊戲公式</button></div>
          <div id="g155-dogw-res" class="g155-card" style="display:none"></div>
          <div id="g155-dw-stat" class="g155-card"></div>
        </div>
        <div class="g155-pg" data-pg="dice">
          <button id="g155-dice" class="g155-main"></button>
          <div id="g155-dicesum" class="g155-card" style="color:#ffd75e"></div>
          <div class="g155-grid">
            <span>押</span><select id="g155-dc-pick"><option value="1">1 點</option><option value="2">2 點</option><option value="3">3 點</option><option value="4">4 點</option><option value="5">5 點</option><option value="6">6 點</option><option value="big">大（11～17）</option><option value="small">小（4～10）</option></select>
            <span title="每一級連續沒中幾次就跳下一級，用逗號分開。例如 3,1：1,000 連輸 3 次跳 10,000，再輸 1 次跳 100,000；中了回到起始賭注。留空 = 改用下面的累積 %">升級階梯</span><span><input id="g155-dc-lad" type="text" style="width:70px"> 次（逗號分開）</span>
            <span title="每把沒開，累積加幾 %；開了就歸零">沒開加</span><span><input id="g155-dc-step" type="number" min="0" step="5" style="width:50px"> %</span>
            <span title="沒填升級階梯時才用：累積每到這個 %，賭注升一級（1,000 → 10,000 → 100,000 …）。0 = 不升級">每累積</span><span><input id="g155-dc-lv" type="number" min="0" step="5" style="width:50px"> % 升一級</span>
            <span>起始賭注</span><select id="g155-dc-base"><option value="1000">1,000</option><option value="10000">10,000</option><option value="100000">100,000</option><option value="1000000">1,000,000</option><option value="10000000">10,000,000</option></select>
            <span>最高賭注</span><select id="g155-dc-max"><option value="1000">1,000</option><option value="10000">10,000</option><option value="100000">100,000</option><option value="1000000">1,000,000</option><option value="10000000">10,000,000</option></select>
            <span>最多幾把</span><span><input id="g155-dc-rolls" type="number" min="0" style="width:60px"> （0 = 無限）</span>
            <span>虧損上限</span><input id="g155-dc-loss" type="number" min="0" step="10000" style="width:90px" title="0 = 不限">
          </div>
          <div style="color:#aaa;font-size:.85em;margin-top:3px">按開始會自動走到骰子莊家。遊戲每把都是重新擲骰，累積多少都不會讓下一把更容易開（押單點約 42%、押大小約 49%）；越押越大只會讓輸贏起伏更大。</div>
          <div class="g155-gt">最近幾把</div>
          <div id="g155-dicerec" class="g155-card" style="font-size:.9em"></div>
        </div>
        <div class="g155-pg" data-pg="cfg">
          <details class="g155-help"><summary class="g155-gt">❓ 說明：職業流派與走位（點我展開）</summary>
            <b>騎士流派</b>（選卡的優先順序）
            <div>・<b>回血流</b>：先拿生命之泉、強健體魄、騎士的意志等回血與血量，攻擊卡穿插。最耐打，殺怪較慢。</div>
            <div>・<b>攻擊流</b>：先拿劍氣數量、劍術強化、疾風步、劍氣貫穿，清怪最快，回血只拿必要的。</div>
            <div>・<b>綜合流</b>：攻擊和回血各半。</div>
            <div>・<b>模板</b>（打法頁）：攻擊＝不拿範圍技能、謹慎 1.0；保命＝拿紫色地獄火／地裂術、早拿回血、謹慎 1.3、血量 60% 就退（實測過關率比較高）。</div>
            <b>法師流派</b>
            <div>・<b>速度輸出流</b>：究極光裂術（打王主力）、電弧（清怪主力）、疾風步、魔杖強化、流星雨等輸出優先。</div>
            <div>・<b>範圍流</b>：究極光裂術、電弧、流星雨、龍捲風等範圍攻擊為主，搭配拾取範圍。</div>
            <div>・<b>回血流</b>：生命之泉、強健體魄、護盾之泉、大地防護為主。</div>
            <div>・<b>混合流</b>：輸出與回血混搭。</div>
            <div>・<b>只看稀有度</b>（兩個職業都有）：不照流派，每次挑顏色最稀有的卡。</div>
            <div style="color:#aaa">「卡片設定」裡排好的優先順序和「不選」會蓋過流派的預設。</div>
            <b>走位</b>
            <div>・<b>定點繞圈</b>：選一個開闊的圓心繞圈打，和怪保持約 3 格，閃投射物與紅霧，順路撿經驗和物品。兩個職業都建議用這個。</div>
            <div>・<b>貼身</b>：直接貼近怪打，適合血厚的近戰，容易被包圍。</div>
            <div>・<b>繞圈躲怪</b>：邊走邊躲、離怪遠一點，安全但打得慢。</div>
            <b>進階走位</b>
            <div>・<b>模式</b>：智能＝讀怪物位置決定怎麼走；固定繞圈＝不看怪只繞圈（測試用）。</div>
            <div>・<b>感測</b>：記憶體（最準，建議）／繪圖／顏色。狀態列開頭是 [mem] 代表正常。</div>
            <div>・<b>謹慎程度</b>：調高離怪越遠、越保守；調低越敢貼近。</div>
            <div>・<b>脫離怪數</b>：身邊約 120px 內有幾隻怪就往空的地方脫離。</div>
            <div>・<b>遠程上限</b>：射得到你的遠程怪超過這個數，就先退出火力範圍。</div>
            <div>・<b>閃避門檻</b>：貼身的怪超過幾隻就閃開。</div>
          </details>
          <div class="g155-gt">遊戲畫面</div>
          <div class="g155-grid">
            <span title="遊戲世界的放大倍率。調小 = 看得到更大範圍，但字和介面大小不變（比整個網頁縮小好）。遊戲預設 1.7，範圍 1.0～3.2">鏡頭倍率</span><span style="display:flex;align-items:center;gap:4px"><input id="g155-zoom" type="range" min="1" max="3.2" step="0.1" style="flex:1;min-width:0"><b id="g155-zoomT" style="width:2.5em"></b></span>
          </div>
          <div id="g155-zoomNo" style="display:none;color:#ffb36b;font-size:.85em">這個瀏覽器不是觸控模式，遊戲把鏡頭固定在 1.7，不能調。<br><label><input id="g155-touchmode" type="checkbox"> 觸控模式（讓遊戲以為有觸控螢幕，就能調鏡頭；重新整理後生效，只有 Chrome 擴充功能版有效）</label></div>
          <div style="color:#aaa;font-size:.85em">遊戲只允許 1.0～3.2（1.0 看得最遠）。介面太大被切掉：遊戲右上「選項」→「介面大小」調小。網頁本身建議維持 100%。</div>
          <div class="g155-gt">線上更新</div>
          <div>目前版本 <b id="g155-ver"></b>　<button id="g155-updChk">檢查更新</button> <span id="g155-updMsg" style="color:#aaa"></span></div>
          <div style="color:#aaa;font-size:.85em">每 6 小時自動檢查一次。多開器和手機 App 會自己下載新版（重新整理／重新開啟後生效）；油猴會自動更新；Chrome 擴充功能要下載新版覆蓋。</div>
          <div class="g155-gt">遊戲顯示</div>
          <div id="g155-gopt" class="g155-gopt"></div>
          <div style="color:#aaa;font-size:.85em">和遊戲「選項」裡的同一組設定，改了立刻生效並存檔。</div>
          <div class="g155-gt">小幫手</div>
          <div class="g155-grid">
            <span>面板字體</span><span><button id="g155-fsm">A−</button> <b id="g155-fsT"></b> <button id="g155-fsp">A＋</button></span>
            <label class="w"><input id="g155-pfix" type="checkbox"> 面板大小不跟著網頁縮放改變</label>
            <span>面板位置</span><span><button id="g155-preset">移回左上角</button></span>
            <span>版本</span><span id="g155-ver" style="color:#8cf"></span>
          </div>
        </div>
        <div class="g155-pg" data-pg="log">
          <div id="g155-logbar" class="g155-logbar"><span data-lf="all">全部<i></i></span><span data-lf="run">🏁場次<i></i></span><span data-lf="card">🃏選卡<i></i></span><span data-lf="pick">💰撿取<i></i></span><span data-lf="dog">🐕賭狗<i></i></span><span data-lf="dice">🎲骰子<i></i></span><span data-lf="set">⚙️設定<i></i></span><span data-lf="sys">🔧系統<i></i></span></div>
          <div style="color:#888;font-size:.8em;margin-bottom:2px">「全部」不含系統訊息和撿到的每一件物品（看撿到什麼請點 💰撿取）</div>
          <div id="g155-pickbar" class="g155-logbar" style="display:none"></div>
          <div id="g155-log" style="margin:0;color:#cdb;font-size:.92em"></div>
        </div>
      </div>`;
    document.body.appendChild(p);
    const MOB = window.__g155Mobile !== undefined ? !!window.__g155Mobile : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (MOB) {
      p.classList.add('g155-mob');
      if (!cfg.mobInit) { cfg.mobInit = true; cfg.panelMini = true; cfg.panelScale = 1; cfg.panelX = 4; cfg.panelY = 4; cfg.panelFixed = false; saveCfg(); } // 第一次在手機上開：縮成一行、放左上角
    }
    // ── 面板大小不隨瀏覽器縮放改變、可拖曳、記住位置 ──
    // 用「字體大小」而不是整塊縮放來放大：原生下拉選單只會跟著字體大小變，不吃 transform
    const css = document.createElement('style');
    css.textContent = '#g155-panel select,#g155-panel input,#g155-panel button,#g155-panel pre{font:inherit}' +
      '#g155-panel input[type=checkbox]{width:1.1em;height:1.1em;vertical-align:middle}' +
      '#g155-panel button{padding:.25em .5em}#g155-panel select,#g155-panel input{padding:.1em .2em}' +
      '#g155-panel .g155-hd{font-weight:bold;color:#f0c060;user-select:none;display:flex;align-items:center;gap:4px}#g155-panel .g155-tools{margin-left:auto;display:flex}#g155-panel .g155-tools span{cursor:pointer;padding:0 .45em;color:#f0c060}#g155-panel .g155-tools span:hover{color:#fff}' +
      '#g155-mini{display:none;cursor:pointer;color:#8cf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}#g155-mini b{color:#ffd75e;font-weight:normal}' +
      '#g155-panel .g155-tabs{display:flex;gap:2px;margin:4px 0;border-bottom:1px solid #6b4a2a}#g155-panel .g155-tabs span{flex:1;text-align:center;cursor:pointer;padding:.15em 0;color:#cdbf9a;border-radius:4px 4px 0 0;user-select:none}#g155-panel .g155-tabs span.on{background:#6b4a2a;color:#fff}' +
      '#g155-panel .g155-main{width:100%;margin:2px 0;font-weight:bold}#g155-panel .g155-card{margin:4px 0;padding:4px;border:1px solid #6b4a2a;border-radius:4px}' +
      '#g155-panel .g155-gt{color:#f0c060;font-weight:bold;margin:6px 0 2px;cursor:default}#g155-panel summary.g155-gt{cursor:pointer}' +
      '#g155-panel .g155-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 6px;align-items:center}#g155-panel .g155-grid .w{grid-column:1/-1}#g155-panel .g155-grid select,#g155-panel .g155-grid input[type=text]{max-width:100%;box-sizing:border-box}#g155-panel .g155-grid>*{min-width:0}#g155-body{overflow-x:hidden}' +
      '#g155-panel .g155-um{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 6px;align-items:center}#g155-panel .g155-um label{display:flex;align-items:center;gap:3px;white-space:nowrap}#g155-panel .g155-um input{flex:1;width:3em;min-width:0;box-sizing:border-box}#g155-panel .g155-umt td{white-space:nowrap;padding:0 2px}' +
      '#g155-panel .g155-logbar{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px}#g155-panel .g155-logbar span{cursor:pointer;padding:0 5px;border:1px solid #6b4a2a;border-radius:9px;color:#cdbf9a;user-select:none;font-size:.9em}#g155-panel .g155-logbar span.on{background:#6b4a2a;color:#fff}#g155-panel .g155-logbar i{font-style:normal;color:#aaa;margin-left:2px;font-size:.85em}' +
      '#g155-statbox .g155-scb{margin:2px 0}#g155-statbox .g155-sc{display:inline-block;cursor:pointer;padding:0 6px;margin:1px 2px;border:1px solid #6b4a2a;border-radius:9px;color:#cdbf9a;user-select:none}#g155-statbox .g155-sc.on{background:#6b4a2a;color:#fff}#g155-statbox .g155-gt{color:#f0c060;font-weight:bold;margin:6px 0 2px}#g155-statbox .g155-card{padding:4px;border:1px solid #6b4a2a;border-radius:4px}#g155-statbox .g155-umt td{padding:0 3px;white-space:nowrap}' +
      '#g155-panel .g155-sub{border-bottom:none;margin-top:-2px}#g155-panel .g155-sub span{font-size:.9em;border-radius:0 0 4px 4px}#g155-panel .g155-sub span.on{background:#4a3520}#g155-panel .g155-top span{font-weight:bold}' +
      '#g155-panel .g155-gopt{display:grid;grid-template-columns:1fr 1fr;gap:2px 6px}' +
      '#g155-panel .g155-help div{margin:1px 0 1px .5em;font-size:.92em}#g155-panel .g155-help b{color:#ffd75e}' +
      '#g155-panel.g155-mob button,#g155-panel.g155-mob select,#g155-panel.g155-mob input[type=number],#g155-panel.g155-mob input[type=text]{min-height:2.1em}#g155-panel.g155-mob .g155-tabs span{padding:.45em 0}#g155-panel.g155-mob .g155-tools span{padding:.2em .7em}#g155-panel.g155-mob input[type=checkbox]{width:1.4em;height:1.4em}#g155-panel.g155-mob #g155-mini{padding:.3em 0}' +
      '#g155-log3{white-space:pre-wrap;margin:4px 0 0;color:#a99;font-size:.9em;max-height:4.6em;overflow:hidden}';
    document.head.appendChild(css);
    // 內嵌的 px 寬高改成 em，才會跟著字體一起放大
    [p].concat([].slice.call(p.querySelectorAll('[style]'))).forEach((el) => {
      ['width', 'maxHeight', 'padding', 'margin'].forEach((k2) => { const v = el.style[k2]; if (v && /^[\d.]+px$/.test(v)) el.style[k2] = (parseFloat(v) / 12).toFixed(3) + 'em'; });
    });
    p.style.maxHeight = 'none';
    const body0 = p.querySelector('#g155-body'); if (body0) { body0.style.overflowY = 'auto'; body0.style.overflowX = 'hidden'; }
    const fit = () => {
      // 瀏覽器縮放倍率 ≈ 視窗外寬 ÷ 內寬；用反向縮放抵銷，讓面板維持原本大小
      let z = window.outerWidth && window.innerWidth ? window.outerWidth / window.innerWidth : 1;
      if (!(z > 0.25 && z < 5)) z = 1;
      if (z > 1.05 && (window.devicePixelRatio || 1) < z * 0.9) z = 1; // 真的放大時裝置像素比也會跟著變大；沒有 = 外框不是這個頁面的（多開器分格）
      const k = (cfg.panelFixed && !MOB ? 1 / z : 1) * (cfg.panelScale || 1);
      p.style.maxWidth = MOB ? (innerWidth - 8) + 'px' : ''; // 手機：不超出螢幕寬度
      p.style.transform = ''; p.style.fontSize = (12 * k).toFixed(1) + 'px';
      // 不讓面板跑出畫面外；內容超過畫面高度時在面板內捲動
      const x = Math.min(Math.max(0, cfg.panelX), Math.max(0, innerWidth - 60 * k));
      let y = Math.min(Math.max(0, cfg.panelY), Math.max(0, innerHeight - 40 * k));
      if (MOB && cfg.panelMini === false) y = Math.min(y, Math.max(4, Math.round(innerHeight * 0.4))); // 手機展開時：最多從四成高度開始，下面至少留六成給面板
      p.style.left = x + 'px'; p.style.top = y + 'px';
      if (body0) body0.style.maxHeight = Math.max(100, Math.min(innerHeight - y - 12 - 34 * k, MOB ? innerHeight * 0.6 : 560 * k)) + 'px'; // 手機：最多佔六成高度
    };
    window.addEventListener('resize', fit, { signal: SIG }); fit();
    // 收合／展開，狀態記在設定裡
    const applyFold = () => {
      p.querySelectorAll('.g155-sh').forEach((h) => {
        const k = h.dataset.sec, folded = !!(cfg.fold || {})[k];
        const box = p.querySelector('#g155-box-' + k); if (box) box.style.display = folded ? 'none' : '';
        h.querySelector('.g155-arrow').textContent = folded ? '▸' : '▾';
        h.title = folded ? '點一下展開設定' : '點一下收合設定';
      });
    };
    p.querySelector('#g155-big').addEventListener('click', () => { cfg.panelScale = Math.min(2.5, (cfg.panelScale || 1) + 0.1); saveCfg(); fit(); });
    p.querySelector('#g155-small').addEventListener('click', () => { cfg.panelScale = Math.max(0.6, (cfg.panelScale || 1) - 0.1); saveCfg(); fit(); });
    const head = p.firstElementChild; head.style.cursor = 'move'; head.title = '按住拖曳移動面板';
    head.addEventListener('touchstart', (e) => {
      if (/^g155-(min|big|small)$/.test(e.target.id) || !e.touches[0]) return;
      const t0 = e.touches[0], ox = t0.clientX - cfg.panelX, oy = t0.clientY - cfg.panelY, sx = t0.clientX, sy = t0.clientY; let moved = false;
      const mv = (ev) => { const t = ev.touches[0]; if (!t) return; if (Math.abs(t.clientX - sx) + Math.abs(t.clientY - sy) > 10) moved = true; if (!moved) return; cfg.panelX = t.clientX - ox; cfg.panelY = t.clientY - oy; fit(); ev.preventDefault(); };
      const up = (ev) => { head.removeEventListener('touchmove', mv); head.removeEventListener('touchend', up); saveCfg(); if (!moved && MOB) { const m = $('#g155-min'); if (m) m.click(); if (ev.cancelable) ev.preventDefault(); } }; // 點一下（沒拖曳）＝縮小／展開
      head.addEventListener('touchmove', mv, { passive: false }); head.addEventListener('touchend', up);
    }, { passive: true });
    head.addEventListener('mousedown', (e) => {
      if (/^g155-(min|big|small)$/.test(e.target.id) || e.target.closest('#g155-mini')) return;
      const ox = e.clientX - cfg.panelX, oy = e.clientY - cfg.panelY;
      const mv = (ev) => { cfg.panelX = ev.clientX - ox; cfg.panelY = ev.clientY - oy; fit(); };
      const up = () => { document.removeEventListener('mousemove', mv, true); document.removeEventListener('mouseup', up, true); saveCfg(); };
      document.addEventListener('mousemove', mv, true); document.addEventListener('mouseup', up, true);
      e.preventDefault(); e.stopPropagation();
    });
    // 面板上的滑鼠操作不要傳給遊戲
    ['mousedown', 'mouseup', 'click', 'wheel', 'pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach((t) => p.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    // 面板內打字不要觸發遊戲快捷鍵
    p.addEventListener('keydown', (e) => e.stopPropagation(), true);

    $('#g155-bet').value = cfg.dogBet; $('#g155-floor').value = cfg.dogStopBelow;
    $('#g155-max').value = cfg.dogMaxRaces; $('#g155-loss').value = cfg.dogMaxLoss;
    const bind = (id, k) => $(id).addEventListener('change', (e) => { cfg[k] = num(e.target.value); saveCfg(); });
    $('#g155-mode').value = cfg.farmMode; $('#g155-gems').checked = !!cfg.farmGems; $('#g155-danger').value = cfg.farmDanger;
    $('#g155-mode').addEventListener('change', (e) => { cfg.farmMode = e.target.value; saveCfg(); });
    $('#g155-sense').value = cfg.farmSense;
    $('#g155-sense').addEventListener('change', (e) => { cfg.farmSense = e.target.value; saveCfg(); });
    $('#g155-gems').addEventListener('change', (e) => { cfg.farmGems = e.target.checked; saveCfg(); });
    bind('#g155-danger', 'farmDanger');
    $('#g155-stlim').value = cfg.stageLimit || 0;
    $('#g155-stlim').addEventListener('change', (e) => { cfg.stageLimit = Math.max(0, Math.min(9, num(e.target.value))); e.target.value = cfg.stageLimit; saveCfg(); log('只刷前幾關：' + (cfg.stageLimit ? cfg.stageLimit + ' 關，打完就回村重刷' : '0（一路打到底）')); });
    $('#g155-next').checked = !!cfg.autoNext;
    $('#g155-next').addEventListener('change', (e) => { cfg.autoNext = e.target.checked; saveCfg(); });
    $('#g155-loop').checked = !!cfg.autoLoop; $('#g155-ab').checked = !!cfg.abTest;
    $('#g155-runs').value = cfg.runsTarget; $('#g155-diff').value = cfg.farmDiff; $('#g155-map').value = cfg.farmMap;
    $('#g155-loop').addEventListener('change', (e) => { cfg.autoLoop = e.target.checked; saveCfg(); });
    $('#g155-ab').addEventListener('change', (e) => { cfg.abTest = e.target.checked; saveCfg(); });
    $('#g155-diff').addEventListener('change', (e) => { cfg.farmDiff = e.target.value; saveCfg(); });
    bind('#g155-runs', 'runsTarget'); bind('#g155-map', 'farmMap');
    // 「無限」= 場數 0；取消勾選時回到 15 場
    $('#g155-inf').checked = cfg.runsTarget === 0; $('#g155-runs').disabled = cfg.runsTarget === 0;
    $('#g155-inf').addEventListener('change', (e) => {
      cfg.runsTarget = e.target.checked ? 0 : 15; saveCfg();
      $('#g155-runs').value = cfg.runsTarget; $('#g155-runs').disabled = e.target.checked;
    });
    $('#g155-stats').addEventListener('click', openStats);
    $('#g155-lootreset').addEventListener('click', () => { if (!confirm('總累計要歸零嗎？')) return; lootReset('total'); });
    lootEl = $('#g155-loot2'); // 新名字：舊版小幫手的計時器找的是 #g155-loot，找不到就不會再把舊數字畫上來
    lootShow(); { const iv = setInterval(() => { if (!lootEl || !lootEl.isConnected) { clearInterval(iv); return; } lootShow(); }, 3000); } // 面板被新版取代後就停掉
    $('#g155-cmp').addEventListener('click', showCompare);
    $('#g155-cmpn').value = 10;
    $('#g155-cards').addEventListener('click', openCardEditor);
    // 職業／流派／走位：改動會記到該職業的設定裡
    const keep = () => { cfg.prof[cls()] = { build: cfg.build, style: cfg.style }; saveCfg(); };
    $('#g155-cls').addEventListener('change', (e) => { cfg.cls = e.target.value; const p = cfg.prof[cls()]; if (p) { cfg.build = p.build; cfg.style = p.style; } saveCfg(); syncPanel(); });
    $('#g155-build').addEventListener('change', (e) => { cfg.build = e.target.value; keep(); });
    $('#g155-style').addEventListener('change', (e) => { cfg.style = e.target.value; keep(); });
    $('#g155-loopr').value = cfg.loopR; bind('#g155-loopr', 'loopR');
    $('#g155-pack').value = cfg.loopPack; bind('#g155-pack', 'loopPack');
    $('#g155-expo').value = cfg.expoMax; bind('#g155-expo', 'expoMax');
    $('#g155-caution').value = cfg.caution;
    $('#g155-caution').addEventListener('change', (e) => { cfg.caution = parseFloat(e.target.value) || 1; saveCfg(); });
    $('#g155-morph').value = cfg.morphMin;
    $('#g155-morph').addEventListener('change', (e) => { cfg.morphMin = e.target.value; saveCfg(); });
    { // 指定變身清單：只列目前職業會出現的，依顏色分組；遊戲改版新增、清單裡沒有的變身會列在「遊戲中看過的其他變身」
      if (cfg.morphLock) { cfg.morphPick = Array.from(new Set((cfg.morphPick || []).concat([cfg.morphLock]))); cfg.morphLock = ''; saveCfg(); }
      const det = $('#g155-mp'), L = $('#g155-mpL'), S = $('#g155-mpS'), esc2 = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
      const sum = () => { const a = morphPicks(); S.textContent = a.length ? '已勾 ' + a.length + '：' + a.join('、') : '不指定'; };
      const draw = () => {
        const c = cls(), sel = new Set(morphPicks()), known = new Set();
        let h = MORPH_LIST.map(([t, tn, arr]) => { const ok = arr.filter((x) => morphOk(x[1], c)); ok.forEach((x) => known.add(x[0])); return ok.length ? '<div style="color:#cdbf9a;margin-top:2px">' + tn + '</div>' + ok.map((x) => '<label style="display:inline-block;margin-right:.8em"><input type="checkbox" value="' + esc2(x[0]) + '"' + (sel.has(x[0]) ? ' checked' : '') + '> ' + esc2(x[0]) + '</label>').join('') : ''; }).join('');
        MORPH_LIST.forEach(([, , arr]) => arr.forEach((x) => known.add(x[0])));
        const other = morphSeen().filter((n) => !known.has(n)).concat([...sel].filter((n) => !known.has(n) && !morphSeen().includes(n)));
        if (other.length) h += '<div style="color:#cdbf9a;margin-top:2px">遊戲中看過的其他變身</div>' + other.map((n) => '<label style="display:inline-block;margin-right:.8em"><input type="checkbox" value="' + esc2(n) + '"' + (sel.has(n) ? ' checked' : '') + '> ' + esc2(n) + '</label>').join('');
        h += '<div style="color:#aaa;font-size:.85em">看到勾選的就優先拿；變成其中一隻後不再選其他變身。<a href="#" id="g155-mpClr" style="color:#8cf">全部取消</a></div>';
        L.innerHTML = h;
      };
      L.addEventListener('change', () => { cfg.morphPick = [...L.querySelectorAll('input:checked')].map((e) => e.value); cfg.morphLock = ''; saveCfg(); sum(); log(cfg.morphPick.length ? '指定變身：' + cfg.morphPick.join('、') : '指定變身：不指定'); });
      L.addEventListener('click', (e) => { if (e.target && e.target.id === 'g155-mpClr') { e.preventDefault(); cfg.morphPick = []; cfg.morphLock = ''; saveCfg(); draw(); sum(); log('指定變身：不指定'); } });
      det.addEventListener('toggle', () => { if (det.open) draw(); });
      sum(); }
    { const p = cfg.prof[cls()]; if (p && !cfg.abTest) { cfg.build = p.build; cfg.style = p.style; } }
    syncPanel();
    { const ts = $('#g155-tpl'); const sync = () => { ts.value = KN_TPL[cfg.tpl] ? cfg.tpl : '自訂'; p.querySelectorAll('.g155-kt').forEach((e) => { e.style.display = cls() === 'knight' ? '' : 'none'; }); }; sync(); const ivT = setInterval(() => { if (!p.isConnected || SIG.aborted) { clearInterval(ivT); return; } if (document.activeElement !== ts) sync(); }, 3000);
      ts.addEventListener('change', () => { if (!applyTpl(ts.value)) { log('還沒有存過自訂設定'); } sync(); }); }
    { const zi = $('#g155-zoom'), zt = $('#g155-zoomT'); const cur = () => { const z = +localStorage.getItem('l1s_zoom'); return z >= 1 && z <= 3.2 ? z : 1.7; };
      const can = typeof window.__zoomLoad === 'function'; // 遊戲只在觸控模式提供縮放
      zi.disabled = !can; $('#g155-zoomNo').style.display = can ? 'none' : '';
      const tm = $('#g155-touchmode'); try { tm.checked = localStorage.getItem('g155_touchmode') === '1'; } catch (e) {}
      tm.addEventListener('change', () => { try { localStorage.setItem('g155_touchmode', tm.checked ? '1' : '0'); } catch (e) {} log('觸控模式：' + (tm.checked ? '開（重新整理遊戲分頁後生效）' : '關（重新整理後生效）')); });
      const show = () => { const z = cur(); zi.value = z; zt.textContent = can ? z.toFixed(1) : '1.7'; }; show();
      zi.addEventListener('input', () => { zt.textContent = (+zi.value).toFixed(1); });
      zi.addEventListener('change', () => { if (!can) return; const z = Math.max(1, Math.min(3.2, +zi.value)); try { localStorage.setItem('l1s_zoom', String(z)); } catch (e) {} if (typeof window.__zoomLoad === 'function') window.__zoomLoad(); show(); log('鏡頭倍率：' + z.toFixed(1)); }); }
    { // 遊戲顯示（window.OPT＝遊戲的選項；改完寫回 l1s_opt）
      const GO = [['names', '顯示名字'], ['hpbars', '顯示血條'], ['dmg', '顯示傷害數字'], ['miss', '顯示 MISS'], ['lootpop', '掉寶提示'], ['buffnote', '增益提示']];
      const box = $('#g155-gopt');
      const draw = () => { const O = window.OPT || {}; box.innerHTML = GO.map(([k, t]) => '<label><input type="checkbox" data-o="' + k + '"' + (O[k] ? ' checked' : '') + '> ' + t + '</label>').join(''); box.querySelectorAll('input').forEach((e) => e.addEventListener('change', () => { if (!window.OPT) return; window.OPT[e.dataset.o] = e.checked; try { localStorage.setItem('l1s_opt', JSON.stringify(window.OPT)); } catch (er) {} log('遊戲設定：' + GO.find((x) => x[0] === e.dataset.o)[1] + ' → ' + (e.checked ? '開' : '關')); })); };
      draw(); $('#g155-top').addEventListener('click', () => { if (cfg.panelTab === 'cfg') draw(); });
      const fsT = () => { $('#g155-fsT').textContent = Math.round((cfg.panelScale || 1) * 100) + '%'; }; fsT();
      $("#g155-fsm").addEventListener('click', () => { cfg.panelScale = Math.max(0.6, Math.round(((cfg.panelScale || 1) - 0.1) * 10) / 10); saveCfg(); fit(); fsT(); });
      $("#g155-fsp").addEventListener('click', () => { cfg.panelScale = Math.min(2.5, Math.round(((cfg.panelScale || 1) + 0.1) * 10) / 10); saveCfg(); fit(); fsT(); });
      $('#g155-pfix').checked = !!cfg.panelFixed; $('#g155-pfix').addEventListener('change', (e) => { cfg.panelFixed = e.target.checked; saveCfg(); fit(); });
      $('#g155-preset').addEventListener('click', () => { cfg.panelX = 8; cfg.panelY = 8; saveCfg(); fit(); });
      $('#g155-ver').textContent = window.__g155loaded || '';
    }
    $('#g155-pp').value = cfg.pickPref || 'mix';
    $('#g155-pp').addEventListener('change', (e) => { cfg.pickPref = e.target.value; saveCfg(); log('升級偏好：' + ({ exp: '經驗（先撿經驗）', item: '物品（先撿物品）', mix: '綜合' })[cfg.pickPref]); });
    $('#g155-card').value = cfg.cardPrefer;
    $('#g155-card').addEventListener('change', (e) => { cfg.cardPrefer = e.target.value; saveCfg(); });
    $('#g155-wp').value = String(cfg.dogWP);
    $('#g155-wp').addEventListener('change', (e) => { cfg.dogWP = e.target.value === 'bonus' ? 'bonus' : (parseFloat(e.target.value) || 0); saveCfg(); });
    $('#g155-doginf').checked = cfg.dogMaxRaces === 0; $('#g155-max').disabled = cfg.dogMaxRaces === 0;
    $('#g155-doginf').addEventListener('change', (e) => { cfg.dogMaxRaces = e.target.checked ? 0 : 20; saveCfg(); $('#g155-max').value = cfg.dogMaxRaces; $('#g155-max').disabled = e.target.checked; });
    $('#g155-stake').value = cfg.dogStake || 'fixed'; $('#g155-kk').value = cfg.dogKellyK || 0.5;
    $('#g155-stake').addEventListener('change', (e) => { cfg.dogStake = e.target.value; saveCfg(); if (dogSnap) dogSnap.key = ''; log('賭狗下注方式：' + (cfg.dogStake === 'kelly' ? '凱利 ×' + cfg.dogKellyK + '（賭注 ' + (+cfg.dogBet).toLocaleString() + ' 當上限）' : '固定（期望值門檻）')); });
    $('#g155-kk').addEventListener('change', (e) => { const v = parseFloat(e.target.value); cfg.dogKellyK = v > 0 && v <= 1 ? v : 0.5; e.target.value = cfg.dogKellyK; saveCfg(); });
    $('#g155-ev').value = cfg.dogMinEV;
    $('#g155-ev').addEventListener('change', (e) => { cfg.dogMinEV = parseFloat(e.target.value) || 1.08; saveCfg(); });
    bind('#g155-bet', 'dogBet'); bind('#g155-floor', 'dogStopBelow'); bind('#g155-max', 'dogMaxRaces'); bind('#g155-loss', 'dogMaxLoss');

    $('#g155-dog').addEventListener('click', () => {
      state.dogOn = !state.dogOn;
      if (state.dogOn && state.diceOn) stopDice('改開自動賭狗');
      if (state.dogOn) { state.dogRaces = 0; state.dogDone = 0; state.dogWins = 0; state.dogStartGold = gold(); state.dogPhase = ''; state.dogPend = null; dogGoSince = 0; dogGoAt = 0; log('賭狗開始' + (dogWindow() ? '' : (inBattle() ? '：目前在戰鬥中，回村莊後會自動前往賽狗場' : '：自動前往賽狗場'))); }
      else { log('賭狗已手動停止'); }
      dogSummary();
      render();
    });
    $('#g155-farm').addEventListener('click', () => {
      state.farmOn = !state.farmOn; if (!state.farmOn) release();
      if (state.farmOn) { state.runsAtStart = runs.length; ['w', 'a', 's', 'd'].forEach((k) => key('keyup', k)); lootReset('total'); } else lootShow();
      log(state.farmOn ? '自動走位開啟' : '自動走位關閉'); render();
    });
    // 分頁切換（記住上次看的分頁）
    // 上層：戰鬥（狀態／打法）、賭場（賭狗／權重／骰子）、設定、紀錄；每個上層記住上次看的子分頁
    const GROUPS = { fight: [['home', '狀態'], ['set', '打法']], casino: [['dog', '賭狗'], ['dw', '權重'], ['dice', '骰子']], cfg: [['cfg', '設定']], log: [['log', '紀錄']] };
    const groupOf = (t) => Object.keys(GROUPS).find((g) => GROUPS[g].some((x) => x[0] === t)) || 'fight';
    const showTab = (t) => {
      if (!GROUPS[groupOf(t)].some((x) => x[0] === t)) t = 'home';
      const g = groupOf(t); cfg.panelTab = t; cfg.subOf = Object.assign({}, cfg.subOf, { [g]: t });
      p.style.width = t === 'dw' ? '27em' : '23em';
      p.querySelectorAll('#g155-top span').forEach((e) => e.classList.toggle('on', e.dataset.top === g));
      const sub = $('#g155-sub'), items = GROUPS[g];
      sub.style.display = items.length > 1 ? '' : 'none';
      sub.innerHTML = items.map((x) => '<span data-tab="' + x[0] + '"' + (x[0] === t ? ' class="on"' : '') + '>' + x[1] + '</span>').join('');
      sub.querySelectorAll('span').forEach((e) => e.addEventListener('click', () => { showTab(e.dataset.tab); saveCfg(); fit(); }));
      p.querySelectorAll('.g155-pg').forEach((e) => { e.style.display = e.dataset.pg === t ? '' : 'none'; });
    };
    p.querySelectorAll('#g155-top span').forEach((e) => e.addEventListener('click', () => { const g = e.dataset.top; showTab((cfg.subOf || {})[g] || GROUPS[g][0][0]); saveCfg(); fit(); }));
    showTab(cfg.panelTab || 'home');
    { const adv = $('#g155-adv'); adv.open = !!cfg.advOpen; adv.addEventListener('toggle', () => { cfg.advOpen = adv.open; saveCfg(); }); }
    // 迷你狀態條：縮起來時只留一行
    const applyMini = () => { const m = cfg.panelMini !== false; $('#g155-body').style.display = m ? 'none' : ''; $('#g155-mini').style.display = m ? 'block' : 'none'; $('#g155-min').textContent = m ? '＋' : '－'; fit(); miniShow(); };
    $('#g155-min').addEventListener('click', () => { cfg.panelMini = cfg.panelMini === false; saveCfg(); applyMini(); });
    $('#g155-mini').addEventListener('click', () => { cfg.panelMini = false; saveCfg(); applyMini(); });
    applyMini();
    { const iv = setInterval(() => { if (!p.isConnected) { clearInterval(iv); return; } miniShow(); recentShow(); if (cfg.panelTab === 'dice') diceShow(); }, 1000); }
    { // 權重微調
      const W0 = dogW(), ids = {}; Object.keys(DW_DEF).forEach((k) => { ids[k] = '#g155-dw-' + k; });
      const signed = { styE: 1, styL: 1, styS: 1 }; // 個性可以填負數
      Object.keys(ids).forEach((k) => { $(ids[k]).value = W0[k]; $(ids[k]).addEventListener('change', (e) => { const v = parseFloat(e.target.value); cfg.dogW = Object.assign(dogW(), { [k]: isFinite(v) && (signed[k] || v >= 0) ? v : DW_DEF[k] }); saveCfg(); e.target.value = cfg.dogW[k]; dwRecalc(); if (dogSnap) dogSnap.key = ''; }); });
      const wtxt = (W) => '天氣 ' + W.wea + '｜狀態 ' + W.form + '｜實力 ' + W.base + (W.hist ? '｜歷史 ' + W.hist : '') + (W.styE || W.styL || W.styS ? '｜個性 ' + W.styE + '/' + W.styL + '/' + W.styS : '');
      const fmt = (x) => (x >= 0 ? '+' : '') + Math.round(x).toLocaleString();
      $('#g155-dw-reset').addEventListener('click', () => { if (!confirm('權重要恢復成遊戲公式嗎？（你現在的數字會被覆蓋）')) return; cfg.dogW = Object.assign({}, DW_DEF); saveCfg(); Object.keys(ids).forEach((k) => { $(ids[k]).value = DW_DEF[k]; }); dwRecalc(); if (dogSnap) dogSnap.key = ''; dogWShow('已恢復成遊戲公式'); });
      $('#g155-dw-bt').addEventListener('click', () => {
        const W = dogW(), r = dogBacktest(W);
        if (!r.mine.n) { dogWShow('還沒有可以回測的紀錄（要有記到每隻狗資料的場次，手動或自動下注都會記）'); return; }
        const row = (t, x) => t + '：押中 <b>' + x.hit + '/' + x.n + '</b>（' + Math.round(x.hit / x.n * 100) + '%）｜每場押 1,000 共 <b>' + fmt(x.net) + '</b>｜冠軍的平均預測勝率 ' + (x.wp * 100).toFixed(1) + '%';
        dogWShow('<b>回測最近 ' + r.mine.n + ' 場實際結果</b><br>' + row('自訂（' + wtxt(W) + '）', r.mine) + '<br>' + row('遊戲公式（全部 1）', r.base) + (r.mine.n < 100 ? '<br><span style="color:#aaa">場數還少，運氣影響很大，參考就好；模擬比較準。</span>' : ''));
      });
      $('#g155-dw-sim').addEventListener('click', () => {
        dogWShow('模擬中…（約幾秒，畫面可能頓一下）');
        setTimeout(() => {
          const W = dogW(), N = 2000, r = dogSim(W, N);
          const row = (t, x) => t + '：押中 ' + Math.round(x.hit / N * 100) + '%｜回收率 <b>' + (100 + x.net / N / 10).toFixed(1) + '%</b>｜每押 1,000 平均 ' + fmt(x.net / N);
          dogWShow('<b>模擬 ' + N + ' 場（照遊戲真實公式開獎）</b><br>' + row('自訂（' + wtxt(W) + '）', r.mine) + '<br>' + row('遊戲公式（全部 1）', r.base) + '<br><span style="color:#aaa">回收率 100% 以上 = 長期賺；兩者差 2～3% 以內可能只是運氣。模擬不含歷史勝率。</span>');
        }, 50);
      });
    }
    { // 撿取分類
      const sel = (v, attr) => '<select ' + attr + '>' + Object.keys(PICK_NM).map((k) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + PICK_NM[k] + '</option>').join('') + '</select>';
      const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      const catBox = $('#g155-pick-cat');
      catBox.innerHTML = Object.keys(PICK_KIND_NM).map((k) => '<span>' + PICK_KIND_NM[k] + '</span>' + sel((cfg.pickCat || {})[k] || 'norm', 'data-cat="' + k + '"')).join('');
      catBox.querySelectorAll('select').forEach((e) => e.addEventListener('change', () => { cfg.pickCat = Object.assign({}, cfg.pickCat, { [e.dataset.cat]: e.value }); saveCfg(); log('撿取分類：' + PICK_KIND_NM[e.dataset.cat] + ' → ' + PICK_NM[e.value]); }));
      const drawList = () => {
        const seen = {}; try { const d = lootData(); [d.total.items, d.run.items].forEach((o) => Object.keys(o || {}).forEach((n) => { seen[n] = Math.max(seen[n] || 0, o[n]); })); } catch (e) {}
        GITEMS.forEach((it) => { if (it.name && !(it.name in seen)) seen[it.name] = 0; });
        Object.keys(cfg.pickRules || {}).forEach((n) => { if (!(n in seen)) seen[n] = 0; });
        delete seen['金幣'];
        const names = Object.keys(seen).sort((a, b) => ((cfg.pickRules || {})[b] ? 1 : 0) - ((cfg.pickRules || {})[a] ? 1 : 0) || seen[b] - seen[a]);
        const box = $('#g155-pick-list');
        box.innerHTML = names.length ? names.map((n) => { const r = (cfg.pickRules || {})[n]; return '<div style="display:flex;align-items:center;gap:4px;' + (r ? 'color:#ffd75e' : '') + '"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(n) + '">' + esc(n) + (seen[n] ? ' <span style="color:#aaa">×' + seen[n] + '</span>' : '') + '</span>' + '<select data-n="' + esc(n) + '"><option value="">（照分類）</option>' + Object.keys(PICK_NM).map((k) => '<option value="' + k + '"' + (k === r ? ' selected' : '') + '>' + PICK_NM[k] + '</option>').join('') + '</select></div>'; }).join('') : '<span style="color:#aaa">還沒撿過東西；開始刷怪後撿到的物品會出現在這裡</span>';
        box.querySelectorAll('select').forEach((e) => e.addEventListener('change', () => { const n = e.dataset.n; cfg.pickRules = Object.assign({}, cfg.pickRules); if (e.value) cfg.pickRules[n] = e.value; else delete cfg.pickRules[n]; saveCfg(); log('撿取：' + n + ' → ' + (e.value ? PICK_NM[e.value] : '照分類')); drawList(); }));
      };
      $('#g155-pick-add').addEventListener('click', () => { const n = $('#g155-pick-name').value.trim(); if (!n) return; cfg.pickRules = Object.assign({}, cfg.pickRules, { [n]: $('#g155-pick-new').value }); saveCfg(); $('#g155-pick-name').value = ''; log('撿取：' + n + ' → ' + PICK_NM[cfg.pickRules[n]]); drawList(); });
      const det = $('#g155-pick'); det.addEventListener('toggle', () => { if (det.open) drawList(); });
      const ivL = setInterval(() => { if (!p.isConnected || SIG.aborted) { clearInterval(ivL); return; } if (det.open && cfg.panelTab === 'set' && !det.contains(document.activeElement)) drawList(); }, 5000);
      drawList();
    }
    { // 骰子分頁
      const q = (id) => $('#g155-dc-' + id);
      q('pick').value = String(cfg.dicePick); q('step').value = cfg.diceStep; q('lv').value = cfg.diceLvEvery; q('base').value = String(cfg.diceBase); q('max').value = String(cfg.diceMaxBet); q('rolls').value = cfg.diceMaxRolls; q('loss').value = cfg.diceMaxLoss;
      q('lad').value = cfg.diceLadder || '';
      q('lad').addEventListener('change', (e) => { cfg.diceLadder = e.target.value.trim(); saveCfg(); diceShow(); log('骰子升級階梯：' + (diceLadder().join(',') || '（改用累積 %）')); });
      q('pick').addEventListener('change', (e) => { cfg.dicePick = e.target.value; saveCfg(); diceShow(); });
      [['step', 'diceStep'], ['lv', 'diceLvEvery'], ['base', 'diceBase'], ['max', 'diceMaxBet'], ['rolls', 'diceMaxRolls'], ['loss', 'diceMaxLoss']].forEach(([id, k]) => q(id).addEventListener('change', (e) => { cfg[k] = Math.max(0, num(e.target.value)); saveCfg(); diceShow(); }));
      $('#g155-dice').addEventListener('click', () => {
          state.diceOn = !state.diceOn;
        if (state.diceOn) {
          if (state.dogOn) { state.dogOn = false; log('賭狗已停止（改開自動骰子）'); }
          Object.assign(state, { diceCnt: 0, diceMiss: 0, diceN: 0, diceHits: 0, diceStartGold: gold(), dicePhase: '', diceHist: [] }); diceAt = 0;
          log('自動骰子開始：押 ' + (cfg.dicePick === 'big' ? '大' : cfg.dicePick === 'small' ? '小' : cfg.dicePick + ' 點') + '，起始 ' + (+cfg.diceBase).toLocaleString() + '，最高 ' + (+cfg.diceMaxBet).toLocaleString() + '，虧損上限 ' + (+cfg.diceMaxLoss).toLocaleString());
        } else { state.dicePhase = ''; log('自動骰子已手動停止'); }
        diceShow(); render();
      });
      diceShow();
    }
    $('#g155-logbar').querySelectorAll('[data-lf]').forEach((e) => e.addEventListener('click', () => { logFilter = e.dataset.lf; logRender(); }));
    logRender();
    recentShow(); lootShow(); dogRecShow(); dwLive();
    render();
  }

  function miniShow() {
    const el = $('#g155-mini'); if (!el || el.style.display === 'none') return;
    const st = (($('#g155-st') || {}).textContent || '');
    const why = st.replace(/^\[[^\]]*\]\s*/, '').split('｜')[0];
    const mm = st.match(/｜怪 (\d+)/), hp = st.match(/｜血 (\d+%)/);
    let gold = ''; try { const d = lootData(); gold = '本場 +' + d.run.gold.toLocaleString(); } catch (e) {}
    const on = state.farmOn ? '● 走位中' : '○ 走位關閉';
    el.innerHTML = on + (state.farmOn && why ? '｜' + why.slice(0, 10) : '') + (mm ? '｜怪 ' + mm[1] : '') + (hp ? '｜血 ' + hp[1] : '') + (gold ? '｜<b>' + gold + '</b>' : '') + (state.dogOn ? '｜賭狗中' : '') + (state.diceOn ? '｜骰子 第' + state.diceN + '把 累積' + state.diceCnt + '%' : '');
    el.title = (st || '') + '\n點一下展開完整面板';
  }

  function recentShow() {
    const el = $('#g155-recent'); if (!el) return;
    const a = runs.filter((r) => r && (r.kills || 0) > 0).slice(-5);
    if (!a.length) { el.textContent = '最近場次：還沒有紀錄'; return; }
    const avg = Math.round(a.reduce((x, r) => x + (r.kills || 0), 0) / a.length), win = a.filter((r) => r.win).length;
    el.innerHTML = '最近 ' + a.length + ' 場：' + a.map((r) => '<span title="第 ' + r.n + ' 場｜存活 ' + r.time + '｜殺 ' + r.kills + '｜Lv' + r.level + (r.win ? '｜通關' : '｜倒下 ' + (r.cause || '')) + '">' + (r.win ? '✅' : '✖') + '</span>').join(' ') + '<br>過關 ' + win + '｜平均殺 ' + avg.toLocaleString();

  }

  // 卡片設定視窗：點卡片切換「優先 → 不選 → 未設定」，優先清單可上下調整順序
  function openCardEditor() {
    let box = $('#g155-cardsed'); if (box) { box.remove(); return; }
    const panel = $('#g155-panel');
    box = document.createElement('div'); box.id = 'g155-cardsed';
    const mobB = !!(panel && panel.classList.contains('g155-mob'));
    box.style.cssText = 'position:fixed;z-index:100000;left:' + (mobB ? 4 : Math.min(innerWidth - 40, (panel ? panel.getBoundingClientRect().right : 260) + 8)) + 'px;top:' + (mobB ? 4 : 40) + 'px;width:' + (mobB ? (innerWidth - 8) + 'px' : '30em') + ';box-sizing:border-box;max-height:' + (innerHeight - (mobB ? 8 : 80)) + 'px;overflow:auto;background:rgba(20,16,10,.97);color:#eee;border:1px solid #a8843c;border-radius:6px;padding:.6em;font:' + ((panel && panel.style.fontSize) || '13px') + '/1.5 sans-serif';
    ['mousedown', 'mouseup', 'click', 'wheel', 'keydown'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
    document.body.appendChild(box);
    let c = cls(), b = cfg.build;
    const BN = { knight: [['sustain', '回血流'], ['damage', '攻擊流'], ['mixed', '綜合流']], mage: [['speed', '速度輸出流'], ['aoe', '範圍流'], ['sustain', '回血流'], ['mixed', '混合流']] };
    ['elf', 'royal', 'ill', 'darkelf', 'dk'].forEach((k) => { if (!BN[k]) BN[k] = OTHER_BN; }); if (!BN[c]) BN[c] = OTHER_BN;
    const draw = () => {
      if (!BN[c].some((x) => x[0] === b)) b = BN[c][0][0];
      const pri = Array.isArray(customOf(c, b)) ? customOf(c, b).slice() : ((BUILDS[c] || {})[b] || []).slice();
      const ban = bannedOf(c, b).slice();
      const isCustom = Array.isArray(customOf(c, b));
      const save = (np, nb) => {
        cfg.customBuilds = Object.assign({}, cfg.customBuilds); cfg.customBuilds[c] = Object.assign({}, cfg.customBuilds[c]); cfg.customBuilds[c][b] = np;
        cfg.banCards = Object.assign({}, cfg.banCards); cfg.banCards[c] = Object.assign({}, cfg.banCards[c]); cfg.banCards[c][b] = nb;
        saveCfg(); draw();
      };
      const groups = Object.assign({}, CARD_CATALOG[c] || {}, CARD_CATALOG.common);
      const known = new Set([].concat(...Object.values(groups)));
      const extra = Object.keys((seenCards()[c]) || {}).filter((n) => !known.has(n));
      if (extra.length) groups['遊戲中看過的其他卡'] = extra;
      const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      const chip = (n) => { const st = pri.includes(n) ? 'pri' : (ban.includes(n) ? 'ban' : ''); const bg = st === 'pri' ? '#3d6b2f' : (st === 'ban' ? '#7a2b25' : '#3a332a'); return '<span class="g155-chip" title="' + esc(cardDesc(c, n)) + '" data-n="' + esc(n) + '" style="display:inline-block;margin:2px;padding:1px 6px;border-radius:4px;cursor:pointer;background:' + bg + '">' + (st === 'pri' ? (pri.indexOf(n) + 1) + '. ' : (st === 'ban' ? '✕ ' : '')) + esc(n) + '</span>'; };
      box.innerHTML = '<div style="font-weight:bold;color:#f0c060">卡片設定 <span id="g155-ce-x" style="float:right;cursor:pointer">✕ 關閉</span></div>' +
        '<div>職業 <select id="g155-ce-c"><option value="knight">騎士</option><option value="mage">法師</option><option value="elf">妖精</option><option value="royal">王族</option><option value="ill">幻術師</option></select> 流派 <select id="g155-ce-b">' + BN[c].map((x) => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select>' +
        ' <span style="color:' + (isCustom ? '#8f8' : '#aaa') + '">' + (isCustom ? '自訂' : '使用預設') + '</span></div>' +
        '<div style="color:#aaa;font-size:.9em;margin:.3em 0">點卡片切換：未設定 → <span style="background:#3d6b2f;padding:0 4px">優先</span> → <span style="background:#7a2b25;padding:0 4px">不選</span> → 未設定。升級時照優先順序挑；不選的卡永遠不拿（三張都不選時才會被迫選一張）。沒列在優先清單的卡，排在優先卡之後依稀有度挑。</div>' +
        Object.keys(groups).map((g) => '<div style="margin-top:.4em;color:#f0c060">' + g + '</div><div>' + groups[g].map(chip).join('') + '</div>').join('') +
        '<div style="margin-top:.6em;color:#f0c060">優先順序（由上往下）</div>' +
        (pri.length ? pri.map((n, i) => '<div style="display:flex;gap:.4em;align-items:center">' + (i + 1) + '. <span style="flex:1">' + esc(n) + ' <span style="color:#aaa;font-size:.85em">' + esc(cardDesc(c, n)) + '</span></span><span class="g155-up" data-i="' + i + '" style="cursor:pointer">▲</span><span class="g155-dn" data-i="' + i + '" style="cursor:pointer">▼</span><span class="g155-rm" data-i="' + i + '" style="cursor:pointer;color:#f88">移除</span></div>').join('') : '<div style="color:#aaa">（空）</div>') +
        '<div style="margin-top:.4em;color:#f0c060">不選</div><div>' + (ban.length ? ban.map(esc).join('、') : '<span style="color:#aaa">（無）</span>') + '</div>' +
        '<div style="margin-top:.6em"><button id="g155-ce-reset">恢復這個流派的預設</button> <button id="g155-ce-clear">清空優先與不選</button></div>';
      box.querySelector('#g155-ce-c').value = c; box.querySelector('#g155-ce-b').value = b;
      box.querySelector('#g155-ce-c').onchange = (e) => { c = e.target.value; b = BN[c][0][0]; draw(); };
      box.querySelector('#g155-ce-b').onchange = (e) => { b = e.target.value; draw(); };
      box.querySelector('#g155-ce-x').onclick = () => box.remove();
      box.querySelectorAll('.g155-chip').forEach((el) => { el.onclick = () => {
        const n = el.dataset.n; let np = pri.slice(), nb = ban.slice();
        if (np.includes(n)) { np = np.filter((x) => x !== n); nb.push(n); }
        else if (nb.includes(n)) nb = nb.filter((x) => x !== n);
        else np.push(n);
        save(np, nb);
      }; });
      const mv = (i, d) => { const np = pri.slice(), j = i + d; if (j < 0 || j >= np.length) return; [np[i], np[j]] = [np[j], np[i]]; save(np, ban); };
      box.querySelectorAll('.g155-up').forEach((el) => { el.onclick = () => mv(+el.dataset.i, -1); });
      box.querySelectorAll('.g155-dn').forEach((el) => { el.onclick = () => mv(+el.dataset.i, 1); });
      box.querySelectorAll('.g155-rm').forEach((el) => { el.onclick = () => save(pri.filter((x, k) => k !== +el.dataset.i), ban); });
      box.querySelector('#g155-ce-reset').onclick = () => { if (cfg.customBuilds && cfg.customBuilds[c]) delete cfg.customBuilds[c][b]; if (cfg.banCards && cfg.banCards[c]) delete cfg.banCards[c][b]; saveCfg(); draw(); };
      box.querySelector('#g155-ce-clear').onclick = () => save([], []);
    };
    draw();
  }

  function syncPanel() { // 把目前設定反映到面板上
    { const e = $('#g155-who'); if (e) e.textContent = ME.name ? '［' + ME.name + '］' : ''; }
    try { document.title = (ME.name ? '［' + ME.name + '］' : '') + document.title.replace(/^［[^］]*］/, ''); } catch (e) {} // 分頁標題也標上角色名，方便分辨視窗
    const set = (id, v) => { const e = $(id); if (e) e.value = v; };
    { // 流派選單只放目前職業能用的
      const bs = $('#g155-build'), c = cls(), L = (c !== 'mage' && c !== 'knight') ? OTHER_BN.concat([['rarity', '只看稀有度']]) : c === 'mage' ? [['speed', '速度輸出流'], ['aoe', '範圍流'], ['sustain', '回血流'], ['mixed', '混合流'], ['rarity', '只看稀有度']] : [['sustain', '回血流'], ['damage', '攻擊流'], ['mixed', '綜合流'], ['rarity', '只看稀有度']];
      if (bs && bs.dataset.cls !== c) { bs.innerHTML = L.map((x) => '<option value="' + x[0] + '">' + x[1] + '</option>').join(''); bs.dataset.cls = c; }
      if (bs && !L.some((x) => x[0] === cfg.build)) { cfg.build = L[0][0]; cfg.prof = Object.assign({}, cfg.prof, { [c]: { build: cfg.build, style: cfg.style } }); saveCfg(); }
    }
    set('#g155-cls', cfg.cls); set('#g155-build', cfg.build); set('#g155-style', cfg.style);
    set('#g155-mode', cfg.farmMode); set('#g155-sense', cfg.farmSense);
    const n = $('#g155-clsnow'); if (n) n.textContent = '目前：' + clsNm(cls());
  }

  function render() {
    const d = $('#g155-dog'), f = $('#g155-farm'); if (!d) return;
    d.textContent = state.dogOn ? '■ 停止賭狗' : '▶ 開始自動賭狗';
    f.textContent = state.farmOn ? '■ 停止自動走位' : '▶ 開始自動走位';
  }

  // ───────────── 啟動 ─────────────
  function bindChar() {
    ME = who();
    if (!ME.acct && !ME.name) return;
    const suf = '@' + ME.acct + '@' + ME.name;
    const own = safeParse(localStorage.getItem(LS_BASE + suf));
    // 第一次用這個角色：沿用共用設定當起點
    Object.assign(cfg, DEFAULTS, Object.keys(own).length ? own : safeParse(localStorage.getItem(LS_BASE)));
    if (cfg.prof && cfg.prof.knight && cfg.prof.knight.style !== 'loop' && !cfg.migKnightLoop) { cfg.prof.knight = Object.assign({}, cfg.prof.knight, { style: 'loop' }); cfg.migKnightLoop = true; }
    { const c0 = String(window.__ck || '') || 'knight'; const p0 = cfg.prof && cfg.prof[cfg.cls !== 'auto' ? cfg.cls : c0]; if (p0) { cfg.build = p0.build; cfg.style = p0.style; } }
    if (!cfg.migAbOff) { cfg.abTest = false; cfg.migAbOff = true; } // 舊預設會開「輪流測試」，雙數場變成固定繞圈：一律關掉一次
    if (!cfg.migMorph2) { if (cfg.morphMin === 'gold') cfg.morphMin = 'red'; cfg.migMorph2 = true; } // 變身排序改成紅＜紫＜金
    LS_KEY = LS_BASE + suf; saveCfg();
    RUNS_KEY = 'g155helper.runs' + suf;
    const r = safeParse(localStorage.getItem(RUNS_KEY));
    runs.length = 0; if (Array.isArray(r)) r.forEach((x) => runs.push(x));
  }

  // ── 多開保護 ──
  // 同一個 Chrome 設定檔裡的所有分頁共用登入資訊，第二個帳號登入會蓋掉第一個，存檔可能寫錯角色。
  // 每秒檢查登入的帳號／角色有沒有被別的分頁換掉 → 立刻停止所有自動並警告
  function guardInit(alive) { const iv = setInterval(() => { if (!alive()) { clearInterval(iv); return; } guardTick(); }, 1000); }
  function guardTick() {
    const w = who();
    if (!ME.name && w.name) { // 小幫手比登入早啟動（新的設定檔）：登入後才綁定角色，面板照這個角色的設定重畫
      bindChar(); const old = $('#g155-panel'); if (old) old.remove(); buildPanel(); render(); lootShow(); try { updWire(); updShow(safeParse(localStorage.getItem('g155helper.upd')).info); } catch (e) {}
      log('已綁定角色「' + ME.name + '」');
      return;
    }
    if (ME.name && w.name && (w.acct !== ME.acct || w.name !== ME.name)) {
      // 角色換了（在同一個分頁重新選角色，或被別的分頁換掉）：先停掉所有自動，再改用新角色自己的設定與紀錄
      const old = ME.name;
      state.farmOn = false; state.dogOn = false; state.diceOn = false; state.dicePhase = ''; state.dogPend = null; state.dogCmp = null; dogSnap = null; release();
      run = null; state.dogRaces = 0; state.dogStartGold = null; state.dogPhase = '';
      bindChar(); syncPanel(); render();
      const set = (id, v) => { const e = $(id); if (e) e.value = v; };
      set('#g155-bet', cfg.dogBet); set('#g155-floor', cfg.dogStopBelow); set('#g155-max', cfg.dogMaxRaces); set('#g155-loss', cfg.dogMaxLoss); set('#g155-wp', String(cfg.dogWP));
      log('角色已從「' + old + '」換成「' + ME.name + '」，已停止自動並改用這個角色的設定。');
    }
  }

  // ───────────── 線上更新（GitHub） ─────────────
  const UPD_REPO = 'ryan25881-pixel/game155-helper'; // GitHub 專案：帳號/專案名
  const UPD_RAW = 'https://raw.githubusercontent.com/' + UPD_REPO + '/main/';
  const UPD_ON = !/OWNER\/REPO/.test(UPD_REPO);
  const verGt = (a, b) => { const x = String(a || '').split('.').map((n) => parseInt(n, 10) || 0), y = String(b || '').split('.').map((n) => parseInt(n, 10) || 0); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const UPD_HOST = /Electron/.test(navigator.userAgent) ? 'hsa' : (/; wv\)/.test(navigator.userAgent) ? 'apk' : (typeof GM_info !== 'undefined' ? 'tm' : 'ext'));
  const UPD_HINT = { hsa: '多開器已在背景下載新版，分頁重新整理後就是新版', apk: 'App 已在背景下載新版，下次開啟就是新版', tm: '油猴會自動更新（也可以在油猴選單按「檢查更新」）', ext: 'Chrome 擴充功能：「立即更新」只到重新整理前；要長久更新請下載新版解壓覆蓋，再到擴充功能頁按重新載入' };
  async function sha256hex(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  async function updCheck(force) {
    if (!UPD_ON) return null;
    const K = 'g155helper.upd', o = safeParse(localStorage.getItem(K));
    if (!force && o && o.at && Date.now() - o.at < 6 * 3600e3) return o.info || null;
    try { const r = await fetch(UPD_RAW + 'version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const info = await r.json(); try { localStorage.setItem(K, JSON.stringify({ at: Date.now(), info })); } catch (e) {} return info; }
    catch (e) { if (force) log('檢查更新失敗：' + e.message); return null; }
  }
  function updShow(info) {
    const el = $('#g155-upd'); if (!el) return;
    if (!info || !verGt(info.ver, MYVER)) { el.style.display = 'none'; return; }
    const e2 = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const notes = (Array.isArray(info.notes) ? info.notes : [info.notes || '']).filter(Boolean).slice(0, 4).map((n) => '<div style="color:#cfe0b0;font-size:.9em">・' + e2(n) + '</div>').join('');
    el.innerHTML = '🔔 有新版 <b>' + e2(info.ver) + '</b>（目前 ' + e2(MYVER) + '）' + notes + '<div style="margin-top:2px"><button id="g155-updGo">立即更新</button> ' + (UPD_HOST === 'ext' && info.download ? '<a href="' + e2(info.download) + '" target="_blank" rel="noopener" style="color:#8cf">下載新版</a>' : '') + '</div><div style="color:#aaa;font-size:.85em">' + UPD_HINT[UPD_HOST] + '</div>';
    el.style.display = '';
    $('#g155-updGo').onclick = () => updApply(info);
  }
  async function updApply(info) {
    try {
      log('下載新版 ' + info.ver + '…');
      const r = await fetch(UPD_RAW + 'game155-helper.user.js?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const code = await r.text();
      if (!info.sha256 || (await sha256hex(code)) !== String(info.sha256).toLowerCase()) { log('更新檔驗證不符（可能還在上傳中），沒有套用，稍後再試'); return; }
      if (!/window\.__g155loaded\s*=/.test(code)) { log('更新檔內容不對，沒有套用'); return; }
      release(); const p = $('#g155-panel'); if (p) p.remove();
      (0, eval)(code); // 新版會接手目前的狀態（走位、賭狗照常進行）
    } catch (e) { log('更新失敗：' + e.message); }
  }
  function updWire() {
    const v = $('#g155-ver'); if (v) v.textContent = MYVER;
    const b = $('#g155-updChk'), m = $('#g155-updMsg');
    if (b) b.onclick = async () => { if (!UPD_ON) { m.textContent = '還沒設定更新網址'; return; } m.textContent = '檢查中…'; const info = await updCheck(true); m.textContent = !info ? '連不上更新網址' : (verGt(info.ver, MYVER) ? '有新版 ' + info.ver + '（面板最上面）' : '已是最新版（' + info.ver + '）'); updShow(info); };
  }
  function updInit(alive) {
    updWire();
    const tick = async () => { if (!alive()) return; updShow(await updCheck(false)); };
    setTimeout(tick, 5000); const iv = setInterval(() => { if (!alive()) { clearInterval(iv); return; } tick(); }, 30 * 60e3);
  }

  function start() {
    if ($('#g155-panel')) return;
    const prev = window.__g155 && window.__g155.state ? Object.assign({}, window.__g155.state) : null; // 舊版的狀態（重新載入小幫手時）
    bindChar();
    if (prev) { Object.keys(state).forEach((k) => { if (k in prev) state[k] = prev[k]; }); } // 走位、賭狗照舊進行，總累計不歸零
    try { // 戰鬥中換新版：沿用這一場的紀錄（拿過的卡、變身），不重開一場
      const o = window.__g155;
      if (o && inBattle()) { const r0 = o.getRun ? o.getRun() : (o.dbg ? o.dbg().run : null); if (r0 && typeof r0 === 'object') { run = r0; run.hits0 = 0; run.dodges0 = 0; run.hitBy0 = {}; } if (o.getMorph) morphRank = +o.getMorph() || 0; }
    } catch (e) {}
    buildPanel();
    if (prev && (prev.farmOn || prev.dogOn)) log('小幫手已更新，' + [prev.farmOn ? '自動走位' : '', prev.dogOn ? '自動賭狗' : ''].filter(Boolean).join('、') + '繼續進行');
    // 世代編號：腳本被重複載入時，舊的那份所有計時器自動停工，不會和新的搶操作
    const GEN = window.__g155gen = (window.__g155gen || 0) + 1;
    const alive = () => window.__g155gen === GEN;
    installSense();
    guardInit(alive);
    try { updInit(alive); } catch (e) {}
    const every = (fn, ms) => { const iv = setInterval(() => { if (!alive()) { clearInterval(iv); return; } fn(); }, ms); }; // 被新版取代後自己停掉
    every(dogTick, 1000);
    let farmErrAt = 0, farmErrN = 0;
    every(() => {
      try { farmTick(); } catch (e) {
        farmErrN++;
        const now = Date.now();
        if (now - farmErrAt > 20000) { farmErrAt = now; log('走位程式出錯（已改用備用繞圈，第 ' + farmErrN + ' 次）：' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n').slice(1, 3).join(' ').replace(/\s+/g, ' ').slice(0, 220)); }
        try { if (state.farmOn && inBattle() && now - lastStep >= cfg.farmStepMs) { lastStep = now; dirIdx = (dirIdx + spin + 8) % 8; hold(DIRS[dirIdx]); } } catch (e2) {}
        const st = $('#g155-st'); if (st) st.textContent = '[備用繞圈] 走位程式出錯：' + (e && e.message);
      }
    }, 150);
    every(loopTick, 300);
    const CARD_BUILDS = { knight: [['sustain', '回血流'], ['damage', '攻擊流'], ['mixed', '綜合流']], mage: [['speed', '速度輸出流'], ['aoe', '範圍流'], ['sustain', '回血流'], ['mixed', '混合流']], elf: OTHER_BN, royal: OTHER_BN, ill: OTHER_BN, darkelf: OTHER_BN, dk: OTHER_BN };
    const cardsApi = {
      // 給掛件畫畫面用：分類好的卡片、目前的優先與不選
      get: (c, b) => {
        const groups = Object.assign({}, CARD_CATALOG[c] || {}, CARD_CATALOG.common);
        const known = new Set([].concat(...Object.values(groups)));
        const extra = Object.keys(seenCards()[c] || {}).filter((n) => !known.has(n));
        if (extra.length) groups['遊戲中看過的其他卡'] = extra;
        const custom = customOf(c, b);
        const desc = {}; Object.values(groups).forEach((arr) => arr.forEach((n) => { desc[n] = cardDesc(c, n); }));
        return { cls: cls(), build: cfg.build, builds: CARD_BUILDS, groups, desc, custom: Array.isArray(custom),
          pri: Array.isArray(custom) ? custom.slice() : ((BUILDS[c] || {})[b] || []).slice(), ban: bannedOf(c, b).slice() };
      },
      set: (c, b, pri, ban) => {
        cfg.customBuilds = Object.assign({}, cfg.customBuilds); cfg.customBuilds[c] = Object.assign({}, cfg.customBuilds[c]); cfg.customBuilds[c][b] = (pri || []).map(String).slice(0, 60);
        cfg.banCards = Object.assign({}, cfg.banCards); cfg.banCards[c] = Object.assign({}, cfg.banCards[c]); cfg.banCards[c][b] = (ban || []).map(String).slice(0, 60);
        saveCfg(); return true;
      },
      reset: (c, b) => { if (cfg.customBuilds && cfg.customBuilds[c]) delete cfg.customBuilds[c][b]; if (cfg.banCards && cfg.banCards[c]) delete cfg.banCards[c][b]; saveCfg(); return true; },
      // 切換目前使用的流派（掛件上也能改）
      use: (b) => { cfg.build = b; cfg.prof = Object.assign({}, cfg.prof); cfg.prof[cls()] = { build: b, style: cfg.style }; saveCfg(); syncPanel(); return true; },
    };
    window.__g155 = { state, cfg, saveCfg, runs, showStats, getRun: () => run, getMorph: () => morphRank, cards: cardsApi, cardsSeen: CARDS_SEEN, dogCmp: () => { const a = safeParse(localStorage.getItem('g155helper.dogcmp' + (ME.name ? '@' + ME.acct + '@' + ME.name : ''))); return Array.isArray(a) ? a : []; }, mem: () => ({ stat: MEMSTAT, ground: (() => { const o = {}; GITEMS.forEach((it) => { if (!it.dead) { const k = (it.ench !== undefined || it.keep ? '裝備:' : '') + it.name; o[k] = (o[k] || 0) + 1; } }); return o; })(), mons: MONS.size, eproj: EPROJ.size, fiss: FISS.size, meW: SENSE.latest && SENSE.latest.meW, barW: SENSE.latest && SENSE.latest.barW, near: (() => { const s = SENSE.latest; if (!s || !s.meW) return null; const a = []; MONS.forEach((mo) => { const d = Math.hypot(mo.x - s.meW[0], mo.y - s.meW[1]); if (d < 160) a.push(Math.round(d) + ':' + mo.state + ':' + (mo.def && mo.def.name)); }); return a.slice(0, 12); })(), shots: (memList('shots') || []).length }), learn: () => ({ fastIds: SENSE.fastIds, hitIds: SENSE.hitIds, shapes: SENSE.shapes, dodges: SENSE.dodges, threatsNow: SENSE.latest ? SENSE.latest.threats.length : 0, sprNow: SENSE.latest ? SENSE.latest.spr.length / 3 : 0 }), dbg: () => ({ lastPool, hurtUntil, hits, run, sense: SENSE.latest && { items: SENSE.latest.items, orbs: SENSE.latest.orbs.length / 2, gems: SENSE.latest.gems.length / 2, mobs: SENSE.latest.mobs.length / 2, me: SENSE.latest.me, mm: SENSE.latest.mm, age: Date.now() - SENSE.latest.t }, imgs: SENSE.seenImgs, mini: (() => { const m = readMini(); return m && { src: m.src, total: m.total, nearN: m.nearN, nearest: m.nearest }; })() }) }; // 方便在主控台查看
    window.addEventListener('blur', release, { signal: SIG });
  }
  const wait = setInterval(() => { if ($('#goldT')) { clearInterval(wait); start(); } }, 1000);
})();
