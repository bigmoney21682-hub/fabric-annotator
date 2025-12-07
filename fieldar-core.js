// FILE: fieldar.js
// FieldAR -- full-featured annotator
// Features: base image load, overlays (add/select/delete), overlay list, save/load project,
// convert base → PNG, remove-bg stub, polygon drawing with prompted labels,
// undo/redo, show/hide UI, side panel responsive, debug console.
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
  const canvas = new fabric.Canvas('annotatorCanvas', { backgroundColor:'#222', preserveObjectStacking:true });
  window._canvas = canvas;
  log('Canvas created');

  // Keep canvas element filling available area (we size to background or viewport)
  function fitCanvasToViewport(width, height){
    canvas.setWidth(width);
    canvas.setHeight(height);
    canvas.calcOffset();
    canvas.renderAll();
  }

  // start with full viewport area (main area minus side panel width if visible)
  function computeAvailableSize(){
    const appWidth = document.documentElement.clientWidth;
    const appHeight = document.documentElement.clientHeight - (toolbar ? toolbar.offsetHeight : 44) - (dbg ? dbg.offsetHeight : 140);
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
      const j = canvas.toJSON(['uid','overlayName']); // include custom props
      const stateStr = JSON.stringify(j);
      undoStack.push(stateStr);
      if (undoStack.length > MAX_STACK) undoStack.shift();
      redoStack = [];
      localStorage.setItem('fieldar_overlays', stateStr);
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

  // initial seed
  pushState();

  canvas.on('object:added', ()=>{ if(!isRestoring) pushState(); rebuildOverlayList(); });
  canvas.on('object:modified', ()=>{ if(!isRestoring) pushState(); });
  canvas.on('object:removed', ()=>{ if(!isRestoring) pushState(); rebuildOverlayList(); });

  // ---------- utility: assign UID to object ----------
  function assignUID(o){
    if (!o.uid) o.uid = 'o' + Date.now().toString(36) + Math.floor(Math.random()*9999).toString(36);
    return o.uid;
  }

  // ---------- overlay list management ----------
  function rebuildOverlayList(){
    overlayListEl.innerHTML = '';
    const objs = canvas.getObjects().filter(o => o.type === 'image' && o !== canvas.backgroundImage);
    objs.forEach(o=>{
      const id = assignUID(o);
      const item = document.createElement('div');
      item.className = 'overlayItem' + (canvas.getActiveObject() === o ? ' selected' : '');
      item.dataset.uid = id;

      const thumb = document.createElement('img');
      thumb.className = 'overlayThumb';
      // try to use object.src if available; fallback to toDataURL of the element
      try{
        if (o.getSrc) thumb.src = o.getSrc();
        else if (o._element && o._element.src) thumb.src = o._element.src;
      }catch(e){}
      const meta = document.createElement('div');
      meta.className = 'overlayMeta';
      meta.textContent = o.overlayName || (o.uid || id);

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
  let lastBaseImageDataUrl = null; // keeps original data url when user loads base image

  baseInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No base image selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      lastBaseImageDataUrl = e.target.result; // save the original data url (jpeg etc)
      fabric.Image.fromURL(e.target.result, function(img){
        // fit to viewport area
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
    // clear input
    try{ baseInput.value=''; }catch(e){}
  });

  // ---------- add overlay (image overlay) ----------
  addOverlayInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) { log('No overlay selected'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      const dataUrl = e.target.result;
      fabric.Image.fromURL(dataUrl, function(img){
        // scale overlay to reasonable size (25% of canvas width) if large
        const maxOverlayW = Math.max(64, canvas.getWidth() * 0.25);
        let scale = 1;
        if (img.width > maxOverlayW) scale = maxOverlayW / img.width;
        img.set({
          left: (canvas.getWidth() - img.width * scale) / 2 || 20,
          top: (canvas.getHeight() - img.height * scale) / 2 || 20,
          originX:'left',
          originY:'top',
          scaleX: scale,
          scaleY: scale,
          selectable: true,
          hasControls: true
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

  // ---------- delete selected overlay ----------
  deleteBtn.addEventListener('click', ()=>{
    const a = canvas.getActiveObject();
    if (!a) { log('No object selected to delete'); return; }
    canvas.remove(a);
    pushState();
    rebuildOverlayList();
    log('Selected object deleted');
  });

  // ---------- save project (JSON) ----------
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
      // Save current canvas JSON (includes overlays). Also include base image data url if we have it.
      const canvasJSON = canvas.toJSON(['uid','overlayName']);
      const payload = {
        baseImageDataUrl: lastBaseImageDataUrl || null,
        canvas: canvasJSON,
        exportedAt: new Date().toISOString()
      };
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
        // load base image (if present)
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
            // then load canvas objects
            isRestoring = true;
            canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); rebuildOverlayList(); log('Project loaded'); });
          }, { crossOrigin:'anonymous' });
        } else {
          // no base image, just load canvas JSON
          isRestoring = true;
          canvas.loadFromJSON(obj.canvas, ()=>{ canvas.renderAll(); isRestoring=false; pushState(); rebuildOverlayList(); log('Project loaded (no base image)'); });
        }
      } catch(e){ err('Load project parse error: ' + e); }
    };
    reader.readAsText(f);
    try{ loadProjectFile.value=''; }catch(e){}
  });

  // ---------- convert base JPEG -> PNG (client-side) ----------
  convertPngBtn.addEventListener('click', ()=>{
    if (!canvas.backgroundImage) { log('No base image to convert'); return; }
    try {
      // draw background to offscreen canvas, export PNG, reapply as background and set lastBaseImageDataUrl
      const bgImg = canvas.backgroundImage;
      // create temp canvas element
      const tmp = document.createElement('canvas');
      tmp.width = Math.round(bgImg.width * bgImg.scaleX);
      tmp.height = Math.round(bgImg.height * bgImg.scaleY);
      const ctx = tmp.getContext('2d');
      // draw source image element scaled
      if (bgImg._element) {
        ctx.drawImage(bgImg._element, 0, 0, tmp.width, tmp.height);
      } else if (bgImg.getElement) {
        ctx.drawImage(bgImg.getElement(), 0, 0, tmp.width, tmp.height);
      } else {
        err('Cannot access background image element for conversion');
        return;
      }
      const png = tmp.toDataURL('image/png');
      lastBaseImageDataUrl = png;
      // reapply as fabric image
      fabric.Image.fromURL(png, (img)=>{
        img.set({ originX:'left', originY:'top', selectable:false });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        pushState();
        log('Base image converted to PNG and replaced');
        // trigger download as optional (comment out if not desired)
        const a = document.createElement('a');
        a.href = png; a.download = 'base-image.png'; a.click();
        URL.revokeObjectURL(a.href);
      }, { crossOrigin:'anonymous' });
    } catch(e){ err('Convert to PNG failed: ' + e); }
  });

  // ---------- remove-bg stub ----------
  removeBgBtn.addEventListener('click', ()=>{
    // This is a stub. You can hook this to remove.bg or another API.
    // Example flow: upload lastBaseImageDataUrl to API -> get returned PNG (with transparent bg) -> replace base
    const confirmMsg = 'This button is a placeholder for remove.bg integration. You can hook an API here.';
    alert(confirmMsg);
    log('removeBgBtn clicked (stub). Implement API call here.');
  });

  // ---------- overlay selection sync & delete via keyboard ---------
  function getOverlayObjects(){
    return canvas.getObjects().filter(o=>o.type==='image' && o !== canvas.backgroundImage);
  }

  canvas.on('selection:created', ()=> rebuildOverlayList());
  canvas.on('selection:updated', ()=> rebuildOverlayList());
  canvas.on('selection:cleared', ()=> rebuildOverlayList());

  // Delete with Delete key on keyboard (if available)
  window.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Delete' || ev.key === 'Backspace'){
      const a = canvas.getActiveObject();
      if (a && a.type === 'image' && a !== canvas.backgroundImage){
        canvas.remove(a);
        pushState();
        rebuildOverlayList();
      }
    }
  });

  // ---------- show/hide UI toggles ----------
  showHideToolbarBtn.addEventListener('click', ()=>{
    if (toolbar.style.display === 'none'){
      toolbar.style.display = 'flex';
      showHideToolbarBtn.textContent = 'Hide UI';
    } else {
      toolbar.style.display = 'none';
      showHideToolbarBtn.textContent = 'Show UI';
    }
  });

  toggleSideBtn.addEventListener('click', ()=>{
    const hidden = sidePanel.classList.toggle('hidden');
    toggleSideBtn.textContent = hidden ? 'Show' : 'Hide';
    fitToViewport();
  });

  // auto-show side panel in landscape
  function orientationCheck(){
    if (window.innerWidth > window.innerHeight){
      // landscape
      sidePanel.classList.remove('hidden');
      toggleSideBtn.textContent = 'Hide';
    } else {
      // portrait -> hide side panel by default
      sidePanel.classList.add('hidden');
      toggleSideBtn.textContent = 'Show';
    }
    fitToViewport();
  }
  window.addEventListener('resize', orientationCheck);
  orientationCheck();

  // ---------- clear side list (remove overlays only) ----------
  clearSideBtn.addEventListener('click', ()=>{
    const overlays = getOverlayObjects();
    overlays.forEach(o=>canvas.remove(o));
    pushState();
    rebuildOverlayList();
    log('All overlay images removed');
  });

  // ---------- export/import (done above via save/load) ----------

  // ---------- polynomial drawing (with prompted label, centered, yellow text with black stroke) ----------
  let polygonMode = false;
  let tempPoints = []; // small circles
  let tempLines = [];
  let previewPoly = null;
  let previewLine = null;

  function setPolygonMode(on){
    polygonMode = !!on;
    if (!polygonMode) {
      cleanupTempDrawing();
    }
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
    if (!polygonMode) return;
    const p = canvas.getPointer(ev.e);
    const circ = new fabric.Circle({
      left: p.x, top: p.y, radius: 5, fill: tempPoints.length===0 ? 'red' : '#fff', stroke:'#000',
      originX:'center', originY:'center', selectable:false
    });
    canvas.add(circ);
    tempPoints.push(circ);

    if (tempPoints.length > 1){
      const prev = tempPoints[tempPoints.length-2];
      const line = new fabric.Line([prev.left, prev.top, circ.left, circ.top], {
        stroke:'#FFD400', strokeWidth:2, selectable:false, evented:false
      });
      canvas.add(line);
      tempLines.push(line);
    }

    // update preview poly
    if (previewPoly) canvas.remove(previewPoly);
    const pts = tempPoints.map(pnt=>({x:pnt.left,y:pnt.top}));
    previewPoly = new fabric.Polygon(pts, { fill:'rgba(255,210,0,0.08)', stroke:'#FFD400', strokeWidth:1, selectable:false, evented:false });
    canvas.add(previewPoly);
    canvas.renderAll();
  });

  canvas.on('mouse:move', function(ev){
    if (!polygonMode) return;
    const p = canvas.getPointer(ev.e);
    if (tempPoints.length === 0) return;
    // preview line
    if (previewLine) { canvas.remove(previewLine); previewLine=null; }
    const last = tempPoints[tempPoints.length-1];
    previewLine = new fabric.Line([last.left,last.top,p.x,p.y], { stroke:'#FFD400', strokeWidth:1.2, selectable:false, evented:false });
    canvas.add(previewLine);
    // preview polygon with pointer
    if (previewPoly) { canvas.remove(previewPoly); previewPoly=null; }
    const pts = tempPoints.map(pnt=>({x:pnt.left,y:pnt.top})); pts.push({x:p.x,y:p.y});
    previewPoly = new fabric.Polygon(pts, { fill:'rgba(255,210,0,0.06)', stroke:'#FFD400', strokeWidth:1, selectable:false, evented:false });
    canvas.add(previewPoly);
    canvas.renderAll();
  });

  function finalizePolygonFromTemp(){
    if (tempPoints.length < 3){ log('Need at least 3 points'); return; }
    const pts = tempPoints.map(p=>({x:p.left,y:p.top}));
    // create polygon
    const poly = new fabric.Polygon(pts, { fill:'rgba(255,255,0,0.15)', stroke:'#FFD400', strokeWidth:2, selectable:true });
    // prompt for label
    const label = prompt('Enter annotation text for this polygon:', '');
    const txt = new fabric.Textbox(label || '', {
      fontSize: Math.max(12, Math.min(28, Math.round(poly.width * 0.08))),
      fill:'#FFD400',
      stroke:'#000',
      strokeWidth:1,
      textAlign:'center',
      originX:'center', originY:'center', editable:true,
      backgroundColor:'rgba(0,0,0,0)'
    });
    // place text centered inside polygon
    txt.left = poly.width / 2;
    txt.top = poly.height / 2;
    txt.setCoords();
    const group = new fabric.Group([poly, txt], { left: poly.left, top: poly.top, selectable:true });
    // keep text centered on group modified
    group.on('modified', ()=>{
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
    rebuildOverlayList();
  }

  // double click to edit label (group)
  canvas.on('mouse:dblclick', function(ev){
    if (!ev.target) return;
    const obj = ev.target;
    if (obj.type === 'group'){
      // second item is textbox by our creation pattern
      const tb = obj._objects && obj._objects[1];
      if (tb && tb.isType && tb.isType('textbox')){
        const current = tb.text || '';
        const newText = prompt('Edit label text:', current);
        if (newText !== null){
          tb.text = newText;
          tb.setCoords();
          canvas.renderAll();
          pushState();
          log('Label updated');
        }
      }
    }
  });

  // ---------- overlay list interactions: click list item -> select object ----------
  overlayListEl.addEventListener('click', (ev)=>{
    const node = ev.target.closest('.overlayItem');
    if (!node) return;
    const uid = node.dataset.uid;
    // find object by uid
    const found = canvas.getObjects().find(o=>o.uid === uid);
    if (found){
      canvas.setActiveObject(found);
      canvas.requestRenderAll();
      rebuildOverlayList();
    }
  });

  // ---------- rebuild overlay list initially ----------
  function initialRebuild(){
    rebuildOverlayList();
    // try to restore localStorage state if present (already saved via pushState above)
    const saved = localStorage.getItem('fieldar_overlays');
    if (saved){
      try {
        // avoid overwriting if user already loaded a project; just pre-seed a restore option
        // we'll load but don't auto-apply unless user chooses - to keep user control, skip auto-load
        log('Project found in localStorage (you can Load Project to restore).');
      } catch(e){}
    }
  }
  initialRebuild();

  // ---------- export/import JSON via toolbar buttons handled above (save/load) ----------

  // ---------- undo/redo button wiring ----------
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // ---------- finalize: ensure canvas resizes to fit base or viewport ----------
  function fitAfterLoad(){
    if (canvas.backgroundImage){
      // adjust wrapper canvas size but keep display scaling handled by fabric
      canvas.calcOffset();
    }
    rebuildOverlayList();
  }

  // expose helpers for console usage
  window.fieldar = {
    canvas,
    /* FILE: fieldar-core.js */
/* Handles canvas, image loading, polygon drawing, undo/redo, internal state */

var annoFabric = (function () {
    let canvas = null;
    let polygonMode = false;
    let pointArray = [];
    let lineArray = [];
    let activeLine = null;
    let activeShape = null;
    let undoStack = [];
    let redoStack = [];
    let _canvasIdCounter = 0;

    function generateCid() {
        return new Date().getTime() + Math.floor(Math.random() * 100000);
    }

    function saveState() {
        if (!canvas) return;
        undoStack.push(JSON.stringify(canvas.toJSON()));
        redoStack = [];
    }

    function undo() {
        if (!canvas || undoStack.length === 0) return;
        redoStack.push(JSON.stringify(canvas.toJSON()));
        const prev = undoStack.pop();
        canvas.loadFromJSON(prev, canvas.renderAll.bind(canvas));
    }

    function redo() {
        if (!canvas || redoStack.length === 0) return;
        undoStack.push(JSON.stringify(canvas.toJSON()));
        const next = redoStack.pop();
        canvas.loadFromJSON(next, canvas.renderAll.bind(canvas));
    }

    function initCanvas(imageElOrSelector, options = {}) {
        const imgEl = (typeof imageElOrSelector === 'string') ? document.querySelector(imageElOrSelector) : imageElOrSelector;
        if (!imgEl) return console.error("Image element not found");

        _canvasIdCounter++;
        const cId = 'fieldar_canvas_' + _canvasIdCounter;
        const canvasEl = document.createElement('canvas');
        canvasEl.id = cId;
        canvasEl.width = options.canvasWidth || imgEl.naturalWidth || imgEl.width;
        canvasEl.height = options.canvasHeight || imgEl.naturalHeight || imgEl.height;
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        imgEl.insertAdjacentElement('afterend', canvasEl);

        canvas = new fabric.Canvas(cId);
        canvas.setBackgroundImage(imgEl.src, canvas.renderAll.bind(canvas), { originX: 'left', originY: 'top' });

        canvas.on('object:added', saveState);
        canvas.on('object:modified', saveState);
        canvas.on('object:removed', saveState);

        return canvas;
    }

    function togglePolygonMode() {
        polygonMode = !polygonMode;
        if (polygonMode) pointArray = [], lineArray = [], activeLine = null, activeShape = null;
        return polygonMode;
    }

    function addPolygonPoint(event) {
        if (!canvas || !polygonMode) return;
        const pointer = canvas.getPointer(event.e);
        const circle = new fabric.Circle({
            radius: 5,
            fill: pointArray.length === 0 ? 'red' : 'white',
            stroke: '#333',
            strokeWidth: 1,
            left: pointer.x,
            top: pointer.y,
            selectable: false,
            originX: 'center',
            originY: 'center'
        });

        let line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: '#999',
            strokeWidth: 2,
            selectable: false,
            evented: false
        });

        if (activeShape) {
            const points = activeShape.get('points');
            points.push({ x: pointer.x, y: pointer.y });
            activeShape.set({ points });
            canvas.remove(activeLine);
        } else {
            activeShape = new fabric.Polygon([{ x: pointer.x, y: pointer.y }], {
                stroke: '#333',
                fill: 'rgba(200,200,200,0.1)',
                strokeWidth: 1,
                selectable: false,
                evented: false
            });
            canvas.add(activeShape);
        }

        activeLine = line;
        pointArray.push(circle);
        lineArray.push(line);
        canvas.add(circle);
        canvas.add(line);
    }

    function finalizePolygon() {
        if (!canvas || !polygonMode) return;
        const points = pointArray.map(p => ({ x: p.left, y: p.top }));
        pointArray.forEach(p => canvas.remove(p));
        lineArray.forEach(l => canvas.remove(l));
        if (activeShape) canvas.remove(activeShape);
        const polygon = new fabric.Polygon(points, {
            stroke: '#333',
            fill: 'rgba(0,0,0,0)',
            strokeWidth: 1
        });

        const cText = new fabric.Text('Tap and Type', {
            fontFamily: 'arial black',
            fontSize: 12,
            fill: 'white',
            visible: false,
            left: polygon.left + (polygon.width / 2),
            top: polygon.top + (polygon.height / 2)
        });

        const group = new fabric.Group([polygon, cText], { left: polygon.left, top: polygon.top });
        canvas.add(group);
        activeLine = null;
        activeShape = null;
        polygonMode = false;
        canvas.selection = true;
        saveState();
        return group;
    }

    function loadImage(file) {
        if (!canvas) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            fabric.Image.fromURL(e.target.result, function (img) {
                canvas.setWidth(img.width);
                canvas.setHeight(img.height);
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), { originX: 'left', originY: 'top' });
                saveState();
            });
        };
        reader.readAsDataURL(file);
    }

    return {
        initCanvas,
        togglePolygonMode,
        addPolygonPoint,
        finalizePolygon,
        undo,
        redo,
        loadImage,
        getCanvas: () => canvas
    };
})();
    undo,
    redo,
    setPolygonMode,
    finalizePolygonFromTemp
  };

  log('fieldar.js ready');
})();