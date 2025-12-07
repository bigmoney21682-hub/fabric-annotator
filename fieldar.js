// FILE: fieldar.js
// Fabric-based FieldAR Annotator v1.1
// Features: Undo/Redo, Polygon Draw, Image Import, Export/Import, localStorage, debug console

let canvas;
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let lineArray = [];
let activeLine = null;
let activeShape = null;

// =====================
// Debug Logging
// =====================
function log(msg) {
    console.log(msg);
    const dbg = document.getElementById("debugConsole");
    if(dbg) {
        dbg.innerHTML += `[LOG] ${msg}<br>`;
        dbg.scrollTop = dbg.scrollHeight;
    }
}

function error(msg) {
    console.error(msg);
    const dbg = document.getElementById("debugConsole");
    if(dbg) {
        dbg.innerHTML += `[ERROR] ${msg}<br>`;
        dbg.scrollTop = dbg.scrollHeight;
    }
}

// =====================
// Canvas Initialization
// =====================
function initCanvas() {
    canvas = new fabric.Canvas('annotatorCanvas', {
        selection: true
    });

    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);

    // Load saved overlays
    const saved = localStorage.getItem("fieldar_overlays");
    if(saved){
        try{
            canvas.loadFromJSON(JSON.parse(saved), canvas.renderAll.bind(canvas));
            log("Restored saved overlays");
        } catch(e){
            error("Failed to load saved overlays");
        }
    }

    // Track changes for undo/redo
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);
}

// =====================
// Undo/Redo Functions
// =====================
function saveState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    redoStack = []; // clear redo
}

function undo() {
    if(undoStack.length === 0) return;
    redoStack.push(JSON.stringify(canvas.toJSON()));
    const last = undoStack.pop();
    canvas.loadFromJSON(last, canvas.renderAll.bind(canvas));
    log("Undo performed");
}

function redo() {
    if(redoStack.length === 0) return;
    undoStack.push(JSON.stringify(canvas.toJSON()));
    const last = redoStack.pop();
    canvas.loadFromJSON(last, canvas.renderAll.bind(canvas));
    log("Redo performed");
}

// =====================
// Polygon Drawing
// =====================
function togglePolygonMode() {
    polygonMode = !polygonMode;
    pointArray = [];
    lineArray = [];
    activeLine = null;
    activeShape = null;
    log(`Polygon mode: ${polygonMode ? "ON" : "OFF"}`);
}

function addPoint(options) {
    const pointer = canvas.getPointer(options.e);

    const circle = new fabric.Circle({
        radius: 5,
        fill: pointArray.length === 0 ? "red" : "white",
        stroke: "#333",
        strokeWidth: 0.5,
        left: pointer.x,
        top: pointer.y,
        selectable: false,
        originX: 'center',
        originY: 'center'
    });

    let points = [pointer.x, pointer.y, pointer.x, pointer.y];
    const line = new fabric.Line(points, {
        strokeWidth: 2,
        fill: "#999",
        stroke: "#999",
        selectable: false,
        evented: false
    });

    pointArray.push(circle);
    lineArray.push(line);
    canvas.add(circle);
    canvas.add(line);
    canvas.selection = false;
    activeLine = line;

    // Active polygon
    if(!activeShape){
        activeShape = new fabric.Polygon([{x:pointer.x, y:pointer.y}], {
            stroke:"#333",
            strokeWidth:1,
            fill:"rgba(200,200,200,0.1)",
            selectable:false,
            evented:false
        });
        canvas.add(activeShape);
    } else {
        const polyPoints = activeShape.get("points");
        polyPoints.push({x:pointer.x, y:pointer.y});
        activeShape.set({points: polyPoints});
    }

    canvas.renderAll();
}

function finalizePolygon() {
    if(!activeShape) return;
    // Remove helper points and lines
    pointArray.forEach(p=>canvas.remove(p));
    lineArray.forEach(l=>canvas.remove(l));

    const polygon = new fabric.Polygon(activeShape.get("points"), {
        stroke:"#333",
        strokeWidth:0.5,
        fill:"rgba(0,0,0,0)"
    });

    canvas.remove(activeShape);
    canvas.add(polygon);
    canvas.selection = true;

    activeShape = null;
    polygonMode = false;
    pointArray = [];
    lineArray = [];

    saveState();
    log("Polygon finalized");
}

// =====================
// Image Import
// =====================
document.getElementById("imageLoader").onchange = function(e){
    if (!e.target.files || !e.target.files[0]) return;
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
    e.target.value = ""; // clear input to prevent thumbnail
};

// =====================
// Export/Import JSON
// =====================
function exportOverlays() {
    const json = JSON.stringify(canvas.toJSON());
    const blob = new Blob([json], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fieldar-overlays.json";
    a.click();
    URL.revokeObjectURL(url);
    log(`Exported overlays, size: ${json.length}`);
}

function importOverlays(file){
    if(!file) return error("No file selected");
    const reader = new FileReader();
    reader.onload = function(e){
        try{
            const data = JSON.parse(e.target.result);
            canvas.loadFromJSON(data, canvas.renderAll.bind(canvas));
            saveState();
            localStorage.setItem("fieldar_overlays", JSON.stringify(data));
            log(`Imported overlays: ${canvas.getObjects().length}`);
        } catch(err){
            error("Failed to parse JSON");
        }
    };
    reader.readAsText(file);
}

// =====================
// Canvas Mouse Events
// =====================
canvas?.on('mouse:down', function(options){
    if(polygonMode) addPoint(options);
});

// =====================
// Window Resize
// =====================
window.addEventListener('resize', ()=>{
    if(canvas && canvas.backgroundImage){
        canvas.setWidth(window.innerWidth);
        canvas.setHeight(window.innerHeight);
        canvas.backgroundImage.scaleToWidth(canvas.width);
        canvas.renderAll();
    }
});

// =====================
// Initialize on Load
// =====================
window.addEventListener('DOMContentLoaded', ()=>{
    log("🖥 Debug console initialized");
    initCanvas();

    // Button hooks
    document.getElementById("undoBtn").onclick = undo;
    document.getElementById("redoBtn").onclick = redo;

    document.getElementById("polygonBtn")?.addEventListener('click', togglePolygonMode);

    document.getElementById("exportBtn")?.addEventListener('click', exportOverlays);
    document.getElementById("importBtn")?.addEventListener('change', function(e){
        importOverlays(e.target.files[0]);
    });
});