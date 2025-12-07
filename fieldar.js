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
  const overlayManagerBtn = document.getElementById('overlayManagerBtn') || document.getElementById('overlay-explorer-toggle');
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

  // Modal elements (IDs from your code)
  const modalBackdrop = document.getElementById('overlayModalBackdrop');
  const modalList = document.getElementById('overlayModalList') || document.getElementById('explorer-list');
  const modalSearch = document.getElementById('overlaySearch') || (document.getElementById('overlaySearch') || { addEventListener: ()=>{} });
  const closeModalBtn = document.getElementById('closeOverlayModal');
  const modalAddOverlay = document.getElementById('modalAddOverlay') || document.getElementById('addOverlayInput');
  const exportProjectBtn = document.getElementById('exportProjectBtn');
  const importProjectBtn = document.getElementById('importProjectBtn');
  const importProjectInput = document.getElementById('importProjectInput') || document.getElementById('importProjectFile');

  // ---------- ensure Fabric ready ----------
  if (typeof fabric === 'undefined') {
    err('fabric.js not found. Make sure CDN is included before fieldar.js.');
    return;
  }

  // ---------- canvas init ----------
  const canvas = new fabric.Canvas('annotatorCanvas', { backgroundColor:'#222', preserveObjectStacking:true, allowTouchScrolling:true });
  window._canvas = canvas;
  canvas.uniScaleTransform = true;
  log('Canvas created');

  // ---------- layout helpers ----------
  const toolbar = document.getElementById('toolbar');
  function computeAvailableSize(){
    const appWidth = document.documentElement.clientWidth;
    const appHeight = document.documentElement.clientHeight - (toolbar ? toolbar.offsetHeight : 48) - (dbgEl ? dbgEl.offsetHeight : 70);
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
    if(modalBackdrop) {
      modalBackdrop.classList.add('visible');
      modalBackdrop.setAttribute('aria-hidden','false');
    }
    setTimeout(()=>{ try{ modalSearch.focus(); }catch(e){} },120);
  }
  function closeModal(){
    if(modalBackdrop) {
      modalBackdrop.classList.remove('visible');
      modalBackdrop.setAttribute('aria-hidden','true');
    }
  }

  if (overlayManagerBtn) overlayManagerBtn.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  // click backdrop to close
  if (modalBackdrop) modalBackdrop.addEventListener('click', (ev)=>{
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
      // clone object - ensure to include custom props
      if (obj.clone) {
        obj.clone(function(clone){
          clone.left = (obj.left || 20) + 16;
          clone.top = (obj.top || 20) + 16;
          assignUID(clone);
          canvas.add(clone);
          // if group cloned, add handles
          if(clone.type === 'group') addVertexHandlesToGroup(clone);
          pushState();
          populateModalList();
        }, ['uid','overlayName']);
      } else {
        log('Clone not supported for this object type');
      }
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (ev)=>{
      ev.stopPropagation();
      if(!confirm('Delete this item?')) return;
      // remove associated handles first if present
      removeHandlesForObject(obj);
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
    if(!modalList) return;
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

  if(modalSearch && modalSearch.addEventListener) modalSearch.addEventListener('input', (ev)=> populateModalList(ev.target.value));

  // ---------- modal add overlay input ----------
  if(modalAddOverlay) modalAddOverlay.addEventListener('change', (ev)=>{
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
  if(addOverlayInput) addOverlayInput.addEventListener('change', (ev)=>{
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

  if(baseInput) baseInput.addEventListener('change', (ev)=>{
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
  if(deleteBtn) deleteBtn.addEventListener('click', ()=>{
    const a = canvas.getActiveObject();
    if (!a) { log('No object selected to delete'); return; }
    if (!confirm('Delete selected item?')) return;
    removeHandlesForObject(a);
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

  if(saveBtn) saveBtn.addEventListener('click', ()=>{
    try {
      const canvasJSON = canvas.toJSON(['uid','overlayName']);
      const payload = { baseImageDataUrl: (canvas.backgroundImage && canvas.backgroundImage._element ? canvas.backgroundImage._element.src : null), canvas: canvasJSON, exportedAt: new Date().toISOString() };
      download('fieldar-project.json', JSON.stringify(payload, null, 2));
      log('Project saved (download started)');
    } catch(e){ err('Save failed: ' + e); }
  });

  if(loadBtn) loadBtn.addEventListener('click', ()=> loadProjectFile.click());
  if(loadProjectFile) loadProjectFile.addEventListener('change', (ev)=>{
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
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); addHandlesForAllGroups(); log('Project loaded'); });
          }, { crossOrigin:'anonymous' });
        } else {
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); addHandlesForAllGroups(); log('Project loaded (no base image)'); });
        }
      } catch(e){ err('Load project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ loadProjectFile.value=''; }catch(e){}
  });

  // ---------- modal export/import project ----------
  if(exportProjectBtn) exportProjectBtn.addEventListener('click', ()=>{
    try {
      const canvasJSON = canvas.toJSON(['uid','overlayName']);
      const payload = { baseImageDataUrl: (canvas.backgroundImage && canvas.backgroundImage._element ? canvas.backgroundImage._element.src : null), canvas: canvasJSON, exportedAt: new Date().toISOString() };
      download('fieldar-project.json', JSON.stringify(payload, null, 2));
      log('Project exported from modal');
    } catch(e){ err('Export failed: ' + e); }
  });

  if(importProjectBtn) importProjectBtn.addEventListener('click', ()=> importProjectInput.click());
  if(importProjectInput) importProjectInput.addEventListener('change', (ev)=>{
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
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); addHandlesForAllGroups(); log('Imported project into modal'); });
          }, { crossOrigin:'anonymous' });
        } else {
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); populateModalList(); addHandlesForAllGroups(); log('Imported project into modal (no base image)'); });
        }
      } catch(e){ err('Import project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ importProjectInput.value=''; }catch(e){}
  });

  // ---------- convert to PNG (base) ----------
  if(convertPngBtn) convertPngBtn.addEventListener('click', ()=>{
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
  if(removeBgBtn) removeBgBtn.addEventListener('click', ()=>{ alert('remove.bg stub -- implement API here.'); log('removeBgBtn clicked (stub)'); });

  // ---------- polygon drawing (Finish button) ----------
  let polygonMode = false, tempPoints = [], tempLines = [], previewPoly = null, previewLine = null;

  function setPolygonMode(on){
    polygonMode = !!on;
    if (!polygonMode) cleanupTempDrawing();
    log('Polygon mode ' + (polygonMode ? 'ON' : 'OFF'));
  }
  if(polygonBtn) polygonBtn.addEventListener('click', ()=> setPolygonMode(!polygonMode));
  if(completePolygonBtn) completePolygonBtn.addEventListener('click', ()=> finalizePolygonFromTemp());

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

  // ---------- Vertex Handles System (NEW) ----------
  // Purpose: allow direct dragging of polygon vertices (works on groups where first child is polygon).
  let handlesDirty = false;
  let activeHandle = null;

  function createHandle(left, top, parentGroup, pointIndex){
    const h = new fabric.Circle({
      left, top,
      radius:7,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 1.5,
      originX:'center', originY:'center',
      hasControls: false,
      hasBorders: false,
      selectable: true,
      hoverCursor: 'pointer',
      evented: true
    });
    h.pointIndex = pointIndex;
    h.parentGroup = parentGroup;
    // preserve layering above group
    h.bringToFront();

    // moving: update polygon point immediately (visual feedback)
    h.on('moving', function(){
      if(!h.parentGroup) return;
      const grp = h.parentGroup;
      const poly = grp._objects && grp._objects[0] && (grp._objects[0].type === 'polygon' ? grp._objects[0] : null);
      if(!poly) return;
      // compute new coords relative to group
      const newX = h.left - grp.left;
      const newY = h.top - grp.top;
      if (!poly.points || !poly.points[h.pointIndex]) return;
      poly.points[h.pointIndex].x = newX;
      poly.points[h.pointIndex].y = newY;
      poly.set({ dirty: true });
      poly.setCoords();
      // reposition preview label inside polygon group (if exists)
      const tb = grp._objects.find(o=>o.isType && o.isType('textbox'));
      if(tb){
        tb.left = poly.width / 2;
        tb.top = poly.height / 2;
        tb.setCoords();
      }
      canvas.requestRenderAll();
      handlesDirty = true;
      activeHandle = h;
    });

    // mouse up: finalize and push state
    h.on('mouseup', function(){
      activeHandle = null;
      if(handlesDirty){
        handlesDirty = false;
        pushState();
        populateModalList();
      }
    });

    // attach remove handler when parent removed
    return h;
  }

  function addVertexHandlesToGroup(group){
    // clear existing handles first
    removeHandlesForObject(group);
    const poly = group._objects && group._objects[0] && (group._objects[0].type === 'polygon' ? group._objects[0] : null);
    if(!poly || !poly.points) return;
    group._handles = [];
    // ensure group has stable left/top (fabric may store bbox)
    group.setCoords();
    for(let i=0;i<poly.points.length;i++){
      const pt = poly.points[i];
      const hx = group.left + pt.x;
      const hy = group.top + pt.y;
      const handle = createHandle(hx, hy, group, i);
      canvas.add(handle);
      group._handles.push(handle);
    }
    // bring handles above everything
    group._handles.forEach(h => h.bringToFront());
  }

  function removeHandlesForObject(obj){
    try {
      if(!obj) return;
      if(obj._handles && Array.isArray(obj._handles)){
        obj._handles.forEach(h => { try{ canvas.remove(h); }catch(e){} });
        obj._handles = [];
      }
      // if obj is group and its children have handles stored separately, attempt cleanup
      if(obj.type === 'group' && obj._handles) obj._handles = [];
    } catch(e){}
  }

  // update handle positions when group moves/resizes
  function updateHandlesForGroup(group){
    try {
      if(!group._handles || !group._objects || !group._objects[0]) return;
      const poly = group._objects[0];
      poly.setCoords();
      for(let i=0;i<poly.points.length && i<group._handles.length;i++){
        const pt = poly.points[i];
        const h = group._handles[i];
        h.left = group.left + pt.x;
        h.top = group.top + pt.y;
        h.setCoords();
      }
      canvas.requestRenderAll();
    } catch(e){}
  }

  // hide all handles (called on selection cleared etc)
  function hideAllHandles(){
    const objs = canvas.getObjects();
    objs.forEach(o => {
      if(o._handles && Array.isArray(o._handles)){
        o._handles.forEach(h => { try{ canvas.remove(h); }catch(e){} });
        o._handles = [];
      }
    });
  }

  // add handles for all groups currently on canvas (useful after load)
  function addHandlesForAllGroups(){
    const groups = canvas.getObjects().filter(o=>o.type === 'group');
    groups.forEach(g => {
      addVertexHandlesToGroup(g);
    });
  }

  // listen for group movement / modification to reposition handles
  canvas.on('object:moving', function(ev){
    const obj = ev.target;
    if(!obj) return;
    if(obj.type === 'group'){
      updateHandlesForGroup(obj);
    }
    // if dragging a handle, we updated polygon in handle moving
  });

  canvas.on('object:modified', function(ev){
    const obj = ev.target;
    if(!obj) return;
    // after group modified, recalc handles
    if(obj.type === 'group') updateHandlesForGroup(obj);
  });

  // when object removed, cleanup its handles
  canvas.on('object:removed', function(ev){
    const obj = ev.target;
    if(obj) removeHandlesForObject(obj);
  });

  // when selection changes, show handles for selected group only
  canvas.on('selection:created', function(ev){
    const obj = ev.target;
    // hide handles for others
    hideAllHandles();
    if(obj && obj.type === 'group'){
      // ensure handles exist
      addVertexHandlesToGroup(obj);
    } else {
      // if selection is an image, nothing to show
      // but ensure any group handles remain removed
    }
    populateModalList();
  });
  canvas.on('selection:updated', function(ev){
    const obj = ev.target;
    hideAllHandles();
    if(obj && obj.type === 'group'){
      addVertexHandlesToGroup(obj);
    }
    populateModalList();
  });
  canvas.on('selection:cleared', function(ev){
    hideAllHandles();
    populateModalList();
  });

  // ---------- finalize polygon creation (existing) ----------
  function finalizePolygonFromTemp(){
    if (tempPoints.length < 3){ log('Need at least 3 points'); return; }
    const pts = tempPoints.map(p=>({x:p.left,y:p.top}));
    const poly = new fabric.Polygon(pts, { fill:'rgba(255,255,0,0.15)', stroke:'#FFD400', strokeWidth:2, selectable:true, objectCaching:false });
    const label = prompt('Enter annotation text for this polygon:', '');
    const txt = new fabric.Textbox(label || '', { fontSize: Math.max(12, Math.min(28, Math.round(poly.width * 0.08))), fill:'#FFD400', stroke:'#000', strokeWidth:1, textAlign:'center', originX:'center', originY:'center', editable:true, backgroundColor:'rgba(0,0,0,0)' });
    // place the textbox centered relative to polygon bounding box
    // We'll compute group coords after group creation
    const group = new fabric.Group([poly, txt], { left: poly.left || 20, top: poly.top || 20, selectable:true, hasControls:true, lockScalingFlip:true, objectCaching:false });
    assignUID(group);

    // scaling handler: instead of uniform group scale, update inner textbox font size and reset group scale
    group.on('scaling', function(){
      try {
        const g = group;
        const pObj = g.item(0);
        const tObj = g.item(1);
        // compute approximate new font size from width ratio
        const scaleX = g.scaleX || 1;
        const newFont = Math.max(10, Math.min(120, Math.round((tObj.fontSize || 14) * scaleX)));
        tObj.fontSize = newFont;
        tObj.setCoords();
        // Reset scale to 1 to avoid distortion
        const left = g.left, top = g.top;
        g.scaleX = 1; g.scaleY = 1;
        g.left = left; g.top = top;
        // update positions so handles correlate
        canvas.requestRenderAll();
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
    // after adding, set textbox center
    try {
      const pObj = group.item(0);
      const tObj = group.item(1);
      tObj.left = pObj.width / 2;
      tObj.top = pObj.height / 2;
      tObj.setCoords();
    } catch(e){}
    // add vertex handles so user can reshape polygon immediately
    addVertexHandlesToGroup(group);

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
      if (a){ removeHandlesForObject(a); canvas.remove(a); pushState(); populateModalList(); }
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') undo();
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'Z' || ev.key === 'z')) redo();
  });

  // ---------- simple UI toggles ----------
  if(showHideToolbarBtn) showHideToolbarBtn.addEventListener('click', ()=>{
    if (toolbar.style.display === 'none'){ toolbar.style.display = 'flex'; showHideToolbarBtn.textContent = 'Hide UI'; }
    else { toolbar.style.display = 'none'; showHideToolbarBtn.textContent = 'Show UI'; }
  });

  // ---------- initial population ----------
  function initialPopulate(){
    populateModalList();
    const saved = localStorage.getItem('fieldar_overlays');
    if (saved) log('Local project state found (Load Project to restore).');
    // add handles to groups if page had already loaded a JSON into canvas via other means
    setTimeout(()=>addHandlesForAllGroups(), 300);
  }
  initialPopulate();

  // ---------- wire undo/redo buttons ----------
  if(undoBtn) undoBtn.addEventListener('click', undo);
  if(redoBtn) redoBtn.addEventListener('click', redo);

  // ---------- expose for console debugging ----------
  window.fieldar = { canvas, pushState, undo, redo, setPolygonMode, finalizePolygonFromTemp };

  log('fieldar.js (modal build, with vertex handles) ready');
})();