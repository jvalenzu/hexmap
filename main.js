var svgns = "http://www.w3.org/2000/svg";

// jiv todo
// * need image dimension information associated ship pieces like NCC1701.png in order to
//   avoid hard coded tweaks in code
// * have a ship playable card in addition to starmap
// * zoom controls
//
// * different context specific "modes"
//   - move mode
//     o start with selected ship
//     o select next hex and turn marker if eligible
//   - slip/turn button on status line
//   - commit action
//   
// * orient ships
// * move ship data into state
// * resize destroys all ship instances: replace ship instances on redraw
// * client/server logic
//   * seperate out into client gathers input, server applies operations on data, saves to undo stack

// ship instances
// * reference to ship class
// * subimpulses since last turn
// * subimpulses since last slip
// * base speed this turn
// * acceleration this impulse

/*

 Facing
        _________
       /    |    \
      /\    |    /\
     /  5   0   1  \
    /    \  |  /    \
   |      \ | /     |
    \     / | \     /
     \   4  3  2   /
      \ /   |   \ /
       \____|____/

 */

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

class Ship
{
    constructor(id, callsign, klass, hexid, facing)
    {
        this.id = id;
        this.callsign = callsign;
        this.klass = klass;
        this.hexid = hexid;
        this.facing = facing;
    }
};

let g_GameState =
{
    turn: 0,
    impulse: 0,
    subimpulse: 0,
    ships:
    [
        {
            id: -1,
            callsign: null,
            klass: null,
            hexid: -1,
            facing: 0
        }
    ],
    
    shipYard: {
        id_gen: 1
    }
};

const g_Debug = false;

// modes
// * default
// * place
// * move

var g_UIState =
{
    mouse: { x: 0, y: 0 },
    viewport: { x: 0, y: 0, width: 1000, height: 1000 },
    selectedHex: null,
    selectedShip: null,
    events: 0,
    tools_mode: "place"
};

var g_Scale = 1;

function refreshUi()
{
    window.requestAnimationFrame(draw);
}

function uiUpdateButtons(buttonLabel)
{
}

function updateStatusLine(value)
{
    var status_line = document.getElementById("status-line");
    status_line.textContent = value;
}

function updateStatusLine2(value0, value1)
{
    //  jiv TODO: seems like a perfect place for a template
    let statusLine = document.getElementById("status-line");
    statusLine.innerHTML = "";
    
    let divLeft = document.createElement("div");
    divLeft.setAttribute("style", "float: left; padding-right: 89px;");
    divLeft.appendChild(document.createTextNode(value0));
    
    let divRight = document.createElement("div");
    divRight.setAttribute("style", "float: right;");
    
    let button0 = document.createElement("button");
    button0.setAttribute("id", "commit");
    button0.appendChild(document.createTextNode("Commit"));
    
    let button1 = document.createElement("button");
    button1.setAttribute("id", "undo");
    button1.appendChild(document.createTextNode("Undo"));
    
    let divStatus = document.createElement("div");
    divStatus.appendChild(document.createTextNode(value1));
    
    statusLine.appendChild(divLeft);
    statusLine.appendChild(divRight);
    divRight.appendChild(button0);
    divRight.appendChild(button1);
    statusLine.appendChild(divStatus);
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
            let status = " MOVE: select ship";
            if (g_UIState.selectedShip)
                status = " MOVE: select next tile and orientation";
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

function addShip(gamestate, hex, facing)
{
    // add ui
    let image = document.createElementNS(svgns, "image");
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", "NCC1701.png");
    image.setAttribute("width",200);
    image.setAttribute("height",200);
    image.setAttribute("x",-100);
    image.setAttribute("y",-100);
    image.setAttribute("transform",`rotate(${60 * facing} 0 0)`);
    
    hex.parentElement.appendChild(image);
    
    // add simulation
    let id = gamestate.shipYard.id_gen++;
    let shipInstance = new Ship(id, 'ncc1701', 'heavy cruiser', hex.id, facing);
    gamestate.ships.push(shipInstance);
}

function getDirectionFacing(sourceHexId, targetHexId)
{
    let q0 = sourceHexId<<16>>16;
    let r0 = sourceHexId>>16;
    let s0 = -q0 - r0;
    
    let q1 = targetHexId<<16>>16;
    let r1 = targetHexId>>16;
    let s1 = -q1 - r1;
    
    let facing = -1;
    
    if (q0 == q1)
    {
        if (r0 < r1)
            facing = 3;
        else
            facing = 0;
    }
    
    if (r0 == r1)
    {
        if (q0 < q1)
            facing = 2;
        else
            facing = 5;
    }
    
    if (s0 == s1)
    {
        if (r0 < r1)
            facing = 4;
        else
            facing = 1;
    }
    
    return facing;
}

const kMoveIneligible = 0x0;
const kMovePossible   = 0x1;
const kMoveTurn       = 0x2;
const kMoveSlipStream = 0x4;
function isShipMoveEligible(gamestate, sourceHexId, targetHexId, ship_facing)
{
    let dist = distByHexId(sourceHexId, targetHexId);
    if (dist > 1)
        return kMoveIneligible;
    
    let direction = getDirectionFacing(sourceHexId, targetHexId);
    switch (ship_facing - direction)
    {
    case 0:
        {
            return kMovePossible;
        }
    case -5:
    case 5:
    case -1:
    case 1:
        {
            return kMoveSlipStream|kMoveTurn|kMovePossible;
        }
    default:
        {
            break;
        }
    }

    return kMoveIneligible;
}

function getShipIndexByHexId(gamestate, hexId)
{
    // todo: multiple ships same hex
    for (let i=0,ni=gamestate.ships.length; i<ni; ++i)
    {
        if (gamestate.ships[i].hexid == hexId)
            return i;
    }
    return -1;
}

function getShipIndexByHex(gamestate, hex)
{
    return getShipIndexByHexId(gamestate, hex.id);
}

function getShipIndexById(gamestate, shipId)
{
    for (let i=0,ni=gamestate.ships.length; i<ni; ++i)
    {
        if (gamestate.ships[i].id == shipId)
            return i;
    }
    return -1;
}

function unselectByShip(gamestate)
{
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
            addShip(gamestate, hex, 0);
            
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
                let shipInstance = gamestate.ships[index];
                
                if (g_UIState.selectedShip)
                    unselectByShip(gamestate, g_UIState.selectedShip);
                
                g_UIState.selectedShip = shipInstance.id;
                shipInstance.hexid = hex.id;
                
                g_UIState.selectedHex = null;
                
                hex.setAttribute("class", "hex-selected-secondary");
                
                refreshUi();
            }
            else if (g_UIState.selectedShip)
            {
                let index = getShipIndexById(gamestate, g_UIState.selectedShip);
                let shipInstance = gamestate.ships[index];
                
                let shipFacing = shipInstance.facing;
                let previousHexId = shipInstance.hexid;
                const eligibility = isShipMoveEligible(gamestate, previousHexId, hex.id, shipFacing);
                if (eligibility != kMoveIneligible)
                {
                    if (g_UIState.selectedHex)
                        g_UIState.selectedHex.setAttribute("class", "hex-unselected");
                    g_UIState.selectedHex = hex;
                    hex.setAttribute("class", "hex-selected");
                }
                
                refreshUi();
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
    {
        let num_cols = 10;
        let num_rows = 10;
        
        // add per-hex callbacks
        for (let r=-num_rows,nr=num_rows; r<nr; ++r)
        {
            for (let c=-(num_cols/2-1), nc=(num_cols/2-2); c<=nc; ++c)
            {
                const qp = 2*c + (r&1);
                const rp = (r - (r&1))/2 - c;
                const id = (rp<<16) | (qp&0xffff);

                let polygon = document.getElementById(id);
                let g = polygon.parentElement;
                g.addEventListener('mouseup', (e) =>
                                   {
                                       onHexClick(g_GameState, polygon, e);
                                   }, false);
            }
        }

        // add map container callbacks
        {
            let isDragging = false;
            let startX, startY, currentX, currentY;            

            let svg = document.getElementById("map-container");        
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
    }
    
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
