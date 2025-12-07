// FILE: fieldar.js
// Full FieldAR functionality: undo/redo, polygon draw, image load, annotation, save/load

console.log("🖥 FieldAR script loaded");

let canvas = new fabric.Canvas('annotatorCanvas', {selection: true});
let polygonMode = false;
let activeLine = null;
let activeShape = null;
let pointArray = [];
let lineArray = [];
let undoStack = [];
let redoStack = [];

const debugConsole = document.getElementById("debugConsole");
function log(msg){ console.log(msg); debugConsole.innerHTML += `[LOG] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
function error(msg){ console.error(msg); debugConsole.innerHTML += `[ERROR] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }

log("🖥 Debug console initialized");

// ------------------- IMAGE LOAD -------------------
document.getElementById("imageLoader").onchange = function(e){
    const reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            canvas.clear();
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
    reader.readAsDataURL(e.target.files[0]);
};

// ------------------- UNDO / REDO -------------------
function saveState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    redoStack = []; // clear redo on new action
}

function undo() {
    if (undoStack.length > 1){
        redoStack.push(undoStack.pop());
        canvas.loadFromJSON(undoStack[undoStack.length-1], canvas.renderAll.bind(canvas));
        log("Undo performed");
    } else {
        log("Nothing to undo");
    }
}

function redo() {
    if (redoStack.length > 0){
        const state = redoStack.pop();
        undoStack.push(state);
        canvas.loadFromJSON(state, canvas.renderAll.bind(canvas));
        log("Redo performed");
    } else {
        log("Nothing to redo");
    }
}

// ------------------- POLYGON DRAW -------------------
document.getElementById("togglePolygonBtn").onclick = function(){
    polygonMode = !polygonMode;
    log(`Polygon mode ${polygonMode ? "ON" : "OFF"}`);
};

// Mouse events for polygon
canvas.on('mouse:down', function(options){
    if(polygonMode){
        const pointer = canvas.getPointer(options.e);
        const circle = new fabric.Circle({
            radius: 5,
            fill: pointArray.length===0 ? 'red':'white',
            left: pointer.x,
            top: pointer.y,
            selectable: false,
            originX:'center',
            originY:'center'
        });
        pointArray.push(circle);
        canvas.add(circle);

        if(pointArray.length>1){
            const points = [pointArray[pointArray.length-2].left, pointArray[pointArray.length-2].top, pointer.x, pointer.y];
            const line = new fabric.Line(points, {stroke: '#0ff', selectable: false});
            lineArray.push(line);
            canvas.add(line);
            activeLine = line;
        }
    }
});

canvas.on('mouse:dblclick', function(){
    if(polygonMode && pointArray.length>2){
        const points = pointArray.map(p => ({x: p.left, y: p.top}));
        pointArray.forEach(p => canvas.remove(p));
        lineArray.forEach(l => canvas.remove(l));

        const polygon = new fabric.Polygon(points, {
            stroke: '#0ff',
            strokeWidth: 2,
            fill: 'rgba(0,255,255,0.3)'
        });

        canvas.add(polygon);
        saveState();

        polygonMode = false;
        pointArray=[];
        lineArray=[];
        log("Polygon created");
    }
});

// ------------------- DELETE -------------------
document.getElementById("deleteBtn").onclick = function(){
    const obj = canvas.getActiveObject();
    if(obj){
        canvas.remove(obj);
        saveState();
        log("Selected object deleted");
    }
};

// ------------------- SAVE / LOAD JSON -------------------
document.getElementById("saveBtn").onclick = function(){
    const json = JSON.stringify(canvas.toJSON());
    const blob = new Blob([json], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fieldar-overlays.json";
    a.click();
    log("Canvas JSON saved");
};

document.getElementById("loadBtn").onclick = function(){
    const input = document.createElement("input");
    input.type="file";
    input.accept="application/json";
    input.onchange = e=>{
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event=>{
            canvas.loadFromJSON(event.target.result, ()=>{
                canvas.renderAll();
                saveState();
                log("Canvas JSON loaded");
            });
        };
        reader.readAsText(file);
    };
    input.click();
};

// ------------------- UNDO / REDO BUTTONS -------------------
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// ------------------- INITIAL STATE -------------------
saveState();
log("FieldAR ready!");