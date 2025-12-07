// FILE: fieldar.js
// FieldAR -- full-featured annotator with resizable polygon labels
// Single-file version: core + UI
// Requires fabric.min.js (loaded before this file)

(function(){
  // ---------- helpers & DOM ----------
  const dbg = document.getElementById('debugConsole');
  function log(v){ console.log(v); if(dbg){ dbg.innerHTML += `[LOG] ${v}<br>`; dbg.scrollTop = dbg.scrollHeight; } }
  function err(v){ console.error(v); if(dbg){ dbg.innerHTML += `[ERR] ${v}<br>`; dbg.scrollTop = dbg.scrollHeight; } }

  // DOM elements
  const canvasEl = document.getElementById('annotatorCanvas');
  const baseInput = document.getElementById('baseImageInput');
  const addOverlayInput = document.getElementById('addOverlayInput');
  const overlayListEl = document.getElementById('overlayList');
  const sidePanel = document.getElementById('sidePanel');
  const toggleSideBtn = document.getElementById('toggleSideBtn');
  const showHideToolbarBtn = document.getElementById('showHideToolbarBtn');
  const toolbar = document.getElementById('toolbar');
  const deleteBtn = document.getElementById('deleteBtn');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const loadProjectFile = document.getElementById('loadProjectFile');
  const convertPngBtn = document.getElementById('convertPngBtn');
  const removeBgBtn = document.getElementById('removeBgBtn');
  const clearSideBtn = document.getElementById('sideClearBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  const polygonBtn = document.getElementById('polygonBtn');
  const completePolygonBtn = document.getElementById('completePolygonBtn');

  // ---------- canvas init ----------
  if (typeof fabric === 'undefined') {
    err('fabric.js not found -- include the CDN before fieldar.js');
    return;
  }

  const canvas = new fabric.Canvas('annotatorCanvas', { backgroundColor:'#222', preserveObjectStacking:true });
  window._canvas = canvas;
  canvas.allowTouchScrolling = true;
  canvas.uniScaleTransform = true;
  log('Canvas created');

  // Fit logic
  function fitCanvasToViewport(width, height){
    canvas.setWidth(width);
    canvas.setHeight(height);
    canvas.calcOffset();
    canvas.renderAll();
  }

  function computeAvailableSize(){
    const appWidth = document.documentElement.clientWidth;
    const appHeight = document.documentElement.clientHeight - (toolbar ? toolbar.offsetHeight : 48) - (dbg ? dbg.offsetHeight : 140);
    return { w: Math.max(320, appWidth - (sidePanel && !sidePanel.classList.contains('hidden') ? sidePanel.offsetWidth : 0)), h: Math.max(240, appHeight) };
  }

  function fitToViewport(){
    const size = computeAvailableSize();
    fitCanvasToViewport(size.w, size.h);
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
      // store last state in localStorage as quick-recovery -- but main persistence is Save Project
      try { localStorage.setItem('fieldar_overlays', stateStr); } catch(e){}
      log('State pushed (undoStack=' + undoStack.length + ')');
    } catch(e){
      err('pushState error: ' + e);
    }
  }

  function undo(){
    if (undoStack.length <= 1) { log('Nothing to undo'); return; }
    try {
      const cur = undoStack.pop();
      redoStack.push(cur);
      const prev = undoStack[undoStack.length - 1];
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(prev), ()=>{ canvas.renderAll(); isRestoring=false; log('Undo'); rebuildOverlayList(); });
    } catch(e){ err('Undo error: ' + e); isRestoring=false; }
  }

  function redo(){
    if (!redoStack.length) { log('Nothing to redo'); return; }
    try {
      const next = redoStack.pop();
      undoStack.push(next);
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(next), ()=>{ canvas.renderAll(); isRestoring=false; log('Redo'); rebuildOverlayList(); });
    } catch(e){ err('Redo error: ' + e); isRestoring=false;}
  }

  // initial push
  pushState();
  canvas.on('object:added', ()=>{ if(!isRestoring) pushState(); rebuildOverlayList(); });
  canvas.on('object:modified', ()=>{ if(!isRestoring) pushState(); });
  canvas.on('object:removed', ()=>{ if(!isRestoring) pushState(); rebuildOverlayList(); });

  // ---------- util: assign UID ----------
  function assignUID(o){
    if (!o.uid) o.uid = 'o' + Date.now().toString(36) + Math.floor(Math.random()*9999).toString(36);
    return o.uid;
  }

  // ---------- overlay list management ----------
  function rebuildOverlayList(){
    overlayListEl.innerHTML = '';
    const objs = canvas.getObjects().filter(o => o !== canvas.backgroundImage);
    objs.forEach(o=>{
      const id = assignUID(o);
      const item = document.createElement('div');
      item.className = 'overlayItem' + (canvas.getActiveObject() === o ? ' selected' : '');
      item.dataset.uid = id;

      const thumb = document.createElement('img');
      thumb.className = 'overlayThumb';
      try{
        if (o.type === 'image'){
          if (o.getSrc) thumb.src = o.getSrc();
          else if (o._element && o._element.src) thumb.src = o._element.src;
        } else if (o.type === 'group'){
          // attempt to extract first image or render minimal preview
          const imgObj = o._objects.find(x=>x.type==='image');
          if (imgObj && imgObj._element) thumb.src = imgObj._element.src;
          else thumb.src = ''; // fallback
        }
      } catch(e){}

      const meta = document.createElement('div');
      meta.className = 'overlayMeta';
      if (o.type === 'group'){
        const tb = o._objects && o._objects.find(obj=>obj.isType && obj.isType('textbox'));
        meta.textContent = tb ? (tb.text || 'Polygon') : (o.overlayName || (o.uid || id));
      } else {
        meta.textContent = o.overlayName || (o.uid || id);
      }

      const controls = document.createElement('div');
      controls.className = 'overlayControls';

      const selectBtn = document.createElement('button');
      selectBtn.className = 'btn small';
      selectBtn.textContent = 'Select';
      selectBtn.onclick = ()=>{
        canvas.setActiveObject(o);
        canvas.requestRenderAll();
        rebuildOverlayList();
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'btn small';
      delBtn.textContent = 'Delete';
      delBtn.onclick = ()=>{
        canvas.remove(o);
        pushState();
        rebuildOverlayList();
      };

      controls.appendChild(selectBtn);
      controls.appendChild(delBtn);

      item.appendChild(thumb);
      item.appendChild(meta);
      item.appendChild(controls);
      overlayListEl.appendChild(item);
    });
  }

  // ---------- base image handling ----------
  let lastBaseImageDataUrl = null;

  baseInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No base image selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      lastBaseImageDataUrl = e.target.result;
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
        rebuildOverlayList();
        log('Base image loaded and scaled');
      }, { crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    try{ baseInput.value=''; }catch(e){}
  });

  // ---------- add overlay ----------
  addOverlayInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No overlay selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      const dataUrl = e.target.result;
      fabric.Image.fromURL(dataUrl, function(img){
        const maxOverlayW = Math.max(64, canvas.getWidth() * 0.25);
        let scale = 1;
        if (img.width > maxOverlayW) scale = maxOverlayW / img.width;
        img.set({
          left: (canvas.getWidth() - img.width * scale) / 2 || 20,
          top: (canvas.getHeight() - img.height * scale) / 2 || 20,
          originX:'left', originY:'top',
          scaleX: scale, scaleY: scale, selectable: true, hasControls:true
        });
        img.overlayName = f.name || ('overlay-' + Date.now());
        assignUID(img);
        canvas.add(img).setActiveObject(img);
        canvas.requestRenderAll();
        pushState();
        rebuildOverlayList();
        log('Overlay added: ' + img.overlayName);
      }, { crossOrigin:'anonymous' });
    };
    reader.readAsDataURL(f);
    try{ addOverlayInput.value=''; }catch(e){}
  });

  // ---------- delete selected ----------
  deleteBtn.addEventListener('click', ()=>{
    const a = canvas.getActiveObject();
    if (!a) { log('No object selected to delete'); return; }
    canvas.remove(a);
    pushState();
    rebuildOverlayList();
    log('Selected object deleted');
  });

  // ---------- save project ----------
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
      const payload = { baseImageDataUrl: lastBaseImageDataUrl || null, canvas: canvasJSON, exportedAt: new Date().toISOString() };
      download('fieldar-project.json', JSON.stringify(payload, null, 2));
      log('Project saved (download started)');
    } catch(e){ err('Save failed: ' + e); }
  });

  // ---------- load project ----------
  loadBtn.addEventListener('click', ()=> loadProjectFile.click());
  loadProjectFile.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No project file selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.baseImageDataUrl){
          lastBaseImageDataUrl = obj.baseImageDataUrl;
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
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); rebuildOverlayList(); log('Project loaded'); });
          }, { crossOrigin:'anonymous' });
        } else {
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); rebuildOverlayList(); log('Project loaded (no base image)'); });
        }
      } catch(e){ err('Load project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ loadProjectFile.value=''; }catch(e){}
  });

  // ---------- convert base JPEG -> PNG ----------
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
      lastBaseImageDataUrl = png;
      fabric.Image.fromURL(png, (img)=>{
        img.set({ originX:'left', originY:'top', selectable:false });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        pushState();
        log('Base image converted to PNG');
        const a = document.createElement('a'); a.href=png; a.download='base-image.png'; a.click(); URL.revokeObjectURL(a.href);
      }, { crossOrigin:'anonymous' });
    } catch(e){ err('Convert to PNG failed: ' + e); }
  });

  // ---------- remove-bg stub ----------
  removeBgBtn.addEventListener('click', ()=>{
    alert('remove.bg stub -- implement API here.');
    log('removeBgBtn clicked (stub)');
  });

  // ---------- overlay selection sync & keyboard delete ----------
  function getOverlayObjects(){ return canvas.getObjects().filter(o=>o.type==='image' && o!==canvas.backgroundImage); }
  canvas.on('selection:created', ()=> rebuildOverlayList());
  canvas.on('selection:updated', ()=> rebuildOverlayList());
  canvas.on('selection:cleared', ()=> rebuildOverlayList());

  window.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Delete' || ev.key === 'Backspace'){
      const a = canvas.getActiveObject();
      if (a && a.type==='image' && a!==canvas.backgroundImage){
        canvas.remove(a); pushState(); rebuildOverlayList();
      }
    }
    // Ctrl/Cmd+Z for undo
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z'){ undo(); }
    if ((ev.ctrlKey || ev.metaKey) && (ev.shiftKey && ev.key === 'Z')){ redo(); }
  });

  // ---------- UI toggles ----------
  showHideToolbarBtn.addEventListener('click', ()=>{
    if (toolbar.style.display === 'none'){ toolbar.style.display = 'flex'; showHideToolbarBtn.textContent = 'Hide UI'; }
    else { toolbar.style.display = 'none'; showHideToolbarBtn.textContent = 'Show UI'; }
  });

  toggleSideBtn.addEventListener('click', ()=>{
    const hidden = sidePanel.classList.toggle('hidden');
    toggleSideBtn.textContent = hidden ? 'Show' : 'Hide';
    fitToViewport();
  });

  function orientationCheck(){
    if (window.innerWidth > window.innerHeight){ sidePanel.classList.remove('hidden'); toggleSideBtn.textContent='Hide'; }
    else{ sidePanel.classList.add('hidden'); toggleSideBtn.textContent='Show'; }
    fitToViewport();
  }
  window.addEventListener('resize', orientationCheck);
  orientationCheck();

  clearSideBtn.addEventListener('click', ()=>{
    const overlays = getOverlayObjects();
    overlays.forEach(o=>canvas.remove(o));
    pushState(); rebuildOverlayList(); log('All overlay images removed');
  });

  // ---------- polygon drawing (Finish button; resizable label) ----------
  let polygonMode = false;
  let tempPoints = [], tempLines = [], previewPoly = null, previewLine = null;

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
    // larger radius for touch
    const circ = new fabric.Circle({
      left: p.x, top: p.y, radius: 6, fill: tempPoints.length===0 ? 'red' : '#fff', stroke:'#000',
      originX:'center', originY:'center', selectable:false
    });
    canvas.add(circ); tempPoints.push(circ);

    if (tempPoints.length > 1){
      const prev = tempPoints[tempPoints.length-2];
      const line = new fabric.Line([prev.left, prev.top, circ.left, circ.top], { stroke:'#FFD400', strokeWidth:2, selectable:false, evented:false });
      canvas.add(line); tempLines.push(line);
    }

    // update preview polygon
    if (previewPoly) canvas.remove(previewPoly);
    const pts = tempPoints.map(pnt=>({x:pnt.left, y:pnt.top}));
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
    previewLine = new fabric.Line([last.left, last.top, p.x, p.y], { stroke:'#FFD400', strokeWidth:1.2, selectable:false, evented:false });
    canvas.add(previewLine);

    if (previewPoly) { canvas.remove(previewPoly); previewPoly = null; }
    const pts = tempPoints.map(pnt=>({x:pnt.left, y:pnt.top}));
    pts.push({x:p.x, y:p.y});
    previewPoly = new fabric.Polygon(pts, { fill:'rgba(255,210,0,0.06)', stroke:'#FFD400', strokeWidth:1, selectable:false, evented:false });
    canvas.add(previewPoly);
    canvas.renderAll();
  });

  function finalizePolygonFromTemp(){
    if (tempPoints.length < 3){ log('Need at least 3 points'); return; }

    const pts = tempPoints.map(p=>({x:p.left, y:p.top}));
    const poly = new fabric.Polygon(pts, { fill:'rgba(255,255,0,0.15)', stroke:'#FFD400', strokeWidth:2, selectable:true });

    const label = prompt('Enter annotation text for this polygon:', '');
    const txt = new fabric.Textbox(label || '', {
      fontSize: Math.max(12, Math.min(28, Math.round(poly.width * 0.08))),
      fill: '#FFD400',
      stroke: '#000',
      strokeWidth: 1,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      editable: true,
      backgroundColor: 'rgba(0,0,0,0)'
    });

    // center text inside polygon (relative coordinates)
    txt.left = poly.width / 2;
    txt.top = poly.height / 2;
    txt.setCoords();

    // Group polygon + textbox. We keep group scale locked-to-text resizing behavior in object:scaling handler below.
    const group = new fabric.Group([poly, txt], { left: poly.left, top: poly.top, selectable: true, hasControls: true, lockScalingFlip: true });
    // ensure UID
    assignUID(group);

    // When group is scaled, adjust text fontSize and reset group scale to 1 to avoid polygon distortion
    group.on('scaling', function(){
      try {
        const g = group;
        const pObj = g.item(0);
        const tObj = g.item(1);
        // compute a fontSize proportion based on the group's transform
        const newFont = Math.max(10, Math.min(80, Math.round((tObj.fontSize || 14) * (g.scaleX || 1))));
        tObj.fontSize = newFont;
        tObj.setCoords();
        // Reset group's scale so polygon retains shape; keep group's left/top unchanged
        const left = g.left, top = g.top;
        g.scaleX = 1; g.scaleY = 1;
        g.left = left; g.top = top;
        canvas.renderAll();
      } catch(e){}
    });

    // When group is moved or modified, ensure text stays centered
    group.on('modified', function(){
      try {
        const pObj = group.item(0);
        const tObj = group.item(1);
        // reposition textbox to polygon center inside group
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
    rebuildOverlayList();
  }

  // double-click edit label
  canvas.on('mouse:dblclick', function(ev){
    if (!ev.target) return;
    const obj = ev.target;
    if (obj.type === 'group'){
      const tb = obj._objects && obj._objects.find(o => o.isType && o.isType('textbox'));
      if (tb){
        const current = tb.text || '';
        const newText = prompt('Edit label text:', current);
        if (newText !== null){
          tb.text = newText;
          tb.setCoords();
          canvas.renderAll();
          pushState();
          log('Label updated');
          rebuildOverlayList();
        }
      }
    }
  });

  // ---------- overlay list click -> select ----------
  overlayListEl.addEventListener('click', (ev)=>{
    const node = ev.target.closest('.overlayItem');
    if (!node) return;
    const uid = node.dataset.uid;
    const found = canvas.getObjects().find(o=>o.uid === uid);
    if (found){
      canvas.setActiveObject(found);
      canvas.requestRenderAll();
      rebuildOverlayList();
    }
  });

  // ---------- initial listing & localStorage notice ----------
  function initialRebuild(){
    rebuildOverlayList();
    const saved = localStorage.getItem('fieldar_overlays');
    if (saved){
      log('Project found in localStorage (use Load Project to restore).');
    }
  }
  initialRebuild();

  // ---------- undo/redo wiring ----------
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // ---------- expose for console -->
  window.fieldar = {
    canvas,
    pushState,
    undo,
    redo,
    setPolygonMode,
    finalizePolygonFromTemp
  };

  log('fieldar.js ready (single-file build)');
})();