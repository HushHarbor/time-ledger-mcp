/** Canonical data format and display rules returned by the help tool. */
export const HELP_TEXT_EN = `# Time Ledger: Format and behavior

## Tools
Use \`show\` to load a ledger, replace the in-memory cache, and get the local page URL. Use \`open\` to open that page in the system browser. This help is the authoritative format guide; English is the default, and \`language: "zh"\` returns the Chinese version.

## Tracks, IDs, and blocks
A ledger is a JSON object with a non-empty \`tracks\` array. Each track represents one item or asset, not a category, and has a globally unique \`id\`. Every block also has an \`id\`: it identifies the item whose global track supplies reusable content.

\`\`\`json
{
  "title": "Lighting composition",
  "axis": { "label": "Frames", "min": 0, "max": 20 },
  "tracks": [
    {
      "id": "character-a",
      "name": "Character A",
      "blocks": [
        { "id": "lighting", "start": 2, "end": 12, "title": "Lighting effect" },
        { "id": "character-a", "start": 0, "end": 20, "pose": "standing" }
      ]
    },
    {
      "id": "lighting",
      "name": "Lighting effect",
      "blocks": [
        { "id": "soft-light", "start": 5, "end": 8, "style": { "diffusion": 0.8 } },
        { "id": "lighting", "start": 2, "end": 12, "style": { "intensity": 0.7, "color": "#ffffff" } }
      ]
    }
  ]
}
\`\`\`

\`tracks[].id\` and \`blocks[].id\` share one global ID space. A block whose ID matches its track is that track's base item; any other ID refers to the corresponding global track. If a referenced ID has no track yet, the first occurrence initializes one. If an explicit track has no base block, its first external reference initializes that block. A track with neither a base block nor an external reference is invalid.

Within a track, the first position of each block ID in the \`blocks\` array determines its sub-track height. Sub-tracks follow that order from top to bottom. Repeated blocks with the same ID cannot overlap, even at a shared endpoint; blocks with different IDs may overlap. The \`tracks\` array likewise sets the top-to-bottom display order of tracks.

Track \`name\` and \`color\` are optional. A missing name defaults to the ID, and a missing color uses the default palette. In a block, only \`id\`, \`start\`, \`end\`, and \`title\` are reserved; every other key is part of its content.

## Composition and references
At the cursor, active blocks are combined from the bottom sub-track upward, so a higher sub-track takes priority when values conflict. Nested objects merge recursively, while arrays are replaced as a whole.

Each track is composed locally before its blocks resolve references to other tracks. References are followed recursively, and circular references are rejected. A referenced track's composition applies only where the reference block and the active source blocks intersect in time; interval endpoints are included. Outside that intersection, the reference block's own content remains in effect.

When a global track is first initialized from a reference, its base block is copied from that first occurrence. Later references do not create or copy additional global blocks automatically; add or mount those blocks on the global track explicitly. The detail panel shows each track's effective composition at the cursor and identifies the source track for each field.

### Practical ID-composition recipe
1. Give each reusable item a globally unique track ID, and give its base block the same ID.
2. In a host track, add a block whose ID is the reusable item's ID. That block references the item over its own interval.
3. Add overlays to the source track as blocks with different IDs. Their first array positions set sub-track height; higher sub-tracks win conflicts. Different IDs may overlap, but repeated blocks with the same ID may not.
4. The source track is composed locally first. Its result then flows through references, recursively, only across the time intersection. Inspect the detail panel's source labels to see where composed fields came from.

If a referenced ID has no track yet, its first reference creates one and copies that block as the initial base. To add later source intervals or overlays, edit the created source track explicitly; later references do not copy blocks automatically. \`examples/example.json\` demonstrates nested lighting and soft-light composition.

## Numeric axis
The axis is numeric, so its coordinates can represent frames, hours, sequence numbers, or any other numeric scale. \`axis.min\` and \`axis.max\` default to the smallest and largest block coordinates, or to 0 and 10 when there are no blocks. Reversed bounds are swapped, and equal bounds expand by 0.5 on each side.

\`axis.ticks\` may contain numbers or objects such as \`{ "at": 12, "label": "12" }\`. Valid ticks are sorted by coordinate; if none are supplied, readable numeric ticks are generated. The optional \`axis.label\` appears beside the ruler.

Every block needs a finite numeric \`start\`; a non-empty numeric string is also accepted. If \`end\` is omitted, it equals \`start\`. Reversed block endpoints are swapped.

### Date-labeled axes
Dates are not parsed automatically. Convert dates to numbers yourself (for example, UTC epoch days or seconds), use those numbers for \`start\`, \`end\`, \`axis.min\`, and \`axis.max\`, and supply date strings as tick labels. Choose and document a time zone; the page continues to treat coordinates as numbers, so cursor and detail ranges show the numeric values.

## Display and interaction
The page starts in English and follows the operating system's light/dark setting by default. Use the selectors in the header to choose English or Chinese and Auto, Light, or Dark. Language and appearance choices are saved in this browser's local storage for this page origin. Auto follows system color-scheme changes; ledger titles, track names, field names, and values remain exactly as provided.
Click or drag the timeline to move the cursor. The left and right arrow keys move it by the automatically calculated axis step. After a new ledger is loaded, the page resets the cursor to the first block's start, or to the axis minimum if there are no blocks. The page checks the in-memory cache every 700 ms and updates when it changes.

The page server listens on \`127.0.0.1\`, starts at port 7317, and tries up to 20 consecutive ports. Set \`LEDGER_PORT\` to choose another starting port. The latest ledger stays in process memory only and is lost when the server exits.

## \`show\` input
The \`ledger\` argument accepts a ledger object, a path to a JSON file, or JSON text beginning with \`{\`. Relative file paths are resolved from the server process's working directory.
`;

export const HELP_TEXT_ZH = `# 时间台账：格式与行为

## 工具
\`show\` 用于载入台账、替换内存缓存并返回本地页面网址；\`open\` 用于在系统浏览器中打开该页面。本说明是权威格式指南。默认返回英文，传入 \`language: "zh"\` 可获取中文版。

## 轨道、ID 与区块
台账是一个包含非空 \`tracks\` 数组的 JSON 对象。每条轨道代表一个事项或素材，而不是一个分类，并且具有全局唯一的 \`id\`。每个区块也必须有 \`id\`，用于标识提供可复用内容的全局轨道。

\`\`\`json
{
  "title": "光影组合",
  "axis": { "label": "帧", "min": 0, "max": 20 },
  "tracks": [
    {
      "id": "character-a",
      "name": "角色 A",
      "blocks": [
        { "id": "lighting", "start": 2, "end": 12, "title": "光影效果" },
        { "id": "character-a", "start": 0, "end": 20, "姿态": "站立" }
      ]
    },
    {
      "id": "lighting",
      "name": "光影效果",
      "blocks": [
        { "id": "soft-light", "start": 5, "end": 8, "样式": { "漫射": 0.8 } },
        { "id": "lighting", "start": 2, "end": 12, "样式": { "强度": 0.7, "颜色": "#ffffff" } }
      ]
    }
  ]
}
\`\`\`

\`tracks[].id\` 与 \`blocks[].id\` 共用同一全局 ID 空间。区块 ID 与当前轨道 ID 相同时，它表示该轨道的本底素材；否则，它引用对应 ID 的全局轨道。首次引用一个尚无轨道的 ID 时，系统会据此初始化轨道。显式轨道缺少本底区块时，也会由首次外部引用初始化；既没有本底区块也没有外部引用的轨道无效。

轨道内某个区块 ID 在 \`blocks\` 数组中的首次位置决定其子轨道高度。子轨道按该顺序从上到下排列。同一轨道内重复出现的同 ID 区块不能重叠，共用端点也算重叠；不同 ID 的区块可以重叠。轨道数组顺序同样决定页面中轨道从上到下的排列。

轨道的 \`name\` 与 \`color\` 可以省略：缺少名称时使用 ID，缺少颜色时使用默认配色。区块中只有 \`id\`、\`start\`、\`end\` 和 \`title\` 是保留字段，其余键都属于区块内容。

## 组合与引用
光标处的有效区块按子轨道从下到上组合，因此发生冲突时由更靠上的子轨道优先。嵌套对象会递归合并，数组则整体替换。

每条轨道先计算自身的区块层叠结果，再由区块 ID 解析其他轨道的引用。引用会递归展开，循环引用会被拒绝。引用区块与来源轨道当前有效区块的时间交集内（包含端点），来源轨道的组合结果才会生效；交集以外保留引用区块自身的内容。

全局轨道首次由引用初始化时，会从第一次出现的引用复制本底区块。之后的引用不会自动创建或复制更多全局区块；如需增加区块，请在全局轨道上显式添加或挂载。详情区会显示每条轨道在光标处的有效组合结果，并标出各字段的来源轨道。

### ID 组合实践步骤
1. 为每个可复用事项设置全局唯一的轨道 ID，并让它的本底区块使用相同 ID。
2. 在宿主轨道中添加一个 ID 等于可复用事项 ID 的区块；该区块会在自身区间内引用来源事项。
3. 在来源轨道中用不同 ID 添加叠加层。它们在数组中的首次位置决定子轨道高度；更靠上的子轨道优先覆盖冲突字段。不同 ID 可以重叠，同 ID 区块不能重叠。
4. 来源轨道先在本地完成层叠，再递归传播给引用方，且只在时间交集内生效。查看详情区字段旁的来源标记即可追踪组合来源。

若引用的 ID 尚无轨道，第一次引用会创建该轨道，并复制该引用作为初始本底区块。若要增加后续来源区间或叠加层，请显式修改来源轨道；后续引用不会自动复制区块。\`examples/example.json\` 展示了光影与柔光的递归组合。

## 数值轴
坐标轴使用数值，不限定为时间，因此可以表示帧、小时、序号或其他尺度。\`axis.min\` 与 \`axis.max\` 默认取所有区块坐标的最小值和最大值；没有区块时分别使用 0 和 10。若范围颠倒，会自动交换；若两端相等，则向两侧各扩展 0.5。

\`axis.ticks\` 可以包含数字，也可以包含形如 \`{ "at": 12, "label": "12" }\` 的对象。有效刻度会按坐标排序；若未提供有效刻度，系统会自动生成易读的数字刻度。可选字段 \`axis.label\` 会显示在标尺旁。

每个区块都必须提供有限数值 \`start\`；非空且可转换为数值的字符串也可以使用。省略 \`end\` 时，终点等于起点；若区间端点颠倒，系统会自动交换。

### 日期刻度
系统不会自动解析日期。请先把日期转换为数值（例如 UTC Unix 天数或秒数），将数值用于 \`start\`、\`end\`、\`axis.min\` 和 \`axis.max\`，再用日期字符串设置刻度标签。请明确使用的时区；页面仍把坐标当作数值处理，因此光标和详情区间会显示数值。

## 显示与交互
页面默认使用英文，外观默认跟随操作系统的浅色/深色设置。可在标题栏选择 English/中文以及 Auto、Light、Dark。语言和外观选择会保存在此页面 origin 对应的浏览器 localStorage 中。Auto 会跟随系统配色变化；台账标题、轨道名称、字段名和值保持原样，不会被自动翻译。
点击或拖动时间线可移动光标；左右方向键按自动计算的坐标轴步长移动。载入新台账后，光标会重置到第一条区块的起点；若没有区块，则重置到坐标轴最小值。页面每 700 毫秒检查一次内存缓存，并在缓存变化后更新。

页面服务监听 \`127.0.0.1\)，默认从端口 7317 开始，最多连续尝试 20 个端口。设置 \`LEDGER_PORT\` 可更改起始端口。最新台账只保存在进程内存中；服务退出后缓存即丢失。

## \`show\` 参数
\`ledger\` 参数可以是台账对象、JSON 文件路径，或以 \`{\` 开头的 JSON 文本。相对文件路径以服务进程的工作目录为基准。
`;
