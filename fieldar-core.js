// FILE: fieldar-core.js
// FieldAR core: canvas initialization, polygon engine, undo/redo, image load, save/load

(function(global){

  const FieldAR = {};
  const STATE = {
    canvas: null,
    undoStack: [],
    redoStack: [],
    polygonMode: false,
    pointArray: [],
    lineArray: [],
    activeLine: null,
    activeShape: null,
    originalWidth: null,
    originalHeight: null
  };

  // debug helper (UI injects console div; fallback to console)
  function _dbg(msg, type='log'){
    const el = document.getElementById('debugConsole');
    if(el){
      const prefix = type==='error' ? '[ERROR]' : '[LOG]';
      el.innerHTML += `${prefix} ${msg}<br>`;
      el.scrollTop = el.scrollHeight;
    } else {
      if(type==='error') console.error(msg); else console.log(msg);
    }
  }

  // Save current canvas state for undo
  function saveState(limit=50){
    if(!STATE.canvas) return;
    try{
      STATE.undoStack.push(JSON.stringify(STATE.canvas.toJSON()));
      if(STATE.undoStack.length>limit) STATE.undoStack.shift();
      STATE.redoStack = [];
      _dbg(`state saved (undoStack=${STATE.undoStack.length})`);
    }catch(e){ _dbg('saveState error: '+e,'error'); }
  }

  function undo(){
    if(!STATE.canvas) return;
    if(STATE.undoStack.length<=1){
      _dbg('nothing to undo');
      return;
    }
    try{
      STATE.redoStack.push(STATE.undoStack.pop());
      const prev = STATE.undoStack[STATE.undoStack.length-1];
      STATE.canvas.loadFromJSON(prev, STATE.canvas.renderAll.bind(STATE.canvas));
      _dbg('undo applied');
    }catch(e){ _dbg('undo error: '+e,'error'); }
  }

  function redo(){
    if(!STATE.canvas) return;
    if(STATE.redoStack.length===0){ _dbg('nothing to redo'); return; }
    try{
      const next = STATE.redoStack.pop();
      STATE.undoStack.push(next);
      STATE.canvas.loadFromJSON(next, STATE.canvas.renderAll.bind(STATE.canvas));
      _dbg('redo applied');
    }catch(e){ _dbg('redo error: '+e,'error'); }
  }

  // init canvas with a canvas element id (or created canvas exists already in DOM)
  function init(canvasId, opts = {}){
    if(typeof fabric === 'undefined'){
      _dbg('fabric not found. Make sure fabric.min.js is loaded before fieldar-core.js','error');
      return null;
    }

    const el = document.getElementById(canvasId);
    if(!el){
      _dbg(`canvas element "${canvasId}" not found in DOM`,'error');
      return null;
    }

    // prefer provided size or fit to window
    const w = opts.width || window.innerWidth - 16;
    const h = opts.height || Math.max(window.innerHeight - 120, 300);

    el.width = w;
    el.height = h;

    STATE.canvas = new fabric.Canvas(canvasId, { preserveObjectStacking: true, selection: true });
    STATE.canvas.setWidth(w);
    STATE.canvas.setHeight(h);

    // wire save triggers
    STATE.canvas.on('object:added', saveState);
    STATE.canvas.on('object:modified', saveState);
    STATE.canvas.on('object:removed', saveState);

    // initial snapshot
    saveState();

    _dbg('canvas initialized: '+w+'x'+h);
    return STATE.canvas;
  }

  // load image file (File object) as background, resizing canvas to image natural size
  function loadImageFile(file){
    if(!STATE.canvas) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      fabric.Image.fromURL(ev.target.result, function(img){
        STATE.originalWidth = img.width;
        STATE.originalHeight = img.height;
        STATE.canvas.setWidth(img.width);
        STATE.canvas.setHeight(img.height);
        STATE.canvas.setBackgroundImage(img, STATE.canvas.renderAll.bind(STATE.canvas), { originX:'left', originY:'top' });
        saveState();
        _dbg(`background image loaded ${img.width}x${img.height}`);
      });
    };
    reader.readAsDataURL(file);
  }

  // toggle polygon mode
  function togglePolygonMode(){
    STATE.polygonMode = !STATE.polygonMode;
    STATE.pointArray.forEach(p=>STATE.canvas.remove(p));
    STATE.lineArray.forEach(l=>STATE.canvas.remove(l));
    STATE.pointArray = [];
    STATE.lineArray = [];
    STATE.activeLine = null;
    STATE.activeShape = null;
    _dbg('polygon mode: '+(STATE.polygonMode?'ON':'OFF'));
    return STATE.polygonMode;
  }

  // add a polygon point - passed the mouse event (fabric mouse event)
  function addPolygonPoint(fabEvent){
    if(!STATE.canvas || !STATE.polygonMode) return;
    const pointer = STATE.canvas.getPointer(fabEvent.e);
    const cx = pointer.x, cy = pointer.y;
    const circle = new fabric.Circle({
      radius:5, left:cx, top:cy, fill: STATE.pointArray.length===0 ? 'red' : '#fff',
      stroke:'#333', strokeWidth:0.6, originX:'center', originY:'center', selectable:false
    });

    const line = new fabric.Line([cx, cy, cx, cy], { stroke:'#ff0', strokeWidth:2, selectable:false, evented:false });

    // if we have an active shape polygon being previewed, extend it
    if(STATE.activeShape){
      const pts = STATE.activeShape.get('points');
      pts.push({ x: cx, y: cy });
      STATE.activeShape.set({ points: pts });
      STATE.canvas.renderAll();
    } else {
      const poly = new fabric.Polygon([{ x: cx, y: cy }], { stroke:'#333', fill:'rgba(200,200,200,0.12)', selectable:false, evented:false });
      STATE.activeShape = poly;
      STATE.canvas.add(poly);
    }

    STATE.canvas.add(circle);
    STATE.canvas.add(line);

    STATE.pointArray.push(circle);
    STATE.lineArray.push(line);
  }

  // finalize polygon (create real fabric.Polygon + editable text)
  function finalizePolygon(){
    if(!STATE.canvas || !STATE.polygonMode) return;
    if(STATE.pointArray.length < 3){
      _dbg('need at least 3 points to finalize polygon');
      return;
    }
    const points = STATE.pointArray.map(p => ({ x: p.left, y: p.top }));
    STATE.pointArray.forEach(p => STATE.canvas.remove(p));
    STATE.lineArray.forEach(l => STATE.canvas.remove(l));
    if(STATE.activeShape) STATE.canvas.remove(STATE.activeShape);

    // polygon
    const polygon = new fabric.Polygon(points, { stroke:'#2b7bff', strokeWidth:2, fill:'rgba(43,123,255,0.15)', selectable:true });

    // annotation text (centered)
    const center = polygon.getCenterPoint ? polygon.getCenterPoint() : { x: polygon.left + polygon.width/2, y: polygon.top + polygon.height/2 };
    const text = new fabric.Textbox('Label', { left:center.x, top:center.y, originX:'center', originY:'center', fontSize:14, fill:'#fff', editable:true });

    const group = new fabric.Group([polygon, text], { left: polygon.left, top: polygon.top, selectable:true });
    STATE.canvas.add(group);
    STATE.canvas.setActiveObject(group);

    // reset polygon state
    STATE.pointArray = [];
    STATE.lineArray = [];
    STATE.activeShape = null;
    STATE.activeLine = null;
    STATE.polygonMode = false;

    saveState();
    _dbg('polygon finalized (points='+points.length+')');
    return group;
  }

  function deleteSelected(){
    if(!STATE.canvas) return;
    const obj = STATE.canvas.getActiveObject();
    if(obj){
      STATE.canvas.remove(obj);
      saveState();
      _dbg('deleted selected object');
    } else _dbg('no active object to delete');
  }

  // export JSON
  function exportJSON(){
    if(!STATE.canvas) return null;
    const json = JSON.stringify(STATE.canvas.toJSON());
    return json;
  }

  // convenience to download exported json
  function exportJSONDownload(filename='fieldar-overlays.json'){
    const json = exportJSON();
    if(!json) return;
    const blob = new Blob([json], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    _dbg('exported JSON');
  }

  // import JSON from File object
  function importJSONFile(file){
    if(!STATE.canvas) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try{
        const jsonObj = JSON.parse(ev.target.result);
        STATE.canvas.loadFromJSON(jsonObj, STATE.canvas.renderAll.bind(STATE.canvas));
        saveState();
        _dbg('imported JSON');
      }catch(e){ _dbg('import JSON failed: '+e,'error'); }
    };
    reader.readAsText(file);
  }

  // load JSON string directly
  function importJSON(jsonStr){
    if(!STATE.canvas) return;
    try{
      const obj = JSON.parse(jsonStr);
      STATE.canvas.loadFromJSON(obj, STATE.canvas.renderAll.bind(STATE.canvas));
      saveState();
      _dbg('imported JSON string');
    }catch(e){ _dbg('import JSON parse failed: '+e,'error'); }
  }

  // scale canvas and objects to fit container (preserve ratios). optional: call on resize/window change
  function fitToContainer(maxWidth = window.innerWidth - 16, maxHeight = window.innerHeight - 120){
    if(!STATE.canvas) return;
    const origW = STATE.originalWidth || STATE.canvas.getWidth();
    const origH = STATE.originalHeight || STATE.canvas.getHeight();
    if(!origW || !origH) return;
    const sx = maxWidth / origW;
    const sy = maxHeight / origH;
    const s = Math.min(sx, sy, 1); // don't upscale by default
    STATE.canvas.setWidth(origW * s); STATE.canvas.setHeight(origH * s);
    const bg = STATE.canvas.backgroundImage;
    if(bg){
      bg.scale(s);
      STATE.canvas.setBackgroundImage(bg, STATE.canvas.renderAll.bind(STATE.canvas));
    }
    // scale objects proportionally (store original coords if needed)
    STATE.canvas.getObjects().forEach(obj => {
      if(!obj._orig){ obj._orig = { left: obj.left, top: obj.top, scaleX: obj.scaleX || 1, scaleY: obj.scaleY || 1 }; }
      obj.left = obj._orig.left * s;
      obj.top = obj._orig.top * s;
      obj.scaleX = (obj._orig.scaleX || 1) * s;
      obj.scaleY = (obj._orig.scaleY || 1) * s;
      obj.setCoords();
    });
    STATE.canvas.renderAll();
    _dbg('fitToContainer: scale '+s);
  }

  // expose API
  FieldAR.init = init;
  FieldAR.loadImageFile = loadImageFile;
  FieldAR.togglePolygonMode = togglePolygonMode;
  FieldAR.addPolygonPoint = addPolygonPoint;
  FieldAR.finalizePolygon = finalizePolygon;
  FieldAR.deleteSelected = deleteSelected;
  FieldAR.undo = undo;
  FieldAR.redo = redo;
  FieldAR.exportJSON = exportJSON;
  FieldAR.exportJSONDownload = exportJSONDownload;
  FieldAR.importJSONFile = importJSONFile;
  FieldAR.importJSON = importJSON;
  FieldAR.getCanvas = () => STATE.canvas;
  FieldAR.fitToContainer = fitToContainer;
  FieldAR._STATE = STATE; // for debug / advanced usage

  // attach to global
  global.FieldAR = FieldAR;

})(window);