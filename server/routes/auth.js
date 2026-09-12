import { Router } from 'express';
import { createUser, signToken, verifyUser, requireAuth } from '../auth.js';
import { publicUser, refillWater } from '../player.js';

export const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const user = await createUser(req.body?.name, req.body?.password);
    res.status(201).json({ token: signToken(user), me: await publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await verifyUser(req.body?.name, req.body?.password);
    res.json({ token: signToken(user), me: await publicUser(await refillWater(user)) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ me: await publicUser(await refillWater(req.user)) });
  } catch (err) {
    next(err);
  }
});
