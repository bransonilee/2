app.controller("GameController", ["$scope", "$location", "socket", "roomservice",
    function($scope, $location, socket, roomservice) {
        $scope.timerId;
        $scope.timeLeft;
        $scope.countdown = function() {
            if ($scope.timeLeft === 0) {
                clearTimeout($scope.timerId);
                $("#messages").append($("<li>").text("You've run out of time and have automatically passed."));
                socket.emit("play", {
                    "room": $scope.room.id,
                    "nick": $scope.nick,
                    "play": []
                });
            } else {
                $scope.timeLeft--;
                $scope.$apply();
            }
        };

        $scope.timer = function() {
            $scope.timerId = setInterval($scope.countdown, 1000);
            $scope.timeLeft = $scope.room.settings.timer;
        };

        $scope.showComponent = function(component) {
            if (component[0] === "opponent") {
                return $scope.opponents[component[1]] !== null;
            } else if (component[0] === "cardsleft") {
                return $scope.opponents[component[1]] !== null && $scope.room.started;
            } else if (component[0] === "startgame") {
                return $scope.room.hostnick === $scope.nick && $scope.countOpponents() > 0 && !$scope.room.started;
            } else if (component[0] === "settings") {
                return $scope.room.hostnick === $scope.nick && !$scope.room.started;
            }
        };

        $scope.isOpponent = function(player) {
            return player !== $scope.nick;
        };

        $scope.countOpponents = function() {
            var count = 0;
            for (var a = 0; a < $scope.opponents.length; a++) {
                if ($scope.opponents[a] !== null) {
                    count++;
                }
            }
            return count;
        };

        $scope.getOpponents = function() {
            var opponents = [];
            var players = $scope.room.order;
            var numPlayers = players.length;
            if ($scope.role === "player") {
                if (numPlayers === 1) {
                    opponents[0] = null;
                    opponents[1] = null;
                    opponents[2] = null;
                } else if (numPlayers === 2) {
                    opponents[0] = null;
                    for (var player in $scope.room.players) {
                        if ($scope.isOpponent(player)) {
                            opponents[1] = $scope.room.players[player];
                        }
                    }
                    opponents[2] = null;
                } else if (numPlayers === 3) {
                    opponents[1] = null;
                    var pos = 0;
                    var found = false;
                    for (var a = 0; a < numPlayers; a++) {
                        if (found && players[a] === $scope.nick) {
                            break;
                        } else if (players[a] === $scope.nick) {
                            found = true;
                            if (a === numPlayers - 1) {
                                a = -1;
                            }
                            continue;
                        }
                        if (found) {
                            opponents[pos] = $scope.room.players[players[a]];
                            pos += 2;
                        }
                        if (a === numPlayers - 1) {
                            a = -1;
                        }
                    }
                } else {
                    var pos = 0;
                    var found = false;
                    for (var a = 0; a < numPlayers; a++) {
                        if (found && players[a] === $scope.nick) {
                            break;
                        } else if (players[a] === $scope.nick) {
                            found = true;
                            if (a === numPlayers - 1) {
                                a = -1;
                            }
                            continue;
                        }
                        if (found) {
                            opponents[pos] = $scope.room.players[players[a]];
                            pos++;
                        }
                        if (a === numPlayers - 1) {
                            a = -1;
                        }
                    }
                }
            } else {
                var opponents = [null, null, null, null];
                if (numPlayers === 1) {
                    opponents[3] = $scope.room.players[players[0]];
                } else if (numPlayers === 2) {
                    opponents[3] = $scope.room.players[players[0]];
                    opponents[1] = $scope.room.players[players[1]];
                } else if (numPlayers === 3) {
                    opponents[3] = $scope.room.players[players[0]];
                    opponents[0] = $scope.room.players[players[1]];
                    opponents[2] = $scope.room.players[players[2]];
                } else {
                    opponents[3] = $scope.room.players[players[0]];
                    opponents[0] = $scope.room.players[players[1]];
                    opponents[1] = $scope.room.players[players[2]];
                    opponents[2] = $scope.room.players[players[3]];
                }
            }
            $scope.opponents = opponents;
        };

        $scope.update = function(nextTurn) {
            if ($scope.nick === "") {
                $location.url("/");
                return;
            }
            $scope.getOpponents();
            $scope.play = [];
            roomservice.updateData($scope.room, $scope.opponents, $scope.play);
            if ($scope.room.turn !== $scope.nick) {
            	clearTimeout($scope.timerId);
        	}
            else if (nextTurn && $scope.room.turn === $scope.nick) {
            	clearTimeout($scope.timerId);
                $scope.timer();
            }
        };

        $scope.getData = function() {
            var data = roomservice.getData();
            $scope.nick = data.nick;
            $scope.room = data.room;
            $scope.opponents = data.opponents;
            $scope.role = data.role;
            $scope.update();
        }

        socket.on("gameupdate", function(room, nextTurn) {
            $scope.room = room;
            $scope.update(nextTurn);
        });

        socket.on("gamestart", function(res) {
            if (res.success) {
                $scope.room = res.room;
            } else {
                $("#messages").append($("<li class='systemmessage'>").text(res.error));
            }
            $scope.update(true);
        });

        socket.on("updateRole", function(role) {
            $scope.role = role;
            roomservice.setRole(role);
        });

        socket.on("gamepause", function() {
            clearTimeout($scope.timerId);
        });
        
        socket.on("resume", function() {
            $scope.timerId = setInterval($scope.countdown, 1000);
        });

        $(document).on("click", ".selectable", function() {
            if ($scope.room.turn === $scope.nick) {
                var card = $(this).prop("id").split(" ");
                if ($(this).prop("class").indexOf("selected") === -1 && $scope.play.length < 5) {
                    $(this).addClass("selected");
                    $scope.play.push({
                        "val": card[0],
                        "suit": card[1]
                    });
                } else if ($(this).prop("class").indexOf("selected") !== -1) {
                    $(this).removeClass("selected");
                    for (var a = 0; a < $scope.play.length; a++) {
                        if ($scope.play[a].val === card[0] && $scope.play[a].suit === card[1]) {
                            $scope.play.splice(a, 1);
                            break;
                        }
                    }
                }
            }
        });

        $scope.startGame = function() {
            socket.emit("startgame", $scope.room.id);
        };


        $scope.saveSettings = function() {
            var timer = $("#timer").val();
            if (parseInt(timer, 10) === NaN) {
                alert("Please enter an integer value for the time.\nSettings have not been saved.");
                return;
            }
            socket.emit("updateSettings", {
                "id": $scope.room.id,
                "settings": {
                    "npap": $("#npap").prop("checked"),
                    "cbaf": $("#cbaf").prop("checked"),
                    "e3ds": $("#e3ds").prop("checked"),
                    "timer": timer
                }
            });
        };

        $(document).on("click", "#play", function() {
            if ($scope.play.length > 0) {
                socket.emit("play", {
                    "room": $scope.room.id,
                    "nick": $scope.nick,
                    "play": $scope.play
                });
            }
        });

        $(document).on("click", "#pass", function() {
            socket.emit("play", {
                "room": $scope.room.id,
                "nick": $scope.nick,
                "play": []
            });
        });

        $("form").submit(function() {
            socket.emit("message", {
                "room": $scope.room.id,
                "nick": $scope.nick,
                "message": $("#message").val()
            });
            $("#message").val("");
            return false;
        });

        socket.on("message", function(message) {
            $("#messages").append($("<li>").html("<span>" + message.nick + ": </span>" + message.msg));
            var messages = document.getElementById("messages");
            messages.scrollTop = messages.scrollHeight;
        });

        socket.on("systemmessage", function(message) {
            console.log(message);
            if (message === message.toString()) {
                $("#messages").append($("<li class='systemmessage'>").text(message));
            } else {
                for (var a = 0; a < message.length; a++) {
                    $("#messages").append($("<li class='systemmessage'>").text(message[a]));
                }
            }
            var messages = document.getElementById("messages");
            messages.scrollTop = messages.scrollHeight;
        })

        socket.on("leaveroom", function() {
            $location.url("/2/");
        })

        $scope.$on('$destroy', function(event) {
            socket.emit("playerleave");
            socket.removeAllListeners();
        });

        $scope.getData();
    }
]);