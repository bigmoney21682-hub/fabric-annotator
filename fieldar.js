// FILE: fieldar.js
// FieldAR -- HUD with AR Photo/Video Modes and overlay lock toggle

(function(){
  // ---------- debug ----------
  const dbgEl = document.getElementById('debugConsole');
  function log(msg){ console.log(msg); if(dbgEl){ dbgEl.innerHTML += `[LOG] ${msg}<br>`; dbgEl.scrollTop = dbgEl.scrollHeight; } }
  function err(msg){ console.error(msg); if(dbgEl){ dbgEl.innerHTML += `[ERR] ${msg}<br>`; dbgEl.scrollTop = dbgEl.scrollHeight; } }

  // ---------- DOM ----------
  const canvasEl = document.getElementById('annotatorCanvas');
  const baseInput = document.getElementById('baseImageInput');
  const addOverlayInput = document.getElementById('addOverlayInput');
  const overlayManagerBtn = document.getElementById('overlayManagerBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const loadProjectFile = document.getElementById('loadProjectFile');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const showHideToolbarBtn = document.getElementById('showHideToolbarBtn');
  const toolbar = document.getElementById('toolbar');
  const modeToggleBtn = document.getElementById('modeToggleBtn');  // AR Mode toggle
  const editLockBtn = document.getElementById('editLockBtn');      // Lock/unlock overlay editing

  // Modal elements
  const modalBackdrop = document.getElementById('overlayModalBackdrop');
  const modalList = document.getElementById('overlayModalList');
  const modalSearch = document.getElementById('overlaySearch');
  const closeModalBtn = document.getElementById('closeOverlayModal');
  const modalAddOverlay = document.getElementById('modalAddOverlay');
  const exportProjectBtn = document.getElementById('exportProjectBtn');
  const importProjectBtn = document.getElementById('importProjectBtn');
  const importProjectInput = document.getElementById('importProjectInput');

  // ---------- Fabric canvas ----------
  if(typeof fabric==='undefined'){ err('Fabric.js not found.'); return; }
  const canvas = new fabric.Canvas('annotatorCanvas', { backgroundColor:'#222', preserveObjectStacking:true });
  window._canvas = canvas;
  canvas.allowTouchScrolling = true;
  canvas.uniScaleTransform = true;

  // ---------- layout ----------
  function computeAvailableSize(){
    const appWidth = document.documentElement.clientWidth;
    const appHeight = document.documentElement.clientHeight - (toolbar ? toolbar.offsetHeight : 48) - (dbgEl ? dbgEl.offsetHeight : 100);
    return { w: Math.max(320, appWidth), h: Math.max(240, appHeight) };
  }
  function fitToViewport(){
    const size = computeAvailableSize();
    canvas.setWidth(size.w);
    canvas.setHeight(size.h);
    canvas.calcOffset();
    canvas.renderAll();
  }
  window.addEventListener('resize', fitToViewport);
  fitToViewport();

  // ---------- undo/redo ----------
  let undoStack = [], redoStack = [], isRestoring=false;
  const MAX_STACK = 80;
  function pushState(){
    if(isRestoring) return;
    try {
      const j = canvas.toJSON(['uid','overlayName']);
      undoStack.push(JSON.stringify(j));
      if(undoStack.length>MAX_STACK) undoStack.shift();
      redoStack=[];
      try{ localStorage.setItem('fieldar_overlays', undoStack[undoStack.length-1]); }catch(e){}
    }catch(e){ err('pushState error: '+e); }
  }
  function undo(){
    if(undoStack.length<=1){ log('Nothing to undo'); return; }
    const cur = undoStack.pop();
    redoStack.push(cur);
    const prev = undoStack[undoStack.length-1];
    isRestoring=true;
    canvas.loadFromJSON(JSON.parse(prev), ()=>{ canvas.renderAll(); isRestoring=false; populateModalList(); });
  }
  function redo(){
    if(!redoStack.length){ log('Nothing to redo'); return; }
    const next = redoStack.pop();
    undoStack.push(next);
    isRestoring=true;
    canvas.loadFromJSON(JSON.parse(next), ()=>{ canvas.renderAll(); isRestoring=false; populateModalList(); });
  }
  canvas.on('object:added',()=>{ if(!isRestoring) pushState(); populateModalList(); });
  canvas.on('object:modified',()=>{ if(!isRestoring) pushState(); });
  canvas.on('object:removed',()=>{ if(!isRestoring) pushState(); populateModalList(); });
  pushState();

  // ---------- overlay helpers ----------
  function assignUID(o){ if(!o.uid) o.uid='o'+Date.now().toString(36)+Math.floor(Math.random()*9999).toString(36); return o.uid; }
  function getOverlaysAndPolygons(){
    const objs = canvas.getObjects();
    const images = objs.filter(o=>o.type==='image' && o!==canvas.backgroundImage);
    const groups = objs.filter(o=>o.type==='group');
    return { images, groups };
  }

  // ---------- modal ----------
  function openModal(){ populateModalList(); modalBackdrop.classList.add('visible'); modalBackdrop.setAttribute('aria-hidden','false'); setTimeout(()=>modalSearch.focus(),120); }
  function closeModal(){ modalBackdrop.classList.remove('visible'); modalBackdrop.setAttribute('aria-hidden','true'); }
  overlayManagerBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', ev=>{ if(ev.target===modalBackdrop) closeModal(); });

  function createOverlayRow({type,obj,index}){
    const row=document.createElement('div'); row.className='overlayRow';
    const thumb=document.createElement('img'); thumb.className='overlayThumb';
    if(type==='image'){ try{ thumb.src=obj.getSrc?obj.getSrc():obj._element.src; }catch(e){} }
    else if(type==='polygon'){ const imgChild=obj._objects.find(o=>o.type==='image'); if(imgChild&&imgChild._element) thumb.src=imgChild._element.src; else thumb.src=''; }
    const meta=document.createElement('div'); meta.className='overlayMeta';
    if(type==='image') meta.textContent=obj.overlayName||('Image '+index);
    else { const tb=obj._objects.find(o=>o.isType&&o.isType('textbox')); meta.textContent=(tb?tb.text:'Polygon '+index); }

    const actions=document.createElement('div'); actions.className='overlayActions';
    const selectBtn=document.createElement('button'); selectBtn.className='btn small'; selectBtn.textContent='Select';
    selectBtn.onclick=(ev)=>{ ev.stopPropagation(); canvas.setActiveObject(obj); canvas.requestRenderAll(); closeModal(); };
    const renameBtn=document.createElement('button'); renameBtn.className='btn small'; renameBtn.textContent='Rename';
    renameBtn.onclick=(ev)=>{ ev.stopPropagation(); const current=(type==='image'?obj.overlayName:(obj._objects.find(o=>o.isType&&o.isType('textbox'))?.text||'')); const n=prompt('New name:',current); if(n===null) return; if(type==='image') obj.overlayName=n; else { const tb=obj._objects.find(o=>o.isType&&o.isType('textbox')); if(tb){ tb.text=n; tb.setCoords(); } } pushState(); populateModalList(); };
    const dupBtn=document.createElement('button'); dupBtn.className='btn small'; dupBtn.textContent='Duplicate';
    dupBtn.onclick=(ev)=>{ ev.stopPropagation(); obj.clone(clone=>{ clone.left=(obj.left||20)+16; clone.top=(obj.top||20)+16; assignUID(clone); canvas.add(clone); pushState(); populateModalList(); },['uid','overlayName']); };
    const delBtn=document.createElement('button'); delBtn.className='btn small'; delBtn.textContent='Delete';
    delBtn.onclick=(ev)=>{ ev.stopPropagation(); if(!confirm('Delete this item?')) return; canvas.remove(obj); pushState(); populateModalList(); };

    actions.appendChild(selectBtn); actions.appendChild(renameBtn); actions.appendChild(dupBtn); actions.appendChild(delBtn);
    row.appendChild(thumb); row.appendChild(meta); row.appendChild(actions);
    row.onclick=()=>{ canvas.setActiveObject(obj); canvas.requestRenderAll(); populateModalList(); };
    return row;
  }

  function populateModalList(filterText=''){
    modalList.innerHTML='';
    const { images, groups } = getOverlaysAndPolygons();
    images.forEach((img,idx)=>{ const name=img.overlayName||('Image '+(idx+1)); if(filterText&&!name.toLowerCase().includes(filterText.toLowerCase())) return; modalList.appendChild(createOverlayRow({type:'image',obj:img,index:idx+1})); });
    groups.forEach((g,idx)=>{ const name=g._objects.find(o=>o.isType&&o.isType('textbox'))?.text||('Polygon '+(idx+1)); if(filterText&&!name.toLowerCase().includes(filterText.toLowerCase())) return; modalList.appendChild(createOverlayRow({type:'polygon',obj:g,index:idx+1})); });
    if(!modalList.children.length){ const empty=document.createElement('div'); empty.style.color='#aaa'; empty.style.padding='10px'; empty.textContent='No overlays or polygons found.'; modalList.appendChild(empty); }
  }
  modalSearch.addEventListener('input', ev=>populateModalList(ev.target.value));

  // ---------- base image ----------
  baseInput.addEventListener('change', ev=>{
    const f=ev.target.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=e=>{
      fabric.Image.fromURL(e.target.result,img=>{
        const avail=computeAvailableSize();
        const scale=Math.min(avail.w/img.width,avail.h/img.height,1);
        img.set({ originX:'left', originY:'top', selectable:false }).scale(scale);
        canvas.setWidth(Math.round(img.width*scale));
        canvas.setHeight(Math.round(img.height*scale));
        canvas.setBackgroundImage(img,canvas.renderAll.bind(canvas));
        pushState(); populateModalList();
      },{ crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    baseInput.value='';
  });

  // ---------- add overlay ----------
  function addOverlayFromFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      fabric.Image.fromURL(e.target.result,img=>{
        const maxOverlayW=Math.max(64,canvas.getWidth()*0.25); let scale=1; if(img.width>maxOverlayW) scale=maxOverlayW/img.width;
        img.set({ left:(canvas.getWidth()-img.width*scale)/2||20, top:(canvas.getHeight()-img.height*scale)/2||20, originX:'left', originY:'top', scaleX:scale, scaleY:scale, selectable:!editLocked });
        img.overlayName=file.name||('overlay-'+Date.now()); assignUID(img);
        canvas.add(img).setActiveObject(img); pushState(); populateModalList();
      },{ crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(file);
  }
  addOverlayInput.addEventListener('change', ev=>{ if(ev.target.files[0]) addOverlayFromFile(ev.target.files[0]); ev.target.value=''; });
  modalAddOverlay.addEventListener('change', ev=>{ if(ev.target.files[0]) addOverlayFromFile(ev.target.files[0]); ev.target.value=''; });

  // ---------- delete ----------
  deleteBtn.addEventListener('click', ()=>{
    const a=canvas.getActiveObject();
    if(!a){ log('No object selected to delete'); return; }
    if(!confirm('Delete selected item?')) return;
    canvas.remove(a); pushState(); populateModalList();
  });

  // ---------- undo/redo ----------
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // ---------- show/hide toolbar ----------
  showHideToolbarBtn.addEventListener('click', ()=>{ if(toolbar.style.display==='none') toolbar.style.display='flex'; else toolbar.style.display='none'; });

  // ---------- AR Mode / AR Photo Mode ----------
  let currentMode='photo'; // 'photo' or 'video'
  let editLocked=false;
  function setMode(mode){
    currentMode=mode;
    if(mode==='photo'){
      toolbar.style.display='flex';
      editLocked=false;
      editLockBtn.textContent='Lock Editing';
      modeToggleBtn.textContent='Switch to AR Video Mode';
    } else {
      // AR Video Mode: top toolbar auto-hide, overlays interactable by default
      toolbar.style.display='none';
      setTimeout(()=>toolbar.style.display='flex', 0); // show on first tap
      editLocked=false;
      editLockBtn.textContent='Lock Editing';
      modeToggleBtn.textContent='Switch to AR Photo Mode';
    }
    // apply lock state to all objects
    canvas.getObjects().forEach(o=>{ if(o.type!=='background') o.selectable=!editLocked; });
    canvas.requestRenderAll();
    log('Mode switched to '+mode);
  }
  setMode('photo');

  // ---------- toggle mode ----------
  modeToggleBtn.addEventListener('click', ()=>{
    if(currentMode==='photo') setMode('video'); else setMode('photo');
  });

  // ---------- toggle edit lock ----------
  editLockBtn.addEventListener('click', ()=>{
    editLocked=!editLocked;
    canvas.getObjects().forEach(o=>{ if(o.type!=='background') o.selectable=!editLocked; });
    editLockBtn.textContent=editLocked?'Unlock Editing':'Lock Editing';
    log('Overlay editing '+(editLocked?'locked':'unlocked'));
  });

})();