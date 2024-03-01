// jiv todo
//
// * need image dimension information associated ship pieces like NCC1701.png in order to
//   avoid hard coded tweaks in code
//
// * have a ship playable card in addition to starmap
// * zoom controls
//
// * different context specific "modes"
//   - commit action
//
// * add mode selection
// * update shipcard display with ship info
//
// ship instances
// * reference to ship class
// * subimpulses since last turn
// * subimpulses since last slip
// * base speed this turn
// * acceleration this impulse
//
// undo/redo
//
// associating ui counters with shipcards with other state is messy

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

import { ref } from 'vue';
const g_TurnStatus = ref("Hello, Turn");
const g_ContextMessage = ref("Context Message");
const g_DebugOptions = ref([]);
const g_ActionButtons = ref([]);
const kBuildVersion = 6;
const kSvgNs = "http://www.w3.org/2000/svg";

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

const kDebugOptions = [
    { "text": "None", "value": null },
    { "text": "Reset", "value": "debugReset" },
    { "text": "Move Mode", "value": "debugSetMoveMode" },
    { "text": "UI 1 Damage on Shield", "value": "debugUiDamageOnShield" },
    { "text": "UI Set unassigned damage shield", "value": "debugUiSetUnassignedDamageShield" },
    { "text": "Server Set unassigned damage shield", "value": "debugServerSetUnassignedDamageShield" }
];

let g_DebugBinding = {};


class UiShip
{
    constructor(id, callsign, klass, hexid, facing)
    {
        this.id = id;
        this.callsign = callsign;
        this.klass = klass;
        this.hexid = hexid;
        this.facing = facing;
        
        this.unassigned_damage = [];
        this.assigned_damage = [];
    }
};

class UnassignedDamageElement
{
    constructor(system_name, damage_points, ship_id)
    {
        this.system_name = system_name;
        this.damage_points = damage_points;
        this.ship_id = ship_id;
    }
};

class PendingDamageAssignmentElement
{
    constructor(system_name, element_index, uuid)
    {
        this.system_name = system_name;
        this.index = element_index;
        this.uuid = uuid;
    }
};

class UiPatchElement
{
    constructor(label, onpress, ...args)
    {
        this.label = label;
        this.onpress = onpress;
        this.args = args;
        
        this.enabled = (state) => { return true; };
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
    game_id: 1,
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
    updateShip: null,
    unassignedDamage: [],
    pendingAssignDamage: []
};

const g_Debug = false;

// modes
// * default
// * place
// * move
// * assign-damage

let g_UIState =
{
    mouse: { x: 0, y: 0 },
    viewport: { x: 0, y: 0, width: 1000, height: 1000 },
    selectedHex: null,
    altSelectedHex: null,
    tools_mode: "move",
    patch: null,
    currentShipId: -1
};

function evaluateDeltaState(gamestate, deltaState)
{
    if ("ships" in deltaState.add && deltaState.add.ships)
    {
        for (let i=0,ni=deltaState.add.ships.length; i<ni; ++i)
        {
            let shipState = deltaState.add.ships[i];
            let hex = document.getElementById(shipState.hex_id);
            addUiShip(g_LocalGameState, shipState, hex);
        }
    }
    
    if ("ships" in deltaState.remove && deltaState.remove.ships)
    {
        for (let i=0,ni=deltaState.remove.ships.length; i<ni; ++i)
        {
            /*
             jiv fixme
             let shipPrius = deltaState.remove.ships[i];
             let hex = document.getElementById(shipPrius.hex_id);
             addUiShip(g_LocalGameState, hex, shipPrius.facing);
             */
        }
    }
    
    if ("ships" in deltaState.change && deltaState.change.ships)
    {    
        for (let i=0,ni=deltaState.change.ships.length; i<ni; ++i)
        {
            let serverShip = deltaState.change.ships[i];
            changeUiShip(g_LocalGameState, serverShip);
        }
    }
    
    // selectively change tools mode
    if (g_UIState.tools_mode != 'assign-damage' && gamestate.unassignedDamage.length > 0)
        uiSetAssignDamageMode();
}

function swapShipCard(serverShip)
{
    let ship_id = serverShip.ship_id;
    
    if (g_UIState.currentShipId != ship_id)
    {
        g_UIState.currentShipId = ship_id;
        
        let ship_info_container = document.getElementById("ship-info-container");
        for (let c=0,nc=ship_info_container.children.length; c<nc; ++c)
        {
            let element = ship_info_container.children[c];
            if (element.type == "image/svg+xml")
            {
                if (element.id == `ship-card-${ship_id}`)
                {
                    // hide other ship cards
                    element.setAttribute("class", "enabled");
                }
                else
                {
                    // hide other ship cards
                    element.setAttribute("class", "disabled");
                }
            }
        }

        // mark damage on card
        setDamage(serverShip);
    }
}

// take a game state object from the server and apply it
function evaluateGameState(localGameState, serverGameState)
{
    let delta = generateDelta(localGameState.snapshot, serverGameState);
    evaluateDeltaState(localGameState, delta);
    localGameState.snapshot = serverGameState;
}

function serverCall(url, data, callback)
{
    const kUrl = import.meta.env.VITE_API_URL+url;
    let xhr = new XMLHttpRequest();
    xhr.open("POST", kUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200)
        {
            let response = JSON.parse(xhr.response);
            callback(response);
        }
    };
    
    let params = deepCopy(data);
    params.game_id = g_LocalGameState.game_id;
    xhr.send(JSON.stringify(params));
}


function serverMoveShip(data)
{
    serverCall("/moveship", data,
               (response) =>
               {
                   if (response.status != "error")
                   {
                       evaluateDeltaState(g_LocalGameState, response.return);
                   }
                   
                   g_UIState.tools_mode = "default";
                   
                   // clean up ui state
                   uiClearSelectedHex(g_UIState);
                   uiUpdateButtons(null);
                   
                   refreshUi();
               });
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
    let to_remove = keysPresentInFirstButNotSecond(a, b);
    
    for (let i=0,ni=to_add.length; i<ni; ++i)
    {
        let key = to_add[i];
        ret.add[key] = b[key];
    }
    
    ret.remove = to_remove;
    ret.change = to_mutate;
    
    return ret;
};

function refreshUi()
{
    window.requestAnimationFrame(draw);
}

function uiClearSelectedHex(uistate)
{
    if (uistate.selectedHex)
    {
        uistate.selectedHex.setAttribute("class", "hex-unselected");
        uistate.selectedHex = null;
    }
    
    if (uistate.altSelectedHex)
    {
        uistate.altSelectedHex.setAttribute("class", "hex-unselected");
        uistate.altSelectedHex = null;
    }
}

function uiUpdateButtons(patch)
{
    g_UIState.patch = patch;
}

function changeDebugOptions(event)
{
    switch (event.target.selectedIndex)
    {
        default:
        {
            const func_name = kDebugOptions[event.target.selectedIndex].value;
            const func = g_DebugBinding[func_name];
            if (func)
            {
                let ret = func();
                if (ret)
                    event.target.selectedIndex = 0;
            }
            
            break;
        }
    }
}

function applyToShipcard(func, id=-1)
{
    let ship_info_container = document.getElementById("ship-info-container");
    for (let c=0,nc=ship_info_container.children.length; c<nc; ++c)
    {
        let embed = ship_info_container.children[c];
        if ((id != -1) && embed.id != `ship-card-${id}`)
            continue;
        
        let svg = embed.getSVGDocument();
        if (svg && svg.readyState == "complete")
        {
            let shipCard = svg.getElementById('svg1974');
            func(shipCard, embed);
        }
        else
        {
            let previous_callback = null;
            if (embed.onload)
                previous_callback = embed.onload;

            embed.onload = (event) => {
                if (previous_callback)
                    previous_callback(event);
                
                let svg = event.target.getSVGDocument();
                let shipCard = svg.getElementById('svg1974');
                func(shipCard, event.target);
            };
        }
    }
}

function debugUiDamageOnShield()
{
    applyToShipcard((shipCard) =>
    {
        let shieldBox0 = shipCard.querySelector('#shield1_0');
        shieldBox0.setAttribute('class', 'shield-damaged');
    });
    
    return true;
}

function resetUiDamageOnShield()
{
    applyToShipcard((shipCard) =>
    {
        let shieldBox0 = shipCard.querySelector('#shield1_0');
        shieldBox0.setAttribute('class', 'shield-undamaged');
    });
}

function serverAssignDamage()
{
    let assign_damage_data = {
        "ship_id": g_UIState.currentShipId,
        "pending_assign_damage": g_LocalGameState.pendingAssignDamage
    };
    
    serverCall("/assign_damage", assign_damage_data,
               (response) =>
               {
                   if (response.status != "error")
                   {
                       evaluateGameState(g_LocalGameState, response.game_state);
                       uiSetModeByGameState();
                       
                       refreshUi();
                   }
               });
    
    return false;
}

function uiSetModeByGameState()
{
    let old_mode = g_UIState.tools_mode;
    
    if (g_LocalGameState.unassignedDamage.length > 0)
        uiSetAssignDamageMode();
    
    g_UIState.tools_mode = 'default';
    if (g_UIState.tools_mode != old_mode)
        refreshUi();
}

function uiSetAssignDamageMode()
{
    let patch = [];
    {
        let pe = new UiPatchElement('Commit', serverAssignDamage, null);
        pe.enabled = (state) => getUnassignedDamagePoints(g_LocalGameState)==0;
        patch.push(pe);
    }
    
    g_UIState.tools_mode = "assign-damage";
    uiUpdateButtons(patch);
    refreshUi();    
}

function debugUiSetUnassignedDamageShield()
{
    let ship_id = g_LocalGameState.ships[0].ship_id;
    if (ship_id >= 0)
    {
        let e = new UnassignedDamageElement("shield1", 4);
        g_LocalGameState.unassignedDamage.push(e);
        uiSetAssignDamageMode();
    }
    
    return false;
}

function resetUiSetUnassignedDamage()
{
    console.log("resetUiSetUnassignedDamage");
}

function debugServerSetUnassignedDamageShield()
{
    let ship_id = g_LocalGameState.ships[0].id;
    for (let i=1, ni=g_LocalGameState.ships.length; ship_id<0 && i<ni; ++i)
        ship_id = g_LocalGameState.ships[i].id;
    
    let assign_damage_data = {
        "ship_id": ship_id,
        "system_name": "shield1",
        "damage_points": 4
    };
    
    serverCall("/debug_set_assign_damage", assign_damage_data,
               (response) =>
               {
                   if (response.status != "error")
                   {
                       evaluateDeltaState(g_LocalGameState, response.return);
                       
                       refreshUi();
                   }
               });
    
    return false;
}

function resetServerSetUnassignedDamage()
{
    console.log("resetSetUnassignedDamage");
}

function debugReset()
{
    for (let key in g_DebugBinding)
    {
        if (key.endsWith("_reset"))
        {
            let func = g_DebugBinding[key];
            if (func)
                func();
        }
    }
    
    return true;
}

function debugSetMoveMode()
{
    g_UIState.tools_mode = "move";
    
    uiUpdateButtons(null);
    refreshUi();
}

function debugInit()
{
    g_DebugOptions.value = kDebugOptions;
    g_DebugBinding["debugReset"] = debugReset;
    g_DebugBinding["debugSetMoveMode"] = debugSetMoveMode;
    g_DebugBinding["debugUiDamageOnShield"] = debugUiDamageOnShield;
    g_DebugBinding["debugUiDamageOnShield_reset"] = resetUiDamageOnShield;
    g_DebugBinding["debugUiSetUnassignedDamageShield"] = debugUiSetUnassignedDamageShield;
    g_DebugBinding["debugUiSetUnassignedDamageShield_reset"] = resetUiSetUnassignedDamage;
    g_DebugBinding["debugServerSetUnassignedDamageShield"] = debugServerSetUnassignedDamageShield;
    g_DebugBinding["debugServerSetUnassignedDamageShield_reset"] = resetServerSetUnassignedDamage;
}

function updateStatusLines(value0, value1, patches=null)
{
    g_TurnStatus.value = value0;
    g_ContextMessage.value = value1;
    
    let buttons = [];
    if (patches)
    {
        for (let i=0,ni=patches.length; i<ni; ++i)
        {
            let patch = patches[i];
            let label = patch.label;
            let func = patch.onpress;
            let button_data = {label: label, id: label, onclick: () => { func(...patch.args); }};
            
            button_data.enabled = patch.enabled(g_LocalGameState);
            buttons.push(button_data);
        }
    }
    
    g_ActionButtons.value = buttons;
}

function getUnassignedDamagePoints(state)
{
    let damage_points_by_system = {};
    
    for (let i=0,ni=state.unassignedDamage.length,unassignedDamage = state.unassignedDamage; i<ni; ++i)
    {
        let ude = unassignedDamage[i];
        if (!(ude.system_name in damage_points_by_system))
            damage_points_by_system[ude.system_name] = 0;
        
        damage_points_by_system[ude.system_name] += ude.damage_points;
    }
    
    // first collect the pending damage to be assigned
    for (let i=0,ni=state.pendingAssignDamage.length; i<ni; ++i)
        damage_points_by_system[state.pendingAssignDamage[i].system_name]--;
    
    let unassigned_damage_points = 0;
    for (let system in damage_points_by_system)
        unassigned_damage_points += damage_points_by_system[system];
    
    return unassigned_damage_points;
}

function getEligibleUnassignedDamageElement(system_name)
{
    // first collect the pending damage to be assigned
    let pending_damage = 0;
    for (let i=0,ni=g_LocalGameState.pendingAssignDamage.length; i<ni; ++i)
    {
        if (g_LocalGameState.pendingAssignDamage[i].system_name == system_name)
            pending_damage++;
    }
    
    for (let i=0,ni=g_LocalGameState.unassignedDamage.length,unassigned_damage_points = 0; i<ni; ++i)
    {
        let ude = g_LocalGameState.unassignedDamage[i];
        if (ude.system_name == system_name)
        {
            let temp = unassigned_damage_points + ude.damage_points;
            if (temp > pending_damage)
                return ude;
            unassigned_damage_points = temp;
        }
    }
    
    return null;
}

function updateGameStatus(state)
{
    let turn = state.turn;
    let impulse = state.turn;
    let subimpulse = state.turn;
    let prefix = `Turn: ${turn} Impulse: ${impulse} Subimpulse: ${subimpulse}`;
    
    switch (g_UIState.tools_mode)
    {
        default:
        {
            updateStatusLines(prefix, `Mode: ${g_UIState.tools_mode}`);
            break;
        }
    case "assign-damage":
        {
            let unassigned_damage_points = getUnassignedDamagePoints(g_LocalGameState);
            updateStatusLines(prefix, `Assign Damage ${unassigned_damage_points}`, g_UIState.patch);
            break;
        }
    case "move":
        {
            if (g_UIState.patch)
            {
                updateStatusLines(prefix, "Confirm Action", g_UIState.patch);
            }
            else
            {
                let status = " MOVE: select ship";
                if (state.updateShip)
                    status = " MOVE: select next tile and orientation";
                
                updateStatusLines(prefix, status);
            }
            
            break;
        }
    case "place":
        {
            let status = ` PLACE SHIP: select tile and orientation`;
            updateStatusLines(prefix, status);
            
            break;
        }
    }
}

function selectUiShip()
{
}

function addUiShip(gamestate, serverShip, hex)
{
    // add simulation
    let shipInstance = new UiShip(serverShip.ship_id, 'ncc1701', 'heavy cruiser', hex.id, serverShip.facing);
    gamestate.ships.push(shipInstance);
    
    // add ui
    let image = document.createElementNS(kSvgNs, "image");
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", "assets/counters/NCC1701.png");
    image.setAttribute("id", `ship-image-${serverShip.ship_id}`);
    image.setAttribute("width",200);
    image.setAttribute("height",200);
    image.setAttribute("x",-100);
    image.setAttribute("y",-100);
    
    hex.parentElement.appendChild(image);
    
    {
        let embed = document.createElement("embed");
        embed.setAttribute("id", `ship-card-${serverShip.ship_id}`);
        embed.setAttribute("src", "assets/ships/FederationHeavyCruiser.svg");
        embed.setAttribute("type", "image/svg+xml");
        
        let ship_info_container = document.getElementById("ship-info-container");
        ship_info_container.appendChild(embed);
        
        uiAddShipcardEventHandlers(serverShip.ship_id);
    }
    
    changeUiShip(g_LocalGameState, serverShip);
    
    if (g_UIState.currentShipId == -1)
        swapShipCard(serverShip);
}

function changeUiShip(gamestate, serverShip)
{
    if (!("hex_id" in serverShip) || !("ship_id" in serverShip))
    {
        throw new Error("serverShip missing fields: " + JSON.stringify(serverShip));
    }
    
    let newHexId = serverShip.hex_id;
    let ship_id = serverShip.ship_id;
    
    let newHex = document.getElementById(newHexId);
    let shipInstance = getShipById(gamestate, ship_id);
    let oldHexId = shipInstance.hexid;
    let oldHex = document.getElementById(oldHexId);
    
    let image = document.getElementById(`ship-image-${ship_id}`);
    image.setAttribute("transform",`rotate(${60 * serverShip.facing} 0 0)`);
    
    if (oldHex != newHex)
    {
        oldHex.parentElement.removeChild(image);
        newHex.parentElement.appendChild(image);
    }
    
    shipInstance.facing = serverShip.facing;
    shipInstance.hexid = serverShip.hex_id;
    
    let unassigned_damage_set = {};
    for (let i=0; i<gamestate.unassignedDamage.length; ++i)
        unassigned_damage_set[gamestate.unassignedDamage[i]] = true;
    
    if (!(serverShip.uuid in unassigned_damage_set))
    {
        unassigned_damage_set[serverShip.uuid] = 1;
        
        for (let i=0; i<serverShip.unassigned_damage.length; ++i)
        {
            let ude = serverShip.unassigned_damage[i];
            gamestate.unassignedDamage.push(ude);
        }
    }
}

function setDamage(serverShip)
{
    let func = (shipCard, serverShip) =>
            {
                for (let i=0,ni=serverShip.assigned_damage.length; i<ni; ++i)
                {
                    let ad = serverShip.assigned_damage[i];
                    let system_name = ad.system_name;
                    let index = ad.index;
                    
                    let system_box = shipCard.querySelector(`#${system_name}_${index}`);
                    if (system_box)
                    {
                        // jiv fixme
                        //   should just add damage class and it should map to shield-damaged
                        if (system_name == "shield1")
                            system_box.setAttribute('class', 'shield-damaged');
                    }
                }
            };
    
    applyToShipcard((shipCard) => func(shipCard, serverShip), serverShip.ship_id);
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
const kMoveStraight   = 0x1;
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
            return kMoveStraight;
        }
    case -5:
    case 5:
    case -1:
    case 1:
        {
            return kMoveSlipStream|kMoveTurn;
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

function getShipById(gamestate, shipId)
{
    for (let i=0,ni=gamestate.ships.length; i<ni; ++i)
    {
        if (gamestate.ships[i].id == shipId)
            return gamestate.ships[i];
    }
    
    return null;
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
            // jiv fixme: /addship to update server state
            let ship_id = g_AssetData.shipYard.id_gen++;
            
            addUiShip(gamestate, ship_id, 0, hex);
            
            swapShipCard({ship_id: ship_id});
            
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
                
                gamestate.updateShip = deepCopy(gamestate.ships[index]);
                gamestate.updateShip.hexid = hex.id;
                g_UIState.altSelectedHex = hex;
                hex.setAttribute("class", "hex-selected-secondary");
                
                uiUpdateButtons(null);
                
                swapShipCard(gamestate.ships[index]);
            }
            else if (gamestate.updateShip)
            {
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
                        shipSlipStream.hex_id = hex.id;
                        
                        let pe = new UiPatchElement('SlipStream', serverMoveShip, shipSlipStream);
                        patch.push(pe);
                    }
                    if (kMoveTurn & eligibility)
                    {
                        let shipTurn = deepCopy(shipInstance);
                        shipTurn.hex_id = hex.id;
                        shipTurn.facing = getDirectionFacing(previousHexId, hex.id);
                        
                        let pe = new UiPatchElement('Turn', serverMoveShip, shipTurn);
                        patch.push(pe);
                    }
                    if (kMoveStraight & eligibility)
                    {
                        let shipMove = deepCopy(shipInstance);
                        shipMove.hex_id = hex.id;
                        
                        let pe = new UiPatchElement('Move', serverMoveShip, shipMove);
                        patch.push(pe);
                    }
                    
                    uiUpdateButtons(patch);
                }
            }
            
            refreshUi();
            
            break;
        }
    default:
        {
            break;
        }
    }
}

function uiAddEventHandlers()
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

function uiAddShipcardEventHandlers(id)
{
    applyToShipcard((shipCard, parent) =>
                    {
                        for (let i=0,ni=30; i<ni; ++i)
                        {
                            let shieldBox = shipCard.querySelector(`#shield1_${i}`);
                            shieldBox.addEventListener('click', (event) =>
                                                       {
                                                           let id = i;
                                                           if (g_UIState.tools_mode == "assign-damage")
                                                           {
                                                               let klass = event.target.getAttribute('class');
                                                               if (klass == 'shield-undamaged')
                                                               {
                                                                   let get_eligible_unassigned_damage_element = getEligibleUnassignedDamageElement('shield1');
                                                                   if (get_eligible_unassigned_damage_element)
                                                                   {
                                                                       let pdae = new PendingDamageAssignmentElement('shield1', id, get_eligible_unassigned_damage_element.uuid);
                                                                       g_LocalGameState.pendingAssignDamage.push(pdae);
                                                                       
                                                                       event.target.setAttribute('class', 'shield-damaged');
                                                                       
                                                                       // fixme - need this to update status bar, maybe make reactive?
                                                                       uiSetAssignDamageMode();
                                                                       refreshUi();
                                                                   }
                                                               }
                                                           }
                                                       });
                        }
                    }, id);
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
    const kUrl = import.meta.env.VITE_API_URL+"/getstate";
    let xhr = new XMLHttpRequest();
    xhr.open("POST", kUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200)
        {
            let gamestate = JSON.parse(xhr.response).game_state;
            evaluateGameState(g_LocalGameState, gamestate);
            uiAddEventHandlers();
        }
    };
    xhr.send(JSON.stringify({
        game_id: g_LocalGameState.game_id
    }));
    
    debugInit();
    
    console.log("version: " + kBuildVersion);
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

export default
{
    g_TurnStatus,
    g_ContextMessage,
    g_DebugOptions,
    g_ActionButtons,
    changeDebugOptions
};
