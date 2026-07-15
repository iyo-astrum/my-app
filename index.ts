import "dotenv/config";
import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import pg from "pg";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer"; // 画像受け取り用

const { Pool } = pg;

// --- 1. 接続と AI の設定 ---
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

// Gemini AI の初期化
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
// 画像を一時的にメモリに置くための設定
const upload = multer({ storage: multer.memoryStorage() });

// --- 2. アプリの設定 ---
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 3. ルート（処理） ---

// メイン画面（一覧と残高の表示）
app.get("/", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({ orderBy: { date: "desc" } });
    let categories = await prisma.category.findMany();
    
    // カテゴリがなければ初期値を入れる
    if (categories.length === 0) {
      await prisma.category.createMany({ data: [{ name: "食費" }, { name: "交通費" }, { name: "給与" }, { name: "娯楽" }, { name: "その他" }] });
      categories = await prisma.category.findMany();
    }

    const balance = transactions.reduce((sum, t) => {
      return t.type === "income" ? sum + t.amount : sum - t.amount;
    }, 0);

    res.render("index", { transactions, balance, categories });
  } catch (error) {
    console.error(error);
    res.status(500).send("エラーが発生しました。");
  }
});

// 取引の詳細を表示するルート
app.get("/transactions/:id", async (req, res) => {
  const id = parseInt(req.params.id); // URLの末尾の数字を取得

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: id }
    });

    if (!transaction) {
      return res.status(404).send("そのデータは見つかりませんでした。");
    }

    // detail.ejs にデータを渡して表示
    res.render("detail", { transaction });
  } catch (error) {
    console.error(error);
    res.status(500).send("エラーが発生しました。");
  }
});

// ★新機能：画像（レシート）解析★
app.post("/ai-parse-image", upload.single("receipt"), async (req, res) => {
  if (!req.file) return res.status(400).send("画像がありません。");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // 画像を AI が読める形式に変換
  const imagePart = {
    inlineData: {
      data: req.file.buffer.toString("base64"),
      mimeType: req.file.mimetype
    }
  };

  const prompt = `
    このレシート画像から収支情報を抽出し、必ず以下のJSON形式のみで返してください。
    項目：amount (数値), type ("income" または "expense"), category (既存のカテゴリから推測), date (YYYY-MM-DD), memo (詳細)
  `;

  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const jsonStr = response.text().replace(/```json|```/g, "");
    const data = JSON.parse(jsonStr);

    await prisma.transaction.create({
      data: {
        type: data.type,
        date: new Date(data.date),
        amount: data.amount,
        category: data.category,
        memo: data.memo
      }
    });
    res.redirect("/");
  } catch (error) {
    console.error("画像解析エラー:", error);
    res.status(500).send("AIが画像を読み取れませんでした。APIキー（AIza...）が正しいか確認しておくれ。");
  }
});

// 手動の収支追加
app.post("/transactions", async (req, res) => {
  const { type, date, amount, category, memo } = req.body;
  await prisma.transaction.create({
    data: { type, date: new Date(date), amount: parseInt(amount), category, memo },
  });
  res.redirect("/");
});

// カテゴリの追加
app.post("/categories", async (req, res) => {
  const { name } = req.body;
  if (name) await prisma.category.create({ data: { name } });
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
