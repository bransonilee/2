app.factory("roomservice", function($rootScope) {
    var data = {
        nick: "",
        room: {},
        opponents: [null, null, null],
        role: ""
    }

    return {
        getData: function() {
            return data;
        },
        setNick: function(nick) {
            data.nick = nick;
        },
        updateData: function(room, opponents) {
            data.room = room;
            data.opponents = opponents;
        },
        setRole: function(role) {
            data.role = role;
        }
    };
})