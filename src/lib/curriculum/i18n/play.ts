import type { ShippedLocale } from "../../languages.ts";
import type { GoalTheme, ProvinceCode } from "../pack.ts";

export type PlayTemplate = {
  title: string;
  materials: string;
  steps: readonly [string, string, string];
};

export type PlayPack = {
  place: Record<ProvinceCode, string>;
  prop: Record<ProvinceCode, string>;
  templates: Record<GoalTheme, PlayTemplate>;
};

const provinces: ProvinceCode[] = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];

function row(values: readonly string[]): Record<ProvinceCode, string> {
  const out = {} as Record<ProvinceCode, string>;
  provinces.forEach((code, index) => {
    out[code] = values[index] || "";
  });
  return out;
}

function pack(
  place: readonly string[],
  prop: readonly string[],
  templates: Record<GoalTheme, PlayTemplate>,
): PlayPack {
  return { place: row(place), prop: row(prop), templates };
}

export const PLAY: Record<ShippedLocale, PlayPack> = {
  en: pack(
    [
      "a rainy window",
      "a bright prairie afternoon",
      "a wide sky outside",
      "a winter entryway",
      "the neighbourhood block",
      "the coat room",
      "a bilingual hello at the door",
      "a foggy morning window",
      "a windy yard",
      "a kitchen table by the window",
      "a long summer evening or a short winter day",
      "the door after outdoor time",
      "a circle on the floor",
    ],
    [
      "cedar cones and a bowl of water",
      "dry grass and a scarf for the wind",
      "a cardboard box and a blanket",
      "snow pants and a basket of mitts",
      "leaves, sticks, and a paper map you draw",
      "hats, blocks, and a picture book",
      "two labels, English and French, on the same basket",
      "paper boats and a bowl of warm water",
      "red soil in a tray and a small shovel",
      "a pot, a spoon, and a song you already know",
      "a lamp and a dark cloth for day and night play",
      "ice cubes in a tray and warm mittens",
      "a family photo the parent chose to share, or a drawing if there is no photo",
    ],
    {
      belong: {
        title: "Hello circle near {place}",
        materials: "{prop}",
        steps: [
          "Sit where everyone can see {place}.",
          "Say each child's name and wait. A wave counts.",
          "Pass one object from the basket. The child decides to hold it or pass it on.",
        ],
      },
      well: {
        title: "A rest break near {place}",
        materials: "{prop}. A mat if you have one.",
        steps: [
          "Ask who needs a drink, the washroom, or a quiet lap.",
          "Do three slow stretches the children choose.",
          "Stop while they are still willing. Rest is part of the plan.",
        ],
      },
      play: {
        title: "A basket on the floor by {place}",
        materials: "{prop}. Keep every piece large enough for a baby.",
        steps: [
          "Put two or three safe objects on a clean mat.",
          "Let the baby reach, mouth, and drop. Stay within arm's length.",
          "Name what they do in a short sentence, then wait.",
        ],
      },
      talk: {
        title: "Picture talk about {place}",
        materials: "Paper, crayons, and {prop}.",
        steps: [
          "A child draws one thing from today.",
          "Ask one open question: what happened next?",
          "Write their words under the drawing. Read them back.",
        ],
      },
      care: {
        title: "Look after {place}",
        materials: "{prop}",
        steps: [
          "Pick one small job: wipe a table, sort the basket, or water a plant.",
          "Do it together. The child leads one step.",
          "Thank the person who helped, by name.",
        ],
      },
    },
  ),
  fr: pack(
    [
      "une fenêtre sous la pluie",
      "un après-midi clair dans la prairie",
      "un grand ciel dehors",
      "une entrée en hiver",
      "le pâté de maisons du quartier",
      "le vestiaire",
      "un bonjour bilingue à la porte",
      "une fenêtre un matin de brume",
      "une cour venteuse",
      "une table de cuisine près de la fenêtre",
      "une longue soirée d'été ou un jour d'hiver court",
      "la porte après le temps dehors",
      "un cercle sur le plancher",
    ],
    [
      "des cônes de cèdre et un bol d'eau",
      "de l'herbe sèche et un foulard pour le vent",
      "une boîte de carton et une couverture",
      "des pantalons de neige et un panier de mitaines",
      "des feuilles, des bâtons et une carte que vous dessinez",
      "des tuques, des blocs et un livre d'images",
      "deux étiquettes, en anglais et en français, sur le même panier",
      "des bateaux en papier et un bol d'eau tiède",
      "de la terre rouge dans un plateau et une petite pelle",
      "une casserole, une cuillère et une chanson que vous connaissez",
      "une lampe et un tissu foncé pour jouer au jour et à la nuit",
      "des glaçons dans un plateau et des mitaines chaudes",
      "une photo de famille que le parent a choisi de partager, ou un dessin s'il n'y a pas de photo",
    ],
    {
      belong: {
        title: "Cercle de bonjour près de {place}",
        materials: "{prop}",
        steps: [
          "Asseyez-vous là où tout le monde voit {place}.",
          "Dites le nom de chaque enfant et attendez. Un signe de la main compte.",
          "Passez un objet du panier. L'enfant décide de le garder ou de le passer.",
        ],
      },
      well: {
        title: "Une pause près de {place}",
        materials: "{prop}. Un tapis si vous en avez un.",
        steps: [
          "Demandez qui a besoin d'un verre, des toilettes ou d'un moment calme.",
          "Faites trois étirements lents choisis par les enfants.",
          "Arrêtez pendant qu'ils sont encore partants. Le repos fait partie du plan.",
        ],
      },
      play: {
        title: "Un panier au sol près de {place}",
        materials: "{prop}. Chaque pièce doit être assez grande pour un bébé.",
        steps: [
          "Placez deux ou trois objets sûrs sur un tapis propre.",
          "Laissez le bébé atteindre, porter à la bouche et laisser tomber. Restez à portée de bras.",
          "Nommez ce qu'il fait dans une courte phrase, puis attendez.",
        ],
      },
      talk: {
        title: "Parler d'une image de {place}",
        materials: "Du papier, des crayons et {prop}.",
        steps: [
          "Un enfant dessine une chose de la journée.",
          "Posez une question ouverte : qu'est-ce qui s'est passé ensuite ?",
          "Écrivez ses mots sous le dessin. Relisez-les.",
        ],
      },
      care: {
        title: "Prendre soin de {place}",
        materials: "{prop}",
        steps: [
          "Choisissez une petite tâche : essuyer une table, trier le panier ou arroser une plante.",
          "Faites-la ensemble. L'enfant mène une étape.",
          "Remerciez la personne qui a aidé, par son nom.",
        ],
      },
    },
  ),
  zh: pack(
    [
      "一扇下着雨的窗",
      "草原上明亮的下午",
      "外面宽阔的天空",
      "冬天的门口",
      "小区这一带",
      "衣帽间",
      "门口一句双语问候",
      "有雾的早晨窗口",
      "有风的院子",
      "窗边的餐桌",
      "很长的夏夜或很短的冬日",
      "户外活动后的门口",
      "地板上的圆圈",
    ],
    [
      "雪松果和一个水碗",
      "干草和一条挡风的围巾",
      "一个纸箱和一条毯子",
      "雪裤和一筐手套",
      "树叶、小棍和你们画的纸地图",
      "帽子、积木和一本图画书",
      "同一个篮子上的英法两种标签",
      "纸船和一碗温水",
      "盘子里的红土和一把小铲",
      "一口锅、一把勺子和你们已经会的歌",
      "一盏灯和一块玩白天黑夜的深色布",
      "一盘冰块和暖和的手套",
      "家长同意分享的家庭照片，没有照片就用一幅画",
    ],
    {
      belong: {
        title: "在{place}旁边问好",
        materials: "{prop}",
        steps: [
          "坐在大家都能看见{place}的地方。",
          "说出每个孩子的名字，然后等一等。挥手也算。",
          "从篮子里传一件东西。孩子自己决定拿着还是传下去。",
        ],
      },
      well: {
        title: "在{place}附近休息一下",
        materials: "{prop}。如果有垫子就铺上。",
        steps: ["问问谁要喝水、上厕所，或者安静地靠一会儿。", "做三个孩子自己选的慢动作伸展。", "他们还愿意的时候就停。休息也是计划的一部分。"],
      },
      play: {
        title: "在{place}旁边的地板篮子",
        materials: "{prop}。每件东西都要大到婴儿拿得安全。",
        steps: ["在干净的垫子上放两三件安全的东西。", "让宝宝伸手、放进嘴里、再放下。大人要伸手就够得着。", "用一句短话说说他们在做什么，然后等一等。"],
      },
      talk: {
        title: "说说{place}的图画",
        materials: "纸、蜡笔，还有{prop}。",
        steps: ["一个孩子画出今天的一件事。", "问一个开放的问题：后来发生了什么？", "把他们的话写在画下面，再读给他们听。"],
      },
      care: {
        title: "一起照看{place}",
        materials: "{prop}",
        steps: ["选一件小事：擦桌子、整理篮子，或者给植物浇水。", "一起做。让孩子带一步。", "说出帮忙的人的名字，并谢谢他们。"],
      },
    },
  ),
  yue: pack(
    [
      "一扇落緊雨嘅窗",
      "草原上明亮嘅下晝",
      "出面闊闊嘅天",
      "冬天嘅門口",
      "屋苑呢一帶",
      "衣帽間",
      "門口一句雙語問候",
      "有霧嘅朝早窗口",
      "有風嘅院子",
      "窗邊嘅餐檯",
      "好長嘅夏夜或者好短嘅冬日",
      "戶外活動之後嘅門口",
      "地板上嘅圓圈",
    ],
    [
      "雪松果同一個水碗",
      "乾草同一條擋風頸巾",
      "一個紙箱同一張氈",
      "雪褲同一籃手套",
      "樹葉、細棍同你哋畫嘅紙地圖",
      "帽、積木同一本圖畫書",
      "同一個籃上面嘅英用法文標籤",
      "紙船同一碗暖水",
      "碟入面嘅紅泥同一把細鏟",
      "一口煲、一隻羹同你哋已經識唱嘅歌",
      "一盞燈同一塊玩日夜嘅深色布",
      "一碟冰塊同暖手套",
      "家長肯分享嘅家庭相，冇相就用一幅畫",
    ],
    {
      belong: {
        title: "喺{place}旁邊問好",
        materials: "{prop}",
        steps: ["坐喺大家都睇到{place}嘅地方。", "講出每個小朋友個名，然後等一等。揮手都算。", "由籃度傳一件嘢。小朋友自己決定拎住定係傳落去。"],
      },
      well: {
        title: "喺{place}附近休息一阵",
        materials: "{prop}。有墊就鋪低。",
        steps: ["問吓邊個要飲水、去廁所，或者靜靜倚一阵。", "做三個小朋友自己揀嘅慢動作拉筋。", "佢哋仲肯嘅時候就停。休息都係計劃嘅一部分。"],
      },
      play: {
        title: "喺{place}旁邊嘅地板籃",
        materials: "{prop}。每件嘢都要大到嬰兒拎得安全。",
        steps: ["喺乾淨墊上面放兩三件安全嘅嘢。", "畀寶寶伸手、放入口，再放低。大人要伸手就夠到。", "用一句短句講佢哋做緊咩，然後等一等。"],
      },
      talk: {
        title: "講吓{place}嘅圖畫",
        materials: "紙、蠟筆，同埋{prop}。",
        steps: ["一個小朋友畫低今日一件事。", "問一條開放問題：跟住發生咗咩？", "將佢嘅話寫喺畫下面，再讀返畀佢聽。"],
      },
      care: {
        title: "一齊照看{place}",
        materials: "{prop}",
        steps: ["揀一件小事：抹檯、整理籃，或者淋花。", "一齊做。畀小朋友帶一步。", "講出幫手嗰個人個名，同埋多謝佢。"],
      },
    },
  ),
  pa: pack(
    [
      "ਮੀਂਹ ਵਾਲੀ ਖਿੜਕੀ",
      "ਪਰੇਰੀ ਉੱਤੇ ਚਮਕਦੀ ਦੁਪਹਿਰ",
      "ਬਾਹਰ ਚੌੜਾ ਅਸਮਾਨ",
      "ਸਰਦੀ ਵਾਲਾ ਦਰਵਾਜ਼ਾ",
      "ਗੁਆਂਢ ਦਾ ਇਹ ਟੁਕੜਾ",
      "ਕੋਟ ਰੱਖਣ ਵਾਲੀ ਥਾਂ",
      "ਦਰਵਾਜ਼ੇ ਉੱਤੇ ਦੋ ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
      "ਧੁੰਦ ਵਾਲੀ ਸਵੇਰ ਦੀ ਖਿੜਕੀ",
      "ਹਵਾ ਵਾਲਾ ਵਿਹੜਾ",
      "ਖਿੜਕੀ ਕੋਲ ਰਸੋਈ ਦੀ ਮੇਜ਼",
      "ਲੰਮੀ ਗਰਮੀ ਦੀ ਸ਼ਾਮ ਜਾਂ ਛੋਟਾ ਸਰਦੀ ਦਾ ਦਿਨ",
      "ਬਾਹਰਲੇ ਸਮੇਂ ਤੋਂ ਬਾਅਦ ਦਾ ਦਰਵਾਜ਼ਾ",
      "ਫਰਸ਼ ਉੱਤੇ ਇੱਕ ਚੱਕਰ",
    ],
    [
      "ਦੇਵਦਾਰ ਦੇ ਫਲ ਅਤੇ ਪਾਣੀ ਦਾ ਕਟੋਰਾ",
      "ਸੁੱਕੀ ਘਾਹ ਅਤੇ ਹਵਾ ਲਈ ਇੱਕ ਦੁਪੱਟਾ",
      "ਇੱਕ ਗੱਤੇ ਦਾ ਡੱਬਾ ਅਤੇ ਇੱਕ ਕੰਬਲ",
      "ਬਰਫ਼ ਵਾਲੀ ਪਤਲੂਨ ਅਤੇ ਦਸਤਾਨਿਆਂ ਦੀ ਟੋਕਰੀ",
      "ਪੱਤੇ, ਡੰਡੀਆਂ ਅਤੇ ਤੁਹਾਡਾ ਖਿੱਚਿਆ ਕਾਗਜ਼ੀ ਨਕਸ਼ਾ",
      "ਟੋਪੀਆਂ, ਬਲਾਕ ਅਤੇ ਇੱਕ ਤਸਵੀਰੀ ਕਿਤਾਬ",
      "ਉਸੇ ਟੋਕਰੀ ਉੱਤੇ ਅੰਗਰੇਜ਼ੀ ਅਤੇ ਫ਼ਰਾਂਸੀਸੀ ਲੇਬਲ",
      "ਕਾਗਜ਼ ਦੀਆਂ ਕਿਸ਼ਤੀਆਂ ਅਤੇ ਗਰਮ ਪਾਣੀ ਦਾ ਕਟੋਰਾ",
      "ਟ੍ਰੇ ਵਿੱਚ ਲਾਲ ਮਿੱਟੀ ਅਤੇ ਇੱਕ ਛੋਟੀ ਕਹੀ",
      "ਇੱਕ ਭਾਂਡਾ, ਇੱਕ ਚਮਚਾ ਅਤੇ ਇੱਕ ਗੀਤ ਜੋ ਤੁਸੀਂ ਪਹਿਲਾਂ ਤੋਂ ਜਾਣਦੇ ਹੋ",
      "ਦਿਨ-ਰਾਤ ਦੀ ਖੇਡ ਲਈ ਇੱਕ ਲੈਂਪ ਅਤੇ ਇੱਕ ਗੂੜ੍ਹਾ ਕੱਪੜਾ",
      "ਇੱਕ ਟ੍ਰੇ ਵਿੱਚ ਬਰਫ਼ ਦੇ ਟੁਕੜੇ ਅਤੇ ਗਰਮ ਦਸਤਾਨੇ",
      "ਉਹ ਪਰਿਵਾਰਕ ਫੋਟੋ ਜੋ ਮਾਂ-ਬਾਪ ਨੇ ਸਾਂਝੀ ਕਰਨੀ ਚਾਹੀ, ਜਾਂ ਫੋਟੋ ਨਾ ਹੋਵੇ ਤਾਂ ਇੱਕ ਚਿੱਤਰ",
    ],
    {
      belong: {
        title: "{place} ਕੋਲ ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦਾ ਘੇਰਾ",
        materials: "{prop}",
        steps: [
          "ਉੱਥੇ ਬੈਠੋ ਜਿੱਥੇ ਹਰ ਕੋਈ {place} ਵੇਖ ਸਕੇ।",
          "ਹਰ ਬੱਚੇ ਦਾ ਨਾਂ ਕਹੋ ਅਤੇ ਉਡੀਕ ਕਰੋ। ਹੱਥ ਹਿਲਾਉਣਾ ਵੀ ਚੱਲਦਾ ਹੈ।",
          "ਟੋਕਰੀ ਵਿੱਚੋਂ ਇੱਕ ਚੀਜ਼ ਅੱਗੇ ਵਧਾਓ। ਬੱਚਾ ਖੁਦ ਫੈਸਲਾ ਕਰੇ ਕਿ ਰੱਖੇ ਜਾਂ ਅੱਗੇ ਦੇਵੇ।",
        ],
      },
      well: {
        title: "{place} ਕੋਲ ਇੱਕ ਆਰਾਮ",
        materials: "{prop}। ਜੇ ਚਟਾਈ ਹੋਵੇ ਤਾਂ ਵਿਛਾ ਦਿਓ।",
        steps: [
          "ਪੁੱਛੋ ਕਿਸ ਨੂੰ ਪਾਣੀ, ਬਾਥਰੂਮ ਜਾਂ ਇੱਕ ਸ਼ਾਂਤ ਗੋਦ ਚਾਹੀਦੀ ਹੈ।",
          "ਤਿੰਨ ਹੌਲੀ ਖਿਚਾਅ ਕਰੋ ਜੋ ਬੱਚੇ ਖੁਦ ਚੁਣਨ।",
          "ਜਦੋਂ ਉਹ ਅਜੇ ਵੀ ਤਿਆਰ ਹੋਣ ਤਾਂ ਰੁਕ ਜਾਓ। ਆਰਾਮ ਵੀ ਯੋਜਨਾ ਦਾ ਹਿੱਸਾ ਹੈ।",
        ],
      },
      play: {
        title: "{place} ਕੋਲ ਫਰਸ਼ ਉੱਤੇ ਇੱਕ ਟੋਕਰੀ",
        materials: "{prop}। ਹਰ ਟੁਕੜਾ ਬੱਚੇ ਲਈ ਕਾਫ਼ੀ ਵੱਡਾ ਰੱਖੋ।",
        steps: [
          "ਸਾਫ਼ ਚਟਾਈ ਉੱਤੇ ਦੋ ਜਾਂ ਤਿੰਨ ਸੁਰੱਖਿਅਤ ਚੀਜ਼ਾਂ ਰੱਖੋ।",
          "ਬੱਚੇ ਨੂੰ ਹੱਥ ਵਧਾਉਣ, ਮੂੰਹ ਵਿੱਚ ਲੈਣ ਅਤੇ ਛੱਡਣ ਦਿਓ। ਹੱਥ ਦੀ ਪਹੁੰਚ ਵਿੱਚ ਰਹੋ।",
          "ਛੋਟੇ ਵਾਕ ਵਿੱਚ ਕਹੋ ਕਿ ਉਹ ਕੀ ਕਰ ਰਹੇ ਹਨ, ਫਿਰ ਉਡੀਕ ਕਰੋ।",
        ],
      },
      talk: {
        title: "{place} ਬਾਰੇ ਤਸਵੀਰ ਗੱਲ",
        materials: "ਕਾਗਜ਼, ਰੰਗ ਅਤੇ {prop}।",
        steps: [
          "ਇੱਕ ਬੱਚਾ ਅੱਜ ਦੀ ਇੱਕ ਗੱਲ ਬਣਾਵੇ।",
          "ਇੱਕ ਖੁੱਲ੍ਹਾ ਸਵਾਲ ਪੁੱਛੋ: ਫਿਰ ਕੀ ਹੋਇਆ?",
          "ਉਨ੍ਹਾਂ ਦੇ ਸ਼ਬਦ ਚਿੱਤਰ ਹੇਠ ਲਿਖੋ। ਵਾਪਸ ਪੜ੍ਹ ਕੇ ਸੁਣਾਓ।",
        ],
      },
      care: {
        title: "{place} ਦੀ ਸੰਭਾਲ",
        materials: "{prop}",
        steps: [
          "ਇੱਕ ਛੋਟਾ ਕੰਮ ਚੁਣੋ: ਮੇਜ਼ ਪੂੰਝਣਾ, ਟੋਕਰੀ ਵੰਡਣੀ ਜਾਂ ਪੌਦੇ ਨੂੰ ਪਾਣੀ ਦੇਣਾ।",
          "ਇਕੱਠੇ ਕਰੋ। ਬੱਚਾ ਇੱਕ ਕਦਮ ਅੱਗੇ ਲੈ ਕੇ ਜਾਵੇ।",
          "ਮਦਦ ਕਰਨ ਵਾਲੇ ਦਾ ਨਾਂ ਲੈ ਕੇ ਧੰਨਵਾਦ ਕਰੋ।",
        ],
      },
    },
  ),
  es: pack(
    [
      "una ventana con lluvia",
      "una tarde clara en la pradera",
      "un cielo ancho afuera",
      "una entrada en invierno",
      "la cuadra del barrio",
      "el perchero",
      "un saludo bilingüe en la puerta",
      "una ventana en una mañana de niebla",
      "un patio con viento",
      "una mesa de cocina junto a la ventana",
      "una tarde larga de verano o un día corto de invierno",
      "la puerta después del tiempo al aire libre",
      "un círculo en el suelo",
    ],
    [
      "piñas de cedro y un bol de agua",
      "hierba seca y una bufanda para el viento",
      "una caja de cartón y una manta",
      "pantalones de nieve y una cesta de mitones",
      "hojas, palos y un mapa de papel que ustedes dibujan",
      "gorros, bloques y un libro de imágenes",
      "dos etiquetas, en inglés y en francés, en la misma cesta",
      "barcos de papel y un bol de agua tibia",
      "tierra roja en una bandeja y una pala pequeña",
      "una olla, una cuchara y una canción que ya conocen",
      "una lámpara y una tela oscura para jugar al día y la noche",
      "cubos de hielo en una bandeja y mitones calientes",
      "una foto familiar que el padre o la madre eligió compartir, o un dibujo si no hay foto",
    ],
    {
      belong: {
        title: "Círculo de hola cerca de {place}",
        materials: "{prop}",
        steps: [
          "Siéntense donde todos puedan ver {place}.",
          "Digan el nombre de cada niño y esperen. Un saludo con la mano cuenta.",
          "Pasen un objeto de la cesta. El niño decide si lo guarda o lo pasa.",
        ],
      },
      well: {
        title: "Un descanso cerca de {place}",
        materials: "{prop}. Una colchoneta si la tienen.",
        steps: [
          "Pregunten quién necesita agua, el baño o un rato tranquilo.",
          "Hagan tres estiramientos lentos que elijan los niños.",
          "Paren mientras todavía quieren seguir. El descanso es parte del plan.",
        ],
      },
      play: {
        title: "Una cesta en el suelo junto a {place}",
        materials: "{prop}. Cada pieza debe ser bastante grande para un bebé.",
        steps: [
          "Pongan dos o tres objetos seguros en una colchoneta limpia.",
          "Dejen que el bebé alcance, lleve a la boca y suelte. Quédense al alcance del brazo.",
          "Nombren lo que hace en una frase corta y luego esperen.",
        ],
      },
      talk: {
        title: "Hablar de un dibujo de {place}",
        materials: "Papel, crayones y {prop}.",
        steps: [
          "Un niño dibuja una cosa de hoy.",
          "Hagan una pregunta abierta: ¿qué pasó después?",
          "Escriban sus palabras debajo del dibujo. Léanlas otra vez.",
        ],
      },
      care: {
        title: "Cuidar {place}",
        materials: "{prop}",
        steps: [
          "Elijan un trabajo pequeño: limpiar una mesa, ordenar la cesta o regar una planta.",
          "Háganlo juntos. El niño guía un paso.",
          "Den las gracias por su nombre a quien ayudó.",
        ],
      },
    },
  ),
  ar: pack(
    [
      "نافذة تحت المطر",
      "بعد ظهر مشرق في البراري",
      "سماء واسعة في الخارج",
      "مدخل في الشتاء",
      "حيّ البيوت القريب",
      "مكان المعاطف",
      "تحية بلغتين عند الباب",
      "نافذة في صباح ضبابي",
      "ساحة فيها ريح",
      "طاولة مطبخ قرب النافذة",
      "مساء صيف طويل أو نهار شتاء قصير",
      "الباب بعد الوقت في الخارج",
      "دائرة على الأرض",
    ],
    [
      "أكواز أرز ووعاء ماء",
      "عشب جاف ووشاح للريح",
      "صندوق كرتون وبطانية",
      "سروال ثلج وسلة قفازات",
      "أوراق وعيدان وخريطة ورق ترسمونها",
      "قبعات ومكعبات وكتاب صور",
      "ملصقان، بالإنجليزية والفرنسية، على السلة نفسها",
      "قوارب ورق ووعاء ماء دافئ",
      "تربة حمراء في صينية ومجرفة صغيرة",
      "قدر وملعقة وأغنية تعرفونها",
      "مصباح وقماش داكن للعب الليل والنهار",
      "مكعبات ثلج في صينية وقفازات دافئة",
      "صورة عائلية اختار الوالد مشاركتها، أو رسم إذا لم توجد صورة",
    ],
    {
      belong: {
        title: "حلقة مرحبًا قرب {place}",
        materials: "{prop}",
        steps: [
          "اجلسوا حيث يرى الجميع {place}.",
          "قولوا اسم كل طفل وانتظروا. تلويحة اليد تكفي.",
          "مرّروا شيئًا من السلة. الطفل يقرر أن يمسكه أو يمرّره.",
        ],
      },
      well: {
        title: "استراحة قرب {place}",
        materials: "{prop}. حصيرة إن وُجدت.",
        steps: [
          "اسألوا من يحتاج ماءً أو الحمام أو حضنًا هادئًا.",
          "اعملوا ثلاث تمددات بطيئة يختارها الأطفال.",
          "توقفوا وهم ما زالوا راغبين. الراحة جزء من الخطة.",
        ],
      },
      play: {
        title: "سلة على الأرض بجانب {place}",
        materials: "{prop}. كل قطعة كبيرة بما يكفي للرضيع.",
        steps: [
          "ضعوا شيئين أو ثلاثة آمنة على حصيرة نظيفة.",
          "دعوا الرضيع يمد يده ويضع في فمه ثم يُسقط. ابقوا على مدى الذراع.",
          "سمّوا ما يفعله بجملة قصيرة، ثم انتظروا.",
        ],
      },
      talk: {
        title: "حديث عن رسم لـ {place}",
        materials: "ورق وألوان و{prop}.",
        steps: [
          "يرسم طفل شيئًا من اليوم.",
          "اسألوا سؤالًا مفتوحًا: ماذا حدث بعد ذلك؟",
          "اكتبوا كلماته تحت الرسم. أعيدوا قراءتها.",
        ],
      },
      care: {
        title: "العناية بـ {place}",
        materials: "{prop}",
        steps: [
          "اختاروا عملًا صغيرًا: مسح طاولة أو ترتيب السلة أو سقي نبتة.",
          "اعملوه معًا. الطفل يقود خطوة.",
          "اشكروا من ساعد باسمه.",
        ],
      },
    },
  ),
  tl: pack(
    [
      "isang bintana sa ulan",
      "isang maliwanag na hapon sa prairie",
      "malawak na langit sa labas",
      "pasukan sa taglamig",
      "bloke ng kapitbahayan",
      "lugar ng mga amerikana",
      "bilingguwal na bati sa pinto",
      "bintana sa isang maulap na umaga",
      "bakuran na mahangin",
      "mesa sa kusina sa tabi ng bintana",
      "mahabang gabi ng tag-init o maikling araw ng taglamig",
      "pinto pagkatapos ng oras sa labas",
      "bilog sa sahig",
    ],
    [
      "mga bunga ng sedro at isang mangkok ng tubig",
      "tuyong damo at isang bandana sa hangin",
      "kahong karton at isang kumot",
      "pantalon sa niyebe at basket ng guwantes",
      "mga dahon, patpat, at mapa sa papel na iginuhit ninyo",
      "mga sumbrero, bloke, at isang aklat na may larawan",
      "dalawang etiketa, Ingles at Pranses, sa iisang basket",
      "mga bangkang papel at mangkok ng maligamgam na tubig",
      "pulang lupa sa isang bandeha at maliit na pala",
      "kaldero, kutsara, at awit na alam na ninyo",
      "lampara at madilim na tela para sa laro ng araw at gabi",
      "mga yelong cube sa bandeha at maiinit na guwantes",
      "litrato ng pamilya na piniling ibahagi ng magulang, o guhit kung walang litrato",
    ],
    {
      belong: {
        title: "Bilogan ng hello malapit sa {place}",
        materials: "{prop}",
        steps: [
          "Umupo kung saan nakikita ng lahat ang {place}.",
          "Sabihin ang pangalan ng bawat bata at maghintay. Sapat na ang kaway.",
          "Ipasa ang isang bagay mula sa basket. Ang bata ang magpasya kung hahawakan o ipapasa.",
        ],
      },
      well: {
        title: "Pahinga malapit sa {place}",
        materials: "{prop}. Banig kung mayroon.",
        steps: [
          "Itanong kung sino ang gusto ng tubig, banyo, o tahimik na yakap.",
          "Gumawa ng tatlong mabagal na unat na pipiliin ng mga bata.",
          "Huminto habang gusto pa nila. Bahagi ng plano ang pahinga.",
        ],
      },
      play: {
        title: "Basket sa sahig sa tabi ng {place}",
        materials: "{prop}. Ang bawat piraso ay sapat ang laki para sa sanggol.",
        steps: [
          "Maglagay ng dalawa o tatlong ligtas na bagay sa malinis na banig.",
          "Hayaan ang sanggol na abutin, ilagay sa bibig, at bitawan. Manatili sa abot ng braso.",
          "Pangalanan ang ginagawa nila sa maikling pangungusap, saka maghintay.",
        ],
      },
      talk: {
        title: "Usapan tungkol sa guhit ng {place}",
        materials: "Papel, krayola, at {prop}.",
        steps: [
          "Gumuhit ang isang bata ng isang bagay ngayong araw.",
          "Magtanong nang bukas: ano ang sumunod na nangyari?",
          "Isulat ang kanilang mga salita sa ilalim ng guhit. Basahin ulit.",
        ],
      },
      care: {
        title: "Alagaan ang {place}",
        materials: "{prop}",
        steps: [
          "Pumili ng maliit na gawain: punasan ang mesa, ayusin ang basket, o diligan ang halaman.",
          "Gawin nang magkasama. Ang bata ang gumabay sa isang hakbang.",
          "Pasalamatan sa pangalan ang tumulong.",
        ],
      },
    },
  ),
  it: pack(
    [
      "una finestra sotto la pioggia",
      "un pomeriggio chiaro nella prateria",
      "un cielo largo fuori",
      "un ingresso d'inverno",
      "l'isolato del quartiere",
      "l'appendiabiti",
      "un saluto bilingue alla porta",
      "una finestra in una mattina di nebbia",
      "un cortile ventoso",
      "un tavolo di cucina vicino alla finestra",
      "una lunga sera d'estate o un giorno corto d'inverno",
      "la porta dopo il tempo all'aperto",
      "un cerchio sul pavimento",
    ],
    [
      "coni di cedro e una ciotola d'acqua",
      "erba secca e una sciarpa per il vento",
      "una scatola di cartone e una coperta",
      "pantaloni da neve e un cesto di muffole",
      "foglie, bastoncini e una mappa di carta che disegnate voi",
      "berretti, blocchi e un libro illustrato",
      "due etichette, in inglese e in francese, sullo stesso cesto",
      "barche di carta e una ciotola d'acqua tiepida",
      "terra rossa in un vassoio e una paletta",
      "una pentola, un cucchiaio e una canzone che già conoscete",
      "una lampada e un panno scuro per giocare al giorno e alla notte",
      "cubetti di ghiaccio in un vassoio e muffole calde",
      "una foto di famiglia che il genitore ha scelto di condividere, o un disegno se non c'è la foto",
    ],
    {
      belong: {
        title: "Cerchio del ciao vicino a {place}",
        materials: "{prop}",
        steps: [
          "Sedetevi dove tutti vedono {place}.",
          "Dite il nome di ogni bambino e aspettate. Un cenno con la mano basta.",
          "Passate un oggetto dal cesto. Il bambino decide se tenerlo o passarlo.",
        ],
      },
      well: {
        title: "Una pausa vicino a {place}",
        materials: "{prop}. Un tappeto se ce l'avete.",
        steps: [
          "Chiedete chi ha bisogno di acqua, del bagno o di un momento calmo.",
          "Fate tre allungamenti lenti scelti dai bambini.",
          "Fermatevi mentre hanno ancora voglia. Il riposo fa parte del piano.",
        ],
      },
      play: {
        title: "Un cesto sul pavimento accanto a {place}",
        materials: "{prop}. Ogni pezzo deve essere abbastanza grande per un bebè.",
        steps: [
          "Mettete due o tre oggetti sicuri su un tappeto pulito.",
          "Lasciate che il bebè raggiunga, porti alla bocca e lasci cadere. Restate a portata di braccio.",
          "Nominate quello che fa con una frase corta, poi aspettate.",
        ],
      },
      talk: {
        title: "Parlare di un disegno di {place}",
        materials: "Carta, pastelli e {prop}.",
        steps: [
          "Un bambino disegna una cosa di oggi.",
          "Fate una domanda aperta: che cosa è successo dopo?",
          "Scrivete le sue parole sotto il disegno. Rileggetele.",
        ],
      },
      care: {
        title: "Avere cura di {place}",
        materials: "{prop}",
        steps: [
          "Scegliete un piccolo lavoro: pulire un tavolo, ordinare il cesto o annaffiare una pianta.",
          "Fatelo insieme. Il bambino guida un passo.",
          "Ringraziate per nome chi ha aiutato.",
        ],
      },
    },
  ),
  de: pack(
    [
      "ein Fenster im Regen",
      "ein heller Nachmittag in der Prärie",
      "ein weiter Himmel draußen",
      "ein Eingang im Winter",
      "das Stück Nachbarschaft",
      "die Garderobe",
      "ein zweisprachiges Hallo an der Tür",
      "ein Fenster an einem nebligen Morgen",
      "ein windiger Hof",
      "ein Küchentisch am Fenster",
      "ein langer Sommerabend oder ein kurzer Wintertag",
      "die Tür nach der Zeit draußen",
      "ein Kreis auf dem Boden",
    ],
    [
      "Zedernzapfen und eine Schale Wasser",
      "trockenes Gras und ein Schal für den Wind",
      "ein Karton und eine Decke",
      "Schneehosen und ein Korb mit Fäustlingen",
      "Blätter, Stöcke und eine Papierkarte, die ihr zeichnet",
      "Mützen, Bausteine und ein Bilderbuch",
      "zwei Schilder, Englisch und Französisch, am selben Korb",
      "Papierboote und eine Schale warmes Wasser",
      "rote Erde in einer Schale und eine kleine Schaufel",
      "ein Topf, ein Löffel und ein Lied, das ihr schon kennt",
      "eine Lampe und ein dunkles Tuch für Tag-und-Nacht-Spiel",
      "Eiswürfel in einer Schale und warme Fäustlinge",
      "ein Familienfoto, das die Eltern teilen wollen, oder eine Zeichnung, wenn es kein Foto gibt",
    ],
    {
      belong: {
        title: "Begrüßungskreis bei {place}",
        materials: "{prop}",
        steps: [
          "Setzt euch so, dass alle {place} sehen.",
          "Sagt den Namen jedes Kindes und wartet. Ein Winken zählt.",
          "Gebt einen Gegenstand aus dem Korb weiter. Das Kind entscheidet, ob es ihn behält oder weitergibt.",
        ],
      },
      well: {
        title: "Eine Pause bei {place}",
        materials: "{prop}. Eine Matte, wenn ihr eine habt.",
        steps: [
          "Fragt, wer Wasser, die Toilette oder einen stillen Schoß braucht.",
          "Macht drei langsame Dehnungen, die die Kinder wählen.",
          "Hört auf, solange sie noch mitmachen wollen. Ruhe gehört zum Plan.",
        ],
      },
      play: {
        title: "Ein Korb auf dem Boden bei {place}",
        materials: "{prop}. Jedes Teil muss groß genug für ein Baby sein.",
        steps: [
          "Legt zwei oder drei sichere Dinge auf eine saubere Matte.",
          "Lasst das Baby greifen, in den Mund nehmen und fallen lassen. Bleibt in Armreichweite.",
          "Sagt in einem kurzen Satz, was es tut, und wartet dann.",
        ],
      },
      talk: {
        title: "Über ein Bild von {place} sprechen",
        materials: "Papier, Stifte und {prop}.",
        steps: [
          "Ein Kind zeichnet eine Sache von heute.",
          "Stellt eine offene Frage: Was ist danach passiert?",
          "Schreibt die Worte unter die Zeichnung. Lest sie vor.",
        ],
      },
      care: {
        title: "Für {place} sorgen",
        materials: "{prop}",
        steps: [
          "Wählt eine kleine Aufgabe: einen Tisch wischen, den Korb sortieren oder eine Pflanze gießen.",
          "Macht es zusammen. Das Kind führt einen Schritt.",
          "Dankt der Person, die geholfen hat, mit Namen.",
        ],
      },
    },
  ),
};
