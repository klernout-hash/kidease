import type { ShippedLocale } from "../../languages.ts";
import type { GoalTheme, ProvinceCode } from "../pack.ts";

const themes: GoalTheme[] = ["belong", "well", "play", "talk", "care"];
const provinces: ProvinceCode[] = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];

/** Five lines per province, in theme order: belong, well, play, talk, care. */
function lines(rows: Record<ProvinceCode, readonly [string, string, string, string, string]>): Record<ProvinceCode, Record<GoalTheme, string>> {
  const out = {} as Record<ProvinceCode, Record<GoalTheme, string>>;
  for (const province of provinces) {
    const block = {} as Record<GoalTheme, string>;
    themes.forEach((theme, index) => {
      block[theme] = rows[province][index];
    });
    out[province] = block;
  }
  return out;
}

type Block = Record<ProvinceCode, readonly [string, string, string, string, string]>;

const en: Block = {
  BC: ["Children feel they belong with their people", "Children are well, rested, and included", "Children explore with their hands and questions", "Children share ideas in the languages of their family", "Children help care for the place they play"],
  AB: ["Children take part with their family and educators", "Children are cared for in body and feelings", "Children play to make sense of the day", "Children try words, stories, and signs", "Children look after friends and shared spaces"],
  SK: ["Children are seen as able learners", "Children have time to move and to rest", "Children learn by playing and exploring", "Children talk, listen, and make marks", "Warm relationships guide the room"],
  MB: ["Children feel safe with people they know", "Children move, rest, and eat in ways that fit them", "Children play with ideas through the day", "Children try words, songs, and mark-making", "Children notice differences and help each other"],
  ON: ["The child feels they belong here", "The child is well in body and feelings", "The child is busy with questions and play", "The child shares ideas in many ways", "The child helps with the life of the group"],
  QC: ["The child feels connected to the people here", "The child moves, rests, and cares for their body", "The child plays in order to understand", "The child speaks, listens, and expresses ideas", "The child gets used to life in a group"],
  NB: ["Children feel safe and welcomed", "Children are looked after in health and feelings", "Children play, invent, and try solutions", "Children communicate in ways that count", "Children practise fairness and care"],
  NS: ["Children feel they have a place in the group", "Children look after their own well-being with help", "Children discover and invent", "Children use language to connect", "Children care for people and the outdoors"],
  PE: ["Children feel they belong and are known", "Children are well and safe in the day", "Children explore and discover", "Children express ideas with words and marks", "Children grow a sense of who they are"],
  NL: ["Children are well and feel they belong", "Children have care that matches their needs", "Children play and explore", "Children communicate with people they trust", "Children contribute to the group"],
  YT: ["Draft: children feel included while the Yukon framework is unpublished", "Draft: children are well and included", "Draft: children explore at their pace", "Draft: children use home languages and English or French", "Draft: local First Nations priorities are named by the community, not by KidEase"],
  NT: ["Children belong with family, educators, and community", "Children are well", "Children explore", "Children communicate", "Children learn with the land around them"],
  NU: ["The child is at the centre of the day", "Care follows the child's pace", "Play leaves room for family ways of learning", "Families are the child's first teachers", "The community helps children learn"],
};

const fr: Block = {
  BC: ["Les enfants sentent qu'ils ont leur place avec leurs proches", "Les enfants vont bien, se reposent et sont inclus", "Les enfants explorent avec leurs mains et leurs questions", "Les enfants partagent des idées dans les langues de leur famille", "Les enfants aident à prendre soin de l'endroit où ils jouent"],
  AB: ["Les enfants participent avec leur famille et les éducateurs", "Les enfants sont soutenus dans leur corps et leurs émotions", "Les enfants jouent pour comprendre leur journée", "Les enfants essaient des mots, des histoires et des signes", "Les enfants prennent soin des amis et des lieux partagés"],
  SK: ["Les enfants sont vus comme des apprenants capables", "Les enfants ont du temps pour bouger et pour se reposer", "Les enfants apprennent en jouant et en explorant", "Les enfants parlent, écoutent et font des traces", "Des liens chaleureux guident la salle"],
  MB: ["Les enfants se sentent en sécurité avec des personnes qu'ils connaissent", "Les enfants bougent, se reposent et mangent à leur rythme", "Les enfants jouent avec des idées toute la journée", "Les enfants essaient des mots, des chansons et des traces", "Les enfants remarquent les différences et s'entraident"],
  ON: ["L'enfant sent qu'il a sa place ici", "L'enfant va bien dans son corps et ses émotions", "L'enfant est occupé par ses questions et son jeu", "L'enfant partage ses idées de plusieurs façons", "L'enfant aide à la vie du groupe"],
  QC: ["L'enfant se sent en lien avec les personnes ici", "L'enfant bouge, se repose et prend soin de son corps", "L'enfant joue pour comprendre", "L'enfant parle, écoute et s'exprime", "L'enfant s'habitue à la vie en groupe"],
  NB: ["L'enfant se sent en sécurité et accueilli", "L'enfant est soutenu dans sa santé et ses émotions", "L'enfant joue, invente et cherche des solutions", "L'enfant communique de plusieurs façons", "L'enfant apprend à être juste et attentionné"],
  NS: ["Les enfants sentent qu'ils ont une place dans le groupe", "Les enfants prennent soin de leur bien-être avec de l'aide", "Les enfants découvrent et inventent", "Les enfants utilisent le langage pour créer des liens", "Les enfants prennent soin des personnes et du dehors"],
  PE: ["Les enfants sentent qu'ils sont connus et à leur place", "Les enfants vont bien et sont en sécurité dans la journée", "Les enfants explorent et découvrent", "Les enfants expriment des idées avec des mots et des traces", "Les enfants construisent une idée d'eux-mêmes"],
  NL: ["Les enfants vont bien et sentent qu'ils ont leur place", "Les enfants reçoivent des soins adaptés à leurs besoins", "Les enfants jouent et explorent", "Les enfants communiquent avec des personnes de confiance", "Les enfants contribuent au groupe"],
  YT: ["Brouillon : les enfants se sentent inclus en attendant le cadre du Yukon", "Brouillon : les enfants vont bien et sont inclus", "Brouillon : les enfants explorent à leur rythme", "Brouillon : les enfants utilisent la langue du foyer et l'anglais ou le français", "Brouillon : les priorités des Premières Nations viennent de la communauté, pas de KidEase"],
  NT: ["Les enfants ont leur place avec la famille, les éducateurs et la communauté", "Les enfants vont bien", "Les enfants explorent", "Les enfants communiquent", "Les enfants apprennent avec le territoire autour d'eux"],
  NU: ["L'enfant est au centre de la journée", "Les soins suivent le rythme de l'enfant", "Le jeu laisse de la place aux façons d'apprendre de la famille", "Les familles sont les premiers enseignants de l'enfant", "La communauté aide les enfants à apprendre"],
};

const zh: Block = {
  BC: ["孩子们感到和亲近的人在一起有归属", "孩子们身体好、能休息，也被接纳", "孩子们用手和问题去探索", "孩子们用家里的语言分享想法", "孩子们帮忙照看玩耍的地方"],
  AB: ["孩子们和家人、老师一起参与", "孩子们的身体和情绪都得到照顾", "孩子们用玩耍理解这一天", "孩子们试着用词、故事和手势", "孩子们照看朋友和共用的地方"],
  SK: ["孩子们被看成有能力的学习者", "孩子们有时间活动和休息", "孩子们在玩和探索中学习", "孩子们说话、倾听，也留下痕迹", "温暖的关系带领这个房间"],
  MB: ["孩子们和认识的人在一起感到安全", "孩子们按自己的节奏活动、休息和吃饭", "孩子们一整天都在玩想法", "孩子们试着用词、唱歌和涂画", "孩子们注意到不同，并互相帮助"],
  ON: ["孩子感到自己属于这里", "孩子的身体和情绪都好", "孩子忙着提问和玩耍", "孩子用很多方式分享想法", "孩子参与这个小组的生活"],
  QC: ["孩子感到和这里的人有联系", "孩子活动、休息，并照顾自己的身体", "孩子通过玩耍来理解", "孩子说话、倾听并表达想法", "孩子慢慢习惯集体生活"],
  NB: ["孩子们感到安全并受到欢迎", "孩子们的健康和情绪得到照看", "孩子们玩耍、发明并试着解决", "孩子们用有意义的方式交流", "孩子们练习公平和关心"],
  NS: ["孩子们感到自己在小组里有位置", "孩子们在帮助下照顾自己的身心", "孩子们发现并发明", "孩子们用语言建立联系", "孩子们关心人和户外"],
  PE: ["孩子们感到被认识、有归属", "孩子们这一天平安、状态好", "孩子们探索和发现", "孩子们用词语和痕迹表达想法", "孩子们慢慢认识自己是谁"],
  NL: ["孩子们状态好，也感到有归属", "孩子们得到适合自己需要的照顾", "孩子们玩耍和探索", "孩子们和信任的人交流", "孩子们为小组出一份力"],
  YT: ["草稿：育空的框架还没公布时，孩子们仍感到被接纳", "草稿：孩子们状态好，也被包括在内", "草稿：孩子们按自己的节奏探索", "草稿：孩子们使用家里的语言以及英语或法语", "草稿：原住民族的优先事项由社区来说，不由 KidEase 来定"],
  NT: ["孩子们和家人、老师、社区在一起有归属", "孩子们状态好", "孩子们探索", "孩子们交流", "孩子们和周围的土地一起学习"],
  NU: ["孩子是这一天的中心", "照顾跟着孩子的节奏", "玩耍给家里的学习方式留出空间", "家人是孩子的第一位老师", "社区帮助孩子学习"],
};

const yue: Block = {
  BC: ["小朋友感到同親近嘅人一齊有歸屬", "小朋友身體好、可以休息，亦都被接納", "小朋友用手同問題去探索", "小朋友用屋企嘅語言分享諗法", "小朋友幫手照看玩耍嘅地方"],
  AB: ["小朋友同屋企人、老師一齊參與", "小朋友嘅身體同情緒都得到照顧", "小朋友用玩耍理解呢一日", "小朋友試下用詞、故事同手勢", "小朋友照看朋友同共用嘅地方"],
  SK: ["小朋友被睇成有能力嘅學習者", "小朋友有時間活動同休息", "小朋友喺玩同探索入面學習", "小朋友講嘢、聽嘢，亦都留下痕跡", "溫暖嘅關係帶領呢間房"],
  MB: ["小朋友同識嘅人一齊感到安全", "小朋友按自己嘅節奏活動、休息同食飯", "小朋友成日都喺玩諗法", "小朋友試下用詞、唱歌同塗畫", "小朋友留意到唔同，並且互相幫忙"],
  ON: ["小朋友感到自己屬於呢度", "小朋友嘅身體同情緒都好", "小朋友忙住發問同玩耍", "小朋友用好多方式分享諗法", "小朋友參與呢個小組嘅生活"],
  QC: ["小朋友感到同呢度嘅人有聯繫", "小朋友活動、休息，並照顧自己個身", "小朋友透過玩耍去理解", "小朋友講嘢、聆聽並表達諗法", "小朋友慢慢習慣集體生活"],
  NB: ["小朋友感到安全並受到歡迎", "小朋友嘅健康同情緒得到照看", "小朋友玩耍、發明並試住解決", "小朋友用有意思嘅方式溝通", "小朋友練習公平同關心"],
  NS: ["小朋友感到自己喺小組入面有位置", "小朋友喺幫手之下照顧自己身心", "小朋友發現並發明", "小朋友用語言建立聯繫", "小朋友關心人同戶外"],
  PE: ["小朋友感到被人識、有歸屬", "小朋友呢一日平安、狀態好", "小朋友探索同發現", "小朋友用詞語同痕跡表達諗法", "小朋友慢慢認識自己係邊個"],
  NL: ["小朋友狀態好，亦都感到有歸屬", "小朋友得到適合自己需要嘅照顧", "小朋友玩耍同探索", "小朋友同信任嘅人溝通", "小朋友為小組出一分力"],
  YT: ["草稿：育空嘅框架未公佈時，小朋友仍然感到被接納", "草稿：小朋友狀態好，亦都被包括", "草稿：小朋友按自己嘅節奏探索", "草稿：小朋友用屋企語言以及英文或者法文", "草稿：原住民族嘅優先事先由社區講，唔由 KidEase 定"],
  NT: ["小朋友同屋企人、老師、社區一齊有歸屬", "小朋友狀態好", "小朋友探索", "小朋友溝通", "小朋友同周圍嘅土地一齊學習"],
  NU: ["小朋友係呢一日嘅中心", "照顧跟住小朋友嘅節奏", "玩耍畀屋企嘅學習方式留位", "屋企人係小朋友第一位老師", "社區幫手小朋友學習"],
};

const pa: Block = {
  BC: ["ਬੱਚੇ ਆਪਣੇ ਲੋਕਾਂ ਨਾਲ ਆਪਣੀ ਥਾਂ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ", "ਬੱਚੇ ਤੰਦਰੁਸਤ ਹਨ, ਆਰਾਮ ਕਰਦੇ ਹਨ ਅਤੇ ਸ਼ਾਮਲ ਹਨ", "ਬੱਚੇ ਹੱਥਾਂ ਅਤੇ ਸਵਾਲਾਂ ਨਾਲ ਖੋਜਦੇ ਹਨ", "ਬੱਚੇ ਪਰਿਵਾਰ ਦੀਆਂ ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ ਵਿਚਾਰ ਸਾਂਝੇ ਕਰਦੇ ਹਨ", "ਬੱਚੇ ਖੇਡਣ ਵਾਲੀ ਥਾਂ ਦੀ ਸੰਭਾਲ ਵਿੱਚ ਮਦਦ ਕਰਦੇ ਹਨ"],
  AB: ["ਬੱਚੇ ਪਰਿਵਾਰ ਅਤੇ ਸਿੱਖਿਅਕਾਂ ਨਾਲ ਹਿੱਸਾ ਲੈਂਦੇ ਹਨ", "ਬੱਚਿਆਂ ਦੇ ਸਰੀਰ ਅਤੇ ਜਜ਼ਬਾਤਾਂ ਦੀ ਦੇਖਭਾਲ ਹੁੰਦੀ ਹੈ", "ਬੱਚੇ ਦਿਨ ਨੂੰ ਸਮਝਣ ਲਈ ਖੇਡਦੇ ਹਨ", "ਬੱਚੇ ਸ਼ਬਦ, ਕਹਾਣੀਆਂ ਅਤੇ ਇਸ਼ਾਰੇ ਅਜ਼ਮਾਉਂਦੇ ਹਨ", "ਬੱਚੇ ਦੋਸਤਾਂ ਅਤੇ ਸਾਂਝੀਆਂ ਥਾਵਾਂ ਦੀ ਸੰਭਾਲ ਕਰਦੇ ਹਨ"],
  SK: ["ਬੱਚਿਆਂ ਨੂੰ ਸਮਰੱਥ ਸਿਖਿਆਰਥੀ ਮੰਨਿਆ ਜਾਂਦਾ ਹੈ", "ਬੱਚਿਆਂ ਕੋਲ ਹਿਲਣ ਅਤੇ ਆਰਾਮ ਦਾ ਸਮਾਂ ਹੈ", "ਬੱਚੇ ਖੇਡ ਕੇ ਅਤੇ ਖੋਜ ਕੇ ਸਿੱਖਦੇ ਹਨ", "ਬੱਚੇ ਗੱਲ ਕਰਦੇ ਹਨ, ਸੁਣਦੇ ਹਨ ਅਤੇ ਨਿਸ਼ਾਨ ਬਣਾਉਂਦੇ ਹਨ", "ਨਿੱਘੇ ਰਿਸ਼ਤੇ ਕਮਰੇ ਦੀ ਅਗਵਾਈ ਕਰਦੇ ਹਨ"],
  MB: ["ਬੱਚੇ ਜਾਣ-ਪਛਾਣ ਵਾਲਿਆਂ ਨਾਲ ਸੁਰੱਖਿਅਤ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ", "ਬੱਚੇ ਆਪਣੇ ਢੰਗ ਨਾਲ ਹਿਲਦੇ, ਆਰਾਮ ਕਰਦੇ ਅਤੇ ਖਾਂਦੇ ਹਨ", "ਬੱਚੇ ਸਾਰਾ ਦਿਨ ਵਿਚਾਰਾਂ ਨਾਲ ਖੇਡਦੇ ਹਨ", "ਬੱਚੇ ਸ਼ਬਦ, ਗੀਤ ਅਤੇ ਨਿਸ਼ਾਨ ਅਜ਼ਮਾਉਂਦੇ ਹਨ", "ਬੱਚੇ ਫ਼ਰਕ ਵੇਖਦੇ ਹਨ ਅਤੇ ਇੱਕ ਦੂਜੇ ਦੀ ਮਦਦ ਕਰਦੇ ਹਨ"],
  ON: ["ਬੱਚਾ ਮਹਿਸੂਸ ਕਰਦਾ ਹੈ ਕਿ ਉਸਦੀ ਥਾਂ ਇੱਥੇ ਹੈ", "ਬੱਚਾ ਸਰੀਰ ਅਤੇ ਜਜ਼ਬਾਤਾਂ ਵਿੱਚ ਠੀਕ ਹੈ", "ਬੱਚਾ ਸਵਾਲਾਂ ਅਤੇ ਖੇਡ ਵਿੱਚ ਰੁੱਝਿਆ ਹੈ", "ਬੱਚਾ ਕਈ ਤਰੀਕਿਆਂ ਨਾਲ ਵਿਚਾਰ ਸਾਂਝੇ ਕਰਦਾ ਹੈ", "ਬੱਚਾ ਸਮੂਹ ਦੀ ਜ਼ਿੰਦਗੀ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹੈ"],
  QC: ["ਬੱਚਾ ਇੱਥੇ ਦੇ ਲੋਕਾਂ ਨਾਲ ਜੁੜਿਆ ਮਹਿਸੂਸ ਕਰਦਾ ਹੈ", "ਬੱਚਾ ਹਿਲਦਾ ਹੈ, ਆਰਾਮ ਕਰਦਾ ਹੈ ਅਤੇ ਆਪਣੇ ਸਰੀਰ ਦੀ ਸੰਭਾਲ ਕਰਦਾ ਹੈ", "ਬੱਚਾ ਸਮਝਣ ਲਈ ਖੇਡਦਾ ਹੈ", "ਬੱਚਾ ਬੋਲਦਾ ਹੈ, ਸੁਣਦਾ ਹੈ ਅਤੇ ਵਿਚਾਰ ਦੱਸਦਾ ਹੈ", "ਬੱਚਾ ਸਮੂਹ ਦੀ ਜ਼ਿੰਦਗੀ ਦਾ ਆਦੀ ਹੁੰਦਾ ਹੈ"],
  NB: ["ਬੱਚੇ ਸੁਰੱਖਿਅਤ ਅਤੇ ਸਵਾਗਤ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ", "ਬੱਚਿਆਂ ਦੀ ਸਿਹਤ ਅਤੇ ਜਜ਼ਬਾਤਾਂ ਦੀ ਦੇਖਭਾਲ ਹੁੰਦੀ ਹੈ", "ਬੱਚੇ ਖੇਡਦੇ ਹਨ, ਬਣਾਉਂਦੇ ਹਨ ਅਤੇ ਹੱਲ ਅਜ਼ਮਾਉਂਦੇ ਹਨ", "ਬੱਚੇ ਉਨ੍ਹਾਂ ਤਰੀਕਿਆਂ ਨਾਲ ਗੱਲ ਕਰਦੇ ਹਨ ਜੋ ਮਾਇਨੇ ਰੱਖਦੇ ਹਨ", "ਬੱਚੇ ਨਿਆਂ ਅਤੇ ਦੇਖਭਾਲ ਦਾ ਅਭਿਆਸ ਕਰਦੇ ਹਨ"],
  NS: ["ਬੱਚੇ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ ਕਿ ਸਮੂਹ ਵਿੱਚ ਉਨ੍ਹਾਂ ਦੀ ਥਾਂ ਹੈ", "ਬੱਚੇ ਮਦਦ ਨਾਲ ਆਪਣੀ ਤੰਦਰੁਸਤੀ ਸੰਭਾਲਦੇ ਹਨ", "ਬੱਚੇ ਖੋਜਦੇ ਅਤੇ ਬਣਾਉਂਦੇ ਹਨ", "ਬੱਚੇ ਜੁੜਨ ਲਈ ਭਾਸ਼ਾ ਵਰਤਦੇ ਹਨ", "ਬੱਚੇ ਲੋਕਾਂ ਅਤੇ ਬਾਹਰਲੇ ਥਾਂ ਦੀ ਦੇਖਭਾਲ ਕਰਦੇ ਹਨ"],
  PE: ["ਬੱਚੇ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ ਕਿ ਉਹ ਜਾਣੇ ਜਾਂਦੇ ਹਨ ਅਤੇ ਉਨ੍ਹਾਂ ਦੀ ਥਾਂ ਹੈ", "ਬੱਚੇ ਦਿਨ ਵਿੱਚ ਤੰਦਰੁਸਤ ਅਤੇ ਸੁਰੱਖਿਅਤ ਹਨ", "ਬੱਚੇ ਖੋਜਦੇ ਅਤੇ ਲੱਭਦੇ ਹਨ", "ਬੱਚੇ ਸ਼ਬਦਾਂ ਅਤੇ ਨਿਸ਼ਾਨਾਂ ਨਾਲ ਵਿਚਾਰ ਦੱਸਦੇ ਹਨ", "ਬੱਚੇ ਆਪਣੇ ਆਪ ਬਾਰੇ ਸਮਝ ਬਣਾਉਂਦੇ ਹਨ"],
  NL: ["ਬੱਚੇ ਤੰਦਰੁਸਤ ਹਨ ਅਤੇ ਆਪਣੀ ਥਾਂ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ", "ਬੱਚਿਆਂ ਨੂੰ ਉਨ੍ਹਾਂ ਦੀ ਲੋੜ ਅਨੁਸਾਰ ਦੇਖਭਾਲ ਮਿਲਦੀ ਹੈ", "ਬੱਚੇ ਖੇਡਦੇ ਅਤੇ ਖੋਜਦੇ ਹਨ", "ਬੱਚੇ ਭਰੋਸੇ ਵਾਲੇ ਲੋਕਾਂ ਨਾਲ ਗੱਲ ਕਰਦੇ ਹਨ", "ਬੱਚੇ ਸਮੂਹ ਵਿੱਚ ਯੋਗਦਾਨ ਪਾਉਂਦੇ ਹਨ"],
  YT: ["ਖਰੜਾ: ਯੂਕਾਨ ਦਾ ਢਾਂਚਾ ਛਪਣ ਤੱਕ ਬੱਚੇ ਸ਼ਾਮਲ ਮਹਿਸੂਸ ਕਰਦੇ ਹਨ", "ਖਰੜਾ: ਬੱਚੇ ਤੰਦਰੁਸਤ ਅਤੇ ਸ਼ਾਮਲ ਹਨ", "ਖਰੜਾ: ਬੱਚੇ ਆਪਣੀ ਰਫ਼ਤਾਰ ਨਾਲ ਖੋਜਦੇ ਹਨ", "ਖਰੜਾ: ਬੱਚੇ ਘਰ ਦੀ ਭਾਸ਼ਾ ਅਤੇ ਅੰਗਰੇਜ਼ੀ ਜਾਂ ਫ਼ਰਾਂਸੀਸੀ ਵਰਤਦੇ ਹਨ", "ਖਰੜਾ: ਪਹਿਲੀਆਂ ਕੌਮਾਂ ਦੀਆਂ ਤਰਜੀਹਾਂ ਭਾਈਚਾਰਾ ਦੱਸਦਾ ਹੈ, KidEase ਨਹੀਂ"],
  NT: ["ਬੱਚਿਆਂ ਦੀ ਥਾਂ ਪਰਿਵਾਰ, ਸਿੱਖਿਅਕਾਂ ਅਤੇ ਭਾਈਚਾਰੇ ਨਾਲ ਹੈ", "ਬੱਚੇ ਤੰਦਰੁਸਤ ਹਨ", "ਬੱਚੇ ਖੋਜਦੇ ਹਨ", "ਬੱਚੇ ਗੱਲ ਕਰਦੇ ਹਨ", "ਬੱਚੇ ਆਲੇ-ਦੁਆਲੇ ਦੀ ਧਰਤੀ ਨਾਲ ਸਿੱਖਦੇ ਹਨ"],
  NU: ["ਬੱਚਾ ਦਿਨ ਦਾ ਕੇਂਦਰ ਹੈ", "ਦੇਖਭਾਲ ਬੱਚੇ ਦੀ ਰਫ਼ਤਾਰ ਅਨੁਸਾਰ ਹੈ", "ਖੇਡ ਪਰਿਵਾਰ ਦੇ ਸਿੱਖਣ ਦੇ ਢੰਗਾਂ ਲਈ ਥਾਂ ਛੱਡਦੀ ਹੈ", "ਪਰਿਵਾਰ ਬੱਚੇ ਦੇ ਪਹਿਲੇ ਅਧਿਆਪਕ ਹਨ", "ਭਾਈਚਾਰਾ ਬੱਚਿਆਂ ਨੂੰ ਸਿੱਖਣ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹੈ"],
};

const es: Block = {
  BC: ["Los niños sienten que pertenecen con su gente", "Los niños están bien, descansan y están incluidos", "Los niños exploran con las manos y con preguntas", "Los niños comparten ideas en las lenguas de su familia", "Los niños ayudan a cuidar el lugar donde juegan"],
  AB: ["Los niños participan con su familia y los educadores", "Cuidan el cuerpo y los sentimientos de los niños", "Los niños juegan para entender el día", "Los niños prueban palabras, historias y señas", "Los niños cuidan a los amigos y los espacios compartidos"],
  SK: ["Ven a los niños como aprendices capaces", "Los niños tienen tiempo para moverse y descansar", "Los niños aprenden jugando y explorando", "Los niños hablan, escuchan y dejan marcas", "Las relaciones cálidas guían la sala"],
  MB: ["Los niños se sienten seguros con personas que conocen", "Los niños se mueven, descansan y comen a su ritmo", "Los niños juegan con ideas durante el día", "Los niños prueban palabras, canciones y trazos", "Los niños notan las diferencias y se ayudan"],
  ON: ["El niño siente que pertenece aquí", "El niño está bien en el cuerpo y en los sentimientos", "El niño está ocupado con preguntas y juego", "El niño comparte ideas de muchas formas", "El niño ayuda en la vida del grupo"],
  QC: ["El niño se siente unido a las personas de aquí", "El niño se mueve, descansa y cuida su cuerpo", "El niño juega para comprender", "El niño habla, escucha y expresa ideas", "El niño se acostumbra a la vida en grupo"],
  NB: ["Los niños se sienten seguros y bienvenidos", "Cuidan la salud y los sentimientos de los niños", "Los niños juegan, inventan y prueban soluciones", "Los niños se comunican de formas que importan", "Los niños practican la justicia y el cuidado"],
  NS: ["Los niños sienten que tienen un lugar en el grupo", "Los niños cuidan su bienestar con ayuda", "Los niños descubren e inventan", "Los niños usan el lenguaje para conectar", "Los niños cuidan a las personas y el aire libre"],
  PE: ["Los niños sienten que los conocen y que pertenecen", "Los niños están bien y seguros en el día", "Los niños exploran y descubren", "Los niños expresan ideas con palabras y trazos", "Los niños forman una idea de quiénes son"],
  NL: ["Los niños están bien y sienten que pertenecen", "Los niños reciben un cuidado que se ajusta a lo que necesitan", "Los niños juegan y exploran", "Los niños se comunican con personas de confianza", "Los niños aportan al grupo"],
  YT: ["Borrador: los niños se sienten incluidos mientras Yukón no publique su marco", "Borrador: los niños están bien e incluidos", "Borrador: los niños exploran a su ritmo", "Borrador: los niños usan las lenguas de casa y el inglés o el francés", "Borrador: las prioridades de las Primeras Naciones las nombra la comunidad, no KidEase"],
  NT: ["Los niños pertenecen con la familia, los educadores y la comunidad", "Los niños están bien", "Los niños exploran", "Los niños se comunican", "Los niños aprenden con la tierra que los rodea"],
  NU: ["El niño está en el centro del día", "El cuidado sigue el ritmo del niño", "El juego deja espacio a las formas de aprender de la familia", "Las familias son los primeros maestros del niño", "La comunidad ayuda a los niños a aprender"],
};

const ar: Block = {
  BC: ["يشعر الأطفال بأن لهم مكانًا مع أهلهم", "الأطفال بخير ويرتاحون ومشمولون", "يستكشف الأطفال بأيديهم وأسئلة", "يشارك الأطفال أفكارًا بلغات عائلتهم", "يساعد الأطفال في العناية بمكان اللعب"],
  AB: ["يشارك الأطفال مع عائلتهم والمربين", "تُراعى أجسام الأطفال ومشاعرهم", "يلعب الأطفال ليفهموا يومهم", "يجرب الأطفال كلمات وقصصًا وإشارات", "يعتني الأطفال بالأصدقاء والأماكن المشتركة"],
  SK: ["يُرى الأطفال متعلمين قادرين", "لدى الأطفال وقت للحركة والراحة", "يتعلم الأطفال باللعب والاستكشاف", "يتكلم الأطفال ويصغون ويتركون أثرًا", "تقود الغرفة علاقات دافئة"],
  MB: ["يشعر الأطفال بالأمان مع من يعرفونهم", "يتحرك الأطفال ويرتاحون ويأكلون بما يناسبهم", "يلعب الأطفال بالأفكار طوال اليوم", "يجرب الأطفال كلمات وأغاني وخطوطًا", "يلاحظ الأطفال الفروق ويساعدون بعضهم"],
  ON: ["يشعر الطفل بأن له مكانًا هنا", "الطفل بخير في جسمه ومشاعره", "الطفل مشغول بالأسئلة واللعب", "يشارك الطفل أفكاره بطرق كثيرة", "يساعد الطفل في حياة المجموعة"],
  QC: ["يشعر الطفل بصلة مع الناس هنا", "يتحرك الطفل ويرتاح ويعتني بجسمه", "يلعب الطفل كي يفهم", "يتكلم الطفل ويصغي ويعبر عن أفكاره", "يعتاد الطفل الحياة في جماعة"],
  NB: ["يشعر الأطفال بالأمان والترحيب", "تُراعى صحة الأطفال ومشاعرهم", "يلعب الأطفال ويخترعون ويجربون حلولًا", "يتواصل الأطفال بطرق لها قيمة", "يتدرب الأطفال على الإنصاف والعناية"],
  NS: ["يشعر الأطفال بأن لهم مكانًا في المجموعة", "يعتني الأطفال بعافيتهم بمساعدة", "يكتشف الأطفال ويخترعون", "يستخدم الأطفال اللغة ليَصلوا", "يعتني الأطفال بالناس وبالخارج"],
  PE: ["يشعر الأطفال بأنهم معروفون ولهم مكان", "الأطفال بخير وآمنون في يومهم", "يستكشف الأطفال ويكتشفون", "يعبر الأطفال عن أفكار بكلمات وخطوط", "يبني الأطفال إحساسًا بمن هم"],
  NL: ["الأطفال بخير ويشعرون بأن لهم مكانًا", "يحصل الأطفال على عناية تناسب حاجتهم", "يلعب الأطفال ويستكشفون", "يتواصل الأطفال مع من يثقون بهم", "يسهم الأطفال في المجموعة"],
  YT: ["مسودة: يشعر الأطفال بالشمول ريثما ينشر يوكون إطاره", "مسودة: الأطفال بخير ومشمولون", "مسودة: يستكشف الأطفال بإيقاعهم", "مسودة: يستخدم الأطفال لغات البيت والإنجليزية أو الفرنسية", "مسودة: أولويات الأمم الأولى تسميها الجماعة لا KidEase"],
  NT: ["للأطفال مكان مع العائلة والمربين والجماعة", "الأطفال بخير", "يستكشف الأطفال", "يتواصل الأطفال", "يتعلم الأطفال مع الأرض حولهم"],
  NU: ["الطفل في مركز اليوم", "العناية تتبع إيقاع الطفل", "اللعب يترك مكانًا لطرق العائلة في التعلم", "العائلات أول معلمي الطفل", "الجماعة تساعد الأطفال على التعلم"],
};

const tl: Block = {
  BC: ["Nararamdaman ng mga bata na kabilang sila sa kanilang mga tao", "Maayos, nakakapagpahinga, at kasama ang mga bata", "Nagsisiyasat ang mga bata gamit ang kamay at mga tanong", "Nagbabahagi ang mga bata ng ideya sa mga wika ng pamilya", "Tumutulong ang mga bata na alagaan ang lugar ng laro"],
  AB: ["Nakikibahagi ang mga bata kasama ang pamilya at mga tagapagturo", "Inaalagaan ang katawan at damdamin ng mga bata", "Naglalaro ang mga bata upang maintindihan ang araw", "Sumusubok ang mga bata ng salita, kuwento, at senyas", "Inaalagaan ng mga bata ang mga kaibigan at mga pinagsasaluhang lugar"],
  SK: ["Nakikita ang mga bata bilang may kakayahang mag-aral", "May oras ang mga bata para gumalaw at magpahinga", "Natututo ang mga bata sa paglalaro at pagsisiyasat", "Nagsasalita, nakikinig, at nag-iiwan ng marka ang mga bata", "Ang maiinit na ugnayan ang gumagabay sa silid"],
  MB: ["Ligtas ang pakiramdam ng mga bata kasama ang mga kakilala", "Gumagalaw, nagpapahinga, at kumakain ang mga bata sa paraang bagay sa kanila", "Naglalaro ang mga bata ng mga ideya buong araw", "Sumusubok ang mga bata ng salita, awit, at guhit", "Napapansin ng mga bata ang pagkakaiba at nagtutulungan"],
  ON: ["Nararamdaman ng bata na kabilang siya rito", "Maayos ang katawan at damdamin ng bata", "Abala ang bata sa mga tanong at laro", "Ibinabahagi ng bata ang mga ideya sa maraming paraan", "Tumutulong ang bata sa buhay ng grupo"],
  QC: ["Nararamdaman ng bata na konektado siya sa mga tao rito", "Gumagalaw, nagpapahinga, at inaalagaan ng bata ang katawan", "Naglalaro ang bata upang maintindihan", "Nagsasalita, nakikinig, at nagpapahayag ang bata", "Nasasanay ang bata sa buhay sa grupo"],
  NB: ["Ligtas at malugod ang pakiramdam ng mga bata", "Inaalagaan ang kalusugan at damdamin ng mga bata", "Naglalaro, lumilikha, at sumusubok ng solusyon ang mga bata", "Nakikipag-usap ang mga bata sa mga paraang mahalaga", "Nagsasanay ang mga bata ng pagiging patas at pag-aalaga"],
  NS: ["Nararamdaman ng mga bata na may lugar sila sa grupo", "Inaalagaan ng mga bata ang sariling kabutihan nang may tulong", "Nakatutuklas at lumilikha ang mga bata", "Ginagamit ng mga bata ang wika upang kumonekta", "Inaalagaan ng mga bata ang mga tao at ang labas"],
  PE: ["Nararamdaman ng mga bata na kilala sila at kabilang sila", "Maayos at ligtas ang mga bata sa araw", "Nagsisiyasat at nakatutuklas ang mga bata", "Nagpapahayag ang mga bata ng ideya gamit ang salita at marka", "Nabubuo ng mga bata ang diwa kung sino sila"],
  NL: ["Maayos ang mga bata at nararamdamang kabilang sila", "May pag-aalaga ang mga bata na tumutugma sa kanilang pangangailangan", "Naglalaro at nagsisiyasat ang mga bata", "Nakikipag-usap ang mga bata sa mga pinagkakatiwalaan", "Nag-aambag ang mga bata sa grupo"],
  YT: ["Burador: kasama ang pakiramdam ng mga bata habang hindi pa lumalabas ang balangkas ng Yukon", "Burador: maayos at kasama ang mga bata", "Burador: nagsisiyasat ang mga bata sa sarili nilang bilis", "Burador: ginagamit ng mga bata ang wika sa bahay at Ingles o Pranses", "Burador: ang mga prayoridad ng First Nations ay pinangungusapan ng komunidad, hindi ng KidEase"],
  NT: ["May lugar ang mga bata kasama ang pamilya, mga tagapagturo, at komunidad", "Maayos ang mga bata", "Nagsisiyasat ang mga bata", "Nakikipag-usap ang mga bata", "Natututo ang mga bata kasama ang lupa sa paligid"],
  NU: ["Ang bata ang sentro ng araw", "Ang pag-aalaga ay sumusunod sa bilis ng bata", "May puwang ang laro para sa paraan ng pagkatuto ng pamilya", "Ang pamilya ang unang guro ng bata", "Tinutulungan ng komunidad ang mga bata na matuto"],
};

const it: Block = {
  BC: ["I bambini sentono di appartenere alle loro persone", "I bambini stanno bene, riposano e sono inclusi", "I bambini esplorano con le mani e con le domande", "I bambini condividono idee nelle lingue della famiglia", "I bambini aiutano a curare il luogo del gioco"],
  AB: ["I bambini partecipano con la famiglia e gli educatori", "Il corpo e i sentimenti dei bambini sono curati", "I bambini giocano per capire la giornata", "I bambini provano parole, storie e segni", "I bambini hanno cura degli amici e degli spazi condivisi"],
  SK: ["I bambini sono visti come apprendisti capaci", "I bambini hanno tempo per muoversi e riposare", "I bambini imparano giocando ed esplorando", "I bambini parlano, ascoltano e lasciano tracce", "Relazioni calde guidano la stanza"],
  MB: ["I bambini si sentono al sicuro con persone che conoscono", "I bambini si muovono, riposano e mangiano nel modo che fa per loro", "I bambini giocano con le idee per tutta la giornata", "I bambini provano parole, canzoni e segni", "I bambini notano le differenze e si aiutano"],
  ON: ["Il bambino sente di appartenere qui", "Il bambino sta bene nel corpo e nei sentimenti", "Il bambino è occupato da domande e gioco", "Il bambino condivide idee in molti modi", "Il bambino aiuta la vita del gruppo"],
  QC: ["Il bambino si sente legato alle persone qui", "Il bambino si muove, riposa e ha cura del corpo", "Il bambino gioca per capire", "Il bambino parla, ascolta ed esprime idee", "Il bambino si abitua alla vita in gruppo"],
  NB: ["I bambini si sentono al sicuro e accolti", "La salute e i sentimenti dei bambini sono curati", "I bambini giocano, inventano e provano soluzioni", "I bambini comunicano in modi che contano", "I bambini praticano equità e cura"],
  NS: ["I bambini sentono di avere un posto nel gruppo", "I bambini hanno cura del proprio benessere con aiuto", "I bambini scoprono e inventano", "I bambini usano il linguaggio per collegarsi", "I bambini hanno cura delle persone e dell'esterno"],
  PE: ["I bambini sentono di essere conosciuti e di appartenere", "I bambini stanno bene e al sicuro nella giornata", "I bambini esplorano e scoprono", "I bambini esprimono idee con parole e segni", "I bambini costruiscono un'idea di chi sono"],
  NL: ["I bambini stanno bene e sentono di appartenere", "I bambini ricevono una cura adatta ai loro bisogni", "I bambini giocano ed esplorano", "I bambini comunicano con persone di cui si fidano", "I bambini contribuiscono al gruppo"],
  YT: ["Bozza: i bambini si sentono inclusi finché lo Yukon non pubblica il quadro", "Bozza: i bambini stanno bene e sono inclusi", "Bozza: i bambini esplorano al loro ritmo", "Bozza: i bambini usano le lingue di casa e l'inglese o il francese", "Bozza: le priorità delle Prime Nazioni le nomina la comunità, non KidEase"],
  NT: ["I bambini appartengono con famiglia, educatori e comunità", "I bambini stanno bene", "I bambini esplorano", "I bambini comunicano", "I bambini imparano con la terra intorno a loro"],
  NU: ["Il bambino è al centro della giornata", "La cura segue il ritmo del bambino", "Il gioco lascia spazio ai modi di imparare della famiglia", "Le famiglie sono i primi maestri del bambino", "La comunità aiuta i bambini a imparare"],
};

const de: Block = {
  BC: ["Kinder spüren, dass sie bei ihren Menschen dazugehören", "Kinder sind wohl, ruhen sich aus und sind dabei", "Kinder erkunden mit Händen und Fragen", "Kinder teilen Ideen in den Sprachen ihrer Familie", "Kinder helfen, den Spielort zu pflegen"],
  AB: ["Kinder machen mit Familie und Fachkräften mit", "Körper und Gefühle der Kinder werden versorgt", "Kinder spielen, um den Tag zu verstehen", "Kinder probieren Wörter, Geschichten und Zeichen", "Kinder achten auf Freunde und gemeinsame Orte"],
  SK: ["Kinder gelten als fähige Lernende", "Kinder haben Zeit für Bewegung und Ruhe", "Kinder lernen durch Spiel und Erkunden", "Kinder sprechen, hören zu und hinterlassen Spuren", "Warme Beziehungen führen den Raum"],
  MB: ["Kinder fühlen sich sicher bei Menschen, die sie kennen", "Kinder bewegen sich, ruhen und essen so, wie es zu ihnen passt", "Kinder spielen den Tag über mit Ideen", "Kinder probieren Wörter, Lieder und Spuren", "Kinder bemerken Unterschiede und helfen einander"],
  ON: ["Das Kind spürt, dass es hier dazugehört", "Das Kind ist im Körper und in den Gefühlen wohl", "Das Kind ist mit Fragen und Spiel beschäftigt", "Das Kind teilt Ideen auf viele Arten", "Das Kind hilft im Leben der Gruppe"],
  QC: ["Das Kind fühlt sich mit den Menschen hier verbunden", "Das Kind bewegt sich, ruht und sorgt für den Körper", "Das Kind spielt, um zu verstehen", "Das Kind spricht, hört zu und drückt Ideen aus", "Das Kind gewöhnt sich an das Leben in der Gruppe"],
  NB: ["Kinder fühlen sich sicher und willkommen", "Gesundheit und Gefühle der Kinder werden versorgt", "Kinder spielen, erfinden und probieren Lösungen", "Kinder verständigen sich auf Arten, die zählen", "Kinder üben Fairness und Fürsorge"],
  NS: ["Kinder spüren, dass sie einen Platz in der Gruppe haben", "Kinder sorgen mit Hilfe für ihr Wohlbefinden", "Kinder entdecken und erfinden", "Kinder nutzen Sprache, um sich zu verbinden", "Kinder sorgen für Menschen und das Draußen"],
  PE: ["Kinder spüren, dass man sie kennt und sie dazugehören", "Kinder sind im Tag wohl und sicher", "Kinder erkunden und entdecken", "Kinder drücken Ideen mit Wörtern und Spuren aus", "Kinder bilden ein Gefühl dafür, wer sie sind"],
  NL: ["Kinder sind wohl und spüren, dass sie dazugehören", "Kinder bekommen Versorgung, die zu ihren Bedürfnissen passt", "Kinder spielen und erkunden", "Kinder verständigen sich mit Menschen, denen sie vertrauen", "Kinder tragen zur Gruppe bei"],
  YT: ["Entwurf: Kinder fühlen sich einbezogen, solange Yukon keinen Rahmen veröffentlicht hat", "Entwurf: Kinder sind wohl und einbezogen", "Entwurf: Kinder erkunden in ihrem Tempo", "Entwurf: Kinder nutzen Familiensprachen und Englisch oder Französisch", "Entwurf: Prioritäten der First Nations nennt die Gemeinschaft, nicht KidEase"],
  NT: ["Kinder gehören zu Familie, Fachkräften und Gemeinschaft", "Kinder sind wohl", "Kinder erkunden", "Kinder verständigen sich", "Kinder lernen mit dem Land um sie herum"],
  NU: ["Das Kind steht im Mittelpunkt des Tages", "Die Versorgung folgt dem Tempo des Kindes", "Spiel lässt Raum für die Lernweisen der Familie", "Familien sind die ersten Lehrkräfte des Kindes", "Die Gemeinschaft hilft Kindern beim Lernen"],
};

export const GOAL_TEXT: Record<ShippedLocale, Record<ProvinceCode, Record<GoalTheme, string>>> = {
  en: lines(en),
  fr: lines(fr),
  zh: lines(zh),
  yue: lines(yue),
  pa: lines(pa),
  es: lines(es),
  ar: lines(ar),
  tl: lines(tl),
  it: lines(it),
  de: lines(de),
};
