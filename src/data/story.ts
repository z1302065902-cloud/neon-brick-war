/**
 * Campaign data: ten levels and the bilingual story that ties them together.
 *
 * Every player-facing string in the game goes through here as `[en, zh]`, so the language
 * toggle is a single flag rather than a per-widget concern. Nothing else in the codebase
 * should hard-code display text.
 */

import type { StructureId } from '../entities/StructureFigure';

export type Lang = 'en' | 'zh';

/** A display string: English first, Chinese second. */
export type Localized = readonly [string, string];

export const t = (text: Localized, lang: Lang): string => (lang === 'zh' ? text[1] : text[0]);

export type LevelChapter = {
  /** Shown in the objective panel. */
  name: Localized;
  /** One-line briefing before the level starts. */
  briefing: Localized;
  /** Two or three lines of story shown during the transition. */
  narration: readonly Localized[];
  /** Outpost labels, A → C. */
  outposts: readonly [Localized, Localized, Localized];
  /** Arena palette. */
  floorColor: string;
  buildingColor: string;
  neonA: string;
  neonB: string;
  sky: string;
  boss: Localized;
  /** Which brick family the buildings in this level are made from. */
  structures: StructureId;
};

export const CAMPAIGN_TITLE: Localized = ['NEON BRICK WAR', '霓虹积木战争'];

export const LEVELS: readonly LevelChapter[] = [
  {
    name: ['Docks: First Landing', '码头：初次登陆'],
    briefing: ['Your squad ships out as flat-packed crates. Build up, push inland.', '你的小队是被压成平板打包运来的。把自己拼装起来，向内陆推进。'],
    narration: [
      ['The docks fell in a single night.', '码头在一夜之间失守。'],
      ['You were still a box of bricks when it started.', '事情开始时，你还只是一箱积木。'],
    ],
    outposts: [
      ['Gate', '大门'],
      ['Container Yard', '集装箱场'],
      ['Crane Deck', '吊车甲板'],
    ],
    floorColor: '#4a8ec7',
    buildingColor: '#8ba7c0',
    neonA: '#1ec8ff',
    neonB: '#ff2d6a',
    sky: '#6eb6ea',
    boss: ['Armored Loader', '装甲装卸机'],
    structures: 'mushroom',
  },
  {
    name: ['Warehouse Row', '仓库区'],
    briefing: ['The stacks are a maze. Something big is moving between them.', '货架之间像迷宫。有东西在里面移动。'],
    narration: [
      ['Crates marked for the core, stacked to the ceiling.', '打上核心标记的箱子，一直堆到天花板。'],
      ['Someone was expecting us.', '有人料到我们会来。'],
    ],
    outposts: [
      ['Loading Bay', '卸货区'],
      ['Sorting Floor', '分拣场'],
      ['Cold Store', '冷库'],
    ],
    floorColor: '#3f7fae',
    buildingColor: '#7e9cb5',
    neonA: '#2de2ff',
    neonB: '#ffb703',
    sky: '#5ea8d8',
    boss: ['Cargo Hauler', '重型搬运机'],
    structures: 'fruit',
  },
  {
    name: ['Skybridge', '天桥'],
    briefing: ['Nothing here stays built. Move before the bridge comes down.', '这里没有东西是固定造好的。桥塌之前走。'],
    narration: [
      ['The bridge rebuilds itself faster than we can cross it.', '桥自我重建的速度比我们通过的速度还快。'],
      ['It is not defending the crossing. It is rebuilding it.', '它不是要守住桥，它是在重建桥。'],
    ],
    outposts: [
      ['Approach', '引桥'],
      ['Span', '主跨'],
      ['Far Anchor', '远端锚点'],
    ],
    floorColor: '#6b5aa0',
    buildingColor: '#9d92c4',
    neonA: '#c77dff',
    neonB: '#54f0a8',
    sky: '#d7c2ff',
    boss: ['Drone Carrier', '无人机母舰'],
    structures: 'gear',
  },
  {
    name: ['Ad Tower', '广告塔'],
    briefing: ['Climb the tower. Cut the signal and the drones go blind.', '爬上塔。切断信号，无人机就成了瞎子。'],
    narration: [
      ['Every screen in the city is playing the same faces.', '全城每一块屏幕都在播放同一张脸。'],
      ['They are not warnings. They are blueprints.', '那些不是警告，是图纸。'],
    ],
    outposts: [
      ['Lobby', '塔基大堂'],
      ['Signal Floor', '信号层'],
      ['Transmitter', '发射台'],
    ],
    floorColor: '#5d4a92',
    buildingColor: '#8b7fb8',
    neonA: '#c77dff',
    neonB: '#ff9f43',
    sky: '#c3aaff',
    boss: ['Signal Warden', '信号典狱长'],
    structures: 'antenna',
  },
  {
    name: ['Alley Maze', '巷道迷阵'],
    briefing: ['Tight quarters. They build cover and tear it down again.', '空间很小。它们一边造掩体一边拆。'],
    narration: [
      ['We have not seen a builder yet.', '我们还没见过建造者。'],
      ['We have only seen what it leaves behind.', '我们只见过它留下的东西。'],
    ],
    outposts: [
      ['East Cut', '东巷口'],
      ['Crossing', '十字路口'],
      ['Dead End', '死巷'],
    ],
    floorColor: '#4a4470',
    buildingColor: '#8a86a8',
    neonA: '#54f0a8',
    neonB: '#ff2d6a',
    sky: '#9d94c9',
    boss: ['Rig Welder', '轨道焊接机'],
    structures: 'crate',
  },
  {
    name: ['Foundry', '铸造厂'],
    briefing: ['They pour the bricks that rebuild the city. Shut the line down.', '它们在浇筑用来重建城市的积木。关掉产线。'],
    narration: [
      ['A single brick stacks seamlessly on any other.', '任意两块积木可以无缝堆叠。'],
      ['That is not construction. That is a language.', '那不是施工，那是一套语言。'],
    ],
    outposts: [
      ['Intake', '进料口'],
      ['Pour Line', '浇铸线'],
      ['Mould Deck', '模具台'],
    ],
    floorColor: '#8a5a2a',
    buildingColor: '#c2a074',
    neonA: '#ff9f43',
    neonB: '#ff2d6a',
    sky: '#e8b878',
    boss: ['Slag Behemoth', '熔渣巨像'],
    structures: 'pipe',
  },
  {
    name: ['Data Spire', '数据尖塔'],
    briefing: ['The whole city is one instruction, repeated. Find the top.', '整座城市就是一条反复执行的指令。找到顶层。'],
    narration: [
      ['We finally read the signal. It is one word.', '我们终于破译了信号。只有一个词。'],
      ['"Again."', '"再来。"'],
    ],
    outposts: [
      ['Base', '塔基'],
      ['Archive', '档案层'],
      ['Spire Top', '塔顶'],
    ],
    floorColor: '#2f5a7a',
    buildingColor: '#6f94ad',
    neonA: '#2de2ff',
    neonB: '#c77dff',
    sky: '#5f9fc4',
    boss: ['Archive Sentinel', '档案哨卫'],
    structures: 'dome',
  },
  {
    name: ['Coolant Hall', '冷却厅'],
    briefing: ['The core drowns itself in coolant. Walk where it cannot reach.', '核心用冷却液淹没自己。走在它够不到的地方。'],
    narration: [
      ['The core is not a machine. It is a single brick.', '核心不是机器。它是一块积木。'],
      ['Everything else grew out of it.', '其他一切都从它长出来。'],
    ],
    outposts: [
      ['Pumps', '泵组'],
      ['Flood Line', '溢流线'],
      ['Core Approach', '核心引道'],
    ],
    floorColor: '#2f6f7a',
    buildingColor: '#7aa8ab',
    neonA: '#54f0a8',
    neonB: '#2de2ff',
    sky: '#6fc0c8',
    boss: ['Coolant Wyrm', '冷却长蛇'],
    structures: 'crystal',
  },
  {
    name: ['Perimeter Wall', '外围高墙'],
    briefing: ['Last wall before the core. They know we are here now.', '核心前最后一道墙。它们已经知道我们到了。'],
    narration: [
      ['It stopped rebuilding.', '它停止重建了。'],
      ['It is dismantling instead.', '它开始拆了。'],
    ],
    outposts: [
      ['Breach', '突破口'],
      ['Rampart', '壁垒'],
      ['Inner Gate', '内门'],
    ],
    floorColor: '#7a2f42',
    buildingColor: '#c08a9c',
    neonA: '#ff2d6a',
    neonB: '#ffb703',
    sky: '#e58a9c',
    boss: ['Wall Colossus', '城墙巨像'],
    structures: 'billboard',
  },
  {
    name: ['Core Reactor', '核心反应堆'],
    briefing: ['One brick. Pull it and the whole city comes apart.', '一块积木。抽掉它，整座城市就会解体。'],
    narration: [
      ['Pull one brick and it all comes down.', '抽掉一块，全体崩塌。'],
      ['That is how it built. That is how it ends.', '它靠这个建起一切。也靠这个终结。'],
    ],
    outposts: [
      ['Outer Ring', '外环'],
      ['Control Ring', '控制环'],
      ['Core', '核心'],
    ],
    floorColor: '#6a2a44',
    buildingColor: '#b8839a',
    neonA: '#ff2d6a',
    neonB: '#c77dff',
    sky: '#ffb7c8',
    boss: ['Core Guardian', '核心守卫'],
    structures: 'scaffold',
  },
];

export const TOTAL_LEVELS = LEVELS.length;

/** End-of-campaign card. */
export const CAMPAIGN_END: readonly Localized[] = [
  ['You pulled one brick.', '你抽掉了一块积木。'],
  ['Ten thousand districts come apart in a single night —', '一万个城区在一夜之间解体——'],
  ['exactly the way you did when you first landed.', '和你当初降落时的样子一模一样。'],
  ['CAMPAIGN COMPLETE', '战役完成'],
];
