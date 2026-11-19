import type {
  users,
  auditions,
  bands,
  bandMembers,
  auditionVoters,
  scores,
} from './schema.ts';

export type NewUser = typeof users.$inferInsert;
export type NewAudition = typeof auditions.$inferInsert;
export type NewBand = typeof bands.$inferInsert;
export type NewBandMember = typeof bandMembers.$inferInsert;
export type NewAuditionVoter = typeof auditionVoters.$inferInsert;
export type NewScore = typeof scores.$inferInsert;

export interface RealisticSeedData {
  users: NewUser[];
  auditions: NewAudition[];
  bands: NewBand[];
  bandMembers: NewBandMember[];
  auditionVoters: NewAuditionVoter[];
  scores: NewScore[];
}

// 32 bands in performance order modeled on 六甲祭 Excel data
const ROKKOSAI_BANDS: Array<{ name: string; penalty: number; techBias: number }> = [
  { name: 'カネヨリマサル', penalty: 0, techBias: 0.47 },
  { name: 'きのこ帝国', penalty: 0, techBias: 0.48 },
  { name: 'Bruno Mars', penalty: 0, techBias: 0.53 },
  { name: 'バズマザーズ', penalty: 0, techBias: 0.52 },
  { name: 'Bialy', penalty: 0, techBias: 0.50 },
  { name: 'Age', penalty: 0, techBias: 0.49 },
  { name: 'Mr. Children', penalty: 0, techBias: 0.47 },
  { name: '板歯目', penalty: 0, techBias: 0.51 },
  { name: 'Aooo', penalty: 0, techBias: 0.50 },
  { name: 'えんぷてい', penalty: 0, techBias: 0.49 },
  { name: '踊ってばかり', penalty: 0, techBias: 0.48 },
  { name: 'Maroon 5', penalty: 0, techBias: 0.52 },
  { name: 'ヨルシカ', penalty: 0, techBias: 0.51 },
  { name: 'Sound Schedule', penalty: 0, techBias: 0.52 },
  { name: 'MONO NO AWARE', penalty: 0, techBias: 0.51 },
  { name: '米津', penalty: 0, techBias: 0.49 },
  { name: 'zoo', penalty: 0, techBias: 0.50 },
  { name: '奥田民生', penalty: 0, techBias: 0.48 },
  { name: 'tricot', penalty: 0, techBias: 0.56 },
  { name: 'RAD', penalty: 0, techBias: 0.48 },
  { name: "Laget's Jam Stack", penalty: 0, techBias: 0.55 },
  { name: '34', penalty: 0, techBias: 0.53 },
  { name: '超☆社会的サンダル', penalty: 0, techBias: 0.45 },
  { name: 'MASS', penalty: 0, techBias: 0.51 },
  { name: 'おいしくるメロンパン', penalty: 0, techBias: 0.50 },
  { name: 'said', penalty: 0, techBias: 0.51 },
  { name: 'Lucky Kilimanjaro', penalty: 0, techBias: 0.48 },
  { name: 'the band apart', penalty: 0, techBias: 0.56 },
  { name: 'Green Day', penalty: 0, techBias: 0.47 },
  { name: 'Bye-Bye', penalty: 0, techBias: 0.49 },
  { name: 'cinema staff', penalty: 0, techBias: 0.54 },
  { name: '羊文学', penalty: 0, techBias: 0.48 },
];

// 69 x 32 raw total scores extracted from the reference Excel workbook
const EXCEL_SCORE_MATRIX: Array<Array<number | null>> = [
  [65,55,89,72,74,55,76,71,68,70,62,62,66,65,null,70,65,65,63,71,63,73,null,66,null,75,73,90,65,62,73,75],
  [60,62,62,70,60,49,72,58,48,null,60,59,56,61,54,55,68,59,69,60,53,80,67,65,90,81,69,83,64,61,null,70],
  [81,82,87,87,82,79,87,82,82,85,83,82,82,82,83,82,84,82,85,85,82,85,82,83,83,84,82,86,80,null,82,83],
  [65,64,83,74,null,62,81,76,70,70,73,71,73,76,74,72,86,69,65,82,71,89,63,74,76,77,null,75,67,66,68,78],
  [70,71,null,72,73,65,84,75,69,80,67,73,74,72,73,70,70,80,74,null,76,82,71,73,79,73,89,88,null,71,75,70],
  [68,74,82,74,null,64,76,68,66,79,null,73,77,75,75,70,82,76,75,73,74,80,null,75,77,79,73,83,74,72,74,80],
  [52,72,54,79,74,40,77,61,38,88,96,62,76,51,73,60,85,49,null,69,null,95,70,78,71,93,46,87,50,63,90,83],
  [50,49,null,61,60,51,null,74,52,null,78,70,54,58,57,53,69,55,81,72,63,80,73,64,84,82,77,85,66,62,75,76],
  [80,88,99,84,92,null,90,90,76,85,92,89,96,81,78,82,82,96,88,87,84,98,90,90,83,90,87,88,85,84,87,91],
  [74,69,98,76,76,66,92,76,72,80,82,84,82,74,74,null,76,76,74,80,70,80,74,72,80,86,null,88,78,80,72,71],
  [77,null,79,83,70,55,88,86,65,80,86,null,79,77,70,77,82,84,81,85,70,87,88,null,93,85,81,91,74,85,82,81],
  [45,40,75,60,58,44,82,48,42,83,70,63,67,80,47,72,85,65,73,86,49,93,55,52,92,null,68,88,50,46,79,null],
  [75,68,76,80,75,55,null,75,55,80,74,77,null,null,73,74,78,60,71,90,60,95,80,81,98,78,74,79,70,76,90,77],
  [68,72,85,82,null,67,80,73,66,72,81,77,75,null,76,85,93,95,78,89,null,92,84,70,86,90,79,96,71,70,71,94],
  [78,79,79,84,80,76,82,79,77,83,79,79,79,80,80,79,80,84,79,81,79,85,78,83,83,84,81,85,77,82,78,81],
  [65,63,null,69,62,50,null,66,57,74,67,65,68,68,64,63,72,null,68,57,62,75,67,62,63,74,63,80,62,57,69,68],
  [40,35,40,30,45,5,30,35,20,42,35,35,50,40,30,30,50,40,45,40,40,40,55,52,44,null,37,null,40,50,45,45],
  [86,89,94,89,80,86,89,null,84,90,78,85,94,86,75,71,83,82,87,91,82,100,92,83,94,94,85,87,85,82,92,85],
  [70,69,92,81,77,62,85,80,null,80,70,84,73,76,67,71,80,77,81,90,77,85,74,78,80,87,78,91,77,74,80,84],
  [null,71,76,71,64,60,76,65,null,77,76,74,72,64,67,68,80,73,88,67,66,90,84,78,71,83,72,71,69,66,71,79],
  [74,75,79,null,77,65,78,77,72,85,81,78,80,null,74,72,76,76,78,79,76,null,73,76,81,82,87,82,74,76,77,76],
  [71,68,88,81,73,56,84,71,55,73,67,72,69,71,68,null,83,79,79,null,69,88,68,69,null,90,82,84,70,69,74,76],
  [74,79,94,79,95,76,92,77,75,90,83,85,87,88,82,83,85,88,95,85,81,98,89,80,94,97,86,99,84,78,96,91],
  [60,62,65,62,62,58,58,56,58,56,59,62,55,58,56,56,60,null,59,62,61,58,59,62,58,62,61,60,57,62,58,60],
  [50,49,90,78,86,43,85,68,48,67,58,77,null,71,55,80,61,60,62,79,59,93,53,44,56,88,91,92,53,57,81,58],
  [77,63,88,90,79,66,89,null,75,82,76,78,86,74,81,80,76,85,78,82,74,82,78,76,88,84,80,88,null,79,79,82],
  [53,49,88,84,86,43,98,47,45,69,63,76,71,55,51,73,null,59,81,90,67,99,79,65,96,95,94,92,57,61,75,null],
  [58,61,58,92,94,43,73,61,55,76,87,69,70,61,69,63,88,72,null,78,66,97,null,82,85,100,66,84,49,65,80,90],
  [87,84,85,87,90,83,86,86,81,85,84,83,90,87,85,88,86,85,85,88,86,88,84,86,86,85,null,90,88,85,85,86],
  [58,50,null,63,69,45,60,64,53,60,70,null,66,54,57,58,65,null,65,59,56,69,61,54,63,68,62,67,48,55,63,61],
  [84,81,89,94,81,68,92,84,80,90,87,90,82,91,80,83,88,86,91,88,87,93,89,89,null,91,86,91,91,86,87,90],
  [63,69,88,85,68,62,83,73,64,75,72,79,76,70,65,null,90,78,83,86,75,91,74,70,81,82,77,80,72,75,78,76],
  [58,72,88,80,60,55,76,68,58,63,85,66,81,65,70,76,75,63,69,82,null,86,73,64,80,87,83,90,84,62,71,78],
  [53,51,90,79,82,46,93,55,49,82,97,59,67,59,53,62,70,63,69,74,57,86,60,55,81,null,78,92,55,55,71,76],
  [80,77,87,89,80,71,90,78,77,82,83,77,83,80,82,84,89,80,80,89,78,92,76,83,93,86,83,93,74,null,84,85],
  [61,67,74,74,73,66,74,73,66,null,77,83,75,72,68,82,null,85,84,83,71,91,75,75,86,92,83,86,72,73,72,80],
  [68,65,80,70,74,62,86,76,63,83,78,73,77,64,75,66,null,75,82,71,67,null,72,84,87,89,90,88,85,69,81,79],
  [66,61,84,65,72,56,null,58,55,71,77,78,62,59,74,63,64,68,75,null,73,89,76,69,81,82,67,90,57,60,83,80],
  [87,81,95,87,85,75,96,86,92,90,90,90,94,88,80,86,84,90,null,95,86,97,89,83,98,null,95,96,88,88,null,90],
  [77,73,78,76,74,71,78,73,72,84,77,85,87,83,null,84,81,76,87,89,75,90,72,78,94,89,86,90,72,77,77,76],
  [82,87,93,90,74,68,91,86,69,84,72,92,null,78,79,76,85,96,97,75,70,98,77,88,89,95,80,94,73,71,81,83],
  [null,79,94,77,75,59,96,79,67,86,90,92,78,83,72,78,85,90,78,90,null,98,76,81,91,90,78,93,89,84,89,79],
  [80,88,89,81,80,78,85,81,79,85,84,84,85,82,85,82,85,83,86,89,81,83,83,80,85,87,87,84,null,81,81,84],
  [71,74,80,92,84,66,94,78,77,96,null,81,79,88,91,72,89,90,87,74,82,93,83,89,91,90,null,90,94,72,82,94],
  [74,58,null,75,73,47,75,null,59,90,76,74,59,85,49,73,87,93,75,66,56,89,69,69,83,93,68,null,71,73,88,83],
  [78,80,88,94,88,75,83,78,null,91,84,84,80,84,80,83,87,86,88,80,80,92,85,80,80,92,85,96,82,83,86,92],
  [70,77,99,81,85,67,89,72,65,84,82,81,64,75,66,null,87,79,91,null,88,98,80,77,93,94,74,90,77,71,null,83],
  [71,null,76,69,null,63,75,72,69,null,74,81,73,68,67,77,67,74,75,73,66,77,73,69,85,84,68,80,65,64,81,82],
  [69,68,75,79,70,61,70,66,64,72,null,74,72,75,74,70,76,73,69,68,68,76,70,69,67,73,67,76,71,70,69,73],
  [65,69,67,75,65,62,67,63,63,73,67,76,null,64,66,78,78,63,73,80,55,73,67,67,68,83,62,null,63,68,76,null],
  [90,86,93,89,87,86,95,89,null,94,92,91,93,90,87,88,89,89,90,90,89,92,91,90,94,90,89,92,89,91,86,87],
  [null,null,85,80,83,70,86,80,77,81,85,82,80,80,81,82,81,82,81,85,77,87,83,81,87,82,84,85,82,81,80,84],
  [70,73,80,79,66,55,87,80,60,84,82,75,76,71,null,73,81,73,75,85,68,90,74,77,83,87,75,83,68,73,65,68],
  [40,60,null,60,60,40,null,60,40,80,70,null,70,60,40,60,60,60,60,60,50,80,80,60,80,70,70,70,60,60,70,80],
  [70,68,81,90,null,70,83,74,73,79,85,null,84,77,79,84,71,81,76,77,81,82,74,73,80,80,82,84,78,79,82,78],
  [60,58,85,60,55,47,85,47,54,62,53,84,78,81,67,57,69,85,85,67,57,null,75,74,69,88,81,85,61,68,83,80],
  [71,67,92,88,74,59,80,null,75,73,71,88,83,89,70,72,87,78,82,87,75,90,75,74,88,92,81,92,79,73,null,77],
  [82,82,86,83,84,81,85,83,81,83,84,83,83,84,83,83,84,84,84,85,83,85,84,83,85,85,85,85,84,84,83,84],
  [80,78,88,80,82,76,80,82,76,82,84,80,78,82,78,78,78,78,80,86,80,82,82,80,80,84,80,86,80,78,80,82],
  [76,null,92,82,82,74,90,84,74,90,88,80,78,86,78,84,92,88,86,84,86,94,88,null,90,86,88,84,84,84,88,88],
  [67,74,88,null,84,65,95,72,null,76,77,80,82,69,68,90,79,86,87,85,81,94,70,78,91,89,73,93,74,66,83,71],
  [80,82,null,87,83,72,87,75,79,83,79,85,86,87,84,90,85,80,85,91,90,93,85,86,88,88,null,91,81,85,87,87],
  [68,73,null,78,75,56,78,73,59,73,78,77,74,68,75,71,74,78,72,69,69,77,68,78,80,75,73,81,76,79,71,73],
  [60,75,78,83,75,null,75,73,67,80,95,80,78,82,80,72,91,82,80,84,82,92,83,87,95,83,79,83,80,78,85,87],
  [52,82,65,77,55,30,76,85,40,88,76,54,null,73,60,74,80,90,null,79,40,86,73,81,98,100,75,96,62,51,83,80],
  [78,68,86,86,70,66,73,81,67,68,72,73,null,79,69,73,73,null,74,73,74,90,73,75,84,84,78,84,79,74,74,75],
  [78,82,84,80,84,null,83,80,72,82,90,87,87,82,84,80,82,83,84,85,84,91,89,90,87,84,86,85,81,86,84,84],
  [96,85,98,96,95,null,96,97,85,93,91,90,91,93,93,97,94,93,92,89,90,95,89,90,92,98,94,92,94,94,94,95],
  [62,62,73,80,68,57,72,58,60,95,79,null,83,67,63,69,91,81,71,77,64,93,65,85,83,89,75,null,64,60,70,84],
];

const WINTER_EVENT_BANDS: Array<{ name: string; penalty: number; baseMean: number; techBias: number }> = [
  { name: 'サカナクション', penalty: 0, baseMean: 80, techBias: 0.52 },
  { name: 'フジファブリック', penalty: 0, baseMean: 72, techBias: 0.51 },
  { name: 'Base Ball Bear', penalty: 0, baseMean: 69, techBias: 0.50 },
  { name: 'クリープハイプ', penalty: 0, baseMean: 71, techBias: 0.46 },
  { name: 'UNISON SQUARE GARDEN', penalty: 0, baseMean: 82, techBias: 0.55 },
  { name: 'go!go!vanillas', penalty: 0, baseMean: 73, techBias: 0.48 },
  { name: 'NUMBER GIRL', penalty: 1.0, baseMean: 75, techBias: 0.52 },
  { name: '凛として時雨', penalty: 0, baseMean: 78, techBias: 0.57 },
  { name: 'フレデリック', penalty: 0, baseMean: 74, techBias: 0.49 },
  { name: 'マカロニえんぴつ', penalty: 0, baseMean: 76, techBias: 0.49 },
  { name: 'King Gnu', penalty: 0, baseMean: 83, techBias: 0.54 },
  { name: 'Official髭男dism', penalty: 0, baseMean: 81, techBias: 0.53 },
  { name: 'THE ORAL CIGARETTES', penalty: 2.0, baseMean: 71, techBias: 0.49 },
  { name: 'ハヌマーン', penalty: 0, baseMean: 76, techBias: 0.54 },
];

const MINI_NBRF_BANDS = [
  'Nankinmachi Funk',
  'Summer Breeze Band',
  'スーパーカー',
  'KANA-BOON',
  'ヤバイTシャツ屋さん',
  'Mrs. GREEN APPLE',
  'BUMP OF CHICKEN',
  '椎名林檎',
  'BLUE ENCOUNT',
  'SHISHAMO',
];

const SPRING_DRAFT_BANDS = [
  'くるり',
  'ASIAN KUNG-FU GENERATION',
  'スピッツ',
  '東京事変',
  'Vaundy',
  'ELLEGARDEN',
  'Saucy Dog',
  'あいみょん',
];

const LAST_NAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川',
  '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本',
  '斉藤', '福田', '太田', '西村', '藤井', '金子', '岡本', '中野', '三浦', '原田',
  '松田', '竹内', '小野', '田村', '中山', '和田', '石田', '上田', '森田', '原',
];

const FIRST_NAMES = [
  '陽翔', '結菜', '蓮', '美咲', '蒼空', '凛', '大輝', '琴音', '悠真', '莉子',
  '湊', '陽葵', '樹', '芽依', '朝陽', '紬', '律', 'さくら', '新', '結衣',
  '大和', '杏', '颯太', '花音', '陸', '彩乃', '晴', '美月', '海斗', '愛梨',
  '瑛太', '詩織', '拓海', '真央', '翼', '優奈', '健太', '千尋', '翔太', 'あかり',
  '直樹', '遥', '涼介', '美優', '智也', '奈々', '亮太', '楓', '駿', 'ひなた',
  '慶太', '瑞希', '哲平', '沙耶', '修平', '栞', '康平', '桃子', '龍之介', '日菜',
];

const HIGH_SCORE_COMMENTS = [
  '全体のアンサンブルが極めて高く、原曲の良さとバンドの色が両立していました！',
  'リズム隊の安定感が抜群で、ボーカルの表現力も会場を一気に引き込んでいました。',
  '細かいキメやダイナミクスの付け方が丁寧で、聴いていて鳥肌が立ちました。',
  '圧倒的な完成度とステージングでした。ライブ本番でも間違いなく映えると思います！',
  'ギターのトーン作りと掛け合いが最高でした。最後まで集中して聴き入りました。',
  'グルーヴが心地よく、アレンジにも工夫が感じられて非常に完成度が高いです。',
  'サビの爆発力とコーラスの厚みが素晴らしく、会場の空気が一気に変わりました。',
  '技術力だけでなく楽しそうに演奏している姿が印象的で、魅力に溢れていました。',
  'タイトなドラムとベースに支えられて、上モノが自由に歌っていて気持ちよかったです。',
  '音圧のバランスが完璧で、PAを通した時の抜け感が他バンドと一線を画していました。',
  'イントロの入りから空気を掴んでいて、MCも含めライブ構成が上手かったです。',
  '難しいフレーズを涼しい顔で弾きこなしていて、練習量の多さが伝わってきました。',
];

const MID_SCORE_COMMENTS = [
  '曲の雰囲気はよく出ていました。中盤のテンポ揺れが抑えられるとさらに良くなります！',
  'ボーカルの声質が曲に合っていて良かったです。コーラスの音程がもう少し合うと◎。',
  '各パートのフレーズはよく練習されています。全体の縦の線を揃えると迫力が増しそうです。',
  'サビの盛り上がりは気持ちよかったですが、Aメロ・Bメロの音量差をもう少しつけたいです。',
  'ベースの音作りがかっこよかったです。ギターとの帯域の住み分けを意識するとさらに抜けます。',
  '楽しそうなステージで好感が持てました！リズムの走りを抑えられると安定感が出ます。',
  '原曲へのリスペクトが感じられる良い演奏でした。ブレイク後の入りを揃えると完璧です。',
  'ドラムのパワーがあって良かったです。シンバルの音量バランスを少し調整すると聴きやすいです。',
  'ギターソロが印象的でした。バッキングの刻みがもう少しタイトになるとグルーヴが出ます。',
  '選曲のセンスが抜群でした。本番までにステージ上の動きやアイコンタクトを増やしたいですね。',
  '落ち着いた演奏で安定感がありました。もう一段階ギアが上がる瞬間があるとさらに映えます。',
  '音色作りにこだわりを感じました。エンディングの締め方を綺麗に合わせられると良いです。',
];

const LOW_SCORE_COMMENTS = [
  '曲の持つ世界観は伝わってきました。まずはクリック練習でリズムの土台を固めたいです。',
  '挑戦的な選曲で好感が持てます！難しいキメの部分を重点的に合わせると良くなりそうです。',
  '緊張からか少し走りがちだったので、アイコンタクトを取りながら落ち着いて合わせられると◎。',
  'ボーカルが楽器隊の音に埋もれがちだったので、全体の音量バランスを見直してみてください。',
  '雰囲気は良いので、各パートの基礎的なピッチ・リズムの精度を上げると化けると思います。',
  'サビに向けてもう少し盛り上がりが欲しかったです。ダイナミクスの差を意識してみてください。',
  '個人練の成果は見えていますが、バンド全体での合わせ込みがあと一歩という印象でした。',
  '終盤で少し失速してしまったのが惜しいです。体力配分とモニタリング環境を意識したいです。',
];

const FRESHMAN_COMMENTS = [
  'イントロから鳥肌が立ちました！先輩方の演奏がかっこよすぎて圧倒されました。',
  'ベースの音作りと動きがすごくかっこよかったです！',
  'MC含め会場の空気が最高でした。見ていてすごく楽しかったです！',
  'ライブの締めに相応しい迫力でした！憧れのバンドです。',
  'サビの盛り上がりがすごくて思わず拳を上げたくなりました！',
  'コーラスが綺麗で聴き惚れました。選曲も最高でした！',
  'ドラムの手数がすごくて目が離せませんでした！',
  'ギターの音色が綺麗で、曲の雰囲気にぴったり合っていました。',
  'ステージ上での掛け合いが楽しそうで、見ていて笑顔になりました！',
  'こんな風に演奏できるようになりたいと思いました！お疲れ様でした！',
];

const INSTRUMENTS = ['Vo', 'Gt', 'Gt/Vo', 'Ba', 'Dr', 'Key', 'Ba/Cho', 'Gt/Cho'];

function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function splitTotalScore(
  total: number,
  techBias: number,
  rand: () => number,
): { techScore: number; charmScore: number } {
  const clampedTotal = clamp(Math.round(total), 0, 100);
  const ratio = clamp(techBias + (rand() - 0.5) * 0.08, 0.35, 0.65);
  let tech = Math.round(clampedTotal * ratio);
  let charm = clampedTotal - tech;
  if (tech > 50) {
    charm += tech - 50;
    tech = 50;
  }
  if (charm > 50) {
    tech += charm - 50;
    charm = 50;
  }
  return {
    techScore: clamp(tech, 0, 50),
    charmScore: clamp(charm, 0, 50),
  };
}

const FRESHMAN_GENERAL_FEEDBACKS = [
  '先輩方の迫力ある演奏をたくさん聴けて、とても勉強になりました！次のライブに向けて自分も頑張ります。',
  'どのバンドも個性がはっきりしていて、長時間でも最後まで楽しく聴けました。お疲れ様でした！',
  'ステージ上での魅せ方やMCの盛り上げ方がすごく参考になりました。',
];

const GENERAL_FEEDBACKS = [
  '全体的に演奏の安定感が高く、どのバンドも本番が楽しみになる完成度でした。お疲れ様でした！',
  'バンドごとのカラーがはっきり出ていて聴き応えがありました。音量バランスや転換も意識できると更に良くなると思います。',
  '回生を問わずチャレンジングな選曲やアレンジが多く、とても刺激的なオーディションでした！',
  'リズム隊のグルーヴがしっかりしているバンドが上位に来ている印象でした。本番に向けて細部を詰めていきましょう。',
  'ライブ感や観客を巻き込む力のあるバンドが多くて楽しかったです。長時間の審査・演奏お疲れ様でした！',
];

function pickComment(total: number, rand: () => number): string {
  if (total >= 80) {
    return HIGH_SCORE_COMMENTS[Math.floor(rand() * HIGH_SCORE_COMMENTS.length)];
  }
  if (total >= 63) {
    return MID_SCORE_COMMENTS[Math.floor(rand() * MID_SCORE_COMMENTS.length)];
  }
  return LOW_SCORE_COMMENTS[Math.floor(rand() * LOW_SCORE_COMMENTS.length)];
}

export function buildRealisticSeedData(now: number = Date.now()): RealisticSeedData {
  const rand = createPrng(20261117);

  // 1. Users (6 core dev-login accounts + 119 fictional members = 125 total)
  const userList: NewUser[] = [
    {
      id: 'u-admin',
      studentIdHash: 'seed-hash-admin',
      name: '神戸 太郎 (運営委員長)',
      role: 'ADMIN',
      enrollmentYear: 2024,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-multi',
      studentIdHash: 'seed-hash-guitarist',
      name: '六甲 健太 (掛け持ち)',
      role: 'VOTER',
      enrollmentYear: 2024,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-voter1',
      studentIdHash: 'seed-hash-bassist',
      name: '灘 花子',
      role: 'VOTER',
      enrollmentYear: 2024,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-voter2',
      studentIdHash: 'seed-hash-drummer',
      name: '三宮 翔',
      role: 'VOTER',
      enrollmentYear: 2025,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-comment',
      studentIdHash: 'seed-hash-freshman',
      name: '元町 葵 (1回生/コメントのみ)',
      role: 'VOTER',
      enrollmentYear: 2026,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-unregistered',
      studentIdHash: 'seed-hash-newbie',
      name: '垂水 蓮 (対象外テスト)',
      role: 'VOTER',
      enrollmentYear: 2026,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const usedNames = new Set<string>(userList.map((u) => u.name));
  for (let i = 1; i <= 119; i++) {
    let fullName = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      const ln = LAST_NAMES[(i * 7 + attempt * 13 + Math.floor(rand() * 10)) % LAST_NAMES.length];
      const fn = FIRST_NAMES[(i * 11 + attempt * 5 + Math.floor(rand() * 10)) % FIRST_NAMES.length];
      const candidate = `${ln} ${fn}`;
      if (!usedNames.has(candidate)) {
        fullName = candidate;
        usedNames.add(candidate);
        break;
      }
    }
    if (!fullName) fullName = `部員 ${String(i).padStart(3, '0')}`;

    const year =
      i <= 35 ? 2024 : i <= 75 ? 2025 : 2026;
    const prefix = String(year).slice(-2);
    const role: 'ADMIN' | 'VOTER' = i === 1 || i === 22 ? 'ADMIN' : 'VOTER';

    userList.push({
      id: `u-m${String(i).padStart(3, '0')}`,
      studentIdHash: `seed-hash-${prefix}1${String(i).padStart(4, '0')}k`,
      name: fullName,
      role,
      enrollmentYear: year,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Auditions (All 4 statuses: CLOSED, ACTIVE, ENTRY_CLOSED, DRAFT)
  const auditionList: NewAudition[] = [
    {
      id: 'aud-2027-spring',
      title: '春一発ライブ',
      eventDate: '2027-04-10',
      deadline: '2027-04-03T23:59',
      entryDeadline: '2027-04-03T23:59',
      scoringDeadline: null,
      status: 'DRAFT',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 100.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'aud-2027-nbrf',
      title: 'mini-NBRF',
      eventDate: '2027-01-30',
      deadline: '2027-01-30T23:59',
      entryDeadline: '2027-01-22T23:59',
      scoringDeadline: '2027-01-30T23:59',
      status: 'ENTRY_CLOSED',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 100.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'aud-2027-winter',
      title: '冬イベ',
      eventDate: '2027-01-18',
      deadline: '2027-01-18T23:59',
      entryDeadline: '2027-01-10T23:59',
      scoringDeadline: '2027-01-18T23:59',
      status: 'ACTIVE',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 100.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'aud-2026-rokkosai',
      title: '六甲祭',
      eventDate: '2026-10-03',
      deadline: '2026-10-03T23:59',
      entryDeadline: '2026-09-25T23:59',
      scoringDeadline: '2026-10-03T23:59',
      status: 'CLOSED',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 100.0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // 3. Bands & Band Members
  const bandList: NewBand[] = [];
  const memberList: NewBandMember[] = [];
  const bandMemberSet = new Map<string, Set<string>>(); // bandId -> Set<userId>
  let bmSeq = 1;

  const addMember = (bandId: string, userId: string, instrument: string): boolean => {
    let set = bandMemberSet.get(bandId);
    if (!set) {
      set = new Set<string>();
      bandMemberSet.set(bandId, set);
    }
    if (set.has(userId)) return false;
    set.add(userId);
    memberList.push({
      id: `bm-${bmSeq++}`,
      bandId,
      userId,
      instrument,
      createdAt: now,
    });
    return true;
  };

  // 3a. 六甲祭 bands (32 bands, CLOSED)
  ROKKOSAI_BANDS.forEach((b, idx) => {
    const bandId = `b-rok-${idx + 1}`;
    const updater = userList[idx % 20].id;
    const bandTime = now - 86_400_000 * 47 - (ROKKOSAI_BANDS.length - idx) * 60_000;
    bandList.push({
      id: bandId,
      auditionId: 'aud-2026-rokkosai',
      name: b.name,
      performanceOrder: idx + 1,
      penaltyDeduction: b.penalty,
      updatedByUserId: updater,
      createdAt: bandTime,
      updatedAt: bandTime,
    });
  });

  // Map all 69 Excel rows to submitted SCORE_AND_COMMENT voters (0 unsubmitted):
  // row 20 (null at band 4,14,22) -> u-admin, row 10 (null at band 2,12,24) -> u-voter1,
  // row 19 (null at band 1,9) -> u-multi, row 41 (null at band 1,21) -> u-voter2,
  // remaining 65 rows -> extraMembers[0..64]
  const extraMembers = userList.slice(6); // 119 users
  const remainingMatrixIndices = Array.from({ length: EXCEL_SCORE_MATRIX.length }, (_, i) => i).filter(
    (i) => i !== 10 && i !== 19 && i !== 20 && i !== 41,
  );
  const rokkosaiScoreVoters: Array<{ userId: string; submitted: boolean; matrixIdx: number }> = [
    { userId: 'u-admin', submitted: true, matrixIdx: 20 },
    { userId: 'u-voter1', submitted: true, matrixIdx: 10 },
    { userId: 'u-multi', submitted: true, matrixIdx: 19 },
    { userId: 'u-voter2', submitted: true, matrixIdx: 41 },
    ...remainingMatrixIndices.map((mIdx, i) => ({
      userId: extraMembers[i].id,
      submitted: true,
      matrixIdx: mIdx,
    })),
  ];

  // Assign bandMembers for 六甲祭 directly from null cells in EXCEL_SCORE_MATRIX
  // so each band's member count matches the actual Excel missing-score pattern (2..8 members)
  const rokkosaiInsts = ['Vo', 'Gt', 'Ba', 'Dr', 'Key', 'Gt/Cho', 'Ba/Cho', 'Gt/Vo'];
  for (let bIdx = 0; bIdx < ROKKOSAI_BANDS.length; bIdx++) {
    const bandId = `b-rok-${bIdx + 1}`;
    let instIdx = 0;
    for (const v of rokkosaiScoreVoters) {
      if (EXCEL_SCORE_MATRIX[v.matrixIdx][bIdx] === null) {
        if (addMember(bandId, v.userId, rokkosaiInsts[(bIdx + instIdx) % rokkosaiInsts.length])) {
          instIdx++;
        }
      }
    }
  }

  // 3b. 冬イベ bands (14 bands, ACTIVE)
  WINTER_EVENT_BANDS.forEach((b, idx) => {
    const bandId = `b-win-${idx + 1}`;
    const bandTime = now - 86_400_000 * 3 - (WINTER_EVENT_BANDS.length - idx) * 60_000;
    bandList.push({
      id: bandId,
      auditionId: 'aud-2027-winter',
      name: b.name,
      performanceOrder: idx + 1,
      penaltyDeduction: b.penalty,
      updatedByUserId: idx % 3 === 0 ? 'u-admin' : extraMembers[idx].id,
      createdAt: bandTime,
      updatedAt: bandTime,
    });
  });

  addMember('b-win-1', 'u-multi', 'Gt/Vo');
  addMember('b-win-5', 'u-multi', 'Gt');
  addMember('b-win-2', 'u-voter1', 'Ba');
  addMember('b-win-3', 'u-admin', 'Vo');
  addMember('b-win-4', 'u-voter2', 'Dr');

  const winterPool = extraMembers.slice(0, 55);
  WINTER_EVENT_BANDS.forEach((_, idx) => {
    const bandId = `b-win-${idx + 1}`;
    const targetCount = 3 + ((idx + 1) % 3); // 3, 4, or 5
    const bandInsts = ['Vo', 'Gt', 'Ba', 'Dr', 'Key'];
    let instIdx = bandMemberSet.get(bandId)?.size ?? 0;
    let guard = 0;
    while ((bandMemberSet.get(bandId)?.size ?? 0) < targetCount && guard < 200) {
      guard++;
      const pick = winterPool[(idx * 7 + guard * 13 + Math.floor(rand() * 5)) % winterPool.length];
      if (addMember(bandId, pick.id, bandInsts[instIdx % bandInsts.length])) {
        instIdx++;
      }
    }
  });

  // 3c. mini-NBRF bands (10 bands, ENTRY_CLOSED)
  MINI_NBRF_BANDS.forEach((name, idx) => {
    const bandId = `b-nbrf-${idx + 1}`;
    const bandTime = now - 86_400_000 * 2 - (MINI_NBRF_BANDS.length - idx) * 60_000;
    bandList.push({
      id: bandId,
      auditionId: 'aud-2027-nbrf',
      name,
      performanceOrder: idx + 1,
      penaltyDeduction: 0,
      updatedByUserId: idx % 2 === 0 ? 'u-admin' : extraMembers[idx + 10].id,
      createdAt: bandTime,
      updatedAt: bandTime,
    });
  });

  addMember('b-nbrf-1', 'u-multi', 'Gt/Vo');
  addMember('b-nbrf-4', 'u-multi', 'Gt');
  addMember('b-nbrf-2', 'u-voter1', 'Ba');
  addMember('b-nbrf-3', 'u-voter2', 'Dr');
  addMember('b-nbrf-5', 'u-admin', 'Vo');

  const nbrfPool = extraMembers.slice(10, 65);
  MINI_NBRF_BANDS.forEach((_, idx) => {
    const bandId = `b-nbrf-${idx + 1}`;
    const targetCount = 3 + (idx % 3);
    const bandInsts = ['Vo', 'Gt', 'Ba', 'Dr', 'Key'];
    let instIdx = bandMemberSet.get(bandId)?.size ?? 0;
    let guard = 0;
    while ((bandMemberSet.get(bandId)?.size ?? 0) < targetCount && guard < 200) {
      guard++;
      const pick = nbrfPool[(idx * 5 + guard * 11) % nbrfPool.length];
      if (addMember(bandId, pick.id, bandInsts[instIdx % bandInsts.length])) {
        instIdx++;
      }
    }
  });

  // 3d. 春一発ライブ bands (8 bands, DRAFT)
  SPRING_DRAFT_BANDS.forEach((name, idx) => {
    const bandId = `b-spr-${idx + 1}`;
    const bandTime = now - (SPRING_DRAFT_BANDS.length - idx) * 60_000;
    bandList.push({
      id: bandId,
      auditionId: 'aud-2027-spring',
      name,
      performanceOrder: idx + 1,
      penaltyDeduction: 0,
      updatedByUserId: idx === 0 ? 'u-voter1' : userList[(idx * 3) % 30].id,
      createdAt: bandTime,
      updatedAt: bandTime,
    });
  });

  const springPool = extraMembers.slice(20, 90);
  addMember('b-spr-1', 'u-voter1', 'Ba');
  addMember('b-spr-2', 'u-admin', 'Vo');
  SPRING_DRAFT_BANDS.forEach((_, idx) => {
    const bandId = `b-spr-${idx + 1}`;
    const targetCount = 4;
    const bandInsts = ['Vo', 'Gt', 'Ba', 'Dr'];
    let instIdx = bandMemberSet.get(bandId)?.size ?? 0;
    let guard = 0;
    while ((bandMemberSet.get(bandId)?.size ?? 0) < targetCount && guard < 200) {
      guard++;
      const pick = springPool[(idx * 9 + guard * 11) % springPool.length];
      if (addMember(bandId, pick.id, bandInsts[instIdx % bandInsts.length])) {
        instIdx++;
      }
    }
  });

  // 4. Audition Voters & Scores
  const voterList: NewAuditionVoter[] = [];
  const scoreList: NewScore[] = [];
  let avSeq = 1;
  let scSeq = 1;

  // --- 4a. 六甲祭 (CLOSED, exact 69x32 Excel matrix, 0 unsubmitted) ---
  const rokkosaiSubmittedAtBase = now - 86_400_000 * 47;
  const rokkosaiCommentVoters: Array<{ userId: string; submitted: boolean }> = [
    { userId: 'u-comment', submitted: true },
  ];
  for (let i = 95; i < 112; i++) {
    rokkosaiCommentVoters.push({
      userId: extraMembers[i].id,
      submitted: true,
    });
  }

  for (const v of rokkosaiScoreVoters) {
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2026-rokkosai',
      userId: v.userId,
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted: true,
      submittedAt: rokkosaiSubmittedAtBase - Math.floor(rand() * 3600_000),
      generalFeedback: GENERAL_FEEDBACKS[Math.floor(rand() * GENERAL_FEEDBACKS.length)],
    });
  }
  for (const v of rokkosaiCommentVoters) {
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2026-rokkosai',
      userId: v.userId,
      permissionType: 'COMMENT_ONLY',
      isSubmitted: true,
      submittedAt: rokkosaiSubmittedAtBase - Math.floor(rand() * 3600_000),
      generalFeedback:
        FRESHMAN_GENERAL_FEEDBACKS[Math.floor(rand() * FRESHMAN_GENERAL_FEEDBACKS.length)],
    });
  }

  // Insert exact Excel scores for the 69 submitted SCORE_AND_COMMENT voters
  for (const v of rokkosaiScoreVoters) {
    for (let bIdx = 0; bIdx < ROKKOSAI_BANDS.length; bIdx++) {
      const bandId = `b-rok-${bIdx + 1}`;
      if (bandMemberSet.get(bandId)?.has(v.userId)) continue;

      const total = EXCEL_SCORE_MATRIX[v.matrixIdx][bIdx];
      if (total === null) continue;

      const { techScore, charmScore } = splitTotalScore(
        total,
        ROKKOSAI_BANDS[bIdx].techBias,
        rand,
      );
      scoreList.push({
        id: `sc-${scSeq++}`,
        auditionId: 'aud-2026-rokkosai',
        bandId,
        evaluatorUserId: v.userId,
        techScore,
        charmScore,
        comment: pickComment(total, rand),
        createdAt: rokkosaiSubmittedAtBase,
        updatedAt: rokkosaiSubmittedAtBase,
      });
    }
  }

  // Insert mock comments for submitted COMMENT_ONLY 六甲祭 voters (techScore=null, charmScore=null)
  for (const v of rokkosaiCommentVoters) {
    for (let bIdx = 0; bIdx < ROKKOSAI_BANDS.length; bIdx++) {
      const bandId = `b-rok-${bIdx + 1}`;
      if (bandMemberSet.get(bandId)?.has(v.userId)) continue;
      if (v.userId !== 'u-comment' && rand() > 0.78) continue;
      scoreList.push({
        id: `sc-${scSeq++}`,
        auditionId: 'aud-2026-rokkosai',
        bandId,
        evaluatorUserId: v.userId,
        techScore: null,
        charmScore: null,
        comment: FRESHMAN_COMMENTS[Math.floor(rand() * FRESHMAN_COMMENTS.length)],
        createdAt: rokkosaiSubmittedAtBase,
        updatedAt: rokkosaiSubmittedAtBase,
      });
    }
  }

  // --- 4b. 冬イベ (ACTIVE, realistic in-progress scoring state) ---
  const addWinterScore = (userId: string, bIdx: number, bias: number, scale: number) => {
    const bandId = `b-win-${bIdx + 1}`;
    if (bandMemberSet.get(bandId)?.has(userId)) return;
    const b = WINTER_EVENT_BANDS[bIdx];
    const total = clamp(
      Math.round(72 + (b.baseMean - 72) * scale + bias + (rand() - 0.5) * 10),
      35,
      99,
    );
    const { techScore, charmScore } = splitTotalScore(total, b.techBias, rand);
    scoreList.push({
      id: `sc-${scSeq++}`,
      auditionId: 'aud-2027-winter',
      bandId,
      evaluatorUserId: userId,
      techScore,
      charmScore,
      comment: pickComment(total, rand),
      createdAt: now - 3600_000,
      updatedAt: now - 1800_000,
    });
  };

  // Demo accounts in 冬イベ:
  // - u-admin, u-voter2: submitted
  // - u-multi: unsubmitted with partial draft scores (first 5 non-own bands)
  // - u-voter1: unsubmitted with 0 scores
  // - u-comment: COMMENT_ONLY unsubmitted with partial comments (first 4 bands)
  // - u-unregistered: intentionally omitted from auditionVoters
  for (const userId of ['u-admin', 'u-voter2']) {
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2027-winter',
      userId,
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted: true,
      submittedAt: now - Math.floor(rand() * 3600_000),
      generalFeedback: GENERAL_FEEDBACKS[Math.floor(rand() * GENERAL_FEEDBACKS.length)],
    });
    const voterBias = (rand() - 0.5) * 10;
    const voterScale = 0.8 + rand() * 0.4;
    for (let bIdx = 0; bIdx < WINTER_EVENT_BANDS.length; bIdx++) {
      addWinterScore(userId, bIdx, voterBias, voterScale);
    }
  }

  voterList.push({
    id: `av-${avSeq++}`,
    auditionId: 'aud-2027-winter',
    userId: 'u-multi',
    permissionType: 'SCORE_AND_COMMENT',
    isSubmitted: false,
    submittedAt: null,
    generalFeedback: '',
  });
  let multiDrafted = 0;
  for (let bIdx = 0; bIdx < WINTER_EVENT_BANDS.length && multiDrafted < 5; bIdx++) {
    const bandId = `b-win-${bIdx + 1}`;
    if (bandMemberSet.get(bandId)?.has('u-multi')) continue;
    addWinterScore('u-multi', bIdx, 2, 1.0);
    multiDrafted++;
  }

  voterList.push({
    id: `av-${avSeq++}`,
    auditionId: 'aud-2027-winter',
    userId: 'u-voter1',
    permissionType: 'SCORE_AND_COMMENT',
    isSubmitted: false,
    submittedAt: null,
    generalFeedback: '',
  });

  voterList.push({
    id: `av-${avSeq++}`,
    auditionId: 'aud-2027-winter',
    userId: 'u-comment',
    permissionType: 'COMMENT_ONLY',
    isSubmitted: false,
    submittedAt: null,
    generalFeedback: '',
  });
  for (let bIdx = 0; bIdx < 4; bIdx++) {
    const bandId = `b-win-${bIdx + 1}`;
    if (bandMemberSet.get(bandId)?.has('u-comment')) continue;
    scoreList.push({
      id: `sc-${scSeq++}`,
      auditionId: 'aud-2027-winter',
      bandId,
      evaluatorUserId: 'u-comment',
      techScore: null,
      charmScore: null,
      comment: FRESHMAN_COMMENTS[Math.floor(rand() * FRESHMAN_COMMENTS.length)],
      createdAt: now - 3600_000,
      updatedAt: now - 1800_000,
    });
  }

  // General members in 冬イベ: 45 submitted, 12 partial draft, 10 not started
  const winterGeneralScoreVoters = extraMembers.slice(0, 67);
  winterGeneralScoreVoters.forEach((u, idx) => {
    const isSubmitted = idx < 45;
    const isDraft = idx >= 45 && idx < 57;
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2027-winter',
      userId: u.id,
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted,
      submittedAt: isSubmitted ? now - Math.floor(rand() * 7200_000) : null,
      generalFeedback: isSubmitted
        ? GENERAL_FEEDBACKS[Math.floor(rand() * GENERAL_FEEDBACKS.length)]
        : '',
    });

    if (!isSubmitted && !isDraft) return;
    const voterBias = (rand() - 0.5) * 14;
    const voterScale = 0.75 + rand() * 0.5;
    const limit = isSubmitted ? WINTER_EVENT_BANDS.length : 4 + (idx % 5);
    for (let bIdx = 0; bIdx < limit; bIdx++) {
      if (isSubmitted && rand() > 0.94) continue;
      addWinterScore(u.id, bIdx, voterBias, voterScale);
    }
  });

  // General COMMENT_ONLY voters in 冬イベ: 8 submitted, 4 unsubmitted
  const winterGeneralCommentVoters = extraMembers.slice(95, 107);
  winterGeneralCommentVoters.forEach((u, idx) => {
    const isSubmitted = idx < 8;
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2027-winter',
      userId: u.id,
      permissionType: 'COMMENT_ONLY',
      isSubmitted,
      submittedAt: isSubmitted ? now - Math.floor(rand() * 7200_000) : null,
      generalFeedback: isSubmitted
        ? FRESHMAN_GENERAL_FEEDBACKS[Math.floor(rand() * FRESHMAN_GENERAL_FEEDBACKS.length)]
        : '',
    });
    if (!isSubmitted) return;
    for (let bIdx = 0; bIdx < WINTER_EVENT_BANDS.length; bIdx++) {
      const bandId = `b-win-${bIdx + 1}`;
      if (bandMemberSet.get(bandId)?.has(u.id)) continue;
      if (rand() > 0.75) continue;
      scoreList.push({
        id: `sc-${scSeq++}`,
        auditionId: 'aud-2027-winter',
        bandId,
        evaluatorUserId: u.id,
        techScore: null,
        charmScore: null,
        comment: FRESHMAN_COMMENTS[Math.floor(rand() * FRESHMAN_COMMENTS.length)],
        createdAt: now - 3600_000,
        updatedAt: now - 1800_000,
      });
    }
  });

  // --- 4c. mini-NBRF (ENTRY_CLOSED, pre-assigned voters, 0 scores) ---
  const nbrfScoreVoterIds = [
    'u-admin',
    'u-multi',
    'u-voter1',
    'u-voter2',
    ...extraMembers.slice(0, 46).map((u) => u.id),
  ];
  for (const userId of nbrfScoreVoterIds) {
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2027-nbrf',
      userId,
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted: false,
      submittedAt: null,
      generalFeedback: '',
    });
  }
  for (const userId of ['u-comment', ...extraMembers.slice(95, 104).map((u) => u.id)]) {
    voterList.push({
      id: `av-${avSeq++}`,
      auditionId: 'aud-2027-nbrf',
      userId,
      permissionType: 'COMMENT_ONLY',
      isSubmitted: false,
      submittedAt: null,
      generalFeedback: '',
    });
  }

  return {
    users: userList,
    auditions: auditionList,
    bands: bandList,
    bandMembers: memberList,
    auditionVoters: voterList,
    scores: scoreList,
  };
}
