<h2>MapVote</h2>
<p>The <code>MapVote</code> plugin for squad js based on the original version https://github.com/maskedmonkyman/squad-js-map-vote</p>
<h3>Options</h3>
<ul><li><h4>minPlayersForVote</h4>
<h6>Description</h6>
<p>The number of players needed on the server for a vote to start.</p>
<h6>Default</h6>
<pre><code>30</code></pre></li>
<li><h4>voteWaitTimeFromMatchStart</h4>
<h6>Description</h6>
<p>The time in mins from the start of a round to the start of a new map vote.</p>
<h6>Default</h6>
<pre><code>10</code></pre></li>
<li><h4>voteBroadcastInterval</h4>
<h6>Description</h6>
<p>The broadcast interval for vote notification in mins.</p>
<h6>Default</h6>
<pre><code>7</code></pre></li>
<li><h4>automaticSeedingMode</h4>
<h6>Description</h6>
<p>The set a seeding layer if server has less than 20 players.</p>
<h6>Default</h6>
<pre><code>true</code></pre></li>
<li><h4>gamemodeWhitelist</h4>
<h6>Description</h6>
<p>The random layer list will be generated with only selected gamemodes.</p>
<h6>Default</h6>
<pre><code>[ "AAS", "RAAS", "INVASION" ]</code></pre></li>
<li><h4>layerLevelBlacklist</h4>
<h6>Description</h6>
<p>The random layer list will not include the blacklisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1).</p>
<h6>Default</h6>
<pre><code>[]</code></pre></li>
