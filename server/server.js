let express = require("express");

const kFacingN  = 0;
const kFacingNE = 1;
const kFacingSE = 2;
const kFacingS  = 3;
const kFacingSW = 4;
const kFacingNW = 5;

let app = express();
app.listen(3000, () => {
    console.log("Server running on port 3000");
});

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
    constructor(id, player_id, hex_id, facing)
    {
        this.game_id = id;
        this.player_id = player_id;
        this.hex_id = hex_id;
        this.facing = facing;
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

function newShip(id, player_id, hex_id, facing)
{
    let ship = new Ship(id, player_id, hex_id, facing);
    s_ships.push(ship);
}

app.use("/", express.static('..'));
app.use(express.json());

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
    
    newShip(game_id, player_id, hex_id, facing);
    
    res.json({ "ship_id": ship_id});
});

// 
app.post("/getstate", (req, res, arg) => {
    let game_id = req.body.game_id;
    
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
            if (s_ships[i].game_id == game_id)
                ships.push(s_ships[i]);
        }
    }
    
    let game_state = {
        players: players,
        ships: ships
    };
    
    res.json({ "game_state": game_state});
});

// debug
let debug_player_id0 = s_player_id++;
let debug_player_id1 = s_player_id++;
newPlayer("jvalenzu", debug_player_id0);
newPlayer("ignacio", debug_player_id1);

let debug_game_id = s_game_id++;
newGame(debug_game_id, debug_player_id0, debug_player_id1);
newShip(debug_game_id, debug_player_id0, 196606, kFacingN);
