// js2-mode

let express = require("express");
let cors = require("cors");

const kFacingN  = 0;
const kFacingNE = 1;
const kFacingSE = 2;
const kFacingS  = 3;
const kFacingSW = 4;
const kFacingNW = 5;

function validate_system(serverShip)
{
    let systems = { };
    
    for (let adi in serverShip.assigned_damage)
    {
        let ad = serverShip.assigned_damage[adi];
        if (ad.system_name in systems)
        {
            let system = systems[ad.system_name];
            if (ad.index in system)
                throw new Error(`Duplicate damage index ${ad.index} in ${ad.system_name}`);
        }
    }
}

function genuuid()
{
    const hexdigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let cluster = "";
    for (let i=0; i<32; ++i)
    {
        let t0 = Math.trunc(Math.random() * 16);
        cluster += hexdigits[t0];
    }
    return cluster;
}

// jiv fixme: move to shared module
class UnassignedDamageElement
{
  constructor(system_name, damage_points)
  {
      this.system_name = system_name;
      this.damage_points = damage_points;
      this.uuid = genuuid();
  }
};

class AssignedDamageElement
{
  constructor(system_name, index, uuid)
  {
      this.system_name = system_name;
      this.index = index;
      this.uuid = uuid;
  }
};

class Game
{
  constructor(id, player0, player1, player2, player3)
  {
    this.game_id = id;
    this.player0 = player0;
    this.player1 = player1;
    this.player2 = player2;
    this.player3 = player3;
  }
};

class Ship
{
  constructor(game_id, ship_id, player_id, hex_id, facing)
  {
    this.game_id = game_id;
    this.ship_id = ship_id;
    this.player_id = player_id;
    this.hex_id = hex_id;
    this.facing = facing;
    
    this.unassigned_damage = [];
    this.assigned_damage = [];
  }
};

class Player
{
  constructor(name, player_id)
  {
    this.name = name;
    this.player_id = player_id;
  }
};

let s_player_id = 1;
let s_players = [];

let s_game_id = 1;
let s_games = [];

let s_ship_id = 1;
let s_ships = [];

function generateState(game_id) {
    let game = null;
    
    for (let i=0, ni=s_games.length; i<ni; ++i)
    {
        if (s_games[i].game_id == game_id)
            game = s_games[i];
    }
    
    let players = [];
    let ships = [];
    
    if (game)
    {
        for (let i=0, ni=s_players.length; i<ni; ++i)
        {
            let player_id = s_players[i].player_id;
            if (game.player0 == player_id || game.player1 == player_id || game.player2 == player_id || game.player3 == player_id)
                players.push(s_players[i]);
        }
        
        for (let i=0, ni=s_ships.length; i<ni; ++i)
        {
            let ship = s_ships[i];
            if (ship.game_id == game_id)
                ships.push(ship);
        }
    }
    
    return {
        players: players,
        ships: ships
    };
}

function generateDelta(add_players, add_ships,
                       remove_players, remove_ships, 
                       change_players, change_ships) {
    return {
        add: {
            players: add_players,
            ships: add_ships
        },
        remove: {
            players: remove_players,
            ships: remove_ships
        },
        change: {
            players: change_players,
            ships: change_ships
        }
    };
}

function newPlayer(name, player_id)
{
    let player = new Player(name, player_id);
    s_players.push(player);
}

function newGame(id, player0, player1, player2, player3)
{
    let game = new Game(id, player0, player1, player2, player3);
    s_games.push(game);
}

function newShip(game_id, ship_id, player_id, hex_id, facing)
{
    let ship = new Ship(game_id, ship_id, player_id, hex_id, facing);
    s_ships.push(ship);
}


  
let app = express();
app.listen(3000, () => {
    console.log("Server running on port 3000");
});

app.use("/", express.static('..'));
app.use(express.json());
app.use(cors());

// new game
app.post("/newgame", (req, res, arg) => {
    let game_id = s_game_id++;
    let player_ids = req.body.player_ids;
    newGame(game_id, ...player_ids);
    
    res.json({ "game_id": game_id});
});

// new ship
app.post("/newship", (req, res, arg) => {
    let ship_id = s_ship_id++;
    
    let game_id = req.body.game_id;
    let player_id = req.body.player_id;
    let hex_id = req.body.hex_id;
    let facing = req.facing;
    
    newShip(game_id, ship_id, player_id, hex_id, facing);
    
    res.json({ "ship_id": ship_id});
});

// move ship
app.post("/moveship", (req, res, arg) => {
    let data = {
        "status": "error"
    };
    
    let game_id = req.body.game_id;
    for (let i=0, ni=s_ships.length; i<ni; ++i)
    {
        let ship = s_ships[i];
        if (ship.game_id == game_id) {
            ship.hex_id = req.body.hex_id;
            ship.facing = req.body.facing;
            
            data.return = generateDelta(null, null, null, null, null, [ ship ]);
            data.status = "success";
            
            break;
        }
    }
    
    res.json(data);
});

// 
app.post("/getstate", (req, res, arg) => {
    let game_id = req.body.game_id;
    let game_state = generateState(game_id);
    res.json({ "game_state": game_state});
});

// 
app.post("/debug_set_assign_damage", (req, res, arg) => {
    let data = {
        "status": "error"
    };
    
    if ("system_name" in req.body && "damage_points" in req.body)
    {
        let game_id = req.body.game_id;
        let ship_id = req.body.ship_id;
        data.error_message = `couldn't find ship ${req.body.ship_id}`;
        
        for (let i=0, ni=s_ships.length; i<ni; ++i)
        {
            let ship = s_ships[i];
            if (ship.game_id == game_id && ship.ship_id == ship_id) {
                ship.unassigned_damage.push(new UnassignedDamageElement(req.body.system_name, req.body.damage_points));
                data.return = generateDelta(null, null, null, null, null, [ ship ]);
                data.status = "success";
                delete data.error_message;
                break;
            }
        }
    }
    else {
        data.error_message = `illformed req body: requires system_name and damage_points`;
    }
    
    res.json(data);
});

// 
app.post("/assign_damage", (req, res, arg) => {
    let data = {
        "status": "error"
    };
    
    if ("ship_id" in req.body && "pending_assign_damage" in req.body)
    {
        let game_id = req.body.game_id;
        let ship_id = req.body.ship_id;
        let pending_assign_damage = req.body.pending_assign_damage;
        
        data.error_message = `couldn't find ship ${req.body.ship_id}`;
        
        for (let i=0, ni=s_ships.length; i<ni; ++i)
        {
            let ship = s_ships[i];
            if (ship.game_id == game_id && ship.ship_id == ship_id) {
                // remove unassigned damage
                
                // first collect damage by uuid
                let u2p = {};
                for (let pi=0,npi=pending_assign_damage.length; pi<npi; ++pi)
                {
                    let uuid = pending_assign_damage[pi].uuid;
                    if (!(uuid in u2p))
                        u2p[uuid] = [];
                    
                    u2p[uuid].push(pending_assign_damage[pi]);
                }
                
                let ui=0;
                while (ui<ship.unassigned_damage.length)
                {
                    let ud = ship.unassigned_damage[ui];
                    if (ud.uuid in u2p)
                    {
                        let pending_assignment = u2p[ud.uuid].length;
                        if (pending_assignment > ud.damage_points)
                        {
                            // we've assigned too much damage - should we anticipate this?  and if so, how should we handle it?
                            data.error_message = `too much damage on ${ud.uuid}`;
                            res.json(data);
                            return;
                        }
                        else
                        {
                            ud.damage_points -= pending_assignment;
                            
                            // keep track of existing damage
                            for (let i=0,ni=u2p[ud.uuid].length; i<ni; ++i)
                            {
                                let pending_damage_assignment = u2p[ud.uuid][i];
                                ship.assigned_damage.push(new AssignedDamageElement(pending_damage_assignment.system_name,
                                                                                    pending_damage_assignment.index,
                                                                                    pending_damage_assignment.uuid));
                            }
                            
                            if (ud.damage_points == 0)
                                ship.unassigned_damage.splice(ui, 1);
                            else
                                ui++;
                        }
                    }
                    else
                    {
                        console.log(`Couldn't find uuid ${ud.uuid}`);
                        ui++;
                    }
                }
                
                data.return = generateDelta(null, null, null, null, null, [ ship ]);
                data.status = "success";
                delete data.error_message;
                break;
            }
        }
    }
    else {
        data.error_message = `illformed req body: requires ship_id and pending_assign_damage`;
    }
    
    let game_id = req.body.game_id;
    let game_state = generateState(game_id);
    res.json({ "game_state": game_state});
});


// debug
let debug_player_id0 = s_player_id++;
let debug_player_id1 = s_player_id++;
newPlayer("jvalenzu", debug_player_id0);
newPlayer("ignacio", debug_player_id1);

let debug_game_id = s_game_id++;
newGame(debug_game_id, s_ship_id++, debug_player_id0, debug_player_id1);
newShip(debug_game_id, s_ship_id++, debug_player_id0, 196606, kFacingN);
