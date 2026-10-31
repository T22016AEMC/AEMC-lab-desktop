/** 養殖場的數值調整參數，集中在這裡方便微調（介面上的「點數」一律叫「金幣」，內部欄位名稱仍是 points） */
export const BALANCE = {
  /** 新存檔的初始金幣（已有存檔保留自己的數量，不補發） */
  startPoints: 50,
  dailyBonus: 5,
  /** 領養後滿幾天算成年 */
  adultDays: 3,
  /** 每小時下降量 */
  decayPerHour: { satiety: 1.7, mood: 1.3, cleanliness: 1.1 },
  /** 飽食度很低時，心情額外下降的倍率 */
  moodExtraDecayWhenHungry: 0.5,
  /** 離開網站期間補算的下限（已經低於此值的不再往下掉） */
  offlineFloor: 20,
  /** 低於此值會冒出提示泡泡 */
  lowThreshold: 30,

  feed: { satiety: 20, mood: 3, fatAbove: 85, fatGain: 4 },
  pet: { mood: 8 },
  /** 睡夢中被撫摸：不會醒來，心情小幅上升 */
  petSleeping: { mood: 5 },
  /** 水池洗澡（氣泡選單的洗澡與拖曳到水池都一樣）：狗開心、貓小幅不開心 */
  bath: { cleanliness: 40, moodDog: 6, moodCat: -3 },
  walk: { weight: -5, mood: 12, satiety: -8, cleanliness: -10 },
  groom: { cleanliness: 20, mood: 10 },
  /**
   * 玩耍（v3.5.0，目前只有狗的丟球）。撿回 n 次（完整叼回放下才算）的結算，0 次完全不加（金幣也不退）：
   *  心情 = min(mood.max, mood.base + mood.perCatch × n)；體重 = max(weight.min, weight.perCatch × n)；飽食度 = max(satiety.min, satiety.perCatch × n)；清潔度不動。
   * 比散步（心情 +12、體重 −5、飽食 −8、清潔 −10）輕：30 秒內約撿回 4～5 次，心情約 +8～9.5。
   * seconds：玩耍時間（引擎的 dt 累加，分頁在背景時暫停）；graceSeconds：時間到時已經叼起的那一次最多再給幾秒做完；
   * minThrow：最短丟球距離（邏輯像素）；maxCatches：撿回次數上限。timing 是各階段時間（秒），球飛行時間 = clamp(flightBase + 距離 × flightPerPx)。
   */
  play: {
    cost: 1,
    seconds: 30,
    graceSeconds: 5,
    maxCatches: 10,
    minThrow: 30,
    mood: { base: 2, perCatch: 1.5, max: 10 },
    weight: { perCatch: -0.4, min: -3 },
    satiety: { perCatch: -0.8, min: -5 },
    timing: { reaction: 0.2, grab: 0.3, drop: 0.4, cheer: 1.2, flightBase: 0.45, flightPerPx: 1 / 400, flightMin: 0.5, flightMax: 0.95, bounce: 0.4 },
    /** 追球、叼回的速度（乘上狗的基本速度）；追球或叼回超過 stuckSeconds 還沒到就直接傳送到目標（保險，避免卡住） */
    chaseSpeedMul: 2.4,
    returnSpeedMul: 1.6,
    stuckSeconds: 10,
    /** 不合法的點擊：提示訊息最短間隔（毫秒） */
    invalidToastGapMs: 1500,
  },
  /**
   * 挖寶與尋寶（v3.6.0）。玩耍框架的另外兩個玩具：狗挖寶（dig）、貓尋寶（hunt），都是 30 秒、1 金幣（選了玩具就扣，和丟球一樣），一局約 5 次。
   * 每次挖／尋留下一個「寶物」（狗的土堆、貓叼回來的布包）；玩家點它才揭曉，10 分鐘沒點自動揭曉；土堆與布包共用 holdMax 個上限，滿了就不能開始。
   * 抽選在「揭曉當下」才做：
   *  1. 先擲「結果」：金幣（銅板／銀幣／金幣，不算收藏）、收藏品（依稀有度）、空；rarity 的機率就是收藏品的總機率，剩下的是空。
   *  2. 收藏品：先擲稀有度，同稀有度內各項平均；70%（antiDup）的機率只從「尚未收集」的項目挑，已收集的仍可重複抽到。
   * 金幣不算收藏，每日（以揭曉當下的本機日期，貓狗共用）最多 dailyCoinMax 枚；超過後只掉收藏品或空（剩下不到面額就只給剩下的）。
   */
  dig: {
    cost: 1,
    seconds: 30,
    /** 時間到時已經開始的那一次最多再給幾秒做完 */
    graceSeconds: 4,
    /** 一局最多留下幾個寶物 */
    maxFinds: 8,
    /** 土堆與布包同時最多幾個；到期未點自動揭曉（毫秒） */
    holdMax: 8,
    autoRevealMs: 600_000,
    /** 結果機率（收藏品的總機率是 rarity 四項的和） */
    coin: { bronze: 0.18, silver: 0.05, gold: 0.01 },
    coinValue: { bronze: 1, silver: 2, gold: 5 },
    rarity: { common: 0.34, uncommon: 0.1, rare: 0.035, legendary: 0.005 },
    /** 抽到某稀有度後，這個機率只從尚未收集的項目挑；套組抽到後，分片也用同一個機率偏向缺的那一片 */
    antiDup: 0.7,
    dailyCoinMax: 10,
    /**
     * 低視窗的寶物上限 = min(holdMax, 可放面積 ÷ areaPerFind)。可放面積（finds.ts 的 grassArea）只算「土堆外框離所有障礙物都夠遠」的格點，
     * 已經扣掉建築、花叢、裝飾物與邊緣的空隙，所以每個寶物需要的面積比以前（草地面積 ÷ 2500）小很多：一個土堆外框 26×15 加上四周 8 像素空隙
     * 約 34×23 ≈ 800，再留隨機亂放浪費的空間 → 1200。實測（17 種視窗＋極端視窗，每種 150 次隨機亂放）：上限都不超過「最差一次塞得下的個數」，
     * 所以達到上限之前一定找得到位置。
     */
    areaPerFind: 1200,
    /**
     * 寶物的擺放空隙（邏輯像素）：土堆（約 25×15）與布包（12×13）的外框，離下列東西的外框至少要有 clearance 的空隙——
     * 建築素材外框（狗窩、食盆水盆、貓跳台、住家、鐘樓含底部花叢、路燈）、水池與洗澡通道、樹根、石頭／蘑菇／花叢等裝飾物、其他寶物。
     * 8 像素 = 約一個土堆高度的一半，在最小的放大倍率（S=2）下也有 16 個螢幕像素的縫，肉眼看得出「沒有貼著」；再大草地就放不下 8 個了（見 CHANGELOG 的上限表）。
     * 外框半寬（halfW）和高度（h）是素材實際大小；寶物上方的「可揭曉」星星不算外框。
     */
    clearance: 8,
    box: { mound: { halfW: 13, h: 15 }, bundle: { halfW: 7, h: 13 } },
    /** 離別的寵物的最小間隔（橢圓半徑，邏輯像素） */
    petGap: { x: 22, y: 8 },
    /** 結算（和丟球同一套）：找到 n 個，0 個完全不加（金幣也不退） */
    mood: { base: 2, perFind: 1.5, max: 8 },
    weight: { perFind: -0.3, min: -2 },
    satiety: { perFind: -0.6, min: -4 },
    /** 狗挖寶各階段時間（秒）與速度倍率；超過 stuckSeconds 還沒走到就直接傳送（保險） */
    dog: { speedMul: 1.6, digSeconds: 3.2, markSeconds: 0.8, maxReach: 150, stuckSeconds: 9 },
    /** 貓尋寶：跑去、蹲、撲、叼回、放下。速度倍率 speedMul（貓基本速度只有狗的 63%，要加快才在 30 秒內走得完），離原位最遠 maxRange */
    cat: { speedMul: 2.5, maxRange: 120, crouchSeconds: 1.2, pounceSeconds: 0.45, dropSeconds: 0.8, markSeconds: 0.9, stuckSeconds: 9 },
    /** 事件：罰款與違約金（一次性，不扣到負數）、傳說集齊獎勵 */
    events: { fine: 10, legendReward: 100 },
    /** 揭曉動畫（秒） */
    revealSeconds: 1.1,
  },
  /** 叫醒：貓醒來不開心（心情下降），狗醒來很開心（心情不變） */
  wake: { moodCat: -15, moodDog: 0 },
  /**
   * 陸地寵物的睡覺時間（本機時間，跨午夜）：startHour 點到隔天 endHour 點。
   * idleMinutes：被叫醒或互動後，若仍在睡覺時間內，沒有任何互動超過這麼久就會自己回去睡。
   * 天空的日夜變化不受影響，仍依實際時間。
   */
  sleep: { startHour: 23, endHour: 6, idleMinutes: 10 },

  gift: {
    moodThreshold: 70,
    dailyMax: 4,
    /** 每分鐘（線上時）擲一次的機率 */
    chancePerMinute: 0.08,
    minPoints: 1,
    maxPoints: 3,
  },

  /**
   * 賺金幣（純前端、無法防作弊，之後帳號與雲端階段再處理）。
   * 冷卻與每日上限的時間一律用遊戲時間來源（overrides.gameNow），每日進度以本地日期 00:00 重置。
   */
  earn: {
    /** 從啟動台開啟使用者的程式：每個程式每小時最多一次，所有程式合計每天上限 */
    program: { coin: 3, cooldownMs: 3_600_000, dailyMax: 10 },
    /** 玩遊戲：每局達到「達標條件」給的金幣，所有遊戲合計每天上限 */
    game: { coin: 1, dailyMax: 5 },
  },
  /**
   * 5 個遊戲的達標條件（遊戲結束時判定一次）。目標：容易達成、但不會一開局就給。
   *  - minesweeper：獲勝（任一難度清完所有安全格）
   *  - game2048：最大方塊達到 512
   *  - snake：吃到 10 顆蘋果（分數 = 蘋果數）
   *  - pinball：3 顆球合計 1500 分（撞一次彈跳器 100 分）
   *  - shooter：1500 分（約打下 12 架小兵，或撐到第 2～3 波）
   */
  gameGoals: {
    'game-minesweeper': { kind: 'win' },
    'game-2048': { kind: 'maxTile', min: 512 },
    'game-snake': { kind: 'score', min: 10 },
    'game-pinball': { kind: 'score', min: 1500 },
    'game-shooter': { kind: 'score', min: 1500 },
  },

  /**
   * 建築（本版開放：食盆水盆、狗窩、貓跳台；其餘 5 種 v3.3.0 才開放）。價格單位是金幣。
   * 行為只決定「動作名稱與位置」，畫面由 pixel/ 負責。
   */
  buildings: {
    price: { bowls: 10, kennel: 20, catTree: 20 },
    /** 食盆水盆：飽食度低於 threshold 且沒在睡覺、洗澡、被操作時，自己走去吃 */
    bowls: {
      threshold: 60,
      /** 每隻寵物每天的份量：全部寵物共用一池，今天的上限 = 寵物數 × 這個值（本地日期 00:00 補滿；當天領養新寵物，上限立刻多這麼多） */
      portionsPerPet: 2,
      /** 每份回復的飽食度（手動餵食是 +20，要花 1 金幣） */
      satiety: 15,
      /** 同時最多幾隻在吃 */
      capacity: 2,
      /** 吃一份的時間（秒） */
      eatSeconds: 2.6,
      /** 吃完之後，同一隻至少隔這麼久（秒）才會再去 */
      revisitSeconds: 45,
    },
    /** 狗窩：夜間睡覺與下雨躲雨，最多 2 隻狗 */
    kennel: { capacity: 2 },
    /** 貓跳台：夜間睡覺與下雨躲雨，最多 2 隻貓。之後若有爬台素材再加爬上去的動畫（本版只站在旁邊） */
    catTree: { capacity: 2 },
    /** 下雨時躲雨：下雨後每隻隨機等這麼久（秒）才出發；雨停後再待這麼久才離開 */
    shelter: { startDelay: [0.5, 6], leaveDelay: [2, 6] },
  },
  /**
   * 睡覺時的心情回復（每小時，只在線上即時結算，離線期間不算）：
   * 一般睡覺回復 base（抵銷心情下降），睡在狗窩／貓跳台旁邊乘以 buildingMul。
   */
  sleepMood: { base: 1.7, buildingMul: 2.5 },

  weatherBlockHours: 4,
  /** 天氣權重：晴、多雲、雨、雪 */
  weatherWeights: { sunny: 40, cloudy: 25, rain: 20, snow: 15 },

  /** 存檔節流（毫秒）與數值結算間隔（秒） */
  saveDebounceMs: 600,
  statTickSeconds: 10,
} as const

/** 貓狗合計最多幾隻 */
export const PET_CAPACITY = 6
