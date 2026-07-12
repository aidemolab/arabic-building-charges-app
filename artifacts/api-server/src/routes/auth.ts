import { Router } from "express";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// Login/logout are handled client-side by Supabase Auth.
// This endpoint resolves the current user from the Supabase bearer token.
router.get("/auth/me", requireAuth, (req, res) => {
  const user = req.authUser!;
  res.json({ id: user.id, username: user.email, role: user.role });
});

export default router;
