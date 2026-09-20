# Neon Brick War

霓虹积木第三人称战争闯关（浏览器 / itch HTML5）。

原创积木风格，不含任何官方 LEGO 商标、人仔资产或 logo。

## Play

```bash
cd neon-brick-war
npm install
npm run dev
```

http://127.0.0.1:5188/ — 点击画布锁定鼠标。

| 键 | 作用 |
|----|------|
| WASD | 移动 |
| 鼠标 | 转向 |
| LMB / Space / J | 开火（轨道枪按住蓄力） |
| 1–6 / Q E / 滚轮 | 切枪 |
| R | 重生 / 重开 |
| B | 打开 itch 购买页（免费版） |
| F3 | 碰撞体线框（调试，`?debug` 可直接开启） |
| M | 静音 |

## 构建

```bash
npm run build:demo   # 免费版 → dist-demo/（仅地图 1，结尾引导购买）
npm run build:full   # 完整版 → dist-full/（全战役）
npm run build        # 同 demo，输出 dist/
```

**商业化模型**：itch.io 没有客户端购买态检测 API，所以不做可被一行 localStorage 改掉的假门闸，而是**构建期双 build 拆分** —— 免费版只含地图 1，完整版由 itch 的下载密钥机制只发给购买者。本地预览用 `?unlock=all`（不在任何 UI 中暴露）。

发版前把 `VITE_PURCHASE_URL` 设成正式的 itch 页面地址。

## 已实现

- **3 个各不相同的 Boss**（设计稿 §9 完整落地）：装甲装卸机（履带底盘、正面免伤、蓄力冲锋）/ 无人机母舰（悬浮、远程射击、召唤僚机）/ 核心守卫（弱点周期性开窗、径向脉冲）。都有弱点部位、狂暴阶段新招式、分段爆炸高潮、掉落 Neon Shard
- **6 把枪**：脉冲手枪 / 散射冲锋 / 轨道步枪（蓄力穿盾）/ 榴弹发射器 / 电弧枪（链式）/ 等离子炮。各有独立数值、**曳光颜色**与**合成音色**
- **9 种道具**：医疗、护盾、急速、弹药、EMP、诱饵、扫描、双倍伤、Neon Shard
- **3 张地图**，每图 3 个据点 A→B→C
- **Rapier 胶囊碰撞**：精确 AABB 穿透推出、角色可站上高处、尸体冻结不阻挡
- **画布内游戏 HUD**：无任何 DOM 覆盖层；分段血条、护盾条、动态武器槽位、蓄力条、Boss 血条（含狂暴阈值刻度）、命中反馈、受击红边、准星后坐
- **全合成音频**：零音频资源。6 把枪独立音色 + 破盾音 + Boss 登场 / 狂暴 sting + 三首按图切换的 BGM（Web Audio lookahead 步进音序器）
- **泛光后处理** + 阴影 + 地面网格
- **付费门闸** + 双 build 拆分
- **响应式 HUD**：布局全部由视口推导，窄屏面板纵向堆叠、文本逐级降号、横幅自动避让。已在桌面 / 平板 / 手机横屏 / 手机竖屏四种视口各跑 50 局自动化对局验证（200 局零崩溃、零卡死、零掉帧）

## 未实现（设计稿有要求）

对照 `docs/superpowers/specs/2026-09-18-neon-brick-war-design.md`：

- **§6 三张图仍是同一套模板换色**，无多层结构（吊车甲板 / 天桥 / 冷却厅目前只是名字）
- **角色无动画**：积木人刚性滑行，无摆臂、无步态
- **无暂停**：Esc 解锁指针后敌人静止但玩家仍能移动射击
- **只有 M 键全局静音**，没有音量设置 UI
- **轨道步枪的 `pierce` 参数名义上要贯穿多目标，实际只取最近一个**

完整的逐条验收状态、验证方式与实测数据见 `docs/superpowers/specs/2026-09-19-neon-brick-war-acceptance.md`。

## Docs

- `docs/superpowers/specs/2026-09-18-neon-brick-war-design.md` — 设计稿
- `docs/superpowers/specs/2026-09-19-neon-brick-war-acceptance.md` — 验收清单（含实测证据）
- `docs/superpowers/plans/2026-09-18-neon-brick-war-phase0.md` — Phase 0 实施计划
