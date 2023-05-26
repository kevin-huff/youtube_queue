# Youtube Queue

Youtube Queue is a Twitch Bot built for the purpose of free media sharing. It manages a YouTube video queue, interacts with users, and handles social scores. The bot is written in JavaScript and uses a variety of libraries including `tmi.js`, `socket.io`, `express`, `ejs`, and `dotenv` among others.

## Features

- YouTube queue management: Open or close the queue, remove entries, and list queued videos.
- Social scores: Handles and provides social score information.
- AI capabilities: Toggles the AI functionality and uses AI to generate interactive responses.
- Twitch interaction: Listens for specific commands in Twitch chat and performs corresponding actions.

## Prerequisites
To use Youtube Queue, ensure that you have the following installed:

- [Node.js](https://nodejs.org/) (version 16 or newer)

## Installation

Clone the repository to your local machine:
```
git clone https://github.com/kevin-huff/youtube_queue.git
```
Change to the project directory:
```
cd youtube_queue
```

Install the dependencies:
```
npm install
```

## Usage

Rename `.env.example` file in the root directory of your project to `.env`. Add environment-specific variables on new lines in the form of `NAME=VALUE`.

Run the application:
```
npm start
```


Visit `http://localhost:3000` or the port specified in your environment variables on your browser to interact with the application.

## Web Pages
The application includes several pages:

- `/youtube` - Queue Management page - for viewing and rating videos
- `/social_scores` - On Screen Leaderboard - use as browser source
- `/user_social_scores` - User Accessable Leaderboard
- `/youtube_queue` - User Accessable Queue List

## Helper Methods

The code includes several helper methods, including:

- `removeURLs(text)`: Removes URLs from text.
- `ordinal_suffix_of(i)`: Returns an ordinal (1st, 2nd, 3rd) format for a given integer.
- `ytVidId(url)`: Extracts the video ID from a YouTube video URL.
- `abbadabbabotSay(...)`: Generates AI-assisted responses using OpenAI's GPT-3.5 Turbo model to interact with users in the Twitch chat.
- `formatDuration(duration)`: Formats a YouTube video duration string into a more human-readable format.
- `weighted_rating(avgScore, numRatings, m, C)`: Calculates weighted ratings for social scores.
- `average_rating_of_all_users(social_scores)`: Computes the average rating of all users.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)

## Support

If you have any issues or enhancement requests, feel free to report them via the repository's issue tracker: [https://github.com/kevin-huff/youtube_queue/issues](https://github.com/kevin-huff/youtube_queue/issues).

## Acknowledgements

- [Google APIs](https://github.com/googleapis/googleapis)
- [Fuse.js](https://github.com/krisk/Fuse)
- [Express.js](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- [tmi.js](https://github.com/tmijs)
- [Spoken](https://www.npmjs.com/package/spoken)

## Authors

- [Kevin Huff](https://github.com/kevin-huff)
