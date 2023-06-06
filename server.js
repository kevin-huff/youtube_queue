// Default configuration variables
let youtube_open = true;
let ai_enabled = true;
let max_vids_per_user = 6; 
let ai_memory_limit = 1;
let chatRatings = [];
let lastChatRatingTime = Date.now();
// Import required dependencies
const tmi = require("tmi.js");
const request = require("request");
const express = require("express");
const socketIo = require("socket.io");
const crypto = require("crypto");
const Fuse = require("fuse.js");
const { google } = require("googleapis");
const dotenv = require("dotenv");
dotenv.config();
const { Configuration, OpenAIApi } = require("openai");
const { CensorSensor } = require("censor-sensor");
const http = require("http");
const path = require("path");
const basicAuth = require("express-basic-auth");
const openai_chatbot_model_id = process.env.openai_chatbot_model_id;

// Set up Express and SocketIO server configurations
const app = express();
//get port from .env
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketIo(server);
// Set up YouTube API configuration
const youtube = google.youtube({
  version: "v3",
  auth: process.env.youtube_api_key,
  httpOptions: {
    headers: {
      referer: "https://bootcutbot.glitch.com/",
    },
  },
});
// Set up OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
// Set up Twitch client configuration
console.log("bot_account", process.env.bot_account);
const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: process.env.bot_account,
    password: process.env.oauth,
  },
  channels: [process.env.twitch_channel],
});
client.connect();
// Configure Express app settings
var dir = path.join(__dirname, "public");
app.use(
  express.static(dir, {
    maxAge: "1d",
  })
);

server.listen(port, () => {
    console.log(`listening on *:${port}`);
});
// Set up Jsoning databases for configuration and data
const jsoning = require("jsoning");
let settings_db = new jsoning("db/queue_settings.json");
let youtube_db = new jsoning("db/youtube.json");
let historical_youtube_db = new jsoning("db/historical_youtube.json");
let social_scores_db = new jsoning("db/social_scores.json");
let moderation_db = new jsoning("db/moderation.json");
// Configure CensorSensor to disable specific censorship tiers
const censor = new CensorSensor();
censor.disableTier(2);
censor.disableTier(3);
censor.disableTier(4);
censor.disableTier(5);

// Handle Socket.IO events
io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("youtube_deleted", (arg, callback) => {
    var current_youtube = youtube_db.get("youtube");
    if (current_youtube == null) {
      current_youtube = [];
    }
    //see if the youtube exists and remove it
    var youtube_exists = current_youtube.findIndex(function (
      current_youtube,
      index
    ) {
      if (current_youtube["video"]["id"] == arg) return true;
    });

    if (youtube_exists == -1) {

      console.log("youtube_deleted: youtube not found");
    } else {
      console.log("youtube found");
      current_youtube.splice(youtube_exists, 1);
      youtube_db.set("youtube", current_youtube);
    }
    io.emit("youtube_remove", arg);
    callback("youtube_deleted processed");
  });
  socket.on("youtube_watched", (id, username, timestamp, callback) => {
    // Get the youtube database
    var current_youtube = youtube_db.get("youtube");
    if (current_youtube == null) {
      current_youtube = [];
    }
    // See if the youtube exists and remove it
    var youtube_exists = current_youtube.findIndex(function (
      current_youtube,
      index
    ) {
      if (current_youtube["video"]["id"] == id) return true;
    });
    // Add it to the historical database
    historical_youtube_db.push(id, { username, timestamp });
    if (youtube_exists == -1) {
      console.log("youtube_watched: youtube not found");
    } else {
      console.log("youtube found");
      // Remove it from the database
      current_youtube.splice(youtube_exists, 1);
      youtube_db.set("youtube", current_youtube);
    }
    // Remove from any other pages that are up
    io.emit("youtube_remove", id);
    // Get the watch count
    var watch_count = settings_db.get("youtubes_watched");
    // Increment the watch count
    settings_db.math("youtubes_watched", "add", 1);
    console.log("watch_count:", watch_count + 1);
    callback(watch_count + 1);
  });
  socket.on("youtube_moderated", (arg, callback) => {
    // Save the rating to the moderation_db using the video's id as the key
    moderation_db.set(arg.id, arg.rating);  
    console.log("youtube_moderated:", arg);  
    io.emit("update_youtube_moderated", arg);
    callback("youtube_moderated processed");
  });
  // Add a socket.io event listener for rating a user
  socket.on("rateUser", (ratingObj) => {
    console.log('ratingObj',ratingObj);

    // Get the current ratings from the database
    let currentRatings = social_scores_db.get(ratingObj.username.trim());

    // If the user has not been rated before, create a new entry in the database
    if (currentRatings === null) {
      currentRatings = [];
    }

    // Add the new rating to the list of ratings for this user
    currentRatings.push(ratingObj.rating);

    // Save the updated list of ratings for this user to the database
    social_scores_db.set(ratingObj.username, currentRatings);

    // Emit the new rating to the middleware
    io.emit("newRating", ratingObj.username, ratingObj.rating);
        //Reset the chat ratings
        chatRatings = [];
        lastChatRatingTime = Date.now();
        io.emit("new_chat_rating", [{ username: 'Abbabox', rating: ratingObj.rating }]);
        io.emit("final_judgement", "Abbabox");
        io.emit("average_chat_rating", ratingObj.rating);
  });
});
// Set up Express routes
app.use(express.static("public"));
app.set("view engine", "ejs");
app.get(
  "/youtube",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let social_scores = social_scores_db.all();
    let moderation = moderation_db.all();
    let youtube_queue = youtube_db.get("youtube");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
    //make social_scores empty if null
    if (social_scores == null) {
      social_scores = [];
    }
    //make moderation empty if null
    if (moderation == null) {
      moderation = [];
    }
    res.render("youtube.ejs", {
      youtube: youtube_queue,
      social_scores: social_scores,
      moderations: moderation,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      formatDuration: formatDuration,
    });
  }
);
app.get(
  "/moderate",
  basicAuth({
    users: { [process.env.mod_user]: process.env.mod_pass },
    challenge: true,
  }),
  function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let social_scores = social_scores_db.all();
    let moderation = moderation_db.all();
    let youtube_queue = youtube_db.get("youtube");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
    //make social_scores empty if null
    if (social_scores == null) {
      social_scores = [];
    }
    //make moderation empty if null
    if (moderation == null) {
      moderation = [];
    }
    res.render("youtube_mod.ejs", {
      youtube: youtube_queue,
      social_scores: social_scores,
      moderations: moderation,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      formatDuration: formatDuration,
    });
  }
);
app.get("/social_scores", function (req, res) {
  let social_scores = social_scores_db.all();
  //make social_scores empty if null
  if (social_scores == null) {
    social_scores = [];
  }
  res.render("social_score.ejs", {
    social_scores: social_scores,
    banner_image: process.env.banner_image,
  });
});
app.get("/chat_rating", function (req, res) {
  res.render("chat_rating.ejs", {
    avg_rating: getAverageRating(),
  });
});
app.get("/user_social_scores", function (req, res) {
  let social_scores = social_scores_db.all();
  //make social_scores empty if null
  if (social_scores == null) {
    social_scores = [];
  }
  res.render("user_social_scores.ejs", {
    social_scores: social_scores,
    banner_image: process.env.banner_image,
  });
});
app.get("/youtube_queue", function (req, res) {
  let yt_count = settings_db.get("youtubes_watched");
  let youtube_queue = youtube_db.get("youtube");
  //make queue empty if null
  if (youtube_queue == null) {
    youtube_queue = [];
  }
  res.render("youtube_queue.ejs", {
    youtube: youtube_queue,
    yt_count: yt_count,
    banner_image: process.env.banner_image,
  });
});

// Main Twitch bot logic
client.on("message", async (channel, tags, message, self) => {
  // Ignore echoed messages.
  if (self) return;

  let isMod = tags.mod || tags["user-type"] === "mod";
  let isBroadcaster = channel.slice(1) === tags.username;
  let isModUp = isMod || isBroadcaster;
  let isSub = tags.subscriber;
  let isVIP = tags.badges && tags.badges.vip === "1";
  getRatingFromChat(message.toLowerCase(),tags["display-name"]);
  //Add youtube vids to the youtubequeue
  //var regex = new RegExp("^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$");
  if (message.toLowerCase().startsWith("http") && youtube_open) {
    const videoId = ytVidId(message);
    if (videoId) {
      // Check if videoId is not false
      //see if this videoId exists
      var historical_video_exists = historical_youtube_db.has(videoId);
    } else {
      historical_video_exists = false;
    }

    //See if it exists in the current queue
    if (youtube_db.get("youtube")) {
      var youtube_queue_exists = youtube_db
        .get("youtube")
        .some((obj) => obj.video.id === videoId);
    } else {
      youtube_queue_exists = false;
    }
    if (historical_video_exists || youtube_queue_exists) {
      console.log("video exists");
      //let them know
      abbadabbabotSay(
        channel,
        client,
        tags,
        `Ask @${tags["display-name"]} why they added a video we've already seen, in a funny way.`,
        "",
        "- Vid already played"
      );
    } else {
      if (videoId) {
        youtube.videos.list(
          {
            part: "snippet,contentDetails",
            id: videoId,
          },
          (err, res) => {
            if (err) {
              console.log(err);
              return;
            }
            const video = res.data.items[0];
            if (!video) {
              console.log("Video not found");
              return;
            }

            if (youtube_db.get("youtube")) {
              var user_videos = youtube_db
                .get("youtube")
                .filter(function (video) {
                  return video.user === tags["display-name"];
                });
            } else {
              user_videos = [];
            }

            console.log("user vid count", user_videos.length);

            if (user_videos.length >= max_vids_per_user) {
              abbadabbabotSay(
                channel,
                client,
                tags,
                `Sorry @${tags["display-name"]}, you can only have ${max_vids_per_user} video in the queue at a time.`,
                "",
                `- ${max_vids_per_user} Max Vids in queue`
              );
            } else {
              const youtube_request = {
                user: tags["display-name"],
                video: video,
                link: message,
                moderated: false,
                length: video.contentDetails.duration,
              };
              youtube_db.push("youtube", youtube_request);
              //Add it to the historical db
              //historical_youtube_db.push(videoId);
              abbadabbabotSay(
                channel,
                client,
                tags,
                `tell only @${tags["display-name"]} their youtube video has been added to the queue`,
                "",
                "- Vid added"
              );
              io.emit("youtube_added", youtube_request);
            }
          }
        );
      } else {
        client.say(
          channel,
          `Sorry, @${tags["display-name"]}, sorry hon, I can't figure out that youtube link. - <3 abbadabbabot`
        );
      }
    }
  }
  if (message.toLowerCase().startsWith("!open_yt")) {
    //check if mod
    if (isModUp) {
      //set queue_open to true
      youtube_open = true;

      //let the chat know what is up
      client.say(
        channel,
        `@${tags["display-name"]} has opened the youtube queue! Any youtube links in chat will be added to the queue.`
      );
    }
  }
  if (message.toLowerCase().startsWith("!close_yt")) {
    //check if mod
    if (isModUp) {
      //set queue_open to false
      youtube_open = false;
      client.say(
        channel,
        `@${tags["display-name"]} has closed the youtube queue!`
      );
    }
  }
  if (message.toLowerCase() === "!clear_yt") {
    //check if mod
    if (isModUp) {
      youtube_db.clear();
      settings_db.set("youtubes_watched", 0);
      abbadabbabotSay(
        channel,
        client,
        tags,
        "formally announce the clearing of the youtube queue to the chat"
      );
    }
  }
  if (message.toLowerCase().startsWith("!chat_rating")) {
      // check if mod
      if (isModUp) {
          let chat_rating = getAverageRating();
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Formally announce that chat's average rating is ${chat_rating} out of 4`,
            "",
            `- Chat's avg rating ${chat_rating}`
          );
      }
  }

  if (message.toLowerCase().startsWith("!max_vids")) {
    // check if mod
    if (isModUp) {
      const parts = message.split(' ');
      if (parts.length > 1) {
        const newValue = parseInt(parts[1]);
        if (!isNaN(newValue)) { // Check if a number was provided after the command
          max_vids_per_user = newValue;
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Let chat know The max_vids_per_user value has been set to ${max_vids_per_user}`
          );
        } else {
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Let chat know there is an Invalid command usage. Please provide a number after !set_max`
          );
        }
      } else {
        abbadabbabotSay(
          channel,
          client,
          tags,
          `Let chat know there is an Invalid command usage. Please provide a number after !set_max`
        );
      }
    }
  }
  
  if (message.toLowerCase() === "!social_scores") {
    //return page with list of queue
    abbadabbabotSay(
      channel,
      client,
      tags,
      `Announce to @${tags["display-name"]} that they can see their social score:`,
      "",
      " " + process.env.socialscore_list_url
    );
  }
  if (message.toLowerCase() === "!list_yt") {
    //return page with list of youtube queue
    abbadabbabotSay(
      channel,
      client,
      tags,
      `Tell @${tags["display-name"]} that look at the list themselves.`,
      "",
      " " + process.env.youtube_list_url
    );
  }
  if (message.toLowerCase() === "!myscore") {
    const social_scores = social_scores_db.all(); // get social_scores object

    // create a new object with lowercase usernames
    const social_scores_lowercase = {};
    for (const username in social_scores) {
      const scores = social_scores[username];
      social_scores_lowercase[username.toLowerCase()] = scores;
    }

    const username = tags.username.toLowerCase(); // get the user's username in lowercase

    if (username in social_scores_lowercase) {
      const scores = social_scores_lowercase[username];
      const numRatings = scores.length;
      const avgScore =
        scores.reduce((acc, score) => acc + parseFloat(score), 0) / numRatings;

      // Calculate the weighted rating
      const m = 5; // e.g., 10
      const C = average_rating_of_all_users(social_scores);
      const weightedRating = weighted_rating(avgScore, numRatings, m, C);

      // Update the ranking calculation to use the weighted rating
      const rank =
        Object.entries(social_scores_lowercase)
          .map(([user, scores]) => {
            const numRatings = scores.length;
            const avgScore =
              scores.reduce((acc, score) => acc + parseFloat(score), 0) /
              numRatings;
            const weightedRating = weighted_rating(avgScore, numRatings, m, C);
            return [user, weightedRating];
          })
          .sort(([, a], [, b]) => b - a)
          .findIndex(([user]) => user === username) + 1;

      const reply = `tell @${
        tags["display-name"]
      }, your weighted score is ${weightedRating.toFixed(
        2
      )} based on ${numRatings} ratings. You are ranked #${rank} among all users.`;
      abbadabbabotSay(
        channel,
        client,
        tags,
        reply,
        "",
        `- @${tags["display-name"]}: weighted score: ${weightedRating.toFixed(2)} based on ${numRatings} ratings. rank: #${rank} among all users.`
      );
    } else {
      abbadabbabotSay(
        channel,
        client,
        tags,
        `@${tags["display-name"]}, you have no social score ratings yet.`,
        "",
        `-${tags["display-name"]} has no social score ratings`
      );
    }
  }
  //toggle ai_enabled mode
  if (message.toLowerCase() === "!toggle_ai") {
    //check if mod
    if (isModUp) {
      //toggle ai_enabled
      ai_enabled = !ai_enabled;
      // set string for current status of ai_enabled
      var ai_enabled_status = ai_enabled ? "enabled" : "disabled";
      //let the chat know what is up
      abbadabbabotSay(
        channel,
        client,
        tags,
        `Let chat know AI is now ${ai_enabled_status}.`
      );
    }
  }
}); // End Chatbot

// Helper functions
function removeURLs(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, "");
}

function ordinal_suffix_of(i) {
  var j = i % 10,
    k = i % 100;
  if (j == 1 && k != 11) {
    return i + "st";
  }
  if (j == 2 && k != 12) {
    return i + "nd";
  }
  if (j == 3 && k != 13) {
    return i + "rd";
  }
  return i + "th";
}

function ytVidId(url) {
  var match = url.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:(?:youtube\.com\/(?:watch\?v=|embed\/)|(?:youtu\.be|youtube\.com\/shorts)\/))([\w-]{11})/
  );
  return match ? match[1] : false;
}
// Get system_text_string from env
const system_text_string = process.env.openai_system_text_string;
let messageArray = [{ role: "system", content: system_text_string }];

async function abbadabbabotSay(
  channel,
  client,
  tags,
  message,
  prefix = "",
  postfix = ""
) {
  console.log("ai_enabled", ai_enabled);
  if (ai_enabled) {
    const messageContent = `${tags.username}: ` + message;
    const newMessage = {
      role: "user",
      content: messageContent,
    };
    messageArray.push(newMessage);
    console.log("usermessage", messageArray);
    try {
      const response = await openai.createChatCompletion({
        model: openai_chatbot_model_id,
        messages: messageArray,
        temperature: 0.8,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        user: tags.username,
      });
      const censored_response = removeURLs(
        censor.cleanProfanity(
          response.data.choices[0]["message"]["content"].trim()
        )
      )
        .replace(/^Abbadabbabot: /, "")
        .replace(/^"|"$/g, "");

      const newResponse = {
        role: "assistant",
        content: censored_response,
      };
      messageArray.push(newResponse);
      // Remove the 2nd and 3rd elements if longer than 21 elements.
      if (messageArray.length >= ai_memory_limit) {
        // Remove the 2nd and 3rd elements
        messageArray.splice(1, 2);
        console.log("trimming message array");
      }

      client.say(channel, prefix + censored_response + postfix);
      return Promise.resolve("resolved")
    } catch (error) {
      ai_enabled = false;
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
        error = error.response.status;
      } else {
        console.log(error.message);
        error = error.message;
      }
      client.say(
        channel,
        prefix + "- ai offline - " + "prompt: " + message + postfix
      );
      return Promise.resolve("resolved")
    }
  } else {
    client.say(
      channel,
      prefix + "- ai offline - " + "prompt: " + message + postfix
    );
    return Promise.resolve("resolved")
  }
}

function say(channel, client, tags, message, prefix = "", postfix = "") {
  client.say(channel, prefix + message + postfix);
  return Promise.resolve("resolved")
}

function formatDuration(duration) {
  if (!duration) return "00:00"; // Return '00:00' when duration is null or undefined

  var match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);

  var hours = parseInt(match[1]) || 0;
  var minutes = parseInt(match[2]) || 0;
  var seconds = parseInt(match[3]) || 0;

  if (hours) {
    minutes += hours * 60;
  }

  return (
    minutes.toString().padStart(2, "0") +
    ":" +
    seconds.toString().padStart(2, "0")
  );
}

function weighted_rating(avgScore, numRatings, m, C) {
  return (
    (numRatings / (numRatings + m)) * avgScore + (m / (numRatings + m)) * C
  );
}

function average_rating_of_all_users(social_scores) {
  let totalRatings = 0;
  let totalUsers = 0;

  for (const scores of Object.values(social_scores)) {
    totalRatings += scores.map(Number).reduce((a, b) => a + b, 0);
    totalUsers += scores.length;
  }

  return totalRatings / totalUsers;
}

function getRatingFromChat(message, username) {
    console.log('checking for a rating');
    let now = Date.now();

    // Reset the ratings if it's been more than 3 minutes since the last rating
    if (now - lastChatRatingTime > 1 * 60 * 1000) {
        console.log('unsetting ratings');
        chatRatings = [];
        lastChatRatingTime = now;
    }

    // Regular expression to find a decimal number in the message
    let regex = /\b([0-3](\.\d+)?|4(\.0)?)\b/;
    let match = message.match(regex);

    if (match) {     
        let rating = parseFloat(match[0]);
        console.log(`rating of ${rating} found.`);

        // Check if it's been less than or equal to 3 minutes
        if (now - lastChatRatingTime <= 1 * 60 * 1000 ) {
            console.log('rating saved');

            // Check if there is already a rating from this user
            let userRating = chatRatings.find(r => r.username === username);

            if (userRating) {
                // If there is, replace it
                userRating.rating = rating;
                userRating.time = now;
            } else {
                // If not, add a new one
                chatRatings.push({
                    username: username,
                    rating: rating,
                    time: now
                });
            }
            io.emit("new_chat_rating", chatRatings);
            io.emit("average_chat_rating", getAverageRating());
            lastChatRatingTime = now;
        }
    }

    console.log('chatRatings', chatRatings);
}

function getAverageRating() {
    if (chatRatings.length === 0) {
      console.log('no ratings yet');
        return 0;
    }

    let sum = chatRatings.reduce((a, b) => a + b.rating, 0);
    let average = sum / chatRatings.length;

    // Round the average to the nearest 0.5
    return Math.round(average * 2) / 2;
}