/* FILE: fieldar-ui.js */
/* Handles toolbar buttons, debug console, annotations, delete, import/export */

const debugConsole = document.createElement('div');
debugConsole.id = 'debugConsole';
debugConsole.style.cssText = "position:fixed;bottom:0;left:0;width:100%;max-height:200px;overflow:auto;background:#222;color:#0f0;font-family:monospace;font-size:12px;padding:5px;";
document.body.appendChild(debugConsole);

function log(msg) { console.log(msg); debugConsole.innerHTML += `[LOG] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
function error(msg) { console.error(msg); debugConsole.innerHTML += `[ERROR] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
log("🖥 Debug console initialized");

const undoBtn = document.createElement('button'); undoBtn.textContent = 'Undo';
const redoBtn = document.createElement('button'); redoBtn.textContent = 'Redo';
const polyBtn = document.createElement('button'); polyBtn.textContent = 'Polygon Draw';
const imageInput = document.createElement('input'); imageInput.type = 'file'; imageInput.accept = 'image/*';

const toolbar = document.createElement('div');
toolbar.id = 'toolbar';
toolbar.style.cssText = 'position:fixed;top:5px;left:5px;z-index:10000;display:flex;gap:5px;';
toolbar.appendChild(undoBtn);
toolbar.appendChild(redoBtn);
toolbar.appendChild(polyBtn);
toolbar.appendChild(imageInput);
document.body.appendChild(toolbar);

let canvas;

function initFieldAR(imageSelector) {
    canvas = annoFabric.initCanvas(imageSelector);
    if (!canvas) return error("Canvas failed to initialize");

    canvas.on('mouse:down', function (opt) {
        if (annoFabric.getCanvas() && polyBtn.dataset.active === "true") {
            annoFabric.addPolygonPoint(opt);
        }
    });
}

undoBtn.onclick = () => { annoFabric.undo(); log("Undo clicked"); };
redoBtn.onclick = () => { annoFabric.redo(); log("Redo clicked"); };
polyBtn.onclick = () => { 
    const active = annoFabric.togglePolygonMode(); 
    polyBtn.dataset.active = active ? "true" : "false"; 
    log(`Polygon mode: ${active}`);
};
imageInput.onchange = (e) => { if(e.target.files[0]) annoFabric.loadImage(e.target.files[0]); log("Image loaded"); };