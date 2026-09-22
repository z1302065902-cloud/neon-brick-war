# 后端配置指南（Supabase + Vercel + 爱发电）· 实操版

> 本文档是「从零到上线」第 2–4 步的**详细实操版**，记录了真实配置过程中的每一步和踩过的坑。
> 跟着做即可，无需再摸索。前置：第 1 步爱发电方案已建好（见 README.md）。

---

## 需要先准备好的信息

| 项 | 哪里拿 | 例子 |
|---|---|---|
| `AFDIAN_USER_ID` | 爱发电开发者后台顶部 | `20765df8947211f1b18f52540025c377` |
| `AFDIAN_TOKEN` | 爱发电开发者后台「生成」 | `r4N7...`（切勿泄露/入库） |
| `AFDIAN_PLAN_ID` | 见下方「获取 plan_id」 | `dfc3acfa...` |

---

## 获取 plan_id（爱发电后台）

网页后台的「赞助方案」页面上不直接显示 plan_id，用以下任一方式拿：

**方式 A：调创作者 API（推荐，快）**

在已登录爱发电的浏览器 Console 里执行：

```js
fetch('https://afdian.com/api/creator/all-plans?post_only=&sale_only=&status=', { credentials: 'include' })
  .then(r => r.json())
  .then(j => j.data.list.map(p => ({ plan_id: p.plan_id, name: p.name, price: p.price, status: p.status })))
  .then(console.log)
```

输出里找到你的方案，复制 `plan_id`。

**方式 B：开发者 API（query-plan）**

POST `https://afdian.com/api/open/query-plan`，body：
```json
{ "user_id": "...", "params": "{}", "ts": "1690000000", "sign": "md5(token+params+ts+user_id)" }
```
注意 params 必须是 **JSON 字符串** `"{}"`，签名顺序是 `token + "params" + params + "ts" + ts + "user_id" + userId`。

---

## 建 Supabase 库

1. https://supabase.com → Organizations → 你的组织 → **New project**
2. 填：项目名（如 `tower-defense`）、数据库密码（强密码，记好）、区域 **Asia-Pacific**
3. 创建后等 ~30 秒就绪
4. SQL Editor → New query → 粘贴 `db/schema.sql` → Run
   - 若弹 "Row Level Security" 提示，选 **Run without RLS**（后端用 service_role 连接，不走 anon key）
   - 应显示 Success
5. 拿连接串（Transaction pooler）：
   - 项目页顶部点 **Connect** → 选 **Transaction**（pooler）标签
   - 复制 `postgresql://postgres.<ref>:[YOUR-PASSWORD]@<host>.pooler.supabase.com:6543/postgres`
   - **密码含特殊字符（如 `!`）要百分号编码**（`!` → `%21`）
   - 注意 host 的区域后缀可能是 `ap-southeast-2` 等，以页面显示为准

**验证连接**（可选，用 node + pg）：
```js
import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log((await c.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',['public'])).rows)
```

---

## 部署 Vercel 后端

### 准备

`api/*.ts` 用到 `@vercel/node` 和 `pg`，**必须加进 package.json 的 dependencies**：

```json
"dependencies": {
  "@vercel/node": "^3.2.0",
  "pg": "^8.13.0",
  "three": "^0.172.0"
}
```

⚠️ **改了 package.json 后必须同步 package-lock.json**（跑 `npm install`），否则 GitHub Actions 的 `npm ci` 会失败（报 package.json 与 lockfile 不一致 → build 被 skip → 部署失败）。这是最容易踩的坑。

### 用 Vercel CLI 部署

**本地安装 vercel CLI**（别用 npx，npx 临时缓存易冲突）：

```bash
npm install --save-dev vercel
# 之后用 ./node_modules/.bin/vercel
```

**创建 Access Token**：
- https://vercel.com/account/settings/tokens → Create → 名字、scope 选账号、过期选 1 Day → 复制 token（只显示一次）

**部署**：
```bash
export VERCEL_TOKEN='vcp_...'
./node_modules/.bin/vercel deploy --prod --yes --token "$VERCEL_TOKEN" --name <game-name>
```
- `.vercelignore` 已排除大文件（游戏资源），Vercel 只上传 api/ + 静态
- 成功会输出 Production 和 Aliased 两个域名，用 **Aliased** 那个（稳定）：
  `https://<game-name>-orcin-seven.vercel.app`

### 注入 env

⚠️ **env 注入后必须重新部署才生效**（很关键，否则线上还是旧配置）：

```bash
# 每个 env 单独加，值从文件读入（用 heredoc 避免 shell 解释特殊字符）
cat > /tmp/v.txt <<'EOF'
20765df8947211f1b18f52540025c377
EOF
./node_modules/.bin/vercel env add AFDIAN_USER_ID production --token "$VERCEL_TOKEN" < /tmp/v.txt
# 依次加：AFDIAN_TOKEN、AFDIAN_PLAN_ID、DATABASE_URL

# 全部加完后重新部署
./node_modules/.bin/vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

⚠️ **不要用 `printf` 传值**——连接串里的 `%` 会被 printf 当格式符解释，导致值膨胀超长报错。

### 验证后端

```bash
# CORS 预检
curl -s -X OPTIONS "https://<域名>/api/afdian-verify" -i | grep -i access-control
# 假订单（走爱发电 API 兜底）
curl -s "https://<域名>/api/afdian-verify?order=99999999999999"
# → {"ok":false,"em":"order not paid"}
# 已付款订单（先往库插一条，见下）
curl -s "https://<域名>/api/afdian-verify?order=<真实订单号>"
# → {"ok":true}
```

---

## 前端接入

1. `src/afdian-redeem.ts` 已封装，复制到游戏项目，游戏里放 `redeem-input` / `redeem-btn` / `redeem-msg` 三个元素
2. **订单号必须是纯数字**（游戏正则 `^\d{14,}$`）——真实爱发电订单号本来就是纯数字，没问题；测试时别用含字母的号
3. `.github/workflows/deploy.yml` 里把 `VITE_AFDIAN_VERIFY_URL` 改成你的 Aliased 域名：
   ```
   VITE_AFDIAN_VERIFY_URL: https://<game-name>-orcin-seven.vercel.app/api/afdian-verify
   ```
4. push 后 GitHub Actions 构建，**bundle 会内联这个 URL**（用浏览器无缓存刷新确认：`index.html` 引用的 bundle 里能搜到该 URL）

---

## 端到端验证（完整模拟玩家）

**往库插一条已付款订单**（模拟玩家真实付款后的状态）：

```bash
cat > seed.mjs <<'EOF'
import pg from 'pg'
const url = process.env.DATABASE_URL
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(`INSERT INTO afdian_orders (out_trade_no, buyer_user_id, plan_id, amount, status)
  VALUES ('20260811123456789012','test','<PLAN_ID>','7.00',2)
  ON CONFLICT (out_trade_no) DO UPDATE SET status=2`)
await c.end()
EOF
DATABASE_URL='...' node seed.mjs
```

**线上游戏兑换**：
- 打开游戏 → 输入订单号 `20260811123456789012` → 兑换
- 期望：**「✓ 解锁成功！」**，完整版内容全开
- 若显示「订单未找到或未付款」→ 说明后端没查到（检查 env 是否部署生效 / 订单号是否纯数字）

**验证后删掉测试数据**，保持库里干净。

---

## 踩坑速查

| 现象 | 原因 | 解决 |
|---|---|---|
| GitHub Actions build 被 skip / 失败 | package.json 改了但 package-lock.json 没同步 | 跑 `npm install` 后一起提交 |
| verify 返回 ok:false 但库里有已付款订单 | env 注入后没重新部署 | 重新 `vercel deploy --prod` |
| `vercel env add` 报值超长 | 用 printf 传值，`%` 被解释 | 用 heredoc 文件输入 |
| npm ci 失败 | lockfile 与 package.json 不一致 | 同上第一条 |
| 游戏输订单号显示"激活码无效" | 订单号含字母，被当成激活码 | 用纯数字订单号 |
| 爱发电后台「保存」没生效 | 页面有多个「保存」按钮，点错 | 点方案卡片自己的保存（用 JS 定位卡片内那个） |

---

## 本模板包含

```
api/afdian-verify.ts    订单自助解锁验证端点（查库 + 爱发电 API 兜底）
api/afdian-webhook.ts   爱发电 webhook 履约层（可选）
db/schema.sql           afdian_orders 表
.github/workflows/deploy.yml  GitHub Pages 自动部署（注入 VITE_AFDIAN_VERIFY_URL）
src/afdian-redeem.ts    前端兑换逻辑（订单号/激活码）
.env.example            环境变量样例
.vercelignore           排除大文件（Vercel 只部署 api/）
```
