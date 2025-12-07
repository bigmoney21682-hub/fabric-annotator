// FILE: fieldar.js
// Fabric.js based FieldAR Annotator

let canvas = new fabric.Canvas('annotatorCanvas');
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let lineArray = [];
let activeLine = null;
let activeShape = null;

// --------------------
// Logging
// --------------------
function log(msg){ console.log(msg); }

// --------------------
// Undo / Redo
// --------------------
function saveState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    redoStack = [];
}

function undo() {
    if(undoStack.length > 0){
        redoStack.push(JSON.stringify(canvas.toJSON()));
        let state = undoStack.pop();
        canvas.loadFromJSON(state, canvas.renderAll.bind(canvas));
    }
}

function redo() {
    if(redoStack.length > 0){
        undoStack.push(JSON.stringify(canvas.toJSON()));
        let state = redoStack.pop();
        canvas.loadFromJSON(state, canvas.renderAll.bind(canvas));
    }
}

document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// --------------------
// Image Loader
// --------------------
document.getElementById("imageLoader").onchange = function(e){
    let reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            let scale = Math.min(window.innerWidth / img.width, window.innerHeight / img.height);
            canvas.setWidth(img.width * scale);
            canvas.setHeight(img.height * scale);
            img.scale(scale);

            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                originX: 'left',
                originY: 'top'
            });

            saveState();
            log(`Loaded image: ${Math.round(img.width*scale)}x${Math.round(img.height*scale)}`);
        });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// --------------------
// Polygon Drawing
// --------------------
function startPolygonMode() {
    polygonMode = true;
    pointArray = [];
    lineArray = [];
    activeLine = null;
    activeShape = null;
    log("Polygon mode ON");
}

function finishPolygon() {
    if(pointArray.length < 3) return log("Need at least 3 points for polygon");

    let points = pointArray.map(p => ({x:p.left, y:p.top}));
    let polygon = new fabric.Polygon(points, {
        stroke:'#ff0',
        strokeWidth:2,
        fill:'rgba(255,255,0,0.3)'
    });

    canvas.add(polygon);
    // Clean up temporary circles/lines
    pointArray.forEach(p => canvas.remove(p));
    lineArray.forEach(l => canvas.remove(l));
    pointArray = [];
    lineArray = [];
    polygonMode = false;
    saveState();
    canvas.renderAll();
    log("Polygon created");
}

// Mouse click for polygon points
canvas.on('mouse:down', function(options){
    if(!polygonMode) return;

    let pointer = canvas.getPointer(options.e);
    let circle = new fabric.Circle({
        left: pointer.x,
        top: pointer.y,
        radius: 5,
        fill: 'red',
        originX: 'center',
        originY: 'center',
        selectable: false
    });
    pointArray.push(circle);
    canvas.add(circle);

    if(pointArray.length > 1){
        let points = [
            pointArray[pointArray.length-2].left,
            pointArray[pointArray.length-2].top,
            circle.left,
            circle.top
        ];
        let line = new fabric.Line(points, {
            stroke:'#ff0',
            strokeWidth: 2,
            selectable: false,
            evented: false
        });
        lineArray.push(line);
        canvas.add(line);
        activeLine = line;
    }
});

// --------------------
// Export / Import JSON
// --------------------
function exportJSON() {
    let json = JSON.stringify(canvas.toJSON());
    let blob = new Blob([json], {type:"application/json"});
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fieldar-overlays.json";
    a.click();
    log("Export complete, JSON size: "+json.length);
}

function importJSON(file){
    if(!file) return log("No file selected");
    let reader = new FileReader();
    reader.onload = function(e){
        let data = JSON.parse(e.target.result);
        canvas.loadFromJSON(data, canvas.renderAll.bind(canvas));
        saveState();
        log("JSON imported, objects: "+canvas.getObjects().length);
    };
    reader.readAsText(file);
}

// --------------------
// Button Event Hooks
// --------------------
document.getElementById("exportBtn").addEventListener('click', exportJSON);
document.getElementById("importBtn").addEventListener('click', ()=>{
    document.getElementById("importFile").click();
});
document.getElementById("polygonBtn").addEventListener('click', startPolygonMode);
document.getElementById("finishPolygonBtn").addEventListener('click', finishPolygon);
document.getElementById("importFile").addEventListener('change', function(e){
    importJSON(e.target.files[0]);
});