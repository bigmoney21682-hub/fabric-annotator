// FILE: fieldar.js
// FieldAR Annotator -- Polygon + Prompted Text (centered, yellow text with black outline)
// Option B implementation (prompt for label after polygon completion)

(function(){
  // Ensure fabric exists
  if (typeof fabric === 'undefined') {
    console.error("Fabric.js required. Include fabric.min.js before fieldar.js");
    return;
  }

  // ---------- Debug console helpers ----------
  const dbg = document.getElementById('debugConsole');
  function dbgLog(msg){
    console.log(msg);
    if (dbg){
      dbg.innerHTML += `[LOG] ${msg}<br>`;
      dbg.scrollTop = dbg.scrollHeight;
    }
  }
  function dbgErr(msg){
    console.error(msg);
    if (dbg){
      dbg.innerHTML += `[ERROR] ${msg}<br>`;
      dbg.scrollTop = dbg.scrollHeight;
    }
  }
  dbgLog('🖥 Debug console initialized');

  // ---------- Canvas init & sizing ----------
  const canvasEl = document.getElementById('annotatorCanvas');
  function computeCanvasHeight(){
    const dbgH = dbg ? dbg.offsetHeight : 0;
    // keep some bottom room for debug console; if it's visible height is used by CSS
    return Math.max(200, window.innerHeight - (dbg ? dbg.offsetHeight : 200));
  }
  canvasEl.width = window.innerWidth;
  canvasEl.height = computeCanvasHeight();

  const canvas = new fabric.Canvas('annotatorCanvas', {
    backgroundColor: '#333',
    selection: true,
    preserveObjectStacking: true
  });
  window._canvas = canvas;
  dbgLog(`Canvas initialized ${canvas.getWidth()}x${canvas.getHeight()}`);

  // Keep responsive when window resizes (don't scale content - just adjust viewport)
  window.addEventListener('resize', () => {
    const h = computeCanvasHeight();
    canvas.setHeight(h);
    canvas.setWidth(window.innerWidth);
    canvas.renderAll();
    dbgLog('Window resized -- canvas viewport updated');
  });

  // ---------- State (undo/redo) ----------
  let undoStack = [];
  let redoStack = [];
  let isRestoring = false;
  const MAX_STACK = 60;

  function pushState(){
    if (isRestoring) return;
    try {
      const state = JSON.stringify(canvas.toJSON());
      undoStack.push(state);
      if (undoStack.length > MAX_STACK) undoStack.shift();
      // clearing redo stack on new action
      redoStack.length = 0;
      dbgLog(`State pushed (undoStack=${undoStack.length})`);
      localStorage.setItem('fieldar_overlays', state); // autosave last state
    } catch (e) {
      dbgErr('Failed saving state: ' + e);
    }
  }

  function undo(){
    if (undoStack.length <= 1) {
      dbgLog('Nothing to undo');
      return;
    }
    try {
      const current = undoStack.pop(); // remove current
      redoStack.push(current);
      const prev = undoStack[undoStack.length - 1];
      isRestoring = true;
      canvas.loadFromJSON(prev, () => {
        canvas.renderAll();
        isRestoring = false;
        dbgLog('Undo performed');
      });
    } catch (e) {
      dbgErr('Undo error: ' + e);
      isRestoring = false;
    }
  }

  function redo(){
    if (redoStack.length === 0) {
      dbgLog('Nothing to redo');
      return;
    }
    try {
      const next = redoStack.pop();
      undoStack.push(next);
      isRestoring = true;
      canvas.loadFromJSON(next, () => {
        canvas.renderAll();
        isRestoring = false;
        dbgLog('Redo performed');
      });
    } catch (e) {
      dbgErr('Redo error: ' + e);
      isRestoring = false;
    }
  }

  // Hook undo/redo buttons if present
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);

  // ---------- Load state from localStorage (if exists) ----------
  const saved = localStorage.getItem('fieldar_overlays');
  if (saved) {
    try {
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(saved), () => {
        canvas.renderAll();
        isRestoring = false;
        // seed undoStack with saved state
        undoStack.push(saved);
        dbgLog('Restored saved overlays from localStorage');
      });
    } catch (e) {
      isRestoring = false;
      dbgErr('Failed restoring overlays: ' + e);
    }
  } else {
    // seed initial state
    pushState();
  }

  // Ensure pushes on add/modify/remove
  canvas.on('object:added', (e) => { if (!isRestoring) pushState(); });
  canvas.on('object:modified', (e) => { if (!isRestoring) pushState(); });
  canvas.on('object:removed', (e) => { if (!isRestoring) pushState(); });

  // ---------- Image loader (fits to viewport while preserving aspect) ----------
  const imageLoader = document.getElementById('imageLoader');
  if (imageLoader){
    imageLoader.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return dbgLog('No image file selected');
      const reader = new FileReader();
      reader.onload = function(loadEv){
        fabric.Image.fromURL(loadEv.target.result, function(img){
          // compute scale to fit viewport
          const maxW = window.innerWidth;
          const maxH = computeCanvasHeight();
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          img.set({ originX: 'left', originY: 'top', selectable: false });
          img.scale(scale);

          // set canvas size to match scaled image
          canvas.setWidth(Math.round(img.width * scale));
          canvas.setHeight(Math.round(img.height * scale));
          canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
          pushState();
          dbgLog(`Loaded image ${img.width}x${img.height} scaled to ${Math.round(img.width*scale)}x${Math.round(img.height*scale)}`);
          // clear file input to avoid browser thumbnail preview on some devices
          try { imageLoader.value = ''; } catch(e){}
        }, { crossOrigin: 'anonymous' });
      };
      reader.readAsDataURL(f);
    });
  } else {
    dbgLog('No imageLoader input found (skip image load UI)');
  }

  // ---------- Polygon drawing (live preview) ----------
  let polygonMode = false;
  let pointCircles = []; // temporary circles for points
  let lineSegments = []; // temporary lines between points
  let previewLine = null; // line from last point to pointer
  let activeTempPolygon = null; // polygon preview

  function setPolygonMode(on){
    polygonMode = !!on;
    // clear any temporary helpers if turning off
    if(!polygonMode) clearTempHelpers();
    dbgLog('Polygon mode ' + (polygonMode ? 'ON' : 'OFF'));
  }

  // hook polygon toggle button
  const polygonBtn = document.getElementById('polygonBtn');
  if (polygonBtn) {
    polygonBtn.addEventListener('click', () => {
      setPolygonMode(!polygonMode);
    });
  }

  // finish polygon button
  function clearTempHelpers(){
    pointCircles.forEach(c=>canvas.remove(c));
    lineSegments.forEach(l=>canvas.remove(l));
    if(previewLine) canvas.remove(previewLine);
    if(activeTempPolygon) canvas.remove(activeTempPolygon);
    pointCircles = []; lineSegments = []; previewLine = null; activeTempPolygon = null;
  }

  function createLabelTextForPolygon(polygon, userText){
    // create Textbox centered in polygon coordinates
    const txt = new fabric.Textbox(userText || 'Label', {
      fontSize: Math.max(12, Math.min(24, Math.round(polygon.width * 0.08))), // responsive size
      fill: '#FFD400', // yellow
      stroke: '#000', // black outline
      strokeWidth: 1,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      editable: true,
      backgroundColor: 'rgba(255,255,255,0.0)'
    });

    // position relative to polygon (center)
    txt.left = polygon.width / 2;
    txt.top = polygon.height / 2;
    txt.setCoords();
    return txt;
  }

  function finalizePolygonFromTemp(){
    if (pointCircles.length < 3) {
      dbgLog('Need at least 3 points to finalize polygon');
      return;
    }
    // collect points (x,y) relative to canvas
    const pts = pointCircles.map(p => ({ x: p.left, y: p.top }));
    // create polygon
    const poly = new fabric.Polygon(pts, {
      fill: 'rgba(255,255,0,0.15)', // faint yellow fill
      stroke: '#FFD400', // yellow stroke
      strokeWidth: 2,
      selectable: true,
      objectCaching: false
    });

    // create text via prompt
    let label = prompt("Enter annotation text for this polygon:", ""); // Option B
    if (label === null) label = ""; // user canceled -> empty label allowed

    const txt = createLabelTextForPolygon(poly, label);

    // group polygon + text
    const group = new fabric.Group([poly, txt], {
      left: poly.left,
      top: poly.top,
      selectable: true
    });

    // ensure text recenters when the group changes (scale / move)
    group.on('modified', () => {
      try {
        const polyObj = group.item(0);
        const txtObj = group.item(1);
        // center text inside polygon bounds
        txtObj.left = polyObj.width / 2;
        txtObj.top = polyObj.height / 2;
        txtObj.setCoords();
        canvas.renderAll();
      } catch (e) {
        // ignore
      }
    });

    // double-click group to edit label
    // we will handle via canvas 'mouse:dblclick' below

    // add group to canvas
    canvas.add(group);
    // remove temp helpers
    clearTempHelpers();
    // turn off polygon mode
    polygonMode = false;
    dbgLog('Polygon finalized and labeled: "' + label + '"');
    pushState();
  }

  // public finish button wiring if present
  const completeBtn = document.getElementById('completePolygonBtn') || document.getElementById('finishPolygonBtn') || null;
  if (completeBtn){
    completeBtn.addEventListener('click', finalizePolygonFromTemp);
  }

  // mouse events for building polygon
  canvas.on('mouse:down', function(opts){
    if (!polygonMode) return;
    const p = canvas.getPointer(opts.e);
    // create small circle marker
    const circ = new fabric.Circle({
      left: p.x,
      top: p.y,
      radius: 5,
      fill: pointCircles.length === 0 ? 'red' : '#fff',
      stroke: '#000',
      strokeWidth: 0.5,
      originX: 'center',
      originY: 'center',
      selectable: false,
      hasBorders: false,
      hasControls: false
    });
    canvas.add(circ);
    pointCircles.push(circ);

    // add permanent line from previous point to this point
    if (pointCircles.length > 1){
      const prev = pointCircles[pointCircles.length - 2];
      const line = new fabric.Line([prev.left, prev.top, circ.left, circ.top], {
        stroke: '#FFD400',
        strokeWidth: 2,
        selectable: false,
        evented: false
      });
      canvas.add(line);
      lineSegments.push(line);
    }

    // update polygon preview
    if (activeTempPolygon) canvas.remove(activeTempPolygon);
    const previewPoints = pointCircles.map(c=>({x:c.left, y:c.top}));
    activeTempPolygon = new fabric.Polygon(previewPoints, {
      fill: 'rgba(255,255,0,0.08)',
      stroke: '#FFD400',
      strokeWidth: 1,
      selectable: false,
      evented: false
    });
    canvas.add(activeTempPolygon);
    canvas.renderAll();
  });

  // live pointer preview line
  canvas.on('mouse:move', function(opts){
    if (!polygonMode) return;
    const p = canvas.getPointer(opts.e);
    if (pointCircles.length === 0) return;

    // update preview line from last point to current pointer
    const last = pointCircles[pointCircles.length - 1];
    if (previewLine) {
      canvas.remove(previewLine);
      previewLine = null;
    }
    previewLine = new fabric.Line([last.left, last.top, p.x, p.y], {
      stroke: '#FFD400',
      strokeWidth: 1.5,
      selectable: false,
      evented: false
    });
    canvas.add(previewLine);

    // Move/replace preview polygon (last vertex is pointer)
    if (activeTempPolygon){
      canvas.remove(activeTempPolygon);
    }
    const pts = pointCircles.map(c => ({ x: c.left, y: c.top }));
    pts.push({ x: p.x, y: p.y });
    activeTempPolygon = new fabric.Polygon(pts, {
      fill: 'rgba(255,255,0,0.06)',
      stroke: '#FFD400',
      strokeWidth: 1,
      selectable: false,
      evented: false
    });
    canvas.add(activeTempPolygon);
    canvas.renderAll();
  });

  // right-click or double-click near the first point: convenience finish
  canvas.on('mouse:dblclick', function(e){
    // if double-click on a group -> edit label
    if (e.target && e.target.type === 'group'){
      const group = e.target;
      // item(1) is textbox we created earlier
      const txt = group.item(1);
      if (txt && txt.isType && txt.isType('textbox')){
        const newLabel = prompt('Edit annotation text:', txt.text);
        if (newLabel !== null){
          txt.text = newLabel;
          group.setCoords();
          canvas.renderAll();
          pushState();
          dbgLog('Edited label to: ' + newLabel);
        }
      }
      return;
    }

    // If double-click while drawing, check proximity to first point
    if (polygonMode && pointCircles.length >= 3){
      const p = canvas.getPointer(e.e);
      const first = pointCircles[0];
      const dx = p.x - first.left;
      const dy = p.y - first.top;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 12) {
        // finish
        finalizePolygonFromTemp();
      }
    }
  });

  // If user selects a group via object:selected and wants edit prompt (optional)
  canvas.on('object:selected', function(e){
    const obj = e.target;
    // only prompt if it's a Group (polygon+text)
    if (obj && obj.type === 'group'){
      // do nothing here -- double-click handles edit to avoid unintentional prompts
      // but we can optionally highlight or log
      dbgLog('Group selected (double-click group to edit label).');
    }
  });

  // ---------- Export / Import ----------
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn){
    exportBtn.addEventListener('click', function(){
      try {
        const json = JSON.stringify(canvas.toJSON());
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fieldar-overlays.json';
        a.click();
        URL.revokeObjectURL(a.href);
        dbgLog('Export complete (JSON size ' + json.length + ')');
      } catch (e) {
        dbgErr('Export failed: ' + e);
      }
    });
  }

  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  if (importBtn && importFile){
    importBtn.addEventListener('click', ()=> importFile.click());
    importFile.addEventListener('change', (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if (!f) { dbgLog('No import file selected'); return; }
      const r = new FileReader();
      r.onload = (le)=>{
        try {
          const obj = JSON.parse(le.target.result);
          isRestoring = true;
          canvas.loadFromJSON(obj, () => {
            canvas.renderAll();
            isRestoring = false;
            pushState();
            dbgLog('Import complete, objects: ' + canvas.getObjects().length);
          });
        } catch (e) {
          dbgErr('Import failed: ' + e);
          isRestoring = false;
        }
      };
      r.readAsText(f);
      // clear input
      try { importFile.value = ''; } catch(e){}
    });
  }

  // ---------- Utility: clear selection on background click ----------
  canvas.on('mouse:down', function(e){
    if (!e.target && !polygonMode) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  });

  // ---------- Public helper exposures (optional) ----------
  window.fieldar = {
    canvas,
    pushState,
    undo,
    redo,
    setPolygonMode,
    finalizePolygonFromTemp: finalizePolygonFromTemp,
  };

  dbgLog('fieldar.js loaded and ready');
})();