# InkTune

> 一款带有手绘纸张质感、节拍动画与实时音频可视化的 Windows 本地音乐播放器。

[![Release](https://img.shields.io/github/v/release/LJHkr/inkwave-player?display_name=tag&style=flat-square)](https://github.com/LJHkr/inkwave-player/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-f47a49?style=flat-square)
![Privacy](https://img.shields.io/badge/audio-local%20only-4f3d38?style=flat-square)

InkTune 可以直接作为 Windows 桌面软件运行。选择或拖入本地音乐后，播放器会显示实时频谱，让安洁莉娜主题封面随低频节奏呼吸、弹跳和左右摇摆。音频只在本机读取与分析，不会上传。

## 下载

前往 [GitHub Releases](https://github.com/LJHkr/inkwave-player/releases/latest) 下载最新的 Windows x64 便携版：

1. 下载发布页中的 ZIP 文件。
2. 完整解压 ZIP。
3. 双击文件夹内的 `InkTune.exe`。

> 不要只单独复制 EXE；程序需要同目录中的运行时文件。当前版本未使用商业代码签名证书，如果 Windows SmartScreen 显示“未知发布者”，可在确认文件来自本仓库后选择“更多信息”继续运行。

## 功能

- 手绘纸张风格 UI 与安洁莉娜主题封面
- MP3、WAV、FLAC、M4A、AAC、OGG、OPUS 本地音频
- Web Audio API 实时频谱可视化
- 低频节拍驱动的封面缩放、上下弹跳和非线性左右摇摆
- 播放、暂停、上一首、下一首、进度拖动、音量和静音
- 列表循环、单曲循环与收藏按钮
- 本地曲库抽屉及文件拖放导入
- 自动记忆曲库和上次选中的歌曲
- 无边框窗口、内部窗口按钮、窗口置顶与空白区域拖动
- 调整窗口大小时整体等比例缩放，不显示页面滚动条
- 禁止界面文字和图片被误选中或拖出

## 曲库记忆

桌面版会把曲库记录保存在：

```text
%APPDATA%\InkTune\library.json
```

这里只保存歌曲路径、显示名称和上次选中的歌曲，不会复制或上传音频文件。启动时会重新检查路径；如果歌曲被移动、重命名或删除，InkTune 会跳过失效记录并显示提示。

## 操作

| 操作 | 方式 |
| --- | --- |
| 添加歌曲 | 点击“选择本地音乐”，或把音频文件拖入窗口 |
| 播放 / 暂停 | 点击播放按钮，或按空格键 |
| 快退 / 快进 | 按左右方向键，每次 5 秒 |
| 移动窗口 | 按住点状背景或卡片空白区域拖动 |
| 保持置顶 | 点击右上角 `⇧` 按钮，再次点击取消 |
| 打开曲库 | 点击右上角菜单或播放列表按钮 |

## 开发

### 环境

- Windows 10/11 x64
- Node.js 22.13 或更高版本
- npm

### 安装与网页开发

```powershell
npm install
npm run dev
```

### 检查与测试

```powershell
npm run lint
npm test
```

### 构建桌面渲染器

```powershell
npm run desktop:build
```

### 打包 Windows 便携版

```powershell
npm run desktop:package
```

当前打包脚本使用 Electron 31.7.7，并从本机 Electron 缓存中读取对应的 Windows x64 运行时压缩包。输出文件位于 `release/`。

## 项目结构

```text
app/             播放器 React 组件与全局样式
desktop/         Vite 桌面渲染入口
electron/        Electron 主进程、preload 与应用图标
public/          封面和静态资源
scripts/         Windows 便携版打包脚本
tests/           渲染与本地化行为测试
```

## 隐私

- 音频解码、播放和频谱分析均在本机完成。
- 应用不会把歌曲、文件路径或曲库记录上传到服务器。
- 从曲库中恢复歌曲时，只访问用户此前选择过的本地路径。

## 声明

本项目是非官方的学习与同人性质项目，与《明日方舟》及其权利方无隶属或合作关系。相关角色与作品权利归原权利方所有。
