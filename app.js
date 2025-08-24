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
    const state={ all, day:null, draggingId:null, filterCat:null, prefs };

    const flashSaved=()=>{ el.saveStatus.textContent='Saved'; el.saveStatus.style.opacity='1'; setTimeout(()=>el.saveStatus.style.opacity='.85',600); };
    const persist=()=>{ state.all[state.day.dateISO]=JSON.parse(JSON.stringify(state.day)); saveAll(state.all); flashSaved(); };

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
      if(!task.timer) task.timer={ elapsed:0, running:false, startedAt:null };
      return task.timer;
    }
    function taskElapsedSeconds(task){
      const t=ensureTimer(task);
      if(t.running && t.startedAt){ return t.elapsed + Math.floor((Date.now()-t.startedAt)/1000); }
      return t.elapsed;
    }
    function startTimer(id){
      const task=getTaskById(id); if(!task) return;
      const t=ensureTimer(task);
      if(!t.running){ t.running=true; t.startedAt=Date.now(); persist(); }
    }
    function pauseTimer(id){
      const task=getTaskById(id); if(!task) return;
      const t=ensureTimer(task);
      if(t.running){
        t.elapsed += Math.floor((Date.now()-t.startedAt)/1000);
        t.running=false; t.startedAt=null; persist();
      }
    }
    function resetTimer(id){
      const task=getTaskById(id); if(!task) return;
      task.timer={ elapsed:0, running:false, startedAt:null }; persist();
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
        const play=document.createElement('button'); play.className='timer-btn play'; play.title='Start'; play.textContent='▶';
        const pause=document.createElement('button'); pause.className='timer-btn pause'; pause.title='Pause'; pause.textContent='⏸';
        const reset=document.createElement('button'); reset.className='timer-btn reset'; reset.title='Reset'; reset.textContent='⟲';
        box.append(time, play, pause, reset);
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
      const play=e.target.closest?.('.timer-btn.play');
      const pause=e.target.closest?.('.timer-btn.pause');
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
      if(play){ const id=play.closest('.task')?.dataset.id; if(!id) return; startTimer(id); }
      if(pause){ const id=pause.closest('.task')?.dataset.id; if(!id) return; pauseTimer(id); }
      if(reset){ const id=reset.closest('.task')?.dataset.id; if(!id) return; resetTimer(id); render(); }

      const chip=e.target.closest?.('.task-chip');
      if(chip && !chip.classList.contains('all-chip')){
        window.openTaskModal && window.openTaskModal(chip.dataset.taskid);
      }

      const taskEl=e.target.closest?.('.task');
      if(taskEl && !taskEl.closest('#hourModal') && !e.target.closest('button')){
        window.openTaskModal && window.openTaskModal(taskEl.dataset.id);
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

    // ---- DnD for tasks ----
document.addEventListener(
  'dragstart',
  e => {
    const t = e.target.closest?.('.task, .task-chip');
    if (!t) return;
    state.draggingId = t.dataset.id || t.dataset.taskid;
    if (t.classList.contains('task-chip')) {
      t.classList.add('dragging');
      t.style.width = t.getBoundingClientRect().width + 'px';
    }
  },
  true
);
document.addEventListener(
  'dragend',
  e => {
    const t = e.target.closest?.('.task-chip');
    if (t) {
      t.classList.remove('dragging');
      t.style.width = '';
    }
    state.draggingId = null;
    onDragEnd();
  },
  true
);
    document.addEventListener('dragover', e=>{ const dz=e.target.closest?.('.droppable'); if(!dz) return; e.preventDefault(); dz.classList.add('drag-over'); });
    document.addEventListener('dragleave', e=>{ const dz=e.target.closest?.('.droppable'); if(!dz) return; dz.classList.remove('drag-over'); });
    document.addEventListener('drop', e=>{
      const dz=e.target.closest?.('.droppable'); if(!dz) return; e.preventDefault(); dz.classList.remove('drag-over');
      const id=state.draggingId; if(!id) return;
      const copy=e.ctrlKey||e.metaKey||e.altKey||e.shiftKey;
      let moved=getTaskById(id); if(!moved) return;
      if(copy){
        moved={ id:Math.random().toString(36).slice(2,9), text:moved.text, done:false, cat:moved.cat, timer:{elapsed:0,running:false,startedAt:null} };
      }else{
        removeEverywhere(id);
      }

      if(dz.id==='backlog'){
        const target=e.target.closest('.task'); let index = state.day.backlog.length;
        if(target){ const rect=target.getBoundingClientRect(); const before=e.clientY < (rect.top + rect.height/2);
          const intoIdx=state.day.backlog.findIndex(t=>t.id===target.dataset.id); index = intoIdx + (before?0:1); }
        state.day.backlog.splice(index,0,moved); persist(); render(); return;
      }
      if(dz.classList.contains('hour-dropzone')){
        ensureTimer(moved); // timers available in hours
        const hourKey=dz.dataset.hour, slots=state.day.hours[hourKey].slots;
        const list=slots.filter(Boolean); const target=e.target.closest('.task-chip'); let dest=list.length;
        if(target){ const rect=target.getBoundingClientRect(); const before=e.clientX < (rect.left + rect.width/2);
          const intoIdx=list.findIndex(t=>t.id===target.dataset.taskid); dest = intoIdx + (before?0:1); }
        list.splice(dest,0,moved); const trimmed=list.slice(0,4); for(let i=0;i<4;i++) slots[i]=trimmed[i]||null;
        persist(); render(); return;
      }
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

    // ---- update timer text every second (lightweight, no full render) ----
    setInterval(()=>{
      const now=Date.now();
      $$('.task.in-hour .timer-time').forEach(span=>{
        const id=span.closest('.task').dataset.id;
        const t=getTaskById(id);
        if(!t) return;
        const running=t.timer?.running && t.timer?.startedAt;
        const base=t.timer?.elapsed||0;
        const secs = running ? base + Math.floor((now - t.timer.startedAt)/1000) : base;
        span.textContent = fmtDur(secs);
      });
    }, 1000);

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

function dropIntoHour(slotEl, chipEl) {
  chipEl.style.position = '';
  chipEl.style.transform = '';
  chipEl.style.left = '';
  chipEl.style.top = '';
  chipEl.classList.add('task-chip');

  const list =
    slotEl.querySelector('.task-lane') ||
    slotEl.appendChild(Object.assign(document.createElement('div'), { className: 'task-lane' }));

  list.appendChild(chipEl);
}

function onDragEnd() {
  document.querySelectorAll('.drag-preview').forEach(el => el.remove());
}
(function(){
  const DZ_SEL = '.hour-dropzone, .hour-slot .dropzone, .hour .dropzone, .hour .tasks';
  const MAX = 4;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  function openModal(nodes, attach=true){
    const modal = $('#hourModal'); if(!modal) return;
    const list  = $('#fd-modal-list'); list.innerHTML = '';
    nodes.forEach(n=>{
      const clone = n.cloneNode(true);
      clone.removeAttribute('draggable');
      if(attach){
        clone.addEventListener('click', e=>{
          if(e.target.closest('button')) return;
          openTaskModal(clone.dataset.id);
        });
      }
      list.appendChild(clone);
    });
    modal.style.display = 'block';
    const close = ()=>{ modal.style.display = 'none'; document.removeEventListener('keydown', esc); };
    $('.fd-modal-close', modal)?.addEventListener('click', close);
    $('.fd-modal-backdrop', modal)?.addEventListener('click', close);
    const esc = (e)=>{ if(e.key==='Escape') close(); };
    document.addEventListener('keydown', esc);
  }

  function openHourModal(slotId){
    const dz = document.querySelector('.hour-dropzone[data-hour="'+slotId+'"]');
    if(!dz) return;
    openModal($$('.task', dz), true);
  }

  function openTaskModal(taskId){
    const getTask = window.fdGetTaskById;
    const makeNode = window.fdCreateTaskNode;
    if(!getTask || !makeNode) return;
    const task = getTask(taskId);
    if(!task) return;
    const hour = window.fdFindTaskHour ? window.fdFindTaskHour(taskId) : null;
    const node = makeNode(task, !!hour);
    openModal([node], false);
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
      dropIntoHour(dz, t);
      t.style.display='none';
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
      allBtn.textContent = 'All tasks ('+count+')';
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
