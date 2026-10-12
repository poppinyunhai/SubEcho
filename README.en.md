<div align="center">
  <img src="icons/icon128.png" width="88" alt="SubEcho icon">
  <h1>SubEcho</h1>
  <p>Give YouTube captions a voice.</p>
  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
</div>

SubEcho is a lightweight Chrome extension that reads visible YouTube captions aloud using Xiaomi MiMo TTS. It streams speech, lowers the original video volume, and follows playback pauses and seeks. No backend or build step is required.

For Chinese narration of English videos, select Chinese captions or YouTube's Chinese auto-translation before starting SubEcho.

> Bring your own MiMo API key. SubEcho reads the captions already displayed by YouTube; it does not translate them independently. Speech has network and synthesis latency and is not guaranteed to be simultaneous.

## Features

- Streaming speech with a relaxed, conversational narration style.
- Caption deduplication and short-text merging.
- Pause synchronization and cancellation of stale audio after seeking.
- Four Chinese voices: 冰糖, 茉莉, 苏打, and 白桦.
- Adjustable narration speed (1.0×–1.5×) and original video volume.
- On-page status and a stop button.
- Bounded retries for transient network failures and rate limits.

## Install and use

The extension is currently installed locally; it is not yet listed in the Chrome Web Store. Chrome 116 or later is required.

1. Download and extract this repository, or clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Refresh any open YouTube tabs.
5. Obtain your own key from the [Xiaomi MiMo platform](https://mimo.mi.com/) with access to `mimo-v2.5-tts`.
6. Open the extension popup, enter the key, choose a voice and speed, and consent to sending captions to MiMo.
7. Enable YouTube CC and select your desired caption language. Start narration and play the video.
8. If an audio activation button appears on the page, click it once to enable playback.

The settings and controls currently use Chinese labels. **开始配音** means “Start narration”; **停止** means “Stop”. Try 1.0× for a relaxed delivery or 1.15× to reduce backlog.

## Privacy and costs

Your API key is stored in local extension storage, not Chrome Sync. It is sent directly to Xiaomi MiMo over HTTPS for authentication, never to the project author. When narration is enabled, caption text is also sent to MiMo. Requests consume your own account quota.

Captions and generated audio are held only in runtime memory. There is no author-operated backend, advertising, analytics, or tracking SDK. You can delete your saved key from the popup; revoke it on the MiMo platform if necessary. Never commit keys or include them in issues or screenshots.

See [the privacy policy](PRIVACY.md) for details, including third-party processing.

## Limitations

- Reads visible captions only; videos without captions cannot be narrated.
- Does not independently translate or preload the full caption track.
- Caption updates, networking, synthesis, and playback queues introduce latency.
- Keeps at most three waiting segments and drops captions more than 12 seconds behind to limit backlog.
- Retries transient failures up to twice before any audio arrives. Partially played sentences are not retried in full; temporary failures enter a 10-second cooldown before continuing later captions.
- Regular recorded videos are the intended use case. Live streams and Shorts are unverified.
- YouTube UI changes may require caption selector updates.

## Development

No dependency installation is required. Checks use Node.js 22; packaging also requires Python 3.

```sh
npm run check
npm test
npm run package
```

The output is `dist/subecho-0.2.1.zip`. The archive contains only runtime files, the privacy page, and icons. GitHub Actions runs checks and produces a ZIP artifact.

Tests cover caption increments, SSE chunks, PCM conversion, retry boundaries, consent, pause behavior, seek cancellation, and volume restoration. Audio quality, actual latency, and YouTube compatibility require manual testing.

See [the release guide](RELEASE.md) for GitHub and Chrome Web Store publishing.

## Contributing and license

Issues and pull requests are welcome. Include your Chrome version, extension version, caption type, reproduction steps, and sanitized error messages. Do not include API keys or private video links.

Released under the [MIT License](LICENSE). SubEcho is an independent project and is not affiliated with YouTube, Google, or Xiaomi.

API reference: [official MiMo TTS documentation](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/speech-synthesis-v2.5).
