// FILE: fieldar.js
// Author: Oshane Bailey
// Version: 1.0.4
// Description: Full FieldAR annotator JS with undo/redo, polygon draw, image import/export, and debug console

// ======= DEBUG CONSOLE =======
const debugConsole = document.getElementById("debugConsole");
function log(msg){
    console.log(msg);
    if(debugConsole){
        debugConsole.innerHTML += `[LOG] ${msg}<br>`;
        debugConsole.scrollTop = debugConsole.scrollHeight;
    }
}
function error(msg){
    console.error(msg);
    if(debugConsole){
        debugConsole.innerHTML += `[ERROR] ${msg}<br>`;
        debugConsole.scrollTop = debugConsole.scrollHeight;
    }
}
log("🖥 Debug console initialized");

// ======= GLOBAL VARIABLES =======
let canvas = new fabric.Canvas('annotatorCanvas', {selection:true});
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let activeLine = null;
let activeShape = null;

// ======= SAVE / UNDO / REDO =======
function saveState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    if(undoStack.length > 50) undoStack.shift();
    redoStack = [];
    log("State saved");
}
function undo() {
    if(undoStack.length === 0) return log("Nothing to undo");
    redoStack.push(JSON.stringify(canvas.toJSON()));
    let prev = undoStack.pop();
    canvas.loadFromJSON(prev, () => canvas.renderAll());
    log("Undo performed");
}
function redo() {
    if(redoStack.length === 0) return log("Nothing to redo");
    undoStack.push(JSON.stringify(canvas.toJSON()));
    let next = redoStack.pop();
    canvas.loadFromJSON(next, () => canvas.renderAll());
    log("Redo performed");
}

// ======= IMAGE SELECT =======
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
            log(`Loaded image: ${img.width}x${img.height}`);
        });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// ======= UNDO / REDO BUTTONS =======
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// ======= POLYGON DRAW TOGGLE =======
document.getElementById("drawPolygonBtn")?.addEventListener("click", () => {
    polygonMode = !polygonMode;
    pointArray = [];
    activeLine = null;
    activeShape = null;
    log("Polygon mode: " + (polygonMode ? "ON" : "OFF"));
});

// ======= CANVAS CLICK FOR POLYGON POINTS =======
canvas.on('mouse:down', function(options){
    if(!polygonMode) return;
    let pointer = canvas.getPointer(options.e);

    // Draw point
    let circle = new fabric.Circle({
        radius: 5,
        fill: pointArray.length===0?'red':'white',
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        selectable: false
    });
    canvas.add(circle);
    pointArray.push(circle);

    // Draw line
    if(pointArray.length > 1){
        let prev = pointArray[pointArray.length-2];
        let line = new fabric.Line([prev.left, prev.top, circle.left, circle.top], {
            stroke: '#999',
            strokeWidth: 2,
            selectable:false,
            evented:false
        });
        canvas.add(line);
        activeLine = line;
    }
    canvas.renderAll();
    saveState();
});

// ======= COMPLETE POLYGON =======
function completePolygon() {
    if(pointArray.length < 3) {
        log("Need at least 3 points to make a polygon");
        return;
    }
    let points = pointArray.map(c=>({x:c.left, y:c.top}));
    pointArray.forEach(c=>canvas.remove(c));
    if(activeLine) canvas.remove(activeLine);
    let polygon = new fabric.Polygon(points, {
        fill:'rgba(0,0,255,0.3)',
        stroke:'#333',
        strokeWidth:1,
        selectable:true
    });
    canvas.add(polygon);
    polygonMode = false;
    pointArray = [];
    activeLine = null;
    saveState();
    log("Polygon completed");
}

// ======= EXPORT / IMPORT =======
function exportJSON(){
    let json = JSON.stringify(canvas.toJSON());
    let blob = new Blob([json], {type:'application/json'});
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fieldar-overlays.json";
    a.click();
    URL.revokeObjectURL(a.href);
    log("Exported JSON, size: "+json.length);
}

function importJSON(file){
    let reader = new FileReader();
    reader.onload = function(e){
        try{
            let data = JSON.parse(e.target.result);
            canvas.loadFromJSON(data, ()=>canvas.renderAll());
            saveState();
            log("Imported JSON, objects: "+canvas.getObjects().length);
        }catch(err){
            error("Failed to parse JSON");
        }
    };
    reader.readAsText(file);
}

// Hook buttons if they exist
document.getElementById("exportBtn")?.addEventListener("click", exportJSON);
document.getElementById("importBtn")?.addEventListener("click", ()=>{
    document.getElementById("importFile").click();
});
document.getElementById("importFile")?.addEventListener("change",(e)=>{
    if(e.target.files.length>0) importJSON(e.target.files[0]);
});

// ======= AUTO SAVE ON CHANGE =======
canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

// ======= LOAD STATE FROM LOCALSTORAGE =======
let saved = localStorage.getItem("fieldar_overlays");
if(saved){
    try{
        canvas.loadFromJSON(JSON.parse(saved), ()=>canvas.renderAll());
        log("Restored saved overlays from localStorage");
    }catch(e){
        error("Failed to restore overlays");
    }
}