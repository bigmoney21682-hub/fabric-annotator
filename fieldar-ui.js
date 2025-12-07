// FILE: fieldar-ui.js
// UI wiring: toolbar buttons, sidebar, import/export, overlay list, toggles

document.addEventListener('DOMContentLoaded', () => {
  const dbg = (m,t='log') => {
    const el = document.getElementById('debugConsole');
    if(el){ el.innerHTML += (t==='error'?'[ERROR] ':'[LOG] ') + m + '<br>'; el.scrollTop = el.scrollHeight; }
    else console[t==='error'?'error':'log'](m);
  };
  dbg('UI loaded');

  // initialize canvas
  const canvas = FieldAR.initCanvas('annotatorCanvas', { width: Math.max(window.innerWidth - 260, 600), height: Math.max(window.innerHeight - 160, 400) });
  if(!canvas){ dbg('Canvas init failed','error'); return; }

  // wire toolbar elements
  const btnMachine = document.getElementById('btnMachine');
  const machinePicker = document.getElementById('machinePicker');
  const btnOverlay = document.getElementById('btnOverlay');
  const overlayPicker = document.getElementById('overlayPicker');

  const btnAddText = document.getElementById('btnAddText');
  const btnRect = document.getElementById('btnRect');
  const btnArrow = document.getElementById('btnArrow');
  const btnPolygon = document.getElementById('btnPolygon');
  const btnFinalizePolygon = document.getElementById('btnFinalizePolygon');

  const btnMove = document.getElementById('btnMove');
  const btnDelete = document.getElementById('btnDelete');

  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');

  const btnImport = document.getElementById('btnImport');
  const importFile = document.getElementById('importFile');
  const btnExport = document.getElementById('btnExport');
  const btnPNG = document.getElementById('btnPNG');

  const btnToggleUI = document.getElementById('btnToggleUI');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const clearAllBtn = document.getElementById('clearAllOverlaysBtn');

  // Sidebar list
  const overlayList = document.getElementById('overlayList');
  function refreshOverlayList(){
    overlayList.innerHTML = '';
    const items = FieldAR.listOverlays();
    items.forEach((it, idx) => {
      const row = document.createElement('div'); row.className='overlay-item';
      const thumb = document.createElement('div'); thumb.className='overlay-thumb';
      // try to create a small dataURL preview if object is image
      if(it.object && it.object.type === 'image'){
        const data = it.object.toDataURL({ format:'png', multiplier:0.15 });
        const img = document.createElement('img'); img.src = data; img.className='overlay-thumb';
        thumb.replaceWith(img); row.insertBefore(img, row.firstChild);
      } else {
        row.appendChild(thumb);
      }
      const meta = document.createElement('div'); meta.className='overlay-meta'; meta.innerText = `${it.type} #${idx}`;
      row.appendChild(meta);
      const ctr = document.createElement('div'); ctr.className='overlay-controls';
      const eye = document.createElement('button'); eye.innerText='👁'; eye.title='Toggle visibility';
      eye.onclick = () => { it.object.visible = !it.object.visible; canvas.renderAll(); refreshOverlayList(); };
      const del = document.createElement('button'); del.innerText='🗑'; del.title='Delete';
      del.onclick = () => { canvas.remove(it.object); canvas.renderAll(); refreshOverlayList(); };
      ctr.appendChild(eye); ctr.appendChild(del);
      row.appendChild(ctr);
      row.onclick = () => { canvas.setActiveObject(it.object); canvas.renderAll(); };
      overlayList.appendChild(row);
    });
  }

  // machine image loader
  btnMachine.onclick = () => machinePicker.click();
  machinePicker.onchange = (e) => {
    const f = e.target.files[0];
    if(f){ FieldAR.loadBackgroundImageFile(f); setTimeout(()=>FieldAR.fitToContainer(), 300); }
  };

  // overlay loader
  btnOverlay.onclick = () => overlayPicker.click();
  overlayPicker.onchange = (e) => {
    const f = e.target.files[0];
    if(f){ FieldAR.addOverlayImageFile(f); setTimeout(()=>{ refreshOverlayList(); }, 200); }
  };

  // Add text
  btnAddText.onclick = () => {
    const t = new fabric.Textbox('New Label', { left:50, top:50, fontSize:18, fill:'#fff', backgroundColor:'rgba(0,0,0,0.4)' });
    canvas.add(t); canvas.setActiveObject(t); canvas.renderAll(); FieldAR._STATE.canvas = canvas;
  };

  // Add rectangle
  btnRect.onclick = () => {
    const r = new fabric.Rect({ left:60, top:60, width:120, height:80, fill:'rgba(255,255,0,0.2)', stroke:'#ff0', strokeWidth:2 });
    canvas.add(r); canvas.setActiveObject(r); canvas.renderAll();
  };

  // Add arrow (path)
  btnArrow.onclick = () => {
    const path = new fabric.Path('M 0 0 L 80 0 L 80 -20 L 120 20 L 80 60 L 80 40 L 0 40 z', { left:80, top:80, fill:'rgba(255,127,0,0.9)', stroke:'#ff7f00', strokeWidth:2 });
    canvas.add(path); canvas.setActiveObject(path); canvas.renderAll();
  };

  // Polygon toggle
  btnPolygon.onclick = () => {
    const on = FieldAR.togglePolygonMode();
    btnPolygon.classList.toggle('active', on);
    if(on) dbg('Click canvas to add points; double-click or click Finalize to finish');
  };
  btnFinalizePolygon.onclick = () => FieldAR.finalizePolygon();

  // Move/select: enable object selection & disable polygon mode
  btnMove.onclick = () => {
    FieldAR._STATE.polygonMode = false;
    btnPolygon.classList.remove('active');
    canvas.isDrawingMode = false;
    canvas.selection = true;
    dbg('Move/Select mode');
  };

  // Delete
  btnDelete.onclick = () => FieldAR.deleteSelected();

  // Undo/Redo
  btnUndo.onclick = () => FieldAR.undo();
  btnRedo.onclick = () => FieldAR.redo();

  // Import / Export
  btnExport.onclick = () => FieldAR.exportJSONDownload();
  btnImport.onclick = () => importFile.click();
  importFile.onchange = (e) => { const f = e.target.files[0]; if(f) FieldAR.importJSONFile(f); setTimeout(()=>refreshOverlayList(), 300); };

  // Save PNG
  btnPNG.onclick = () => FieldAR.savePNG();

  // Toggle UI (hide top toolbar + sidebar)
  btnToggleUI.onclick = () => {
    const toolbar = document.getElementById('toolbar');
    const sidebar = document.getElementById('sidebar');
    const hidden = toolbar.style.display === 'none';
    toolbar.style.display = hidden ? 'flex' : 'none';
    sidebar.style.display = hidden ? 'flex' : 'none';
    // attempt to hide safari UI by scrolling to top (best effort)
    if(!hidden) window.scrollTo(0,1); else window.scrollTo(0,0);
  };

  toggleSidebarBtn.onclick = () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
  };

  clearAllBtn.onclick = () => {
    if(confirm('Clear all overlays?')){ canvas.getObjects().forEach(o=>canvas.remove(o)); canvas.renderAll(); FieldAR._STATE.canvas=canvas; refreshOverlayList(); }
  };

  // mouse events: when polygon mode active, clicking adds points
  canvas.on('mouse:down', (opt)=>{ if(FieldAR._STATE && FieldAR._STATE.polygonMode) FieldAR.addPolygonPoint(opt); });
  canvas.on('mouse:dblclick', ()=>{ if(FieldAR._STATE && FieldAR._STATE.polygonMode) FieldAR.finalizePolygon(); });

  // selection: refresh overlays list highlight
  canvas.on('selection:created', refreshOverlayList);
  canvas.on('selection:updated', refreshOverlayList);
  canvas.on('object:removed', refreshOverlayList);
  canvas.on('object:added', refreshOverlayList);

  // keyboard: space toggles panning mode (the core listens for _spaceDown)
  window._spaceDown = false;
  window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ window._spaceDown=true; document.body.style.cursor='grab'; e.preventDefault(); } if((e.ctrlKey||e.metaKey) && e.key==='z'){ FieldAR.undo(); }});
  window.addEventListener('keyup', (e)=>{ if(e.code==='Space'){ window._spaceDown=false; document.body.style.cursor=''; }});

  // initial overlay list populate
  refreshOverlayList();

  // autosave to localStorage on unload (JSON)
  window.addEventListener('beforeunload', () => {
    try{ const json = FieldAR.exportJSON(); if(json) localStorage.setItem('fieldar_auto_save', json); dbg('autosaved to localStorage'); } catch(e){}
  });

  // restore saved overlays on load if present
  const saved = localStorage.getItem('fieldar_auto_save');
  if(saved){ try{ FieldAR.importJSON(saved); dbg('restored from localStorage'); setTimeout(()=>refreshOverlayList(),300); } catch(e){ dbg('restore failed','error'); } }

  // fit to container after small delay
  setTimeout(()=>FieldAR.fitToContainer(), 300);

  dbg('UI wiring complete');
});