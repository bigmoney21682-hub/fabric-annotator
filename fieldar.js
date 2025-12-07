// FILE: fieldar.js
// Author: Oshane Bailey
// Full Feature Fabric.js Annotator for FieldAR

let canvas;
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let activeLine;
let activeShape;

// =====================
// Debug & Save Helpers
// =====================
function log(msg) { console.log(`[LOG] ${msg}`); }
function error(msg) { console.error(`[ERROR] ${msg}`); }

function saveState() {
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    undoStack.push(json);
    redoStack = []; // clear redo on new action
    localStorage.setItem("fieldar_overlays", json);
    log("State saved. Undo stack length: " + undoStack.length);
}

function undo() {
    if (undoStack.length > 1) {
        const current = undoStack.pop();
        redoStack.push(current);
        const previous = undoStack[undoStack.length - 1];
        canvas.loadFromJSON(previous, () => {
            canvas.renderAll();
        });
        log("Undo performed");
    } else {
        log("Nothing to undo");
    }
}

function redo() {
    if (redoStack.length > 0) {
        const next = redoStack.pop();
        undoStack.push(next);
        canvas.loadFromJSON(next, () => {
            canvas.renderAll();
        });
        log("Redo performed");
    } else {
        log("Nothing to redo");
    }
}

// =====================
// Canvas Initialization
// =====================
function initCanvas() {
    canvas = new fabric.Canvas('annotatorCanvas', {
        selection: true
    });

    // Load previous overlays
    const saved = localStorage.getItem("fieldar_overlays");
    if (saved) {
        canvas.loadFromJSON(saved, () => {
            canvas.renderAll();
            undoStack.push(saved);
        });
    } else {
        undoStack.push(JSON.stringify(canvas.toJSON()));
    }

    // Auto-save on modifications
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    log("Canvas initialized");
}

// =====================
// Image Loader
// =====================
document.getElementById("imageLoader").onchange = function(e){
    let reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            // Resize canvas to image size
            canvas.setWidth(img.width);
            canvas.setHeight(img.height);

            // Set background
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

// =====================
// Undo/Redo Buttons
// =====================
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// =====================
// Polygon Draw
// =====================
function startPolygonMode() {
    polygonMode = true;
    pointArray = [];
    activeLine = null;
    activeShape = null;
    log("Polygon draw mode enabled");
}

canvas && canvas.on('mouse:down', function(options){
    if (!polygonMode) return;
    const pointer = canvas.getPointer(options.e);
    const circle = new fabric.Circle({
        left: pointer.x,
        top: pointer.y,
        radius: 5,
        fill: pointArray.length === 0 ? 'red' : 'white',
        originX: 'center',
        originY: 'center',
        selectable: false
    });
    canvas.add(circle);
    pointArray.push(circle);

    const points = [pointer.x, pointer.y, pointer.x, pointer.y];
    activeLine = new fabric.Line(points, {
        strokeWidth: 2,
        stroke: '#999999',
        selectable: false,
        evented: false
    });
    canvas.add(activeLine);

    if (activeShape) {
        const polyPoints = activeShape.get("points");
        polyPoints.push({ x: pointer.x, y: pointer.y });
        activeShape.set({ points: polyPoints });
        canvas.remove(activeShape);
        canvas.add(activeShape);
    } else {
        activeShape = new fabric.Polygon([{ x: pointer.x, y: pointer.y }], {
            stroke: '#333',
            strokeWidth: 1,
            fill: 'rgba(0,0,0,0.1)',
            selectable: false,
            evented: false
        });
        canvas.add(activeShape);
    }
});

canvas && canvas.on('mouse:move', function(options){
    if (!polygonMode || !activeLine) return;
    const pointer = canvas.getPointer(options.e);
    activeLine.set({ x2: pointer.x, y2: pointer.y });
    canvas.renderAll();
});

function finishPolygon() {
    if (!polygonMode || pointArray.length < 2) return;
    const points = pointArray.map(p => ({ x: p.left, y: p.top }));
    const group = createPolygonGroup(points);

    pointArray.forEach(p => canvas.remove(p));
    canvas.remove(activeLine);
    activeLine = null;
    activeShape = null;
    pointArray = [];
    polygonMode = false;
    canvas.setActiveObject(group);
    log("Polygon finished");
}

// =====================
// Annotation Text
// =====================
function attachAnnotationText(polygonGroup) {
    let existingText = polygonGroup.item(1).text || "";
    let textValue = prompt("Enter annotation text:", existingText);
    if (textValue !== null) {
        polygonGroup.item(1).set({ text: textValue });
        canvas.renderAll();
        saveState();
        log(`Annotation updated: "${textValue}"`);
    }
}

canvas && canvas.on('object:selected', function(e){
    const obj = e.target;
    if (obj.type === 'group') attachAnnotationText(obj);
});

function createPolygonGroup(points) {
    const polygon = new fabric.Polygon(points, {
        stroke: '#333',
        strokeWidth: 0.5,
        fill: 'rgba(0,0,0,0.1)',
        hasBorders: false,
        hasControls: true
    });

    const cText = new fabric.Text('New Label', {
        fontFamily: 'Arial',
        fill: 'white',
        fontSize: 12,
        left: polygon.left + polygon.width / 2,
        top: polygon.top + polygon.height / 2
    });

    const group = new fabric.Group([polygon, cText], {
        left: polygon.left,
        top: polygon.top
    });

    canvas.add(group);
    canvas.renderAll();
    return group