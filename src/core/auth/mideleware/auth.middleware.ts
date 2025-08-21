// src/core/auth/middlewares/auth.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Authorization header is required',
        error: authHeader
      });
    }

    const [bearer, token] = authHeader.split(' ');
    
    if (bearer !== 'Bearer' || !token) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid authorization format. Expected: Bearer <token>',
        error: 'Unauthorized'
      });
    }

    // req.token = token; // Stocke le token pour les gardes suivants
    next();
  }
}