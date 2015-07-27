var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io").listen(server);
var url = require("url");
var path = require("path");
var cards = require("./cards.json");
var cardValues = require("./cardValues.json");
var game = require("./game.js")(cardValues);
var roomdata = {};
var playerSockets = {};

app.use(express.static(__dirname + "/public"));

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/public/index.html");
});

server.listen(8001);

var countPassFin = function(passfin) {
    var count = 0;
    for (var player in passfin) {
        if (passfin[player]) {
            count++;
        }
    }
    return count;
};

var startGame = function(room) {
    var players = Object.keys(roomdata[room].players);
    var hands = game.deal(cards.slice(), players.length);
    roomdata[room].started = 1;
    roomdata[room].prev = [];
    var hand = 0;
    for (var player in roomdata[room].players) {
        roomdata[room].players[player].hand = hands.hands[hand];
        roomdata[room].players[player].cardsleft = hands.hands[hand].length;
        roomdata[room].passed[player] = false;
        roomdata[room].finished[player] = false;
        hand++;
    }
    roomdata[room].turn = players[hands.start];
    io.sockets.to(room).emit("gamestart", {
        "success": true,
        "room": roomdata[room]
    });
    io.sockets.in(room).emit("systemmessage", roomdata[room].turn + " starts");
};

var nextTurn = function(room) {
    var found = false;
    var players = roomdata[room].order;
    var player = 0;
    while (!found || players[player] !== roomdata[room].turn) {
        if (players[player] === roomdata[room].turn) {
            found = true;
        }
        if (player === players.length - 1) {
            player = -1;
        }
        if (found) {
            if (!roomdata[room].settings.npap) {
                if (!roomdata[room].finished[players[player + 1]]) {
                    roomdata[room].turn = players[player + 1];
                    if (!roomdata[room].passed[players[player + 1]] && countPassFin(roomdata[room].passed) === roomdata[room].numPlayers - countPassFin(roomdata[room].finished) - 1) {
                        return false;
                    }
                    return true;
                }
            } else {
                if (!(roomdata[room].passed[players[player + 1]] || roomdata[room].finished[players[player + 1]])) {
                    roomdata[room].turn = players[player + 1];
                    if (countPassFin(roomdata[room].passed) === roomdata[room].numPlayers - countPassFin(roomdata[room].finished) - 1) {
                        return false;
                    }
                    return true;
                }
            }
        }
        player++;
    }
    return false;
};

var endGame = function(room) {
    roomdata[room].started = false;
    roomdata[room].prev = [];
    roomdata[room].passed = {};
    roomdata[room].finished = {};
    roomdata[room].turn = null;
    roomdata[room].winner = null;
    for (var player in roomdata[room].players) {
        roomdata[room].players[player].hand = [];
    }
};

var joinRoom = function(room, nick, socket) {
    socket.join(room);
    roomdata[room].numPlayers++;
    roomdata[room].players[nick] = {
        "nick": nick,
        "hand": [],
        "cardsleft": 0
    };
    roomdata[room].order.push(nick);
    playerSockets[socket.id] = {
        "room": room,
        "nick": nick,
        "role": "player"
    };
    socket.emit("roomrep", {
        "success": true,
        "nick": nick,
        "room": roomdata[room],
        "role": "player"
    });
    socket.broadcast.to(room).emit("gameupdate", roomdata[room]);
    socket.broadcast.to(room).emit("systemmessage", nick + " has joined the room");
};

var spectateRoom = function(room, nick, socket) {
    socket.join(room);
    roomdata[room].spectators.push(nick);
    playerSockets[socket.id] = {
        "room": room,
        "nick": nick,
        "role": "spectator"
    };
    socket.emit("roomrep", {
        "success": true,
        "nick": nick,
        "room": roomdata[room],
        "role": "spectator"
    });
    socket.broadcast.to(room).emit("gameupdate", roomdata[room]);
    socket.broadcast.to(room).emit("systemmessage", nick + " has joined the room");
};

var createRoom = function(room, nick, socket) {
    socket.join(room);
    roomdata[room] = {
        "id": room,
        "hostnick": nick,
        "players": {},
        "order": [],
        "spectators": [],
        "numPlayers": 1,
        "started": false,
        "prev": [],
        "turn": null,
        "passed": {},
        "finished": {},
        "winner": null,
        "settings": {
            "npap": false,
            "cbaf": false,
            "e3ds": true,
            "timer": 20
        }
    }
    roomdata[room].players[nick] = {
        "nick": nick,
        "hand": [],
        "cardsleft": 0
    };
    roomdata[room].order.push(nick);
    playerSockets[socket.id] = {
        "room": room,
        "nick": nick,
        "role": "player"
    };
    socket.emit("roomrep", {
        "success": true,
        "nick": nick,
        "room": roomdata[room],
        "role": "player"
    });
};

var leaveRoom = function(socket) {
    if (playerSockets[socket.id]) {
        var role = playerSockets[socket.id].role,
            room = playerSockets[socket.id].room,
            nick = playerSockets[socket.id].nick,
            turn = roomdata[room].turn === nick;
        if (role === "player") {
            socket.broadcast.to(room).emit("systemmessage", nick + " has left the room");
            if (turn) {
                nextTurn(room);
            }
            delete roomdata[room].passed[nick];
            delete roomdata[room].finished[nick];
            delete roomdata[room].players[nick];
            for (var a = 0; a < roomdata[room].order.length; a++) {
                if (roomdata[room].order[a] === nick) {
                    roomdata[room].order.splice(a, 1);
                    break;
                }
            }
            if (roomdata[room].winner === nick) {
                roomdata[room].winner = null;
            }
            if (roomdata[room].hostnick === nick) {
                for (var player in roomdata[room].players) {
                    roomdata[room].hostnick = player;
                    socket.broadcast.to(room).emit("systemmessage", "The new host is " + player);
                    break;
                }
            }
            roomdata[room].numPlayers--;
            if (roomdata[room].started && roomdata[room].numPlayers < 2) {
                endGame(room);
            }
            if (roomdata[room].numPlayers === 0) {
                if (roomdata[room].spectators.length !== 0) {
                    var newSocket, sockets = Object.keys(playerSockets);
                    for (var a = 0; a < sockets.length; a++) {
                        if (playerSockets[sockets[a]].nick === roomdata[room].spectators[0]) {
                            playerSockets[sockets[a]].role = "player";
                            newSocket = io.sockets.connected[sockets[a]];
                            break;
                        }
                    }
                    roomdata[room].players[roomdata[room].spectators[0]] = {
                        "nick": roomdata[room].spectators[0],
                        "hand": [],
                        "cardsleft": 0
                    };
                    roomdata[room].hostnick = roomdata[room].spectators[0];
                    roomdata[room].spectators.splice(0, 1);
                    roomdata[room].numPlayers++;
                    io.sockets.in(room).emit("systemmessage", "The new host is " + roomdata[room].hostnick);
                    newSocket.emit("updateRole", "player");
                } else {
                    delete roomdata[room];
                }
            }
        } else if (role === "spectator") {
            socket.broadcast.to(room).emit("systemmessage", nick + " has left the room");
            for (var a = 0; a < roomdata[room].spectators.length; a++) {
                if (roomdata[room].spectators[a] === nick) {
                    roomdata[room].spectators.splice(a, 1);
                    break;
                }
            }
        }
        socket.broadcast.to(room).emit("gameupdate", roomdata[room], turn);
        socket.leave(playerSockets[socket.id].room);
        delete playerSockets[socket.id];
    }
};

var getRole = function(nick, room) {
    var role, socketId = "";
    for (var playerSocket in playerSockets) {
        if (playerSockets[playerSocket].nick === nick && playerSockets[playerSocket].room === room) {
            role = playerSockets[playerSocket].role;
            socketId = playerSocket;
            break;
        }
    }
    if (socketId === "") {
        socket.emit("systemmessage", "That is not a valid player/spectator.");
        return false;
    }
    return {
        "socketId": socketId,
        "role": role
    };
}

var switchRole = function(socket, nick, room) {
    if (nick === roomdata[room].hostnick) {
        socket.emit("systemmessage", "Please transfer host privileges before using /switchrole to switch.");
        return;
    }
    var socketrole = getRole(nick, room);
    if (!socketrole) {
        return;
    }
    var role = socketrole.role,
        socketId = socketrole.socketId;
    switch (role) {
        case "spectator":
            if (roomdata[room].started) {
                socket.emit("systemmessage", "The game has started. Role changes can't be made.");
            } else if (roomdata[room].numPlayers > 3) {
                socket.emit("systemmessage", "There are no player spots left.");
            } else {
                roomdata[room].players[nick] = {
                    "nick": nick,
                    "hand": [],
                    "cardsleft": 0
                };
                roomdata[room].numPlayers++;
                for (var a = 0; a < roomdata[room].spectators.length; a++) {
                    if (roomdata[room].spectators[a] === nick) {
                        roomdata[room].spectators.splice(a, 1);
                        break;
                    }
                }
                roomdata[room].order.push(nick);
                playerSockets[socketId].role = "player";
                io.sockets.connected[socketId].emit("updateRole", "player");
                io.sockets.in(room).emit("gameupdate", roomdata[room]);
            }
            return;
        case "player":
            delete roomdata[room].players[nick];
            roomdata[room].numPlayers--;
            roomdata[room].spectators.push(nick);
            playerSockets[socketId].role = "spectator";
            io.sockets.connected[socketId].emit("updateRole", "spectator");
            io.sockets.in(room).emit("gameupdate", roomdata[room]);
            return;
    }
};

io.on("connection", function(socket) {
    socket.on("disconnect", function() {
        leaveRoom(socket);
    });
    socket.on("playerleave", function() {
        leaveRoom(socket);
    });
    socket.on("joinroom", function(roomreq) {
        var room = roomreq.room,
            nick = roomreq.nick;
        if (roomdata[room] === undefined) {
            socket.emit("roomrep", {
                "success": false,
                "error": "The room does not exist."
            });
        } else if (roomdata[room].numPlayers > 3) {
            socket.emit("prompt", {
                "action": "fullspectate",
                "room": room,
                "nick": nick,
                "socket": socket.id
            });
        } else if (roomdata[room].players[nick] !== undefined) {
            socket.emit("roomrep", {
                "success": false,
                "error": "This nick already exists in the room."
            });
        } else if (roomdata[room].started) {
            socket.emit("prompt", {
                "action": "startedspectate",
                "room": room,
                "nick": nick,
                "socket": socket.id
            });
        } else {
            if (playerSockets[socket.id]) {
                socket.emit("prompt", {
                    "action": "join",
                    "room": room,
                    "nick": nick,
                    "socket": socket.io
                });
                return;
            }
            joinRoom(room, nick, socket);
        }
    });
    socket.on("spectateroom", function(roomreq) {
        var room = roomreq.room,
            nick = roomreq.nick;
        if (roomdata[room] === undefined) {
            socket.emit("roomrep", {
                "success": false,
                "error": "The room does not exist."
            });
            return;
        }
        spectateRoom(room, nick, socket);
    });
    socket.on("createroom", function(roomreq) {
        var room = roomreq.room,
            nick = roomreq.nick;
        if (roomdata[room] !== undefined) {
            socket.emit("roomrep", {
                "success": false,
                "error": "The room already exists!"
            });
        } else {
            if (playerSockets[socket.id]) {
                socket.emit("prompt", {
                    "action": "create",
                    "room": room,
                    "nick": nick,
                    "socket": socket.id
                });
            } else {
                createRoom(room, nick, socket);
            }
        }
    });
    socket.on("prompt", function(prompt) {
        leaveRoom(io.sockets.connected[prompt.socket]);
        if (prompt.action === "join") {
            joinRoom(prompt.room, prompt.nick, io.sockets.connected[prompt.socket]);
        } else if (prompt.action === "spectate") {
            spectateRoom(prompt.room, prompt.nick, io.sockets.connected[prompt.socket]);
        } else if (prompt.action === "create") {
            createRoom(prompt.room, prompt.nick, io.sockets.connected[prompt.socket]);
        }
    });
    socket.on("message", function(messagedata) {
        var room = messagedata.room,
            nick = messagedata.nick,
            message = messagedata.message;
        if (message.charAt(0) !== '/') {
            io.sockets.in(room).emit("message", {
                "nick": nick,
                "msg": message
            });
        } else {
            message = message.split(" ");
            switch (message.length) {
                case 1:
                    switch (message[0]) {
                        case "/startgame":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].started) {
                                    socket.emit("gamestart", {
                                        "success": false,
                                        "error": "The game has already started."
                                    });
                                } else if (roomdata[room].numPlayers < 2) {
                                    socket.emit("gamestart", {
                                        "success": false,
                                        "error": "There aren't enough people. You must have at least 2 players."
                                    });
                                } else {
                                    startGame(room);
                                    io.sockets.in(room).emit("gamestart", {
                                        "success": true,
                                        "room": roomdata[room]
                                    });
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/pausegame":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].started) {
                                    for (var playerSocket in playerSockets) {
                                        if (playerSockets[playerSocket].nick === roomdata[room].turn) {
                                            io.sockets.connected[playerSocket].emit("gamepause");
                                            io.sockets.in(room).emit("systemmessage", ["The turn timer has been paused.", "Making a play or passing will resume the timer."]);
                                            break;
                                        }
                                    }
                                } else {
                                    socket.emit("systemmessage", "A game is not in progress.");
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/resumegame":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].started) {
                                    for (var playerSocket in playerSockets) {
                                        if (playerSockets[playerSocket].nick === roomdata[room].turn) {
                                            io.sockets.connected[playerSocket].emit("resumegame");
                                            io.sockets.in(room).emit("systemmessage", "The turn timer has been resumed.");
                                            break;
                                        }
                                    }
                                } else {
                                    socket.emit("systemmessage", "A game is not in progress.");
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/endgame":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].started) {
                                    endGame(room);
                                    io.sockets.in(room).emit("gameupdate", roomdata[room]);
                                } else {
                                    socket.emit("systemmessage", "A game is not in progress.");
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/restartgame":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].started) {
                                    endGame(room);
                                    startGame(room);
                                    io.sockets.in(room).emit("gameupdate", roomdata[room]);
                                } else {
                                    socket.emit("systemmessage", "A game has not been started.");
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/help":
                            if (nick === roomdata[room].hostnick) {
                                socket.emit("systemmessage", ["List of available commands:",
                                    "   /startgame: Starts the game if a game has not been started",
                                    "   /pausegame: Pauses the turn timer until a turn is ended manually or /resumegame is used",
                                    "   /resumegame: Resumes the turn timer if it is paused",
                                    "   /endgame: Ends the current game",
                                    "   /restartgame: Restarts the game if a game has been started",
                                    "   /showsettings: Returns current game settings",
                                    "   /leaveroom: Leaves the room and returns to the room selection page",
                                    "   /givehost [player]: Gives the host position to the specified player",
                                    "   /substitute [spectator]: Swaps roles with spectator - can be used midgame with cards carrying over"
                                ]);
                            } else if (playerSockets[socket.id].role === "player") {
                                socket.emit("systemmessage", ["List of available commands:",
                                    "   /showsettings: Returns current game settings",
                                    "   /leaveroom: Leaves the room and returns to the room selection page",
                                    "   /switchrole: Switches role between Player and Spectator",
                                    "   /substitute [spectator]: Swaps roles with spectator - can be used midgame with cards carrying over"
                                ]);
                            } else {
                                socket.emit("systemmessage", ["List of available commands:",
                                    "   /showsettings: Returns current game settings",
                                    "   /leaveroom: Leaves the room and returns to the room selection page"
                                ]);
                            }
                            return;
                        case "/switchrole":
                            switchRole(socket, nick, room);
                            return;
                        case "/leaveroom":
                            leaveRoom(socket);
                            socket.emit("leaveroom");
                            return;
                        case "/showsettings":
                            socket.emit("systemmessage", ["Current Settings:",
                                "   No play after pass: " + roomdata[room].settings.npap,
                                "   Clear board after finish: " + roomdata[room].settings.cbaf,
                                "   Enforce 3 of Diamonds start: " + roomdata[room].settings.e3ds,
                                "   Turn length: " + roomdata[room].settings.timer + "s"
                            ]);
                            return;
                    }
                    break;
                case 2:
                    switch (message[0]) {
                        case "/givehost":
                            if (nick === roomdata[room].hostnick) {
                                if (roomdata[room].players[message[1]]) {
                                    roomdata[room].hostnick = message[1];
                                    io.sockets.in(room).emit("gameupdate", roomdata[room]);
                                    io.sockets.in(room).emit("systemmessage", "Host has been transferred to " + message[1]);
                                } else {
                                    socket.emit("systemmessage", "That isn't a valid player.");
                                }
                            } else {
                                socket.emit("systemmessage", "You are not the host.");
                            }
                            return;
                        case "/switchrole":
                            switchRole(socket, message[1], room);
                            return;
                        case "/substitute":
                            if (playerSockets[socket.id].role === "player") {
                                if (roomdata[room].turn === nick) {
                                    socket.emit("systemmessage", "You can't substitute during your turn. Please end your turn and try again.");
                                    return;
                                }
                                var socketrole = getRole(message[1], room);
                                if (!socketrole) {
                                    return;
                                }
                                var role = socketrole.role,
                                    socketId = socketrole.socketId;
                                if (role === "spectator") {
                                    playerSockets[socketId].role = "player";
                                    playerSockets[socket.id].role = "spectator";
                                    roomdata[room].players[message[1]] = {
                                        "nick": message[1],
                                        "hand": roomdata[room].players[nick].hand,
                                        "cardsleft": roomdata[room].players[nick].cardsleft
                                    };
                                    delete roomdata[room].players[nick];
                                    roomdata[room].spectators.push(nick);
                                    for (var a = 0; a < roomdata[room].spectators.length; a++) {
                                        if (roomdata[room].spectators[a] === message[1]) {
                                            roomdata[room].spectators.splice(a, 1);
                                            break;
                                        }
                                    }
                                    for (var a = 0; a < roomdata[room].order.length; a++) {
                                        if (roomdata[room].order[a] === nick) {
                                            roomdata[room].order.splice(a, 1, message[1]);
                                            break;
                                        }
                                    }
                                    if (roomdata[room].passed[nick]) {
                                        roomdata[room].passed[message[1]] = true;
                                    } else if (roomdata[room].finished[nick]) {
                                        roomdata[room].finished[message[1]] = true;
                                    }
                                    delete roomdata[room].passed[nick];
                                    delete roomdata[room].finished[nick];
                                    if (nick === roomdata[room].hostnick) {
                                        roomdata[room].hostnick = message[1];
                                    }
                                    io.sockets.in(room).emit("systemmessage", message[1] + " has swapped in for " + nick + ".");
                                    io.sockets.connected[socketId].emit("updateRole", "player");
                                    socket.emit("updateRole", "spectator");
                                    io.sockets.in(room).emit("gameupdate", roomdata[room]);
                                }
                            }
                            return;
                    }
                    break;
            }
            socket.emit("systemmessage", "That is not a valid command.");
        }
    });

    socket.on("updateSettings", function(room) {
        roomdata[room.id].settings = room.settings;
        socket.emit("systemmessage", "Settings updated");
        io.sockets.to(room).emit("gameupdate", roomdata[room]);
    });

    socket.on("startgame", function(room) {
        startGame(room);
    });

    socket.on("play", function(playdata) {
        var room = playdata.room,
            nick = playdata.nick,
            play = playdata.play;
        if (play.length === 0) {
            roomdata[room].passed[nick] = true;
            if (roomdata[room].started === 1) {
                roomdata[room].started = true;
            }
            if (!nextTurn(room)) {
                for (var player in roomdata[room].players) {
                    roomdata[room].passed[player] = false;
                }
                roomdata[room].prev = [];
            }
            io.sockets.to(room).emit("gameupdate", roomdata[room], true);
        } else {
            var valid;
            if (roomdata[room].started === 1) {
                valid = game.isValid(roomdata[room].prev, play, roomdata[room].started, roomdata[room].settings.e3ds);
                if (valid === true) {
                    roomdata[room].started = true;
                }
            } else {
                valid = game.isValid(roomdata[room].prev, play);
            }
            if (valid === true) {
                for (var a = 0; a < play.length; a++) {
                    for (var b = 0; b < roomdata[room].players[nick].hand.length; b++) {
                        if (play[a].val === roomdata[room].players[nick].hand[b].val && play[a].suit === roomdata[room].players[nick].hand[b].suit) {
                            roomdata[room].players[nick].hand.splice(b, 1);
                            break;
                        }
                    }
                }
                var cardsleft = roomdata[room].players[nick].hand.length;

                roomdata[room].players[nick].cardsleft = cardsleft;
                roomdata[room].prev = play;
                roomdata[room].passed[nick] = false;

                if (cardsleft === 0) {
                    io.sockets.to(room).emit("systemmessage", nick + " has finished");
                    roomdata[room].finished[nick] = true;
                    if (roomdata[room].winner === null) {
                        io.sockets.to(room).emit("systemmessage", nick + " has won");
                        roomdata[room].winner = nick;
                    }
                    if (countPassFin(roomdata[room].finished) === roomdata[room].numPlayers - 1) {
                        endGame(room);
                        io.sockets.to(room).emit("gameupdate", roomdata[room]);
                        return;
                    }
                    if (roomdata[room].settings.cbaf) {
                        for (var player in roomdata[room].players) {
                            roomdata[room].passed[player] = false;
                        }
                        roomdata[room].prev = [];
                    }
                }
                nextTurn(room);
                io.sockets.to(room).emit("gameupdate", roomdata[room], true);
            } else {
                socket.emit("systemmessage", valid);
            }
        }
    });
});