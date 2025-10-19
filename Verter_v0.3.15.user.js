// ==UserScript==
// @name         Verter_v0.3.15
// @version      0.3.15
// @description  FAST-5S trading mode + S5-signals + M1-context + adaptive scoring
// @match        https://pocketoption.com/*
// @run-at       document-idle
// ==/UserScript==

// [SSOT:APP:BEGIN]
const BUILD_NAME = 'Verter_v0.3.15';
const VER = '0.3.15';
const APP = (function(){
  const base = (typeof globalThis.APP === 'object' && globalThis.APP) ? globalThis.APP : {};
  base.NAME = 'Verter_M1_BALRES';
  base.VERSION = '0.3.15';
  base.FLAVOR = 'MG_from_app5_CAN_CHS';
  try{ globalThis.APP = base; }catch(e){}
  return base;
})();
APP.VERSION = '0.3.15';
// [SSOT:APP:END]

// ===== Build Meta =====

// Boot banner
try{ if(typeof DockBox!=='undefined' && DockBox?.setTitle){ DockBox.setTitle('Verter v'+VER); } }catch(e){}


// [BEGIN MOD:PauseCtl]
// ===== Pause Controller =====
var PauseCtl=(function(){
  const KEY_PREFIX='verter.pause.';
  const KEY_AUTO=KEY_PREFIX+'autoOnLosses';
  const KEY_DURATION=KEY_PREFIX+'durationMin';
  const KEY_MANUAL=KEY_PREFIX+'manualDurationMin';
  const LEGACY_KEY='verter.pause.v1';
  let cfg={autoOnLosses:3, durationMin:3, manualDurationMin:5};
  let st={until:0, lossCount:0, pending:{until:0, reason:null}};

  function readInt(key){
    try{
      const raw=localStorage.getItem(key);
      if(raw==null) return null;
      const num=parseInt(raw,10);
      return isFinite(num)?num:null;
    }catch(e){ return null; }
  }

  try{
    const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
    if(legacy && typeof legacy==='object'){
      if(typeof legacy.autoOnLosses==='number') cfg.autoOnLosses=Math.max(1, legacy.autoOnLosses|0);
      if(typeof legacy.durationMin==='number') cfg.durationMin=Math.max(1, legacy.durationMin|0);
      if(typeof legacy.manualDurationMin==='number') cfg.manualDurationMin=Math.max(1, legacy.manualDurationMin|0);
    }
  }catch(e){}

  const savedAuto=readInt(KEY_AUTO); if(savedAuto!=null) cfg.autoOnLosses=Math.max(1, savedAuto|0);
  const savedDuration=readInt(KEY_DURATION); if(savedDuration!=null) cfg.durationMin=Math.max(1, savedDuration|0);
  const savedManual=readInt(KEY_MANUAL); if(savedManual!=null) cfg.manualDurationMin=Math.max(1, savedManual|0);

  function save(key,val){ try{ localStorage.setItem(key, String(val)); }catch(e){} }
  function now(){ return Date.now(); }
  function _formatRemaining(){
    const ms=st.until>0?Math.max(0, st.until-now()):0;
    const totalSec=Math.max(0, Math.ceil(ms/1000));
    const m=Math.floor(totalSec/60);
    const s=totalSec%60;
    const mm=m<10?'0'+m:String(m);
    const ss=s<10?'0'+s:String(s);
    return mm+':'+ss;
  }
  function _setPending(reason){
    st.pending.until=st.until>0?st.until:0;
    st.pending.reason=reason||null;
  }
  function _ensureFresh(){
    if(st.until>0 && now()>=st.until){
      st.until=0;
      _setPending(null);
      return true;
    }
    return false;
  }
  function _updateMode(){
    try{
      if(typeof DockBox!=='undefined' && DockBox?.setMode){
        if(st.until>0 && now()<st.until){
          const rem=_formatRemaining();
          DockBox.setMode('PAUSE '+rem);
        }else{
          DockBox.setMode('IDLE');
        }
      }
    }catch(e){}
  }
  function isActive(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    if(st.until>0 && now()<st.until){
      _updateMode();
      return true;
    }
    return false;
  }
  function isArmed(){
    _ensureFresh();
    return st.until>0 && now()<st.until;
  }
  function remainingMs(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    return st.until>0?Math.max(0, st.until-now()):0;
  }
  function remainingFmt(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    return _formatRemaining();
  }
  function start(min, reason){
    const dur=Math.max(1, Math.floor(min || cfg.manualDurationMin || cfg.durationMin));
    st.until=now()+dur*60000;
    _setPending(reason||'manual');
    _updateMode();
    try{ console.log('[PAUSE] start '+dur+'min reason='+(reason||'manual')); }catch(e){}
  }
  function stop(){
    st.until=0;
    _setPending(null);
    _updateMode();
    try{ console.log('[PAUSE] stop'); }catch(e){}
  }
  function startAuto(){
    start(cfg.durationMin, 'auto');
    st.lossCount=0;
    try{ console.log('[PAUSE] start auto '+cfg.durationMin+'min after '+cfg.autoOnLosses+' losses'); }catch(e){}
  }
  function noteResult(type){
    if(type==='LOSS'){
      st.lossCount++;
      if(st.lossCount>=cfg.autoOnLosses){
        startAuto();
      }
    }else if(type==='WIN'){
      st.lossCount=0;
    }
  }
  function setAutoLosses(n){
    cfg.autoOnLosses=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_AUTO, cfg.autoOnLosses);
  }
  function setDurationMin(n){
    cfg.durationMin=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_DURATION, cfg.durationMin);
  }
  function setManualDurationMin(n){
    cfg.manualDurationMin=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_MANUAL, cfg.manualDurationMin);
  }
  document.addEventListener('keydown', function(e){
    if(!e.altKey) return;
    if(e.key==='p' || e.key==='P'){
      const v=prompt('Минуты для автопаузы после '+cfg.autoOnLosses+' LOSS подряд:', String(cfg.durationMin));
      if(v!=null){ setDurationMin(v); try{ console.log('[PAUSE] auto duration set to', cfg.durationMin, 'min'); }catch(err){} }
    }
    if(e.key==='o' || e.key==='O'){
      start(cfg.manualDurationMin, 'manual');
    }
  });
  return {
    isActive,
    isArmed,
    remainingFmt,
    start,
    startAuto,
    stop,
    noteResult,
    setAutoLosses,
    setDurationMin,
    setManualDurationMin,
    cfg,
    state:function(){ return st; }
  };
})();

/* [END MOD:PauseCtl] */


(function () {
  if (window.__verterBoot) { console.log('[VERTER] already armed'); return; }
  window.__verterBoot = true;

  console.log('[VERTER][BOOT] %s ready', BUILD_NAME);

  /* VER moved to APP.VERSION */
  const DEBUG = false;

  // ===== Utils =====
  function now(){ return Date.now(); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function r2(x){ return Math.round(x*100)/100; }
  function fmt2(x){ return (x==null||isNaN(x))?'—':(+x).toFixed(2); }
  function normMoney(s){
    if(!s) return null;
    s=String(s).replace(/[\s\u00A0]/g,'').replace(/[A-Za-z$€£¥₽₴₺₹₩₦฿₿]/g,'').replace(/[^0-9,.\-]/g,'');
    if(/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
    else if(/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)){ s=s.replace(/\./g,'').replace(/,/g,'.'); }
    else { var c=(s.match(/,/g)||[]).length,d=(s.match(/\./g)||[]).length; if(c&&!d){ var last=s.split(',').pop(); s=(last.length===3)?s.replace(/,/g,''):s.replace(/,/g,'.'); } }
    var n=parseFloat(s); return isNaN(n)?null:r2(n);
  }

  // ===== SessionStats =====
  var SessionStats=(function(){
    var s={startTime:null,startBalance:null,lastBalance:null,tradesTotal:0,wins:0,losses:0,returns:0,
           volumeTotal:0,volumeByType:{WIN:0,LOSS:0,RET:0},profitTotal:0,cycles:[]};
    function ensureInit(v){ if(s.startBalance==null && v!=null){ s.startBalance=v; s.startTime=Date.now(); } }
    function onBalance(v){ if(v==null) return; ensureInit(v); s.lastBalance=v;
      if(s.startBalance!=null && s.lastBalance!=null) s.profitTotal=r2(s.lastBalance-s.startBalance); }
    function onClose(type, pnl, finalBal, amount){
      if(type==='WIN') s.wins++; else if(type==='LOSS') s.losses++; else if(type==='RET') s.returns++;
      s.tradesTotal++;
      if(amount!=null) s.volumeTotal=r2(s.volumeTotal+amount);
      if(type&&amount!=null) s.volumeByType[type]=r2((s.volumeByType[type]||0)+amount);
      if(finalBal!=null) s.lastBalance=finalBal;
      if(s.startBalance!=null && s.lastBalance!=null) s.profitTotal=r2(s.lastBalance-s.startBalance);
    }
    function snapshot(){
      var winPct=s.tradesTotal? Math.round((s.wins/s.tradesTotal*1000))/10:0;
      return { ...s, winPct };
    }
    return { onBalance,onClose,snapshot,get:()=>s };
  })();

  const SigStats = {
    SQZ: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    EMAChain: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    RSIEMA: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    MAMA: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    S5_EMA: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    S5_BB: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    S5_RSI7: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    S5_SQZ: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] }
  };

  function sigKeyOf(sig){
    if(sig === 'EMA9/15' || sig === 'EMAChain') return 'EMAChain';
    if(sig === 'SQZ') return 'SQZ';
    if(sig === 'RSIEMA') return 'RSIEMA';
    if(sig === 'MAMA') return 'MAMA';
    if(sig === 'S5_EMA') return 'S5_EMA';
    if(sig === 'S5_BB_Pullback') return 'S5_BB';
    if(sig === 'S5_RSI7') return 'S5_RSI7';
    if(sig === 'S5_SQZmini') return 'S5_SQZ';
    return null;
  }

  // [BEGIN MOD:DataFeed]
  // ===== Balance feeder + Stable(2s) =====
  var Balance=(function(){
    var target=null;
    function find(){
      return document.querySelector('.balance-info-block__balance .js-balance-demo')
          || document.querySelector('span.js-balance-demo')
          || document.querySelector('[class*="balance"] [class*="js-balance"]')
          || document.body;
    }
    function read(){
      var raw=(target && (target.textContent||target.getAttribute?.('data-hd-show'))) || '';
      return normMoney(raw);
    }
    function boot(){
      target=find();
      if(!target || target===document.body){ console.warn('[BAL] target not found'); return; }
      var obs=new MutationObserver(()=>BalanceStable.feed());
      obs.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-hd-show']});
      setTimeout(()=>{ try{BalanceStable.feed();}catch(e){} },0);
      console.log('[BAL][BOOT] feeder→2s stable');
      return ()=>{ try{obs.disconnect();}catch(e){} };
    }
    return { boot, read, getTarget:()=>target };
  })();

  var BalanceStable=(function(){
    var t=null, stable=null, cbs=[];
    function feed(){ if(t) return; t=setTimeout(function(){ t=null; var v=null; try{ v=Balance.read(); }catch(e){} if(v==null) return;
      var prev=stable; stable=v;
      try{
        SessionStats.onBalance(stable);
        if(prev!=null && prev!==stable){ console.log('[BAL][COMMIT]', prev.toFixed(2),'→',stable.toFixed(2)); }
        else if(prev==null){ console.log('[BAL][COMMIT]', stable.toFixed(2)); }
      }catch(e){}
      for(var i=0;i<cbs.length;i++){ try{ cbs[i](stable, Date.now()); }catch(_e){} }
    },2000); }
    function onStable(cb){ if(typeof cb==='function') cbs.push(cb); }
    function getStable(){ return stable; }
    return { feed, onStable, getStable };
  })();

  // ===== Tick source (tooltip probe) =====
  var tickSource=(function(){
    function readTooltip(){
      var rx=/(\d+\.\d{3,6})/g, roots=document.querySelectorAll('[role="tooltip"],[class*="tooltip"],[class*="tippy"],[class*="popper"]'), cand=[];
      for(var i=0;i<roots.length;i++){ var t=roots[i].textContent||''; var m; while((m=rx.exec(t))){ var v=parseFloat(m[1]); if(isFinite(v)) cand.push(v); } }
      if(!cand.length) return null;
      for(var j=cand.length-1;j>=0;j--){ var v=cand[j]; if(v>0.0001 && v<100000) return v; }
      return null;
    }
    function subscribe(cb, period){
      var last=null;
      var iv=setInterval(function(){
        try{
          if(PauseCtl && PauseCtl.isActive()){
            // Обновляем режим, но НЕ выходим
            try{ if(typeof DockBox!=='undefined' && DockBox?.setMode){ DockBox.setMode('PAUSE '+PauseCtl.remainingFmt()); } }catch(e){}
          }
          var p=readTooltip();
          if(p==null) return;
          if(last===null || p!==last){ last=p; cb(p, Date.now()); }
        }catch(e){}
      }, Math.max(100, period|0));
      return function(){ clearInterval(iv); };
    }
    return { subscribe };
  })();

  /* [END MOD:DataFeed] */
  const DataFeed = Object.freeze({ Balance, BalanceStable, tickSource });

  // [BEGIN MOD:Candles]
  const CandleState={
    ticks:[],
    m1:{cur:null,candles:[]},
    s5:{cur:null,candles:[]},
    cur:null,
    candlesM1:[]
  };
  function pushS5(price, t){
    var bucket=Math.floor(t/5000);
    var cs=CandleState.s5;
    if(!cs.cur||cs.cur.bucket!==bucket){
      if(cs.cur){
        cs.candles.push(cs.cur);
        if(cs.candles.length>1200) cs.candles.shift();
      }
      cs.cur={bucket:bucket,open:price,high:price,low:price,close:price};
    }else{
      if(price>cs.cur.high) cs.cur.high=price;
      if(price<cs.cur.low) cs.cur.low=price;
      cs.cur.close=price;
    }
  }
  function candlesOnTick(p,ts){
    var t=ts||Date.now();
    CandleState.ticks.push({t:t,p:p}); if(CandleState.ticks.length>5000) CandleState.ticks=CandleState.ticks.slice(-5000);
    pushS5(p,t);
    var m1=CandleState.m1;
    var bucket=Math.floor(t/60000);
    if(!m1.cur||m1.cur.bucket!==bucket){
      if(m1.cur){
        m1.cur.C=m1.cur.lastP;
        m1.candles.push({tOpen:m1.cur.tOpen,O:m1.cur.O,H:m1.cur.H,L:m1.cur.L,C:m1.cur.C});
        if(m1.candles.length>600) m1.candles=m1.candles.slice(-600);
        try{ console.log('[M1][CLOSE]', new Date(m1.cur.tOpen).toISOString(), m1.cur); }catch(e){}
      }
      m1.cur={bucket:bucket,tOpen:bucket*60000,O:p,H:p,L:p,C:p,lastP:p};
    }else{
      if(p>m1.cur.H) m1.cur.H=p;
      if(p<m1.cur.L) m1.cur.L=p;
      m1.cur.lastP=p;
    }
    CandleState.cur=m1.cur;
    CandleState.candlesM1=m1.candles;
  }
  function getCandlesState(){ return CandleState; }
  /* [END MOD:Candles] */
  const Candles = Object.freeze({ onTick: candlesOnTick, getState: getCandlesState });

  // [BEGIN MOD:UI]
  // ===== DockBox (панель+график, +50%, drag) =====
  function ensureStyle(css){
    let node=document.getElementById('verter-style');
    if(!node){
      node=document.createElement('style');
      node.id='verter-style';
      node.type='text/css';
      document.head.appendChild(node);
    }
    if(!node.textContent.includes(css)){ node.textContent+=css; }
  }

  const UI_CFG=(function(){
    let saved=null;
    try{ saved=localStorage.getItem('verter.panelMaxH'); }catch(e){}
    let val=parseInt(saved,10);
    if(!isFinite(val)) val=480;
    val=Math.max(320, Math.min(800, val));
    return { panelMaxHeightPx:val };
  })();

  function applyPanelHeight(v){
    try{ document.documentElement.style.setProperty('--verter-panel-maxh', v+'px'); }catch(e){}
  }

  function uiSet(p){
    if(!p || typeof p!=='object') return;
    if(p.panelMaxHeightPx!=null){
      let v=+p.panelMaxHeightPx;
      if(!isFinite(v)) return;
      v=Math.max(320, Math.min(800, v|0));
      if(v!==UI_CFG.panelMaxHeightPx){
        UI_CFG.panelMaxHeightPx=v;
        try{ localStorage.setItem('verter.panelMaxH', String(v)); }catch(e){}
        applyPanelHeight(v);
        console.log('[UI] panelMaxHeight set to', v);
      }
    }
  }

  applyPanelHeight(UI_CFG.panelMaxHeightPx);
  ensureStyle(`
:root{--verter-panel-maxh:${UI_CFG.panelMaxHeightPx}px;}
#DockBox{max-height:var(--verter-panel-maxh);overflow:auto;}
.v-row{display:flex;align-items:center;gap:6px;margin-top:4px;font:12px monospace;color:#ddd;}
.v-row label{display:inline-flex;align-items:center;gap:4px;}
.v-row input{width:64px;padding:2px 6px;background:#1b1b1b;color:#eee;border:1px solid #555;border-radius:4px;text-align:right;font:12px monospace;}
.v-dec{font-weight:600;}
.v-dec.buy{color:#3fb950;}
.v-dec.sell{color:#ff4d4f;}
.v-dec.idle{color:#9aa0a6;}
.v-mode-group{display:inline-flex;align-items:center;gap:6px;}
.v-mode-btn{display:inline-flex;align-items:center;padding:2px 8px;border:1px solid #444;border-radius:4px;cursor:pointer;transition:all .15s ease;color:#ddd;}
.v-mode-btn.active{background:#2e8b57;color:#fff;border-color:#2e8b57;}
.v-mode-btn:hover{border-color:#2e8b57;color:#2e8b57;}
`);
  try{ globalThis.__VERTER_UI__={ set:uiSet }; }catch(e){}

  var DockBox=(function(){
    var box=document.createElement('div');
    box.id='DockBox';
    box.style.cssText='position:fixed;z-index:999999;right:12px;bottom:12px;width:960px;background:#111;color:#ddd;font:13px monospace;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;user-select:none';
    var bar=document.createElement('div'); bar.className='verter-dock-header';
    bar.style.cssText='padding:6px 8px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;flex-wrap:wrap';
    var left=document.createElement('div'); left.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var right=document.createElement('div'); right.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    bar.appendChild(left); bar.appendChild(right);

    // [BEGIN MOD:PauseUI]
    const paWrap = document.createElement('span');
    paWrap.style.cssText = 'display:inline-flex;gap:8px;align-items:center;font:12px monospace;color:#ddd;user-select:text;';

    const inpLoss = document.createElement('input');
    inpLoss.type = 'number';
    inpLoss.min = '1';

    const inpAutoMin = document.createElement('input');
    inpAutoMin.type = 'number';
    inpAutoMin.min = '1';

    const inpManualMin = document.createElement('input');
    inpManualMin.type = 'number';
    inpManualMin.min = '1';

    const btnStart = document.createElement('button');
    btnStart.textContent = 'Pause';
    const btnStop = document.createElement('button');
    btnStop.textContent = 'Resume';

    [inpLoss, inpAutoMin, inpManualMin, btnStart, btnStop].forEach(el=>{
      ['mousedown','click'].forEach(evt=>{
        el.addEventListener(evt, ev=>ev.stopPropagation());
      });
    });

    const baseInputCSS = 'width:56px;height:24px;padding:2px 6px;margin:0;'+
      'background:#1b1b1b;color:#eee;border:1px solid #555;border-radius:4px;'+
      'outline:none;user-select:text;font:12px monospace;';
    [inpLoss, inpAutoMin, inpManualMin].forEach(i=>{
      i.style.cssText = baseInputCSS;
      i.step = '1';
    });

    const baseBtnCSS = 'height:26px;padding:2px 10px;background:#2a2a2a;color:#eee;'+
      'border:1px solid #666;border-radius:6px;cursor:pointer;font:12px monospace;';
    btnStart.style.cssText = baseBtnCSS;
    btnStop.style.cssText  = baseBtnCSS;

    btnStart.onmouseenter = btnStop.onmouseenter = e=>{ e.currentTarget.style.background = '#3a3a3a'; };
    btnStart.onmouseleave = btnStop.onmouseleave = e=>{ e.currentTarget.style.background = '#2a2a2a'; };

    paWrap.append('Losses:', inpLoss, 'Auto(min):', inpAutoMin, 'Manual:', inpManualMin, btnStart, btnStop);
    right.appendChild(paWrap);

    const metricsWrap = document.createElement('div');
    metricsWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:420px;';
    right.appendChild(metricsWrap);

    const rightInfo = document.createElement('span');
    rightInfo.style.cssText = 'display:inline-block;';
    metricsWrap.appendChild(rightInfo);

    const payoutRow=document.createElement('div');
    payoutRow.className='v-row';
    const payoutLabel=document.createElement('label');
    payoutLabel.textContent='Payout ≥';
    const payoutInput=document.createElement('input');
    payoutInput.id='v-payout';
    payoutInput.type='number';
    payoutInput.min='0.50';
    payoutInput.max='1.00';
    payoutInput.step='0.01';
    payoutInput.style.cssText='width:64px;text-align:right';
    let payoutInit=0.9;
    try{
      const saved=localStorage.getItem('verter.payoutMin');
      const parsed=saved!=null?parseFloat(saved):NaN;
      if(!isNaN(parsed)) payoutInit=Math.max(0.5, Math.min(1.0, parsed));
    }catch(e){}
    payoutInput.value=payoutInit.toFixed(2);
    payoutRow.appendChild(payoutLabel);
    payoutRow.appendChild(payoutInput);
    metricsWrap.appendChild(payoutRow);

    const modeRow=document.createElement('div');
    modeRow.className='v-row';
    const modeLabel=document.createElement('span');
    modeLabel.textContent='Mode:';
    const modeGroup=document.createElement('span');
    modeGroup.className='v-mode-group';
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeGroup);
    ['FAST5S','M1'].forEach(function(name){
      const btn=document.createElement('span');
      btn.className='v-mode-btn';
      btn.textContent=name;
      btn.addEventListener('click', function(ev){
        ev.stopPropagation();
        setActiveMode(name);
      });
      modeButtons[name]=btn;
      modeGroup.appendChild(btn);
    });
    updateModeButtons(getActiveMode());
    metricsWrap.appendChild(modeRow);

    const cycleHistoryBox = document.createElement('div');
    cycleHistoryBox.style.cssText = 'font-family:monospace;font-size:11px;color:#ddd;white-space:pre;line-height:1.35;border-top:1px solid #222;padding-top:4px;';
    cycleHistoryBox.textContent = 'Cycle History:\nNo cycles yet';
    metricsWrap.appendChild(cycleHistoryBox);

    inpLoss.value = PauseCtl?.cfg?.autoOnLosses ?? 3;
    inpAutoMin.value = PauseCtl?.cfg?.durationMin ?? 3;
    inpManualMin.value = PauseCtl?.cfg?.manualDurationMin ?? 5;

    inpLoss.addEventListener('input', function(){
      const val = Math.max(1, (+inpLoss.value)||1);
      PauseCtl.setAutoLosses(val);
      if(String(val)!==inpLoss.value){ inpLoss.value = val; }
    });
    inpAutoMin.addEventListener('input', function(){
      const val = Math.max(1, (+inpAutoMin.value)||1);
      PauseCtl.setDurationMin(val);
      if(String(val)!==inpAutoMin.value){ inpAutoMin.value = val; }
    });
    inpManualMin.addEventListener('input', function(){
      const val = Math.max(1, (+inpManualMin.value)||1);
      PauseCtl.setManualDurationMin(val);
      if(String(val)!==inpManualMin.value){ inpManualMin.value = val; }
    });

    payoutInput.addEventListener('change', function(e){
      let next=parseFloat(e.target.value);
      if(isNaN(next)){
        const cfg=globalThis.CFG && globalThis.CFG.thresholds;
        next=(cfg && typeof cfg.payoutMin==='number')?cfg.payoutMin:payoutInit;
      }
      next=Math.max(0.5, Math.min(1.0, Math.round(next*100)/100));
      e.target.value=next.toFixed(2);
      try{ localStorage.setItem('verter.payoutMin', String(next)); }catch(err){}
      try{
        if(globalThis.CFG && typeof globalThis.CFG.th==='function'){
          globalThis.CFG.th({payoutMin:next});
        }else if(globalThis.CFG){
          if(globalThis.CFG.thresholds){ globalThis.CFG.thresholds.payoutMin=next; }
          if(globalThis.CFG.modes){
            Object.keys(globalThis.CFG.modes).forEach(function(k){
              if(globalThis.CFG.modes[k]){ globalThis.CFG.modes[k].payoutMin=next; }
            });
          }
        }
      }catch(err){}
      try{ console.log('[CFG][TH] payoutMin=', next.toFixed(2)); }catch(err){}
      renderHeader(true);
    });

    setTimeout(function(){
      try{
        const cfg=globalThis.CFG && globalThis.CFG.thresholds;
        if(cfg){
          if(typeof cfg.payoutMin!=='number'){ cfg.payoutMin=payoutInit; }
          payoutInput.value=(Math.max(0.5, Math.min(1.0, cfg.payoutMin))).toFixed(2);
        }
      }catch(err){}
    },0);

    btnStart.addEventListener('click', function(){ PauseCtl.start(+inpManualMin.value || PauseCtl.cfg.manualDurationMin, 'manual-ui'); });
    btnStop.addEventListener('click', function(){ PauseCtl.stop(); });
    // [END MOD:PauseUI]
    var cv=document.createElement('canvas'); cv.style.flex='1'; cv.style.display='block';
    box.appendChild(bar); box.appendChild(cv); document.body.appendChild(box);
    var ctx=cv.getContext('2d');

    (function restorePos(){
      try{
        const s = JSON.parse(localStorage.getItem('verter.dock.pos')||'null');
        if(s && typeof s.left==='number' && typeof s.top==='number'){
          box.style.right = box.style.bottom = '';
          box.style.left = s.left+'px'; box.style.top  = s.top +'px';
        }
      }catch(e){}
    })();
    (function makeDraggable(){
      let dragging=false, sx=0, sy=0, bx=0, by=0;
      function onDown(e){
        const t = e.target;
        if(t && t.closest && t.closest('input,button,select,textarea,label,[contenteditable="true"]')){
          return;
        }
        dragging=true;
        const r = box.getBoundingClientRect();
        sx=e.clientX; sy=e.clientY; bx=r.left; by=r.top;
        box.style.right = box.style.bottom = '';
        box.style.left  = bx+'px'; box.style.top = by+'px';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, {once:true});
        e.preventDefault();
      }
      function onMove(e){
        if(!dragging) return;
        const dx=e.clientX-sx, dy=e.clientY-sy;
        const vw=window.innerWidth, vh=window.innerHeight;
        const rect=box.getBoundingClientRect(), w=rect.width, h=rect.height;
        const nx=clamp(bx+dx,0,vw-w), ny=clamp(by+dy,0,vh-h);
        box.style.left=nx+'px'; box.style.top=ny+'px';
      }
      function onUp(){
        dragging=false;
        try{
          const r=box.getBoundingClientRect();
          localStorage.setItem('verter.dock.pos', JSON.stringify({left:Math.round(r.left), top:Math.round(r.top)}));
        }catch(e){}
        window.removeEventListener('mousemove', onMove);
      }
      bar.addEventListener('mousedown', onDown);
    })();
    document.addEventListener('keydown', function(e){
      if(e.altKey && (e.key==='i'||e.key==='I')){ box.style.display = (box.style.display==='none')?'flex':'none'; }
      if(e.altKey && (e.key==='r'||e.key==='R')){
        localStorage.removeItem('verter.dock.pos');
        box.style.left = box.style.top = ''; box.style.right = '12px'; box.style.bottom = '12px';
      }
    });

    function fit(){
      var r=box.getBoundingClientRect(), head=bar.getBoundingClientRect().height|0;
      var w=Math.max(480,(r.width|0)), h=Math.max(240,((r.height-head)|0));
      if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; }
    }
    window.addEventListener('resize', function(){ fit(); schedule(); });
    fit();

    var raf=0,need=false; function schedule(){ if(need) return; need=true; raf=requestAnimationFrame(function(){ need=false; draw(); }); }
    function draw(){
      fit(); var W=cv.width,H=cv.height;
      var state=Candles.getState();
      var data=state.candlesM1.slice(-120); if(state.cur) data=data.concat([{O:state.cur.O,H:state.cur.H,L:state.cur.L,C:state.cur.lastP}]);
      const baseAlpha = (PauseCtl && PauseCtl.isActive()) ? 0.5 : 1;
      ctx.clearRect(0,0,W,H); if(!data.length) return;
      var hi=-1e9,lo=1e9; for(var i=0;i<data.length;i++){ hi=Math.max(hi,data[i].H); lo=Math.min(lo,data[i].L); }
      var span=(hi-lo)||1;
      ctx.globalAlpha=0.25*baseAlpha; ctx.strokeStyle='#666'; ctx.lineWidth=1;
      for(var g=1;g<4;g++){ var y=(H/4*g)|0; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      ctx.globalAlpha=1*baseAlpha; var n=data.length,bw=Math.max(3,Math.floor(W/n)-3),gap=2; ctx.lineWidth=1; ctx.strokeStyle='#bbb';
      for(var j=0;j<n;j++){
        var c=data[j],x=j*(bw+gap)+1;
        var yH=H-((c.H-lo)/span*H),yL=H-((c.L-lo)/span*H),yO=H-((c.O-lo)/span*H),yC=H-((c.C-lo)/span*H);
        ctx.beginPath(); ctx.moveTo(x+bw/2,yH); ctx.lineTo(x+bw/2,yL); ctx.stroke();
        var yTop=Math.min(yO,yC),yBot=Math.max(yO,yC),live=(j===n-1&&!!state.cur);
        ctx.fillStyle=(c.C>=c.O)?(live?'rgba(46,139,87,.7)':'#2e8b57'):(live?'rgba(170,58,58,.7)':'#aa3a3a');
        ctx.fillRect(x,yTop,bw,Math.max(1,yBot-yTop));
      }
    }

    var modeText='IDLE';
    var modeButtons={};
    var sigReady=Object.create(null);
    var sigNeed=Object.create(null);
    var decisionState={
      last:null,
      lastPick:null,
      filters:{payout:null, vol:null, cooldown:null},
      skips:{payout:0, low_vol:0, conflict:0, cooldown:0},
      meta:{payout:null,payoutThr:null,atr14:null,atrMedian20:null,cooldownSec:null,cooldownThr:null},
      mode:null
    };
    var lastHeaderTs=0;

    function setMode(t){ modeText=t||modeText; renderHeader(true); }
    function setSigReady(name,have,need){
      if(name){
        sigReady[name]=have||0;
        if(need!=null) sigNeed[name]=need;
        if(name==='RSI14' || name==='EMA15'){
          var combined=Math.min(sigReady.RSI14||0, sigReady.EMA15||0);
          sigReady.RSIEMA=combined;
          sigNeed.RSIEMA=15;
        }
      }
      renderHeader(false);
    }
    function incSigHit(){ /* compatibility no-op */ }

    function getActiveMode(){
      return decisionState.mode || (globalThis.CFG && globalThis.CFG.activeMode) || 'FAST5S';
    }

    function updateModeButtons(active){
      Object.keys(modeButtons).forEach(function(name){
        var btn=modeButtons[name];
        if(!btn) return;
        if(name===active){ btn.classList.add('active'); }
        else{ btn.classList.remove('active'); }
      });
    }

    function setActiveMode(name){
      if(!name) return;
      var cfg=globalThis.CFG;
      if(cfg && typeof cfg.setMode==='function'){
        cfg.setMode(name);
      }else if(cfg){
        cfg.activeMode=name;
        try{ localStorage.setItem('verter.mode', name); }catch(e){}
      }else{
        try{ localStorage.setItem('verter.mode', name); }catch(e){}
      }
      decisionState.mode=name;
      updateModeButtons(name);
      renderHeader(true);
    }

    function updateDecision(info){
      if(!info) return;
      if(info.last!=null) decisionState.last=info.last;
      if('lastPick' in info){ decisionState.lastPick=info.lastPick; }
      if(info.filters){
        if(info.filters.payout!==undefined) decisionState.filters.payout=info.filters.payout;
        if(info.filters.vol!==undefined) decisionState.filters.vol=info.filters.vol;
        if(info.filters.cooldown!==undefined) decisionState.filters.cooldown=info.filters.cooldown;
      }
      if(info.meta){
        Object.keys(info.meta).forEach(function(k){
          if(info.meta[k]!==undefined){ decisionState.meta[k]=info.meta[k]; }
        });
      }
      if(info.skips){
        Object.keys(info.skips).forEach(function(k){
          var v=info.skips[k];
          if(typeof v==='number'){ decisionState.skips[k]=(decisionState.skips[k]||0)+v; }
        });
      }
      if(info.mode){
        decisionState.mode=info.mode;
        updateModeButtons(info.mode);
      }
      renderHeader(false);
    }

    function fmtOk(v){ if(v===true) return '<span style="color:#4caf50">OK</span>'; if(v===false) return '<span style="color:#f44336">NO</span>'; return '—'; }
    function fmtReady(name, fallbackNeed){
      var have=sigReady[name]||0;
      var need=sigNeed[name]!=null?sigNeed[name]:fallbackNeed;
      if(need==null || need<=0) return have+'/?';
      return Math.min(have, need)+'/'+need;
    }

    function renderHeader(force){
      var now=Date.now();
      if(!force && now-lastHeaderTs<900){ return; }
      lastHeaderTs=now;
      var ss=SessionStats.get();
      left.innerHTML =
        'Start: ' + (ss.startTime? new Date(ss.startTime).toLocaleTimeString():'—') +
        ' | Bal: ' + fmt2(ss.startBalance) + ' → ' + fmt2(ss.lastBalance) +
        ' | P/L: ' + fmt2(ss.profitTotal) +
        ' | Wager: ' + fmt2(ss.volumeTotal) +
        ' | Trades: ' + ss.tradesTotal + ' (W/L/R ' + ss.wins + '/' + ss.losses + '/' + ss.returns + ')' +
        ' | Win%: ' + (ss.tradesTotal? (ss.wins/ss.tradesTotal*100).toFixed(1):'0.0');

      SignalEngine.ensureSigStats();
      var statsKeys=['S5_EMA','S5_BB','S5_RSI7','S5_SQZ','SQZ','EMAChain','RSIEMA','MAMA'];
      var totalOpens=statsKeys.reduce(function(sum,key){
        var st=SigStats[key]||{};
        return sum+(st.open||0);
      },0);
      function share(stat){
        if(!stat || !stat.open) return '—';
        var denom=Math.max(1,totalOpens);
        return (Math.round((stat.open/denom)*1000)/10).toFixed(1)+'%';
      }
      function wr(stat){
        var wins=(stat && stat.win)||0;
        var losses=(stat && stat.loss)||0;
        var denom=wins+losses;
        if(denom<=0) return '—';
        return (Math.round((wins/denom)*1000)/10).toFixed(1)+'%';
      }
      function avgScore(stat){
        if(!stat || !stat.open) return '—';
        var avg=stat.sumScore?stat.sumScore/stat.open:0;
        if(!isFinite(avg)) return '—';
        return avg.toFixed(2);
      }

      var s5Stats={
        S5_EMA: SigStats.S5_EMA||{},
        S5_BB: SigStats.S5_BB||{},
        S5_RSI7: SigStats.S5_RSI7||{},
        S5_SQZ: SigStats.S5_SQZ||{}
      };
      var m1Stats={
        SQZ: SigStats.SQZ||{},
        EMAChain: SigStats.EMAChain||{},
        RSIEMA: SigStats.RSIEMA||{}
      };

      var pauseBadge=(PauseCtl && PauseCtl.isArmed())
        ? ' <span style="color:#ffcc00">PAUSE '+PauseCtl.remainingFmt()+'</span>'
        : '';

      var signalsBlock =
        'S5 Signals:<br>&nbsp;&nbsp;'+[
          'S5_EMA   [ready '+fmtReady('S5_EMA',12)+' | WR '+wr(s5Stats.S5_EMA)+' | share '+share(s5Stats.S5_EMA)+' | avgScore '+avgScore(s5Stats.S5_EMA)+']',
          'S5_BB    [ready '+fmtReady('S5_BB20',20)+' | WR '+wr(s5Stats.S5_BB)+' | share '+share(s5Stats.S5_BB)+' | avgScore '+avgScore(s5Stats.S5_BB)+']',
          'S5_RSI7  [ready '+fmtReady('S5_RSI7',7)+' | WR '+wr(s5Stats.S5_RSI7)+' | share '+share(s5Stats.S5_RSI7)+' | avgScore '+avgScore(s5Stats.S5_RSI7)+']',
          'S5_SQZ   [ready '+fmtReady('S5_SQZ',20)+' | WR '+wr(s5Stats.S5_SQZ)+' | share '+share(s5Stats.S5_SQZ)+' | avgScore '+avgScore(s5Stats.S5_SQZ)+']'
        ].join('<br>&nbsp;&nbsp;')+
        '<br>M1 Signals:<br>&nbsp;&nbsp;'+[
          'EMAChain [ready '+fmtReady('EMA15',15)+' | WR '+wr(m1Stats.EMAChain)+' | share '+share(m1Stats.EMAChain)+' | avgScore '+avgScore(m1Stats.EMAChain)+']',
          'SQZ      [ready '+fmtReady('SQZ20',20)+' | WR '+wr(m1Stats.SQZ)+' | share '+share(m1Stats.SQZ)+' | avgScore '+avgScore(m1Stats.SQZ)+']',
          'RSIEMA   [ready '+fmtReady('RSIEMA',15)+' | WR '+wr(m1Stats.RSIEMA)+' | share '+share(m1Stats.RSIEMA)+' | avgScore '+avgScore(m1Stats.RSIEMA)+']'
        ].join('<br>&nbsp;&nbsp;');

      var filters=decisionState.filters||{};
      var lastPick=decisionState.lastPick;
      var meta=decisionState.meta||{};
      var activeMode=getActiveMode();
      updateModeButtons(activeMode);
      var decCls=lastPick ? (lastPick.side==='BUY'?'buy':'sell') : 'idle';
      var decScore=lastPick && typeof lastPick.score==='number' ? lastPick.score : (lastPick && lastPick.score!=null ? Number(lastPick.score) : 0);
      var decTxt=lastPick ? (lastPick.name+' '+lastPick.side+' score='+ (isFinite(decScore)?decScore.toFixed(2):'0.00')) : 'IDLE';
      var decisionLine='Decision: '+activeMode+' <span class="v-dec '+decCls+'">'+decTxt+'</span>';
      var payoutSuffix='';
      if(meta.payout!=null && meta.payoutThr!=null){
        var ratio=meta.payout;
        var thr=(meta.payoutThr||0)*100;
        var cmp = (isFinite(ratio) && isFinite(thr) && ratio < thr) ? '&lt;' : '≥';
        payoutSuffix=' ('+fmt2(ratio)+cmp+fmt2(thr)+')';
      }
      var volSuffix='';
      if(meta.atr14!=null && meta.atrMedian20!=null){
        var cmpVol=(meta.atr14<meta.atrMedian20)?'&lt;':'≥';
        volSuffix=' ('+fmt2(meta.atr14)+cmpVol+fmt2(meta.atrMedian20)+')';
      }
      var cooldownSuffix='';
      if(meta.cooldownSec!=null && meta.cooldownThr!=null){
        var sec=Math.max(0, Math.round(meta.cooldownSec));
        var thrCd=Math.max(0, Math.round(meta.cooldownThr));
        var cmpCd=sec<thrCd?'&lt;':'≥';
        cooldownSuffix=' ('+sec+cmpCd+thrCd+')';
      }
      var filtersLine='Filters: payout='+fmtOk(filters.payout)+payoutSuffix+' vol='+fmtOk(filters.vol)+volSuffix+' cooldown='+fmtOk(filters.cooldown)+cooldownSuffix;
      var skips=decisionState.skips||{};
      var skipsLine='Skips: payout '+(skips.payout||0)+' | low_vol '+(skips.low_vol||0)+' | conflict '+(skips.conflict||0)+' | cooldown '+(skips.cooldown||0);

      rightInfo.innerHTML =
        'State: <b>'+modeText+'</b>'+pauseBadge+' | Verter v'+VER+'<br>'+signalsBlock+'<br>'+decisionLine+'<br>'+filtersLine+'<br>'+skipsLine;
    }

    function renderCycleHistory(){
      if(!cycleHistoryBox) return;
      var lines = ['Cycle History:'];
      var historyLines = [];
      try{
        if(typeof getCycleLog === 'function'){
          var log = getCycleLog();
          var history = log && Array.isArray(log.history) ? log.history : [];
          if(history.length){
            var slice = history.slice(0, 5);
            for(var i=0;i<slice.length;i++){
              var entry = slice[i] || {};
              var idStr = entry.id!=null ? ('#'+entry.id) : '#?';
              var arrStr = entry.arrayId!=null ? ('A'+entry.arrayId) : 'A?';
              var resStr = (entry.result || '—').toString().toUpperCase();
              if(resStr.length>8) resStr = resStr.slice(0,8);
              var resPad = resStr.padEnd(5, ' ');
              var pnlVal = (typeof entry.pnl === 'number' && isFinite(entry.pnl)) ? entry.pnl : null;
              var pnlStr = pnlVal!=null ? ((pnlVal>=0?'+':'')+Math.abs(pnlVal).toFixed(2)) : '—';
              var maxStep = (typeof entry.maxStep === 'number' && isFinite(entry.maxStep)) ? entry.maxStep : '—';
              var win = entry.win!=null ? entry.win : 0;
              var loss = entry.loss!=null ? entry.loss : 0;
              var ret = entry.ret!=null ? entry.ret : 0;
              var durMs = entry.durationMs;
              var durStr;
              if(typeof durMs === 'number' && isFinite(durMs) && durMs>0){
                var totalSec = Math.floor(durMs/1000);
                var m = Math.floor(totalSec/60);
                var s = totalSec%60;
                durStr = (m<10?'0':'')+m+':' + (s<10?'0':'')+s;
              }else{
                durStr = '00:00';
              }
              historyLines.push(idStr+' '+arrStr+' '+resPad+'P/L='+pnlStr+' maxStep='+maxStep+' W/L/R='+win+'/'+loss+'/'+ret+' dur='+durStr);
            }
          }
        }
      }catch(e){ historyLines = []; }
      if(!historyLines.length){ historyLines.push('No cycles yet'); }
      cycleHistoryBox.textContent = lines.concat(historyLines).join('\n');
    }

    var unsubscribe=tickSource.subscribe(function(p,ts){ Candles.onTick(p,ts); schedule(); renderHeader(); },200);
    setInterval(renderCycleHistory, 1000);
    renderCycleHistory();
    function stop(){ try{unsubscribe&&unsubscribe();}catch(e){} try{cancelAnimationFrame(raf);}catch(e){} const r = box.getBoundingClientRect(); return {pos:{left:r.left,top:r.top}}; }

    function requestRender(){ renderHeader(); }
    console.log('[VERTER][BOOT] DockBox (chart+panel, drag) v'+VER);
    return { stop, getState:function(){return Candles.getState();}, setMode, setSigReady, incSigHit, requestRender, updateDecision };
  })();

  /* [END MOD:UI] */
  const UI = Object.freeze({ DockBox });

  // [BEGIN MOD:Signals]
  // ===== Signals, Indicators & Providers =====
  var SignalEngine=(function(){
    const state={
      ready:{},
      needs:{ EMA3:3, EMA9:9, EMA15:15, RSI14:14, ATR14:14, SQZ20:20, S5_EMA:12, S5_RSI7:7, S5_BB20:20, S5_SQZ:20 },
      ema:{3:null,9:null,15:null},
      rsi:null,
      atr14:null,
      atrSeries:[],
      atrMedian20:null,
      squeeze:{on:null, prevOn:null, momentum:0, basis:null, bbWidth:null, kcWidth:null, pending:null, lastReleaseTs:0},
      price:null,
      candles:[],
      closes:[],
      s5:{
        candles:[],
        closes:[],
        ema5:null,
        ema12:null,
        slope5:0,
        rsi7:null,
        rsiSeries:[],
        bb:{basis:null, upper:null, lower:null, width:null},
        atr14:null,
        atr20:null,
        squeeze:{on:false, momentum:0, bbWidth:null, kcWidth:null, basis:null}
      },
      candidates:[],
      lastUpdate:0
    };

    function ensureSigStats(){
      if(typeof SigStats==='object' && SigStats){
        ['SQZ','EMAChain','RSIEMA','MAMA','S5_EMA','S5_BB','S5_RSI7','S5_SQZ'].forEach(function(name){
          if(!SigStats[name]){
            SigStats[name]={open:0,win:0,loss:0,ret:0,sumScore:0,opensAt:[]};
          }else{
            if(typeof SigStats[name].sumScore!=='number') SigStats[name].sumScore=SigStats[name].sumScore||0;
            if(!Array.isArray(SigStats[name].opensAt)) SigStats[name].opensAt=[];
          }
        });
      }
    }

    function setReady(name, have, need){
      state.ready[name]=have||0;
      if(need!=null) state.needs[name]=need;
      try{ DockBox.setSigReady(name, have, need); }catch(e){}
    }

    function ema(arr, period){
      if(arr.length<=0) return [];
      var k=2/(period+1);
      var out=[];
      var prev=arr[0];
      for(var i=0;i<arr.length;i++){
        if(i===0){ prev=arr[i]; }
        else{ prev=arr[i]*k + prev*(1-k); }
        out.push(prev);
      }
      return out;
    }

    function sma(arr,len){
      if(arr.length<len) return [];
      var out=[], sum=0;
      for(var i=0;i<arr.length;i++){
        sum+=arr[i];
        if(i>=len) sum-=arr[i-len];
        if(i>=len-1) out.push(sum/len);
      }
      return out;
    }

    function stdev(arr,len){
      if(arr.length<len) return [];
      var out=[], q=[], sum=0;
      for(var i=0;i<arr.length;i++){
        q.push(arr[i]);
        sum+=arr[i];
        if(q.length>len) sum-=q.shift();
        if(q.length===len){
          var mean=sum/len;
          var s=0;
          for(var j=0;j<q.length;j++){
            var diff=q[j]-mean;
            s+=diff*diff;
          }
          out.push(Math.sqrt(s/len));
        }
      }
      return out;
    }

    function linregSlope(arr,len){
      if(arr.length<len) return 0;
      var slice=arr.slice(-len);
      var n=slice.length;
      var sx=0, sy=0, sxx=0, sxy=0;
      for(var i=0;i<n;i++){
        var x=i+1;
        var y=slice[i];
        sx+=x;
        sy+=y;
        sxx+=x*x;
        sxy+=x*y;
      }
      var denom=n*sxx - sx*sx;
      if(denom===0) return 0;
      return (n*sxy - sx*sy)/denom;
    }

    function calcRSISeriesFull(closes, period){
      if(closes.length<=period) return [];
      var gains=0, losses=0;
      for(var i=1;i<=period;i++){
        var diff=closes[i]-closes[i-1];
        if(diff>=0) gains+=diff; else losses-=diff;
      }
      var avgGain=gains/period;
      var avgLoss=losses/period;
      var values=[];
      var rs=avgLoss===0?Infinity:avgGain/avgLoss;
      values.push(100 - (100/(1+rs)));
      for(var j=period+1;j<closes.length;j++){
        var d=closes[j]-closes[j-1];
        var gain=d>0?d:0;
        var loss=d<0?-d:0;
        avgGain=((avgGain*(period-1))+gain)/period;
        avgLoss=((avgLoss*(period-1))+loss)/period;
        rs=avgLoss===0?Infinity:avgGain/avgLoss;
        values.push(100 - (100/(1+rs)));
      }
      return values;
    }

    function calcRSI(closes, period){
      var series=calcRSISeriesFull(closes, period);
      return series.length?series[series.length-1]:null;
    }

    function calcTR(candle, prevClose){
      var high=candle.H;
      var low=candle.L;
      var close=candle.C;
      var tr=Math.max(high-low, Math.abs(high-prevClose), Math.abs(low-prevClose));
      return {tr:tr, close:close};
    }

    function calcATRSeries(candles, period){
      if(candles.length<2) return [];
      var trs=[];
      var prevClose=candles[0].C;
      for(var i=1;i<candles.length;i++){
        var res=calcTR(candles[i], prevClose);
        trs.push(res.tr);
        prevClose=res.close;
      }
      if(trs.length<period) return [];
      var out=[];
      var sum=0;
      for(var j=0;j<trs.length;j++){
        sum+=trs[j];
        if(j>=period) sum-=trs[j-period];
        if(j>=period-1){ out.push(sum/period); }
      }
      return out;
    }

    function median(arr){
      if(!arr.length) return null;
      var copy=arr.slice().sort(function(a,b){ return a-b; });
      var mid=Math.floor(copy.length/2);
      if(copy.length%2) return copy[mid];
      return (copy[mid-1]+copy[mid])/2;
    }

    function updateIndicators(){
      var st=Candles.getState();
      var m1=st && st.m1 ? st.m1 : {candles:[],cur:null};
      var candles=m1.candles ? m1.candles.slice(-260) : [];
      if(m1.cur){
        candles=candles.concat([{O:m1.cur.O,H:m1.cur.H,L:m1.cur.L,C:m1.cur.lastP}]);
      }
      if(!candles.length){
        state.candles=[];
        state.closes=[];
        state.price=null;
        setReady('EMA3',0,3);
        setReady('EMA9',0,9);
        setReady('EMA15',0,15);
        setReady('RSI14',0,14);
        setReady('ATR14',0,14);
        setReady('SQZ20',0,20);
        setReady('S5_EMA',0,12);
        setReady('S5_RSI7',0,7);
        setReady('S5_BB20',0,20);
        setReady('S5_SQZ',0,20);
        return;
      }
      var closes=candles.map(function(c){ return c.C; });
      state.candles=candles;
      state.closes=closes;
      state.price=closes[closes.length-1];
      state.lastUpdate=Date.now();

      function lastVal(arr){ return arr.length ? arr[arr.length-1] : null; }

      setReady('EMA3', Math.min(closes.length,3), 3);
      setReady('EMA9', Math.min(closes.length,9), 9);
      setReady('EMA15', Math.min(closes.length,15), 15);
      state.ema[3]=lastVal(ema(closes,3));
      state.ema[9]=lastVal(ema(closes,9));
      state.ema[15]=lastVal(ema(closes,15));

      setReady('RSI14', Math.min(closes.length,14), 14);
      state.rsi=calcRSI(closes,14);

      var atrSeries=calcATRSeries(candles,14);
      state.atrSeries=atrSeries;
      state.atr14=atrSeries.length?atrSeries[atrSeries.length-1]:null;
      var atrForMedian=atrSeries.slice(-20);
      state.atrMedian20=atrForMedian.length?median(atrForMedian):null;
      setReady('ATR14', Math.min(candles.length,14), 14);

      var squeezeInfo=null;
      if(closes.length>=20){
        var sma20=sma(closes,20);
        var std20=stdev(closes,20);
        var atr20Series=calcATRSeries(candles,20);
        if(sma20.length && std20.length && atr20Series.length){
          var basis=lastVal(sma20);
          var sd=lastVal(std20);
          var atr20=lastVal(atr20Series);
          var upperBB=basis + 2*sd;
          var lowerBB=basis - 2*sd;
          var rangeBB=upperBB - lowerBB;
          var rangeKC=3*atr20;
          var momentum=linregSlope(closes, Math.min(20, closes.length));
          squeezeInfo={ on:(rangeBB<=rangeKC), momentum:momentum, basis:basis, bbWidth:rangeBB, kcWidth:rangeKC };
        }
      }
      if(squeezeInfo){
        setReady('SQZ20', Math.min(closes.length,20), 20);
        var sq=state.squeeze;
        sq.prevOn = sq.on;
        sq.on = squeezeInfo.on;
        sq.momentum=squeezeInfo.momentum;
        sq.basis=squeezeInfo.basis;
        sq.bbWidth=squeezeInfo.bbWidth;
        sq.kcWidth=squeezeInfo.kcWidth;
        if(sq.prevOn===null) sq.prevOn=sq.on;
        if(sq.prevOn===true && sq.on===false){
          var side = sq.momentum>0 ? 'BUY' : (sq.momentum<0 ? 'SELL' : null);
          if(side){
            sq.pending={name:'SQZ', side:side, strength:0.65, tags:{momentum:sq.momentum, basis:sq.basis}};
            sq.lastReleaseTs=Date.now();
          }
        }
      }else{
        setReady('SQZ20', Math.min(closes.length,20), 20);
      }

      var s5State=st && st.s5 ? st.s5 : {candles:[],cur:null};
      var s5Candles=Array.isArray(s5State.candles)?s5State.candles.slice(-400):[];
      if(s5State.cur){ s5Candles=s5Candles.concat([s5State.cur]); }
      state.s5.candles=s5Candles;
      var s5Closes=s5Candles.map(function(c){ return c.close; });
      state.s5.closes=s5Closes;
      state.s5.rsiSeries = calcRSISeriesFull(s5Closes,7);
      var haveS5=s5Closes.length;
      setReady('S5_EMA', haveS5, 12);
      setReady('S5_RSI7', haveS5, 7);
      setReady('S5_BB20', haveS5, 20);
      setReady('S5_SQZ', haveS5, 20);
      var ema5Series=ema(s5Closes,5);
      var ema12Series=ema(s5Closes,12);
      state.s5.ema5=ema5Series.length?ema5Series[ema5Series.length-1]:null;
      state.s5.ema12=ema12Series.length?ema12Series[ema12Series.length-1]:null;
      state.s5.slope5=ema5Series.length?linregSlope(ema5Series, Math.min(3, ema5Series.length)):0;
      state.s5.rsi7=state.s5.rsiSeries.length?state.s5.rsiSeries[state.s5.rsiSeries.length-1]:null;
      var bbBasisSeries=sma(s5Closes,20);
      var bbStdSeries=stdev(s5Closes,20);
      if(bbBasisSeries.length && bbStdSeries.length){
        var basisS5=bbBasisSeries[bbBasisSeries.length-1];
        var sdS5=bbStdSeries[bbStdSeries.length-1];
        state.s5.bb={ basis:basisS5, upper:basisS5+2*sdS5, lower:basisS5-2*sdS5, width:4*sdS5 };
      }else{
        state.s5.bb={ basis:null, upper:null, lower:null, width:null };
      }
      var s5Ohlc=s5Candles.map(function(c){ return {O:c.open,H:c.high,L:c.low,C:c.close}; });
      var atr14S5=calcATRSeries(s5Ohlc,14);
      var atr20S5=calcATRSeries(s5Ohlc,20);
      state.s5.atr14=atr14S5.length?atr14S5[atr14S5.length-1]:null;
      state.s5.atr20=atr20S5.length?atr20S5[atr20S5.length-1]:null;
      var bbWidth=state.s5.bb.width;
      var kcWidth=(state.s5.atr20!=null)?(3*state.s5.atr20):null;
      var momentumS5=linregSlope(s5Closes, Math.min(20, s5Closes.length));
      state.s5.squeeze={ on:(bbWidth!=null && kcWidth!=null ? bbWidth<=kcWidth : false), momentum:momentumS5, bbWidth:bbWidth, kcWidth:kcWidth, basis:state.s5.bb.basis };
      try{ console.log('[S5][IND] ema5=%s ema12=%s slope=%s rsi7=%s bbW=%s kcW=%s', fmt2(state.s5.ema5), fmt2(state.s5.ema12), fmt2(state.s5.slope5), fmt2(state.s5.rsi7), fmt2(bbWidth), fmt2(kcWidth)); }catch(err){}
    }

    function boolChain(side){
      var e3=state.ema[3], e9=state.ema[9], e15=state.ema[15];
      if([e3,e9,e15].some(function(v){ return v==null; })) return false;
      if(side==='BUY') return e3>e9 && e9>e15;
      if(side==='SELL') return e3<e9 && e9<e15;
      return false;
    }

    function collectCandidates(){
      ensureSigStats();
      updateIndicators();
      var cfgSignals=(globalThis.__VERTER_CFG__ && globalThis.__VERTER_CFG__.signals) || {};
      var cands=[];
      var trendBuy=boolChain('BUY');
      var trendSell=boolChain('SELL');
      var rsi=state.rsi;
      var s5=state.s5 || {};
      var lastS5=s5.candles.length?s5.candles[s5.candles.length-1]:null;
      var prevRsi7=s5.rsiSeries.length>1?s5.rsiSeries[s5.rsiSeries.length-2]:null;
      var currRsi7=s5.rsiSeries.length?s5.rsiSeries[s5.rsiSeries.length-1]:null;

      if(s5.ema5!=null && s5.ema12!=null && s5.slope5!=null){
        if(trendBuy && s5.ema5>s5.ema12 && s5.slope5>0){
          cands.push({name:'S5_EMA', side:'BUY', strength:0.60, tags:{ema5:s5.ema5, ema12:s5.ema12, slope:s5.slope5}});
        }
        if(trendSell && s5.ema5<s5.ema12 && s5.slope5<0){
          cands.push({name:'S5_EMA', side:'SELL', strength:0.60, tags:{ema5:s5.ema5, ema12:s5.ema12, slope:s5.slope5}});
        }
      }

      if(lastS5 && s5.bb && s5.bb.basis!=null){
        if(trendBuy && lastS5.low!=null && lastS5.low<=s5.bb.lower && lastS5.close>s5.bb.basis){
          cands.push({name:'S5_BB_Pullback', side:'BUY', strength:0.55, tags:{close:lastS5.close, basis:s5.bb.basis, lower:s5.bb.lower}});
        }
        if(trendSell && lastS5.high!=null && lastS5.high>=s5.bb.upper && lastS5.close<s5.bb.basis){
          cands.push({name:'S5_BB_Pullback', side:'SELL', strength:0.55, tags:{close:lastS5.close, basis:s5.bb.basis, upper:s5.bb.upper}});
        }
      }

      if(currRsi7!=null && prevRsi7!=null){
        if(trendBuy && prevRsi7<=50 && currRsi7>50){
          cands.push({name:'S5_RSI7', side:'BUY', strength:0.50, tags:{rsi:currRsi7, prev:prevRsi7}});
        }
        if(trendSell && prevRsi7>=50 && currRsi7<50){
          cands.push({name:'S5_RSI7', side:'SELL', strength:0.50, tags:{rsi:currRsi7, prev:prevRsi7}});
        }
      }

      if(s5.squeeze && s5.squeeze.on){
        if(trendBuy && s5.squeeze.momentum>0){
          cands.push({name:'S5_SQZmini', side:'BUY', strength:0.62, tags:{momentum:s5.squeeze.momentum, bbWidth:s5.squeeze.bbWidth, kcWidth:s5.squeeze.kcWidth}});
        }
        if(trendSell && s5.squeeze.momentum<0){
          cands.push({name:'S5_SQZmini', side:'SELL', strength:0.62, tags:{momentum:s5.squeeze.momentum, bbWidth:s5.squeeze.bbWidth, kcWidth:s5.squeeze.kcWidth}});
        }
      }

      if(cfgSignals.useEMAChain!==false){
        if(trendBuy){
          cands.push({name:'EMAChain', side:'BUY', strength:0.60, tags:{ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15]}});
        }else if(trendSell){
          cands.push({name:'EMAChain', side:'SELL', strength:0.60, tags:{ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15]}});
        }
      }

      if(cfgSignals.useSQZ!==false){
        var pending=state.squeeze.pending;
        if(pending){
          if((pending.side==='BUY' && trendBuy) || (pending.side==='SELL' && trendSell)){
            cands.push(pending);
          }
          state.squeeze.pending=null;
        }
      }

      if(cfgSignals.useRSIEMA!==false){
        if(rsi!=null){
          if(trendBuy && rsi>=55){
            cands.push({name:'RSIEMA', side:'BUY', strength:0.55, tags:{rsi:rsi, ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15]}});
          }else if(trendSell && rsi<=45){
            cands.push({name:'RSIEMA', side:'SELL', strength:0.55, tags:{rsi:rsi, ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15]}});
          }
        }
      }

      state.candidates=cands;
      return cands;
    }

    function getState(){
      return {
        ready: Object.assign({}, state.ready),
        needs: Object.assign({}, state.needs),
        ema: Object.assign({}, state.ema),
        rsi: state.rsi,
        atr14: state.atr14,
        atrMedian20: state.atrMedian20,
        squeeze: Object.assign({}, state.squeeze),
        price: state.price,
        closes: state.closes.slice(),
        candles: state.candles.slice(),
        s5: {
          candles: state.s5.candles.slice(),
          closes: state.s5.closes.slice(),
          ema5: state.s5.ema5,
          ema12: state.s5.ema12,
          slope5: state.s5.slope5,
          rsi7: state.s5.rsi7,
          rsiSeries: state.s5.rsiSeries.slice(),
          bb: state.s5.bb ? Object.assign({}, state.s5.bb) : null,
          atr14: state.s5.atr14,
          atr20: state.s5.atr20,
          squeeze: state.s5.squeeze ? Object.assign({}, state.s5.squeeze) : null
        },
        lastUpdate: state.lastUpdate,
        candidates: state.candidates.slice()
      };
    }

    var SIG={
      dump:function(){
        try{
          var ctx = (typeof DecisionEngine!=='undefined' && DecisionEngine && typeof DecisionEngine.buildCtx==='function') ? DecisionEngine.buildCtx() : null;
          var data=state.candidates.map(function(c){
            var scored=null;
            if(ctx && DecisionEngine && typeof DecisionEngine.scoreCandidate==='function'){
              scored=DecisionEngine.scoreCandidate(c, ctx);
            }
            return {
              name:c.name,
              side:c.side,
              strength:c.strength,
              score:scored && typeof scored.score==='number'?scored.score:null,
              parts:scored && scored.parts?scored.parts:null,
              tags:c.tags
            };
          });
          console.log('[SIG.dump]', data);
        }catch(e){ try{ console.log('[SIG.dump][ERR]', e); }catch(err){} }
      }
    };
    try{ globalThis.SIG = SIG; }catch(e){}
    try{ globalThis.S5 = state.s5; }catch(e){}

    return { collectCandidates, getState, ensureSigStats };
  })();

  /* [END MOD:Signals] */
  const Signals = Object.freeze({ collectCandidates: SignalEngine.collectCandidates, getState: SignalEngine.getState });
  /* [END MOD:Signals] */
  const Signals = Object.freeze({ collectCandidates: SignalEngine.collectCandidates, getState: SignalEngine.getState });
  /* [END MOD:Signals] */
  const Signals = Object.freeze({ collectCandidates: SignalEngine.collectCandidates, getState: SignalEngine.getState });

  // [BEGIN MOD:Decision]
  const DecisionState=(function(){
    const base=(typeof globalThis.DecisionState==='object' && globalThis.DecisionState)?globalThis.DecisionState:{};
    base.lastPick=base.lastPick||null;
    base.filters=Object.assign({payout:null,vol:null,cooldown:null}, base.filters||{});
    base.skips=Object.assign({payout:0,low_vol:0,cooldown:0,conflict:0}, base.skips||{});
    base.meta=Object.assign({payout:null,payoutThr:null,atr14:null,atrMedian20:null,cooldownSec:null,cooldownThr:null}, base.meta||{});
    base.mode=base.mode||null;
    try{ globalThis.DecisionState=base; }catch(e){}
    return base;
  })();

  var DecisionEngine=(function(){
    const CFG={
      signals:{useEMAChain:true,useSQZ:true,useRSIEMA:true,useMAMA:false},
      thresholds:{payoutMin:0.90},
      activeMode:'FAST5S',
      modes:{
        FAST5S:{
          scoreMin:0.72,
          cooldownSec:8,
          payoutMin:null,
          weights:{wSig:0.55,wTrend:0.25,wVol:0.10,wRSI:0.05,wSQZ:0.05,wCandle:0.15}
        },
        M1:{
          scoreMin:0.70,
          cooldownSec:60,
          payoutMin:null,
          weights:{wSig:0.60,wTrend:0.20,wVol:0.10,wRSI:0.05,wSQZ:0.05,wCandle:0.10}
        }
      },
      sig:function(next){ if(next&&typeof next==='object'){ Object.assign(this.signals, next); try{ DockBox.requestRender(); }catch(e){} } return this.signals; },
      th:function(next){ if(next&&typeof next==='object'){ Object.assign(this.thresholds, next); if(next.payoutMin!=null){ var v=Math.max(0.5, Math.min(1.0, +next.payoutMin)); this.thresholds.payoutMin=v; Object.keys(this.modes).forEach(function(k){ this.modes[k].payoutMin=v; }, this); } try{ DockBox.requestRender(); }catch(e){} } return this.thresholds; },
      w:function(next){ if(next&&typeof next==='object'){ Object.assign(this.modes.M1.weights, next); try{ DockBox.requestRender(); }catch(e){} } return this.modes.M1.weights; },
      setMode:function(name){
        if(!name || !this.modes[name]) return this.activeMode;
        if(this.activeMode===name) return this.activeMode;
        this.activeMode=name;
        DecisionState.mode=name;
        try{ localStorage.setItem('verter.mode', name); }catch(e){}
        try{ console.log('[MODE] switched to '+name); }catch(e){}
        try{ DockBox.updateDecision({ mode:name }); }catch(e){}
        try{ DockBox.requestRender(); }catch(e){}
        return this.activeMode;
      }
    };
    Object.keys(CFG.modes).forEach(function(name){ CFG.modes[name].payoutMin=CFG.thresholds.payoutMin; });
    try{
      const saved=localStorage.getItem('verter.mode');
      if(saved && CFG.modes[saved]){ CFG.activeMode=saved; }
    }catch(e){}
    DecisionState.mode=CFG.activeMode;
    try{
      const savedPM=parseFloat(localStorage.getItem('verter.payoutMin'));
      if(!isNaN(savedPM)){
        CFG.thresholds.payoutMin=Math.max(0.5, Math.min(1.0, savedPM));
        Object.keys(CFG.modes).forEach(function(name){ CFG.modes[name].payoutMin=CFG.thresholds.payoutMin; });
      }
    }catch(e){}
    try{ globalThis.__VERTER_CFG__=CFG; globalThis.CFG = CFG; }catch(e){}

    const state={
      lastDecision:null,
      lastConflict:null,
      skips:{payout:0, low_vol:0, cooldown:0, conflict:0},
      lastFilters:{payout:null, vol:null, cooldown:null},
      lastCtx:null,
      lastTradeTs:0
    };

    function boolSide(entry, side){
      if(entry==null) return false;
      if(typeof entry==='function') return !!entry(side);
      if(typeof entry==='object'){ return !!entry[side]; }
      return !!entry;
    }

    function analyzeCandles(candles){
      var res={boost:{BUY:0,SELL:0}, block:{BUY:false,SELL:false}};
      if(!Array.isArray(candles) || candles.length<3) return res;
      var closed=candles.slice();
      if(closed.length>1){ closed=closed.slice(0,-1); }
      if(closed.length<2) return res;
      var cur=closed[closed.length-1];
      var prev=closed[closed.length-2];
      function isBullishEngulf(p, c){
        if(!p||!c) return false;
        return p.C<p.O && c.C>c.O && c.O<=p.C && c.C>=p.O;
      }
      function isBearishEngulf(p, c){
        if(!p||!c) return false;
        return p.C>p.O && c.C<c.O && c.O>=p.C && c.C<=p.O;
      }
      if(isBullishEngulf(prev, cur)) res.boost.BUY=0.15;
      if(isBearishEngulf(prev, cur)) res.boost.SELL=0.15;
      return res;
    }

    function buildCtxInternal(){
      var snap=SignalEngine.getState();
      var rsi=snap.rsi;
      var atr14=snap.atr14;
      var atrMedian=snap.atrMedian20;
      var trendMap={
        BUY: snap.ema && snap.ema[3]!=null && snap.ema[9]!=null && snap.ema[15]!=null && snap.ema[3]>snap.ema[9] && snap.ema[9]>snap.ema[15],
        SELL: snap.ema && snap.ema[3]!=null && snap.ema[9]!=null && snap.ema[15]!=null && snap.ema[3]<snap.ema[9] && snap.ema[9]<snap.ema[15]
      };
      var rsiMap={
        BUY: rsi!=null && rsi>=55,
        SELL: rsi!=null && rsi<=45
      };
      var s5=snap.s5||{};
      var sqzMap={BUY:false,SELL:false};
      if(s5.squeeze){
        sqzMap.BUY = !!(s5.squeeze.on && s5.squeeze.momentum>0);
        sqzMap.SELL = !!(s5.squeeze.on && s5.squeeze.momentum<0);
      }
      if(!sqzMap.BUY && !sqzMap.SELL && snap.squeeze){
        var sq=snap.squeeze;
        if(sq.momentum!=null){
          if(sq.momentum>0) sqzMap.BUY=true;
          if(sq.momentum<0) sqzMap.SELL=true;
        }
      }
      var candleInfo=analyzeCandles(snap.candles||[]);
      var candleBoost={BUY:candleInfo.boost.BUY||0, SELL:candleInfo.boost.SELL||0};
      var payoutRaw=readProfitPercent();
      var modeCfg=CFG.modes[CFG.activeMode] || CFG.modes.M1;
      var payoutOk=payoutRaw!=null ? (payoutRaw/100)>=modeCfg.payoutMin : false;
      var volOk=(atr14!=null && atrMedian!=null) ? atr14>=atrMedian : false;
      var since = state.lastTradeTs? Math.floor((Date.now()-state.lastTradeTs)/1000):1e9;
      var cooldownOk=since>=modeCfg.cooldownSec;
      var filters={ payout:payoutOk, vol:volOk, cooldown:cooldownOk };
      var ctx={
        mode: CFG.activeMode,
        trendOk: trendMap,
        rsiOk: rsiMap,
        volOk: volOk,
        sqzOk: sqzMap,
        candleBoost: candleBoost,
        payout: payoutRaw,
        atr14: atr14,
        atrMedian20: atrMedian,
        secsSinceLastTrade: since,
        filters: filters,
        s5: s5
      };
      DecisionState.mode=CFG.activeMode;
      return ctx;
    }

    function scoreCandidate(c, ctx, mode){
      var activeMode=mode || CFG.activeMode;
      var modeCfg=CFG.modes[activeMode] || CFG.modes.M1;
      var W=modeCfg.weights;
      var trendVal=ctx && ctx.trendOk && ctx.trendOk[c.side]?1:0;
      var volVal=ctx && ctx.volOk?1:0;
      var rsiVal=ctx && ctx.rsiOk && ctx.rsiOk[c.side]?1:0;
      var sqzVal=ctx && ctx.sqzOk && ctx.sqzOk[c.side]?1:0;
      var candleVal=ctx && ctx.candleBoost && ctx.candleBoost[c.side]?ctx.candleBoost[c.side]:0;
      var score=(W.wSig*(c.strength||0)) + (W.wTrend*trendVal) + (W.wVol*volVal) + (W.wRSI*rsiVal) + (W.wSQZ*sqzVal) + (W.wCandle*candleVal);
      return { score:score, parts:{trend:trendVal, vol:volVal, rsi:rsiVal, sqz:sqzVal, candle:candleVal} };
    }

    function pickBest(cands, ctx){
      if(!Array.isArray(cands) || !cands.length){ state.lastConflict=null; return null; }
      var modeCfg=CFG.modes[CFG.activeMode] || CFG.modes.M1;
      var arr=cands.map(function(c){
        var scored=scoreCandidate(c, ctx, CFG.activeMode);
        return Object.assign({}, c, { score:scored.score, parts:scored.parts });
      }).filter(function(x){ return x.score>=modeCfg.scoreMin; });
      arr.sort(function(a,b){ return b.score-a.score; });
      if(!arr.length){ state.lastConflict=null; return null; }
      var top=arr[0];
      var rival=arr.find(function(x){ return x.side!==top.side; });
      if(rival && Math.abs(top.score-rival.score)<0.03){
        var prio=['S5_SQZmini','S5_EMA','S5_BB_Pullback','S5_RSI7_Impulse','SQZ','EMAChain','RSIEMA'];
        var topIdx=prio.indexOf(top.name);
        var rivalIdx=prio.indexOf(rival.name);
        if(rivalIdx!==-1 && (topIdx===-1 || rivalIdx<topIdx)){
          state.lastConflict=null;
          return rival;
        }
        if(topIdx===rivalIdx){
          state.lastConflict={top:top,rival:rival,delta:Math.abs(top.score-rival.score)};
          return null;
        }
      }
      state.lastConflict=null;
      return top;
    }

    function updateFilters(filters){
      state.lastFilters=filters;
      if(filters){
        if(filters.payout!==undefined) DecisionState.filters.payout=filters.payout;
        if(filters.vol!==undefined) DecisionState.filters.vol=filters.vol;
        if(filters.cooldown!==undefined) DecisionState.filters.cooldown=filters.cooldown;
      }
      try{ DockBox.updateDecision({ filters:filters, lastPick:DecisionState.lastPick, mode:CFG.activeMode }); }catch(e){}
    }

    function buildMeta(ctx){
      if(!ctx) return null;
      var modeCfg=CFG.modes[CFG.activeMode] || CFG.modes.M1;
      return {
        payout: ctx.payout,
        payoutThr: modeCfg.payoutMin,
        atr14: ctx.atr14,
        atrMedian20: ctx.atrMedian20,
        cooldownSec: ctx.secsSinceLastTrade,
        cooldownThr: modeCfg.cooldownSec
      };
    }

    function noteDecision(decision, ctx){
      if(decision) state.lastDecision=decision;
      if(ctx) state.lastCtx=ctx;
      const activeCtx=ctx || state.lastCtx || null;
      const filtersData=activeCtx && activeCtx.filters ? activeCtx.filters : state.lastFilters;
      if(filtersData){
        if(filtersData.payout!==undefined) DecisionState.filters.payout=filtersData.payout;
        if(filtersData.vol!==undefined) DecisionState.filters.vol=filtersData.vol;
        if(filtersData.cooldown!==undefined) DecisionState.filters.cooldown=filtersData.cooldown;
      }
      const meta=buildMeta(activeCtx);
      if(meta){ Object.assign(DecisionState.meta, meta); }
      DecisionState.lastPick = decision ? { name:decision.name, side:decision.side, score:+decision.score||0 } : null;
      DecisionState.mode=CFG.activeMode;
      var display = decision || state.lastDecision || null;
      var scoreVal = display && display.score!=null ? Number(display.score) : null;
      var displayStr = display ? (display.name+' '+display.side+' score='+((scoreVal!=null && isFinite(scoreVal))?scoreVal.toFixed(2):'0.00')) : '—';
      try{
        DockBox.updateDecision({ last: displayStr, lastPick: DecisionState.lastPick, filters: filtersData, meta, mode: CFG.activeMode });
      }catch(e){}
    }

    function noteSkip(reason){
      if(reason && state.skips.hasOwnProperty(reason)){
        state.skips[reason]++;
        DecisionState.skips[reason]=(DecisionState.skips[reason]||0)+1;
        try{ DockBox.updateDecision({ skips:{ [reason]:1 }, mode:CFG.activeMode }); }catch(e){}
      }
    }

    function noteTradeOpen(){ state.lastTradeTs=Date.now(); }

    function secsSinceLastTrade(){ return state.lastTradeTs? Math.floor((Date.now()-state.lastTradeTs)/1000):1e9; }

    function getLastConflict(){ return state.lastConflict; }

    return {
      CFG,
      buildCtx:buildCtxInternal,
      pickBest,
      scoreCandidate,
      updateFilters,
      noteDecision,
      noteSkip,
      noteTradeOpen,
      secsSinceLastTrade,
      getLastConflict
    };
  })();

  function buildCtx(){ return DecisionEngine.buildCtx(); }

  /* [END MOD:Decision] */
  /* [END MOD:Decision] */

  // [BEGIN MOD:TradeIO]
  // ===== Hotkey Driver (Shift+W/S only) =====
  var HotkeyDriver=(function(){
    function hotkey(side){
      try{
        var keyCode = side==='BUY' ? 87 : 83; // W / S
        var ev = new KeyboardEvent('keyup', { keyCode:keyCode, which:keyCode, key:(side==='BUY'?'w':'s'), shiftKey:true, bubbles:true, cancelable:true });
        return document.dispatchEvent(ev);
      }catch(e){ return false; }
    }
    function trade(side){ try{ document.body.click(); }catch(e){} return hotkey(side); }
    return { trade };
  })();

  // ===== Stake reader =====
  function readStake(){
    var cand = document.querySelector('input[type="text"][inputmode="decimal"], input[type="number"], input[name*="amount"], [class*="deal-amount"] input');
    var v=null; if(cand){ v = normMoney(cand.value || cand.getAttribute('value') || cand.getAttribute('placeholder')); }
    if(v==null){ var n = document.querySelector('[class*="amount"], [class*="stake"], [class*="sum"]'); v = normMoney(n && n.textContent); }
    return v!=null?v:null;
  }

  function pressKey(code){ try{ return document.dispatchEvent(new KeyboardEvent('keyup',{ keyCode:code, shiftKey:true, bubbles:true, cancelable:true })); }catch(e){ return false; } }
  function increaseBet(){ return pressKey(68); } // Shift+D
  function decreaseBet(){ return pressKey(65); } // Shift+A
  function buy(){ return pressKey(87); }        // Shift+W
  function sell(){ return pressKey(83); }       // Shift+S

  function readProfitPercent(){
    try{
      var n = document.getElementsByClassName('value__val-start')[0];
      var s = n && (n.innerText||n.textContent)||'';
      var m = s.match(/\d+/);
      return m?parseInt(m[0],10):null;
    }catch(e){ return null; }
  }

  function smartBet(step, side){
    const p = readProfitPercent();
    if(p!=null && p<90){
      console.log('%c BET IS NOT RECOMMENDED. Aborting mission! ', 'background: #B90000; color: #ffffff');
      return false;
    }
    let steps=0; for(let i=0;i<betArray.length;i++){ if(step===betArray[i].step){ steps=betArray[i].pressCount; break; } }
    for(let i=0;i<30;i++){ setTimeout(decreaseBet, i); }
    setTimeout(function(){ for(let i=0;i<steps;i++){ setTimeout(increaseBet, i); } }, 50);
    setTimeout(function(){ side==='BUY'?buy():sell(); }, 100);
    return true;
  }

  /* [END MOD:TradeIO] */
  const TradeIO = Object.freeze({ HotkeyDriver, readStake, readProfitPercent, smartBet, buy, sell });

  // ===== Trade gate: одна ставка за раз =====
  var TradeGate = { busy:false, tOpen:0 };
  setInterval(function(){
    if (TradeGate.busy && Date.now()-TradeGate.tOpen > 120000){
      console.warn('[TRADE][GUARD] force-unlock after 120s without DOM close');
      TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
    }
  }, 5000);

  // [BEGIN MOD:ResultObserver]
  // ===== Legacy Trades Observer (logic unchanged; added guards+dedupe only) =====
  window.betHistory = window.betHistory || [];
  function bootLegacyObserver(){
    let targetDiv = document.getElementsByClassName("scrollbar-container deals-list ps")[0];
    if(!targetDiv){
      console.warn('[TRADES] legacy target not found at boot; will retry');
      let tries=0; let iv=setInterval(function(){
        targetDiv = document.getElementsByClassName("scrollbar-container deals-list ps")[0];
        if(targetDiv || ++tries>60){ clearInterval(iv); if(targetDiv) attach(targetDiv); }
      },1000);
    } else attach(targetDiv);

    function attach(target){
      const recent = new Set();
      function remember(key){
        recent.add(key);
        if(recent.size>32){ const it=recent.values(); recent.delete(it.next().value); }
      }
      let observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if(!mutation.addedNodes || !mutation.addedNodes.length) return;
          const node = mutation.addedNodes[0];
          if(!node || node.nodeType!==1) return; // only ELEMENT_NODE

          // антидубль по содержимому строки
          const key = (node.textContent||'').slice(0,256);
          if(key && recent.has(key)) return;

          try{
            // ОРИГИНАЛЬНАЯ ЛОГИКА: читаем два индикатора price-up
            function hasClass(element, className) {
              return !!(element && element.classList && element.classList.contains(className));
            }
            // строго тот же путь в DOM, но под try/catch
            let newDeal = node;
            let centerDiv = newDeal.childNodes[0].children[0].children[1].children[1];
            let lastDiv   = newDeal.childNodes[0].children[0].children[1].children[2];

            let centerUp = hasClass(centerDiv, 'price-up');
            let lastUp   = hasClass(lastDiv,   'price-up');

            let tradeStatus;
            if (centerUp && lastUp) tradeStatus = 'won';
            else if (centerUp && !lastUp) tradeStatus = 'returned';
            else tradeStatus = 'lost';

            if (window.betHistory.length > 0){
              // перехват setter'а произойдёт в TradeBridge.arm()
              window.betHistory[window.betHistory.length - 1].won = tradeStatus;
            }
            console.log('Bet status: ',tradeStatus);
            remember(key);
          }catch(e){
            if(DEBUG) console.warn('[TRADES][PARSE][SKIP]', e&&e.message);
          }
        });
      });
      observer.observe(target, { childList:true });
      console.log('[TRADES][BOOT] legacy observer attached');
    }
  }
  bootLegacyObserver();

  /* [END MOD:ResultObserver] */
  const ResultObserver = Object.freeze({ boot: bootLegacyObserver });

  // [BEGIN MOD:Bridge]
  // ===== Bridge: перехват присвоения .won для подсчётов =====
  var pendingStepForLog=null;

  var TradeBridge=(function(){
    var pending=null; // {id, side, amount, step, tOpen, pre, sig, sent, openedAt}
    function arm(side, amount, meta){
      const rec = {};
      Object.defineProperty(rec,'won',{
        set:function(v){
          var type = v==='won'?'WIN':(v==='lost'?'LOSS':'RET');
          try{ PauseCtl.noteResult(type); }catch(e){}
          var bal = BalanceStable.getStable() || Balance.read() || null;
          var delta = null;
          if(pending && pending.pre!=null && bal!=null){ delta = r2(bal - pending.pre); }
          var wagerVal = pending ? pending.amount : null;
          var stepVal = pending && pending.step!=null ? pending.step : '—';
          var sigKey = pending ? sigKeyOf(pending.sig) : null;
          if(pending && pending.sent && sigKey && SigStats && SigStats[sigKey]){
            if(type==='WIN') SigStats[sigKey].win++;
            else if(type==='LOSS') SigStats[sigKey].loss++;
            else SigStats[sigKey].ret++;
          }
          console.log('[TRADE-CLOSE] result='+type+' delta='+ (delta!=null?fmt2(delta):'—') +' wager='+fmt2(wagerVal)+' step='+stepVal);
          try{
            SessionStats.onClose(type, null, bal, pending?pending.amount:null);
            // ===== MARTINGALE INTEGRATION (app5) :: step update + cycle check =====
            if (typeof MARTIN_ENABLED!=='undefined' && MARTIN_ENABLED){
              let cycleTerminated=false;
              const tradeStep = pending && typeof pending.step==='number' ? pending.step : currentBetStep;
              try{ cl_touchStep(tradeStep); }catch(e){}
              try{ cycleAcc(delta, type); }catch(e){}
              if(type==='WIN'){
                try{ currentBetStep = step0(); }catch(e){}
              } else if(type==='LOSS'){
                if(!isMaxStep(currentBetStep)){
                  const idx = stepIdxOf(currentBetStep);
                  const next = idx>=0 ? betArray[idx+1] : null;
                  if(next && typeof next.step==='number'){ currentBetStep = next.step; }
                } else {
                  const baseBet = betValOf(step0());
                  const willBreach = (cyclePnL - baseBet) < limitLoss;
                  if(willBreach){
                    cycleEnd('lose');
                    cycleTerminated=true;
                  } else {
                    currentBetStep = step0();
                    const pnlStr = isFinite(cyclePnL) ? cyclePnL.toFixed(2) : '0.00';
                    try{ console.log('[MG][RESET] step=max reset-to-0 array=%d pnl=%s next=%s', currentBetArrayId, pnlStr, baseBet.toFixed(2)); }catch(e){}
                  }
                }
              }
              if(!cycleTerminated){
                const nextBetChk = betValOf(currentBetStep);
                if(cyclePnL>limitWin){
                  cycleEnd('win');
                  cycleTerminated=true;
                } else if((cyclePnL - nextBetChk) < limitLoss){
                  cycleEnd('lose');
                  cycleTerminated=true;
                }
              }
            }
          }catch(e){}
          pending=null;
          TradeGate.busy=false; TradeGate.tOpen=0;
          DockBox.setMode('IDLE');
          var ss=SessionStats.snapshot();
          console.log('[SES] trades='+ss.tradesTotal+' W/L/R='+ss.wins+'/'+ss.losses+'/'+ss.returns+' Wager='+fmt2(ss.volumeTotal)+' P/L='+fmt2(ss.profitTotal));
        },
        enumerable:true, configurable:true
      });
      window.betHistory.push(rec);
      var sigMeta = meta && meta.sig ? meta.sig : null;
      pending = pending || {
        id: null,
        side: null,
        amount: null,
        step: null,
        tOpen: null,
        pre: null,
        sig: null,
        sent: false,
        openedAt: null
      };
      pending.id = null;
      pending.side = side;
      pending.amount = amount;
      pending.step = pendingStepForLog;
      pending.tOpen = now();
      pending.pre = BalanceStable.getStable()||Balance.read()||null;
      pending.sig = sigMeta;
      pending.sent = pending.sent === true ? true : false;
      if(pending.sent !== true){ pending.openedAt = null; }
      pendingStepForLog=null;
      return pending;
    }
    return { arm };
  })();

  /* [END MOD:Bridge] */
  const Bridge = Object.freeze({ TradeBridge });

  // [BEGIN MOD:Controller]
  // ===== TradeController (без дедлайна; ждём DOM; семафор) =====
  (function(){
    if(!Balance.getTarget()){ Balance.boot(); }
    var st={mode:'IDLE'};
    try{
      if(typeof getCycleLog==='function'){
        setTimeout(function(){
          try{
            var bootLog=getCycleLog();
            if(!bootLog || !bootLog.current){ cycleStart(); }
          }catch(err){}
        },0);
      }
    }catch(e){}
    setInterval(function(){
      if(st.mode!=='IDLE') return;
      if(TradeGate.busy) return;
      if(PauseCtl && PauseCtl.isActive()){
        console.log('[PAUSE][BLOCK] trading paused, remaining='+PauseCtl.remainingFmt());
        if(DockBox?.setMode) DockBox.setMode('PAUSE '+PauseCtl.remainingFmt());
        return;
      }

      var cands=SignalEngine.collectCandidates();
      var ctx=buildCtx();
      var modeCfg=DecisionEngine.CFG.modes[DecisionEngine.CFG.activeMode] || DecisionEngine.CFG.modes.M1;
      DecisionEngine.updateFilters(ctx.filters||{});
      if(!ctx.filters || ctx.filters.payout!==true){
        DecisionEngine.noteSkip('payout');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=payout payout=%s thr=%s', fmt2(ctx.payout), fmt2((modeCfg.payoutMin||0)*100));
        return;
      }
      if(ctx.volOk!==true){
        DecisionEngine.noteSkip('low_vol');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=low_vol atr=%s median=%s', fmt2(ctx.atr14), fmt2(ctx.atrMedian20));
        return;
      }
      if(!ctx.filters.cooldown){
        DecisionEngine.noteSkip('cooldown');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=cooldown secs=%s thr=%s', ctx.secsSinceLastTrade, modeCfg.cooldownSec);
        return;
      }

      var best=DecisionEngine.pickBest(cands, ctx);
      if(!best){
        DecisionEngine.noteDecision(null, ctx);
        var conflict=DecisionEngine.getLastConflict && DecisionEngine.getLastConflict();
        if(conflict){
          DecisionEngine.noteSkip('conflict');
          console.log('[SKIP] reason=conflict top=%s rival=%s Δ=%s', conflict.top.name, conflict.rival.name, fmt2(conflict.delta));
        }
        return;
      }

      DecisionEngine.noteDecision(best, ctx);
      var sig=best.name;
      var side=best.side;
      if(!sig || !side) return;
      var parts=best.parts||{};
      function partVal(k){
        var v=parts[k];
        if(v==null) return '0';
        if(k==='trend' || k==='vol') return v ? '1' : '0';
        if(typeof v==='number') return parseFloat(Number(v).toFixed(2)).toString();
        return String(v);
      }
      var partsStr='{trend:'+partVal('trend')+' vol:'+partVal('vol')+' rsi:'+partVal('rsi')+' sqz:'+partVal('sqz')+' candle:'+partVal('candle')+'}';
      try{ console.log('[SIG:SELECT] name=%s side=%s score=%s parts=%s', sig, side, best.score.toFixed(2), partsStr); }catch(e){}
      if(best){
        try{ DecisionState.lastPick={ name:sig, side:side, score:+best.score||0 }; }catch(err){}
        try{ DockBox.updateDecision({ lastPick:DecisionState.lastPick, mode:DecisionEngine.CFG.activeMode }); }catch(err){}
      }
      var payout = readProfitPercent();
      var payoutFmt = payout!=null ? fmt2(payout) : '—';
      var payoutThr = Math.round((modeCfg.payoutMin||0)*100);

      if(typeof MARTIN_ENABLED==='undefined' || !MARTIN_ENABLED){
        var amount=readStake();
        pendingStepForLog=0;
        TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
        if(DEBUG) console.log('[TRG]['+side+'] amt='+fmt2(amount));
        if(payout!=null && payout<payoutThr){
          console.log('[OPEN][SKIP] reason=payout<thr sig=%s step=%d payout=%s', sig, pendingStepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var sent = HotkeyDriver.trade(side);
        if(!sent){
          console.log('[OPEN][SKIP] reason=hotkey-false sig=%s step=%d payout=%s', sig, pendingStepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var pendingRec = TradeBridge.arm(side, amount, { sig, score:best.score });
        if(pendingRec){
          pendingRec.sent = true;
          pendingRec.openedAt = Date.now();
        }
        var keyNonMg = sigKeyOf(sig);
        if(keyNonMg && SigStats && SigStats[keyNonMg]){
          SigStats[keyNonMg].open++;
          SigStats[keyNonMg].sumScore = (SigStats[keyNonMg].sumScore||0) + (best.score||0);
          if(pendingRec && pendingRec.openedAt!=null){ SigStats[keyNonMg].opensAt.push(pendingRec.openedAt); }
        }
        DecisionEngine.noteTradeOpen();
        console.log('[TRADE-OPEN] sig=%s side=%s step=%d bet=%s payout=%s', sig, side, pendingStepForLog, fmt2(amount), payoutFmt);
      } else {
        var betRec = null;
        var betVal = null;
        try{
          var activeBetArray = betArray;
          for(var i=0;i<activeBetArray.length;i++){ if(activeBetArray[i].step===currentBetStep){ betRec=activeBetArray[i]; break; } }
          if(!betRec && activeBetArray.length){ betRec = activeBetArray[Math.min(currentBetStep, activeBetArray.length-1)]; }
          betVal = betRec ? betRec.value : getBetValue(currentBetStep);
        } catch(e){}
        if(betVal==null){ betVal = getBetValue(currentBetStep); }
        var stepForLog = (betRec && betRec.step!=null) ? betRec.step : currentBetStep;
        var limitTrip=false;
        try{
          if(typeof cyclePnL==='number'){
            if(cyclePnL>limitWin){ cycleEnd('win'); limitTrip=true; }
            else if((cyclePnL - betVal) < limitLoss){ cycleEnd('lose'); limitTrip=true; }
          }
        }catch(err){}
        if(limitTrip){
          try{
            if(typeof getCycleLog==='function'){
              var logState=getCycleLog();
              if(!logState || !logState.current){ cycleStart(); }
            }
          }catch(err){}
          pendingStepForLog=null;
          return;
        }
        pendingStepForLog=stepForLog;
        TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
        if(DEBUG) console.log('[TRG]['+side+'] step='+stepForLog+' bet='+betVal+' array='+currentBetArrayId);
        if(payout!=null && payout<payoutThr){
          console.log('[OPEN][SKIP] reason=payout<thr sig=%s step=%d payout=%s', sig, stepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        const ok = smartBet(stepForLog, side);
        if(!ok){
          console.log('[OPEN][SKIP] reason=smartBet-false sig=%s step=%d', sig, stepForLog);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var pendingRecMg = TradeBridge.arm(side, betVal, { sig, score:best.score });
        if(pendingRecMg){
          pendingRecMg.sent = true;
          pendingRecMg.openedAt = Date.now();
        }
        var keyMg = sigKeyOf(sig);
        if(keyMg && SigStats && SigStats[keyMg]){
          SigStats[keyMg].open++;
          SigStats[keyMg].sumScore = (SigStats[keyMg].sumScore||0) + (best.score||0);
          if(pendingRecMg && pendingRecMg.openedAt!=null){ SigStats[keyMg].opensAt.push(pendingRecMg.openedAt); }
        }
        DecisionEngine.noteTradeOpen();
        console.log('[TRADE-OPEN] sig=%s side=%s step=%d bet=%s payout=%s', sig, side, stepForLog, fmt2(betVal), payoutFmt);
      }
    }, 1000);

    console.log('[TRD][BOOT] auto-trade ON, CLOSE via legacy Trades observer only, gate=ON');
  })();

  /* [END MOD:Controller] */
  const Controller = Object.freeze({});

  // ===== Boot last =====
  if(!Balance.getTarget()){ Balance.boot(); }

  // ===== Global stop =====
  window.__verterStopAll=function(){
    console.log('[VERTER] stopped');
    return {};
  };
})();

// [BEGIN MOD:MG]
// ===== MARTINGALE INTEGRATION (app5) :: CONFIG & STATE =====
const MARTIN_ENABLED = true; // переключатель интеграции

// Массивы ставок
const betArray1 = [
  {step: 0, value: 3,   pressCount: 2},
  {step: 1, value: 9,   pressCount: 8},
  {step: 2, value: 30,  pressCount: 13},
  {step: 3, value: 90,  pressCount: 21}
];
const betArray2 = [
  {step: 0, value: 9,   pressCount: 8},
  {step: 1, value: 30,  pressCount: 13},
  {step: 2, value: 90,  pressCount: 21},
  {step: 3, value: 250, pressCount: 25}
];
const betArray3 = [
  {step: 0, value: 30,  pressCount: 13},
  {step: 1, value: 90,  pressCount: 21},
  {step: 2, value: 250, pressCount: 25},
  {step: 3, value: 500, pressCount: 28}
];
let betArray = betArray1;

// Лимиты цикла
const limitWin1 = 50,  limitLoss1 = -135;
const limitWin2 = 150, limitLoss2 = -380;
const limitWin3 = 550, limitLoss3 = -870;
let limitWin = limitWin1, limitLoss = limitLoss1;

function maxStepIdx(){ return Math.max(0, betArray.length - 1); }
function stepIdxOf(step){ return betArray.findIndex(o=>o.step===step); }
function isMaxStep(step){ const idx = stepIdxOf(step); return idx >= 0 && idx === maxStepIdx(); }
function betValOf(step){
  const idx = stepIdxOf(step);
  if(idx >= 0) return betArray[idx].value;
  return betArray.length ? betArray[0].value : 0;
}
function step0(){ return betArray.length ? betArray[0].step : 0; }
function getBetValue(step){ return betValOf(step); }

// Состояние MG
let currentBetStep = step0();
let currentBetArrayId = 1; // 1|2|3
let maxStepInCycle = 0;

let cyclePnL = 0;
let cycleId = 0;

// Учёт цикла
let CycleAcc = {
  id: 0,
  trades: 0, won: 0, loss: 0, ret: 0,
  maxStep: 0, betArray: currentBetArrayId,
  startedAt: null,
  startBal: null,
  endBal: null
};

const CycleLog = { current: null, history: [] };
const CYCLE_LOG_MAX = 15;

function cl_start(id, arrayId, limits){
  let startProfit = null;
  try{
    const snap = SessionStats.snapshot();
    if(snap && typeof snap.profitTotal === 'number'){ startProfit = snap.profitTotal; }
  }catch(e){}
  CycleLog.current = {
    id,
    arrayId,
    limits: limits || null,
    startedAt: Date.now(),
    startProfit,
    pnl: 0,
    win: 0,
    loss: 0,
    ret: 0,
    maxStep: 0
  };
}
function cl_noteClose(type, pnlDelta){
  const cur = CycleLog.current;
  if(!cur) return;
  if(type === 'WIN') cur.win++;
  else if(type === 'LOSS') cur.loss++;
  else if(type === 'RET') cur.ret++;
  if(typeof pnlDelta === 'number' && isFinite(pnlDelta)){
    cur.pnl = r2((cur.pnl || 0) + pnlDelta);
  }
  cur.lastCloseAt = Date.now();
}
function cycleAcc(delta, type){
  let num = 0;
  if(typeof delta === 'number' && isFinite(delta)){ num = delta; }
  cyclePnL = r2(cyclePnL + num);
  CycleAcc.trades++;
  const noteType = type || (num>=0 ? 'WIN' : 'LOSS');
  if(noteType === 'WIN') CycleAcc.won++;
  else if(noteType === 'LOSS') CycleAcc.loss++;
  else if(noteType === 'RET') CycleAcc.ret++;
  try{ cl_noteClose(noteType, num); }catch(e){}
  return cyclePnL;
}
function cl_touchStep(step){
  if(typeof step !== 'number' || !isFinite(step)) return;
  if(step > maxStepInCycle){ maxStepInCycle = step; }
  if(CycleAcc.maxStep < maxStepInCycle){ CycleAcc.maxStep = maxStepInCycle; }
  const cur = CycleLog.current;
  if(cur){ if(typeof cur.maxStep !== 'number' || step > cur.maxStep){ cur.maxStep = step; } }
}
function cl_end(status){
  const now = Date.now();
  const cur = CycleLog.current;
  const entry = {
    id: cur ? cur.id : CycleAcc.id,
    arrayId: cur ? cur.arrayId : currentBetArrayId,
    result: (status || '').toUpperCase(),
    pnl: null,
    maxStep: Math.max(cur && typeof cur.maxStep === 'number' ? cur.maxStep : 0, CycleAcc.maxStep || 0),
    win: cur ? cur.win : CycleAcc.won,
    loss: cur ? cur.loss : CycleAcc.loss,
    ret: cur ? cur.ret : CycleAcc.ret,
    startedAt: cur ? cur.startedAt : null,
    endedAt: now,
    durationMs: cur && cur.startedAt ? Math.max(0, now - cur.startedAt) : 0
  };
  try{
    const snap = SessionStats.snapshot();
    if(snap && typeof snap.profitTotal === 'number'){
      const start = cur && typeof cur.startProfit === 'number' ? cur.startProfit : null;
      if(start != null){ entry.pnl = r2(snap.profitTotal - start); }
    }
  }catch(e){}
  if(entry.pnl == null){
    if(cur && typeof cur.pnl === 'number'){ entry.pnl = cur.pnl; }
    else if(CycleAcc.endBal != null && CycleAcc.startBal != null){ entry.pnl = r2(CycleAcc.endBal - CycleAcc.startBal); }
  }
  CycleLog.history.unshift(entry);
  if(CycleLog.history.length > CYCLE_LOG_MAX){ CycleLog.history = CycleLog.history.slice(0, CYCLE_LOG_MAX); }
  const durFmt = (function(ms){
    if(!isFinite(ms) || ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = m < 10 ? '0' + m : String(m);
    const ss = s < 10 ? '0' + s : String(s);
    return mm + ':' + ss;
  })(entry.durationMs);
  const pnlStr = (typeof entry.pnl === 'number' && isFinite(entry.pnl)) ? ((entry.pnl>=0?'+':'')+Math.abs(entry.pnl).toFixed(2)) : '—';
  try{
    console.log('[CYCLE][STAT] id=%s array=%s result=%s pnl=%s maxStep=%s W/L/R=%s/%s/%s dur=%s',
      entry.id, entry.arrayId, entry.result, pnlStr, entry.maxStep, entry.win, entry.loss, entry.ret, durFmt);
  }catch(e){}
  CycleLog.current = null;
}
function getCycleLog(){ return CycleLog; }
function getCyclePnL(){ return cyclePnL; }
function setArrayById(id){
  currentBetArrayId = id;
  if(id===1){ betArray=betArray1; limitWin=limitWin1; limitLoss=limitLoss1; }
  else if(id===2){ betArray=betArray2; limitWin=limitWin2; limitLoss=limitLoss2; }
  else { betArray=betArray3; limitWin=limitWin3; limitLoss=limitLoss3; }
  CycleAcc.betArray = id;
}
function cycleStart(){
  cycleId++;
  cyclePnL = 0;
  maxStepInCycle = 0;
  currentBetStep = step0();
  CycleAcc.id = cycleId;
  CycleAcc.trades = 0;
  CycleAcc.won = 0;
  CycleAcc.loss = 0;
  CycleAcc.ret = 0;
  CycleAcc.maxStep = 0;
  CycleAcc.betArray = currentBetArrayId;
  CycleAcc.startedAt = Date.now();
  CycleAcc.endBal = null;
  try{
    const ss = SessionStats.snapshot();
    CycleAcc.startBal = ss && ss.lastBalance!=null ? ss.lastBalance : (BalanceStable.getStable()||Balance.read()||null);
  }catch(e){ CycleAcc.startBal = BalanceStable.getStable()||Balance.read()||null; }
  try{ cl_start(cycleId, currentBetArrayId, { win: limitWin, loss: limitLoss }); }catch(e){}
  try{ console.log('[CYCLE][START] id=%s array=%s limits=win:%s loss:%s step=%s', cycleId, currentBetArrayId, limitWin, limitLoss, currentBetStep); }catch(e){}
}
function cycleEnd(status){
  const safeStatus = (status || '').toLowerCase();
  try{
    const ss = SessionStats.snapshot();
    CycleAcc.endBal = ss && ss.lastBalance!=null ? ss.lastBalance : (BalanceStable.getStable()||Balance.read()||null);
  }catch(e){ CycleAcc.endBal = BalanceStable.getStable()||Balance.read()||null; }
  CycleAcc.maxStep = Math.max(CycleAcc.maxStep||0, maxStepInCycle||0);
  const pnlValue = isFinite(cyclePnL) ? cyclePnL : 0;
  try {
    var S=SessionStats.get();
    (S.cycles||(S.cycles=[])).push({ id:cycleId, status:safeStatus, profit:r2(pnlValue), maxStep:CycleAcc.maxStep, trades:CycleAcc.trades, won:CycleAcc.won, loss:CycleAcc.loss, ret:CycleAcc.ret, betArray:currentBetArrayId, startBal:CycleAcc.startBal, endBal:CycleAcc.endBal, startedAt:CycleAcc.startedAt, endedAt:Date.now() });
  } catch(e){}
  try{ cl_end(safeStatus); }catch(e){}
  try{ console.log('[CYCLE][END] result=%s id=%s pnl=%s trades=%s maxStep=%s array=%s', safeStatus.toUpperCase(), cycleId, r2(pnlValue).toFixed(2), CycleAcc.trades, CycleAcc.maxStep, currentBetArrayId); }catch(e){}
  if(safeStatus==='lose'){
    setArrayById(currentBetArrayId===1?2:(currentBetArrayId===2?3:1));
  }else{
    setArrayById(1);
  }
  currentBetStep=step0();
  maxStepInCycle=0;
  cycleStart();
}

// Инициализация
function __mg_init__(){
  if(typeof MARTIN_ENABLED==='undefined' || !MARTIN_ENABLED) return;
  if(!(typeof SessionStats!=='undefined' && SessionStats && typeof SessionStats.snapshot==='function')){
    setTimeout(__mg_init__, 250);
    return;
  }
  try{ setArrayById(1); cycleStart(); }catch(e){ setTimeout(__mg_init__, 250); }
}
__mg_init__();

/* [END MOD:MG] */
const MG = Object.freeze({ MARTIN_ENABLED, getBetValue, setArrayById, cycleStart, cycleEnd, cycleAcc, getCycleLog, getCyclePnL, CycleAcc, __mg_init__ });
