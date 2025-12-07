// FILE: fieldar-ui.js
// UI wiring for FieldAR (toolbar, debug console, file inputs)

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {

  // ensure debug console exists
  let debugConsole = document.getElementById('debugConsole');
  if(!debugConsole){
    debugConsole = document.createElement('div');
    debugConsole.id = 'debugConsole';
    document.body.appendChild(debugConsole);
  }
  function log(msg){ console.log(msg); debugConsole.innerHTML += `[LOG] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
  function error(msg){ console.error(msg); debugConsole.innerHTML += `[ERROR] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
  log('UI: DOM ready');

  // create toolbar container if not present
  let toolbar = document.getElementById('toolbar');
  if(!toolbar){
    toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    document.body.appendChild(toolbar);
  }

  // helper to create UI elements (buttons/input)
  function btn(text, id){
    const b = document.createElement('button');
    b.id = id || ('btn-' + text.replace(/\s+/g,'').toLowerCase());
    b.innerText = text;
    toolbar.appendChild(b);
    return b;
  }

  function fileInput(id){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.id = id;
    toolbar.appendChild(inp);
    return inp;
  }

  // Buttons (Undo, Redo, Polygon toggle, Delete, Export, Import)
  const undoBtn = btn('Undo','undoBtn');
  const redoBtn = btn('Redo','redoBtn');
  const polyBtn = btn('Polygon Mode','polyBtn');
  const finalizeBtn = btn('Finalize Polygon','finalizePolygonBtn');
  const deleteBtn = btn('Delete','deleteBtn');
  const exportBtn = btn('Export JSON','exportBtn');
  const importBtn = btn('Import JSON','importBtn');
  const imageInput = fileInput('imageInput'); imageInput.accept = 'image/*';
  const importFileInput = fileInput('importFileInput'); importFileInput.accept = 'application/json';

  // small UI hint
  const hint = document.createElement('span'); hint.style.color='#9aa'; hint.style.marginLeft='6px';
  hint.innerText = 'Tip: double-click to complete polygon or click "Finalize Polygon"';
  toolbar.appendChild(hint);

  // initialize FieldAR canvas (use the canvas id from index.html)
  const canvasElId = 'annotatorCanvas';
  const canvas = FieldAR.init(canvasElId, { width: window.innerWidth-16, height: Math.max(window.innerHeight-120, 400) });
  if(!canvas){
    error('FieldAR canvas failed to initialize. Ensure fieldar-core.js is loaded and fabric.js is available.');
    return;
  }

  // wire canvas mouse events for polygon
  canvas.on('mouse:down', function(opt){
    if(FieldAR._STATE && FieldAR._STATE.polygonMode){
      FieldAR.addPolygonPoint(opt);
    }
  });

  canvas.on('mouse:dblclick', function(){
    if(FieldAR._STATE && FieldAR._STATE.polygonMode){
      FieldAR.finalizePolygon();
    }
  });

  // Button events
  undoBtn.onclick = () => FieldAR.undo();
  redoBtn.onclick = () => FieldAR.redo();

  polyBtn.onclick = () => {
    const on = FieldAR.togglePolygonMode();
    polyBtn.style.background = on? '#2b7bff' : '';
  };

  finalizeBtn.onclick = () => FieldAR.finalizePolygon();

  deleteBtn.onclick = () => FieldAR.deleteSelected();

  exportBtn.onclick = () => FieldAR.exportJSONDownload();

  importFileInput.onchange = function(e){
    const f = e.target.files[0];
    if(f) FieldAR.importJSONFile(f);
  };

  // Image loader
  imageInput.onchange = function(e){
    const f = e.target.files[0];
    if(!f) return;
    FieldAR.loadImageFile(f);
  };

  // keyboard shortcuts: Enter = finalize polygon, Delete = delete, Ctrl+Z/Ctrl+Y
  document.addEventListener('keydown', (ev) => {
    if(ev.key === 'Enter') FieldAR.finalizePolygon();
    if(ev.key === 'Delete') FieldAR.deleteSelected();
    if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z'){ FieldAR.undo(); ev.preventDefault(); }
    if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y'){ FieldAR.redo(); ev.preventDefault(); }
  });

  // responsive: fit to container when window resizes (if background image present)
  window.addEventListener('resize', () => {
    FieldAR.fitToContainer(window.innerWidth - 16, window.innerHeight - 160);
  });

  log('UI wired to FieldAR, ready.');
});