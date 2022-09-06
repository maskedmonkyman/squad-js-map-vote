## MapVote
The `MapVote` plugin for squad js based on the original version https://github.com/maskedmonkyman/squad-js-map-vote
### Options
#### minPlayersForVote
###### Description
The number of players needed on the server for a vote to start.
###### Default
```
30
```
#### voteWaitTimeFromMatchStart
###### Description
The time in mins from the start of a round to the start of a new map vote.
###### Default
```
10
```
#### voteBroadcastInterval
###### Description
The broadcast interval for vote notification in mins.
###### Default
```
7
```
#### automaticSeedingMode
###### Description
Set a seeding layer if server has less than 20 players.
###### Default
```json
true
```
#### gamemodeWhitelist
###### Description
The random layer list will be generated with only selected gamemodes.
###### Default
```json
[ "AAS", "RAAS", "INVASION" ]
```
#### layerLevelBlacklist
###### Description
The random layer list will not include the blacklisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1).
###### Default
```
[]
```
### Example configuration
```json
{
    "plugin": "MapVote",
    "enabled": true,
    "minPlayersForVote": 30,
    "voteWaitTimeFromMatchStart": 10,
    "voteBroadcastInterval": 7,
    "numberRecentMapsToExlude": 4,
    "automaticSeedingMode": true,
    "gamemodeWhitelist": [ "AAS", "RAAS", "Invasion" ],
    "layerLevelBlacklist": [ "BlackCoast_Seed" ]
}
```
