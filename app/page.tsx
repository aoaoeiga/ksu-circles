// 一覧（S-01）。データはビルド時に読み、検索と絞り込みだけをブラウザで行う。
import { circles } from "@/lib/circles";
import HomeScreen from "@/components/HomeScreen";

export default function Home() {
  return <HomeScreen circles={circles} />;
}
