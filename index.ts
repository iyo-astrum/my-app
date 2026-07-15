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

// app.get("/") の中身を少し書き換える
app.get("/", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: "desc" },
    });

    // データベースからカテゴリ一覧を取得する
    let categories = await prisma.category.findMany();

    // もしカテゴリが一つもなければ、初期値をいくつか入れておく（親切設計じゃ）
    if (categories.length === 0) {
      await prisma.category.createMany({
        data: [
          { name: "食費" }, { name: "交通費" }, { name: "給与" }
        ]
      });
      categories = await prisma.category.findMany();
    }

    const balance = transactions.reduce((sum, t) => {
      return t.type === "income" ? sum + t.amount : sum - t.amount;
    }, 0);

    res.render("index", { transactions, balance, categories });
  } catch (error) {
    console.error(error);
    res.status(500).send("エラー");
  }
});

// カテゴリを追加するためのルートも作っておこう
app.post("/categories", async (req, res) => {
  const { name } = req.body;
  if (name) {
    await prisma.category.create({ data: { name } });
  }
  res.redirect("/");
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
