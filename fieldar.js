// FILE: fieldar.js
let canvas, undoStack=[], redoStack=[], polygonMode=false, points=[], tempLines=[];
let currentBgImage = null;
const debugConsole = document.getElementById("debugConsole");
const toolbar = document.getElementById("toolbar");

function log(msg){ debugConsole.innerHTML += `[LOG] ${msg}<br>`; debugConsole.scrollTop = debugConsole.scrollHeight; }
function saveState(){ undoStack.push(JSON.stringify(canvas)); log("State saved"); }
function restoreState(stackFrom, stackTo){
    if(stackFrom.length>0){
        let state = stackFrom.pop();
        canvas.loadFromJSON(state, ()=>{canvas.renderAll();});
        stackTo.push(state);
        log("State restored");
    }
}

// --- Initialize canvas ---
canvas = new fabric.Canvas('annotatorCanvas');
canvas.selection = true;

// --- Buttons ---
document.getElementById("undoBtn").onclick = ()=>restoreState(undoStack, redoStack);
document.getElementById("redoBtn").onclick = ()=>restoreState(redoStack, undoStack);
document.getElementById("polygonBtn").onclick = ()=>{
    polygonMode=!polygonMode;
    points.forEach(p=>canvas.remove(p));
    tempLines.forEach(l=>canvas.remove(l));
    points=[]; tempLines=[];
    canvas.renderAll();
    log("Polygon draw " + (polygonMode?"enabled":"disabled"));
};
document.getElementById("saveBtn").onclick = ()=>{
    localStorage.setItem("fieldar_overlays", JSON.stringify(canvas.toJSON()));
    log("Canvas saved to localStorage");
};
document.getElementById("deleteBtn").onclick = ()=>{
    const obj = canvas.getActiveObject();
    if(obj){ canvas.remove(obj); log("Deleted selected object"); saveState(); }
};
document.getElementById("toggleToolbarBtn").onclick = ()=>{
    toolbar.style.display = toolbar.style.display==="none"?"flex":"none";
    log("Toolbar " + (toolbar.style.display==="none"?"hidden":"visible"));
};
document.getElementById("convertPngBtn").onclick = ()=>{
    const dataURL = canvas.toDataURL({format:'png'});
    const a = document.createElement('a'); a.href=dataURL; a.download='fieldar_converted.png'; a.click();
    log("Converted canvas to PNG and downloaded");
};

// --- Load image ---
document.getElementById("imageLoader").onchange = function(e){
    const reader = new FileReader();
    reader.onload = function(event){
        fabric.Image.fromURL(event.target.result, function(img){
            currentBgImage = img;
            canvas.originalWidth = img.width;
            canvas.originalHeight = img.height;
            resizeCanvas();
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {originX:'left', originY:'top'});
            saveState();
            log(`Loaded image: ${img.width}x${img.height}`);
        });
    };
    reader.readAsDataURL(e.target.files[0]);
};

// --- Auto-save ---
canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

// --- Polygon drawing ---
canvas.on('mouse:down', function(options){
    if(!polygonMode) return;
    const pointer = canvas.getPointer(options.e);
    const circle = new fabric.Circle({
        left:pointer.x, top:pointer.y, radius:5, fill:'red', selectable:false, originX:'center', originY:'center'
    });
    canvas.add(circle); points.push(circle);
    if(points.length>1){
        const prev = points[points.length-2];
        const line = new fabric.Line([prev.left, prev.top, circle.left, circle.top], {stroke:'yellow', strokeWidth:2, selectable:false});
        canvas.add(line); tempLines.push(line);
    }
});
canvas.on('mouse:dblclick', function(){
    if(points.length<3) return;
    const polygonPoints = points.map(p=>({x:p.left,y:p.top}));
    const polygon = new fabric.Polygon(polygonPoints,{fill:'rgba(0,0,255,0.2)', stroke:'blue', strokeWidth:2});
    const center = polygon.getCenterPoint();
    const text = new fabric.Textbox('Annotation',{
        left:center.x, top:center.y, fontSize:16, fill:'white', originX:'center', originY:'center', editable:true
    });
    const group = new fabric.Group([polygon,text], {selectable:true});
    canvas.add(group);
    points.forEach(p=>canvas.remove(p));
    tempLines.forEach(l=>canvas.remove(l));
    points=[]; tempLines=[]; polygonMode=false; canvas.renderAll(); saveState();
    log("Polygon finalized with annotation");
});

// --- Responsive resize ---
function resizeCanvas(){
    if(!currentBgImage) return;
    const scaleX = window.innerWidth / canvas.originalWidth;
    const scaleY = (window.innerHeight - 160) / canvas.originalHeight;
    const scale = Math.min(scaleX, scaleY);

    canvas.setWidth(canvas.originalWidth * scale);
    canvas.setHeight(canvas.originalHeight * scale);

    currentBgImage.scale(scale);
    canvas.setBackgroundImage(currentBgImage, canvas.renderAll.bind(canvas));

    // Scale all objects proportionally
    canvas.getObjects().forEach(obj=>{
        if(!obj.originalLeft){ obj.originalLeft = obj.left; obj.originalTop = obj.top; obj.originalScaleX = obj.scaleX; obj.originalScaleY = obj.scaleY; }
        const leftScale = obj.originalLeft * scale;
        const topScale = obj.originalTop * scale;
        const scaleXObj = obj.originalScaleX * scale;
        const scaleYObj = obj.originalScaleY * scale;

        obj.scaleX = scaleXObj;
        obj.scaleY = scaleYObj;
        obj.left = leftScale;
        obj.top = topScale;
        obj.setCoords();
    });
    canvas.renderAll();
    log(`Canvas resized: ${canvas.width}x${canvas.height}`);
}

// --- Orientation toolbar ---
function adjustToolbarForOrientation(){
    if(window.innerHeight > window.innerWidth){
        toolbar.style.display='none';
        log("Portrait: toolbar hidden");
    } else {
        toolbar.style.display='flex';
        log("Landscape: toolbar visible");
    }
}

window.addEventListener('resize', ()=>{resizeCanvas(); adjustToolbarForOrientation();});
window.addEventListener('orientationchange', ()=>{resizeCanvas(); adjustToolbarForOrientation();});
adjustToolbarForOrientation();