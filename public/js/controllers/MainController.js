app.controller("MainController", ["$scope", "$location", "socket", "roomservice",
    function($scope, $location, socket, roomservice) {
        $scope.checkFields = function(nick, room) {
            if (nick === "" || room === "") {
                alert("Please enter a nickname and room name.");
                return false;
            }
            return true;
        }
        $scope.join = function() {
            var nick = $("#nick-field").val(),
                room = $("#room-field").val();
            if ($scope.checkFields(nick, room)) {
                socket.emit("joinroom", {
                    "nick": nick,
                    "room": room
                });
            }
        };
        $scope.spectate = function() {
            var nick = $("#nick-field").val(),
                room = $("#room-field").val();
            if ($scope.checkFields(nick, room)) {
                socket.emit("spectateroom", {
                    "nick": nick,
                    "room": room
                });
            }
        }
        $scope.create = function() {
            var nick = $("#nick-field").val(),
                room = $("#room-field").val();
            if ($scope.checkFields(nick, room)) {
                socket.emit("createroom", {
                    "nick": nick,
                    "room": room
                });
            }
        };
        socket.on("prompt", function(prompt) {
            var message;
            switch (prompt.action) {
                case "join":
                case "create":
                    message = "You are currently in a room and joining another will leave the previous room.\nDo you wish to continue?";
                    break;
                case "fullspectate":
                    message = "The room is full.\nDo you wish to join as a spectator?";
                    break;
                case "startedspectate":
                    message = "The game has already started.\nDo you wish to join as a spectator?";
                    break;
            }
            if (confirm(message)) {
                if (prompt.action === "fullspectate" || prompt.action === "startedspectate") {
                    prompt.action = "spectate";
                }
                socket.emit("prompt", prompt);
            }
        });
        socket.on("roomrep", function(rep) {
            if (!rep.success) {
                alert(rep.error);
            } else {
                roomservice.setNick(rep.nick);
                roomservice.updateData(rep.room);
                roomservice.setRole(rep.role);
                $location.url("/game");
            }
        });
        $scope.$on('$destroy', function(event) {
            socket.removeAllListeners();
        });
        $(document).off();
    }
]);