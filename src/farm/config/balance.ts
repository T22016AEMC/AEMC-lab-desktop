/** 養殖場的數值調整參數，集中在這裡方便微調 */
export const BALANCE = {
  startPoints: 30,
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

  weatherBlockHours: 4,
  /** 天氣權重：晴、多雲、雨、雪 */
  weatherWeights: { sunny: 40, cloudy: 25, rain: 20, snow: 15 },

  /** 存檔節流（毫秒）與數值結算間隔（秒） */
  saveDebounceMs: 600,
  statTickSeconds: 10,
} as const

/** 貓狗合計最多幾隻 */
export const PET_CAPACITY = 6
