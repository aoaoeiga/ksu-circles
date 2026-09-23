// 掲載データの型。
// フィールド名は Claude Design のコードに合わせた snake_case。UI側の書き換えを最小にするため。
// 原本はスプレッドシート。data/circles.json は npm run sync が生成する中間生成物なので手で直さない。

export type Division = "運動系" | "文化系" | "その他";

export type Category =
  | "体育会所属クラブ" | "文化団体連盟" | "届出団体"
  | "学生プロジェクトチーム" | "委員会・その他";

export type Genre =
  | "球技" | "武道" | "音楽" | "文化・創作" | "ボランティア"
  | "学術・ビジネス" | "運動" | "その他";

export type Recruiting = "いつでも入れる" | "4月のみ" | "募集していない";

export type Circle = {
  id: string;                 // c001 形式。一度振ったら変えない
  short_name: string;         // 通称。大きく出す名前
  name: string;               // 正式名称
  division: Division;         // 運動系 / 文化系 / その他
  category: Category;         // 公式の所属区分
  genre: Genre;
  one_liner: string;          // キャッチコピー

  /** 0=月 … 6=日。空配列は活動日が未確認、または未決定 */
  active_days: number[];
  /** 曜日が未決定と聞けたか。active_days が空でも未確認と区別する */
  days_undecided: boolean;
  /** 「週に何回」の回答をそのまま保持する */
  frequency: string | null;
  place: string | null;

  /** null=未確認、0=無料。この2つを絶対に混同しない */
  annual_fee: number | null;
  member_count: number | null;
  beginner_count: number | null;
  first_year_count: number | null;   // 保持するが画面には出さない
  /** 男子の割合（%）。0〜100、null=未確認。表示は genderRatio() を通す */
  male_ratio: number | null;

  /** 参加の緩さ。null は未確認 */
  ease: string | null;
  /** 先輩の呼び方。null は未確認 */
  senior_call: string | null;

  /**
   * 掛け持ちしている人の状況と条件。null は未確認。
   * 回答文字列をそのまま持ち、条件があれば ` / ` で連結する。
   */
  multi_club: string | null;
  description: string;               // 紹介文。改行を含む
  leader_comment: { text: string; role: string } | null;  // role は "代表（3年）"。個人名を入れない

  recruiting: Recruiting | null;     // 「いま入れるか」のバッジ

  surveyed_at: string;               // "2026-09-02"。旧データの "2026-09" も表示側で許容
  sns: { instagram: string | null; x: string | null; website: string | null };

  /**
   * アイコン写真の場所。一覧タイルと OGP 用。null はアイコンなし（頭文字タイルになる）。
   * "/circles/c056/icon.webp" のようなサイト内のパス。
   * 旧来の public/photos に置いたファイルは "c056-icon.webp" のようなファイル名で入る。
   * どちらの形でも lib/design.ts の photoSrc() を通せば URL になる。
   */
  icon: string | null;
  /** 写真の場所。ヒーロー用、最大5枚。形は icon と同じ */
  photos: string[];
  /** 一覧のタイルの大きさ。シートで指定する。既定は "M" */
  tile_size: "S" | "M" | "L";

  /**
   * 一覧に出すか。公開可否 = OK（原稿あり）だけ true。
   * false は掲載前の確認用ページ: 一覧には出さず、/c/{id} を直接開いたときだけ見られる。noindex。
   * 判定は sync 側（scripts/sheet-transform.ts）で行う
   */
  listed: boolean;
};

export type CircleFile = { _note?: string; circles: Circle[] };
