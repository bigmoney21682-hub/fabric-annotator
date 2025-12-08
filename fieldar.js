// =====================================================
// FieldAR.js -- Unified Core + UI (Optimized)
// =====================================================

// ---------- GLOBALS ----------
let canvas = null;
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let activeGuideLine = null;
let activePolygon = null;

const debugConsole = document.getElementById("debugConsole");
function log(msg){ console.log(msg); if(debugConsole){ debugConsole.innerHTML += `[LOG] ${msg}<br>`; trimDebug(); } }
function error(msg){ console.error(msg); if(debugConsole){ debugConsole.innerHTML += `[ERROR] ${msg}<br>`; trimDebug(); } }

log("🖥 FieldAR Initialized");


// =====================================================
// DEBUG CONSOLE AUTO-TRIM
// =====================================================
function trimDebug(){
    const maxLines = 4;
    const lines = debugConsole.innerHTML.split("<br>");
    if(lines.length > maxLines){
        debugConsole.innerHTML = lines.slice(lines.length - maxLines).join("<br>");
    }
}


// =====================================================
// CANVAS INIT
// =====================================================
window.onload = function(){
    canvas = new fabric.Canvas('annotatorCanvas', {
        selection: true,
        preserveObjectStacking: true
    });

    // Fit canvas to container
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function resizeCanvas(){
        const wrap = document.getElementById("canvasWrap");
        canvas.setWidth(wrap.clientWidth);
        canvas.setHeight(wrap.clientHeight);
        canvas.renderAll();
    }

    setupUndoRedo();
    setupPolygonTools();
    setupTopToolbar();
    setupBaseImageLoader();
    setupOverlayLoader();

    log("Canvas initialized");
};


// =====================================================
// UNDO / REDO
// =====================================================
function setupUndoRedo(){
    function saveState(){
        undoStack.push(JSON.stringify(canvas.toJSON()));
        redoStack = [];
    }

    canvas.on("object:added", saveState);
    canvas.on("object:modified", saveState);
    canvas.on("object:removed", saveState);

    document.getElementById("undoBtn").onclick = function(){
        if(undoStack.length > 1){
            redoStack.push(undoStack.pop());
            canvas.loadFromJSON(undoStack.at(-1), canvas.renderAll.bind(canvas));
        }
    };

    document.getElementById("redoBtn").onclick = function(){
        if(redoStack.length > 0){
            const state = redoStack.pop();
            undoStack.push(state);
            canvas.loadFromJSON(state, canvas.renderAll.bind(canvas));
        }
    };
}


// =====================================================
// BASE IMAGE LOADING
// =====================================================
function setupBaseImageLoader(){
    const input = document.getElementById("baseImageInput");

    input.onchange = function(e){
        let reader = new FileReader();
        reader.onload = function(event){
            fabric.Image.fromURL(event.target.result, function(img){
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                    originX: "left",
                    originY: "top"
                });

                canvas.setWidth(img.width);
                canvas.setHeight(img.height);
                canvas.renderAll();

                log(`Loaded base image: ${img.width}x${img.height}`);
            });
        };
        reader.readAsDataURL(e.target.files[0]);
    };
}


// =====================================================
// OVERLAY IMAGE LOADING
// =====================================================
function setupOverlayLoader(){
    const input = document.getElementById("addOverlayInput");

    input.onchange = function(e){
        let reader = new FileReader();
        reader.onload = function(event){
            fabric.Image.fromURL(event.target.result, function(img){
                img.set({
                    left: canvas.width / 2 - img.width / 4,
                    top: canvas.height / 2 - img.height / 4,
                    scaleX: 0.5,
                    scaleY: 0.5
                });

                canvas.add(img).setActiveObject(img);
                canvas.renderAll();
                log("Added overlay");
            });
        };
        reader.readAsDataURL(e.target.files[0]);
    };
}


// =====================================================
// TOP TOOLBAR BUTTONS (incl. Polygon + Finish)
// =====================================================
function setupTopToolbar(){

    // Polygon button
    document.getElementById("polygonBtn").onclick = function(){
        polygonMode = !polygonMode;
        if(polygonMode){
            pointArray = [];
            if(activeGuideLine){ canvas.remove(activeGuideLine); activeGuideLine = null; }
            log("Polygon mode: ON");
        } else {
            log("Polygon mode: OFF");
        }
    };

    // Finish polygon button
    document.getElementById("completePolygonBtn").onclick = completePolygon;

    // Delete selected
    document.getElementById("deleteBtn").onclick = function(){
        const obj = canvas.getActiveObject();
        if(obj){
            canvas.remove(obj);
            log("Deleted object");
        }
    };

    // Save (export JSON)
    document.getElementById("saveBtn").onclick = function(){
        const json = JSON.stringify(canvas.toJSON());
        const blob = new Blob([json], {type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "FieldAR-Project.json";
        a.click();
        URL.revokeObjectURL(url);
        log("Project saved");
    };

    // Load project
    document.getElementById("loadBtn").onclick = () =>
        document.getElementById("loadProjectFile").click();

    document.getElementById("loadProjectFile").onchange = function(e){
        let f = e.target.files[0];
        let reader = new FileReader();
        reader.onload = function(ev){
            canvas.loadFromJSON(JSON.parse(ev.target.result), canvas.renderAll.bind(canvas));
            log("Project loaded");
        };
        reader.readAsText(f);
    };
}


// =====================================================
// POLYGON DRAWING + RESIZING
// =====================================================
function setupPolygonTools(){

    canvas.on("mouse:down", function(opt){
        if(!polygonMode) return;

        const p = canvas.getPointer(opt.e);

        // Add a handle dot
        const dot = new fabric.Circle({
            radius: 5,
            fill: pointArray.length === 0 ? "red" : "white",
            left: p.x,
            top: p.y,
            originX: "center",
            originY: "center",
            selectable: true,   // now interactable
            hasBorders: false,
            hasControls: true   // allow resizing
        });

        canvas.add(dot);
        pointArray.push(dot);

        // Temp guide line
        if(pointArray.length > 1){
            const prev = pointArray[pointArray.length - 2];
            activeGuideLine = new fabric.Line([prev.left, prev.top, p.x, p.y], {
                stroke: "yellow",
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            canvas.add(activeGuideLine);
        }
    });
}


// =====================================================
// COMPLETE POLYGON
// =====================================================
function completePolygon(){
    if(!polygonMode || pointArray.length < 3) return;

    const points = pointArray.map(p => ({ x: p.left, y: p.top }));

    const polygon = new fabric.Polygon(points, {
        fill: "rgba(255,0,0,0.25)",
        stroke: "yellow",
        strokeWidth: 1,
        objectCaching: false,
        selectable: true
    });

    // Remove point handles + guideline
    pointArray.forEach(p => canvas.remove(p));
    if(activeGuideLine) canvas.remove(activeGuideLine);

    pointArray = [];
    activeGuideLine = null;
    polygonMode = false;

    canvas.add(polygon);
    canvas.setActiveObject(polygon);
    canvas.renderAll();

    log("Polygon completed & selectable");
}