require('console-stamp')(console, '[HH:MM:ss.l]');
const Discord = require('discord.js');
const theSportsDB = require('thesportsdb');
const stringSimilarity = require('string-similarity');
const client = new Discord.Client();
const discordToken = process.env['DiscordToken'];
const prefix = '!';
theSportsDB.setApiKey(process.env['APIKey']);

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

  if (command === '442commands') {
    msg.reply(
      `
      !subscribe (Team Name) - Subscribe to a team.
      !mygames - Shows score data from previous 5 games. (User must be subscribed to a team.)
      !history (Team Name) - Shows historic facts about a club.
      !team (Team Name) - Shows team data. (Stadium, Age, Social Links etc.)
      !livescores - Shows all scores from currently live games.
      !leagueteams (League) - Returns a list of all teams playing in the selected league.
      `
      // Commands to add:
      // !nextgame
      // !leaguetable
      // !clubnews
    );
  }
  if (command === 'subscribe') {
    let findTeam = async () => {
      let teamData = await theSportsDB.getTeamByName(messageContent);
      subscriptions.push({
        user: msg.author.id,
        teamID: teamData.teams[0].idTeam,
      });
      msg.reply(`You are now subscribed to ${teamData.teams[0].strTeam}`);
    };
    findTeam();
  }
  // Returns the scores of the last 5 subscribed team games.
  if (command === 'mygames') {
    let teamID = checkSubscriptionStatus(msg.author.id);
    if (teamID === void 0) {
      msg.reply(
        'You are not currently subscribed to a team. Please use !subscribe (Team Name) before using !mygames'
      );
    } else {
      let games = last5Games(teamID);
      games.then((gameData) => {
        let gamesList = [];
        for (var i in gameData) {
          gamesList.push(
            `
            ${gameData[i].strHomeTeam} ${gameData[i].intHomeScore} : ${gameData[i].intAwayScore} ${gameData[i].strAwayTeam} (League: ${gameData[i].strLeague})
            `
          );
        }
        msg.reply(
          `
            Results for the last 5 matches:
          ${gamesList[0]} ${gamesList[1]} ${gamesList[2]} ${gamesList[3]} ${gamesList[4]}
          `
        );
      });
    }
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
      let data = await theSportsDB.getTeamByName(messageContent);
      msg.reply(
        `
        ${data.teams[0].strAlternate} team info:\n
        Current League: ${data.teams[0].strLeague}\n
        Year Formed: ${data.teams[0].intFormedYear}\n
        Stadium: ${data.teams[0].strStadium}\n
        Stadium Location: ${data.teams[0].strStadiumLocation}\n
        Website: http://${data.teams[0].strWebsite}\n
        Facebook: http://${data.teams[0].strFacebook}\n
        Twitter: http://${data.teams[0].strTwitter}\n
        Instagram: http://${data.teams[0].strInstagram}\n
        Team Badge: ${data.teams[0].strTeamBadge}`
      );
    };
    team();
  }
  //Live scores from all football games.
  if (command === 'livescores') {
    let liveScores = async () => {
      let liveGameData = await theSportsDB.getLivescoresBySport('soccer');
      let games = liveGameData.events;
      let liveGameList = [];
      let gameString = 'Current Live Scores: ';
      for (var i in games) {
        liveGameList.push(
          `
            ${games[i].strHomeTeam} ${games[i].intHomeScore} : ${games[i].intAwayScore} ${games[i].strAwayTeam}  (Game Progress: ${games[i].strProgress}Minutes | Match Status: ${games[i].strStatus} | League: ${games[i].strLeague}) 
            `
        );
        gameString += liveGameList[i];
      }
      msg.reply(`${gameString}`);
    };
    liveScores();
  }
  // Returns a list of teams currently playing in the selected league
  if (command === 'leagueteams') {
    let teams = [];
    const leagueTeams = async () => {
      const data = await getLeagueData(messageContent);
      const teamsList = await theSportsDB.getTeamsByLeagueName(data.strLeague);
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
  if (command === 'lastGameStats') {
    let teamID = checkSubscriptionStatus(msg.author.id);
  }
  if (msg.author.bot) {
    msg.suppressEmbeds();
  }
});

// As a users input may not be a 100% match to the value stored within the API
// this function takes the users input and matches it with the most likely correct data.
// There is potential for error using this method.
function similarityCheck(input, dataList) {
  let checkForMatch = stringSimilarity.findBestMatch(input, dataList);
  return checkForMatch.bestMatch.target;
}

function checkSubscriptionStatus(userID) {
  let teamID;
  for (var i in subscriptions) {
    if (subscriptions[i].user === userID) {
      teamID = subscriptions[i].teamID;
    }
  }
  return teamID;
}

async function last5Games(teamID) {
  let eventsData = await theSportsDB.getPast5EventsByTeamId(teamID);
  return eventsData.results;
}

// retrieve individual player data.
async function retrievePlayerData(playerName) {
  var playerData = await theSportsDB.getPlayerByName(playerName);
}

// Filters "Soccer" leagues from all other sports leagues within the API
// and adds them to allFootballLeagues.
async function getLeagues() {
  var leagueList = await theSportsDB.getLeagueList();
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
      let leagueDetails = await theSportsDB.getLeagueDetailsById(
        allFootballLeagues[i].value
      );
      //leagueData = leagueDetails.leagues[0].strDescriptionEN;
      leagueData = leagueDetails.leagues[0];
    }
  }
  return leagueData;
}

// async function getLeagueDetails(leagueId) {
//   var leagueDetails = await theSportsDB.getLeagueDetailsById(leagueId);
//   console.log(leagueDetails);
// }

client.login(discordToken);
