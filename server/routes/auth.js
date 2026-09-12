import { Router } from 'express';
import { createUser, signToken, verifyUser, requireAuth } from '../auth.js';
import { publicUser, refillWater } from '../player.js';

export const router = Router();

router.post('/register', (req, res, next) => {
  try {
    const user = createUser(req.body?.name, req.body?.password);
    res.status(201).json({ token: signToken(user), me: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const user = verifyUser(req.body?.name, req.body?.password);
    res.json({ token: signToken(user), me: publicUser(refillWater(user)) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ me: publicUser(refillWater(req.user)) });
});
