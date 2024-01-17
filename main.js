const kSvgNs = "http://www.w3.org/2000/svg";

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

const kDebugColors = [
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

let g_AssetData =
{
    shipYard: {
        id_gen: 1
    }
};

let g_LocalGameState =
{
    snapshot: {},
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
    updateShip: null
};

const g_Debug = false;

// modes
// * default
// * place
// * move
// * move-finalize

var g_UIState =
{
    mouse: { x: 0, y: 0 },
    viewport: { x: 0, y: 0, width: 1000, height: 1000 },
    selectedHex: null,
    events: 0,
    tools_mode: "move",
    patch: null
};

var g_Scale = 1;

function serverMoveShip(a)
{
    console.log(`serverMoveShip ${a}`);
}

function numKeys(a)
{
    let count = 0;
    for (let key in a)
        count++;
    return count;
}

function keysPresentInFirstButNotSecond(a, b)
{
    let ret = [];
    for (let key in a)
    {
        if (!(key in b))
        {
            ret.push(key);
        }
    }
    return ret;
}

function keysPresentInBoth(a, b)
{
    let s = {};
    
    for (let key in a)
        s[key] = 1;
    
    let ret = [];
    for (let key in b)
    {
        if (key in s)
            ret.push(key);
    }
    return ret;
}

function doObjectsDiffer(a, b)
{
    let is_arraya = Array.isArray(a);
    let is_arrayb = Array.isArray(b);
    if (is_arraya != is_arrayb)
        return true;
    
    if (is_arraya && is_arrayb)
    {
        let lengtha = a.length;
        let lengthb = b.length;
        
        if (lengtha != lengthb)
            return true;
        
        for (let i=0,ni=a.length; i<ni; ++i)
        {
            let  element_differs = doObjectsDiffer(a[i], b[i]);
            if (element_differs)
                return true;
        }
        
        return false;
    }
    else
    {
        let is_objecta = typeof a === 'object';
        let is_objectb = typeof b === 'object';
        
        if (is_objecta != is_objectb)
            return true;
        
        if (is_objecta && is_objectb)
        {
            for (let key in a)
            {
                let value_differs = doObjectsDiffer(a[key], b[key]);
                if (value_differs)
                    return true;
            }
            
            for (let key in b)
            {
                let value_differs = doObjectsDiffer(a[key], b[key]);
                if (value_differs)
                    return true;
            }
            
            return false;
        }
        else
        {
            // simple case
            if (a != b)
                return true;
            
            return false;
        }
    }
}

function deepCopy(a, b)
{
    return JSON.parse(JSON.stringify(a));
}

function generateDelta(a, b)
{
    if (a === b)
        return {};
    
    let to_test = keysPresentInBoth(a, b);
    let to_mutate = [];
    
    for (let i=0,ni=to_test.length; i<ni; ++i)
    {
        let key = to_test[i];
        let objectsDiffer = doObjectsDiffer(a[key], b[key]);
        if (objectsDiffer)
            to_mutate[key] = deepCopy(b[key]);
    }
    
    let ret = {
        add: []
    };
    let to_add = keysPresentInFirstButNotSecond(b, a);
    let to_delete = keysPresentInFirstButNotSecond(a, b);
    
    for (let i=0,ni=to_add.length; i<ni; ++i)
    {
        let key = to_add[i];
        ret.add[key] = b[key];
    }
    
    ret.delete = to_delete;
    ret.change = to_mutate;
    
    return ret;
};

function refreshUi()
{
    window.requestAnimationFrame(draw);
}

function uiUpdateButtons(patch)
{
    g_UIState.patch = patch;
}

function updateStatusLine(value)
{
    let status_line = document.getElementById("status-line");
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

function updateStatusLines(value0, patches)
{
    let statusLine = document.getElementById("status-line");
    statusLine.innerHTML = "";
    
    let divLeft = document.createElement("div");
    divLeft.setAttribute("style", "float: left; padding-right: 89px;");
    divLeft.appendChild(document.createTextNode(value0));
    
    let divRight = document.createElement("div");
    divRight.setAttribute("style", "float: right;");
    
    let buttons = [];
    for (let i=0,ni=patches.length; i<ni; ++i)
    {
        let patch = patches[i];
        let label = patch.shift();
        let func = patch.shift();
        let button = document.createElement("button");

        button.setAttribute("id", label);
        button.appendChild(document.createTextNode(label));
        button.addEventListener("click", () => { func(...patch); });
        
        buttons.push(button);
    }
    
    statusLine.setAttribute("style", "height: 40px;");    
    statusLine.appendChild(divLeft);
    statusLine.appendChild(divRight);
    
    for (let i=0,ni=buttons.length; i<ni; ++i)
        divRight.appendChild(buttons[i]);
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
            if (state.updateShip)
                status = " MOVE: select next tile and orientation";
            
            updateStatusLine2(prefix, status);
            
            break;
        }
    case "move-finalize":
        {
            updateStatusLines(prefix, g_UIState.patch);
            
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
    // add simulation
    let id = g_AssetData.shipYard.id_gen++;
    let shipInstance = new Ship(id, 'ncc1701', 'heavy cruiser', hex.id, facing);
    gamestate.ships.push(shipInstance);
    
    // add ui
    let image = document.createElementNS(kSvgNs, "image");
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", "NCC1701.png");
    image.setAttribute("id", id);
    image.setAttribute("width",200);
    image.setAttribute("height",200);
    image.setAttribute("x",-100);
    image.setAttribute("y",-100);
    image.setAttribute("transform",`rotate(${60 * facing} 0 0)`);
    
    hex.parentElement.appendChild(image);
    
}

// take a game state object from the server and apply it
function evaluateGameState(serverGameState)
{
    let delta = generateDelta(g_LocalGameState.snapshot, serverGameState);
    
    for (let i=0,ni=delta.add.ships.length; i<ni; ++i)
    {
        let shipPrius = delta.add.ships[i];
        let hex = document.getElementById(shipPrius.hex_id);
        
        addShip(g_LocalGameState, hex, shipPrius.facing);
    }
    
    g_LocalGameState.snapshot = serverGameState;
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
                if (g_UIState.selectedHex)
                {
                    g_UIState.selectedHex.setAttribute("class", "hex-unselected");
                    g_UIState.selectedHex = null;
                }
                
                if (gamestate.updateShip)
                {
                    gamestate.updateShip.facing = gamestate.updateShip.facing + 1;
                    gamestate.updateShip.facing %= 6;
                }
                else
                {
                    gamestate.updateShip = JSON.parse(JSON.stringify(gamestate.ships[index]));
                    gamestate.updateShip.hexid = hex.id;
                    
                    hex.setAttribute("class", "hex-selected-secondary");
                }
                
                refreshUi();
            }
            else if (gamestate.updateShip)
            {
                let index = getShipIndexById(gamestate, g_UIState.selectedShip);
                let shipInstance = gamestate.updateShip;
                
                let shipFacing = shipInstance.facing;
                let previousHexId = shipInstance.hexid;
                const eligibility = isShipMoveEligible(gamestate, previousHexId, hex.id, shipFacing);
                if (eligibility != kMoveIneligible)
                {
                    if (g_UIState.selectedHex)
                        g_UIState.selectedHex.setAttribute("class", "hex-unselected");
                    g_UIState.selectedHex = hex;
                    hex.setAttribute("class", "hex-selected");
                    
                    let patch = [];
                    if (kMoveSlipStream & eligibility)
                    {
                        let shipSlipStream = deepCopy(shipInstance);
                        shipSlipStream.hexid = hex.id;
                        patch.push(['SlipStream', serverMoveShip, shipSlipStream]);;
                    }
                    if (kMoveTurn & eligibility)
                    {
                        let shipSlipStream = deepCopy(shipInstance);
                        shipSlipStream.hexid = hex.id;
                        patch.push(['Commit', serverMoveShip, shipSlipStream]);
                    }
                    
                    g_UIState.tools_mode = "move-finalize";
                    uiUpdateButtons(patch);
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

function addCallbacks()
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
                                       onHexClick(g_LocalGameState, polygon, e);
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
    
    g_LocalGameState.turn = 1;
    g_LocalGameState.impulse = 1;
    g_LocalGameState.subimpulse = 1;
    
    updateGameStatus(g_LocalGameState);
}

function draw()
{
    let svg = document.getElementById("svg");
    let v = g_UIState.viewport;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.width} ${v.height}`);
    
    updateGameStatus(g_LocalGameState);
    
    if (g_LocalGameState.updateShip)
    {
        let ship = g_LocalGameState.updateShip;
        let shipId = ship.id;
        let shipImage = document.getElementById(shipId);
        
        shipImage.setAttribute("transform",`rotate(${60 * ship.facing} 0 0)`);
    }
}

function init()
{
    const kUrl = "http://127.0.0.1:3000/getstate";
    let xhr = new XMLHttpRequest();
    xhr.open("POST", kUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200)
        {
            let gamestate = JSON.parse(xhr.response).game_state;
            evaluateGameState(gamestate);
            addCallbacks();
        }
    };
    xhr.send(JSON.stringify({
        game_id: 1
    }));    

}

init();

// function test()
// {
//     let empty = { };
//     let client0 = { a: 0, b: 1, c: [ "hello" ], d: [ "world" ]  };
//     let server0 = { b: 1, c: [ "hello" ], d: [ "sailor" ] };
//     let client1 = [ 1, 2, 3, 4 ];
//     let server1 = [ 1, 2, 3, 4 ];
//     let client2 = [ 1, 2, 3, 4 ];
//     let server2 = [ 1, 2, 3, 5 ];
// 
//     let delta0 = generateDelta(client0, server0);
//     console.log(delta0);
// 
//     let delta1 = generateDelta(client1, server1);
//     console.log(delta1);
// 
//     let delta2 = generateDelta(client2, server2);
//     console.log(delta2);
// }
// test();
