# YouTube Mix Player

A standalone web app for playing YouTube videos, normal playlists, and YouTube-generated Mix/radio queues in a polished queue-first interface.

## What it can import

- A regular YouTube playlist URL with a `list=` value.
- A YouTube Mix/radio URL, usually a `list=RD...` value.
- A single YouTube video URL. The app turns that into a YouTube Mix seed by using `RD` plus the video id.

YouTube's personalized generated shelves are not exposed as a normal public API. The reliable path is to import each generated Mix URL that YouTube gives you, then the app saves it locally as one of your mixes.

## Run locally

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

## Deploy to Netlify

Deploy this `youtube-mix-player` folder as the site root. The static app is published from the folder itself, and the playlist resolver lives at `/api/resolve-youtube` as a Netlify Function.
