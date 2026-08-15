# InkTune

一个手绘风格的本地音乐播放器。所有音频只在浏览器内解析，不会上传。

## 功能

- 批量选择或拖入 MP3、WAV、FLAC、M4A、AAC、OGG 等音频
- 使用 Web Audio API 的实时频谱可视化
- 封面光晕与缩放会跟随低频节拍
- 播放、暂停、切歌、拖动进度、音量、静音、收藏与循环模式
- 本地曲库抽屉与移动端自适应
- 键盘快捷键：空格播放/暂停，左右方向键快退/快进 5 秒

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 即可使用。

## 检查

```bash
npm run lint
npm run build
npm test
```
