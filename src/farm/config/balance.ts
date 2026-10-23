/** 養殖場的數值調整參數，集中在這裡方便微調（介面上的「點數」一律叫「金幣」，內部欄位名稱仍是 points） */
export const BALANCE = {
  /** 新存檔的初始金幣（已有存檔保留自己的數量，不補發） */
  startPoints: 50,
  dailyBonus: 5,
  /** 領養後滿幾天算成年 */
  adultDays: 3,
  /** 每小時下降量 */
  decayPerHour: { satiety: 4, mood: 3, cleanliness: 2.5 },
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
      /** 每天份量（本地日期 00:00 補滿），所有寵物共用 */
      portionsPerDay: 6,
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
  sleepMood: { base: 4, buildingMul: 2.5 },

  weatherBlockHours: 4,
  /** 天氣權重：晴、多雲、雨、雪 */
  weatherWeights: { sunny: 40, cloudy: 25, rain: 20, snow: 15 },

  /** 存檔節流（毫秒）與數值結算間隔（秒） */
  saveDebounceMs: 600,
  statTickSeconds: 10,
} as const

/** 貓狗合計最多幾隻 */
export const PET_CAPACITY = 6
