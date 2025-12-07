// FILE: fieldar.js
// FieldAR -- single-file annotator with floating Overlay Manager modal (Option B)
// Core + UI combined. Requires fabric.min.js loaded before this file.

(function(){
  // ---------- debug helpers ----------
  const dbgEl = document.getElementById('debugConsole');
  function log(msg){ console.log(msg); if(dbgEl){ dbgEl.innerHTML += `[LOG] ${msg}<br>`; dbgEl.scrollTop = dbgEl.scrollHeight; } }
  function err(msg){ console.error(msg); if(dbgEl){ dbgEl.innerHTML += `[ERR] ${msg}<br>`; dbgEl.scrollTop = dbgEl.scrollHeight; } }

  // ---------- DOM elements ----------
  const canvasEl = document.getElementById('annotatorCanvas');
  const baseInput = document.getElementById('baseImageInput');
  const addOverlayInput = document.getElementById('addOverlayInput');
  const overlayManagerBtn = document.getElementById('overlayManagerBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const loadProjectFile = document.getElementById('loadProjectFile');
  const convertPngBtn = document.getElementById('convertPngBtn');
  const removeBgBtn = document.getElementById('removeBgBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const showHideToolbarBtn = document.getElementById('showHideToolbarBtn');

  const polygonBtn = document.getElementById('polygonBtn');
  const completePolygonBtn = document.getElementById('completePolygonBtn');

  // Modal elements
  const modalBackdrop = document.getElementById('overlayModalBackdrop');
  const modalList = document.getElementById('overlayModalList');
  const modalSearch = document.getElementById('overlaySearch');
  const closeModalBtn = document.getElementById('closeOverlayModal');
  const modalAddOverlay = document.getElementById('modalAddOverlay');
  const exportProjectBtn = document.getElementById('exportProjectBtn');
  const importProjectBtn = document.getElementById('importProjectBtn');
  const importProjectInput = document.getElementById('importProjectInput');

  // ---------- ensure Fabric ready ----------
  if (typeof fabric === 'undefined') {
    err('fabric.js not found. Make sure CDN is included before fieldar.js.');
    return;
  }

  // ---------- canvas init ----------
  const canvas = new fabric.Canvas('annotatorCanvas', { backgroundColor:'#222', preserveObjectStacking:true });
  window._canvas = canvas;
  canvas.allowTouchScrolling = true;
  canvas.uniScaleTransform = true;
  log('Canvas created');

  // ---------- layout helpers ----------
  const toolbar = document.getElementById('toolbar');
  function computeAvailableSize(){
    const appWidth = document.documentElement.clientWidth;
    const appHeight = document.documentElement.clientHeight - (toolbar ? toolbar.offsetHeight : 48) - (dbgEl ? dbgEl.offsetHeight : 140);
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

  // ---------- state & stacks ----------
  let undoStack = [];
  let redoStack = [];
  let isRestoring = false;
  const MAX_STACK = 80;

  function pushState(){
    if (isRestoring) return;
    try {
      const j = canvas.toJSON(['uid','overlayName']);
      const stateStr = JSON.stringify(j);
      undoStack.push(stateStr);
      if (undoStack.length > MAX_STACK) undoStack.shift();
      redoStack = [];
      try { localStorage.setItem('fieldar_overlays', stateStr); } catch(e){}
      log('State pushed (undoStack=' + undoStack.length + ')');
    } catch(e){ err('pushState error: ' + e); }
  }

  function undo(){
    if (undoStack.length <= 1) { log('Nothing to undo'); return; }
    try {
      const cur = undoStack.pop();
      redoStack.push(cur);
      const prev = undoStack[undoStack.length - 1];
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(prev), ()=>{ canvas.renderAll(); isRestoring=false; log('Undo'); populateModalList(); });
    } catch(e){ err('Undo error: ' + e); isRestoring=false; }
  }

  function redo(){
    if (!redoStack.length) { log('Nothing to redo'); return; }
    try {
      const next = redoStack.pop();
      undoStack.push(next);
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(next), ()=>{ canvas.renderAll(); isRestoring=false; log('Redo'); populateModalList(); });
    } catch(e){ err('Redo error: ' + e); isRestoring=false;}
  }

  canvas.on('object:added', ()=>{ if(!isRestoring) pushState(); populateModalList(); });
  canvas.on('object:modified', ()=>{ if(!isRestoring) pushState(); });
  canvas.on('object:removed', ()=>{ if(!isRestoring) pushState(); populateModalList(); });

  // initial push
  pushState();

  // ---------- util ----------
  function assignUID(o){
    if (!o.uid) o.uid = 'o' + Date.now().toString(36) + Math.floor(Math.random()*9999).toString(36);
    return o.uid;
  }

  function getOverlaysAndPolygons(){
    const objs = canvas.getObjects();
    const images = objs.filter(o => o.type === 'image' && o !== canvas.backgroundImage);
    const groups = objs.filter(o => o.type === 'group'); // our polygons are groups
    return { images, groups };
  }

  // ---------- Modal: open/close ----------
  function openModal(){
    populateModalList();
    modalBackdrop.classList.add('visible');
    modalBackdrop.setAttribute('aria-hidden','false');
    // ensure focus on search
    setTimeout(()=>modalSearch.focus(),120);
  }
  function closeModal(){
    modalBackdrop.classList.remove('visible');
    modalBackdrop.setAttribute('aria-hidden','true');
  }

  overlayManagerBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  // click backdrop to close
  modalBackdrop.addEventListener('click', (ev)=>{
    if (ev.target === modalBackdrop) closeModal();
  });

  // ---------- Modal: populate list ----------
  function createOverlayRow({type, obj, index}){
    const row = document.createElement('div');
    row.className = 'overlayRow';

    const thumb = document.createElement('img');
    thumb.className = 'overlayThumb';
    if (type === 'image'){
      // try to get src
      try {
        if (obj.getSrc) thumb.src = obj.getSrc();
        else if (obj._element && obj._element.src) thumb.src = obj._element.src;
      } catch(e){}
    } else if (type === 'polygon'){
      // if polygon group contains an image use it, otherwise blank
      const imgChild = obj._objects && obj._objects.find(o=>o.type==='image');
      if (imgChild && imgChild._element) thumb.src = imgChild._element.src;
      else thumb.src = ''; // transparent
    }

    const meta = document.createElement('div');
    meta.className = 'overlayMeta';
    if (type === 'image') meta.textContent = obj.overlayName || ('Image ' + index);
    else {
      // polygon label if present
      const tb = obj._objects && obj._objects.find(o=>o.isType && o.isType('textbox'));
      const ptCount = obj._objects && obj._objects[0] && obj._objects[0].points ? obj._objects[0].points.length : '?';
      meta.textContent = (tb && tb.text ? tb.text : ('Polygon ' + index)) + ' -- ' + ptCount + ' pts';
    }

    const actions = document.createElement('div');
    actions.className = 'overlayActions';

    const selectBtn = document.createElement('button');
    selectBtn.className = 'btn small';
    selectBtn.textContent = 'Select';
    selectBtn.onclick = (ev)=>{ ev.stopPropagation(); canvas.setActiveObject(obj); canvas.requestRenderAll(); closeModal(); };

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn small';
    renameBtn.textContent = 'Rename';
    renameBtn.onclick = (ev)=>{
      ev.stopPropagation();
      const current = (type==='image' ? (obj.overlayName || '') : (obj._objects && obj._objects.find(o=>o.isType && o.isType('textbox')) ? obj._objects.find(o=>o.isType && o.isType('textbox')).text : ''));
      const n = prompt('New name:', current);
      if (n === null) return;
      if (type === 'image'){
        obj.overlayName = n;
      } else {
        const tb = obj._objects && obj._objects.find(o=>o.isType && o.isType('textbox'));
        if (tb) { tb.text = n; tb.setCoords(); }
      }
      pushState(); populateModalList();
    };

    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn small';
    dupBtn.textContent = 'Duplicate';
    dupBtn.onclick = (ev)=>{
      ev.stopPropagation();
      // clone object
      obj.clone(function(clone){
        clone.left = (obj.left || 20) + 16;
        clone.top = (obj.top || 20) + 16;
        assignUID(clone);
        canvas.add(clone);
        pushState();
        populateModalList();
      }, ['uid','overlayName']);
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (ev)=>{
      ev.stopPropagation();
      if(!confirm('Delete this item?')) return;
      canvas.remove(obj);
      pushState();
      populateModalList();
    };

    actions.appendChild(selectBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);

    row.appendChild(thumb);
    row.appendChild(meta);
    row.appendChild(actions);

    // clicking row selects too
    row.onclick = ()=>{
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      populateModalList(); // reflect selection
    };

    return row;
  }

  function populateModalList(filterText = ''){
    modalList.innerHTML = '';
    const { images, groups } = getOverlaysAndPolygons();

    // images first
    images.forEach((img, idx)=>{
      const name = img.overlayName || ('Image ' + (idx+1));
      if (filterText && !name.toLowerCase().includes(filterText.toLowerCase())) return;
      const row = createOverlayRow({ type:'image', obj: img, index: idx+1 });
      modalList.appendChild(row);
    });

    // groups (polygons) next
    groups.forEach((g, idx)=>{
      const nameTb = g._objects && g._objects.find(o=>o.isType && o.isType('textbox'));
      const name = nameTb ? (nameTb.text || ('Polygon ' + (idx+1))) : ('Polygon ' + (idx+1));
      if (filterText && !name.toLowerCase().includes(filterText.toLowerCase())) return;
      const row = createOverlayRow({ type:'polygon', obj: g, index: idx+1 });
      modalList.appendChild(row);
    });

    if (!modalList.children.length){
      const empty = document.createElement('div');
      empty.style.color = '#aaa';
      empty.style.padding = '10px';
      empty.textContent = 'No overlays or polygons found.';
      modalList.appendChild(empty);
    }
  }

  modalSearch.addEventListener('input', (ev)=> populateModalList(ev.target.value));

  // ---------- modal add overlay input ----------
  modalAddOverlay.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      fabric.Image.fromURL(e.target.result, function(img){
        const maxOverlayW = Math.max(64, canvas.getWidth() * 0.25);
        let scale = 1;
        if (img.width > maxOverlayW) scale = maxOverlayW / img.width;
        img.set({ left: (canvas.getWidth() - img.width * scale) / 2 || 20, top: (canvas.getHeight() - img.height * scale) / 2 || 20, originX:'left', originY:'top', scaleX: scale, scaleY: scale, selectable: true });
        img.overlayName = f.name || ('overlay-' + Date.now());
        assignUID(img);
        canvas.add(img).setActiveObject(img);
        pushState();
        populateModalList();
      }, { crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    try{ modalAddOverlay.value=''; }catch(e){}
  });

  // ---------- toolbar file inputs (Add Overlay, Base Image) ----------
  addOverlayInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      fabric.Image.fromURL(e.target.result, function(img){
        const maxOverlayW = Math.max(64, canvas.getWidth() * 0.25);
        let scale = 1;
        if (img.width > maxOverlayW) scale = maxOverlayW / img.width;
        img.set({ left: (canvas.getWidth() - img.width * scale) / 2 || 20, top: (canvas.getHeight() - img.height * scale) / 2 || 20, originX:'left', originY:'top', scaleX: scale, scaleY: scale, selectable: true });
        img.overlayName = f.name || ('overlay-' + Date.now());
        assignUID(img);
        canvas.add(img).setActiveObject(img);
        pushState();
        populateModalList();
        log('Overlay added via toolbar: ' + img.overlayName);
      }, { crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    try{ addOverlayInput.value=''; }catch(e){}
  });

  baseInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No base image selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      fabric.Image.fromURL(e.target.result, function(img){
        const avail = computeAvailableSize();
        const maxW = avail.w;
        const maxH = avail.h;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        img.set({ originX:'left', originY:'top', selectable:false });
        img.scale(scale);
        canvas.setWidth(Math.round(img.width * scale));
        canvas.setHeight(Math.round(img.height * scale));
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        canvas.renderAll();
        pushState();
        populateModalList();
        log('Base image loaded and scaled');
      }, { crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    try{ baseInput.value=''; }catch(e){}
  });

  // ---------- delete selected ----------
  deleteBtn.addEventListener('click', ()=>{
    const a = canvas.getActiveObject();
    if (!a) { log('No object selected to delete'); return; }
    if (!confirm('Delete selected item?')) return;
    canvas.remove(a);
    pushState();
    populateModalList();
    log('Selected object deleted');
  });

  // ---------- save / load project ----------
  function download(filename, text){
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  saveBtn.addEventListener('click', ()=>{
    try {
      const canvasJSON = canvas.toJSON(['uid','overlayName']);
      const payload = { baseImageDataUrl: (canvas.backgroundImage && canvas.backgroundImage._element ? canvas.backgroundImage._element.src : null), canvas: canvasJSON, exportedAt: new Date().toISOString() };
      download('fieldar-project.json', JSON.stringify(payload, null, 2));
      log('Project saved (download started)');
    } catch(e){ err('Save failed: ' + e); }
  });

  loadBtn.addEventListener('click', ()=> loadProjectFile.click());
  loadProjectFile.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No project file selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.baseImageDataUrl){
          fabric.Image.fromURL(obj.baseImageDataUrl, (img)=>{
            const maxW = window.innerWidth;
            const maxH = computeAvailableSize().h;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            img.set({ originX:'left', originY:'top', selectable:false });
            img.scale(scale);
            canvas.setWidth(Math.round(img.width * scale));
            canvas.setHeight(Math.round(img.height * scale));
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
            isRestoring = true;
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); log('Project loaded'); });
          }, { crossOrigin:'anonymous' });
        } else {
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); log('Project loaded (no base image)'); });
        }
      } catch(e){ err('Load project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ loadProjectFile.value=''; }catch(e){}
  });

  // ---------- modal export/import project ----------
  exportProjectBtn.addEventListener('click', ()=>{
    try {
      const canvasJSON = canvas.toJSON(['uid','overlayName']);
      const payload = { baseImageDataUrl: (canvas.backgroundImage && canvas.backgroundImage._element ? canvas.backgroundImage._element.src : null), canvas: canvasJSON, exportedAt: new Date().toISOString() };
      download('fieldar-project.json', JSON.stringify(payload, null, 2));
      log('Project exported from modal');
    } catch(e){ err('Export failed: ' + e); }
  });

  importProjectBtn.addEventListener('click', ()=> importProjectInput.click());
  importProjectInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.baseImageDataUrl){
          fabric.Image.fromURL(obj.baseImageDataUrl, (img)=>{
            const maxW = window.innerWidth;
            const maxH = computeAvailableSize().h;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            img.set({ originX:'left', originY:'top', selectable:false });
            img.scale(scale);
            canvas.setWidth(Math.round(img.width * scale));
            canvas.setHeight(Math.round(img.height * scale));
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
            isRestoring = true;
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); log('Imported project into modal'); });
          }, { crossOrigin:'anonymous' });
        } else {
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); log('Imported project into modal (no base image)'); });
        }
      } catch(e){ err('Import project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ importProjectInput.value=''; }catch(e){}
  });

  // ---------- convert to PNG (base) ----------
  convertPngBtn.addEventListener('click', ()=>{
    if (!canvas.backgroundImage) { log('No base image to convert'); return; }
    try {
      const bgImg = canvas.backgroundImage;
      const tmp = document.createElement('canvas');
      tmp.width = Math.round(bgImg.width * (bgImg.scaleX||1));
      tmp.height = Math.round(bgImg.height * (bgImg.scaleY||1));
      const ctx = tmp.getContext('2d');
      if (bgImg._element) ctx.drawImage(bgImg._element, 0, 0, tmp.width, tmp.height);
      else if (bgImg.getElement) ctx.drawImage(bgImg.getElement(), 0, 0, tmp.width, tmp.height);
      else { err('Cannot access background image element'); return; }
      const png = tmp.toDataURL('image/png');
      fabric.Image.fromURL(png, (img)=>{
        img.set({ originX:'left', originY:'top', selectable:false });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        pushState();
        log('Base image converted to PNG');
        // optionally download:
        const a = document.createElement('a'); a.href=png; a.download='base-image.png'; a.click(); URL.revokeObjectURL(a.href);
      }, { crossOrigin:'anonymous' });
    } catch(e){ err('Convert to PNG failed: ' + e); }
  });

  // ---------- remove-bg stub ----------
  removeBgBtn.addEventListener('click', ()=>{ alert('remove.bg stub -- implement API here.'); log('removeBgBtn clicked (stub)'); });

  // ---------- polygon drawing (Finish button) ----------
  let polygonMode = false, tempPoints = [], tempLines = [], previewPoly = null, previewLine = null;

  function setPolygonMode(on){
    polygonMode = !!on;
    if (!polygonMode) cleanupTempDrawing();
    log('Polygon mode ' + (polygonMode ? 'ON' : 'OFF'));
  }
  polygonBtn.addEventListener('click', ()=> setPolygonMode(!polygonMode));
  completePolygonBtn.addEventListener('click', ()=> finalizePolygonFromTemp());

  function cleanupTempDrawing(){
    tempPoints.forEach(p=>canvas.remove(p));
    tempLines.forEach(l=>canvas.remove(l));
    if (previewPoly) canvas.remove(previewPoly);
    if (previewLine) canvas.remove(previewLine);
    tempPoints=[]; tempLines=[]; previewPoly=null; previewLine=null;
    canvas.renderAll();
  }

  canvas.on('mouse:down', function(ev){
    if(!polygonMode) return;
    const p = canvas.getPointer(ev.e);
    const circ = new fabric.Circle({ left:p.x, top:p.y, radius:6, fill: tempPoints.length===0 ? 'red':'#fff', stroke:'#000', originX:'center', originY:'center', selectable:false });
    canvas.add(circ); tempPoints.push(circ);
    if (tempPoints.length > 1){
      const prev = tempPoints[tempPoints.length-2];
      const line = new fabric.Line([prev.left, prev.top, circ.left, circ.top], { stroke:'#FFD400', strokeWidth:2, selectable:false, evented:false });
      canvas.add(line); tempLines.push(line);
    }
    if (previewPoly) canvas.remove(previewPoly);
    const pts = tempPoints.map(pnt=>({x:pnt.left,y:pnt.top}));
    previewPoly = new fabric.Polygon(pts, { fill:'rgba(255,210,0,0.08)', stroke:'#FFD400', strokeWidth:1, selectable:false, evented:false });
    canvas.add(previewPoly);
    canvas.renderAll();
  });

  canvas.on('mouse:move', function(ev){
    if(!polygonMode) return;
    const p = canvas.getPointer(ev.e);
    if (tempPoints.length === 0) return;
    if (previewLine) { canvas.remove(previewLine); previewLine = null; }
    const last = tempPoints[tempPoints.length-1];
    previewLine = new fabric.Line([last.left,last.top,p.x,p.y], { stroke:'#FFD400', strokeWidth:1.2, selectable:false, evented:false });
    canvas.add(previewLine);
    if (previewPoly) { canvas.remove(previewPoly); previewPoly=null; }
    const pts = tempPoints.map(pnt=>({x:pnt.left,y:pnt.top})); pts.push({x:p.x,y:p.y});
    previewPoly = new fabric.Polygon(pts, { fill:'rgba(255,210,0,0.06)', stroke:'#FFD400', strokeWidth:1, selectable:false, evented:false });
    canvas.add(previewPoly);
    canvas.renderAll();
  });

  function finalizePolygonFromTemp(){
    if (tempPoints.length < 3){ log('Need at least 3 points'); return; }
    const pts = tempPoints.map(p=>({x:p.left,y:p.top}));
    const poly = new fabric.Polygon(pts, { fill:'rgba(255,255,0,0.15)', stroke:'#FFD400', strokeWidth:2, selectable:true });
    const label = prompt('Enter annotation text for this polygon:', '');
    const txt = new fabric.Textbox(label || '', { fontSize: Math.max(12, Math.min(28, Math.round(poly.width * 0.08))), fill:'#FFD400', stroke:'#000', strokeWidth:1, textAlign:'center', originX:'center', originY:'center', editable:true, backgroundColor:'rgba(0,0,0,0)' });
    txt.left = poly.width / 2; txt.top = poly.height / 2; txt.setCoords();
    const group = new fabric.Group([poly, txt], { left: poly.left, top: poly.top, selectable:true, hasControls:true, lockScalingFlip:true });
    assignUID(group);

    // scaling handler to resize label font instead of stretching group
    group.on('scaling', function(){
      try {
        const g = group;
        const pObj = g.item(0);
        const tObj = g.item(1);
        const newFont = Math.max(10, Math.min(80, Math.round((tObj.fontSize || 14) * (g.scaleX || 1))));
        tObj.fontSize = newFont;
        tObj.setCoords();
        const left = g.left, top = g.top;
        g.scaleX = 1; g.scaleY = 1;
        g.left = left; g.top = top;
        canvas.renderAll();
      } catch(e){}
    });

    group.on('modified', function(){
      try {
        const pObj = group.item(0);
        const tObj = group.item(1);
        tObj.left = pObj.width / 2;
        tObj.top = pObj.height / 2;
        tObj.setCoords();
        canvas.renderAll();
      } catch(e){}
    });

    canvas.add(group);
    cleanupTempDrawing();
    setPolygonMode(false);
    pushState();
    log('Polygon created with label: ' + (label || ''));
    populateModalList();
  }

  // double click to edit label
  canvas.on('mouse:dblclick', function(ev){
    if (!ev.target) return;
    const obj = ev.target;
    if (obj.type === 'group'){
      const tb = obj._objects && obj._objects.find(o=>o.isType && o.isType('textbox'));
      if (tb){
        const current = tb.text || '';
        const newText = prompt('Edit label text:', current);
        if (newText !== null){
          tb.text = newText;
          tb.setCoords();
          canvas.renderAll();
          pushState();
          log('Label updated');
          populateModalList();
        }
      }
    }
  });

  // ---------- selection sync ----------
  canvas.on('selection:created', ()=> populateModalList());
  canvas.on('selection:updated', ()=> populateModalList());
  canvas.on('selection:cleared', ()=> populateModalList());

  // ---------- keyboard handlers ----------
  window.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Delete' || ev.key === 'Backspace'){
      const a = canvas.getActiveObject();
      if (a){ canvas.remove(a); pushState(); populateModalList(); }
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') undo();
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'Z' || ev.key === 'z')) redo();
  });

  // ---------- simple UI toggles ----------
  showHideToolbarBtn.addEventListener('click', ()=>{
    if (toolbar.style.display === 'none'){ toolbar.style.display = 'flex'; showHideToolbarBtn.textContent = 'Hide UI'; }
    else { toolbar.style.display = 'none'; showHideToolbarBtn.textContent = 'Show UI'; }
  });

  // ---------- initial population ----------
  function initialPopulate(){
    populateModalList();
    const saved = localStorage.getItem('fieldar_overlays');
    if (saved) log('Local project state found (Load Project to restore).');
  }
  initialPopulate();

  // ---------- wire undo/redo buttons ----------
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // ---------- expose for console debugging ----------
  window.fieldar = { canvas, pushState, undo, redo, setPolygonMode, finalizePolygonFromTemp };

  log('fieldar.js (modal build) ready');
})();