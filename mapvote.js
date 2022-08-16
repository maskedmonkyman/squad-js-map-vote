//Plugin by MaskedMonkeyMan

import BasePlugin from "./base-plugin.js";

import fs from "fs";
import { Layers } from "../layers/index.js"

function randomElement(array) {
    return array[ Math.floor(Math.random() * array.length) ];
}

function formatChoice(choiceIndex, mapString, currentVotes, firstBroadcast) {
    return `${choiceIndex + 1}➤ ${mapString} ` + (!firstBroadcast ? `(${currentVotes})` : "");
    // return `${choiceIndex + 1}❱ ${mapString} (${currentVotes} votes)`
}

function toMils(min) {
    return min * 60 * 1000;
}

export default class MapVote extends BasePlugin {
    static get description() {
        return "Map Voting plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            commandPrefix:
            {
                required: false,
                description: "command name to use in chat",
                default: "!vote"
            },
            minPlayersForVote:
            {
                required: false,
                description: 'number of players needed on the server for a vote to start',
                default: 40
            },
            voteWaitTimeFromMatchStart:
            {
                required: false,
                description: 'time in mins from the start of a round to the start of a new map vote',
                default: 15
            },
            voteBroadcastInterval:
            {
                required: false,
                description: 'broadcast interval for vote notification in mins',
                default: 7
            },
            automaticSeedingMode:
            {
                required: false,
                description: 'set a seeding layer if server has less than 20 players',
                default: true
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.voteRules = {}; //data object holding vote configs
        this.nominations = []; //layer strings for the current vote choices
        this.trackedVotes = {}; //player votes, keyed by steam id
        this.tallies = []; //votes per layer, parellel with nominations
        this.votingEnabled = false;
        this.onConnectBound = false;
        this.broadcastIntervalTask = null;
        this.firstBroadcast = true;

        this.onNewGame = this.onNewGame.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
        this.broadcastNominations = this.broadcastNominations.bind(this);
        this.beginVoting = this.beginVoting.bind(this);

        this.msgBroadcast = (msg) => { this.server.rcon.broadcast(msg); };
        this.msgDirect = (steamid, msg) => { this.server.rcon.warn(steamid, msg); };
    }

    async mount() {
        this.server.on('NEW_GAME', this.onNewGame);
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.verbose(1, 'Map vote was mounted.');
        this.setSeedingMode();
    }

    async unmount() {
        this.server.removeEventListener('NEW_GAME', this.onNewGame);
        this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
        this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        clearInterval(this.broadcastIntervalTask);
        this.verbose(1, 'Map vote was un-mounted.');
    }

    async onNewGame() {
        //wait to start voting
        this.endVoting();
        this.trackedVotes = {};
        this.tallies = [];
        this.nominations = [];
        this.factionStrings = [];
        setTimeout(this.beginVoting, toMils(this.options.voteWaitTimeFromMatchStart));
        setTimeout(this.setSeedingMode, 30000);
    }

    async onPlayerDisconnected() {
        if (!this.votingEnabled) return;
        await this.server.updatePlayerList();
        this.clearVote();
        this.updateNextMap();
        this.setSeedingMode();
    }

    setSeedingMode() {
        if (this.options.automaticSeedingMode && (this.server.nextLayer.gamemode.toLowerCase() != "seed" || this.server.currentLayer.layerid == this.server.nextLayer.layerid)) {
            const mapBlacklist = [ "BlackCoast" ];
            const seedingMaps = Layers.layers.filter((l) => l.gamemode.toUpperCase() == "SEED" && !mapBlacklist.includes(l.classname) && l.layerid != this.server.currentLayer.layerid)
            
            const nextMap = randomElement(seedingMaps).layerid;
            if (this.server.players && this.server.players.length < 20) {
                this.verbose(1, 'Going into seeding mode.');
                this.server.rcon.execute(`AdminSetNextLayer ${nextMap}`);
            }
        }
    }

    async onChatMessage(info) {
        const { steamID, name: playerName } = info;
        const message = info.message.toLowerCase();
        //check to see if this message has a command prefix
        if (!message.startsWith(this.options.commandPrefix) && isNaN(message))
            return;

        const commandSplit = (isNaN(message) ? message.substring(this.options.commandPrefix.length).trim().split(' ') : [ message ]);
        let cmdLayers = commandSplit.slice(1);
        for (let k in cmdLayers) cmdLayers[ k ] = cmdLayers[ k ].toLowerCase();
        const subCommand = commandSplit[ 0 ];
        if (!isNaN(subCommand)) // if this succeeds player is voting for a map
        {
            const mapNumber = parseInt(subCommand); //try to get a vote number
            if (!this.votingEnabled) {
                await this.msgDirect(steamID, "There is no vote running right now");
                return;
            }
            await this.registerVote(steamID, mapNumber, playerName);
            this.updateNextMap();
            return;
        }

        const isAdmin = info.chat === "ChatAdmin";
        switch (subCommand) // select the sub command
        {
            case "choices": //sends choices to player in the from of a warning
                if (!this.votingEnabled) {
                    await this.msgDirect(steamID, "There is no vote running right now");
                    return;
                }
                this.directMsgNominations(steamID);
                return;
            case "results": //sends player the results in a warning
                if (!this.votingEnabled) {
                    await this.msgDirect(steamID, "There is no vote running right now");
                    return;
                }
                this.directMsgNominations(steamID);
                return;
            case "start": //starts the vote again if it was canceled
                if (!isAdmin) return;

                if (this.votingEnabled) {
                    await this.msgDirect(steamID, "Voting is already enabled");
                    return;
                }
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "restart": //starts the vote again if it was canceled
                if (!isAdmin) return;
                this.endVoting();
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "cancel": //cancels the current vote and wont set next map to current winnner
                if (!isAdmin) return;

                if (!this.votingEnabled) {
                    await this.msgDirect(steamID, "There is no vote running right now");
                    return;
                }
                this.endVoting();
                await this.msgDirect(steamID, "Ending current vote");
                return;
            case "broadcast":
                if (!this.votingEnabled) {
                    await this.msgDirect(steamID, "There is no vote running right now");
                    return;
                }
                this.broadcastNominations();
                return;
            case "help": //displays available commands
                await this.msgDirect(steamID, `Map voting system built by JetDave for MAD`);
                await this.msgDirect(steamID, `!vote <choices|number|results>`);
                if (!isAdmin) return;

                await this.msgDirect(steamID, `!vote <start|restart|cancel|broadcast> (admin only)`);
                return;
            default:
                //give them an error
                await this.msgDirect(steamID, `Unknown vote subcommand: ${subCommand}`);
                return;
        }

    }

    updateNextMap() //sets next map to current mapvote winner, if there is a tie will pick at random
    {
        const nextMap = randomElement(this.currentWinners);
        this.server.rcon.execute(`AdminSetNextLayer ${nextMap}`);
    }

    matchLayers(builtString) {
        return Layers.layers.filter(element => element.layerid.includes(builtString));
    }

    getMode(nomination, currentMode) {
        const mapName = nomination.map;
        let modes = nomination.modes;
        let mode = modes[ 0 ];

        if (mode === "Any")
            modes = this.voteRules.modes;

        if (this.voteRules.mode_repeat_blacklist.includes(currentMode)) {
            modes = modes.filter(mode => !mode.includes(currentMode));
        }

        while (modes.length > 0) {
            mode = randomElement(modes);
            modes = modes.filter(elem => elem !== mode);
            if (this.matchLayers(`${mapName}_${mode}`).length > 0)
                break;
        }

        return mode;
    }

    //TODO: right now if version is set to "Any" no caf layers will be selected
    populateNominations(steamid = null, cmdLayers = [], bypassRaasFilter = false) //gets nomination strings from layer options
    {
        // this.nominations.push(builtLayerString);
        // this.tallies.push(0);

        const translations = {
            'United States Army': "USA",
            'United States Marine Corps': "USMC",
            'Russian Ground Forces': "RUS",
            'British Army': "GB",
            'Canadian Army': "CAF",
            'Australian Defence Force': "AUS",
            'Irregular Militia Forces': "IRR",
            'Middle Eastern Alliance': "MEA",
            'Insurgent Forces': "INS",
        }

        this.nominations = [];
        this.tallies = [];
        this.factionStrings = [];
        let rnd_layers = [];
        // let rnd_layers = [];
        if (cmdLayers.length == 0) {
            const all_layers = Layers.layers.filter((l) => [ 'RAAS', 'AAS', 'INVASION' ].includes(l.gamemode.toUpperCase()));
            for (let i = 0; i < 6; i++) {
                // rnd_layers.push(all_layers[Math.floor(Math.random()*all_layers.length)]);
                let l;
                do l = randomElement(all_layers); while (rnd_layers.includes(l))
                rnd_layers.push(l);
                this.nominations.push(l.layerid)
                this.tallies.push(0);
                this.factionStrings.push(getTranslation(l.teams[ 0 ]) + "-" + getTranslation(l.teams[ 1 ]));
            }
            if (!bypassRaasFilter && rnd_layers.filter((l) => l.gamemode === 'RAAS').length < 3) this.populateNominations();
        } else {
            if (cmdLayers.length == 1 && cmdLayers[0].split('_')[0]=="*") for (let i = 0; i < 5; i++) cmdLayers.push(cmdLayers[ 0 ])
            if (cmdLayers.length <= 6)
                for (let cl of cmdLayers) {
                    const cls = cl.split('_');
                    const fLayers = Layers.layers.filter((l) => ((cls[ 0 ] == "*" || l.classname.toLowerCase().startsWith(cls[ 0 ])) && (l.gamemode.toLowerCase().startsWith(cls[ 1 ]) || (!cls[ 1 ] && [ 'RAAS', 'AAS', 'INVASION' ].includes(l.gamemode.toUpperCase()))) && (!cls[ 2 ] || l.version.toLowerCase().startsWith("v" + cls[ 2 ].replace(/v/gi, '')))));
                    let l;
                    do l = randomElement(fLayers); while (rnd_layers.includes(l))
                    rnd_layers.push(l);
                    this.nominations.push(l.layerid)
                    this.tallies.push(0);
                    this.factionStrings.push(getTranslation(l.teams[ 0 ]) + "-" + getTranslation(l.teams[ 1 ]));
                }
            else if (steamid) this.msgDirect(steamid, "You cannot start a vote with more than 6 options"); return;
        }

        function getTranslation(t) {
            if (translations[ t.faction ]) return translations[ t.faction ]
            else {
                const f = t.faction.split(' ');
                let fTag = "";
                f.forEach((e) => { fTag += e[ 0 ] });
                return fTag.toUpperCase();
            }
        }
    }

    //checks if there are enough players to start voting, if not binds itself to player connected
    //when there are enough players it clears old votes, sets up new nominations, and starts broadcast
    beginVoting(force = false, steamid = null, cmdLayers = null) {
        const playerCount = this.server.players.length;
        const minPlayers = this.options.minPlayersForVote;

        if (this.votingEnabled) //voting has already started
            return;

        if (playerCount < minPlayers && !force) {
            if (this.onConnectBound == false) {
                this.server.on("PLAYER_CONNECTED", this.beginVoting)
                this.onConnectBound = true;
            }
            return;
        }
        if (this.onConnectBound) {
            this.server.removeEventListener("PLAYER_CONNECTED", this.beginVoting);
            this.onConnectBound = false;
        }

        // these need to be reset after reenabling voting
        this.trackedVotes = {};
        this.tallies = [];

        this.populateNominations(steamid, cmdLayers);

        this.votingEnabled = true;
        this.firstBroadcast = true;
        this.broadcastNominations();
        this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
    }

    endVoting() {
        this.votingEnabled = false;
        clearInterval(this.broadcastIntervalTask);
        this.broadcastIntervalTask = null;
    }

    //sends a message about nominations through a broadcast
    //NOTE: max squad broadcast message length appears to be 485 characters
    //Note: broadcast strings with multi lines are very strange
    async broadcastNominations() {
        if (this.nominations.length > 0) {
            await this.msgBroadcast("✯ MAPVOTE ✯ Vote for the next map by writing in chat the corresponding number!\n");
            let nominationStrings = [];
            for (let choice in this.nominations) {
                choice = Number(choice);
                nominationStrings.push(formatChoice(choice, this.nominations[ choice ].replace(/\_/gi, ' ').replace(/\sv\d{1,2}/gi, '') + ' ' + this.factionStrings[ choice ], this.tallies[ choice ], this.firstBroadcast));
            }
            await this.msgBroadcast(nominationStrings.join("\n"));

            this.firstBroadcast = false;
        }
        //const winners = this.currentWinners;
        //await this.msgBroadcast(`Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }

    async directMsgNominations(steamID) {
        for (let choice in this.nominations) {
            choice = Number(choice);
            await this.msgDirect(steamID, formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ]));
        }

        const winners = this.currentWinners;
        await this.msgDirect(steamID, `Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }

    //counts a vote from a player and adds it to tallies
    async registerVote(steamID, nominationIndex, playerName) {
        nominationIndex -= 1; // shift indices from display range
        if (nominationIndex < 0 || nominationIndex > this.nominations.length) {
            await this.msgDirect(steamID, `[Map Vote] ${playerName}: invalid map number, typ !vote results to see map numbers`);
            return;
        }

        const previousVote = this.trackedVotes[ steamID ];
        this.trackedVotes[ steamID ] = nominationIndex;

        this.tallies[ nominationIndex ] += 1;
        if (previousVote !== undefined)
            this.tallies[ previousVote ] -= 1;
        await this.msgDirect(steamID, `Registered vote: ${this.nominations[ nominationIndex ].replace(/\_/gi, ' ').replace(/\sv\d{1,2}/gi, '')} ${this.factionStrings[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `Registered vote`);// ${this.nominations[ nominationIndex ]} ${this.factionStrings[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.nominations[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.factionStrings[ nominationIndex ]}`);
        // await this.msgDirect(steamID, `${this.tallies[ nominationIndex ]} votes`);
    }

    //removes a players vote if they disconnect from the sever
    clearVote() {
        const currentPlayers = this.server.players.map((p) => p.steamID);
        for (const steamID in this.trackedVotes) {
            if (!(currentPlayers.includes(steamID))) {
                const vote = this.trackedVotes[ steamID ];
                this.tallies[ vote ] -= 1;
                delete this.trackedVotes[ steamID ];
            }
        }
    }

    //calculates the current winner(s) of the vote and returns thier strings in an array
    get currentWinners() {
        const ties = [];

        let highestScore = -Infinity;
        for (let choice in this.tallies) {
            const score = this.tallies[ choice ];
            if (score < highestScore)
                continue;
            else if (score > highestScore) {
                highestScore = score;
                ties.length = 0;
                ties.push(choice);
            }
            else // equal
                ties.push(choice);
        }

        return ties.map(i => this.nominations[ i ]);
    }
}