(function(){
  const hoursStart=0, hoursEnd=23;
  const STORAGE_KEY='focusday.web.clean.v5';
  const PREFS_KEY  ='focusday.web.prefs.v1';

  const BUILTIN = ['work','study','errand','personal','other'];
  const LABEL   = {work:'Work',study:'Study',errand:'Errand',personal:'Personal',other:'Other'};

  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const slug = s => (s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'other';
  const title = s => (s||'').replace(/[-_]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());

  function ready(fn){ (document.readyState!=='loading') ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  ready(init);

  const getTodayISO=()=>{ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
  const fmtHour=h=>String(h).padStart(2,'0')+':00';
  const fmtDur=s=>{
    s=Math.max(0,Math.floor(s||0));
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    const pad=n=>String(n).padStart(2,'0');
    return h?`${h}:${pad(m)}:${pad(sec)}`:`${pad(m)}:${pad(sec)}`;
  };

  function defaultDay(dateISO){
    const hours={}; for(let h=hoursStart;h<=hoursEnd;h++) hours[fmtHour(h)]={ slots:[null,null,null,null] };
    return { dateISO, mainGoal:'', backlog:[], hours };
  }
  function loadAll(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }catch(e){ return {}; } }
  function saveAll(all){ localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); }

  function loadPrefs(allObj){
    let p; try{ p=JSON.parse(localStorage.getItem(PREFS_KEY)||'null'); }catch(e){ p=null; }
    if(!p || !Array.isArray(p.categories) || !p.categories.length){
      p={categories:[...BUILTIN], defaultCat:'other'};
    }
    const used = new Set(p.categories);
    for(const date of Object.keys(allObj||{})){
      const day=allObj[date]; if(!day) continue;
      day.backlog.forEach(t=> t?.cat && used.add(t.cat));
      Object.values(day.hours||{}).forEach(h=> h.slots.forEach(t=> t?.cat && used.add(t.cat)));
    }
    p.categories = Array.from(used);
    return p;
  }
  function savePrefs(prefs){ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

  function init(){
    const el={
      datePicker: $('#datePicker'), prevDay: $('#prevDay'), nextDay: $('#nextDay'),
      today: $('#todayBtn'), clear: $('#clearDayBtn'),
      mainGoal: $('#mainGoal'),
      backlog: $('#backlog'),
      addBtn: $('#addTaskBtn'), newInput: $('#newTaskInput'),
      catSelect: $('#catSelect'), customCat: $('#customCat'),
      dayGrid: $('#dayGrid'), saveStatus: $('#saveStatus'),
      tpl: $('#taskTemplate'), backlogCount: $('#backlogCount'),
      catFilters: $('#catFilters'),
      manageBtn: $('#manageCatsBtn'),
      // modal
      catModal: $('#catModal'), catModalList: $('#catModalList'),
      catAddName: $('#catAddName'), catAddBtn: $('#catAddBtn'),
      catModalClose: $('#catModalClose'), catModalDone: $('#catModalDone'),
    };
    if(Object.values(el).some(x=>!x)){ console.error('Missing DOM'); return; }

    const all = loadAll();
    const prefs = loadPrefs(all);
    const state={ all, day:null, draggingId:null, backlogPlaceholderIndex:null, filterCat:null, prefs, dragPreviewEl:null };

    const flashSaved=()=>{ el.saveStatus.textContent='Saved'; el.saveStatus.style.opacity='1'; setTimeout(()=>el.saveStatus.style.opacity='.85',600); };
    const persist=()=>{ state.all[state.day.dateISO]=JSON.parse(JSON.stringify(state.day)); saveAll(state.all); flashSaved(); };

    // ensure all drop zones accept drops
    $$('.droppable').forEach(dz=>dz.addEventListener('dragover', e=>e.preventDefault()));

    // ---- categories ----
    const allCategories = ()=> state.prefs.categories.slice();
    const hasCat = k => state.prefs.categories.includes(k);
    function addCategory(raw){
      const k=slug(raw); if(!k) return null;
      if(!hasCat(k)) state.prefs.categories.push(k);
      if(!LABEL[k]) LABEL[k]=title(raw);
      savePrefs(state.prefs); updateCategorySelect(); renderFilters(); renderModalList();
      return k;
    }
    function setDefaultCat(k){ if(!hasCat(k)) return; state.prefs.defaultCat=k; savePrefs(state.prefs); renderFilters(); renderModalList(); }
    function renameCategory(oldKey, newName){
      const nk=slug(newName); if(!nk || oldKey===nk) return;
      if(!hasCat(oldKey)) return;
      if(!hasCat(nk)) state.prefs.categories.push(nk);
      if(!LABEL[nk]) LABEL[nk]=title(newName);
      for(const d of Object.keys(state.all)){
        const day=state.all[d];
        day.backlog.forEach(t=>{ if(t.cat===oldKey) t.cat=nk; });
        for(const hk of Object.keys(day.hours)){ const s=day.hours[hk].slots; for(let i=0;i<s.length;i++){ if(s[i] && s[i].cat===oldKey) s[i].cat=nk; } }
      }
      state.prefs.categories = state.prefs.categories.filter(c=>c!==oldKey);
      if(state.prefs.defaultCat===oldKey) state.prefs.defaultCat=nk;
      savePrefs(state.prefs); saveAll(state.all); updateCategorySelect(); render(); renderModalList();
    }
    function deleteCategory(k){
      if(BUILTIN.includes(k)) return alert('Built-in categories cannot be deleted.');
      if(!hasCat(k)) return;
      for(const d of Object.keys(state.all)){
        const day=state.all[d];
        day.backlog.forEach(t=>{ if(t.cat===k) t.cat='other'; });
        for(const hk of Object.keys(day.hours)){ const s=day.hours[hk].slots; for(let i=0;i<s.length;i++){ if(s[i] && s[i].cat===k) s[i].cat='other'; } }
      }
      state.prefs.categories = state.prefs.categories.filter(c=>c!==k);
      if(state.prefs.defaultCat===k) state.prefs.defaultCat='other';
      savePrefs(state.prefs); saveAll(state.all); updateCategorySelect(); render(); renderModalList();
    }

    // ---- timers ----
    function ensureTimer(task){
      if(!task.timer){
        task.timer={ elapsedMs:0, running:false, startedAt:null, startPerf:null, startElapsedMs:0 };
      }else{
        const t=task.timer;
        if(typeof t.elapsed==='number' && t.elapsedMs===undefined){
          t.elapsedMs = t.elapsed*1000; delete t.elapsed;
        }
        if(t.startElapsedMs===undefined) t.startElapsedMs = t.elapsedMs||0;
        if(t.running){
          if(t.startPerf==null){
            if(typeof t.startedAt==='number') t.elapsedMs += Date.now()-t.startedAt;
            t.startElapsedMs = t.elapsedMs;
            t.startPerf = performance.now();
          }
        }else{
          t.startedAt=null; t.startPerf=null; t.startElapsedMs=t.elapsedMs;
        }
      }
      return task.timer;
    }
    function taskElapsedMs(task){
      const t=ensureTimer(task);
      if(t.running && t.startPerf!==null){
        return t.startElapsedMs + (performance.now()-t.startPerf);
      }
      return t.elapsedMs;
    }
    function taskElapsedSeconds(task){
      return Math.floor(taskElapsedMs(task)/1000);
    }

    let rafId=null, lastFrame=0;
    const FRAME_MS=120;
    function anyRunning(){
      if(!state.day) return false;
      if(state.day.backlog.some(t=>t?.timer?.running)) return true;
      for(const hk of Object.keys(state.day.hours)){
        if(state.day.hours[hk].slots.some(t=>t?.timer?.running)) return true;
      }
      return false;
    }
    function rafLoop(now){
      if(now-lastFrame>=FRAME_MS){
        lastFrame=now;
        $$('.task.in-hour .timer-time').forEach(span=>{
          const id=span.closest('.task').dataset.id;
          const t=getTaskById(id); if(!t) return;
          span.textContent=fmtDur(taskElapsedSeconds(t));
        });
      }
      if(anyRunning()) rafId=requestAnimationFrame(rafLoop); else rafId=null;
    }
    function ensureRaf(){ if(!rafId && anyRunning()) rafId=requestAnimationFrame(rafLoop); }

    function updateTimerBtn(id){
      const node=document.querySelector('.task[data-id="'+id+'"]'); if(!node) return;
      const btn=node.querySelector('.timer-btn.toggle'); if(!btn) return;
      const t=getTaskById(id); if(!t) return;
      const running=!!t.timer?.running;
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
      btn.classList.toggle('running', running);
      btn.textContent = running ? '⏸' : '▶️';
      btn.setAttribute('aria-pressed', running);
      btn.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
      btn.title = running ? 'Pause' : 'Start';
    }
    function updateTimerTime(id){
      const node=document.querySelector('.task[data-id="'+id+'"]');
      const span=node?.querySelector('.timer-time');
      const t=getTaskById(id);
      if(span && t){ span.textContent=fmtDur(taskElapsedSeconds(t)); }
    }
    function startTimer(id){
      const task=getTaskById(id); if(!task) return;
      const t=ensureTimer(task);
      if(!t.running){
        t.running=true;
        t.startPerf=performance.now();
        t.startElapsedMs=t.elapsedMs;
        t.startedAt=Date.now();
        persist();
        ensureRaf();
        updateTimerBtn(id);
        updateTimerTime(id);
      }
    }
    function pauseTimer(id){
      const task=getTaskById(id); if(!task) return;
      const t=ensureTimer(task);
      if(t.running){
        t.elapsedMs = t.startElapsedMs + (performance.now()-t.startPerf);
        t.running=false;
        t.startedAt=null;
        t.startPerf=null;
        t.startElapsedMs=t.elapsedMs;
        persist();
        updateTimerBtn(id);
        updateTimerTime(id);
        ensureRaf();
      }
    }
    function resetTimer(id){
      const task=getTaskById(id); if(!task) return;
      task.timer={ elapsedMs:0, running:false, startedAt:null, startPerf:null, startElapsedMs:0 };
      persist();
      updateTimerBtn(id);
      updateTimerTime(id);
      ensureRaf();
    }

    // ---- task node ----
    function createTaskNode(task, inHour=false){
      const n=el.tpl.content.firstElementChild.cloneNode(true);
      n.dataset.id=task.id; n.setAttribute('draggable','true');
      const catKey = task.cat || state.prefs.defaultCat || 'other';
      const known = BUILTIN.includes(catKey);
      const badge=$('.cat-badge',n);
      badge.textContent = LABEL[catKey] || title(catKey);
      badge.classList.add(known?`cat-${catKey}`:'cat-custom');
      $('.task-text',n).textContent=task.text||'';
      if(task.done) n.classList.add('done');

      // Timer UI (only in-hour)
      if(inHour){
        ensureTimer(task);
        const box=document.createElement('div'); box.className='timer-box';
        const time=document.createElement('span'); time.className='timer-time'; time.textContent=fmtDur(taskElapsedSeconds(task));
        const toggle=document.createElement('button'); toggle.className='timer-btn toggle';
        const running=task.timer?.running;
        toggle.textContent = running ? '⏸' : '▶️';
        toggle.title = running ? 'Pause' : 'Start';
        toggle.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
        toggle.setAttribute('aria-pressed', running);
        if(running) toggle.classList.add('running');
        const reset=document.createElement('button'); reset.className='timer-btn reset'; reset.title='Reset'; reset.textContent='⟲';
        box.append(time, toggle, reset);
        const actions = n.querySelector('.task-actions');
        n.insertBefore(box, actions || null);
      }
      return n;
    }

    // ---- counts for filters ----
    function categoryCounts(){
      const counts={}; let total=0;
      const add=t=>{ if(!t) return; total++; const c=t.cat||state.prefs.defaultCat||'other'; counts[c]=(counts[c]||0)+1; };
      state.day?.backlog?.forEach(add);
      for(const hk of Object.keys(state.day?.hours||{})){ state.day.hours[hk].slots.forEach(add); }
      return {counts,total};
    }

    // ---- filters (chips) ----
    function renderFilters(){
      const {counts,total}=categoryCounts();
      el.catFilters.innerHTML='';
      const cats = allCategories();
      const chips=[{val:null,label:'All',count:total}].concat(
        cats.map(c=>({val:c,label:LABEL[c]||title(c),count:counts[c]||0}))
      );
      chips.forEach(ch=>{
        const chip=document.createElement('span');
        chip.className='filter-chip'+((state.filterCat===ch.val)?' active':'');
        chip.dataset.cat = ch.val===null ? '' : ch.val;
        chip.innerHTML = `${ch.label} <span class="chip-count">${ch.count}</span>`;
        el.catFilters.appendChild(chip);
      });
      el.backlogCount.textContent = state.filterCat ? (counts[state.filterCat]||0) : total;
    }

    // ---- category select ----
    function updateCategorySelect(){
      const sel=el.catSelect; sel.innerHTML='';
      allCategories().forEach(k=>{
        const opt=document.createElement('option');
        opt.value=k; opt.textContent=LABEL[k]||title(k);
        if(k===state.prefs.defaultCat) opt.defaultSelected=true;
        sel.appendChild(opt);
      });
      const co=document.createElement('option'); co.value='custom'; co.textContent='Custom…'; sel.appendChild(co);
      if(!sel.value) sel.value=state.prefs.defaultCat || 'other';
    }

    // ---- render day ----
    function render(){
      el.mainGoal.value=state.day.mainGoal||'';
      el.dayGrid.innerHTML='';
      renderFilters();

      const isToday=(el.datePicker.value===getTodayISO()); const nowH=(new Date()).getHours();
      for(let h=hoursStart;h<=hoursEnd;h++){
        const key=fmtHour(h);
        const lbl=document.createElement('div'); lbl.className='hour-label'; lbl.textContent=key;
        const dz=document.createElement('div'); dz.className='hour-dropzone droppable'; dz.dataset.hour=key; dz.dataset.dropzone='hour';
        if(isToday && h===nowH){ lbl.classList.add('hour-now'); dz.classList.add('hour-now'); }

          let tasks=state.day.hours[key].slots.filter(Boolean);
          if(state.filterCat) tasks=tasks.filter(t=>t.cat===state.filterCat);
          tasks.forEach(t=>{ const node=createTaskNode(t,true); node.classList.add('in-hour'); dz.appendChild(node); });

          el.dayGrid.appendChild(lbl); el.dayGrid.appendChild(dz);
      }

      // backlog
      el.backlog.innerHTML='';
      state.day.backlog.forEach(t=>{
        if(state.filterCat && t.cat!==state.filterCat) return;
        const node=createTaskNode(t,false); node.classList.add('in-backlog'); el.backlog.appendChild(node);
      });

      updateCategorySelect();
      document.dispatchEvent(new Event('fdDayGridRendered'));
      if(typeof window.fdRefreshAll==='function') window.fdRefreshAll();
      ensureRaf();
    }

    // ---- add task ----
    const newId=()=>Math.random().toString(36).slice(2,9);
    function currentCat(){
      let c = el.catSelect.value || state.prefs.defaultCat || 'other';
      if(c==='custom'){
        const raw=(el.customCat.value||'').trim(); if(!raw) return state.prefs.defaultCat || 'other';
        const k=addCategory(raw); el.customCat.value=''; el.customCat.style.display='none'; el.catSelect.value=k; c=k;
      }
      return c;
    }
    function addNewTask(text){
      const t=(text||'').trim(); if(!t) return;
      state.day.backlog.push({ id:newId(), text:t, done:false, cat:currentCat() });
      persist(); render(); el.newInput.value='';
    }
    el.addBtn.addEventListener('click', ()=> addNewTask(el.newInput.value));
    el.newInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addNewTask(el.newInput.value); }});
    el.catSelect.addEventListener('change', ()=>{
      const isCustom = el.catSelect.value==='custom';
      el.customCat.style.display = isCustom ? 'inline-block' : 'none';
      if(!isCustom) el.customCat.value='';
    });
    el.customCat.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); const raw=(el.customCat.value||'').trim(); if(!raw) return;
        const k=addCategory(raw); el.catSelect.value=k; el.customCat.value=''; el.customCat.style.display='none';
      }
    });

    // ---- filter chips ----
    el.catFilters.addEventListener('click', e=>{
      const chip=e.target.closest('.filter-chip'); if(!chip) return;
      const cat = chip.dataset.cat || null;
      state.filterCat = (state.filterCat===cat)? null : cat;
      render();
    });

    // ---- modal (same features as before, omitted comments for brevity) ----
    function openCatModal(){ $('#catModal').classList.add('show'); renderModalList(); }
    function closeCatModal(){ $('#catModal').classList.remove('show'); }
    function renderModalList(){
      const list=$('#catModalList'); list.innerHTML='';
      allCategories().forEach(k=>{
        const li=document.createElement('li'); li.className='cat-row'; li.dataset.key=k; li.draggable=true;
        const drag=document.createElement('div'); drag.className='drag'; drag.textContent='☰';
        const name=document.createElement('input'); name.className='name'; name.value=LABEL[k]||title(k);
        const star=document.createElement('button'); star.className='star'+(state.prefs.defaultCat===k?' active':''); star.textContent='★';
        const del=document.createElement('button'); del.className='del'; del.textContent='Delete'; if(BUILTIN.includes(k)) del.disabled=true;
        const btns=document.createElement('div'); btns.className='btns'; btns.append(star,del);
        li.append(drag,name,btns); list.appendChild(li);
      });
    }
    $('#manageCatsBtn').addEventListener('click', openCatModal);
    $('#catModalClose').addEventListener('click', closeCatModal);
    $('#catModalDone').addEventListener('click', closeCatModal);
    $('#catModal').addEventListener('click', (e)=>{ if(e.target.id==='catModal') closeCatModal(); });
    $('#catAddBtn').addEventListener('click', ()=>{ const v=$('#catAddName').value.trim(); if(!v) return; addCategory(v); $('#catAddName').value=''; renderModalList(); });
    $('#catAddName').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); const v=e.target.value.trim(); if(!v) return; addCategory(v); e.target.value=''; renderModalList(); }});
    $('#catModalList').addEventListener('input', e=>{
      const li=e.target.closest('.cat-row'); if(!li) return;
      if(e.target.matches('input.name')) renameCategory(li.dataset.key, e.target.value);
    });
    $('#catModalList').addEventListener('click', e=>{
      const li=e.target.closest('.cat-row'); if(!li) return; const key=li.dataset.key;
      if(e.target.classList.contains('star')){ setDefaultCat(key); renderModalList(); }
      if(e.target.classList.contains('del')){ if(confirm('Delete category and move its tasks to "Other"?')){ deleteCategory(key); renderModalList(); } }
    });
    let dragKey=null;
    $('#catModalList').addEventListener('dragstart', e=>{ const li=e.target.closest('.cat-row'); if(!li) return; dragKey=li.dataset.key; e.dataTransfer.effectAllowed='move'; });
    $('#catModalList').addEventListener('dragover', e=>{ e.preventDefault(); });
    $('#catModalList').addEventListener('drop', e=>{
      e.preventDefault(); const li=e.target.closest('.cat-row'); if(!li||!dragKey) return;
      const key=li.dataset.key; const arr=state.prefs.categories.slice(); const from=arr.indexOf(dragKey), to=arr.indexOf(key);
      if(from<0||to<0||from===to) return; arr.splice(to,0, arr.splice(from,1)[0]); state.prefs.categories=arr; savePrefs(state.prefs);
      renderModalList(); renderFilters(); updateCategorySelect(); dragKey=null;
    });

    // ---- complete / delete / timer buttons ----
    document.addEventListener('click', e=>{
      const done=e.target.closest?.('.done-btn');
      const del=e.target.closest?.('.delete-btn');
      const toggle=e.target.closest?.('.timer-btn.toggle');
      const reset=e.target.closest?.('.timer-btn.reset');

      if(done){
        const id=done.closest('.task')?.dataset.id; if(!id) return;
        const t=getTaskById(id);
        const wasDone=!!t?.done;
        toggleDone(id);
        if(!wasDone && t?.timer?.running){ // mark complete -> pause & save
          pauseTimer(id);
        }
        persist(); render();
      }
      if(del){ const id=del.closest('.task')?.dataset.id; if(!id) return; removeEverywhere(id); persist(); render(); }
      if(toggle){ const id=toggle.closest('.task')?.dataset.id; if(!id) return; const running=getTaskById(id)?.timer?.running; running? pauseTimer(id) : startTimer(id); }
      if(reset){ const id=reset.closest('.task')?.dataset.id; if(!id) return; resetTimer(id); render(); }

      // task modal opening handled via pointer events with drag threshold
    });

    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState!=='visible' || !state.day) return;
      const adjust=t=>{
        if(t?.timer?.running && t.timer.startPerf!=null){
          t.timer.startElapsedMs += performance.now()-t.timer.startPerf;
          t.timer.startPerf = performance.now();
        }
      };
      state.day.backlog.forEach(adjust);
      for(const hk of Object.keys(state.day.hours)){
        state.day.hours[hk].slots.forEach(t=>t&&adjust(t));
      }
    });

    // click vs drag threshold for tasks/chips
    let pointerStart = null;
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest?.('.task, .task-chip');
      if(!t) return;
      pointerStart = { x: e.clientX, y: e.clientY, el: t };
    });
    document.addEventListener('pointerup', e => {
      if(!pointerStart) return;
      const t = e.target.closest?.('.task, .task-chip');
      if(t !== pointerStart.el) { pointerStart = null; return; }
      const dx = Math.abs(e.clientX - pointerStart.x);
      const dy = Math.abs(e.clientY - pointerStart.y);
      pointerStart = null;
      if(dx > 5 || dy > 5) return; // treated as drag, not click
      if(t.classList.contains('task-chip')){
        if(!t.classList.contains('all-chip')){
          window.openTaskModal && window.openTaskModal(t.dataset.taskid);
        }
        return;
      }
      if(t.classList.contains('task')){
        if(!t.closest('#hourModal') && !e.target.closest('button')){
          window.openTaskModal && window.openTaskModal(t.dataset.id);
        }
      }
    });

    function toggleDone(id){
      const b=state.day.backlog.find(t=>t.id===id); if(b){ b.done=!b.done; return; }
      for(const hk of Object.keys(state.day.hours)){
        const s=state.day.hours[hk].slots; for(let i=0;i<s.length;i++){ if(s[i] && s[i].id===id){ s[i].done=!s[i].done; return; } }
      }
    }
    function removeEverywhere(id){
      state.day.backlog=state.day.backlog.filter(t=>t.id!==id);
      for(const hk of Object.keys(state.day.hours)){
        const s=state.day.hours[hk].slots; for(let i=0;i<s.length;i++){ if(s[i] && s[i].id===id){ s[i]=null; } }
      }
    }

    // Determine insertion index for a chip based on cursor X position
    function chipIndexFromX(chips, x){
      for(let i=0;i<chips.length;i++){
        const rect = chips[i].getBoundingClientRect();
        if(x < rect.left + rect.width/2) return i;
      }
      return chips.length;
    }

    // ---- DnD for tasks ----
document.addEventListener(
  'dragstart',
  e => {
    const t = e.target.closest?.('.task, .task-chip');
    if (!t) return;
    const id = t.dataset.id || t.dataset.taskid || '';
    state.draggingId = id;
    t.classList.add('dragging');
    // ensure some data is set so that dragging works across browsers
    if (e.dataTransfer) {
      // Older Edge browsers only recognize 'text'
      try { e.dataTransfer.setData('text/plain', id); } catch (err) {}
      try { e.dataTransfer.setData('text', id); } catch (err) {}
      e.dataTransfer.effectAllowed = 'copyMove';

      // custom drag preview close to cursor showing full task details
      const task = getTaskById(id);
      if (task) {
        const inHour = !!t.closest('.hour-dropzone');
        const node = createTaskNode(task, inHour);
        node.style.position = 'fixed';
        node.style.pointerEvents = 'none';
        node.style.zIndex = '1000';
        node.classList.add('drag-image');
        document.body.appendChild(node);
        const offX = node.offsetWidth / 2;
        const offY = 16;
        node.style.left = (e.clientX - offX) + 'px';
        node.style.top = (e.clientY - offY) + 'px';
        state.dragPreviewEl = node;
        state.dragPreviewOffset = { x: offX, y: offY };
        try { e.dataTransfer.setDragImage(node, offX, offY); } catch (err) {}
      }
    }
  },
  true
);
document.addEventListener(
  'dragend',
  e => {
    const t = e.target.closest?.('.task, .task-chip');
    if (t) {
      t.classList.remove('dragging');
    }
      state.draggingId = null;
      state.backlogPlaceholderIndex = null;
      if (state.dragPreviewEl) { state.dragPreviewEl.remove(); state.dragPreviewEl = null; }
      state.dragPreviewOffset = null;
      onDragEnd();
    document.querySelectorAll('.droppable').forEach(el => {
      el.classList.remove('drag-over');
      el.classList.remove('copy');
    });
  },
  true
);
  document.addEventListener('dragover', e => {
      if (state.dragPreviewEl) {
        const o = state.dragPreviewOffset || { x: 0, y: 0 };
        state.dragPreviewEl.style.left = (e.clientX - o.x) + 'px';
        state.dragPreviewEl.style.top = (e.clientY - o.y) + 'px';
      }

      const dz = e.target.closest?.('.droppable');
      if (!dz) return;
      e.preventDefault();
      const copy = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
      dz.classList.add('drag-over');
      dz.classList.toggle('copy', copy);
      if (e.dataTransfer) e.dataTransfer.dropEffect = copy ? 'copy' : 'move';

      const id = state.draggingId;
      if (!id) return;

      // clear any existing previews/placeholders; also remove stray drag images
      document
        .querySelectorAll('.drag-preview, .drag-placeholder, .drag-image')
        .forEach(el => el.remove());

      if (dz.id === 'backlog') {
        const tasks = Array.from(dz.querySelectorAll('.task')).filter(t => t.dataset.id !== id);
        let index = tasks.length;
        const target = e.target.closest('.task');
        if (target) {
          const rect = target.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          index = tasks.indexOf(target) + (before ? 0 : 1);
        }
        const placeholder = document.createElement('div');
        placeholder.className = 'task drag-placeholder';
        if (index >= tasks.length) dz.appendChild(placeholder);
        else dz.insertBefore(placeholder, tasks[index]);
        state.backlogPlaceholderIndex = index;
        const rect = dz.getBoundingClientRect();
        const EDGE = 40;
        if (e.clientY < rect.top + EDGE) dz.scrollTop -= 10;
        else if (e.clientY > rect.bottom - EDGE) dz.scrollTop += 10;
        return;
      }

      if (dz.classList.contains('hour-dropzone')) {
        let lane = dz.querySelector('.task-lane');
        if (!lane) {
          lane = document.createElement('div');
          lane.className = 'task-lane';
          dz.appendChild(lane);
        }
        const chips = Array.from(lane.querySelectorAll('.task-chip'))
          .filter(c => c.dataset.taskid !== id && !c.classList.contains('dragging'));
        const index = chipIndexFromX(chips, e.clientX);
        const preview = document.createElement('div');
        preview.className = 'task-chip drag-preview';
        preview.style.position = 'static';
        if (index >= chips.length) lane.appendChild(preview);
        else lane.insertBefore(preview, chips[index]);
      }
    }, true);

    document.addEventListener('dragleave', e => {
      const dz = e.target.closest?.('.droppable');
      if (!dz) return;
      dz.classList.remove('drag-over');
      dz.classList.remove('copy');
    });

    document.addEventListener('drop', e => {
      const dz = e.target.closest?.('.droppable');
      if (!dz) return;
      e.preventDefault();
      dz.classList.remove('drag-over');
      dz.classList.remove('copy');
      const id = state.draggingId;
      if (!id) {
        onDragEnd();
        return;
      }
      const copy = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
      let moved = getTaskById(id);
      if (!moved) {
        onDragEnd();
        return;
      }
      if (copy) {
        moved = {
          id: Math.random().toString(36).slice(2, 9),
          text: moved.text,
          done: false,
          cat: moved.cat,
          timer: { elapsed: 0, running: false, startedAt: null }
        };
      } else {
        removeEverywhere(id);
      }
      const placeholderIndex = state.backlogPlaceholderIndex;
      document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
      state.backlogPlaceholderIndex = null;

      if (dz.id === 'backlog') {
        let index = placeholderIndex ?? state.day.backlog.length;
        state.day.backlog.splice(index, 0, moved);
        persist();
        render();
        onDragEnd();
        return;
      }
      if (dz.classList.contains('hour-dropzone')) {
        ensureTimer(moved); // timers available in hours
        const hourKey = dz.dataset.hour, slots = state.day.hours[hourKey].slots;
        const list = slots.filter(Boolean);
        const lane = dz.querySelector('.task-lane');
        const chips = lane ? Array.from(lane.querySelectorAll('.task-chip')).filter(c => !c.classList.contains('drag-preview')) : [];
        const dest = chipIndexFromX(chips, e.clientX);
        list.splice(dest, 0, moved);
        const trimmed = list.slice(0, 4);
        for (let i = 0; i < 4; i++) slots[i] = trimmed[i] || null;
        persist();
        render();
        onDragEnd();
        return;
      }
      onDragEnd();
    });
    function getTaskById(id){
      const b=state.day.backlog.find(t=>t.id===id); if(b) return b;
      for(const hk of Object.keys(state.day.hours)){ const s=state.day.hours[hk].slots; for(const t of s){ if(t && t.id===id) return t; } }
      return null;
    }

    function findTaskHour(id){
      for(const hk of Object.keys(state.day.hours)){
        const s=state.day.hours[hk].slots;
        if(s.some(t=>t && t.id===id)) return hk;
      }
      return null;
    }

    window.fdGetTaskById = getTaskById;
    window.fdFindTaskHour = findTaskHour;
    window.fdGetHourTasks = hour => (state.day.hours[hour]?.slots.filter(Boolean) || []);
    window.fdCreateTaskNode = (task, inHour=false) => createTaskNode(task, inHour);

    // ---- date controls & init ----
    const shift=n=>{ const d=new Date(el.datePicker.value||getTodayISO()); d.setDate(d.getDate()+n); setActiveDate(d.toISOString().slice(0,10)); };
    const setActiveDate=iso=>{ el.datePicker.value=iso; if(!state.all[iso]) state.all[iso]=defaultDay(iso); state.day=JSON.parse(JSON.stringify(state.all[iso])); render(); };

    el.mainGoal.addEventListener('input', ()=>{ state.day.mainGoal=el.mainGoal.value; persist(); });
    el.prevDay.addEventListener('click', ()=> shift(-1));
    el.nextDay.addEventListener('click', ()=> shift(1));
    el.today.addEventListener('click', ()=> setActiveDate(getTodayISO()));
    el.clear.addEventListener('click', ()=>{ if(confirm('Clear this date?')){ state.day=defaultDay(el.datePicker.value||getTodayISO()); persist(); render(); }});
    el.datePicker.addEventListener('change', ()=> setActiveDate(el.datePicker.value||getTodayISO()));

    setActiveDate(getTodayISO());
    setInterval(()=>{ if(el.datePicker.value===getTodayISO()) render(); }, 60000);
  }
})();

function onDragEnd() {
  // Clean up any temporary drag artifacts. Previously, only drag previews and
  // placeholders were removed which could leave behind the custom drag image
  // element (".drag-image") when a drag operation didn't finish cleanly. Those
  // lingering elements appeared as "ghost" tasks on the page until refresh.
  document
    .querySelectorAll('.drag-preview, .drag-placeholder, .drag-image')
    .forEach(el => el.remove());
  document
    .querySelectorAll('.droppable.copy')
    .forEach(el => el.classList.remove('copy'));
}
(function(){
  const DZ_SEL = '.hour-dropzone, .hour-slot .dropzone, .hour .dropzone, .hour .tasks';
  const MAX = 4;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  function openModal(nodes, attach=true, title=''){
    const modal = $('#hourModal'); if(!modal) return;
    if(modal.parentNode !== document.body){ document.body.appendChild(modal); }
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '10000';
    const list  = $('#fd-modal-list'); list.innerHTML = '';
    const ttl = $('#fd-modal-title'); if(ttl) ttl.textContent = title;
    nodes.forEach(n=>{
      const clone = n.cloneNode(true);
      clone.removeAttribute('draggable');
      // ensure visibility if source task was hidden in its hour slot
      clone.style.display = '';
      if(attach){
        clone.addEventListener('click', e=>{
          if(e.target.closest('button')) return;
          openTaskModal(clone.dataset.id);
        });
      }
      list.appendChild(clone);
    });
    // use flex to center panel within viewport
    modal.style.display = 'flex';
    const close = ()=>{ modal.style.display = 'none'; document.removeEventListener('keydown', esc); };
    $('.fd-modal-close', modal)?.addEventListener('click', close);
    $('.fd-modal-backdrop', modal)?.addEventListener('click', close);
    const esc = (e)=>{ if(e.key==='Escape') close(); };
    document.addEventListener('keydown', esc);
  }

  function openHourModal(slotId){
    const dz = document.querySelector('.hour-dropzone[data-hour="'+slotId+'"]');
    if(!dz) return;
    openModal($$('.task', dz), true, 'Tasks at '+slotId);
  }

  function openTaskModal(taskId){
    const getTask = window.fdGetTaskById;
    const makeNode = window.fdCreateTaskNode;
    if(!getTask || !makeNode) return;
    const task = getTask(taskId);
    if(!task) return;
    const hour = window.fdFindTaskHour ? window.fdFindTaskHour(taskId) : null;
    const node = makeNode(task, !!hour);
    openModal([node], false, task.text || 'Task');
    if(hour){
      const list = document.getElementById('fd-modal-list');
      if(list){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hour-all-btn';
        const count = window.fdGetHourTasks ? window.fdGetHourTasks(hour).length : 0;
        btn.textContent = 'Show all tasks in this hour ('+count+')';
        btn.addEventListener('click', ()=>{ window.openHourModal && window.openHourModal(hour); });
        list.appendChild(btn);
      }
    }
  }

  function renderSummary(dz){
    const tasks = $$('.task', dz);
    const count = tasks.length;

    // toggle flag for empty state
    dz.classList.toggle('has-tasks', count > 0);

    // ensure view button exists
    let viewBtn = $('.hour-view-btn', dz);
    if(!viewBtn){
      viewBtn = document.createElement('button');
      viewBtn.type='button';
      viewBtn.className='hour-view-btn';
      viewBtn.textContent='⋯';
      viewBtn.addEventListener('click', e=>{ e.stopPropagation(); openHourModal(dz.dataset.hour); });
      dz.appendChild(viewBtn);
    }

    // remove any previous summary or placeholders when empty
    if(count === 0){
      const list = $('.task-lane', dz); if(list) list.remove();
      return;
    }

    // ensure summary list container
    let list = $('.task-lane', dz);
    if(!list){
      list = document.createElement('div');
      list.className = 'task-lane';
      dz.appendChild(list);
    }

    // reset list contents
    list.innerHTML = '';

    // move tasks into list (hidden) and reset positioning
    tasks.forEach(t=>{
      t.classList.remove('task-chip');
      t.style.position = '';
      t.style.transform = '';
      t.style.left = '';
      t.style.top = '';
      t.style.display='none';
      list.appendChild(t);
    });

    const MAX_VISIBLE = 3;
    const visible = tasks.slice(0, MAX_VISIBLE);
    visible.forEach(t=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'task-chip';
      btn.setAttribute('draggable','true');
      const txt = $('.task-text', t)?.textContent.trim() || 'Task';
      btn.textContent = txt;
      btn.title = txt;
      btn.dataset.taskid = t.dataset.id;
      list.appendChild(btn);
    });

    const extra = count - visible.length;
    if(extra > 0){
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'task-chip all-chip';
      allBtn.textContent = 'View all ('+count+')';
      allBtn.addEventListener('click', e=>{ e.stopPropagation(); openHourModal(dz.dataset.hour); });
      list.appendChild(allBtn);
    }
  }

  function refreshAll(){
    $$(DZ_SEL).forEach(renderSummary);
  }

  // Hard-limit: prevent 5th drop
  document.addEventListener('drop', function(e){
    const dz = e.target.closest(DZ_SEL); if(!dz) return;
    if(dz.querySelectorAll('.task').length >= MAX){
      e.preventDefault(); e.stopPropagation();
      let t = $('#fd-toast');
      if(!t){ t = document.createElement('div'); t.id='fd-toast'; t.className='fd-toast'; document.body.appendChild(t); }
      t.textContent = 'Only '+MAX+' tasks allowed in one hour.'; t.classList.add('show');
      setTimeout(()=>t.classList.remove('show'), 1600);
    }
  }, true);

  // Re-render as tasks move
  const mo = new MutationObserver(refreshAll);
  function attachObservers(){
    mo.disconnect();
    $$(DZ_SEL).forEach(d=>mo.observe(d,{childList:true}));
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ refreshAll(); attachObservers(); });
  } else {
    refreshAll(); attachObservers();
  }

  // refresh when main app re-renders the day grid
  document.addEventListener('fdDayGridRendered', ()=>{ refreshAll(); attachObservers(); });

  window.openHourModal = openHourModal;
  window.openTaskModal = openTaskModal;
  window.fdRefreshAll = refreshAll;
})();
