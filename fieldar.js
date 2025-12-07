// FILE: fieldar.js
// FieldAR Core + UI combined

let canvas = null;
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let activeLine = null;
let activeShape = null;

// -------------------- DEBUG CONSOLE --------------------
const debugConsole = document.getElementById("debugConsole");
function log(msg){ console.log(msg); if(debugConsole) debugConsole.innerHTML += `[LOG] ${msg}<br>`; if(debugConsole) debugConsole.scrollTop = debugConsole.scrollHeight;}
function error(msg){ console.error(msg); if(debugConsole) debugConsole.innerHTML += `[ERROR] ${msg}<br>`; if(debugConsole) debugConsole.scrollTop = debugConsole.scrollHeight;}
log("🖥 Debug console initialized");

// -------------------- IMAGE LOAD --------------------
const imgLoader = document.getElementById("imageLoader");
imgLoader.onchange = function(e){
    let reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(imgObj){
            // Resize canvas
            canvas.setWidth(imgObj.width);
            canvas.setHeight(imgObj.height);

            // Set as background
            canvas.setBackgroundImage(imgObj, canvas.renderAll.bind(canvas), { originX:'left', originY:'top' });
            
            saveState();
            log(`Loaded image: ${imgObj.width}x${imgObj.height}`);
        });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// -------------------- CANVAS INIT --------------------
window.onload = function(){
    canvas = new fabric.Canvas('annotatorCanvas');
    canvas.selection = true;

    // -------------------- UNDO/REDO --------------------
    function saveState(){
        undoStack.push(JSON.stringify(canvas.toJSON()));
        redoStack = [];
        log("Saved state, undoStack length: "+undoStack.length);
    }

    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    document.getElementById("undoBtn").onclick = function(){
        if(undoStack.length > 1){
            redoStack.push(undoStack.pop());
            canvas.loadFromJSON(undoStack[undoStack.length-1], canvas.renderAll.bind(canvas));
            log("Undo performed");
        } else log("Undo stack empty");
    };

    document.getElementById("redoBtn").onclick = function(){
        if(redoStack.length>0){
            const last = redoStack.pop();
            undoStack.push(last);
            canvas.loadFromJSON(last, canvas.renderAll.bind(canvas));
            log("Redo performed");
        } else log("Redo stack empty");
    };

    // -------------------- POLYGON DRAW --------------------
    document.getElementById("polyBtn").onclick = function(){
        polygonMode = !polygonMode;
        pointArray = [];
        activeLine = null;
        activeShape = null;
        log("Polygon mode: "+polygonMode);
    };

    canvas.on('mouse:down', function(options){
        if(!polygonMode) return;
        const pointer = canvas.getPointer(options.e);
        const circle = new fabric.Circle({
            radius:5, fill:(pointArray.length===0?'red':'white'),
            left:pointer.x, top:pointer.y,
            originX:'center', originY:'center', selectable:false
        });
        canvas.add(circle);
        pointArray.push(circle);

        if(pointArray.length>1){
            const points = [pointArray[pointArray.length-2].left, pointArray[pointArray.length-2].top, pointer.x, pointer.y];
            activeLine = new fabric.Line(points, { stroke:'yellow', strokeWidth:2, selectable:false, evented:false });
            canvas.add(activeLine);
        }
    });

    canvas.on('mouse:dblclick', function(){
        if(polygonMode && pointArray.length>2){
            const polygonPoints = pointArray.map(c=>({x:c.left, y:c.top}));
            const polygon = new fabric.Polygon(polygonPoints, { fill:'rgba(255,0,0,0.3)', stroke:'yellow', strokeWidth:1 });
            canvas.add(polygon);
            pointArray.forEach(c=>canvas.remove(c));
            if(activeLine) canvas.remove(activeLine);
            polygonMode = false;
            log("Polygon completed");
        }
    });

    // -------------------- DELETE SELECTED --------------------
    document.getElementById("deleteBtn").onclick = function(){
        const obj = canvas.getActiveObject();
        if(obj){
            canvas.remove(obj);
            log("Overlay deleted");
        }
    };

    // -------------------- EXPORT/IMPORT --------------------
    document.getElementById("exportBtn").onclick = function(){
        const json = JSON.stringify(canvas.toJSON());
        const blob = new Blob([json], {type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fieldar-overlays.json";
        a.click();
        URL.revokeObjectURL(url);
        log("Exported overlays, size: "+json.length);
    };

    document.getElementById("importFile").onchange = function(e){
        const file = e.target.files[0];
        if(!file) return error("No file selected");
        const reader = new FileReader();
        reader.onload = function(ev){
            try{
                const data = JSON.parse(ev.target.result);
                canvas.loadFromJSON(data, canvas.renderAll.bind(canvas));
                saveState();
                log("Imported overlays: "+canvas.getObjects().length);
            } catch(err){ error("Failed to parse JSON"); }
        };
        reader.readAsText(file);
    };
};