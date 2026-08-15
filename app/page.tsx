import Player from "./Player";

export const metadata = {
  title: "InkTune · 手绘音乐播放器",
  description: "一台会跟着节拍轻轻摇晃的本地音乐播放器。",
};

export default function Home() {
  return <Player />;
}
