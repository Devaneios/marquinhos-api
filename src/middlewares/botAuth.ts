import { Request, Response, NextFunction } from 'express';

export function checkToken(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers['authorization'] as string;
  const token = authorization && authorization.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }
  if (token !== process.env.MARQUINHOS_API_KEY) {
    return res.status(401).json({ message: 'Token not authorized' });
  }
  next();
}
