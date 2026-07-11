import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    (req.session as any).userId = user.id;
    (req.session as any).username = user.username;
    (req.session as any).role = user.role;
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    logger.error(err, "Login error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res) => {
  const sess = req.session as any;
  if (!sess.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ id: sess.userId, username: sess.username, role: sess.role });
});

export default router;
