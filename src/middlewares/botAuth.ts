import { Request, Response, NextFunction } from 'express';

export function checkToken(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers['Authorization'] as string;
  const token = authorization && authorization.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }
  if (token !== process.env.BOT_TOKEN) {
    return res.status(401).json({ message: 'Token not authorized' });
  }
}
