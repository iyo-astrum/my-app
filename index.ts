import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const app = express();
const PORT = process.env.PORT || 8888;

// PostgreSQL に接続するための準備
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));

app.get("/", async (req, res) => {
  try {
    // データベースからユーザー一覧を取ってくる
    const users = await prisma.user.findMany();
    res.render("index", { users });
  } catch (e) {
    // まだ DB がつながっていない時は、空の一覧を表示する
    console.log("DB接続待ち...");
    res.render("index", { users: [] });
  }
});

app.post("/users", async (req, res) => {
  const name = req.body.name;
  if (name && connectionString) {
    try {
      await prisma.user.create({ data: { name } });
    } catch (e) {
      console.error("追加失敗:", e);
    }
  }
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
