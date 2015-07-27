var app = angular.module("2App", ["ngRoute"]);

app.config(["$routeProvider", "$locationProvider",
    function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(true);

        $routeProvider
            .when("/", {
                controller: "MainController",
                templateUrl: "views/main.html"
            })
            .when("/game", {
                controller: "GameController",
                templateUrl: "views/game.html"
            })
            .otherwise({
                redirectTo: "/"
            });
    }
]);