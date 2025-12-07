// FILE: fieldar-core.js
// Core engine: canvas initialization, polygon engine, undo/redo, image load, save/load, panning helpers

(function(global){
  // Lightweight core that exposes FieldAR global
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
    originalHeight: null,
    isPanning: false,
    lastPosX: 0,
    lastPosY: 0
  };

  function dbg(msg, type='log'){
    const el = document.getElementById('debugConsole');
    if(el){ el.innerHTML += (type==='error' ? '[ERROR] ' : '[LOG] ') + msg + '<br>'; el.scrollTop = el.scrollHeight; }
    else console[type==='error'?'error':'log'](msg);
  }

  function saveState(limit=60){
    if(!STATE.canvas) return;
    try{
      STATE.undoStack.push(JSON.stringify(STATE.canvas.toJSON()));
      if(STATE.undoStack.length>limit) STATE.undoStack.shift();
      STATE.redoStack = [];
      dbg('saved state (undoStack='+STATE.undoStack.length+')');
    }catch(e){ dbg('saveState error: '+e,'error'); }
  }

  function undo(){
    if(!STATE.canvas) return;
    if(STATE.undoStack.length <= 1){
      dbg('nothing to undo');
      return;
    }
    STATE.redoStack.push(STATE.undoStack.pop());
    const prev = STATE.undoStack[STATE.undoStack.length-1];
    STATE.canvas.loadFromJSON(prev, STATE.canvas.renderAll.bind(STATE.canvas));
    dbg('undo');
  }

  function redo(){
    if(!STATE.canvas) return;
    if(STATE.redoStack.length === 0){ dbg('nothing to redo'); return; }
    const next = STATE.redoStack.pop();
    STATE.undoStack.push(next);
    STATE.canvas.loadFromJSON(next, STATE.canvas.renderAll.bind(STATE.canvas));
    dbg('redo');
  }

  function initCanvas(canvasId, opts = {}){
    if(typeof fabric === 'undefined'){ dbg('fabric.js not found -- include fabric.min.js before fieldar-core.js','error'); return null; }
    const canvasEl = document.getElementById(canvasId);
    if(!canvasEl){ dbg('Canvas element not found: '+canvasId,'error'); return null; }

    // set a sensible size if none
    const w = opts.width || Math.max(window.innerWidth - 240, 600);
    const h = opts.height || Math.max(window.innerHeight - 180, 400);
    canvasEl.width = w; canvasEl.height = h;

    STATE.canvas = new fabric.Canvas(canvasId, { selection: true, preserveObjectStacking: true });
    STATE.canvas.setWidth(w); STATE.canvas.setHeight(h);

    // events to save history
    STATE.canvas.on('object:added', function(){ saveState(); });
    STATE.canvas.on('object:modified', function(){ saveState(); });
    STATE.canvas.on('object:removed', function(){ saveState(); });

    // panning: spacebar + drag or two-finger touch
    STATE.canvas.on('mouse:down', function(opt){
      const evt = opt.e;
      if(evt && (evt.altKey || evt.shiftKey || evt.buttons === 4 || window._spaceDown)){
        // start pan
        STATE.isPanning = true;
        STATE.lastPosX = evt.clientX;
        STATE.lastPosY = evt.clientY;
        document.body.style.cursor = 'grabbing';
      }
    });
    STATE.canvas.on('mouse:move', function(opt){
      if(!STATE.isPanning) return;
      const e = opt.e;
      const vpt = STATE.canvas.viewportTransform;
      const deltaX = e.clientX - STATE.lastPosX;
      const deltaY = e.clientY - STATE.lastPosY;
      STATE.lastPosX = e.clientX; STATE.lastPosY = e.clientY;
      STATE.canvas.relativePan(new fabric.Point(deltaX, deltaY));
    });
    STATE.canvas.on('mouse:up', function(opt){
      if(STATE.isPanning){ STATE.isPanning = false; document.body.style.cursor = ''; }
    });

    // touch: detect two-finger -> start pan via CSS overflow? Use pointer detection: simple approach sets pointer events on canvas container
    // also ensure canvas is able to be moved by relativePan on touchmove when two touches active
    let touchStartDist = 0;
    const wrap = document.getElementById('canvasWrap');
    if(wrap){
      wrap.addEventListener('touchstart', function(e){
        if(e.touches && e.touches.length === 2){
          STATE.isPanning = true;
          STATE.lastPosX = (e.touches[0].clientX + e.touches[1].clientX)/2;
          STATE.lastPosY = (e.touches[0].clientY + e.touches[1].clientY)/2;
        }
      }, {passive:false});
      wrap.addEventListener('touchmove', function(e){
        if(STATE.isPanning && e.touches && e.touches.length === 2){
          const cx = (e.touches[0].clientX + e.touches[1].clientX)/2;
          const cy = (e.touches[0].clientY + e.touches[1].clientY)/2;
          const dx = cx - STATE.lastPosX;
          const dy = cy - STATE.lastPosY;
          STATE.lastPosX = cx; STATE.lastPosY = cy;
          STATE.canvas.relativePan(new fabric.Point(dx, dy));
          e.preventDefault();
        }
      }, {passive:false});
      wrap.addEventListener('touchend', function(e){
        STATE.isPanning = false;
      });
    }

    dbg('canvas initialized '+w+'x'+h);
    // initial snapshot
    saveState();
    return STATE.canvas;
  }

  function loadBackgroundImageFile(file){
    if(!STATE.canvas) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      fabric.Image.fromURL(ev.target.result, function(img){
        STATE.originalWidth = img.width; STATE.originalHeight = img.height;
        STATE.canvas.setWidth(img.width); STATE.canvas.setHeight(img.height);
        STATE.canvas.setBackgroundImage(img, STATE.canvas.renderAll.bind(STATE.canvas), { originX:'left', originY:'top' });
        saveState();
        dbg('background set '+img.width+'x'+img.height);
      });
    };
    reader.readAsDataURL(file);
  }

  // overlay image upload -> add as an image object (smaller default scale)
  function addOverlayImageFile(file){
    if(!STATE.canvas) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      fabric.Image.fromURL(ev.target.result, function(img){
        // default scale down if huge
        const maxW = STATE.canvas.getWidth()*0.6;
        const scale = img.width > maxW ? (maxW / img.width) : 1;
        img.set({ left: STATE.canvas.getWidth()/2 - (img.width*scale)/2, top: STATE.canvas.getHeight()/2 - (img.height*scale)/2, originX:'left', originY:'top', selectable:true });
        img.scale(scale);
        STATE.canvas.add(img);
        saveState();
        dbg('overlay added ('+Math.round(img.width*scale)+'x'+Math.round(img.height*scale)+')');
      });
    };
    reader.readAsDataURL(file);
  }

  // polygon engine: add points using fabric mouse event
  function togglePolygonMode(){
    STATE.polygonMode = !STATE.polygonMode;
    if(!STATE.polygonMode){
      // clear preview
      STATE.pointArray.forEach(p=>STATE.canvas.remove(p));
      STATE.lineArray.forEach(l=>STATE.canvas.remove(l));
      STATE.pointArray = []; STATE.lineArray = []; STATE.activeShape = null; STATE.activeLine = null;
    }
    dbg('polygonMode '+(STATE.polygonMode?'ON':'OFF'));
    return STATE.polygonMode;
  }

  function addPolygonPoint(opt){
    if(!STATE.canvas || !STATE.polygonMode) return;
    const pointer = STATE.canvas.getPointer(opt.e);
    const cx = pointer.x, cy = pointer.y;
    const circle = new fabric.Circle({ radius:5, left:cx, top:cy, originX:'center', originY:'center', fill: STATE.pointArray.length===0 ? 'red':'white', selectable:false });
    const line = new fabric.Line([cx,cy,cx,cy], { stroke:'#2b7bff', strokeWidth:2, selectable:false, evented:false });
    if(STATE.activeShape){
      const pts = STATE.activeShape.get('points');
      pts.push({ x: cx, y: cy });
      STATE.activeShape.set({ points: pts });
      STATE.canvas.renderAll();
    } else {
      const poly = new fabric.Polygon([{ x: cx, y: cy }], { stroke:'#666', strokeWidth:1, fill:'rgba(200,200,200,0.08)', selectable:false, evented:false });
      STATE.activeShape = poly; STATE.canvas.add(poly);
    }
    STATE.canvas.add(circle);
    STATE.canvas.add(line);
    STATE.pointArray.push(circle);
    STATE.lineArray.push(line);
  }

  function finalizePolygon(){
    if(!STATE.canvas || !STATE.polygonMode) return null;
    if(STATE.pointArray.length < 3){ dbg('need >=3 points'); return null; }
    const pts = STATE.pointArray.map(p=>({ x: p.left, y: p.top }));
    STATE.pointArray.forEach(p=>STATE.canvas.remove(p));
    STATE.lineArray.forEach(l=>STATE.canvas.remove(l));
    if(STATE.activeShape) STATE.canvas.remove(STATE.activeShape);
    // create real polygon + label
    const polygon = new fabric.Polygon(pts, { stroke:'#2b7bff', strokeWidth:2, fill:'rgba(43,123,255,0.14)', selectable:true });
    const center = polygon.getCenterPoint ? polygon.getCenterPoint() : { x: polygon.left + polygon.width/2, y: polygon.top + polygon.height/2 };
    const label = new fabric.Textbox('Label', { left:center.x, top:center.y, originX:'center', originY:'center', fontSize:14, fill:'#fff', editable:true });
    const group = new fabric.Group([polygon, label], { left: polygon.left, top: polygon.top, selectable:true });
    STATE.canvas.add(group);
    STATE.polygonMode = false; STATE.pointArray=[]; STATE.lineArray=[]; STATE.activeShape=null; STATE.activeLine=null;
    saveState();
    dbg('polygon finalized');
    return group;
  }

  function deleteSelected(){
    if(!STATE.canvas) return;
    const obj = STATE.canvas.getActiveObject();
    if(obj){ STATE.canvas.remove(obj); saveState(); dbg('deleted selected'); } else dbg('no selection to delete');
  }

  function exportJSON(){
    if(!STATE.canvas) return null;
    return JSON.stringify(STATE.canvas.toJSON());
  }

  function exportJSONDownload(filename='fieldar-overlays.json'){
    const json = exportJSON();
    if(!json) return;
    const blob = new Blob([json], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    dbg('exported JSON');
  }

  function importJSONFile(file){
    if(!STATE.canvas) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try{
        const obj = JSON.parse(ev.target.result);
        STATE.canvas.loadFromJSON(obj, STATE.canvas.renderAll.bind(STATE.canvas));
        saveState();
        dbg('imported JSON file');
      } catch(e){ dbg('import failed: '+e,'error'); }
    };
    reader.readAsText(file);
  }

  // Save PNG of canvas
  function savePNG(filename='fieldar-capture.png'){
    if(!STATE.canvas) return;
    const dataURL = STATE.canvas.toDataURL({ format:'png', multiplier: 1 });
    const a = document.createElement('a'); a.href = dataURL; a.download = filename; a.click();
    dbg('PNG saved');
  }

  // list overlays (return objects array)
  function listOverlays(){
    if(!STATE.canvas) return [];
    return STATE.canvas.getObjects().map((o,idx)=>({ id: idx, type: o.type || 'object', object: o }));
  }

  // Fit to container (preserve scale)
  function fitToContainer(maxWidth = window.innerWidth - 260, maxHeight = window.innerHeight - 160){
    if(!STATE.canvas) return;
    const ow = STATE.originalWidth || STATE.canvas.getWidth();
    const oh = STATE.originalHeight || STATE.canvas.getHeight();
    if(!ow || !oh) return;
    const sx = maxWidth / ow; const sy = maxHeight / oh; const s = Math.min(sx, sy, 1);
    STATE.canvas.setWidth(ow*s); STATE.canvas.setHeight(oh*s);
    const bg = STATE.canvas.backgroundImage;
    if(bg){ bg.scale(s); STATE.canvas.setBackgroundImage(bg, STATE.canvas.renderAll.bind(STATE.canvas)); }
    // objects scale
    STATE.canvas.getObjects().forEach(obj=>{
      if(!obj._orig) obj._orig = { left: obj.left, top: obj.top, scaleX: obj.scaleX || 1, scaleY: obj.scaleY || 1 };
      obj.left = obj._orig.left * s; obj.top = obj._orig.top * s; obj.scaleX = (obj._orig.scaleX||1) * s; obj.scaleY = (obj._orig.scaleY||1) * s;
      obj.setCoords();
    });
    STATE.canvas.renderAll();
    dbg('fitToContainer scale applied');
  }

  // expose API
  FieldAR.initCanvas = initCanvas;
  FieldAR.loadBackgroundImageFile = loadBackgroundImageFile;
  FieldAR.addOverlayImageFile = addOverlayImageFile;
  FieldAR.togglePolygonMode = togglePolygonMode;
  FieldAR.addPolygonPoint = addPolygonPoint;
  FieldAR.finalizePolygon = finalizePolygon;
  FieldAR.deleteSelected = deleteSelected;
  FieldAR.undo = undo;
  FieldAR.redo = redo;
  FieldAR.exportJSON = exportJSON;
  FieldAR.exportJSONDownload = exportJSONDownload;
  FieldAR.importJSONFile = importJSONFile;
  FieldAR.savePNG = savePNG;
  FieldAR.listOverlays = listOverlays;
  FieldAR.fitToContainer = fitToContainer;
  FieldAR._STATE = STATE;

  // attach
  global.FieldAR = FieldAR;
})(window);