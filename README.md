# Audio Transcription Demo

独立最小音频转文字 demo。这个目录不依赖 Musiq monorepo 的其它文件，后续可以直接迁移出去。

## 项目内原始链路

Musiq 里的识别链路叫 `extract-lyrics`：

1. 前端调用 `POST /api/music/extract-lyrics`，参数是 `songId`、`audioUrl`、`source`。
2. API 校验登录、歌曲归属、积分和已有任务，创建 `LyricsExtractTask`。
3. API 把任务发送到 RabbitMQ，并创建超时检查消息。
4. worker 消费任务，先用 Demucs 做人声分离。
5. worker 把人声上传到 R2，拿到公开音频 URL。
6. worker 调用 Replicate WhisperX：
   - model: `victor-upmeet/whisperx`
   - input: `audio_file`、`align_output: true`、`batch_size: 8`
7. WhisperX 输出被转换为 `AlignedWord[]`：
   - `word`: 词文本，行尾词带 `\n`
   - `success`: `true`
   - `startS`: 开始秒数
   - `endS`: 结束秒数
   - `palign`: `0`
8. worker 调用 Gemini 做歌词/字幕断句；失败时用本地规则兜底。
9. worker 写入 `lyrics_extract_tasks.result` 和 `songs.timestampedLyrics`。
10. worker 通过 Redis 发布状态，`GET /api/music/extract-lyrics/status?taskId=...` 用 SSE 转发给前端。

## Demo 最小链路

这个 demo 保留核心识别能力，删除业务外壳：

1. 网页上传本地音频，或输入公开音频 URL。
2. `src/server.js` 调用 Replicate WhisperX。
3. `src/transcription-utils.js` 转成与项目兼容的 `AlignedWord[]`。
4. 本地规则补充分行。
5. 网页默认展示歌曲歌词格式，并保留纯文本、时间戳行、JSON。

不包含：登录、积分、Prisma、RabbitMQ、Redis、R2、Demucs 人声分离、Gemini 断句。

## 运行

需要 Node.js 18+ 和 Replicate API Token。

```bash
cd audio-transcription-demo
REPLICATE_API_TOKEN=你的_token npm start
```

打开：

```text
http://localhost:7357
```

可选环境变量：

```bash
PORT=7357
HOST=127.0.0.1
MAX_UPLOAD_BYTES=26214400
REPLICATE_TIMEOUT_MS=300000
WHISPERX_MODEL=victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb
```

## 测试

```bash
cd audio-transcription-demo
npm test
```

## API

### `POST /api/transcribe`

支持 `multipart/form-data`：

- `audio`: 音频文件
- `audioUrl`: 音频 URL，可选；如果同时提供文件，优先使用文件

也支持 `application/json`：

```json
{
  "audioUrl": "https://example.com/audio.mp3"
}
```

响应：

```json
{
  "language": "en",
  "durationMs": 12345,
  "text": "plain transcription text",
  "lyricsText": "plain transcription\ntext",
  "lyricsLines": [
    {
      "text": "plain transcription",
      "startS": 0.12,
      "endS": 1.24
    }
  ],
  "subtitleLines": [
    {
      "text": "plain transcription text",
      "startS": 0.12,
      "endS": 2.34
    }
  ],
  "alignedWords": [
    {
      "word": "plain ",
      "success": true,
      "startS": 0.12,
      "endS": 0.45,
      "palign": 0
    }
  ],
  "raw": {}
}
```
