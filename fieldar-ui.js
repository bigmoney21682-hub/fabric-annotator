// FILE: fieldar-ui.js
// Handles UI, toolbar, file inputs, debug console, and wiring with fieldar-core.js

// ----- Debug Console -----
const debugConsole = document.createElement("div");
debugConsole.id = "debugConsole";
debugConsole.style.position = "fixed";
debugConsole.style.bottom = "0";
debugConsole.style.left = "0";
debugConsole.style.width = "100%";
debugConsole.style.maxHeight = "150px";
debugConsole.style.overflowY = "auto";
debugConsole.style.background = "#222";
debugConsole.style.color = "#0f0";
debugConsole.style.fontFamily = "monospace";
debugConsole.style.fontSize = "12px";
debugConsole.style.padding = "5px";
document.body.appendChild(debugConsole);

function log(msg){
    console.log(msg);
    debugConsole.innerHTML += `[LOG] ${msg}<br>`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
}
function error(msg){
    console.error(msg);
    debugConsole.innerHTML += `[ERROR] ${msg}<br>`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

log("🖥 Debug console initialized");

// ----- Toolbar -----
const toolbar = document.createElement("div");
toolbar.id = "toolbar";
toolbar.style.position = "fixed";
toolbar.style.top = "10px";
toolbar.style.left = "10px";
toolbar.style.zIndex = "10000";
toolbar.style.display = "flex";
toolbar.style.gap = "8px";
document.body.appendChild(toolbar);

// Buttons
const undoBtn = document.createElement("button");
undoBtn.innerText = "Undo";
const redoBtn = document.createElement("button");
redoBtn.innerText = "Redo";
const deleteBtn = document.createElement("button");
deleteBtn.innerText = "Delete";
const polygonBtn = document.createElement("button");
polygonBtn.innerText = "Polygon Draw";
const imageLoader = document.createElement("input");
imageLoader.type = "file";
imageLoader.accept = "image/*";

toolbar.appendChild(undoBtn);
toolbar.appendChild(redoBtn);
toolbar.appendChild(deleteBtn);
toolbar.appendChild(polygonBtn);
toolbar.appendChild(imageLoader);

// ----- Canvas reference -----
const canvas = window.fieldARCanvas;
if(!canvas){
    error("Canvas not found. Ensure fieldar-core.js loaded first and canvas is initialized.");
}

// ----- Button Events -----
undoBtn.onclick = function(){
    if(window.undoStack && window.undoStack.length > 0){
        const last = window.undoStack.pop();
        window.redoStack.push(JSON.stringify(canvas.toJSON()));
        canvas.loadFromJSON(last, canvas.renderAll.bind(canvas));
        log("Undo performed");
    } else { log("Undo stack empty"); }
};

redoBtn.onclick = function(){
    if(window.redoStack && window.redoStack.length > 0){
        const last = window.redoStack.pop();
        window.undoStack.push(JSON.stringify(canvas.toJSON()));
        canvas.loadFromJSON(last, canvas.renderAll.bind(canvas));
        log("Redo performed");
    } else { log("Redo stack empty"); }
};

deleteBtn.onclick = function(){
    const active = canvas.getActiveObject();
    if(active){
        canvas.remove(active);
        saveState();
        log("Deleted selected object");
    } else { log("No object selected to delete"); }
};

polygonBtn.onclick = function(){
    if(window.polygonMode === undefined) window.polygonMode = false;
    window.polygonMode = !window.polygonMode;
    log("Polygon mode: " + (window.polygonMode ? "ON" : "OFF"));
};

// ----- Image Loader -----
imageLoader.onchange = function(e){
    const file = e.target.files[0];
    if(!file){ error("No file selected"); return; }
    const reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            // Resize canvas
            canvas.setWidth(img.width);
            canvas.setHeight(img.height);

            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                originX: 'left',
                originY: 'top'
            });
            saveState();
            log(`Loaded image: ${img.width}x${img.height}`);
        });
    };
    reader.readAsDataURL(file);
};

// ----- Undo/Redo State -----
window.undoStack = [];
window.redoStack = [];
function saveState(){
    if(!window.undoStack) window.undoStack = [];
    window.undoStack.push(JSON.stringify(canvas.toJSON()));
    window.redoStack = [];
}
canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

// ----- Import/Export JSON -----
function exportJSON(){
    const json = JSON.stringify(canvas.toJSON());
    const blob = new Blob([json], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fieldar-overlays.json";
    a.click();
    URL.revokeObjectURL(url);
    log("Exported overlays JSON");
}
function importJSON(file){
    const reader = new FileReader();
    reader.onload = function(e){
        try{
            const data = JSON.parse(e.target.result);
            canvas.loadFromJSON(data, canvas.renderAll.bind(canvas));
            log("Imported overlays JSON");
            saveState();
        } catch(err){ error("Failed to parse JSON"); }
    };
    reader.readAsText(file);
}

log("UI script initialized");