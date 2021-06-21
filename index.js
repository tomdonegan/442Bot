require('console-stamp')(console, '[HH:MM:ss.l]');
const axios = require('axios');
const stringTable = require('string-table');
const Discord = require('discord.js');
const DB = require('thesportsdb');
const stringSimilarity = require('string-similarity');

const client = new Discord.Client();
const discordToken = process.env['DiscordToken'];
const prefix = '!';
DB.setApiKey(process.env['APIKey']);

let subscriptions = [{ user: 0, teamID: 0 }];
let allFootballLeagues = [];

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  getLeagues();
});

client.on('message', (msg) => {
  const commandBody = msg.content.slice(prefix.length);
  const args = commandBody.split(' ');
  const command = args[0].toLowerCase();
  const messageContent = args.slice(1, args.length + 1).join(' ');

  // List all available commands.
  if (command === '442commands') {
    msg.reply(
      `
      !sub (Team Name) - Subscribe to a team.
      !results (Team Name) - Shows score data from previous 5 games.
      !history (League Name) - Shows historic facts about a league.
      !team (Team Name) - Shows team data. (Stadium, Age, Social Links etc.)
      !livescores - Shows all scores from currently live games.
      !leagueteams (League) - Returns a list of all teams playing in the selected league.
      !gamestats (Team Name) - If available, returns stats for previous game. 
      !fixtures (Team Name) - Returns upcoming games for selected team.

      **NOTE:** If you are subscribed to a team, a "Team Name" is not required after a command if you are looking for your subscribed team info.
      `
      // Commands to add:
      // !nextgame
      // !leaguetable
      // !clubnews
    );
  }
  // Subscribes a user to a chosen team, this enables the use of team specific commands.
  if (command === 'sub') {
    try {
      let teamData = DB.getTeamByName(messageContent);
      teamData.then((data) => {
        subscriptions.push({
          user: msg.author.id,
          teamID: data.teams[0].idTeam
        })
        msg.reply(`You are now subscribed to ${data.teams[0].strTeam}`);
      })
    } catch (error) {
      msg.reply('Your subscription was not successful, please try again.')
    }
  }

  // Returns the scores of the last 5 subscribed team games.
  if (command === 'results') {
    const teamData = DB.getTeamByName(messageContent);
    teamData.then((data) => {
      let teamID;
      if (messageContent === '') {
        teamID = checkSubscriptionStatus(msg.author.id);
      } else {
        teamID = data.teams[0].idTeam;
      }
      if (teamID === void 0) {
        msg.reply(
          'You are not currently subscribed to a team. Please use !subscribe (Team Name) before using !results'
        );
      } else {
        let events = DB.getPast5EventsByTeamId(teamID);
        events.then((gameData) => {
          let gamesList = [];
          const previousGames = gameData.results;
          for (var i in previousGames) {
            gamesList.push(
              `
              ${previousGames[i].strHomeTeam} ${previousGames[i].intHomeScore} : ${previousGames[i].intAwayScore} ${previousGames[i].strAwayTeam} (League: ${previousGames[i].strLeague})
              `
            );
          }
          msg.reply(
            `
              Results for the last 5 matches:
            ${gamesList[0]} ${gamesList[1]} ${gamesList[2]} ${gamesList[3]} ${gamesList[4]}
            `
          );
        })
      }
    })
  }

  //Show upcoming games. Maximum of 5 games shown.
  if (command === 'fixtures') {
    let teamID;
    const teamData = DB.getTeamByName(messageContent);
    teamData.then((data) => {
      if (messageContent === '') {
        teamID = checkSubscriptionStatus(msg.author.id);
      } else {
        teamID = data.teams[0].idTeam;
      }
      let events;
      if (teamID === void 0) {
        msg.reply(
          'You are not currently subscribed to a team. Please use !subscribe (Team Name) before using !teamgames'
        );
      } else {
        events = DB.getNext5EventsByTeamId(teamID);
        events.then((gameData) => {
          let gamesList = [];
          const upcomingGames = gameData.events;
          for (var i in upcomingGames) {
            gamesList.push(
              `
              ${upcomingGames[i].strHomeTeam} VS ${upcomingGames[i].strAwayTeam}
              **VENUE:** ${upcomingGames[i].strVenue}
              **LEAGUE:** ${upcomingGames[i].strLeague}
              **ROUND:** ${upcomingGames[i].intRound}
              **KICK OFF:** ${upcomingGames[i].strTimeLocal}(Local Time)
              `
            );
          }
          let replyMessage = ` Upcoming Matches:\n`
          for (var game in gamesList) {
            replyMessage += gamesList[game]
          }
          msg.reply(replyMessage);
        });
      }
    });
  }
  // Show the history of a selected league.
  if (command === 'history') {
    const historyData = async () => {
      const data = await getLeagueData(messageContent);
      if (messageContent.length === 0) {
        msg.reply('Please select a league. !history (League Name)');
      } else {
        msg.reply(data.strDescriptionEN, { split: true });
      }
    };
    historyData();
  }
  // Returns team data (Age, League, Social Links)
  if (command === 'team') {
    let team = async () => {
      try {
        let data = await DB.getTeamByName(messageContent);
        const teamBadge = data.teams[0].strTeamBadge;
        msg.reply(
          `
          ${data.teams[0].strTeam} team info:\n
          Current League: ${data.teams[0].strLeague}\n
          Year Formed: ${data.teams[0].intFormedYear}\n
          Stadium: ${data.teams[0].strStadium}\n
          Stadium Location: ${data.teams[0].strStadiumLocation}\n
          Website: <http://${data.teams[0].strWebsite}>\n
          Facebook: <http://${data.teams[0].strFacebook}>\n
          Twitter: <http://${data.teams[0].strTwitter}>\n
          Instagram: <http://${data.teams[0].strInstagram}>\n`,
          { files: [teamBadge] }
        );
      } catch (e) {
        msg.reply(`Sorry there is currently no team data available for ${messageContent}.`)
      }
    };
    team();
  }
  //Get data for all live games or a team specific live game.
  if (command === 'livescores') {
    DB.getLivescoresBySport('soccer').then((allScores) => {
      const events = allScores.events;
      let liveGameList = [];
      let gameString = `Current Live Scores: `;
      for (var i in events) {
        liveGameList.push(
          `
            ${events[i].strHomeTeam} ${events[i].intHomeScore} : ${events[i].intAwayScore} ${events[i].strAwayTeam}  (Game Progress: ${events[i].strProgress}Minutes | Match Status: ${events[i].strStatus} | League: ${events[i].strLeague}) 
            `
        );
        gameString += liveGameList[i];
      };
      if (liveGameList.length == 0) {
        msg.reply(`There are currently no live games.`);
      } else if (messageContent.length > 1) {
        for (var i in liveGameList) {
          if (liveGameList[i].toLowerCase().includes(messageContent)) {
            msg.reply(liveGameList[i].toString())
          } else {
            msg.reply(`There is currently no live score data for ${messageContent}.`)
          }
        };
      } else {
        msg.reply(`${gameString}`, { split: true });
      }
    });
  }
  // Returns a list of teams currently playing in the selected league
  if (command === 'leagueteams') {
    let teams = [];
    const leagueTeams = async () => {
      const data = await getLeagueData(messageContent);
      const teamsList = await DB.getTeamsByLeagueName(data.strLeague);
      for (var i in teamsList.teams) {
        teams.push(teamsList.teams[i].strTeam);
      }
      msg.reply(
        `The teams playing in the ${data.strLeague} this season are:
        ${teams.toString()}`,
        { split: true }
      );
    };
    leagueTeams();
  }

  // If available previous game stats will be shown for subbed or selected team.
  if (command === 'gamestats') {
    const teamData = DB.getTeamByName(messageContent);
    teamData.then((data) => {
      let teamID;
      if (messageContent === '') {
        teamID = checkSubscriptionStatus(msg.author.id);
      } else {
        teamID = data.teams[0].idTeam;
      }
      if (teamID === void 0) {
        msg.reply('You are not currently subscribed to a team. Please subscribe to a team or enter a team name after the !gamestats command.');
        ;
      } else {
        DB.getPast5EventsByTeamId(teamID).then((gameData) => {
          let eventID = gameData.results[0].idEvent
          getEventStats(eventID).then((stats) => {
            let s = stats.eventstats;
            if (s === null) {
              msg.reply('Sorry, there are no previous game stats available for your team right now!')
            } else {
              let dataList =
                [
                  { stat: 'Shots on goal', home: `${s[0].intHome}`, away: `${s[0].intAway}` },
                  { stat: 'Shots off goal', home: `${s[1].intHome}`, away: `${s[1].intAway}` },
                  { stat: 'Total shots', home: `${s[2].intHome}`, away: `${s[2].intAway}` },
                  { stat: 'Blocked Shots', home: `${s[3].intHome}`, away: `${s[3].intAway}` },
                  { stat: 'Shots inside box', home: `${s[4].intHome}`, away: `${s[4].intAway}` },
                  { stat: 'Shots outside box', home: `${s[5].intHome}`, away: `${s[5].intAway}` },
                  { stat: 'Fouls', home: `${s[6].intHome}`, away: `${s[6].intAway}` },
                  { stat: 'Corner kicks', home: `${s[7].intHome}`, away: `${s[7].intAway}` },
                  { stat: 'Offsides', home: `${s[8].intHome}`, away: `${s[8].intAway}` },
                  { stat: 'Ball posession', home: `${s[9].intHome}%`, away: `${s[9].intAway}%` },
                  { stat: 'Yellow cards', home: `${s[10].intHome}`, away: `${s[10].intAway}` },
                  { stat: 'Red cards', home: `${s[11].intHome}`, away: `${s[11].intAway}` },
                  { stat: 'Golakeeper saves', home: `${s[12].intHome}`, away: `${s[12].intAway}` },
                  { stat: 'Total passes', home: `${s[13].intHome}`, away: `${s[13].intAway}` },
                  { stat: 'Accurate passes', home: `${s[14].intHome} (${s[15].intHome}%)`, away: `${s[14].intAway} (${s[15].intAway}%)` },

                ];
              // Creates a "string table" from the above list, formatted for Discord.
              let dataTable = stringTable.create(dataList, { capitalizeHeaders: true });
              msg.reply(
                '\`\`\`'
                + gameData.results[0].strHomeTeam + ' ' + gameData.results[0].intHomeScore + ' : ' + gameData.results[0].intAwayScore + ' ' + gameData.results[0].strAwayTeam + '\n'
                + dataTable + '\`\`\`'
              )
            }
          });
        });
      }
    });
  }
});

// As a users input may not be a 100% match to the value stored within the API
// this function takes the users input and matches it with the most likely correct data.
// There is potential for error using this method.
function similarityCheck(input, dataList) {
  let checkForMatch = stringSimilarity.findBestMatch(input, dataList);
  return checkForMatch.bestMatch.target;
}

//Retrives the ID of a team if a player is subscribed.
function checkSubscriptionStatus(userID) {
  let teamID;
  for (var i in subscriptions) {
    if (subscriptions[i].user === userID) {
      teamID = subscriptions[i].teamID;
    }
  }
  return teamID;
}

// retrieve individual player data.
async function retrievePlayerData(playerName) {
  var playerData = await DB.getPlayerByName(playerName);
}

// Filters "Soccer" leagues from all other sports leagues within the API
// and adds them to allFootballLeagues.
async function getLeagues() {
  var leagueList = await DB.getLeagueList();
  for (i = 0; i < leagueList.leagues.length; i++) {
    if (leagueList.leagues[i].strSport === 'Soccer') {
      allFootballLeagues.push({
        key: leagueList.leagues[i].strLeague,
        value: leagueList.leagues[i].idLeague,
      });
    }
  }
}

// Retrieves the data (facts) of a selected league.
async function getLeagueData(league) {
  let leagueData;
  let leagueNames = [];

  for (var i in allFootballLeagues) {
    leagueNames.push(allFootballLeagues[i].key);
  }

  let bestMatch = similarityCheck(league, leagueNames);

  for (var i in allFootballLeagues) {
    if (allFootballLeagues[i].key.toLowerCase() === bestMatch.toLowerCase()) {
      let leagueDetails = await DB.getLeagueDetailsById(
        allFootballLeagues[i].value
      );
      //leagueData = leagueDetails.leagues[0].strDescriptionEN;
      leagueData = leagueDetails.leagues[0];
    }
  }
  return leagueData;
}

async function getEventStats(eventID) {
  return (await axios.get(`https://www.thesportsdb.com/api/v1/json/${process.env['APIKey']}/lookupeventstats.php?id=${eventID}`
  )).data;
}

async function getLiveScores(sport) {
  const liveGameData = await DB.getLivescoresBySport(sport);
}

async function getSubLiveGame(userID) {
  const teamID = checkSubscriptionStatus(userID);
  const allLiveGames = DB.getSoccerLivescores()

}

client.login(discordToken);
