import "dotenv/config";
import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import pg from "pg";
const { Pool } = pg;

// PostgreSQL に接続するための設定（ssl 設定を追加）
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));

// メイン画面：収支一覧と残高の表示
app.get("/", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: "desc" },
    });

    const balance = transactions.reduce((sum, t) => {
      return t.type === "income" ? sum + t.amount : sum - t.amount;
    }, 0);

    res.render("index", { transactions, balance });
  } catch (error) {
    console.error("データ取得エラー:", error);
    res.status(500).send("エラーが発生しました。");
  }
});

// 収支データの追加
app.post("/transactions", async (req, res) => {
  const { type, date, amount, category, memo } = req.body;
  
  if (type && date && amount) {
    await prisma.transaction.create({
      data: {
        type,
        date: new Date(date),
        amount: parseInt(amount),
        category,
        memo,
      },
    });
  }
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
