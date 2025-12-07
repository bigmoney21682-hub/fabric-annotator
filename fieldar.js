// FILE: fieldar.js
console.log("🖥 Debug console initialized");

let canvas = new fabric.Canvas('annotatorCanvas', {
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#555'
});
console.log("[LOG] Canvas initialized");

// State stack for undo/redo
let state = [];
let mods = 0;

function saveState() {
    mods++;
    if (mods < state.length) state.length = mods;
    state.push(JSON.stringify(canvas));
}

function undo() {
    if (mods > 0) {
        mods--;
        canvas.clear();
        canvas.loadFromJSON(state[mods], canvas.renderAll.bind(canvas));
    }
}

function redo() {
    if (mods < state.length - 1) {
        mods++;
        canvas.clear();
        canvas.loadFromJSON(state[mods], canvas.renderAll.bind(canvas));
    }
}

// Save initial empty state
saveState();

// Undo/redo buttons
document.getElementById('undoBtn').onclick = () => { undo(); console.log("[LOG] Undo"); }
document.getElementById('redoBtn').onclick = () => { redo(); console.log("[LOG] Redo"); }

// Polygon toggle
let polygonMode = false;
document.getElementById('polygonBtn')?.addEventListener('click', () => {
    polygonMode = !polygonMode;
    console.log(`[LOG] Polygon mode: ${polygonMode}`);
});

// Image loader
document.getElementById("imageLoader").onchange = function(e){
    let reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            canvas.setWidth(img.width);
            canvas.setHeight(img.height);
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                originX: 'left',
                originY: 'top'
            });
            saveState();
            console.log(`[LOG] Loaded image: ${img.width}x${img.height}`);
        });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Track canvas changes for undo
canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);