// 掲載データの型。
// フィールド名は Claude Design のコードに合わせた snake_case。UI側の書き換えを最小にするため。
// 原本はスプレッドシート。data/circles.json は npm run sync が生成する中間生成物なので手で直さない。

export type Division = "運動系" | "文化系" | "その他";

export type Category =
  | "体育会所属クラブ" | "文化団体連盟" | "届出団体"
  | "学生プロジェクトチーム" | "委員会・その他";

export type Genre =
  | "球技" | "武道" | "音楽" | "文化・創作" | "ボランティア" | "その他";

export type Recruiting = "いつでも入れる" | "4月のみ" | "募集していない";

/** 男女の実数。比率への丸めは表示時に lib/gender.ts で行う。片方でも欠けたら null */
export type Gender = { male: number; female: number };

export type Circle = {
  id: string;                 // c001 形式。一度振ったら変えない
  short_name: string;         // 通称。大きく出す名前
  name: string;               // 正式名称
  division: Division;         // 運動系 / 文化系 / その他
  category: Category;         // 公式の所属区分
  genre: Genre;
  one_liner: string;          // キャッチコピー

  /** 0=月 … 6=日。空配列は「活動日 未確認」 */
  active_days: number[];
  /** active_days の値をキーにした [開始, 終了]。曜日ごとに違う場合がある。未確認は空 */
  active_times: Record<string, [string, string]>;
  frequency_per_week: number | null;
  hours_per_session: number | null;
  place: string | null;

  /** null=未確認、0=無料。この2つを絶対に混同しない */
  annual_fee: number | null;
  /** 年会費以外の費用。"なし"=確認済みで無い、null=聞けていない */
  extra_cost_note: string | null;

  member_count: number | null;
  beginner_count: number | null;
  first_year_count: number | null;   // 保持するが画面には出さない
  gender: Gender | null;             // 実数。表示は genderRatio() を通す

  /**
   * 掛け持ち。"できる" / "できない" / 条件つきの場合はその条件文をそのまま入れる。
   * null は未確認。**boolean にしない。**「条件つき」が true に潰れて条件が消える
   * （docs/10-sync-spec.md §6 も条件文をそのまま持つ指定）
   */
  multi_club_ok: string | null;
  description: string;               // 紹介文。改行を含む
  leader_comment: { text: string; role: string } | null;  // role は "代表（3年）"。個人名を入れない

  recruiting: Recruiting | null;     // 新歓カードのバッジ
  next_recruit: { date: string | null; what: string } | null;

  surveyed_at: string;               // "2026-09"
  sns: { instagram: string | null; x: string | null; website: string | null };

  /** /public/photos 配下のファイル名。0〜8枚。1枚目が一覧とOGPに出る */
  photos: string[];
  /** 一覧のタイルの大きさ。シートで指定する。既定は "M" */
  tile_size: "S" | "M" | "L";
};

export type CircleFile = { _note?: string; circles: Circle[] };
