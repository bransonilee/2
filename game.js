module.exports = function(cardValues) {
    return {
        compare: function(card1, card2) {
            return cardValues[card2.val][card2.suit] - cardValues[card1.val][card1.suit];
        },
        countCards: function(play) {
            var count = {};
            var len = play.length;
            for (var a = 0; a < len; a++) {
                if (count[play[a].val] !== undefined) {
                    count[play[a].val]++;
                } else {
                    count[play[a].val] = 1;
                }
            }
            return count;
        },
        isStraight: function(play) {
            for (var a = 1; a < play.length; a++) {
                if ((cardValues[play[a].val][play[a].suit] | 0 - cardValues[play[a - 1].val][play[a - 1].suit] | 0) !== -1) {
                    return false;
                }
            }
            return true;
        },
        isFlush: function(play) {
            for (var a = 1; a < play.length; a++) {
                if (play[a].suit !== play[a - 1].suit) {
                    return false;
                }
            }
            return true;
        },
        isFullhouse: function(count, keys) {
            if (count[keys[0]] === 3) {
                return keys[0];
            } else if (count[keys[1]] === 3) {
                return keys[1];
            }
            return -1;
        },
        isQuad: function(count, keys) {
            if (count[keys[0]] === 4) {
                return keys[0];
            } else if (count[keys[1]] === 4) {
                return keys[1];
            }
            return -1;
        },
        value: function(play) {
            if (play.length === 0) {
                return 0;
            } else if (play.length < 4) {
                for (var a = 1; a < play.length; a++) {
                    if (play[a].val !== play[a - 1].val) {
                        return -1;
                    }
                }
                return cardValues[play[0].val][play[0].suit];
            } else if (play.length === 4) {
                return -1;
            } else {
                if (this.isStraight(play)) {
                    if (this.isFlush(play)) {
                        return 100 + cardValues[play[0].val][play[0].suit];
                    }
                    return 20 + cardValues[play[0].val][play[0].suit];
                } else if (this.isFlush(play)) {
                    return 40 + cardValues[play[0].val][play[0].suit];
                } else {
                    var count = this.countCards(play);
                    var keys = Object.keys(count);
                    if (keys.length !== 2) {
                        return -1;
                    }
                    var val = this.isFullhouse(count, keys);
                    if (val !== -1) {
                        return 60 + cardValues[val]["spades"];
                    }
                    val = this.isQuad(count, keys);
                    if (val !== -1) {
                        return 80 + cardValues[val]["spades"];
                    }
                    return -1;
                }
            }
        },
        isValid: function(prev, play, turn, es3d) {
            play.sort(this.compare);
            prev.sort(this.compare);
            if (es3d && turn === 1 && (play[play.length - 1].val !== "3" || play[play.length - 1].suit !== "diamonds")) {
                console.log("no 3d");
                return "You must start with the 3 of diamonds.";
            } else if (prev.length !== 0 && play.length !== prev.length) {
                return "This is not a valid play. Please play the same number of cards as played previously.";
            } else if (this.value(prev) > this.value(play)) {
                return "This is not a valid play.";
            }
            return true;
        },
        deal: function(cards, numPlayers) {
            var start;
            var player = 0;
            var hands = [];
            for (var a = 0; a < numPlayers; a++) {
                hands[a] = [];
            }
            while (cards.length > 0) {
                var card = Math.floor(Math.random() * cards.length);
                hands[player].push(cards[card]);
                if (cards[card].val === "3" && cards[card].suit === "diamonds") {
                    start = player;
                }
                cards.splice(card, 1);
                if (player === numPlayers - 1) {
                    player = 0;
                    continue;
                }
                player++;
            }
            for (var a = 0; a < numPlayers; a++) {
                hands[a].sort(this.compare);
                hands[a].reverse();
            }
            return {
                "start": start,
                "hands": hands
            };
        }
    };
};