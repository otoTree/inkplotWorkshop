# 短剧封面生成 Agent · 设计规则系统 v1.0

---

## 一、系统概述

**输入**
- 故事介绍（情节梗概）
- 主角名称
- 主角形象图（可选，上传后由 VLM 参考）

**输出**
- 文本：`title`（核心标题）+ `slogan`（副标题）设定方案
- 图片 Prompt：总封面 16:9、分集封面 3:4

**核心处理链路**
```
输入解析 → 题材识别 → 设计规则匹配 → LLM 生成文字方案 + 图片 Prompt → VLM 生成封面图
```

---

## 二、题材识别体系

Agent 根据故事介绍自动判断题材，作为后续所有设计决策的基础。

| 题材标签 | 触发关键词示例 |
|---|---|
| `romance_ceo` 霸总爱情 | 总裁、豪门、商战、婚约 |
| `romance_fantasy` 奇幻爱情 | 穿越、古代、修仙、王爷 |
| `vampire` 吸血鬼 | 永生、血族、夜族、黑暗力量 |
| `werewolf` 狼人 | 狼族、变身、月圆、野性 |
| `campus` 青春校园 | 高中、大学、初恋、社团 |
| `crime` 黑帮犯罪 | 黑帮、复仇、地下、枪战 |
| `thriller` 悬疑惊悚 | 失忆、追杀、秘密、推理 |
| `apocalypse` 末日灾难 | 末日、病毒、废土、生存 |
| `scifi` 科幻 | 外星、AI、未来、太空 |
| `historical` 历史古装 | 朝代、将军、皇帝、宫廷 |

> **多题材处理**：若故事涉及多个题材（如"霸总 × 吸血鬼"），取主要题材为设计基准，次要题材作为风格修饰词融入 Prompt。

---

## 三、版式系统（Layout）

共 12 种布局，按角色数量与叙事结构选择：

| 编号 | 名称 | 适用场景 | 说明 |
|---|---|---|---|
| 01 | `top_title` | 单主角叙事 | 标题置于上三分之一，主角占据中下区域 |
| 02 | `bottom_title` | 人物气场型 | 标题置于底部，主角占据上三分之二 |
| 03 | `couple_center` | 双人爱情 | 情侣居中，两人面部略向对方，背景虚化或戏剧化环境 |
| 04 | `face_off` | 对立冲突 | 两角色分踞画面左右两侧，中央形成张力空间 |
| 05 | `triangle` | 三角关系 | 两角色下方左右、主导角色居上方，形成三角构图 |
| 06 | `hero_portrait` | 单人主角 | 主角大幅人像占据大部分画面，背景辅助元素 |
| 07 | `ensemble` | 群像剧 | 多角色分层排列，形成群戏感 |
| 08 | `surround` | 主角中心型 | 主角居中，次要角色环绕四周 |
| 09 | `offset_title` | 人物张力型 | 标题置于左下或右下，角色占据对侧空间 |
| 10 | `diagonal` | 动态感 | 标题与角色沿对角线分布，形成视觉流动 |
| 11 | `dual_camp` | 阵营对抗 | 两大阵营分列画面左右，形成战场式对立 |
| 12 | `central_title` | 标题主视觉 | 大标题居中，角色在标题上下分布 |

**选择规则**

```
1 位主角           → hero_portrait / top_title / bottom_title
2 位主角（爱情）   → couple_center / offset_title
2 位主角（对立）   → face_off / diagonal
3 位角色           → triangle
多主角群像         → ensemble / surround / dual_camp
强调标题           → central_title / offset_title
```

---

## 四、标题语义系统

### 4.1 标题结构分类

| 结构类型 | 公式 | 示例 |
|---|---|---|
| 情节关系型 | 身份A + 情节关系 + 身份B | 《总裁的秘密新娘》 |
| 情绪冲突型 | 情绪词 + 情绪词 | 《痴迷与背叛》 |
| 身份叙事型 | 身份 + 属性 | 《危险的他》《替嫁甜妻》 |
| 命运悬念型 | 疑问 / 宿命 + 转折 | 《本该陌生的你》 |
| 动作宣言型 | 动词 + 宾语 | 《绑定豪门》《逆袭归来》 |

### 4.2 Slogan 副标题规则

- 字数：8–20字
- 语气：补充情绪，不重复标题叙事
- 典型结构：`[限制条件] + [情感动作] + [对象]`
- 示例：`"他明知危险，却还是靠近了她"`

---

## 五、字体设计系统

### 5.1 题材→字体映射

| 题材 | 字体风格 | 代表字体 | 特征 |
|---|---|---|---|
| 爱情 / 吸血鬼 | Serif 古典衬线 | Trajan / Didot | 优雅、古典 |
| 霸总 / 财富 | Luxury Serif 高对比衬线 | Bodoni / Playfair Display | 权威、奢华 |
| 末日 / 灾难 | Bold Sans Serif 粗无衬线 | Impact / Bebas Neue | 厚重、工业 |
| 黑帮 / 犯罪 | Condensed Sans 压缩无衬线 | Oswald / Franklin Gothic | 紧张、压迫 |
| 奇幻 / 狼人 | Decorative Serif 装饰衬线 | Cinzel / Uncial | 神秘、史诗 |
| 青春 / 校园 | Handwritten 手写体 | Pacifico / Dancing Script | 活泼、青春 |
| 科幻 | Geometric Sans 几何无衬线 | Eurostile / Orbitron | 未来感 |
| 历史古装 | 竖排宋体 / 仿宋 | — | 古朴、端庄 |

### 5.2 双字体系统（Script + Print）

封面标题强制使用两套字体叠加：

```
Script 手写体  ——  负责情绪渲染、装饰性表达
Serif / Sans   ——  负责核心信息传达、可读性保障
```

两者叠加方式：Script 字体叠压在 Print 字体之上，或以斜向流动方式穿插。

### 5.3 字号层级体系

封面标题词语分为三个视觉层级：

| 层级 | 词类 | 视觉处理 |
|---|---|---|
| Primary | 核心名词 / 身份词 | 最大字号，主字体 |
| Secondary | 形容词 / 情绪词 | 次大字号，可配 Script 字体 |
| Functional | 介词 / 冠词 / 助词 | 最小字号，视觉弱化 |

### 5.4 字体材质系统

| 材质 | 适用题材 | Prompt 关键词 |
|---|---|---|
| Gold Foil 金箔 | 霸总、财富、权力 | `gold foil texture, metallic gold lettering` |
| Stone Carving 石刻 | 历史、奇幻、古装 | `stone carved inscription, weathered texture` |
| Metal Texture 金属 | 灾难、科幻、犯罪 | `brushed metal surface, industrial texture` |
| Neon Glow 霓虹 | 青春、都市、科幻 | `neon glow, electric light effect` |
| Blood / Scratch 血迹划痕 | 恐怖、黑帮 | `blood splatter, scratch marks` |
| Ice Crystal 冰晶 | 冰雪奇幻、纯爱 | `ice crystal texture, frozen surface` |
| Embossed 压印 | 豪门、悬疑 | `embossed letterpress, subtle relief` |

### 5.5 颜色系统

| 颜色 | 情感含义 | 适用题材 |
|---|---|---|
| Gold 金色 | 财富、权力、尊贵 | 霸总、历史 |
| Red 红色 | 欲望、爱情、危险 | 爱情、黑帮 |
| White 白色 | 纯洁、命运、空灵 | 纯爱、奇幻 |
| Black 黑色 | 神秘、压迫、权威 | 犯罪、悬疑 |
| Yellow 黄色 | 青春、活力 | 校园、喜剧 |
| Blue 蓝色 | 科幻感、冷峻 | 科幻、吸血鬼 |
| Purple 紫色 | 神秘、魔幻 | 奇幻、狼人 |
| Crimson 深红 | 热血、复仇 | 末日、战争 |

> Script 手写体倾向使用高饱和度颜色；Print 字体倾向高对比度（黑/白/金）。

### 5.6 排版结构技巧

| 技巧 | 描述 | Prompt 写法 |
|---|---|---|
| Overlap 重叠 | 手写体叠压在衬线体之上 | `script font overlapping serif title` |
| Diagonal Flow 斜向流动 | 标题关键词沿斜线排列 | `diagonal title layout` |
| Scale Contrast 尺度对比 | 关键词极大，功能词极小 | `dramatic scale contrast in typography` |
| Depth Layer 空间层级 | 文字部分压在人物前或后 | `title text layered in front of / behind character` |

---

## 六、角色视觉系统

### 6.1 角色站位

| 站位类型 | 结构 | 适用题材 |
|---|---|---|
| Romantic Embrace 情侣贴靠 | 男主在后肩膀更高，女主在前头部略低，两人脸部贴近 | 爱情 |
| Conflict Stance 对峙 | 两人面对面或左右对立，中间留有张力空间 | 悬疑、黑帮、爱恨 |
| Dominant Single 霸主独像 | 单人占据画面中心，气场压迫画面边缘 | 霸总、末日英雄 |
| Triangle Composition 三角 | 反派或第三者居中上方，主CP居下方左右 | 三角恋、群像 |
| Back-to-Back 背靠背 | 两人背对，各自凝视画面两侧 | 搭档、对立又合作 |

### 6.2 视线结构

| 类型 | 说明 | 情感传达 |
|---|---|---|
| Direct Gaze 直视镜头 | 角色看向观众 | 压迫感、主动邀请 |
| Mutual Gaze 互视 | 男女主对视 | 情感张力、专注 |
| One-sided Gaze 单向凝视 | 一方凝视，另一方望向远处 | 暗恋、悬念 |
| Hero Gaze 英雄凝视 | 角色望向远方 | 使命感、孤独 |

### 6.3 身体姿态

| 姿态 | 特征描述 | 适用 |
|---|---|---|
| Dominant 支配 | 肩膀前倾，身体包围对方，头部靠近 | 霸总、控制型男主 |
| Dependent 依附 | 靠在对方肩膀，身体向对方倾斜 | 甜宠、弱气型女主 |
| Equal 平等 | 并肩站立，身体对称 | 搭档、现代独立女性 |
| Action 动态 | 身体旋转，手部动作明显 | 动作、末日、战争 |
| Protective 保护 | 一方手臂环绕另一方，身体前倾遮挡 | 保护型爱情 |

### 6.4 人物比例规律

```
脸部面积 ≥ 画面 40%（欧美短剧平台标准）
景别优先级：近景 > 半身 > 全身
三要素：脸部 + 情绪 + 关系 需同时清晰传达
```

### 6.5 光影模式

| 光影类型 | 结构 | 适用题材 | Prompt 关键词 |
|---|---|---|---|
| Golden Backlight 金色逆光 | 人物前暗，背景金色光晕 | 霸总爱情、古装 | `golden hour backlight, warm rim light` |
| Cold Rim Light 冷色边缘光 | 轮廓有蓝/紫边缘光，背景深暗 | 吸血鬼、科幻、神秘 | `cold blue rim light, dark atmospheric background` |
| Dramatic Lighting 戏剧高对比 | 一侧强亮，一侧深暗 | 黑帮、悬疑、惊悚 | `dramatic chiaroscuro lighting, high contrast` |
| Environmental Light 环境氛围光 | 火光/爆炸/天空光作为主光源 | 末日、战争、灾难 | `fire light, explosion glow, apocalyptic sky` |
| Soft Diffused 柔光漫射 | 均匀柔和，无硬阴影 | 青春校园、纯爱 | `soft diffused light, clean bright atmosphere` |
| Moonlight 月光 | 冷白月光从上方打入，强调轮廓 | 奇幻、狼人、穿越 | `moonlight, ethereal cold light from above` |

---

## 七、场景系统

### 7.1 场景库

| 场景标签 | 描述 | 适用题材 |
|---|---|---|
| `luxury_mansion` | 豪华别墅/大宅，落地窗/大理石 | 霸总、豪门 |
| `dark_castle` | 黑暗城堡，哥特式建筑，乌云背景 | 吸血鬼、奇幻 |
| `burning_city` | 燃烧的城市，废墟，火光 | 末日、战争 |
| `battlefield_smoke` | 战场烟尘，黄沙弥漫 | 历史战争 |
| `sunset_skyline` | 城市天际线日落，橙红天空 | 都市爱情 |
| `ancient_palace` | 古代宫殿，飞檐斗拱，月色 | 古装、历史 |
| `forest_night` | 深夜森林，月光透过树冠 | 狼人、奇幻 |
| `modern_office` | 高楼办公室，全景落地窗，城市俯瞰 | 霸总、职场 |
| `neon_street` | 霓虹街道，雨后反光地面 | 都市悬疑、青春 |
| `snowy_field` | 雪原荒野，苍茫天地 | 纯爱、末日 |

### 7.2 场景构图规则

- 背景服务于人物，不喧宾夺主：人物轮廓需与背景形成明确对比
- 景深处理：背景适度虚化（bokeh），聚焦于主角面部情绪
- 色温统一：场景色温需与题材光影模式匹配

---

## 八、景别系统（Shot Types）

### 8.1 允许的景别

**禁止使用近景全身**（会显得局促和不自然），只能使用以下三种景别：

| 景别类型 | 英文描述 | 适用场景 | Prompt 关键词 |
|---|---|---|---|
| 远景全身 | Wide shot / Full body from distance | 展示场景氛围、环境、动作场面 | `wide shot, full body from distance, environmental context` |
| 近景半身 | Medium close-up / Waist up | 展示姿态、互动、情感交流 | `medium close-up, waist up shot, upper body focus` |
| 面部特写 | Close-up / Face focus | 强调情绪、表情、眼神 | `close-up face shot, facial expression focus, emotional intensity` |

### 8.2 景别选择规则

```
单人英雄型（霸总、末日英雄）  → 面部特写 或 近景半身
双人爱情型                    → 近景半身（展示互动）
动作/战争场面                 → 远景全身（展示场景）
情绪表达型                    → 面部特写（强调表情）
```

### 8.3 强制要求

- 脸部面积必须 ≥ 画面 40%
- 必须清晰呈现人物情绪和表情
- 在 Prompt 中明确描述面部表情和情绪状态
- 禁止词：`NO awkward full body close-up, NO cramped composition`

---

## 九、图片 Prompt 生成规则

## 九、图片 Prompt 生成规则

### 9.1 Prompt 结构模板（更新版）

```
[画幅比例] [版式布局] [景别选择] [主角描述] [角色站位 + 姿态] [视线结构 + 情绪表达] [光影模式] [场景背景] [双字体标题设计 + 材质 + 排版技巧] [整体氛围词] [质量词] [禁止词]
```

### 9.2 通用质量词（更新版）

```
cinematic poster, ultra-detailed, 8K, professional photography,
volumetric lighting, depth of field, photorealistic, real human actors
```

### 9.3 强制要求

1. **文字必须全部英文**
   - 海报上的所有文字（标题、副标题）必须使用英文
   - Title 和 Slogan 都必须是英文

2. **真人摄影风格（强制）**
   - 必须包含：`photorealistic, real human actors, professional photography`
   - 必须排除：`NO anime, NO cartoon, NO illustration, NO 3D render, NO game style`

3. **双字体系统必须体现**
   - Script 手写体 + Serif/Sans 衬线体叠加
   - 描述方式：`elegant script font overlapping bold serif title`

4. **字体材质必须明确**
   - 根据题材选择对应材质（金箔、石刻、金属、霓虹等）

5. **排版技巧至少使用一种**
   - Overlap（重叠）、Diagonal Flow（斜向）、Scale Contrast（尺度对比）、Depth Layer（层级）

6. **景别和情绪表达**
   - 明确景别（远景全身/近景半身/面部特写）
   - 描述面部表情和情绪状态

### 9.4 按题材的 Prompt 组合示例（更新版）

**霸总爱情（16:9 总封面）**
```
Cinematic 16:9 drama poster, couple_center layout,
medium close-up waist up shot,
powerful CEO male lead in tailored suit and elegant female lead,
romantic embrace pose, female lead leaning slightly forward,
mutual gaze with intense emotional connection, facial expressions showing desire and vulnerability,
golden hour backlight with warm rim light,
luxury mansion interior background, large floor-to-ceiling windows,
title text with elegant script font overlapping bold luxury serif font in gold foil texture,
dramatic scale contrast in typography, title layered in front of characters,
dramatic warm color palette, photorealistic, real human actors, professional photography,
cinematic depth of field, 8K, volumetric lighting, face占40%以上,
NO anime, NO cartoon, NO illustration, NO awkward full body close-up
```

**末日灾难（3:4 分集封面）**
```
Cinematic 3:4 drama episode cover, hero_portrait layout,
close-up face shot with upper body visible,
rugged male protagonist with weathered face,
dominant action pose, direct gaze toward camera with determined expression,
facial features showing exhaustion and resolve, intense emotional intensity,
environmental fire light, apocalyptic sky background,
burning city ruins in distance, smoke and embers,
title in bold condensed metal-texture sans-serif with diagonal flow layout,
deep red and black color palette, photorealistic, real human actors, professional photography,
high contrast dramatic lighting, 8K, face占50%以上,
NO anime, NO cartoon, NO awkward full body close-up
```

---

## 十、题材→设计规则快速索引（更新版）

| 题材 | 推荐版式 | 字体风格 | 材质 | 颜色 | 光影 | 场景 |
|---|---|---|---|---|---|---|
| 霸总爱情 | couple_center / hero_portrait | Luxury Serif | Gold Foil | Gold + Black | Golden Backlight | luxury_mansion |
| 吸血鬼 | face_off / hero_portrait | Serif (Trajan) | Stone / Metal | Red + Black + White | Cold Rim Light | dark_castle |
| 末日灾难 | hero_portrait / dual_camp | Bold Sans | Metal | Crimson + Black | Environmental Light | burning_city |
| 黑帮犯罪 | face_off / diagonal | Condensed Sans | Scratch | Black + Red | Dramatic Lighting | neon_street |
| 奇幻狼人 | hero_portrait / triangle | Decorative Serif | Ice / Stone | Purple + Blue | Moonlight | forest_night |
| 青春校园 | couple_center / top_title | Handwritten | Neon Glow | Yellow + White | Soft Diffused | — |
| 历史古装 | hero_portrait / triangle | 宋体 / 仿宋 | Stone Carving | Gold + Red | Moonlight | ancient_palace |
| 科幻 | hero_portrait / ensemble | Geometric Sans | Metal | Blue + Silver | Cold Rim Light | — |
