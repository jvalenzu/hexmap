var svgns = "http://www.w3.org/2000/svg";

// jiv todo
// * status line
// * fix hex tile layout
// * need image dimension information associated ship pieces like NCC1701.png in order to
//   avoid hard coded tweaks in code
// * have a ship playable card in addition to starmap
// * different context specific "modes"
//   - move mode: start with selected ship, select next hex and turn marker if eligible
// * zoom controls
// * css
//   
// * orient ships
// * seperate game and UI state
// * move ship data into state
// * resize destroys all ship instances: replace ship instances on redraw

// ship instances
// * reference to ship class
// * subimpulses since last turn
// * subimpulses since last slip
// * base speed this turn
// * acceleration this impulse

const debugColors = [
    '#00ff00',
    '#0033ff',
    '#ff0099',
    '#ffcc00',
    '#33ff00',
    '#0099ff',
    '#cc00ff',
    '#ff6600',
    '#66ff00',
    '#0066ff',
    '#ff3300',
    '#99ff00',
    '#0000ff',
    '#ff0000',
    '#00ff66',
    '#ffcc33',
    '#009933',
    '#3300ff',
    '#ff0033',
    '#00ccff'
];



var g_GameState =
{
    turn: 0,
    impulse: 0,
    subimpulse: 0,
    ships: {},
    
    shipYard: {
        id_gen: 1,
        ids : [],
        callsigns : [],
        klass : [],
        hexids : []
    }
};

const g_Debug = true;


// modes
// * default
// * place
// * move

var g_UIState =
{
    mouse: { x: 0, y: 0 },
    viewport: { x: 0, y: 0, width: 1000, height: 1000 },
    selected: null,
    events: 0,
    tools_mode: "place"
};

var g_Scale = 1;

function updateStatusLine(value)
{
    var status_line = document.getElementById("status-line");
    status_line.textContent = value;
}

function updateStatusLine2(value0, value1)
{
    var status_line = document.getElementById("status-line");
    status_line.innerHTML = `<div style="float: left; padding-right: 89px">${value0}</div><div style="float: right"><button id='commit'>Commit</button><button id='undo'>Undo</button></div><div>${value1}</div>`;
}

function updateGameStatus(state)
{
    let turn = state.turn;
    let impulse = state.turn;
    let subimpulse = state.turn;
    let prefix = `Turn: ${turn} Impulse: ${impulse} Subimpulse: ${subimpulse}`;
    
    switch (g_UIState.tools_mode)
    {
    case "move":
        {
            let status = ` MOVE: select next tile and orientation`;
            updateStatusLine2(prefix, status);
            
            break;
        }
    case "place":
        {
            let status = ` PLACE SHIP: select tile and orientation`;
            updateStatusLine2(prefix, status);
            
            break;
        }
    default:
        {
            updateStatusLine(prefix);
            break;
        }
    }
}

function refreshUi()
{
    window.requestAnimationFrame(draw);    
}

function addShip(gamestate, hex)
{
    // add ui
    let image = document.createElementNS(svgns, "image");
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", "NCC1701.png");
    image.setAttribute("width",200);
    image.setAttribute("height",200);
    image.setAttribute("x",-100);
    image.setAttribute("y",-100);
    image.setAttribute("transform","rotate(45 0 0)");

    hex.parentElement.appendChild(image);

    // add simulation
    let id = gamestate.shipYard.id_gen++;
    let index = gamestate.shipYard.ids.length;
    gamestate.shipYard.ids[index] = id;
    gamestate.shipYard.callsigns[index] = 'ncc1701';
    gamestate.shipYard.klass[index] = 'heavy cruiser';
    gamestate.shipYard.hexids[index] = hex.id;
    
    console.log("Adding ship to " + hexToString(hex));
}

function getShipIndexByHex(gamestate, hex)
{
    // todo: multiple ships same hex
    for (let i=0,ni=gamestate.shipYard.hexids.length; i<ni; ++i)
    {
        if (gamestate.shipYard.hexids[i] == hex.id)
            return i;
    }
    return -1;
}

function getShipIndexById(gamestate, hex)
{
    for (let i=0,ni=gamestate.shipYard.hexids.length; i<ni; ++i)
    {
        if (gamestate.shipYard.hexids[i] == hex.id)
            return i;
    }
    return -1;
}

function getShipIndexById(gamestate, shipId)
{
    for (let i=0,ni=gamestate.shipYard.ids.length; i<ni; ++i)
    {
        if (gamestate.shipYard.ids[i] == shipId)
            return i;
    }
    return -1;
}

function unselectByShip(gamestate)
{
}

function getHexIdByShip(gamestate, shipId)
{
    let index = getShipIndexById(gamestate, shipId);
    if (index >= 0)
        return gamestate.shipYard.hexids[index];
    return undefined;
}

function distByHexId(hexid0, hexid1)
{
    let q0 = hexid0<<16>>16;
    let r0 = hexid0>>16;
    let s0 = -q0 - r0;
    
    let q1 = hexid1<<16>>16;
    let r1 = hexid1>>16;
    let s1 = -q1 - r1;
    
    let d = (Math.abs(q1 - q0) + Math.abs(r1 - r0) + Math.abs(s1 - s0)) / 2;
    // console.log(`Dist between ${hexIdToString(hexid0)} ${hexIdToString(hexid1)}: ${d}`);
    return d;
}

function hexIdToString(hexId)
{
    let q0 = hexId<<16>>16;
    let r0 = hexId>>16;
    let s0 = -q0 - q0;

    let p = function(x,p) {
        return x.toString().padStart(p, ' ');
    };
    let p2 = function(x) {
        return p(x,2);
    };

    return `(q:${p2(q0)},r:${p2(r0)},s:${p2(s0)},h:${p(hexId,6)})`;
}

function hexToString(hex)
{
    return hexIdToString(hex.id);
}

function onHexClick(gamestate, hex, event)
{
    switch (g_UIState.tools_mode)
    {
    case "place":
        {
            // select
            addShip(gamestate, hex);
            
            // update status line
            g_UIState.tools_mode = "move";
            refreshUi();
            
            break;
        }
    case "move":
        {
            let index = getShipIndexByHex(gamestate, hex);
            if (index >= 0)
            {
                if (g_UIState.selectedShip)
                    unselectByShip(gamestate, g_UIState.selectedShip);
                
                g_UIState.selectedShip = gamestate.shipYard.ids[index];
                gamestate.shipYard.hexids[index] = hex.id;
                hex.setAttribute("style","fill:darkgray; stroke: red; stroke-width:20");
                
                // debug
                if (g_Debug)
                {
                    let map = document.getElementById("map");
                    for (let child of map.children)
                    {
                        if (child instanceof SVGGElement)
                        {
                            let dist = distByHexId(hex.id, child.id);
                            let hexcolor = debugColors[dist % debugColors.length];
                            
                            for (let pchild of child.children)
                            {
                                if (pchild instanceof SVGPolygonElement)
                                    pchild.setAttribute("style",`fill:${hexcolor};`);
                            }
                        }
                    }
                }
            }
            else if (g_UIState.selectedShip)
            {
                let previousHexId = getHexIdByShip(gamestate, g_UIState.selectedShip);
                
                if (distByHexId(previousHexId, hex.id) == 1)
                    console.log("yes");
                else
                    console.log("no");
                
                /*
                selectedHex.setAttribute("style","fill:darkgray; stroke:black");
                g_UIState.selected = null;
                
                g_UIState.tools_mode = "default";
                refreshUi();
                */
            }
            
            break;
        }
    default:
        {
            break;
        }
    }
}

function init()
{
    const a = 2 * Math.PI / 6.0;
    const r = 50;
    
    function resizeCanvas(gamestate)
    {
        let container = document.getElementById("map-container");
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        
        let svg = document.getElementById("svg");
        svg.setAttribute("style", "width:"+ width + ";height:"+ height +";");
        
        let map = document.getElementById("map");
        while (map.childElementCount)
            map.removeChild(map.children[0]);
        
        var start_xoffset = 0;
        var start_yoffset = 0;
        
        var xoffset = start_xoffset;
        var yoffset = start_yoffset;

        let num_cols = 10;
        let num_rows = 10;
        
        for (let r=-num_rows,nr=num_rows; r<nr; ++r)
        {
            var xbias = (r&1) * 150;
            
            for (let c=-(num_cols/2-1), nc=(num_cols/2-2); c<=nc; ++c)
            {
                let points =
                        [
                            "100,0",
                            "+50,-87",
                            "-50,-87",
                            "-100,-0",
                            "-50,87",
                            "+50,87"
                        ];
                
                let g = document.createElementNS(svgns, "g");
                g.setAttribute("transform","translate("+(xoffset+xbias)+","+yoffset+")");
                
                let polygon = document.createElementNS(svgns, "polygon");
                polygon.setAttribute("points","100,0 50,-87 -50,-87 -100,-0 -50,87 50,87");
                polygon.setAttribute("overflow","visible");
                polygon.setAttribute("style",`fill:gray; stroke:black`);
                
                g.addEventListener('mouseup', (e) => { onHexClick(gamestate, polygon, e); }, false);
                g.appendChild(polygon);

                {
                    let isDragging = false;
                    let startX, startY, currentX, currentY;

                    svg.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        startX = e.clientX - svg.getBoundingClientRect().left;
                        startY = e.clientY - svg.getBoundingClientRect().top;
                    });

                    svg.addEventListener('mousemove', (e) => {
                        if (isDragging) {
                            e.preventDefault();
                            currentX = e.clientX - svg.getBoundingClientRect().left;
                            currentY = e.clientY - svg.getBoundingClientRect().top;

                            const deltaX = currentX - startX;
                            const deltaY = currentY - startY;
                            
                            g_UIState.viewport = { x: -deltaX, y: -deltaY, width: 1000, height: 1000 };

                            refreshUi();
                        }
                    });

                    window.addEventListener('mouseup', () => {
                        isDragging = false;
                    });
                }
                
                let qp = 2*c + (r&1);
                let rp = (r - (r&1))/2 - c;
                
                polygon.setAttribute("id",((rp<<16) | (qp&0xffff)));
                g.setAttribute("id",      ((rp<<16) | (qp&0xffff)));

                if (g_Debug)
                {
                    let label = document.createElementNS(svgns, "text");
                    label.setAttributeNS(null, "x","-25");
                    label.setAttributeNS(null, "y","-40");
                    label.setAttributeNS(null, "font-size","40");
                    label.setAttributeNS(null, "fill","blue");

                    let label_east = document.createElementNS(svgns, "text");
                    label_east.setAttributeNS(null, "x","20");
                    label_east.setAttributeNS(null, "y","15");
                    label_east.setAttributeNS(null, "font-size","40");
                    label_east.setAttributeNS(null, "fill","white");

                    let label_south = document.createElementNS(svgns, "text");
                    label_south.setAttributeNS(null, "x","-25");
                    label_south.setAttributeNS(null, "y","75");
                    label_south.setAttributeNS(null, "font-size","40");
                    label_south.setAttributeNS(null, "fill","lightgreen");
                    
                    label.appendChild(document.createTextNode(`q: ${qp}`));
                    label_east.appendChild(document.createTextNode(`r: ${rp}`));
                    label_south.appendChild(document.createTextNode(`s: ${-qp-rp}`));
                    
                    g.appendChild(label);
                    g.appendChild(label_east);
                    g.appendChild(label_south);
                }
                
                map.appendChild(g);
                
                xoffset += 300;
            }
            
            yoffset += 87;
            xoffset = start_xoffset;
        }
    }
    
    window.addEventListener('resize', () => { resizeCanvas(g_GameState); }, false);
    
    resizeCanvas(g_GameState);
    
    g_GameState.turn = 1;
    g_GameState.impulse = 1;
    g_GameState.subimpulse = 1;

    updateGameStatus(g_GameState);
}

init();

function draw()
{
    let svg = document.getElementById("svg");
    let v = g_UIState.viewport;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.width} ${v.height}`);
    
    updateGameStatus(g_GameState);
}
